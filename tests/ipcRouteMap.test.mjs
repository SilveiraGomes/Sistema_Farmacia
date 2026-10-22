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

test('buildRouteMap exposes auth, user, profile, operation, and configuration IPC actions', () => {
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
    'operation.state',
    'operation.openDay',
    'operation.closeDay',
    'operation.openShift',
    'operation.closeShift',
    'configuration.snapshot',
    'configuration.updateSection',
    'configuration.importLegacy',
    'configuration.document.reserveNumber',
    'configuration.catalog.create',
    'configuration.catalog.update',
    'configuration.catalog.reorder',
    'configuration.catalog.activate',
    'configuration.catalog.deactivate',
    'heldSales.load',
    'heldSales.save',
    'heldSales.clear',
  ];

  for (const action of expectedActions) {
    assert.equal(typeof routes[action], 'function', `${action} should be registered`);
  }
});

// Licença activa simulada: as rotas de escrita exigem o serviço de licenças.
const activeLicenseService = Object.freeze({
  status: () => ({ state: 'active', canWrite: true, readOnly: false }),
  assertWriteAllowed: () => {},
});

function createRouteDependencies(calls = []) {
  return {
    licenseService: activeLicenseService,
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
    operationService: {
      getOperationalState: async () => {
        calls.push(['getOperationalState']);
        return { canOperate: false };
      },
      openDay: async (payload) => {
        calls.push(['openDay', payload]);
        return payload;
      },
      closeDay: async (payload) => {
        calls.push(['closeDay', payload]);
        return payload;
      },
      openShift: async (payload) => {
        calls.push(['openShift', payload]);
        return payload;
      },
      closeShift: async (payload) => {
        calls.push(['closeShift', payload]);
        return payload;
      },
    },
    heldSalesService: {
      load: async () => {
        calls.push(['loadHeldSales']);
        return [];
      },
      save: async (sales) => {
        calls.push(['saveHeldSales', sales]);
        return { ok: true };
      },
      clear: async () => {
        calls.push(['clearHeldSales']);
        return { ok: true };
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

test('auth logout and expired sessions clear held sales', async () => {
  const calls = [];
  const dependencies = createRouteDependencies(calls);
  dependencies.authService.logout = async () => {
    calls.push(['logout']);
  };
  const routes = buildRouteMap(dependencies);

  await routes['auth.logout']();

  assert.deepEqual(calls, [['clearHeldSales'], ['logout']]);

  calls.length = 0;
  dependencies.authService.getCurrentSession = async () => null;

  const session = await routes['auth.currentSession']();

  assert.equal(session, null);
  assert.deepEqual(calls, [['clearHeldSales']]);
});

test('held sales IPC routes delegate to the held sales service', async () => {
  const calls = [];
  const routes = buildRouteMap(createRouteDependencies(calls));

  await routes['heldSales.load']();
  await routes['heldSales.save']({ sales: [{ number: 'ESP-1' }] });
  await routes['heldSales.clear']();

  assert.deepEqual(calls, [
    ['loadHeldSales'],
    ['saveHeldSales', [{ number: 'ESP-1' }]],
    ['clearHeldSales'],
  ]);
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

test('operation routes require permissions and pass actor user and data to operation service', async () => {
  const calls = [];
  const routes = buildRouteMap(createRouteDependencies(calls));

  await routes['operation.state']();
  await routes['operation.openDay']({ saldo_inicial: 100 });
  await routes['operation.closeDay']({ saldo_final_informado: 150 });
  await routes['operation.openShift']({ nome: 'Manha', saldo_inicial: 25 });
  await routes['operation.closeShift']({ saldo_final_informado: 50 });

  assert.deepEqual(calls, [
    ['assertPermission', 42, 'operacao.ver'],
    ['getOperationalState'],
    ['assertPermission', 42, 'operacao.abrir_dia'],
    ['openDay', { actorUserId: 42, data: { saldo_inicial: 100 } }],
    ['assertPermission', 42, 'operacao.fechar_dia'],
    ['closeDay', { actorUserId: 42, data: { saldo_final_informado: 150 } }],
    ['assertPermission', 42, 'operacao.abrir_turno'],
    ['openShift', { actorUserId: 42, data: { nome: 'Manha', saldo_inicial: 25 } }],
    ['assertPermission', 42, 'operacao.fechar_turno'],
    ['closeShift', { actorUserId: 42, data: { saldo_final_informado: 50 } }],
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

test('operation routes reject sessions that must change password before service calls', async () => {
  const calls = [];
  const dependencies = createRouteDependencies(calls);
  dependencies.authService.getCurrentSession = async () => ({
    user: { id: 42, deve_trocar_senha: true },
    mustChangePassword: true,
  });
  const routes = buildRouteMap(dependencies);

  const result = await handleAppRequest(routes, { action: 'operation.openDay', data: { saldo_inicial: 10 } });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Troca de senha obrigatoria.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    },
  });
  assert.deepEqual(calls, []);
});

const { DEFAULT_PROFILES } = require('../src/backend/services/permissionCatalog.js');

function createProfileRouteDependencies(grantedKeys, calls = []) {
  const granted = new Set(grantedKeys);
  return {
    ...createRouteDependencies(calls),
    assertPermission: async (userId, permissionKey) => {
      calls.push(['assertPermission', userId, permissionKey]);
      if (!granted.has(permissionKey)) {
        throw Object.assign(new Error('Permissao insuficiente.'), { code: 'PERMISSION_DENIED' });
      }
    },
    estoqueService: {
      listProducts: async () => { calls.push(['listProducts']); return []; },
      listCategories: async () => { calls.push(['listCategories']); return []; },
    },
    clienteService: {
      listClientes: async () => { calls.push(['listClientes']); return []; },
    },
    vendaService: {
      listDocuments: async () => { calls.push(['listDocuments']); return []; },
      cancelDocument: async () => { calls.push(['cancelDocument']); return {}; },
      convertProforma: async () => { calls.push(['convertProforma']); return {}; },
    },
    configurationService: {
      reserveNextDocumentNumber: async ({ documentType }) => {
        calls.push(['reserveNextDocumentNumber', documentType]);
        return `${documentType} 1/26`;
      },
    },
  };
}

function profilePermissions(name) {
  return DEFAULT_PROFILES.find((profile) => profile.nome === name).permissoes;
}

test('default Caixa profile can load every list the PDV needs without stock management access', async () => {
  const caixa = profilePermissions('Caixa');
  assert.equal(caixa.includes('estoque.ver'), false);
  const routes = buildRouteMap(createProfileRouteDependencies(caixa));

  for (const action of ['estoque.listProducts', 'estoque.listCategories', 'clientes.list']) {
    const result = await handleAppRequest(routes, { action });
    assert.equal(result.ok, true, `${action} should be allowed for Caixa`);
  }
  for (const documentType of ['factura', 'factura_recibo', 'proforma']) {
    const result = await handleAppRequest(routes, {
      action: 'configuration.document.reserveNumber',
      data: { documentType },
    });
    assert.equal(result.ok, true, `Caixa should reserve ${documentType}`);
  }
});

test('shared routes deny users holding none of the accepted permissions', async () => {
  const calls = [];
  const routes = buildRouteMap(createProfileRouteDependencies(['dashboard.ver'], calls));

  const result = await handleAppRequest(routes, { action: 'estoque.listProducts' });

  assert.deepEqual(result, {
    ok: false,
    error: { message: 'Permissao insuficiente.', code: 'PERMISSION_DENIED' },
  });
  assert.deepEqual(calls, [
    ['assertPermission', 42, 'estoque.ver'],
    ['assertPermission', 42, 'vendas.criar'],
  ]);
});

test('shared routes propagate non-permission failures from the permission check', async () => {
  const dependencies = createProfileRouteDependencies([]);
  dependencies.assertPermission = async () => { throw new Error('database locked'); };
  const routes = buildRouteMap(dependencies);

  await assert.rejects(() => routes['estoque.listProducts'](), /database locked/);
});

test('credit note numbers are only reserved for users allowed to cancel documents', async () => {
  const calls = [];
  const routes = buildRouteMap(createProfileRouteDependencies(profilePermissions('Caixa'), calls));

  const result = await handleAppRequest(routes, {
    action: 'configuration.document.reserveNumber',
    data: { documentType: 'nota-credito' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PERMISSION_DENIED');
  assert.equal(calls.some(([name]) => name === 'reserveNextDocumentNumber'), false);
});

test('Documentos permissions of the default Gestor de Stock profile match the backend routes', async () => {
  const calls = [];
  const routes = buildRouteMap(createProfileRouteDependencies(profilePermissions('Gestor de Stock'), calls));

  const steps = [
    ['vendas.listDocuments', {}],
    ['configuration.document.reserveNumber', { documentType: 'nota-credito' }],
    ['vendas.cancelDocument', { venda_id: 1 }],
    ['configuration.document.reserveNumber', { documentType: 'factura' }],
    ['vendas.convertProforma', { venda_id: 2 }],
  ];
  for (const [action, data] of steps) {
    const result = await handleAppRequest(routes, { action, data });
    assert.equal(result.ok, true, `${action} should be allowed for Gestor de Stock`);
  }
});

test('product list hides the cost price from users who only sell', async () => {
  const product = { id: 1, nome: 'Paracetamol', preco_venda: 500, preco_custo: 320 };
  const routesFor = (keys) => {
    const dependencies = createProfileRouteDependencies(keys);
    dependencies.estoqueService.listProducts = async () => [{ ...product }];
    return buildRouteMap(dependencies);
  };

  const cashierProducts = await routesFor(profilePermissions('Caixa'))['estoque.listProducts']();
  assert.deepEqual(cashierProducts, [{ id: 1, nome: 'Paracetamol', preco_venda: 500 }]);

  const stockProducts = await routesFor(profilePermissions('Gestor de Stock'))['estoque.listProducts']();
  assert.equal(stockProducts[0].preco_custo, 320);
});

test('cost price follows the configurable estoque.custo permission on reads and writes', async () => {
  const calls = [];
  const product = { id: 1, nome: 'Paracetamol', preco_venda: 500, preco_custo: 320 };
  const dependencies = createProfileRouteDependencies(['estoque.ver', 'estoque.preco', 'estoque.ajustar'], calls);
  Object.assign(dependencies.estoqueService, {
    listPrices: async () => [{ ...product }],
    getProduct: async () => ({ ...product }),
    updateProductPrice: async (data) => { calls.push(['updateProductPrice', data]); return data; },
    addStockLot: async (data) => { calls.push(['addStockLot', data]); return data; },
  });
  const routes = buildRouteMap(dependencies);

  assert.equal('preco_custo' in (await routes['estoque.listPrices']())[0], false);
  assert.equal('preco_custo' in await routes['estoque.getProduct']({ produto_id: 1 }), false);
  await routes['estoque.updatePrice']({ produto_id: 1, preco_venda: 600, preco_custo: 1 });
  await routes['estoque.addLot']({ produto_id: 1, quantidade: 5, preco_custo: 1 });
  assert.deepEqual(calls.filter(([name]) => name === 'updateProductPrice')[0][1], { produto_id: 1, preco_venda: 600 });
  assert.deepEqual(calls.filter(([name]) => name === 'addStockLot')[0][1], { produto_id: 1, quantidade: 5 });

  const withCost = createProfileRouteDependencies(['estoque.ver', 'estoque.custo']);
  withCost.estoqueService.listPrices = async () => [{ ...product }];
  assert.equal((await buildRouteMap(withCost)['estoque.listPrices']())[0].preco_custo, 320);
});

test('sales routes reserve the fiscal number inside the document transaction', async () => {
  const calls = [];
  const dependencies = createProfileRouteDependencies(profilePermissions('Administrador'), calls);
  dependencies.vendaService.createVenda = async (data, actorUserId, { reserveNumber }) => {
    calls.push(['createVenda', data.numero_factura ?? null]);
    return { number: await reserveNumber({ documentType: data.docType, transaction: 'tx' }) };
  };
  dependencies.configurationService.reserveNextDocumentNumber = async (options) => {
    calls.push(['reserve', options]);
    return 'FR00001/26';
  };
  const routes = buildRouteMap(dependencies);

  const result = await routes['vendas.create']({ docType: 'factura_recibo', items: [{}], total: 1 });

  assert.equal(result.number, 'FR00001/26');
  assert.deepEqual(calls.filter(([name]) => name !== 'assertPermission'), [
    ['createVenda', null],
    ['reserve', { documentType: 'factura_recibo', transaction: 'tx', actorUserId: 42 }],
  ]);
});

test('sales with a discount require the discount permission', async () => {
  const calls = [];
  const dependencies = createProfileRouteDependencies(profilePermissions('Caixa'), calls);
  dependencies.vendaService.createVenda = async () => { calls.push(['createVenda']); return { id: 9 }; };
  const routes = buildRouteMap(dependencies);

  const discounted = await handleAppRequest(routes, { action: 'vendas.create', data: { desconto: 100 } });
  assert.deepEqual(discounted, {
    ok: false,
    error: { message: 'Sem permissao para aplicar descontos.', code: 'PERMISSION_DENIED' },
  });
  assert.equal(calls.some(([name]) => name === 'createVenda'), false);

  const regular = await handleAppRequest(routes, { action: 'vendas.create', data: { desconto: 0 } });
  assert.equal(regular.ok, true);
});

test('stock imports require the import permission', async () => {
  const calls = [];
  const dependencies = createProfileRouteDependencies(['estoque.ver', 'estoque.editar'], calls);
  dependencies.estoqueService.importProducts = async () => { calls.push(['importProducts']); return {}; };
  const routes = buildRouteMap(dependencies);

  for (const action of ['estoque.importProducts', 'estoque.importCategories', 'estoque.importSubcategories']) {
    const result = await handleAppRequest(routes, { action, data: { rows: [] } });
    assert.equal(result.error?.code, 'PERMISSION_DENIED', action);
  }
  assert.equal(calls.some(([name]) => name === 'importProducts'), false);
});

test('dashboard metrics only include profit figures for users with financial access', async () => {
  const routesFor = (keys) => {
    const dependencies = createProfileRouteDependencies(keys);
    dependencies.dashboardService = {
      getDashboardMetrics: async () => ({ day: { totalVendas: 10 }, financialSummary: { netProfit: 4 } }),
    };
    return buildRouteMap(dependencies);
  };

  const cashier = await routesFor(profilePermissions('Caixa'))['dashboard.metrics']();
  assert.deepEqual(cashier, { day: { totalVendas: 10 } });

  const admin = await routesFor(['dashboard.ver', 'financeiro.ver'])['dashboard.metrics']();
  assert.deepEqual(admin.financialSummary, { netProfit: 4 });
});

test('marking a payable as paid requires the financial edit permission', async () => {
  const calls = [];
  const dependencies = createProfileRouteDependencies(['financeiro.ver'], calls);
  dependencies.financeiroService = { marcarPago: async () => { calls.push(['marcarPago']); } };
  const routes = buildRouteMap(dependencies);

  const result = await handleAppRequest(routes, { action: 'financeiro.marcarPago', data: { id: 1 } });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PERMISSION_DENIED');
  assert.deepEqual(calls, [['assertPermission', 42, 'financeiro.editar']]);
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
    licenseService: activeLicenseService,
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

test('handleAppRequest preserves safe operation errors', async () => {
  const result = await handleAppRequest({
    'operation.blocked': async () => {
      const error = new Error('Abra o dia operacional antes de iniciar operacoes.');
      error.code = 'OPERATION_STATE_INVALID';
      throw error;
    },
  }, { action: 'operation.blocked' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Abra o dia operacional antes de iniciar operacoes.',
      code: 'OPERATION_STATE_INVALID',
    },
  });
});

test('handleAppRequest redacts unsafe messages even with operation error code', async () => {
  const result = await handleAppRequest({
    'operation.unsafe': async () => {
      const error = new Error('SQLITE_CONSTRAINT: secret detail');
      error.code = 'OPERATION_STATE_INVALID';
      throw error;
    },
  }, { action: 'operation.unsafe' });

  assert.deepEqual(result, {
    ok: false,
    error: {
      message: 'Erro ao processar requisicao.',
      code: 'OPERATION_STATE_INVALID',
    },
  });
});

test('init replaces existing app request handlers and legacy listeners', async () => {
  const calls = [];
  const printChannels = [
    'print:window:listPrinters',
    'print:window:print',
    'print:window:exportPdf',
    'print:window:close',
  ];
  const expectedCycle = [
    ['removeHandler', 'app:request'],
    ['handle', 'app:request', 'function'],
    ...printChannels.map((channel) => ['removeHandler', channel]),
    ...printChannels.map((channel) => ['handle', channel, 'function']),
    ['removeAllListeners', 'toMain'],
    ['on', 'toMain', 'function'],
  ];
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

  const configurationService = { seedDefaults: async () => undefined };
  await init(models, { ipcMain: fakeIpcMain, configurationService });
  await init(models, { ipcMain: fakeIpcMain, configurationService });

  assert.deepEqual(calls, [...expectedCycle, ...expectedCycle]);
});
