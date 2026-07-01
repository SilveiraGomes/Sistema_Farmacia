import { DOCUMENT_STATUSES, DOCUMENT_TYPES, documentTypeLabels } from './documents.mjs';
import { getStoredBranding } from './branding.mjs';

const REFERENCE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function buildDocumentSettingsFromSnapshot(snapshot) {
  const identity = snapshot?.settings?.company?.identity?.value || {};
  const fiscal = snapshot?.settings?.documents?.fiscal?.value || {};
  // Logo is stored in localStorage (via branding.mjs), not in the DB snapshot
  const stored = getStoredBranding();
  return {
    branding: {
      pharmacyName: identity.pharmacyName || 'Sistema de Farmacia',
      logoDataUrl: stored.logoDataUrl || identity.logoDataUrl || '',
      companyNif: identity.taxId || '',
    },
    settings: {
      documentHeaderText: snapshot?.settings?.documents?.headerText?.value || identity.pharmacyName || 'Sistema de Farmacia',
      validationNumber: fiscal.validationNumber || '',
      softwareName: fiscal.softwareName || '',
      fiscalRegime: fiscal.fiscalRegime || '',
      showQrCode: fiscal.showQrCode !== false,
      showLotAndExpiry: false,
      showTotalInWords: fiscal.showTotalInWords !== false,
      bankAccounts: Array.isArray(fiscal.bankAccounts) ? fiscal.bankAccounts : [],
    },
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function createFiscalReferencePrefix(random = Math.random) {
  return Array.from({ length: 4 }, () =>
    REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]).join('');
}

export function buildFiscalReference({ prefix = createFiscalReferencePrefix(), validationNumber, softwareName }) {
  return `${prefix}-Processado por programa validado nº${validationNumber}-${softwareName}`;
}

export function calculateInvoiceA4Totals(document) {
  const subtotal = roundMoney(document.subtotal ?? document.items.reduce(
    (total, item) => total + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0),
    0,
  ));
  const discount = roundMoney(document.discount ?? document.items.reduce(
    (total, item) => total + (Number(item.discount) || 0),
    0,
  ));
  const tax = roundMoney(document.tax ?? document.items.reduce(
    (total, item) => total + (Number(item.taxValue) || 0),
    0,
  ));
  const retention = roundMoney(document.retention ?? 0);
  const total = roundMoney(document.total ?? subtotal - discount + tax - retention);
  const taxGroups = new Map();

  for (const item of document.items) {
    const rate = Number(item.taxRate) || 0;
    const key = String(rate);
    const current = taxGroups.get(key) || {
      designation: rate ? `IVA ${rate}%` : 'Isento',
      incidence: 0,
      taxRate: rate,
      taxValue: 0,
    };
    const lineTotal = roundMoney(item.total ?? (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0));
    current.incidence = roundMoney(current.incidence + lineTotal);
    current.taxValue = roundMoney(current.taxValue + (Number(item.taxValue) || 0));
    taxGroups.set(key, current);
  }

  return {
    subtotal,
    discount,
    tax,
    retention,
    total,
    taxSummary: Array.from(taxGroups.values()),
  };
}

const UNITS = ['', 'Um', 'Dois', 'Tres', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove'];
const TEENS = ['Dez', 'Onze', 'Doze', 'Treze', 'Catorze', 'Quinze', 'Dezasseis', 'Dezassete', 'Dezoito', 'Dezanove'];
const TENS = ['', '', 'Vinte', 'Trinta', 'Quarenta', 'Cinquenta', 'Sessenta', 'Setenta', 'Oitenta', 'Noventa'];
const HUNDREDS = ['', 'Cento', 'Duzentos', 'Trezentos', 'Quatrocentos', 'Quinhentos', 'Seiscentos', 'Setecentos', 'Oitocentos', 'Novecentos'];

function underThousandToWords(value) {
  if (value === 0) return '';
  if (value === 100) return 'Cem';
  if (value < 10) return UNITS[value];
  if (value < 20) return TEENS[value - 10];
  if (value < 100) {
    const ten = Math.floor(value / 10);
    const unit = value % 10;
    return unit ? `${TENS[ten]} e ${UNITS[unit]}` : TENS[ten];
  }

  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  return rest ? `${HUNDREDS[hundred]} e ${underThousandToWords(rest)}` : HUNDREDS[hundred];
}

function integerToWords(value) {
  if (value === 0) return 'Zero';

  const millions = Math.floor(value / 1000000);
  const thousands = Math.floor((value % 1000000) / 1000);
  const rest = value % 1000;
  const parts = [];

  if (millions) {
    parts.push(`${underThousandToWords(millions)} ${millions === 1 ? 'Milhao' : 'Milhoes'}`);
  }

  if (thousands) {
    parts.push(thousands === 1 ? 'Mil' : `${underThousandToWords(thousands)} Mil`);
  }

  if (rest) {
    parts.push(underThousandToWords(rest));
  }

  return parts.join(' ');
}

export function numberToPortugueseWords(value) {
  const amount = roundMoney(value);
  const kwanzas = Math.floor(amount);
  const cents = Math.round((amount - kwanzas) * 100);
  const kwanzaText = `${integerToWords(kwanzas)} ${kwanzas === 1 ? 'Kwanza' : 'Kwanzas'}`;
  return cents ? `${kwanzaText} e ${integerToWords(cents)} Centimos` : kwanzaText;
}

function getDocumentTitle(document) {
  if (document.type === DOCUMENT_TYPES.PROFORMA) return 'Proforma';
  return documentTypeLabels[document.type] || 'Factura';
}

export function buildInvoiceA4ViewModel({
  document,
  branding,
  settings,
  printedBy,
  printedAt = new Date(),
  referencePrefix = createFiscalReferencePrefix(),
}) {
  const totals = calculateInvoiceA4Totals(document);
  const isSecondCopy = Boolean(document.copyLabel);

  return {
    header: {
      documentHeaderText: settings.documentHeaderText,
      logoDataUrl: branding.logoDataUrl,
      companyNif: branding.companyNif || '',
    },
    document: {
      title: getDocumentTitle(document),
      number: document.number,
      status: document.status,
      viaLabel: isSecondCopy ? '2ª Via' : 'Original',
      copyLabel: document.copyLabel || '',
      issueDate: document.issueDate,
      dueDate: document.dueDate || '',
      currency: document.currency || 'AKZ',
      paymentCondition: document.paymentCondition || document.paymentMethod || '',
      proformaNotice: document.type === DOCUMENT_TYPES.PROFORMA ? 'Este documento nao serve de Factura' : '',
      isCancelled: document.status === DOCUMENT_STATUSES.CANCELLED,
    },
    client: {
      name: document.clientName || 'Consumidor final',
      taxId: document.clientTaxId || document.clientNif || '',
      phone: document.clientPhone || '',
      address: document.clientAddress || '',
    },
    items: document.items.map((item, index) => ({
      code: item.productId || String(index + 1).padStart(4, '0'),
      description: item.description,
      lot: settings.showLotAndExpiry ? item.lot || '' : '',
      expiryDate: settings.showLotAndExpiry ? item.expiryDate || '' : '',
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      discount: Number(item.discount) || 0,
      taxRate: Number(item.taxRate) || 0,
      total: Number(item.total) || 0,
    })),
    totals: {
      ...totals,
      totalInWords: settings.showTotalInWords ? numberToPortugueseWords(totals.total) : '',
    },
    settings: {
      showQrCode: settings.showQrCode,
      showLotAndExpiry: settings.showLotAndExpiry,
      bankAccounts: settings.bankAccounts,
      fiscalRegime: settings.fiscalRegime,
    },
    footer: {
      fiscalReference: buildFiscalReference({
        prefix: referencePrefix,
        validationNumber: settings.validationNumber,
        softwareName: settings.softwareName,
      }),
      printedBy,
      printedAt: printedAt.toISOString(),
    },
    flags: {
      showWatermark: false,
    },
  };
}
