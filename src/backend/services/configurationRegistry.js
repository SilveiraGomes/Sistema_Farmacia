const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const titleFromCode = (code) => code
  .split(/[_-]/)
  .filter(Boolean)
  .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(' ');

const catalogOptions = (codes, system) => codes.map((code, index) => ({
  code,
  name: titleFromCode(code),
  order: index,
  system,
}));

const editable = (...codes) => ({
  editable: true,
  options: catalogOptions(codes, false),
});

const technical = (...codes) => ({
  editable: false,
  options: catalogOptions(codes, true),
});

const SETTING_DEFINITIONS = deepFreeze({
  'company.identity': {
    group: 'company',
    type: 'object',
    defaultValue: {
      pharmacyName: 'KILSYSTEM PHARMACY',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoDataUrl: '',
    },
  },
  'documents.headerText': { group: 'documents', type: 'text', defaultValue: 'Sistema de Farmacia' },
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
    group: 'sales',
    type: 'catalog-code',
    catalog: 'payment_methods',
    defaultValue: 'dinheiro',
  },
  'sales.defaultTaxRate': {
    group: 'sales', type: 'number', min: 0, max: 100, defaultValue: 0,
  },
  'sales.maxDiscount': { group: 'sales', type: 'number', min: 0, defaultValue: 580.2 },
  'sales.rounding': {
    group: 'sales',
    type: 'enum',
    values: ['centimos', 'unidade'],
    defaultValue: 'centimos',
  },
  'sales.finalConsumerLabel': {
    group: 'sales', type: 'text', defaultValue: 'Consumidor final',
  },
  'stock.lowStockThreshold': { group: 'stock', type: 'number', min: 0, defaultValue: 25 },
  'stock.expiryAlertDays': { group: 'stock', type: 'number', min: 0, defaultValue: 30 },
  'alerts.dashboardEnabled': { group: 'alerts', type: 'boolean', defaultValue: true },
  'alerts.defaultMessage': { group: 'alerts', type: 'text', defaultValue: '' },
  'alerts.sessionTimeoutMinutes': { group: 'alerts', type: 'number', min: 0, defaultValue: 30 },
  'alerts.operationalAlerts': {
    group: 'alerts',
    type: 'object',
    defaultValue: { cashDiffShift: true, cashDiffDay: true, longShift: true, longDay: true },
  },
  'alerts.systemAlerts': {
    group: 'alerts',
    type: 'object',
    defaultValue: { backupFail: true, restoreFail: true, sheetsSyncFail: true, dbCorrupt: true, integrity: true, diskSpace: true },
  },
  'alerts.securityAlerts': {
    group: 'alerts',
    type: 'object',
    defaultValue: { loginAttempts: true, criticalOps: true, dataDelete: true, systemReset: true },
  },
  'backup.options': {
    group: 'backup',
    type: 'object',
    defaultValue: { retentionCount: 7, folderPath: '' },
  },
  'backup.auto': {
    group: 'backup',
    type: 'object',
    defaultValue: { enabled: true, frequency: '24h', time: '23:00', onClose: true, onRestore: true, onReset: true },
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
    defaultValue: {
      previewBeforePrint: true,
      copies: 1,
      printerName: '',       // printer.name from getPrintersAsync()
      showDialog: false,     // show Windows print dialog even in preview mode
    },
  },
  'appearance.startFullscreen': {
    group: 'appearance',
    type: 'boolean',
    defaultValue: true,
  },
});

const CATALOG_DEFINITIONS = deepFreeze({
  payment_methods: editable('dinheiro', 'tpa', 'transferencia', 'credito'),
  operation_shifts: editable('manha', 'tarde', 'noite'),
  expense_categories: editable(
    'infraestrutura',
    'recursos-humanos',
    'servicos',
    'fornecedores',
    'marketing',
    'outro',
  ),
  revenue_categories: editable('servico', 'rendimento-extra', 'ajuste-caixa', 'outro'),
  loss_reasons: editable(
    'expiracao',
    'danificado',
    'furto',
    'consumo-interno',
    'obsolescencia',
    'outro',
  ),
  stock_units: editable('unidade', 'caixa', 'frasco', 'blister'),
  stock_locations: editable('loja', 'armazem'),
  product_locations: editable('prateleira-a1', 'prateleira-a2', 'gaveta-g1', 'gaveta-g2', 'zona-principal'),
  client_statuses: technical('activo', 'pendente', 'inactivo'),
  document_types: technical('factura', 'factura_recibo', 'recibo', 'proforma', 'credito', 'nota-credito'),
  document_statuses: technical('emitido', 'pago', 'pendente', 'anulado', 'convertido'),
  financial_entry_types: technical('expense', 'revenue', 'loss'),
  financial_statuses: technical('pendente', 'paga', 'cancelada'),
  operation_statuses: technical('aberto', 'fechado', 'bloqueado'),
});

const invalidType = (key) => {
  throw new TypeError(`Tipo de valor inválido para a configuração "${key}".`);
};

const invalidObject = (key) => {
  throw new TypeError(`Valor de objeto inválido para a configuração "${key}".`);
};

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const copyJsonValue = (value, key, ancestors = new WeakSet()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalidObject(key);
    return value;
  }
  if (!value || typeof value !== 'object') invalidObject(key);
  if (ancestors.has(value)) invalidObject(key);

  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    const hasUnsupportedKey = ownKeys.some((ownKey) => {
      if (ownKey === 'length') return false;
      if (typeof ownKey !== 'string' || !/^\d+$/.test(ownKey)) return true;
      return Number(ownKey) >= value.length;
    });
    if (hasUnsupportedKey) invalidObject(key);

    ancestors.add(value);
    try {
      return Array.from({ length: value.length }, (_, index) => {
        if (!Object.prototype.hasOwnProperty.call(value, index)) invalidObject(key);
        return copyJsonValue(value[index], key, ancestors);
      });
    } finally {
      ancestors.delete(value);
    }
  }

  if (!isPlainObject(value)) invalidObject(key);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((ownKey) => typeof ownKey !== 'string'
    || !Object.prototype.propertyIsEnumerable.call(value, ownKey))) {
    invalidObject(key);
  }

  ancestors.add(value);
  try {
    return Object.fromEntries(ownKeys.map((ownKey) => [
      ownKey,
      copyJsonValue(value[ownKey], key, ancestors),
    ]));
  } finally {
    ancestors.delete(value);
  }
};

const validateSettingValue = (key, value) => {
  const definition = SETTING_DEFINITIONS[key];
  if (!definition) throw new Error(`Configuração desconhecida: "${key}".`);

  switch (definition.type) {
    case 'text':
      if (typeof value !== 'string') invalidType(key);
      return value.trim();

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) invalidType(key);
      if ((definition.min !== undefined && value < definition.min)
        || (definition.max !== undefined && value > definition.max)) {
        throw new RangeError(`Valor fora do limite permitido para a configuração "${key}".`);
      }
      return value;

    case 'boolean':
      if (typeof value !== 'boolean') invalidType(key);
      return value;

    case 'object':
      if (!isPlainObject(value)) invalidObject(key);
      return copyJsonValue(value, key);

    case 'enum': {
      if (typeof value !== 'string') invalidType(key);
      const normalized = value.trim();
      if (!definition.values.includes(normalized)) {
        throw new Error(`Opção inválida para a configuração "${key}".`);
      }
      return normalized;
    }

    case 'catalog-code': {
      if (typeof value !== 'string') invalidType(key);
      const normalized = value.trim();
      const catalog = CATALOG_DEFINITIONS[definition.catalog];
      if (!catalog.options.some((option) => option.code === normalized)) {
        throw new Error(`Código de catálogo inválido para a configuração "${key}".`);
      }
      return normalized;
    }

    default:
      throw new Error(`Tipo de configuração não suportado: "${definition.type}".`);
  }
};

module.exports = {
  SETTING_DEFINITIONS,
  CATALOG_DEFINITIONS,
  validateSettingValue,
};
