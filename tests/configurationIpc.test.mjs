import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { buildRouteMap, handleAppRequest, init } = require('../src/backend/ipcHandlers.js');

const ACTIONS = {
  'configuration.snapshot': ['getSnapshot', 'configuracoes.ver', false],
  'configuration.updateSection': ['updateSection', 'configuracoes.editar', true],
  'configuration.importLegacy': ['importLegacySettings', 'configuracoes.editar', true],
  'configuration.document.reserveNumber': ['reserveNextDocumentNumber', 'vendas.criar', true],
  'configuration.catalog.create': ['createCatalogOption', 'configuracoes.editar', true],
  'configuration.catalog.update': ['updateCatalogOption', 'configuracoes.editar', true],
  'configuration.catalog.reorder': ['reorderCatalogOptions', 'configuracoes.editar', true],
  'configuration.catalog.activate': ['activateCatalogOption', 'configuracoes.editar', true],
  'configuration.catalog.deactivate': ['deactivateCatalogOption', 'configuracoes.editar', true],
};

function dependencies(calls, session = { user: { id: 42 } }) {
  const configurationService = {};
  for (const [method] of Object.values(ACTIONS)) {
    configurationService[method] = async (...args) => {
      calls.push(['service', method, ...args]);
      return { method, args };
    };
  }
  return {
    authService: { getCurrentSession: async () => session },
    assertPermission: async (actorUserId, permission) => {
      calls.push(['permission', actorUserId, permission]);
    },
    configurationService,
  };
}

test('configuration routes expose the complete public action set', () => {
  const routes = buildRouteMap(dependencies([]));
  for (const action of Object.keys(ACTIONS)) {
    assert.equal(typeof routes[action], 'function', `${action} should be registered`);
  }
});

test('configuration routes enforce exact permissions and forward payloads with authenticated actor', async () => {
  for (const [action, [method, permission, injectActor]] of Object.entries(ACTIONS)) {
    const calls = [];
    const routes = buildRouteMap(dependencies(calls));
    const payload = { marker: action, actorUserId: 999 };
    const result = await routes[action](payload);

    assert.deepEqual(calls[0], ['permission', 42, permission], action);
    assert.equal(calls[1][0], 'service');
    assert.equal(calls[1][1], method);
    if (action === 'configuration.snapshot') {
      assert.deepEqual(calls[1], ['service', method]);
      assert.deepEqual(result.args, []);
    } else {
      assert.deepEqual(calls[1], [
        'service',
        method,
        injectActor ? { marker: action, actorUserId: 42 } : payload,
      ]);
    }
  }
});

test('configuration routes reject missing sessions before permission or service access', async () => {
  const calls = [];
  const routes = buildRouteMap(dependencies(calls, null));

  const result = await handleAppRequest(routes, { action: 'configuration.snapshot' });

  assert.deepEqual(result, {
    ok: false,
    error: { message: 'Sessao expirada.', code: 'SESSION_EXPIRED' },
  });
  assert.deepEqual(calls, []);
});

test('configuration routes return safe permission errors without calling the service', async () => {
  const calls = [];
  const deps = dependencies(calls);
  deps.assertPermission = async () => {
    const error = new Error('Permissao insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  };
  const routes = buildRouteMap(deps);

  const result = await handleAppRequest(routes, {
    action: 'configuration.updateSection',
    data: { values: {} },
  });

  assert.deepEqual(result, {
    ok: false,
    error: { message: 'Permissao insuficiente.', code: 'PERMISSION_DENIED' },
  });
  assert.equal(calls.some((call) => call[0] === 'service'), false);
});

test('configuration coded failures use canonical Portuguese messages and never leak internals', async () => {
  const expected = {
    CONFIGURATION_VALIDATION: 'Dados de configuracao invalidos.',
    CONFIGURATION_CONFLICT: 'A configuracao foi alterada por outra sessao.',
    CONFIGURATION_NOT_FOUND: 'Configuracao nao encontrada.',
    CONFIGURATION_CORRUPT_DATA: 'Os dados de configuracao estao invalidos.',
    CONFIGURATION_PROTECTED: 'Esta configuracao e protegida.',
    CONFIGURATION_IN_USE: 'Esta configuracao esta em uso.',
    CONFIGURATION_INVARIANT: 'A alteracao viola uma regra de configuracao.',
  };

  for (const [code, message] of Object.entries(expected)) {
    const result = await handleAppRequest({
      fail: async () => {
        const error = new Error('SQLITE_CONSTRAINT: C:\\Users\\secret\\database.sqlite');
        error.code = code;
        throw error;
      },
    }, { action: 'fail' });
    assert.deepEqual(result, { ok: false, error: { message, code } });
  }
});

test('unknown CONFIGURATION_* codes retain the generic safe fallback', async () => {
  const result = await handleAppRequest({
    fail: async () => {
      const error = new Error('private database detail');
      error.code = 'CONFIGURATION_FUTURE_ERROR';
      throw error;
    },
  }, { action: 'fail' });

  assert.deepEqual(result, {
    ok: false,
    error: { message: 'Erro ao processar requisicao.', code: 'CONFIGURATION_FUTURE_ERROR' },
  });
});

test('init seeds defaults before registering routes and seeds exactly once', async () => {
  let appHandler;
  const calls = [];
  const db = { name: 'db' };
  const models = { db, Categoria: {}, Subcategoria: {}, Produto: {}, ConfiguracaoSistema: {} };
  const createdService = dependencies(calls).configurationService;
  let releaseSeed;
  createdService.seedDefaults = async () => {
    calls.push(['seedDefaults']);
    await new Promise((resolve) => { releaseSeed = resolve; });
  };
  const ipcMain = {
    removeHandler() { calls.push(['removeHandler']); },
    handle(_channel, handler) { calls.push(['handle']); appHandler = handler; },
    removeAllListeners() { calls.push(['removeAllListeners']); },
    on() { calls.push(['on']); },
  };

  const initialization = init(models, {
    ipcMain,
    authService: { getCurrentSession: async () => ({ user: { id: 42 } }) },
    assertPermission: async () => undefined,
    createConfigurationService: (args) => {
      assert.equal(args.db, db);
      assert.equal(args.models, models);
      return createdService;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [['seedDefaults']]);
  assert.equal(appHandler, undefined);
  releaseSeed();
  await initialization;

  const response = await appHandler(null, { action: 'configuration.snapshot' });
  assert.equal(response.ok, true);
  assert.deepEqual(calls, [
    ['seedDefaults'],
    ['removeHandler'],
    ['handle'],
    ['removeAllListeners'],
    ['on'],
    ['service', 'getSnapshot'],
  ]);
});

test('init does not expose IPC routes when seeding fails', async () => {
  const calls = [];
  const failure = new Error('seed failed');
  const ipcMain = {
    removeHandler() { calls.push('removeHandler'); },
    handle() { calls.push('handle'); },
    removeAllListeners() { calls.push('removeAllListeners'); },
    on() { calls.push('on'); },
  };

  await assert.rejects(init({ db: {}, Categoria: {}, Subcategoria: {}, Produto: {} }, {
    ipcMain,
    configurationService: { seedDefaults: async () => { throw failure; } },
  }), failure);
  assert.deepEqual(calls, []);
});

test('application startup awaits configuration initialization before creating a window', () => {
  const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const initIndex = source.indexOf('await ipcHandlers.init({ db, ...models });');
  const windowIndex = source.indexOf('createWindow();', initIndex);

  assert.notEqual(initIndex, -1);
  assert.ok(windowIndex > initIndex);
  assert.match(source.slice(initIndex, windowIndex + 'createWindow();'.length), /await ipcHandlers\.init[\s\S]*createWindow\(\);/);
  assert.match(source, /catch \(error\)[\s\S]*app\.quit\(\);/);
});
