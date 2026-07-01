export const CATALOG_KEYS = Object.freeze({
  PAYMENT_METHODS: "payment_methods",
  OPERATION_SHIFTS: "operation_shifts",
  EXPENSE_CATEGORIES: "expense_categories",
  REVENUE_CATEGORIES: "revenue_categories",
  LOSS_REASONS: "loss_reasons",
  STOCK_UNITS: "stock_units",
  STOCK_LOCATIONS: "stock_locations",
  PRODUCT_LOCATIONS: "product_locations",
  CLIENT_STATUSES: "client_statuses",
  DOCUMENT_TYPES: "document_types",
  DOCUMENT_STATUSES: "document_statuses",
  FINANCIAL_ENTRY_TYPES: "financial_entry_types",
  FINANCIAL_STATUSES: "financial_statuses",
  OPERATION_STATUSES: "operation_statuses",
});

const CATALOG_SEEDS = Object.freeze({
  [CATALOG_KEYS.PAYMENT_METHODS]: [
    "dinheiro",
    "tpa",
    "transferencia",
    "credito",
  ],
  [CATALOG_KEYS.OPERATION_SHIFTS]: ["manha", "tarde", "noite"],
  [CATALOG_KEYS.EXPENSE_CATEGORIES]: [
    "infraestrutura",
    "recursos-humanos",
    "servicos",
    "fornecedores",
    "marketing",
    "outro",
  ],
  [CATALOG_KEYS.REVENUE_CATEGORIES]: [
    "servico",
    "rendimento-extra",
    "ajuste-caixa",
    "outro",
  ],
  [CATALOG_KEYS.LOSS_REASONS]: [
    "expiracao",
    "danificado",
    "furto",
    "consumo-interno",
    "obsolescencia",
    "outro",
  ],
  [CATALOG_KEYS.STOCK_UNITS]: ["unidade", "caixa", "frasco", "blister"],
  [CATALOG_KEYS.STOCK_LOCATIONS]: ["loja", "armazem"],
  [CATALOG_KEYS.PRODUCT_LOCATIONS]: ["prateleira-a1", "prateleira-a2", "gaveta-g1", "gaveta-g2", "zona-principal"],
  [CATALOG_KEYS.CLIENT_STATUSES]: ["activo", "pendente", "inactivo"],
  [CATALOG_KEYS.DOCUMENT_TYPES]: [
    "factura",
    "recibo",
    "proforma",
    "nota-credito",
  ],
  [CATALOG_KEYS.DOCUMENT_STATUSES]: [
    "emitido",
    "pago",
    "pendente",
    "anulado",
    "convertido",
  ],
  [CATALOG_KEYS.FINANCIAL_ENTRY_TYPES]: ["expense", "revenue", "loss"],
  [CATALOG_KEYS.FINANCIAL_STATUSES]: ["pendente", "paga", "cancelada"],
  [CATALOG_KEYS.OPERATION_STATUSES]: ["aberto", "fechado", "bloqueado"],
});

const EDITABLE_CATALOGS = new Set([
  CATALOG_KEYS.PAYMENT_METHODS,
  CATALOG_KEYS.OPERATION_SHIFTS,
  CATALOG_KEYS.EXPENSE_CATEGORIES,
  CATALOG_KEYS.REVENUE_CATEGORIES,
  CATALOG_KEYS.LOSS_REASONS,
  CATALOG_KEYS.STOCK_UNITS,
  CATALOG_KEYS.STOCK_LOCATIONS,
  CATALOG_KEYS.PRODUCT_LOCATIONS,
]);

const SETTING_DEFAULTS = Object.freeze({
  company: {
    identity: {
      pharmacyName: "KILSYSTEM PHARMACY",
      taxId: "",
      address: "",
      phone: "",
      email: "",
      logoDataUrl: "",
    },
  },
  documents: {
    headerText: "Sistema de Farmacia",
    currency: "AKZ",
    fiscal: {
      validationNumber: "999/AGT/2026",
      softwareName: "KILSYSTEM",
      fiscalRegime: "Regime: Exclusao",
      showQrCode: true,
      showTotalInWords: true,
      bankAccounts: [],
      series: {},
    },
    printOptions: { previewBeforePrint: true, copies: 1 },
  },
  sales: {
    defaultPaymentMethod: "dinheiro",
    defaultTaxRate: 0,
    maxDiscount: 580.2,
    rounding: "centimos",
    finalConsumerLabel: "Consumidor final",
  },
  stock: { lowStockThreshold: 25, expiryAlertDays: 30 },
  alerts: { dashboardEnabled: true, defaultMessage: "" },
  backup: {
    options: { frequency: "manual", folderPath: "", retentionCount: 7 },
  },
  migration: { legacyLocalStorageVersion: 0 },
  reports: {
    googleSheets: {
      syncEnabled: true,
      syncTime: "21:00",
      reportTypes: ["venda_turno", "venda_dia", "financeiro", "estoque"],
      retentionDays: 90,
      spreadsheetId: "",
      credentials: "",
    },
  },
});

const SETTING_SCHEMAS = Object.freeze({
  "company.identity": { group: "company", type: "object" },
  "documents.headerText": { group: "documents", type: "text" },
  "documents.currency": { group: "documents", type: "text" },
  "documents.fiscal": { group: "documents", type: "object" },
  "sales.defaultPaymentMethod": {
    group: "sales",
    type: "catalog-code",
    catalog: CATALOG_KEYS.PAYMENT_METHODS,
  },
  "sales.defaultTaxRate": { group: "sales", type: "number", min: 0, max: 100 },
  "sales.maxDiscount": { group: "sales", type: "number", min: 0 },
  "sales.rounding": {
    group: "sales",
    type: "enum",
    values: ["centimos", "unidade"],
  },
  "sales.finalConsumerLabel": { group: "sales", type: "text" },
  "stock.lowStockThreshold": { group: "stock", type: "number", min: 0 },
  "stock.expiryAlertDays": { group: "stock", type: "number", min: 0 },
  "alerts.dashboardEnabled": { group: "alerts", type: "boolean" },
  "alerts.defaultMessage": { group: "alerts", type: "text" },
  "backup.options": { group: "backup", type: "object" },
  "migration.legacyLocalStorageVersion": {
    group: "migration",
    type: "number",
    min: 0,
  },
  "reports.googleSheets": { group: "reports", type: "object" },
  "documents.printOptions": { group: "documents", type: "object" },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function titleFromCode(code) {
  return code
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function createSafeDefaultSnapshot() {
  const settings = {};
  const settingDefinitions = {};

  for (const [group, groupSettings] of Object.entries(SETTING_DEFAULTS)) {
    settings[group] = {};
    for (const [name, defaultValue] of Object.entries(groupSettings)) {
      const key = `${group}.${name}`;
      settings[group][name] = {
        key,
        value: clone(defaultValue),
        version: 0,
        updatedAt: null,
        readable: false,
      };
      settingDefinitions[key] = {
        ...clone(SETTING_SCHEMAS[key]),
        defaultValue: clone(defaultValue),
      };
    }
  }

  const catalogs = {};
  const catalogDefinitions = {};
  for (const [catalogKey, codes] of Object.entries(CATALOG_SEEDS)) {
    const editable = EDITABLE_CATALOGS.has(catalogKey);
    catalogs[catalogKey] = codes.map((code, order) => ({
      id: null,
      code,
      name: titleFromCode(code),
      order,
      active: true,
      system: !editable,
      metadata: {},
      metadataReadable: true,
      version: 0,
    }));
    catalogDefinitions[catalogKey] = { editable, system: !editable };
  }

  return {
    settings,
    catalogs,
    definitions: { settings: settingDefinitions, catalogs: catalogDefinitions },
    migrations: { legacyLocalStoragePending: true },
  };
}

const catalogOrder = (left, right) =>
  (Number(left.order) || 0) - (Number(right.order) || 0) ||
  (Number(left.id) || 0) - (Number(right.id) || 0) ||
  String(left.name || "").localeCompare(String(right.name || ""), "pt") ||
  String(left.code || "").localeCompare(String(right.code || ""), "pt");

const nameOrder = (left, right) =>
  String(left.name || "").localeCompare(String(right.name || ""), "pt") ||
  catalogOrder(left, right);

export function filterCatalogOptions(
  snapshot,
  catalogKey,
  {
    includeInactive = false,
    selectedCode = "",
    includeEmpty = false,
    emptyLabel = "Selecionar",
    sort = "catalog",
  } = {},
) {
  const options = snapshot?.catalogs?.[catalogKey];
  if (!Array.isArray(options))
    return includeEmpty ? [{ code: "", name: emptyLabel, active: true }] : [];

  const comparator =
    typeof sort === "function"
      ? sort
      : sort === "name"
        ? nameOrder
        : catalogOrder;

  const includedCodes = new Set();
  const filtered = [...options].sort(comparator).filter((option) => {
    if (
      !option ||
      typeof option.code !== "string" ||
      includedCodes.has(option.code)
    )
      return false;
    if (!includeInactive && !option.active && option.code !== selectedCode)
      return false;
    includedCodes.add(option.code);
    return true;
  });

  if (includeEmpty && !includedCodes.has("")) {
    filtered.unshift({
      code: "",
      name: String(emptyLabel || ""),
      active: true,
      system: true,
    });
  }
  return filtered;
}
