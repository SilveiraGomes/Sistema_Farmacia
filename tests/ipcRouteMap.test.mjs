import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildRouteMap,
  handleAppRequest,
  init,
  registerLegacyRoutes,
} = require('../src/backend/ipcHandlers.js');

test('buildRouteMap exposes auth, user, and profile IPC actions', () => {
  const routes = buildRouteMap();

  const expectedActions = [
    'auth.login',
    'auth.loginUsers',
    'auth.logout',
    'auth.currentSession',
    'auth.changeOwnPassword',
    'users.list',
    'users.create',
    'users.update',
    'users.activate',
    'users.deactivate',
    'users.resetPassword',
    'profiles.list',
    'profiles.summaries',
    'profiles.permissions',
    'profiles.updatePermissions',
  ];

  for (const action of expectedActions) {
    assert.equal(typeof routes[action], 'function', `${action} should be registered`);
  }
});

function createRouteDependencies(calls = []) {
  return {
    authService: {
      getCurrentSession: async () => ({ user: { id: 42 } }),
      login: async (data) => ({ login: data }),
      logout: async () => undefined,
      changeOwnPassword: async (data) => ({ changed: data }),
    },
    assertPermission: async (userId, permissionKey) => {
      calls.push(['assertPermission', userId, permissionKey]);
    },
    userService: {
      listUsers: async () => [],
      createUser: async (payload) => {
        calls.push(['createUser', payload]);
        return payload;
      },
      updateUser: async (payload) => {
        calls.push(['updateUser', payload]);
        return payload;
      },
      activateUser: async (payload) => {
        calls.push(['activateUser', payload]);
        return payload;
      },
      deactivateUser: async (payload) => {
        calls.push(['deactivateUser', payload]);
        return payload;
      },
      resetUserPassword: async (payload) => {
        calls.push(['resetUserPassword', payload]);
        return payload;
      },
      listLoginUsers: async () => {
        calls.push(['listLoginUsers']);
        return [{ id: 1, nome_usuario: 'admin', nome_completo: 'Administrador' }];
      },
    },
    profileService: {
      listProfiles: async () => [
        { id: 1, nome: 'Administrador', descricao: 'Acesso total', sistema: true, ativo: true, permissoes: ['usuarios.ver'] },
      ],
      listPermissions: async () => [],
      updateProfilePermissions: async (payload) => {
        calls.push(['updateProfilePermissions', payload]);
        return payload;
      },
    },
  };
}

test('user routes accept id payloads without passing ids as mutable user fields', async () => {
  const calls = [];
  const routes = buildRouteMap(createRouteDependencies(calls));

  await routes['users.update']({
    id: 7,
    nome_completo: 'Maria',
    cargo: 'Caixa',
  });
  await routes['users.activate']({ id: 8 });
  await routes['users.deactivate']({ userId: 9 });
  await routes['users.resetPassword']({ id: 10 });

  assert.deepEqual(calls, [
    ['assertPermission', 42, 'usuarios.editar'],
    ['updateUser', { actorUserId: 42, userId: 7, data: { nome_completo: 'Maria', cargo: 'Caixa' } }],
    ['assertPermission', 42, 'usuarios.editar'],
    ['activateUser', { actorUserId: 42, userId: 8 }],
    ['assertPermission', 42, 'usuarios.inativar'],
    ['deactivateUser', { actorUserId: 42, userId: 9 }],
    ['assertPermission', 42, 'usuarios.resetar_senha'],
    ['resetUserPassword', { actorUserId: 42, userId: 10 }],
  ]);
});

test('auth.loginUsers returns login choices without requiring a session permission', async () => {
  const calls = [];
  const routes = buildRouteMap(createRouteDependencies(calls));

  const result = await routes['auth.loginUsers']();

  assert.deepEqual(result, [{ id: 1, nome_usuario: 'admin', nome_completo: 'Administrador' }]);
  assert.deepEqual(calls, [['listLoginUsers']]);
});

test('profile routes split user-form summaries from permission-bearing administration', async () => {
  const calls = [];
  const routes = buildRouteMap(createRouteDependencies(calls));

  const summaries = await routes['profiles.summaries']();
  const fullProfiles = await routes['profiles.list']();

  assert.deepEqual(calls, [
    ['assertPermission', 42, 'usuarios.ver'],
    ['assertPermission', 42, 'usuarios.gerir_permissoes'],
  ]);
  assert.deepEqual(summaries, [
    { id: 1, nome: 'Administrador', descricao: 'Acesso total', sistema: true, ativo: true },
  ]);
  assert.deepEqual(fullProfiles, [
    { id: 1, nome: 'Administrador', descricao: 'Acesso total', sistema: true, ativo: true, permissoes: ['usuarios.ver'] },
  ]);
});

test('permissioned IPC routes reject sessions that must change password', async () => {
  const calls = [];
  const dependencies = createRouteDependencies(calls);
  dependencies.authService.getCurrentSession = async () => ({
    user: { id: 42, deve_trocar_senha: true },
    mustChangePassword: true,
  });
  const routes = buildRouteMap(dependencies);

  const result = await handleAppRequest(routes, { action: 'users.list' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Troca de senha obrigatoria.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    },
  });
  assert.deepEqual(calls, []);
});

test('legacy toMain routes require inventory permissions before model actions', async () => {
  const calls = [];
  let legacyHandler;
  const fakeIpcMain = {
    removeAllListeners(channel) {
      calls.push(['removeAllListeners', channel]);
    },
    on(channel, handler) {
      calls.push(['on', channel, typeof handler]);
      legacyHandler = handler;
    },
  };
  const models = {
    Categoria: {
      findAll: async (options) => {
        calls.push(['Categoria.findAll', options]);
        return ['categories'];
      },
      create: async (data) => {
        calls.push(['Categoria.create', data]);
        return { category: data };
      },
    },
    Subcategoria: {
      create: async (data) => {
        calls.push(['Subcategoria.create', data]);
        return { subcategory: data };
      },
    },
    Produto: {
      findAll: async () => {
        calls.push(['Produto.findAll']);
        return ['products'];
      },
      create: async (data) => {
        calls.push(['Produto.create', data]);
        return { product: data };
      },
    },
  };
  const event = {
    reply(channel, payload) {
      calls.push(['reply', channel, payload]);
    },
  };

  registerLegacyRoutes(fakeIpcMain, models, {
    authService: {
      getCurrentSession: async () => ({
        user: { id: 42, deve_trocar_senha: false },
        mustChangePassword: false,
      }),
    },
    assertPermission: async (userId, permissionKey) => {
      calls.push(['assertPermission', userId, permissionKey]);
    },
  });

  await legacyHandler(event, { action: 'getProducts' });
  await legacyHandler(event, { action: 'addProduct', data: { nome: 'Produto' } });
  await legacyHandler(event, { action: 'getCategories' });
  await legacyHandler(event, { action: 'addCategory', data: { nome: 'Categoria' } });
  await legacyHandler(event, { action: 'addSubcategory', data: { nome: 'Subcategoria' } });

  assert.deepEqual(calls, [
    ['removeAllListeners', 'toMain'],
    ['on', 'toMain', 'function'],
    ['assertPermission', 42, 'estoque.ver'],
    ['Produto.findAll'],
    ['reply', 'fromMain', { action: 'getProductsResponse', data: ['products'] }],
    ['assertPermission', 42, 'estoque.criar'],
    ['Produto.create', { nome: 'Produto' }],
    ['reply', 'fromMain', { action: 'addProductResponse', data: { product: { nome: 'Produto' } } }],
    ['assertPermission', 42, 'estoque.ver'],
    ['Categoria.findAll', { include: [models.Subcategoria] }],
    ['reply', 'fromMain', { action: 'getCategoriesResponse', data: ['categories'] }],
    ['assertPermission', 42, 'estoque.criar'],
    ['Categoria.create', { nome: 'Categoria' }],
    ['reply', 'fromMain', { action: 'addCategoryResponse', data: { category: { nome: 'Categoria' } } }],
    ['assertPermission', 42, 'estoque.criar'],
    ['Subcategoria.create', { nome: 'Subcategoria' }],
    ['reply', 'fromMain', { action: 'addSubcategoryResponse', data: { subcategory: { nome: 'Subcategoria' } } }],
  ]);
});

test('handleAppRequest returns safe errors for unknown runtime failures', async () => {
  const result = await handleAppRequest({
    'unsafe.failure': async () => {
      throw new Error('SQLITE_CONSTRAINT: internal table detail');
    },
  }, { action: 'unsafe.failure' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Erro ao processar requisicao.',
      code: 'IPC_REQUEST_FAILED',
    },
  });
});

test('handleAppRequest does not trust unsafe low-level error codes', async () => {
  const result = await handleAppRequest({
    'unsafe.code': async () => {
      const error = new Error('ENOENT: no such file or directory, open C:\\Users\\silve\\secret.db');
      error.code = 'ENOENT';
      throw error;
    },
  }, { action: 'unsafe.code' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Erro ao processar requisicao.',
      code: 'ENOENT',
    },
  });
});

test('handleAppRequest preserves safe coded errors', async () => {
  const result = await handleAppRequest({
    'safe.failure': async () => {
      const error = new Error('Permissao insuficiente.');
      error.code = 'PERMISSION_DENIED';
      throw error;
    },
  }, { action: 'safe.failure' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Permissao insuficiente.',
      code: 'PERMISSION_DENIED',
    },
  });
});

test('init replaces existing app request handlers and legacy listeners', () => {
  const calls = [];
  const fakeIpcMain = {
    removeHandler(channel) {
      calls.push(['removeHandler', channel]);
    },
    handle(channel, handler) {
      calls.push(['handle', channel, typeof handler]);
    },
    removeAllListeners(channel) {
      calls.push(['removeAllListeners', channel]);
    },
    on(channel, handler) {
      calls.push(['on', channel, typeof handler]);
    },
  };
  const models = {
    Categoria: {},
    Subcategoria: {},
    Produto: {},
  };

  init(models, { ipcMain: fakeIpcMain });
  init(models, { ipcMain: fakeIpcMain });

  assert.deepEqual(calls, [
    ['removeHandler', 'app:request'],
    ['handle', 'app:request', 'function'],
    ['removeAllListeners', 'toMain'],
    ['on', 'toMain', 'function'],
    ['removeHandler', 'app:request'],
    ['handle', 'app:request', 'function'],
    ['removeAllListeners', 'toMain'],
    ['on', 'toMain', 'function'],
  ]);
});
