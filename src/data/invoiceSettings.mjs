export const INVOICE_A4_SETTINGS_STORAGE_KEY = 'pharmacy.invoiceA4Settings';

export const DEFAULT_DOCUMENT_HEADER_TEXT = buildLegacyDocumentHeader({
  companyName: 'KILSYSTEM ANGOLA, LDA',
  companyActivity: 'COMERCIO GERAL - PRESTACAO DE SERVICOS',
  pharmacyTaxId: '500079734',
  pharmacyAddress: 'Largo Kussy N. 07, Cidade Alta-Huambo',
  pharmacyCity: 'HUAMBO - ANGOLA',
  pharmacyPhone: '(244) 923 909 381; 946 353 386',
  pharmacyEmail: 'kilsystemangola@gmail.com',
});

export const DEFAULT_INVOICE_A4_SETTINGS = Object.freeze({
  documentHeaderText: DEFAULT_DOCUMENT_HEADER_TEXT,
  companyName: 'KILSYSTEM ANGOLA, LDA',
  companyActivity: 'COMERCIO GERAL - PRESTACAO DE SERVICOS',
  pharmacyTaxId: '500079734',
  pharmacyAddress: 'Largo Kussy N. 07, Cidade Alta-Huambo',
  pharmacyCity: 'HUAMBO - ANGOLA',
  pharmacyPhone: '(244) 923 909 381; 946 353 386',
  pharmacyEmail: 'kilsystemangola@gmail.com',
  validationNumber: '999/AGT/2026',
  softwareName: 'KILSYSTEM',
  fiscalRegime: 'Regime: Exclusao',
  showQrCode: true,
  showLotAndExpiry: true,
  showTotalInWords: true,
  showWatermark: false,
  bankAccounts: [],
});

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function cleanText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text || fallback;
}

function cleanMultilineText(value) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function buildLegacyDocumentHeader(input = {}) {
  return [
    cleanText(input.companyName),
    cleanText(input.companyActivity),
    input.pharmacyTaxId ? `NIF: ${cleanText(input.pharmacyTaxId)}` : '',
    cleanText(input.pharmacyAddress),
    cleanText(input.pharmacyCity),
    input.pharmacyPhone ? `TEL: ${cleanText(input.pharmacyPhone)}` : '',
    input.pharmacyEmail ? `EMAIL: ${cleanText(input.pharmacyEmail)}` : '',
  ].filter(Boolean).join('\n');
}

function normalizeBankAccount(account) {
  return {
    bank: cleanText(account?.bank),
    account: cleanText(account?.account),
    iban: cleanText(account?.iban),
  };
}

export function normalizeInvoiceA4Settings(input = {}) {
  const bankAccounts = Array.isArray(input.bankAccounts)
    ? input.bankAccounts
        .map(normalizeBankAccount)
        .filter((account) => account.bank || account.account || account.iban)
    : DEFAULT_INVOICE_A4_SETTINGS.bankAccounts;

  return {
    documentHeaderText: cleanMultilineText(input.documentHeaderText)
      || buildLegacyDocumentHeader(input)
      || DEFAULT_DOCUMENT_HEADER_TEXT,
    companyName: cleanText(input.companyName, DEFAULT_INVOICE_A4_SETTINGS.companyName),
    companyActivity: cleanText(input.companyActivity, DEFAULT_INVOICE_A4_SETTINGS.companyActivity),
    pharmacyTaxId: cleanText(input.pharmacyTaxId, DEFAULT_INVOICE_A4_SETTINGS.pharmacyTaxId),
    pharmacyAddress: cleanText(input.pharmacyAddress, DEFAULT_INVOICE_A4_SETTINGS.pharmacyAddress),
    pharmacyCity: cleanText(input.pharmacyCity, DEFAULT_INVOICE_A4_SETTINGS.pharmacyCity),
    pharmacyPhone: cleanText(input.pharmacyPhone, DEFAULT_INVOICE_A4_SETTINGS.pharmacyPhone),
    pharmacyEmail: cleanText(input.pharmacyEmail, DEFAULT_INVOICE_A4_SETTINGS.pharmacyEmail),
    validationNumber: cleanText(input.validationNumber, DEFAULT_INVOICE_A4_SETTINGS.validationNumber),
    softwareName: cleanText(input.softwareName, DEFAULT_INVOICE_A4_SETTINGS.softwareName),
    fiscalRegime: cleanText(input.fiscalRegime, DEFAULT_INVOICE_A4_SETTINGS.fiscalRegime),
    showQrCode: input.showQrCode !== false,
    showLotAndExpiry: input.showLotAndExpiry !== false,
    showTotalInWords: input.showTotalInWords !== false,
    showWatermark: false,
    bankAccounts,
  };
}

export function getStoredInvoiceA4Settings(storage = getDefaultStorage()) {
  if (!storage) {
    return { ...DEFAULT_INVOICE_A4_SETTINGS };
  }

  try {
    const raw = storage.getItem(INVOICE_A4_SETTINGS_STORAGE_KEY);
    return raw ? normalizeInvoiceA4Settings(JSON.parse(raw)) : { ...DEFAULT_INVOICE_A4_SETTINGS };
  } catch {
    return { ...DEFAULT_INVOICE_A4_SETTINGS };
  }
}

export function saveStoredInvoiceA4Settings(input, storage = getDefaultStorage()) {
  const settings = normalizeInvoiceA4Settings(input);
  storage?.setItem(INVOICE_A4_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}
