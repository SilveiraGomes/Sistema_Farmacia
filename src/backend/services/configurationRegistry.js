const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
};

const titleFromCode = (code) => code
  .split(/[_-]/)
  .filter(Boolean)
  .map((word) => word.toUpperCase() === 'TPA'
    ? 'TPA'
    : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(' ');

const catalogOptions = (codes, system) => codes.map((code, index) => ({
  code,
  name: titleFromCode(code),
  order: index + 1,
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
    type: 'object',
    default: {
      pharmacyName: 'Sistema de Farmacia',
      taxId: '',
      address: '',
      phone: '',
      email: '',
      logoDataUrl: '',
    },
  },
  'documents.headerText': { type: 'text', default: 'Sistema de Farmacia' },
  'documents.currency': { type: 'text', default: 'AKZ' },
  'documents.fiscal': {
    type: 'object',
    default: {
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
    type: 'catalog-code',
    catalog: 'payment_methods',
    default: 'dinheiro',
  },
  'sales.defaultTaxRate': { type: 'number', min: 0, max: 100, default: 0 },
  'sales.maxDiscount': { type: 'number', min: 0, default: 580.2 },
  'sales.rounding': {
    type: 'enum',
    values: ['centimos', 'unidade'],
    default: 'centimos',
  },
  'sales.finalConsumerLabel': { type: 'text', default: 'Consumidor final' },
  'stock.lowStockThreshold': { type: 'number', min: 0, default: 25 },
  'stock.expiryAlertDays': { type: 'number', min: 0, default: 30 },
  'alerts.dashboardEnabled': { type: 'boolean', default: true },
  'alerts.defaultMessage': { type: 'text', default: '' },
  'backup.options': {
    type: 'object',
    default: { frequency: 'manual', folderPath: '', retentionCount: 7 },
  },
  'migration.legacyLocalStorageVersion': { type: 'number', min: 0, default: 0 },
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
  client_statuses: technical('activo', 'pendente', 'inactivo'),
  document_types: technical('factura', 'recibo', 'proforma', 'nota-credito'),
  document_statuses: technical('emitido', 'pago', 'pendente', 'anulado', 'convertido'),
  financial_entry_types: technical('expense', 'revenue', 'loss'),
  financial_statuses: technical('pendente', 'paga', 'cancelada'),
  operation_statuses: technical('aberto', 'fechado', 'bloqueado'),
});

const copyValue = (value) => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  }
  return value;
};

const invalidType = (key) => {
  throw new TypeError(`Tipo de valor inválido para a configuração "${key}".`);
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
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalidType(key);
      return copyValue(value);

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
