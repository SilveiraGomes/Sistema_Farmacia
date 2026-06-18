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
  'company.identity': ['company', 'object', {
    pharmacyName: 'Sistema de Farmacia',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    logoDataUrl: '',
  }],
  'documents.headerText': ['documents', 'text', 'Sistema de Farmacia'],
  'documents.currency': ['documents', 'text', 'AKZ'],
  'documents.fiscal': ['documents', 'object', {
    validationNumber: '999/AGT/2026',
    softwareName: 'KILSYSTEM',
    fiscalRegime: 'Regime: Exclusao',
    showQrCode: true,
    showTotalInWords: true,
    bankAccounts: [],
    series: {},
  }],
  'sales.defaultPaymentMethod': ['sales', 'catalog-code', 'dinheiro'],
  'sales.defaultTaxRate': ['sales', 'number', 0],
  'sales.maxDiscount': ['sales', 'number', 580.2],
  'sales.rounding': ['sales', 'enum', 'centimos'],
  'sales.finalConsumerLabel': ['sales', 'text', 'Consumidor final'],
  'stock.lowStockThreshold': ['stock', 'number', 25],
  'stock.expiryAlertDays': ['stock', 'number', 30],
  'alerts.dashboardEnabled': ['alerts', 'boolean', true],
  'alerts.defaultMessage': ['alerts', 'text', ''],
  'backup.options': ['backup', 'object', {
    frequency: 'manual',
    folderPath: '',
    retentionCount: 7,
  }],
  'migration.legacyLocalStorageVersion': ['migration', 'number', 0],
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
};

const technicalCatalogs = {
  client_statuses: ['activo', 'pendente', 'inactivo'],
  document_types: ['factura', 'recibo', 'proforma', 'nota-credito'],
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

  for (const [key, [group, type, defaultValue]] of Object.entries(expectedSettings)) {
    assert.equal(SETTING_DEFINITIONS[key].group, group, key);
    assert.equal(SETTING_DEFINITIONS[key].type, type, key);
    assert.deepEqual(SETTING_DEFINITIONS[key].defaultValue, defaultValue, key);
    assert.equal('default' in SETTING_DEFINITIONS[key], false, key);
  }
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

test('valida números e os seus limites', () => {
  assert.equal(validateSettingValue('sales.defaultTaxRate', 14), 14);
  assert.throws(
    () => validateSettingValue('sales.defaultTaxRate', -1),
    /Valor fora do limite permitido/,
  );
});

test('semeia os três turnos operacionais na ordem esperada', () => {
  assert.deepEqual(
    CATALOG_DEFINITIONS.operation_shifts.options.map((option) => option.code),
    ['manha', 'tarde', 'noite'],
  );
});

test('rejeita chaves, tipos, enumerações e códigos de catálogo inválidos', () => {
  assert.throws(() => validateSettingValue('unknown.key', true), /Configuração desconhecida/);
  assert.throws(() => validateSettingValue('alerts.dashboardEnabled', 'true'), /Tipo de valor inválido/);
  assert.throws(() => validateSettingValue('sales.rounding', 'dezena'), /Opção inválida/);
  assert.throws(() => validateSettingValue('sales.defaultPaymentMethod', 'cheque'), /Código de catálogo inválido/);
});

test('normaliza texto e devolve cópias de objetos', () => {
  assert.equal(validateSettingValue('documents.headerText', '  Farmácia Central  '), 'Farmácia Central');

  const options = { frequency: 'daily', folderPath: 'C:\\backup', retentionCount: 5 };
  const validated = validateSettingValue('backup.options', options);
  assert.deepEqual(validated, options);
  assert.notEqual(validated, options);
});

test('o registo e os dados aninhados são imutáveis', () => {
  assert.equal(Object.isFrozen(SETTING_DEFINITIONS), true);
  assert.equal(Object.isFrozen(SETTING_DEFINITIONS['documents.fiscal'].defaultValue), true);
  assert.equal(Object.isFrozen(CATALOG_DEFINITIONS.operation_shifts.options), true);
  assert.equal(Object.isFrozen(CATALOG_DEFINITIONS.operation_shifts.options[0]), true);
});
