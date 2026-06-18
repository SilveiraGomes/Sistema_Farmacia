import {
  buildClientMetrics,
  buildFinancialOverview,
  buildReportsOverview,
  buildStockMetrics,
  clients as defaultClients,
  financeExpenses,
  financeLosses,
  financeOtherRevenues,
  financeProductSales,
  invoices as defaultInvoices,
  stockItems,
} from './pharmacyData.mjs';
import {
  documentStatusLabels,
  documentTypeLabels,
  documents as defaultDocuments,
  filterDocuments,
} from './documents.mjs';

export const CRITICAL_STOCK_STATUSES = Object.freeze(['Baixo estoque', 'Sem estoque']);

export const REPORT_CATALOG = Object.freeze([
  {
    id: 'geral',
    title: 'Geral',
    reports: [
      { id: 'resumo-executivo', title: 'Resumo executivo', mode: 'summary' },
      { id: 'relatorio-diario', title: 'Relatorio diario', mode: 'table' },
    ],
  },
  {
    id: 'vendas',
    title: 'Vendas',
    reports: [
      { id: 'vendas-detalhadas', title: 'Vendas detalhadas', mode: 'table' },
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    reports: [
      { id: 'demonstrativo-financeiro', title: 'Demonstrativo financeiro', mode: 'summary' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    reports: [
      { id: 'stock-baixo', title: 'Stock baixo', mode: 'table' },
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    reports: [
      { id: 'clientes-credito-aberto', title: 'Clientes com credito aberto', mode: 'table' },
    ],
  },
  {
    id: 'documentos',
    title: 'Documentos',
    reports: [
      { id: 'documentos-emitidos', title: 'Documentos emitidos', mode: 'table' },
    ],
  },
  {
    id: 'operacao',
    title: 'Operacao',
    reports: [
      { id: 'estado-operacional', title: 'Estado operacional', mode: 'status' },
    ],
  },
]);

const REPORT_LOOKUP = new Map(
  REPORT_CATALOG.flatMap((group) =>
    group.reports.map((report) => [report.id, { ...report, groupId: group.id }]),
  ),
);

export function buildReportData(reportId, data = {}, filters = {}) {
  const definition = REPORT_LOOKUP.get(reportId) ?? REPORT_LOOKUP.get('resumo-executivo');
  const normalizedFilters = normalizeReportFilters(filters);

  const builders = {
    'resumo-executivo': buildExecutiveSummaryReport,
    'relatorio-diario': buildDailyReport,
    'vendas-detalhadas': buildSalesDetailReport,
    'demonstrativo-financeiro': buildFinancialStatementReport,
    'stock-baixo': buildLowStockReport,
    'clientes-credito-aberto': buildClientsOpenCreditReport,
    'documentos-emitidos': buildIssuedDocumentsReport,
    'estado-operacional': buildOperationStateReport,
  };

  return builders[definition.id](definition, normalizeData(data), normalizedFilters);
}

export function normalizeReportFilters(filters = {}) {
  const startDate = normalizeDateKey(filters.startDate);
  const endDate = normalizeDateKey(filters.endDate);

  if (startDate && endDate && startDate > endDate) {
    return { ...filters, startDate: endDate, endDate: startDate };
  }

  return {
    ...filters,
    startDate: startDate || filters.startDate,
    endDate: endDate || filters.endDate,
  };
}

export function buildReportExportRows(report) {
  const columns = report.columns ?? [];

  return (report.rows ?? []).map((row) =>
    columns.reduce((output, column) => {
      output[column.label] = serializeCellValue(row[column.key]);
      return output;
    }, {}));
}

export function buildReportCsv(report) {
  const columns = report.columns ?? [];
  const header = columns.map((column) => escapeCsvCell(column.label)).join(';');
  const body = (report.rows ?? []).map((row) =>
    columns.map((column) => escapeCsvCell(serializeCellValue(row[column.key]))).join(';'));

  return `\uFEFF${[header, ...body].join('\n')}`;
}

function buildExecutiveSummaryReport(definition, data, filters) {
  const referenceDate = resolveReferenceDate(filters);
  const overview = buildReportsOverview({
    ...data,
    ...filterFinancialRows(data, filters),
  }, { referenceDate });
  const rows = [
    { metric: 'Receita de vendas', value: overview.sales.totalRevenue },
    { metric: 'Lucro bruto', value: overview.finance.grossProfit },
    { metric: 'Lucro liquido', value: overview.finance.netProfit },
    { metric: 'Credito em aberto', value: overview.clients.openCredit },
    { metric: 'Produtos sem stock', value: overview.stock.outOfStock },
  ];

  return makeReport(definition, filters, {
    kpis: [
      { key: 'sales', label: 'Vendas', value: overview.sales.totalRevenue },
      { key: 'transactions', label: 'Unidades vendidas', value: overview.sales.totalQuantity },
      { key: 'netProfit', label: 'Lucro liquido', value: overview.finance.netProfit },
      { key: 'openCredit', label: 'Credito em aberto', value: overview.clients.openCredit },
    ],
    columns: [
      { key: 'metric', label: 'Indicador' },
      { key: 'value', label: 'Valor' },
    ],
    rows,
    totals: {
      ...overview.finance,
      totalRevenue: overview.sales.totalRevenue,
      openCredit: overview.clients.openCredit,
    },
  });
}

function buildDailyReport(definition, data, filters) {
  const rows = filterSales(data.sales, filters);

  return makeReport(definition, filters, {
    kpis: salesKpis(rows),
    columns: salesColumns(),
    rows,
    totals: salesTotals(rows),
  });
}

function buildSalesDetailReport(definition, data, filters) {
  const rows = filterSales(data.sales, filters);

  return makeReport(definition, filters, {
    kpis: salesKpis(rows),
    columns: salesColumns(),
    rows,
    totals: salesTotals(rows),
  });
}

function buildFinancialStatementReport(definition, data, filters) {
  const financialRows = filterFinancialRows(data, filters);
  const overviewRows = normalizeFinancialRowsForOverview(financialRows, filters);
  const overview = buildFinancialOverview({
    sales: overviewRows.sales,
    losses: overviewRows.losses,
    expenses: overviewRows.expenses,
    otherRevenues: overviewRows.otherRevenues,
  }, {
    period: filters.shift ? 'shift' : 'month',
    referenceDate: resolveFinancialOverviewReferenceDate(filters),
    shift: filters.shift ?? 'Todos',
  });
  const rows = [
    { metric: 'Receita de produtos', value: overview.totals.productRevenue },
    { metric: 'Outras receitas', value: overview.totals.otherRevenue },
    { metric: 'Custo dos produtos', value: overview.totals.productCost },
    { metric: 'Perdas', value: overview.totals.losses },
    { metric: 'Despesas pagas', value: overview.totals.expenses },
    { metric: 'Lucro liquido', value: overview.totals.netProfit },
  ];

  return makeReport(definition, filters, {
    kpis: [
      { key: 'revenue', label: 'Receita', value: overview.totals.revenue },
      { key: 'grossProfit', label: 'Lucro bruto', value: overview.totals.grossProfit },
      { key: 'expenses', label: 'Despesas', value: overview.totals.expenses },
      { key: 'netProfit', label: 'Lucro liquido', value: overview.totals.netProfit },
    ],
    columns: [
      { key: 'metric', label: 'Indicador' },
      { key: 'value', label: 'Valor' },
    ],
    rows,
    totals: overview.totals,
  });
}

function buildLowStockReport(definition, data, filters) {
  const rows = data.stockRows.filter((item) => isCriticalStockStatus(item.status));
  const metrics = buildStockMetrics(data.stockRows);

  return makeReport(definition, filters, {
    kpis: [
      { key: 'lowStock', label: 'Baixo estoque', value: metrics.lowStock },
      { key: 'outOfStock', label: 'Sem estoque', value: metrics.outOfStock },
    ],
    columns: [
      { key: 'id', label: 'Codigo' },
      { key: 'name', label: 'Produto' },
      { key: 'category', label: 'Categoria' },
      { key: 'quantity', label: 'Quantidade' },
      { key: 'status', label: 'Estado' },
      { key: 'location', label: 'Localizacao' },
    ],
    rows,
    totals: {
      lowStock: metrics.lowStock,
      outOfStock: metrics.outOfStock,
      totalProducts: metrics.totalProducts,
    },
  });
}

function buildClientsOpenCreditReport(definition, data, filters) {
  const rows = data.clients.filter((client) => Number(client.openCredit ?? 0) > 0);
  const metrics = buildClientMetrics(data.clients, resolveReferenceDate(filters));

  return makeReport(definition, filters, {
    kpis: [
      { key: 'clients', label: 'Clientes', value: rows.length },
      { key: 'openCredit', label: 'Credito em aberto', value: metrics.openCredit },
    ],
    columns: [
      { key: 'id', label: 'Codigo' },
      { key: 'name', label: 'Cliente' },
      { key: 'phone', label: 'Telefone' },
      { key: 'status', label: 'Estado' },
      { key: 'openCredit', label: 'Credito' },
    ],
    rows,
    totals: {
      clients: rows.length,
      openCredit: rows.reduce((sum, client) => roundMoney(sum + Number(client.openCredit ?? 0)), 0),
    },
  });
}

function buildIssuedDocumentsReport(definition, data, filters) {
  const rows = filterDocuments(data.documents, {
    dateFrom: filters.startDate,
    dateTo: filters.endDate,
    type: filters.type,
    status: filters.status,
    query: filters.query,
  }).map((document) => ({
    ...document,
    typeLabel: documentTypeLabels[document.type] ?? document.type,
    statusLabel: documentStatusLabels[document.status] ?? document.status,
  }));
  const validRows = rows.filter((document) => document.status !== 'ANULADO');

  return makeReport(definition, filters, {
    kpis: [
      { key: 'documents', label: 'Documentos', value: rows.length },
      { key: 'total', label: 'Total emitido', value: sumBy(validRows, 'total') },
    ],
    columns: [
      { key: 'issueDate', label: 'Data' },
      { key: 'number', label: 'Numero' },
      { key: 'typeLabel', label: 'Tipo' },
      { key: 'clientName', label: 'Cliente' },
      { key: 'statusLabel', label: 'Estado' },
      { key: 'total', label: 'Total' },
    ],
    rows,
    totals: {
      documents: rows.length,
      total: sumBy(validRows, 'total'),
    },
  });
}

function buildOperationStateReport(definition, data, filters) {
  const state = data.operationState ?? {};
  const hasOpenDay = Boolean(state.day);
  const hasOpenShift = Boolean(state.shift);
  const status = !hasOpenDay ? 'Fechado' : state.canOperate && hasOpenShift ? 'Aberto' : 'Bloqueado';
  const rows = [
    {
      status,
      operationalDate: state.day?.data_operacional ?? '',
      dayOpeningBalance: Number(state.day?.saldo_inicial ?? 0),
      shift: state.shift?.nome ?? '',
      shiftOpeningBalance: Number(state.shift?.saldo_inicial ?? 0),
      canOperate: Boolean(state.canOperate),
      message: state.message ?? '',
    },
  ];

  return makeReport(definition, filters, {
    kpis: [
      { key: 'dayOpen', label: 'Dia aberto', value: hasOpenDay },
      { key: 'shiftOpen', label: 'Turno aberto', value: hasOpenShift },
      { key: 'canOperate', label: 'Pode operar', value: Boolean(state.canOperate) },
    ],
    columns: [
      { key: 'status', label: 'Estado' },
      { key: 'operationalDate', label: 'Data operacional' },
      { key: 'shift', label: 'Turno' },
      { key: 'canOperate', label: 'Pode operar' },
      { key: 'message', label: 'Mensagem' },
    ],
    rows,
    totals: {
      openDays: hasOpenDay ? 1 : 0,
      openShifts: hasOpenShift ? 1 : 0,
    },
  });
}

function makeReport(definition, filters, parts = {}) {
  return {
    id: definition.id,
    groupId: definition.groupId,
    title: definition.title,
    mode: definition.mode,
    filters: { ...filters },
    kpis: parts.kpis ?? [],
    columns: parts.columns ?? [],
    rows: parts.rows ?? [],
    totals: parts.totals ?? {},
    comparison: parts.comparison ?? null,
    generatedAt: filters.generatedAt ?? `${resolveReferenceDate(filters)}T00:00:00.000Z`,
  };
}

function normalizeData(data) {
  return {
    clients: data.clients ?? defaultClients,
    stockRows: data.stockRows ?? stockItems,
    sales: data.sales ?? financeProductSales,
    losses: data.losses ?? financeLosses,
    expenses: data.expenses ?? financeExpenses,
    otherRevenues: data.otherRevenues ?? financeOtherRevenues,
    documents: data.documents ?? defaultDocuments,
    invoices: data.invoices ?? defaultInvoices,
    operationState: data.operationState ?? null,
  };
}

function filterSales(sales, filters) {
  return sales.filter((row) => (
    matchesDateRange(row.date, filters.startDate, filters.endDate) &&
    matchesFilter(row.shift, filters.shift) &&
    matchesFilter(row.category, filters.category) &&
    matchesFilter(row.paymentMethod, filters.paymentMethod)
  ));
}

function salesColumns() {
  return [
    { key: 'date', label: 'Data' },
    { key: 'shift', label: 'Turno' },
    { key: 'product', label: 'Produto' },
    { key: 'category', label: 'Categoria' },
    { key: 'quantity', label: 'Quantidade' },
    { key: 'paymentMethod', label: 'Pagamento' },
    { key: 'revenue', label: 'Receita' },
  ];
}

function salesKpis(rows) {
  const totals = salesTotals(rows);

  return [
    { key: 'revenue', label: 'Receita', value: totals.revenue },
    { key: 'quantity', label: 'Quantidade', value: totals.quantity },
    { key: 'transactions', label: 'Transaccoes', value: rows.length },
  ];
}

function salesTotals(rows) {
  return {
    revenue: sumBy(rows, 'revenue'),
    cost: sumBy(rows, 'cost'),
    quantity: rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
  };
}

function resolveReferenceDate(filters) {
  return filters.referenceDate ?? filters.endDate ?? filters.startDate ?? todayLocalDateKey();
}

function matchesDateRange(date, startDate, endDate) {
  const dateKey = normalizeDateKey(date);
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

function matchesFilter(value, filterValue) {
  return !filterValue || filterValue === 'Todos' || value === filterValue;
}

function filterFinancialRows(data, filters) {
  return {
    sales: filterSales(data.sales, filters),
    losses: data.losses.filter((row) => (
      matchesDateRange(row.date, filters.startDate, filters.endDate) &&
      matchesFilter(row.shift, filters.shift)
    )),
    expenses: data.expenses.filter((row) => matchesDateRange(row.date, filters.startDate, filters.endDate)),
    otherRevenues: data.otherRevenues.filter((row) => matchesDateRange(row.date, filters.startDate, filters.endDate)),
  };
}

function normalizeFinancialRowsForOverview(financialRows, filters) {
  if (!filters.startDate && !filters.endDate) return financialRows;

  const referenceDate = resolveFinancialOverviewReferenceDate(filters);
  const normalizeDate = (row) => ({ ...row, date: referenceDate });

  return {
    sales: financialRows.sales.map(normalizeDate),
    losses: financialRows.losses.map(normalizeDate),
    expenses: financialRows.expenses.map(normalizeDate),
    otherRevenues: financialRows.otherRevenues.map(normalizeDate),
  };
}

function resolveFinancialOverviewReferenceDate(filters) {
  const referenceDate = resolveReferenceDate(filters);
  if (filters.shift || (!filters.startDate && !filters.endDate)) return referenceDate;

  return `${referenceDate.slice(0, 7)}-15`;
}

function isCriticalStockStatus(status) {
  return CRITICAL_STOCK_STATUSES.includes(status);
}

function sumBy(rows, field) {
  return roundMoney(rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeDateKey(value) {
  return String(value ?? '').slice(0, 10);
}

function todayLocalDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function serializeCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return String(value).replace(/\r?\n/g, ' ');
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (!/[;"\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
