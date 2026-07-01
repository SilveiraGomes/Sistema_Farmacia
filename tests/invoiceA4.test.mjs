import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentSettingsFromSnapshot,
  buildFiscalReference,
  buildInvoiceA4ViewModel,
  calculateInvoiceA4Totals,
  numberToPortugueseWords,
} from '../src/data/invoiceA4.mjs';
import { createSafeDefaultSnapshot } from '../src/configuration/catalogKeys.mjs';

test('buildDocumentSettingsFromSnapshot maps central identity and fiscal settings', () => {
  const snapshot = createSafeDefaultSnapshot();
  snapshot.settings.company.identity.value.pharmacyName = 'Farmacia ESAYOS';
  snapshot.settings.documents.headerText.value = 'Farmacia ESAYOS\nNIF 123';
  snapshot.settings.documents.fiscal.value.validationNumber = '123/AGT/2026';
  const result = buildDocumentSettingsFromSnapshot(snapshot);
  assert.equal(result.branding.pharmacyName, 'Farmacia ESAYOS');
  assert.equal(result.settings.documentHeaderText, 'Farmacia ESAYOS\nNIF 123');
  assert.equal(result.settings.validationNumber, '123/AGT/2026');
});
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../src/data/documents.mjs';

const document = {
  id: 'doc-1',
  type: DOCUMENT_TYPES.INVOICE,
  status: DOCUMENT_STATUSES.ISSUED,
  number: 'FAT027/26',
  issueDate: '2026-06-17',
  dueDate: '2026-06-20',
  clientName: 'Joao de Almeida',
  clientTaxId: '500379603',
  paymentMethod: 'Dinheiro',
  userName: 'Administrador',
  items: [
    {
      productId: '0001',
      description: 'C-12 Plus',
      quantity: 2,
      unitPrice: 2540.3,
      discount: 0,
      taxRate: 0,
      total: 5080.6,
      lot: 'L01',
      expiryDate: '2027-12-31',
    },
    {
      productId: '0002',
      description: 'Cloranfenicol',
      quantity: 1,
      unitPrice: 1980,
      discount: 580.2,
      taxRate: 0,
      total: 1399.8,
    },
  ],
  subtotal: 7060.6,
  discount: 580.2,
  tax: 0,
  total: 6480.4,
};

test('buildFiscalReference uses deterministic alphanumeric prefix when supplied', () => {
  assert.equal(
    buildFiscalReference({ prefix: 'lzoe', validationNumber: '999/AGT/2026', softwareName: 'KILSYSTEM' }),
    'lzoe-Processado por programa validado nº999/AGT/2026-KILSYSTEM',
  );
});

test('calculateInvoiceA4Totals derives fiscal totals from items', () => {
  assert.deepEqual(calculateInvoiceA4Totals(document), {
    subtotal: 7060.6,
    discount: 580.2,
    tax: 0,
    retention: 0,
    total: 6480.4,
    taxSummary: [
      { designation: 'Isento', incidence: 6480.4, taxRate: 0, taxValue: 0 },
    ],
  });
});

test('numberToPortugueseWords supports Kwanza total by words', () => {
  assert.equal(numberToPortugueseWords(6480.4), 'Seis Mil Quatrocentos e Oitenta Kwanzas e Quarenta Centimos');
});

test('buildInvoiceA4ViewModel prepares a no-watermark A4 document', () => {
  const viewModel = buildInvoiceA4ViewModel({
    document,
    branding: { pharmacyName: 'Farmacia Nova Vida', logoDataUrl: '' },
    settings: {
      documentHeaderText: 'KILSYSTEM ANGOLA, LDA\nCOMERCIO GERAL - PRESTACAO DE SERVICOS\nNIF: 500079734',
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
      bankAccounts: [{ bank: 'BAI', account: '11126994', iban: 'AO06' }],
    },
    printedBy: 'Administrador',
    printedAt: new Date('2026-06-17T14:38:00Z'),
    referencePrefix: 'lzoe',
  });

  assert.equal(
    viewModel.header.documentHeaderText,
    'KILSYSTEM ANGOLA, LDA\nCOMERCIO GERAL - PRESTACAO DE SERVICOS\nNIF: 500079734',
  );
  assert.equal(viewModel.header.logoDataUrl, '');
  assert.equal(viewModel.document.title, 'Factura');
  assert.equal(viewModel.document.number, 'FAT027/26');
  assert.equal(viewModel.document.viaLabel, 'Original');
  assert.equal(viewModel.flags.showWatermark, false);
  assert.equal(viewModel.footer.fiscalReference, 'lzoe-Processado por programa validado nº999/AGT/2026-KILSYSTEM');
  assert.equal(viewModel.footer.printedBy, 'Administrador');
  assert.equal(viewModel.items[0].lot, 'L01');
  assert.equal(viewModel.totals.totalInWords, 'Seis Mil Quatrocentos e Oitenta Kwanzas e Quarenta Centimos');
});
