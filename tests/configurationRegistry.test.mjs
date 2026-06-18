import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  SETTING_DEFINITIONS,
  CATALOG_DEFINITIONS,
  validateSettingValue,
} = require('../src/backend/services/configurationRegistry');

test('expõe os tipos das configurações centrais', () => {
  assert.equal(SETTING_DEFINITIONS['sales.defaultTaxRate'].type, 'number');
  assert.equal(SETTING_DEFINITIONS['documents.headerText'].type, 'text');
});

test('distingue catálogos editáveis de catálogos técnicos', () => {
  assert.equal(CATALOG_DEFINITIONS.payment_methods.editable, true);
  assert.equal(CATALOG_DEFINITIONS.document_statuses.editable, false);
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
  assert.equal(Object.isFrozen(SETTING_DEFINITIONS['documents.fiscal'].default), true);
  assert.equal(Object.isFrozen(CATALOG_DEFINITIONS.operation_shifts.options), true);
  assert.equal(Object.isFrozen(CATALOG_DEFINITIONS.operation_shifts.options[0]), true);
});
