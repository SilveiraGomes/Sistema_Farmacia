import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  SETTING_DEFINITIONS,
  CATALOG_DEFINITIONS,
  validateSettingValue,
} = require('../src/backend/services/configurationRegistry');

const expectedSettings = {
  'company.identity': {
    group: 'company',
    type: 'object',
    defaultValue: {
      pharmacyName: 'Sistema de Farmacia',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoDataUrl: '',
    },
  },
  'documents.headerText': {
    group: 'documents', type: 'text', defaultValue: 'Sistema de Farmacia',
  },
  'documents.currency': { group: 'documents', type: 'text', defaultValue: 'AKZ' },
  'documents.fiscal': {
    group: 'documents',
    type: 'object',
    defaultValue: {
      validationNumber: '999/AGT/2026',
      softwareName: 'KILSYSTEM',
      fiscalRegime: 'Regime: Exclusao',
      showQrCode: true,
      showTotalInWords: true,
      bankAccounts: [],
      series: {},
    },
  },
  'sales.defaultPaymentMethod': {
    group: 'sales', type: 'catalog-code', catalog: 'payment_methods', defaultValue: 'dinheiro',
  },
  'sales.defaultTaxRate': {
    group: 'sales', type: 'number', min: 0, max: 100, defaultValue: 0,
  },
  'sales.maxDiscount': {
    group: 'sales', type: 'number', min: 0, defaultValue: 580.2,
  },
  'sales.rounding': {
    group: 'sales', type: 'enum', values: ['centimos', 'unidade'], defaultValue: 'centimos',
  },
  'sales.finalConsumerLabel': {
    group: 'sales', type: 'text', defaultValue: 'Consumidor final',
  },
  'stock.lowStockThreshold': {
    group: 'stock', type: 'number', min: 0, defaultValue: 25,
  },
  'stock.expiryAlertDays': {
    group: 'stock', type: 'number', min: 0, defaultValue: 30,
  },
  'alerts.dashboardEnabled': { group: 'alerts', type: 'boolean', defaultValue: true },
  'alerts.defaultMessage': { group: 'alerts', type: 'text', defaultValue: '' },
  'alerts.sessionTimeoutMinutes': { group: 'alerts', type: 'number', min: 0, defaultValue: 30 },
  'backup.options': {
    group: 'backup',
    type: 'object',
    defaultValue: { frequency: 'manual', folderPath: '', retentionCount: 7 },
  },
  'migration.legacyLocalStorageVersion': {
    group: 'migration', type: 'number', min: 0, defaultValue: 0,
  },
  'reports.googleSheets': {
    group: 'reports',
    type: 'object',
    defaultValue: {
      syncEnabled: true,
      syncTime: '21:00',
      reportTypes: ['venda_turno', 'venda_dia', 'financeiro', 'estoque'],
      retentionDays: 90,
      spreadsheetId: '',
      credentials: '',
    },
  },
  'documents.printOptions': {
    group: 'documents',
    type: 'object',
    defaultValue: { previewBeforePrint: true, copies: 1 },
  },
  'appearance.startFullscreen': {
    group: 'appearance',
    type: 'boolean',
    defaultValue: true,
  },
};

const editableCatalogs = {
  payment_methods: ['dinheiro', 'tpa', 'transferencia', 'credito'],
  operation_shifts: ['manha', 'tarde', 'noite'],
  expense_categories: [
    'infraestrutura',
    'recursos-humanos',
    'servicos',
    'fornecedores',
    'marketing',
    'outro',
  ],
  revenue_categories: ['servico', 'rendimento-extra', 'ajuste-caixa', 'outro'],
  loss_reasons: [
    'expiracao',
    'danificado',
    'furto',
    'consumo-interno',
    'obsolescencia',
    'outro',
  ],
  stock_units: ['unidade', 'caixa', 'frasco', 'blister'],
  stock_locations: ['loja', 'armazem'],
  product_locations: ['prateleira-a1', 'prateleira-a2', 'gaveta-g1', 'gaveta-g2', 'zona-principal'],
};

const technicalCatalogs = {
  client_statuses: ['activo', 'pendente', 'inactivo'],
  document_types: ['factura', 'factura_recibo', 'recibo', 'proforma', 'credito', 'nota-credito'],
  document_statuses: ['emitido', 'pago', 'pendente', 'anulado', 'convertido'],
  financial_entry_types: ['expense', 'revenue', 'loss'],
  financial_statuses: ['pendente', 'paga', 'cancelada'],
  operation_statuses: ['aberto', 'fechado', 'bloqueado'],
};

const expectedTitle = (code) => code
  .split(/[_-]/)
  .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(' ');

test('expõe exatamente as configurações centrais, grupos, tipos e defaults', () => {
  assert.deepEqual(Object.keys(SETTING_DEFINITIONS), Object.keys(expectedSettings));
  assert.deepEqual(SETTING_DEFINITIONS, expectedSettings);
});

test('expõe todos e apenas os catálogos editáveis e técnicos requeridos', () => {
  assert.deepEqual(
    Object.keys(CATALOG_DEFINITIONS),
    [...Object.keys(editableCatalogs), ...Object.keys(technicalCatalogs)],
  );

  for (const [key, codes] of Object.entries(editableCatalogs)) {
    assert.equal(CATALOG_DEFINITIONS[key].editable, true, key);
    assert.deepEqual(CATALOG_DEFINITIONS[key].options.map(({ code }) => code), codes, key);
  }

  for (const [key, codes] of Object.entries(technicalCatalogs)) {
    assert.equal(CATALOG_DEFINITIONS[key].editable, false, key);
    assert.deepEqual(CATALOG_DEFINITIONS[key].options.map(({ code }) => code), codes, key);
  }
});

test('gera nome, ordem zero-based e marcador de sistema para cada opção', () => {
  for (const [key, catalog] of Object.entries(CATALOG_DEFINITIONS)) {
    const expectedSystem = !catalog.editable;
    assert.deepEqual(
      catalog.options,
      catalog.options.map(({ code }, index) => ({
        code,
        name: expectedTitle(code),
        order: index,
        system: expectedSystem,
      })),
      key,
    );
  }
});

test('mantém chaves e códigos únicos', () => {
  const settingKeys = Object.keys(SETTING_DEFINITIONS);
  assert.equal(new Set(settingKeys).size, settingKeys.length);

  for (const catalog of Object.values(CATALOG_DEFINITIONS)) {
    const codes = catalog.options.map((option) => option.code);
    assert.equal(new Set(codes).size, codes.length);
  }
});

test('rejeita tipos incorretos para todos os tipos suportados', () => {
  const cases = [
    ['documents.headerText', 12],
    ['sales.defaultTaxRate', '14'],
    ['alerts.dashboardEnabled', 1],
    ['backup.options', 'manual'],
    ['sales.rounding', 1],
    ['sales.defaultPaymentMethod', 1],
  ];

  for (const [key, value] of cases) {
    assert.throws(
      () => validateSettingValue(key, value),
      /Tipo de valor inválido|Valor de objeto inválido/,
      key,
    );
  }
});

test('rejeita números não finitos', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => validateSettingValue('sales.defaultTaxRate', value),
      /Tipo de valor inválido/,
    );
  }
});

test('aceita os limites numéricos inclusivos e rejeita valores exteriores', () => {
  const accepted = [
    ['sales.defaultTaxRate', 0],
    ['sales.defaultTaxRate', 100],
    ['sales.maxDiscount', 0],
    ['stock.lowStockThreshold', 0],
    ['stock.expiryAlertDays', 0],
    ['migration.legacyLocalStorageVersion', 0],
  ];
  const rejected = [
    ['sales.defaultTaxRate', -0.01],
    ['sales.defaultTaxRate', 100.01],
    ['sales.maxDiscount', -0.01],
    ['stock.lowStockThreshold', -1],
    ['stock.expiryAlertDays', -1],
    ['migration.legacyLocalStorageVersion', -1],
  ];

  for (const [key, value] of accepted) {
    assert.equal(validateSettingValue(key, value), value, `${key}: ${value}`);
  }
  for (const [key, value] of rejected) {
    assert.throws(
      () => validateSettingValue(key, value),
      /Valor fora do limite permitido/,
      `${key}: ${value}`,
    );
  }
});

test('semeia os três turnos operacionais na ordem esperada', () => {
  assert.deepEqual(
    CATALOG_DEFINITIONS.operation_shifts.options.map((option) => option.code),
    ['manha', 'tarde', 'noite'],
  );
});

test('rejeita chaves, enumerações e códigos de catálogo inválidos', () => {
  assert.throws(() => validateSettingValue('unknown.key', true), /Configuração desconhecida/);
  assert.throws(() => validateSettingValue('sales.rounding', 'dezena'), /Opção inválida/);
  assert.throws(() => validateSettingValue('sales.defaultPaymentMethod', 'cheque'), /Código de catálogo inválido/);
});

test('normaliza texto, enums e códigos de catálogo', () => {
  assert.equal(validateSettingValue('documents.headerText', '  Farmácia Central  '), 'Farmácia Central');
  assert.equal(validateSettingValue('sales.rounding', '  unidade  '), 'unidade');
  assert.equal(validateSettingValue('sales.defaultPaymentMethod', '  tpa  '), 'tpa');
});

test('rejeita objetos de topo que não sejam objetos planos', () => {
  class CustomValue {}

  for (const value of [null, [], new Date(), new Map(), new Set(), new CustomValue()]) {
    assert.throws(
      () => validateSettingValue('backup.options', value),
      /Valor de objeto inválido/,
    );
  }
});

test('rejeita ciclos e valores aninhados incompatíveis com JSON', () => {
  const circular = {};
  circular.self = circular;
  const circularArray = [];
  circularArray.push(circularArray);
  const withSymbolKey = { valid: true };
  withSymbolKey[Symbol('hidden')] = 'value';

  const invalidValues = [
    circular,
    { nested: circularArray },
    { nested: undefined },
    { nested: () => true },
    { nested: Symbol('value') },
    { nested: 1n },
    { nested: Number.NaN },
    { nested: Number.POSITIVE_INFINITY },
    { nested: new Date() },
    { nested: new Map() },
    { nested: new Set() },
    { nested: /value/ },
    withSymbolKey,
  ];

  for (const value of invalidValues) {
    assert.throws(
      () => validateSettingValue('backup.options', value),
      /Valor de objeto inválido/,
    );
  }
});

test('devolve uma cópia profunda e independente de objetos JSON válidos', () => {
  const options = {
    frequency: 'daily',
    folderPath: 'C:\\backup',
    retentionCount: 5,
    metadata: { nullable: null, folders: [{ name: 'primary' }] },
  };
  const validated = validateSettingValue('backup.options', options);

  assert.deepEqual(validated, options);
  assert.notEqual(validated, options);
  assert.notEqual(validated.metadata, options.metadata);
  assert.notEqual(validated.metadata.folders, options.metadata.folders);
  assert.notEqual(validated.metadata.folders[0], options.metadata.folders[0]);

  options.metadata.folders[0].name = 'changed input';
  assert.equal(validated.metadata.folders[0].name, 'primary');
  validated.metadata.nullable = 'changed output';
  assert.equal(options.metadata.nullable, null);
});

test('o registo e os dados aninhados são imutáveis', () => {
  assert.equal(Object.isFrozen(SETTING_DEFINITIONS), true);
  assert.equal(Object.isFrozen(SETTING_DEFINITIONS['documents.fiscal'].defaultValue), true);
  assert.equal(Object.isFrozen(CATALOG_DEFINITIONS.operation_shifts.options), true);
  assert.equal(Object.isFrozen(CATALOG_DEFINITIONS.operation_shifts.options[0]), true);
});
