import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_INVOICE_A4_SETTINGS,
  INVOICE_A4_SETTINGS_STORAGE_KEY,
  getStoredInvoiceA4Settings,
  normalizeInvoiceA4Settings,
  saveStoredInvoiceA4Settings,
} from '../src/data/invoiceSettings.mjs';

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(INVOICE_A4_SETTINGS_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test('uses safe default invoice A4 settings', () => {
  assert.deepEqual(getStoredInvoiceA4Settings(createStorage()), DEFAULT_INVOICE_A4_SETTINGS);
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.validationNumber, '999/AGT/2026');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.softwareName, 'KILSYSTEM');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.companyName, 'KILSYSTEM ANGOLA, LDA');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.companyActivity, 'COMERCIO GERAL - PRESTACAO DE SERVICOS');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.pharmacyTaxId, '500079734');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.pharmacyAddress, 'Largo Kussy N. 07, Cidade Alta-Huambo');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.pharmacyCity, 'HUAMBO - ANGOLA');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.pharmacyPhone, '(244) 923 909 381; 946 353 386');
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.pharmacyEmail, 'kilsystemangola@gmail.com');
  assert.match(DEFAULT_INVOICE_A4_SETTINGS.documentHeaderText, /KILSYSTEM ANGOLA, LDA\nCOMERCIO GERAL/);
  assert.equal(DEFAULT_INVOICE_A4_SETTINGS.showWatermark, false);
});

test('uses safe defaults when browser storage access is blocked', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage blocked'); },
  });
  try {
    assert.deepEqual(getStoredInvoiceA4Settings(), DEFAULT_INVOICE_A4_SETTINGS);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('normalizes invoice A4 settings for fiscal footer and options', () => {
  const result = normalizeInvoiceA4Settings({
    companyName: '  Empresa Exemplo LDA  ',
    companyActivity: '  Comercio e Servicos  ',
    pharmacyTaxId: '  541000999  ',
    pharmacyAddress: '  Rua 1  ',
    pharmacyCity: '  Luanda - Angola  ',
    pharmacyPhone: '  923 000 111  ',
    pharmacyEmail: '  geral@example.test  ',
    validationNumber: '  123/AGT/2026  ',
    softwareName: '  Sistema Farmacia  ',
    fiscalRegime: ' Regime Geral ',
    showQrCode: false,
    showLotAndExpiry: true,
    showTotalInWords: false,
    bankAccounts: [
      { bank: 'BAI', account: '11126994', iban: 'AO06 0040 0000 1112 6994 1011 6' },
      { bank: ' ', account: ' ', iban: ' ' },
    ],
  });

  assert.deepEqual(result, {
    documentHeaderText: [
      'Empresa Exemplo LDA',
      'Comercio e Servicos',
      'NIF: 541000999',
      'Rua 1',
      'Luanda - Angola',
      'TEL: 923 000 111',
      'EMAIL: geral@example.test',
    ].join('\n'),
    companyName: 'Empresa Exemplo LDA',
    companyActivity: 'Comercio e Servicos',
    pharmacyTaxId: '541000999',
    pharmacyAddress: 'Rua 1',
    pharmacyCity: 'Luanda - Angola',
    pharmacyPhone: '923 000 111',
    pharmacyEmail: 'geral@example.test',
    validationNumber: '123/AGT/2026',
    softwareName: 'Sistema Farmacia',
    fiscalRegime: 'Regime Geral',
    showQrCode: false,
    showLotAndExpiry: true,
    showTotalInWords: false,
    showWatermark: false,
    bankAccounts: [
      { bank: 'BAI', account: '11126994', iban: 'AO06 0040 0000 1112 6994 1011 6' },
    ],
  });
});

test('preserves document header line breaks', () => {
  const result = normalizeInvoiceA4Settings({
    documentHeaderText: 'Empresa Exemplo\nNIF: 500000000\nRua 1',
  });

  assert.equal(result.documentHeaderText, 'Empresa Exemplo\nNIF: 500000000\nRua 1');
});

test('migrates legacy company fields into document header text', () => {
  const result = normalizeInvoiceA4Settings({
    companyName: 'Empresa Antiga',
    companyActivity: 'Comercio',
    pharmacyTaxId: '500000000',
    pharmacyAddress: 'Rua 1',
    pharmacyCity: 'Huambo',
    pharmacyPhone: '923000000',
    pharmacyEmail: 'geral@example.test',
  });

  assert.equal(result.documentHeaderText, [
    'Empresa Antiga',
    'Comercio',
    'NIF: 500000000',
    'Rua 1',
    'Huambo',
    'TEL: 923000000',
    'EMAIL: geral@example.test',
  ].join('\n'));
});

test('saves invoice A4 settings to storage', () => {
  const storage = createStorage();
  const saved = saveStoredInvoiceA4Settings({
    validationNumber: '999/AGT/2026',
    softwareName: 'KILSYSTEM',
    bankAccounts: [{ bank: 'BFA', account: '123', iban: 'AO00' }],
  }, storage);

  assert.equal(saved.validationNumber, '999/AGT/2026');
  assert.deepEqual(JSON.parse(storage.getItem(INVOICE_A4_SETTINGS_STORAGE_KEY)), saved);
});
