# Gerador de Relatorios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Reports center that generates operational, sales, finance, stock, clients, documents, daily, and comparative reports with A4 preview, print/PDF flow, and Excel-compatible CSV export.

**Architecture:** Add a pure report engine in `src/data/reports.mjs` so data preparation stays independent from React and can later be backed by SQLite. Replace `Relatorios.jsx` with a catalog-driven UI and add `ReportA4.jsx` for printable previews that reuse the approved invoice A4 visual language. Keep export as CSV compatible with Excel in this phase.

**Tech Stack:** React 19, Vite, Node test runner, localStorage branding/settings helpers, CSS print media, browser Blob download for CSV.

---

## File Structure

- Create `src/data/reports.mjs`
  - Owns `REPORT_CATALOG`, report builders, daily consolidation, date comparison, export row shaping, and CSV serialization.
  - No React imports.
- Create `tests/reports.test.mjs`
  - Tests catalog, report builders, filters, daily report, comparison report, export rows, and CSV escaping.
- Create `src/components/ReportA4.jsx`
  - Renders printable A4 report preview with company header, document box, applied filters, KPIs, comparison section, table, and footer.
- Modify `src/components/Relatorios.jsx`
  - Uses `src/data/reports.mjs`, permissions from `useAuth`, branding/settings helpers, and `ReportA4`.
  - Provides catalog, filters, simple/daily/comparative modes, preview, print/PDF, and CSV download.
- Modify `src/assets/tailwind.css`
  - Adds report center layout, report catalog, advanced filter controls, comparison chips, export toolbar, report A4 page, and print scope.
- Regenerate `src/assets/output.css`
  - Run `npm run build:tailwind`.
- Create or modify `tests/reportUiSource.test.mjs`
  - Source-level tests for `Relatorios.jsx`, `ReportA4.jsx`, and CSS selectors.

---

### Task 1: Pure Report Catalog and Standard Report Builder

**Files:**
- Create: `tests/reports.test.mjs`
- Create: `src/data/reports.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/reports.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORT_CATALOG,
  buildReportData,
} from '../src/data/reports.mjs';
import {
  clients,
  financeExpenses,
  financeLosses,
  financeProductSales,
  invoices,
  stockItems,
} from '../src/data/pharmacyData.mjs';
import { documents } from '../src/data/documents.mjs';

const reportData = {
  clients,
  stockRows: stockItems,
  sales: financeProductSales,
  losses: financeLosses,
  expenses: financeExpenses,
  documents,
  invoices,
};

test('REPORT_CATALOG exposes all required report groups', () => {
  assert.deepEqual(REPORT_CATALOG.map((group) => group.id), [
    'geral',
    'vendas',
    'financeiro',
    'stock',
    'clientes',
    'documentos',
    'operacao',
  ]);

  const reportIds = REPORT_CATALOG.flatMap((group) => group.reports.map((report) => report.id));
  assert.ok(reportIds.includes('resumo-executivo'));
  assert.ok(reportIds.includes('relatorio-diario'));
  assert.ok(reportIds.includes('diferenca-entre-datas'));
  assert.ok(reportIds.includes('vendas-detalhadas'));
  assert.ok(reportIds.includes('documentos-emitidos'));
});

test('buildReportData falls back to resumo-executivo for unknown reports', () => {
  const report = buildReportData('nao-existe', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-15',
  });

  assert.equal(report.id, 'resumo-executivo');
  assert.equal(report.title, 'Resumo executivo');
  assert.ok(report.kpis.length >= 4);
  assert.ok(report.rows.length >= 4);
});

test('buildReportData generates a sales detail report filtered by period and payment method', () => {
  const report = buildReportData('vendas-detalhadas', reportData, {
    startDate: '2026-06-15',
    endDate: '2026-06-15',
    paymentMethod: 'TPA',
  });

  assert.equal(report.id, 'vendas-detalhadas');
  assert.equal(report.groupId, 'vendas');
  assert.deepEqual(report.columns.map((column) => column.key), [
    'date',
    'shift',
    'product',
    'category',
    'quantity',
    'paymentMethod',
    'revenue',
  ]);
  assert.deepEqual(report.rows.map((row) => row.product), ['Vitamina C']);
  assert.equal(report.totals.revenue, 8240);
});

test('buildReportData generates finance, stock, clients, documents, and operation reports', () => {
  const finance = buildReportData('demonstrativo-financeiro', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  });
  const stock = buildReportData('stock-baixo', reportData, {});
  const clientsReport = buildReportData('clientes-credito-aberto', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  });
  const documentReport = buildReportData('documentos-emitidos', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  });
  const operation = buildReportData('estado-operacional', {
    ...reportData,
    operationState: {
      canOperate: true,
      day: { data_operacional: '2026-06-18', saldo_inicial: 10000 },
      shift: { nome: 'Manha', saldo_inicial: 5000 },
      message: 'Operacao aberta',
    },
  }, {});

  assert.equal(finance.totals.netProfit, -225509.1);
  assert.ok(stock.rows.every((row) => ['Baixo estoque', 'Sem estoque'].includes(row.status)));
  assert.deepEqual(clientsReport.rows.map((row) => row.name), ['Margarida Albuquerque', 'Dominick Yanser']);
  assert.ok(documentReport.rows.length > 0);
  assert.equal(operation.rows[0].status, 'Aberto');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/reports.test.mjs
```

Expected: FAIL because `src/data/reports.mjs` does not exist.

- [ ] **Step 3: Implement the report engine**

Create `src/data/reports.mjs`:

```js
import {
  buildClientMetrics,
  buildFinancialOverview,
  buildReportsOverview,
  formatKwanza,
} from './pharmacyData.mjs';
import {
  DOCUMENT_STATUSES,
  documentStatusLabels,
  documentTypeLabels,
  filterDocuments,
} from './documents.mjs';

export const REPORT_CATALOG = Object.freeze([
  {
    id: 'geral',
    title: 'Geral',
    reports: [
      { id: 'resumo-executivo', title: 'Resumo executivo', mode: 'standard' },
      { id: 'balanco-geral', title: 'Balanco geral do periodo', mode: 'standard' },
      { id: 'movimento-diario', title: 'Movimento diario consolidado', mode: 'daily' },
      { id: 'movimento-turno', title: 'Movimento por turno', mode: 'standard' },
      { id: 'relatorio-diario', title: 'Relatorio diario', mode: 'daily' },
      { id: 'diferenca-entre-datas', title: 'Diferenca entre datas', mode: 'comparison' },
      { id: 'comparativo-periodos', title: 'Comparativo entre periodos', mode: 'comparison' },
    ],
  },
  {
    id: 'vendas',
    title: 'Vendas',
    reports: [
      { id: 'vendas-detalhadas', title: 'Vendas detalhadas', mode: 'standard' },
      { id: 'vendas-do-dia', title: 'Vendas do dia', mode: 'daily' },
      { id: 'vendas-produto', title: 'Vendas por produto', mode: 'standard' },
      { id: 'produtos-mais-vendidos', title: 'Produtos mais vendidos', mode: 'standard' },
      { id: 'vendas-categoria', title: 'Vendas por categoria', mode: 'standard' },
      { id: 'vendas-pagamento', title: 'Vendas por forma de pagamento', mode: 'standard' },
      { id: 'vendas-turno', title: 'Vendas por turno', mode: 'standard' },
      { id: 'facturas-em-espera', title: 'Facturas em espera', mode: 'standard' },
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro',
    reports: [
      { id: 'demonstrativo-financeiro', title: 'Demonstrativo financeiro', mode: 'standard' },
      { id: 'fecho-financeiro-diario', title: 'Fecho financeiro diario', mode: 'daily' },
      { id: 'receitas-origem', title: 'Receitas por origem', mode: 'standard' },
      { id: 'despesas', title: 'Despesas pagas e pendentes', mode: 'standard' },
      { id: 'lucro-liquido', title: 'Lucro bruto e liquido', mode: 'standard' },
      { id: 'margem-produto', title: 'Margem por produto', mode: 'standard' },
      { id: 'perdas-stock', title: 'Perdas e baixas de stock', mode: 'standard' },
    ],
  },
  {
    id: 'stock',
    title: 'Stock',
    reports: [
      { id: 'stock-atual', title: 'Stock atual', mode: 'standard' },
      { id: 'posicao-diaria-stock', title: 'Posicao diaria do stock', mode: 'daily' },
      { id: 'stock-baixo', title: 'Stock baixo', mode: 'standard' },
      { id: 'sem-stock', title: 'Sem stock', mode: 'standard' },
      { id: 'inventario-categoria-localizacao', title: 'Inventario por categoria e localizacao', mode: 'standard' },
      { id: 'validade-critica', title: 'Produtos com validade critica', mode: 'standard' },
    ],
  },
  {
    id: 'clientes',
    title: 'Clientes',
    reports: [
      { id: 'clientes-ativos', title: 'Clientes ativos', mode: 'standard' },
      { id: 'movimento-diario-clientes', title: 'Movimento diario de clientes', mode: 'daily' },
      { id: 'clientes-credito-aberto', title: 'Clientes com credito aberto', mode: 'standard' },
      { id: 'historico-compras-cliente', title: 'Historico de compras por cliente', mode: 'standard' },
      { id: 'novos-clientes', title: 'Novos clientes no periodo', mode: 'standard' },
    ],
  },
  {
    id: 'documentos',
    title: 'Documentos',
    reports: [
      { id: 'documentos-emitidos', title: 'Documentos emitidos', mode: 'standard' },
      { id: 'documentos-do-dia', title: 'Documentos do dia', mode: 'daily' },
      { id: 'documentos-tipo', title: 'Facturas, recibos, proformas e notas de credito', mode: 'standard' },
      { id: 'documentos-anulados', title: 'Documentos anulados', mode: 'standard' },
      { id: 'documentos-status', title: 'Documentos por status', mode: 'standard' },
    ],
  },
  {
    id: 'operacao',
    title: 'Operacao',
    reports: [
      { id: 'estado-operacional', title: 'Estado do dia operacional', mode: 'standard' },
      { id: 'relatorio-diario-operacao', title: 'Relatorio diario da operacao', mode: 'daily' },
      { id: 'resumo-turnos', title: 'Resumo de turnos', mode: 'standard' },
      { id: 'aberturas-fechamentos', title: 'Aberturas e fechamentos', mode: 'standard' },
    ],
  },
]);

const REPORT_LOOKUP = new Map(
  REPORT_CATALOG.flatMap((group) => group.reports.map((report) => [report.id, { ...report, groupId: group.id, groupTitle: group.title }])),
);

const MONEY = 'money';
const NUMBER = 'number';
const TEXT = 'text';

export function buildReportData(reportId, data = {}, filters = {}) {
  const definition = REPORT_LOOKUP.get(reportId) ?? REPORT_LOOKUP.get('resumo-executivo');
  const normalizedFilters = normalizeFilters(filters);

  if (definition.mode === 'daily') {
    return buildDailyReportData(normalizedFilters.date || normalizedFilters.endDate, data, {
      ...normalizedFilters,
      reportId: definition.id,
    });
  }

  if (definition.mode === 'comparison') {
    return buildDateDifferenceReportData(data, {
      ...normalizedFilters,
      reportId: definition.id,
    });
  }

  const context = createContext(data, normalizedFilters);

  if (definition.groupId === 'vendas') return buildSalesReport(definition, context);
  if (definition.groupId === 'financeiro') return buildFinanceReport(definition, context);
  if (definition.groupId === 'stock') return buildStockReport(definition, context);
  if (definition.groupId === 'clientes') return buildClientsReport(definition, context);
  if (definition.groupId === 'documentos') return buildDocumentsReport(definition, context);
  if (definition.groupId === 'operacao') return buildOperationReport(definition, context);

  return buildGeneralReport(definition, context);
}

export function buildDailyReportData(date, data = {}, filters = {}) {
  const day = normalizeDate(date) || normalizeDate(filters.endDate) || '2026-06-15';
  const context = createContext(data, { ...normalizeFilters(filters), startDate: day, endDate: day, date: day });
  const rows = [
    { section: 'Vendas', metric: 'Receita', value: context.financial.totals.revenue },
    { section: 'Vendas', metric: 'Itens vendidos', value: context.salesRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0) },
    { section: 'Financeiro', metric: 'Despesas pagas', value: context.financial.totals.expenses },
    { section: 'Financeiro', metric: 'Lucro liquido', value: context.financial.totals.netProfit },
    { section: 'Documentos', metric: 'Documentos emitidos', value: context.documentRows.length },
    { section: 'Stock', metric: 'Stock critico', value: context.stockRows.filter((row) => row.status !== 'Em estoque').length },
    { section: 'Clientes', metric: 'Clientes activos', value: buildClientMetrics(context.clientRows, day).activeClients },
    { section: 'Operacao', metric: 'Estado', value: data.operationState?.canOperate ? 'Aberta' : 'Bloqueada' },
  ];

  return decorateReport({
    id: filters.reportId || 'relatorio-diario',
    groupId: 'geral',
    title: 'Relatorio diario',
    description: `Consolidado operacional de ${day}.`,
    mode: 'daily',
    filters: { ...context.filters, date: day },
    kpis: [
      moneyKpi('Receita do dia', context.financial.totals.revenue),
      moneyKpi('Lucro liquido', context.financial.totals.netProfit),
      numberKpi('Documentos', context.documentRows.length),
      numberKpi('Stock critico', context.stockRows.filter((row) => row.status !== 'Em estoque').length),
    ],
    columns: [
      column('section', 'Seccao'),
      column('metric', 'Indicador'),
      column('value', 'Valor'),
    ],
    rows,
    totals: context.financial.totals,
  });
}

export function buildDateDifferenceReportData(data = {}, comparison = {}) {
  const currentStart = normalizeDate(comparison.startDate) || '2026-06-15';
  const currentEnd = normalizeDate(comparison.endDate) || currentStart;
  const compareStart = normalizeDate(comparison.compareStartDate) || normalizeDate(comparison.compareDate);
  const compareEnd = normalizeDate(comparison.compareEndDate) || compareStart;
  const current = createContext(data, { ...comparison, startDate: currentStart, endDate: currentEnd });
  const previous = compareStart && compareEnd
    ? createContext(data, { ...comparison, startDate: compareStart, endDate: compareEnd })
    : null;

  const metrics = [
    ['Receita', current.financial.totals.revenue, previous?.financial.totals.revenue ?? 0],
    ['Despesas', current.financial.totals.expenses, previous?.financial.totals.expenses ?? 0],
    ['Lucro liquido', current.financial.totals.netProfit, previous?.financial.totals.netProfit ?? 0],
    ['Itens vendidos', current.salesRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0), previous?.salesRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0) ?? 0],
    ['Documentos', current.documentRows.length, previous?.documentRows.length ?? 0],
  ];
  const rows = metrics.map(([metric, currentValue, comparedValue]) => {
    const difference = roundMoney(Number(currentValue) - Number(comparedValue));
    return {
      metric,
      currentValue,
      comparedValue,
      difference,
      percent: resolvePercentDifference(currentValue, comparedValue),
    };
  });

  return decorateReport({
    id: comparison.reportId || 'diferenca-entre-datas',
    groupId: 'geral',
    title: 'Diferenca entre datas',
    description: 'Comparativo entre o periodo base e o periodo comparado.',
    mode: 'comparison',
    filters: {
      startDate: currentStart,
      endDate: currentEnd,
      compareStartDate: compareStart || '',
      compareEndDate: compareEnd || '',
    },
    comparison: {
      currentLabel: `${currentStart} a ${currentEnd}`,
      comparedLabel: compareStart && compareEnd ? `${compareStart} a ${compareEnd}` : 'Sem comparacao',
      isComplete: Boolean(compareStart && compareEnd),
    },
    kpis: [
      moneyKpi('Receita base', current.financial.totals.revenue),
      moneyKpi('Receita comparada', previous?.financial.totals.revenue ?? 0),
      moneyKpi('Diferenca receita', rows[0].difference),
      numberKpi('Variacao receita', `${rows[0].percent}%`),
    ],
    columns: [
      column('metric', 'Indicador'),
      column('currentValue', 'Valor base', MONEY),
      column('comparedValue', 'Valor comparado', MONEY),
      column('difference', 'Diferenca', MONEY),
      column('percent', 'Variacao %', NUMBER),
    ],
    rows,
    totals: { revenueDifference: rows[0].difference },
  });
}

function buildGeneralReport(definition, context) {
  const overview = buildReportsOverview({
    clients: context.clientRows,
    stockRows: context.stockRows,
    sales: context.salesRows,
    losses: context.lossRows,
    expenses: context.expenseRows,
  }, { referenceDate: context.filters.endDate });

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Visao consolidada do periodo selecionado.',
    kpis: [
      moneyKpi('Vendas', overview.sales.totalRevenue),
      moneyKpi('Lucro liquido', overview.finance.netProfit),
      numberKpi('Stock critico', overview.stock.lowStock + overview.stock.outOfStock),
      numberKpi('Clientes activos', overview.clients.activeClients),
    ],
    columns: [
      column('metric', 'Indicador'),
      column('value', 'Valor'),
    ],
    rows: [
      { metric: 'Receita total', value: overview.sales.totalRevenue },
      { metric: 'Quantidade vendida', value: overview.sales.totalQuantity },
      { metric: 'Lucro liquido', value: overview.finance.netProfit },
      { metric: 'Produtos sem stock', value: overview.stock.outOfStock },
      { metric: 'Credito aberto', value: overview.clients.openCredit },
    ],
    totals: overview,
  });
}

function buildSalesReport(definition, context) {
  const rows = context.salesRows.map((row) => ({
    date: row.date,
    shift: row.shift,
    product: row.product,
    category: row.category,
    quantity: row.quantity,
    paymentMethod: row.paymentMethod,
    revenue: row.revenue,
  }));

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Vendas filtradas por periodo, turno e forma de pagamento.',
    kpis: [
      moneyKpi('Receita', sumMoney(rows, 'revenue')),
      numberKpi('Itens', rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0)),
      numberKpi('Transacoes', rows.length),
      numberKpi('Produtos', new Set(rows.map((row) => row.product)).size),
    ],
    columns: [
      column('date', 'Data'),
      column('shift', 'Turno'),
      column('product', 'Produto'),
      column('category', 'Categoria'),
      column('quantity', 'Qtd.', NUMBER),
      column('paymentMethod', 'Pagamento'),
      column('revenue', 'Receita', MONEY),
    ],
    rows,
    totals: { revenue: sumMoney(rows, 'revenue') },
  });
}

function buildFinanceReport(definition, context) {
  const overview = context.financial;
  const rows = [
    { metric: 'Receita de produtos', value: overview.totals.productRevenue },
    { metric: 'Outras receitas', value: overview.totals.otherRevenue },
    { metric: 'Custo dos produtos', value: overview.totals.productCost },
    { metric: 'Lucro bruto', value: overview.totals.grossProfit },
    { metric: 'Perdas', value: overview.totals.losses },
    { metric: 'Despesas pagas', value: overview.totals.expenses },
    { metric: 'Despesas pendentes', value: overview.totals.pendingExpenses },
    { metric: 'Lucro liquido', value: overview.totals.netProfit },
  ];

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Demonstrativo financeiro do periodo.',
    kpis: [
      moneyKpi('Receita', overview.totals.revenue),
      moneyKpi('Lucro bruto', overview.totals.grossProfit),
      moneyKpi('Despesas', overview.totals.expenses),
      moneyKpi('Lucro liquido', overview.totals.netProfit),
    ],
    columns: [column('metric', 'Indicador'), column('value', 'Valor', MONEY)],
    rows,
    totals: overview.totals,
  });
}

function buildStockReport(definition, context) {
  let rows = context.stockRows;
  if (definition.id === 'stock-baixo') rows = rows.filter((row) => row.status === 'Baixo estoque' || row.status === 'Sem estoque');
  if (definition.id === 'sem-stock') rows = rows.filter((row) => row.status === 'Sem estoque');
  if (definition.id === 'validade-critica') rows = rows.filter((row) => normalizeExpiry(row.expiry) <= '2026-12-31');

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Posicao do stock por produto, categoria e localizacao.',
    kpis: [
      numberKpi('Produtos', rows.length),
      numberKpi('Baixo stock', rows.filter((row) => row.status === 'Baixo estoque').length),
      numberKpi('Sem stock', rows.filter((row) => row.status === 'Sem estoque').length),
      moneyKpi('Valor estimado', rows.reduce((sum, row) => sum + Number(row.quantity ?? 0) * Number(row.price ?? 0), 0)),
    ],
    columns: [
      column('id', 'Codigo'),
      column('name', 'Produto'),
      column('category', 'Categoria'),
      column('quantity', 'Qtd.', NUMBER),
      column('location', 'Localizacao'),
      column('expiry', 'Validade'),
      column('status', 'Status'),
    ],
    rows,
    totals: { totalProducts: rows.length },
  });
}

function buildClientsReport(definition, context) {
  let rows = context.clientRows;
  if (definition.id === 'clientes-ativos') rows = rows.filter((row) => row.status === 'Activo');
  if (definition.id === 'clientes-credito-aberto') rows = rows.filter((row) => Number(row.openCredit ?? 0) > 0);
  if (definition.id === 'novos-clientes') rows = rows.filter((row) => row.createdAt >= context.filters.startDate && row.createdAt <= context.filters.endDate);

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Indicadores e detalhes de clientes.',
    kpis: [
      numberKpi('Clientes', rows.length),
      numberKpi('Activos', rows.filter((row) => row.status === 'Activo').length),
      moneyKpi('Credito aberto', sumMoney(rows, 'openCredit')),
      numberKpi('Compras registadas', rows.reduce((sum, row) => sum + Number(row.totalPurchases ?? 0), 0)),
    ],
    columns: [
      column('id', 'Codigo'),
      column('name', 'Cliente'),
      column('phone', 'Telefone'),
      column('nif', 'NIF'),
      column('status', 'Status'),
      column('lastPurchase', 'Ultima compra'),
      column('openCredit', 'Credito', MONEY),
    ],
    rows,
    totals: { openCredit: sumMoney(rows, 'openCredit') },
  });
}

function buildDocumentsReport(definition, context) {
  let rows = context.documentRows.map((document) => ({
    number: document.number,
    type: documentTypeLabels[document.type] || document.type,
    clientName: document.clientName,
    issueDate: document.issueDate,
    total: document.total,
    status: documentStatusLabels[document.status] || document.status,
    userName: document.userName,
  }));
  if (definition.id === 'documentos-anulados') {
    rows = rows.filter((row) => row.status === documentStatusLabels[DOCUMENT_STATUSES.CANCELLED]);
  }

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Documentos comerciais emitidos no periodo.',
    kpis: [
      numberKpi('Documentos', rows.length),
      moneyKpi('Total', sumMoney(rows, 'total')),
      numberKpi('Anulados', rows.filter((row) => row.status === documentStatusLabels[DOCUMENT_STATUSES.CANCELLED]).length),
      numberKpi('Clientes', new Set(rows.map((row) => row.clientName)).size),
    ],
    columns: [
      column('number', 'Numero'),
      column('type', 'Tipo'),
      column('clientName', 'Cliente'),
      column('issueDate', 'Data'),
      column('total', 'Total', MONEY),
      column('status', 'Status'),
      column('userName', 'Usuario'),
    ],
    rows,
    totals: { total: sumMoney(rows, 'total') },
  });
}

function buildOperationReport(definition, context) {
  const state = context.data.operationState || {};
  const rows = [
    {
      item: 'Dia operacional',
      status: state.day ? 'Aberto' : 'Fechado',
      detail: state.day?.data_operacional || state.message || 'Sem dia aberto',
      value: state.day?.saldo_inicial ?? 0,
    },
    {
      item: 'Turno operacional',
      status: state.shift ? 'Aberto' : 'Fechado',
      detail: state.shift?.nome || 'Sem turno aberto',
      value: state.shift?.saldo_inicial ?? 0,
    },
  ];

  return decorateReport({
    ...baseReport(definition, context),
    description: 'Estado operacional do dia e do turno.',
    kpis: [
      numberKpi('Pode operar', state.canOperate ? 'Sim' : 'Nao'),
      numberKpi('Dia aberto', state.day ? 'Sim' : 'Nao'),
      numberKpi('Turno aberto', state.shift ? 'Sim' : 'Nao'),
      moneyKpi('Saldo inicial turno', state.shift?.saldo_inicial ?? 0),
    ],
    columns: [
      column('item', 'Item'),
      column('status', 'Status'),
      column('detail', 'Detalhe'),
      column('value', 'Valor', MONEY),
    ],
    rows,
    totals: {},
  });
}

function createContext(data, filters) {
  const salesRows = filterByCommonFields(data.sales ?? [], filters);
  const lossRows = filterByCommonFields(data.losses ?? [], filters);
  const expenseRows = filterByDate(data.expenses ?? [], filters.startDate, filters.endDate);
  const documents = data.documents ?? [];
  const documentRows = filterDocuments(documents, {
    dateFrom: filters.startDate,
    dateTo: filters.endDate,
    status: filters.documentStatus || '',
    type: filters.documentType || '',
    query: filters.query || '',
  });

  return {
    data,
    filters,
    salesRows,
    lossRows,
    expenseRows,
    stockRows: data.stockRows ?? [],
    clientRows: data.clients ?? [],
    documentRows,
    invoiceRows: data.invoices ?? [],
    financial: buildFinancialOverview({
      sales: salesRows,
      losses: lossRows,
      expenses: expenseRows,
      otherRevenues: data.otherRevenues ?? [],
    }, { period: 'custom', referenceDate: filters.endDate, shift: filters.shift }),
  };
}

function filterByCommonFields(rows, filters) {
  return filterByDate(rows, filters.startDate, filters.endDate)
    .filter((row) => !filters.shift || filters.shift === 'Todos' || row.shift === filters.shift)
    .filter((row) => !filters.category || row.category === filters.category)
    .filter((row) => !filters.paymentMethod || row.paymentMethod === filters.paymentMethod);
}

function filterByDate(rows, startDate, endDate) {
  return rows.filter((row) => {
    if (!row.date) return true;
    return row.date >= startDate && row.date <= endDate;
  });
}

function normalizeFilters(filters = {}) {
  const startDate = normalizeDate(filters.startDate) || '2026-06-01';
  const endDate = normalizeDate(filters.endDate) || startDate;
  return {
    ...filters,
    startDate,
    endDate,
    date: normalizeDate(filters.date) || endDate,
  };
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? '')) ? String(value) : '';
}

function normalizeExpiry(value) {
  const match = String(value ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return String(value ?? '');
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function baseReport(definition, context) {
  return {
    id: definition.id,
    groupId: definition.groupId,
    title: definition.title,
    mode: definition.mode,
    filters: context.filters,
  };
}

function decorateReport(report) {
  return {
    description: '',
    kpis: [],
    columns: [],
    rows: [],
    totals: {},
    comparison: null,
    generatedAt: new Date().toISOString(),
    ...report,
  };
}

function column(key, label, type = TEXT) {
  return { key, label, type };
}

function moneyKpi(label, value) {
  return { label, value: roundMoney(value), type: MONEY, formattedValue: formatKwanza(value) };
}

function numberKpi(label, value) {
  return { label, value, type: NUMBER, formattedValue: String(value) };
}

function sumMoney(rows, field) {
  return roundMoney(rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0));
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function resolvePercentDifference(currentValue, comparedValue) {
  const compared = Number(comparedValue) || 0;
  if (!compared) return Number(currentValue) ? 100 : 0;
  return roundMoney(((Number(currentValue) - compared) / compared) * 100);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- tests/reports.test.mjs
```

Expected: PASS for the new reports tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/reports.mjs tests/reports.test.mjs
git commit -m "feat: add report data engine"
```

---

### Task 2: Export Rows and Excel-Compatible CSV

**Files:**
- Modify: `tests/reports.test.mjs`
- Modify: `src/data/reports.mjs`

- [ ] **Step 1: Add failing export tests**

Append to `tests/reports.test.mjs`:

```js
import {
  buildReportCsv,
  buildReportExportRows,
} from '../src/data/reports.mjs';

test('buildReportExportRows formats rows using report column labels', () => {
  const report = buildReportData('vendas-detalhadas', reportData, {
    startDate: '2026-06-15',
    endDate: '2026-06-15',
  });

  const rows = buildReportExportRows(report);

  assert.equal(rows[0].Produto, 'C-12 Plus');
  assert.equal(rows[0].Receita, '7620.9');
  assert.ok(Object.hasOwn(rows[0], 'Pagamento'));
});

test('buildReportCsv exports semicolon CSV with BOM and escaped values', () => {
  const csv = buildReportCsv({
    title: 'Teste',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'note', label: 'Nota' },
      { key: 'value', label: 'Valor' },
    ],
    rows: [
      { name: 'Produto; Especial', note: 'Linha "A"\nLinha B', value: 1200 },
    ],
  });

  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /^﻿Nome;Nota;Valor/m);
  assert.match(csv, /"Produto; Especial";"Linha ""A"" Linha B";1200/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/reports.test.mjs
```

Expected: FAIL because `buildReportExportRows` and `buildReportCsv` are not exported.

- [ ] **Step 3: Implement export helpers**

Append these exports to `src/data/reports.mjs`:

```js
export function buildReportExportRows(report) {
  return (report.rows ?? []).map((row) =>
    (report.columns ?? []).reduce((output, columnDefinition) => {
      output[columnDefinition.label] = serializeCellValue(row[columnDefinition.key]);
      return output;
    }, {}));
}

export function buildReportCsv(report) {
  const columns = report.columns ?? [];
  const headers = columns.map((columnDefinition) => columnDefinition.label);
  const lines = [
    headers.map(escapeCsvCell).join(';'),
    ...(report.rows ?? []).map((row) =>
      columns.map((columnDefinition) => escapeCsvCell(serializeCellValue(row[columnDefinition.key]))).join(';')),
  ];

  return `\uFEFF${lines.join('\n')}`;
}

function serializeCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return String(value).replace(/\r?\n/g, ' ');
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (!/[;"\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- tests/reports.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/reports.mjs tests/reports.test.mjs
git commit -m "feat: add report csv export"
```

---

### Task 3: Printable Report A4 Component

**Files:**
- Create: `src/components/ReportA4.jsx`
- Create: `tests/reportUiSource.test.mjs`

- [ ] **Step 1: Write failing source tests**

Create `tests/reportUiSource.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ReportA4 renders approved report print sections', async () => {
  const source = await readFile('src/components/ReportA4.jsx', 'utf8');

  assert.match(source, /function ReportA4\(\{ report, branding, settings, printedBy \}\)/);
  assert.match(source, /report-a4-page/);
  assert.match(source, /report-a4-header/);
  assert.match(source, /report-a4-document-box/);
  assert.match(source, /report-a4-filters/);
  assert.match(source, /report-a4-kpis/);
  assert.match(source, /report-a4-table/);
  assert.match(source, /report-a4-footer/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: FAIL because `src/components/ReportA4.jsx` does not exist.

- [ ] **Step 3: Implement `ReportA4.jsx`**

Create `src/components/ReportA4.jsx`:

```jsx
import React from 'react';
import { formatKwanza } from '../data/pharmacyData.mjs';

function formatCell(value, type) {
  if (type === 'money') return formatKwanza(value).replace('KZ ', '');
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatFilterValue(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return String(value);
}

function ReportA4({ report, branding, settings, printedBy }) {
  const activeFilters = Object.entries(report.filters ?? {})
    .map(([key, value]) => ({ key, value: formatFilterValue(value) }))
    .filter((item) => item.value);

  return (
    <article className="report-a4-page" aria-label={`${report.title} ${report.filters?.startDate || ''}`}>
      <header className="report-a4-header">
        <section className="report-a4-company">
          {branding.logoDataUrl ? <img className="report-a4-logo" src={branding.logoDataUrl} alt="" /> : null}
          <h1>{settings.companyName || branding.pharmacyName}</h1>
          {settings.companyActivity ? <p>{settings.companyActivity}</p> : null}
          {settings.pharmacyTaxId ? <p><span>NIF:</span> {settings.pharmacyTaxId}</p> : null}
          {settings.pharmacyAddress ? <p>{settings.pharmacyAddress}</p> : null}
          {settings.pharmacyCity ? <p>{settings.pharmacyCity}</p> : null}
          {settings.pharmacyPhone ? <p><span>TEL:</span> {settings.pharmacyPhone}</p> : null}
          {settings.pharmacyEmail ? <p><span>EMAIL:</span> {settings.pharmacyEmail}</p> : null}
        </section>

        <section className="report-a4-document-box">
          <span>Relatorio</span>
          <h2>{report.title}</h2>
          <small>{report.mode === 'daily' ? 'Diario' : report.mode === 'comparison' ? 'Comparativo' : 'Periodo'}</small>
        </section>
      </header>

      <section className="report-a4-filters">
        {activeFilters.map((item) => (
          <span key={item.key}>
            <b>{item.key}</b>
            {item.value}
          </span>
        ))}
      </section>

      {report.comparison ? (
        <section className="report-a4-comparison">
          <span>Base: {report.comparison.currentLabel}</span>
          <span>Comparado: {report.comparison.comparedLabel}</span>
        </section>
      ) : null}

      <section className="report-a4-kpis">
        {report.kpis.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.formattedValue ?? formatCell(item.value, item.type)}</strong>
          </div>
        ))}
      </section>

      <table className="report-a4-table">
        <thead>
          <tr>
            {report.columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={`${report.id}-${index}`}>
              {report.columns.map((column) => (
                <td key={column.key}>{formatCell(row[column.key], column.type)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {!report.rows.length ? <p className="report-a4-empty">Sem dados para os filtros selecionados.</p> : null}

      <footer className="report-a4-footer">
        <span>Impresso por {printedBy}</span>
        <span>{report.generatedAt}</span>
        <span>{settings.fiscalRegime}</span>
      </footer>
    </article>
  );
}

export default ReportA4;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportA4.jsx tests/reportUiSource.test.mjs
git commit -m "feat: add report a4 preview"
```

---

### Task 4: Reports Center UI and Permissions

**Files:**
- Modify: `tests/reportUiSource.test.mjs`
- Modify: `src/components/Relatorios.jsx`

- [ ] **Step 1: Add failing UI source tests**

Append to `tests/reportUiSource.test.mjs`:

```js
test('Relatorios uses catalog report engine and export permissions', async () => {
  const source = await readFile('src/components/Relatorios.jsx', 'utf8');

  assert.match(source, /REPORT_CATALOG/);
  assert.match(source, /buildReportData/);
  assert.match(source, /buildReportCsv/);
  assert.match(source, /ReportA4/);
  assert.match(source, /hasPermission\('relatorios\.exportar'\)/);
  assert.match(source, /aria-label="Exportar Excel"/);
  assert.match(source, /aria-label="Salvar PDF"/);
  assert.match(source, /window\.print\(\)/);
  assert.match(source, /URL\.createObjectURL/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: FAIL because `Relatorios.jsx` still uses the old static overview.

- [ ] **Step 3: Replace `Relatorios.jsx`**

Replace `src/components/Relatorios.jsx` with:

```jsx
import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileBarChart,
  FileDown,
  Printer,
  RefreshCcw,
  Search,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getStoredBranding } from '../data/branding.mjs';
import { documents } from '../data/documents.mjs';
import { getStoredInvoiceA4Settings } from '../data/invoiceSettings.mjs';
import {
  buildReportCsv,
  buildReportData,
  REPORT_CATALOG,
} from '../data/reports.mjs';
import {
  clients,
  financeExpenses,
  financeLosses,
  financeOtherRevenues,
  financeProductSales,
  formatKwanza,
  invoices,
  stockItems,
} from '../data/pharmacyData.mjs';
import { useOperation } from '../operation/OperationContext';
import ReportA4 from './ReportA4';

const DEFAULT_FILTERS = {
  startDate: '2026-06-01',
  endDate: '2026-06-15',
  date: '2026-06-15',
  compareStartDate: '2026-06-01',
  compareEndDate: '2026-06-14',
  shift: 'Todos',
  category: '',
  paymentMethod: '',
  query: '',
};

function getUserName(user) {
  return user?.nome_completo || user?.nome_usuario || 'Usuario';
}

function getFirstReportId() {
  return REPORT_CATALOG[0].reports[0].id;
}

function findReportDefinition(reportId) {
  return REPORT_CATALOG.flatMap((group) =>
    group.reports.map((report) => ({ ...report, groupId: group.id, groupTitle: group.title })))
    .find((report) => report.id === reportId);
}

function Relatorios() {
  const { hasPermission, user } = useAuth();
  const operation = useOperation();
  const canExport = hasPermission('relatorios.exportar');
  const [selectedReportId, setSelectedReportId] = useState(getFirstReportId);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const selectedDefinition = findReportDefinition(selectedReportId);
  const data = useMemo(() => ({
    clients,
    stockRows: stockItems,
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
    otherRevenues: financeOtherRevenues,
    documents,
    invoices,
    operationState: operation,
  }), [operation]);
  const report = useMemo(() => buildReportData(selectedReportId, data, filters), [data, filters, selectedReportId]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function openPreview() {
    setPreviewOpen(true);
  }

  function handlePrint() {
    setPreviewOpen(true);
    window.setTimeout(() => window.print(), 0);
  }

  function handleSavePdf() {
    setPreviewOpen(true);
    window.setTimeout(() => window.print(), 0);
  }

  function exportExcel() {
    const csv = buildReportCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}-${filters.startDate}-${filters.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice('Relatorio exportado para Excel.');
  }

  return (
    <section className="standard-screen reports-screen report-center">
      <div className="report-workbar panel">
        <label className="compact-search report-search">
          <Search size={17} />
          <input value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} placeholder="Pesquisar no relatorio" />
        </label>
        <label>
          <CalendarDays size={17} />
          <input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
        </label>
        <input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} aria-label="Data final" />
        {selectedDefinition?.mode === 'daily' ? (
          <input type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)} aria-label="Data diaria" />
        ) : null}
        {selectedDefinition?.mode === 'comparison' ? (
          <>
            <input type="date" value={filters.compareStartDate} onChange={(event) => updateFilter('compareStartDate', event.target.value)} aria-label="Data comparada inicial" />
            <input type="date" value={filters.compareEndDate} onChange={(event) => updateFilter('compareEndDate', event.target.value)} aria-label="Data comparada final" />
          </>
        ) : null}
        <select value={filters.shift} onChange={(event) => updateFilter('shift', event.target.value)} aria-label="Turno">
          <option>Todos</option>
          <option>Manha</option>
          <option>Tarde</option>
          <option>Noite</option>
        </select>
        <select value={filters.paymentMethod} onChange={(event) => updateFilter('paymentMethod', event.target.value)} aria-label="Forma de pagamento">
          <option value="">Todos pagamentos</option>
          <option>Dinheiro</option>
          <option>TPA</option>
          <option>Transferencia</option>
          <option>Credito</option>
        </select>
        <button type="button" className="soft-button" onClick={resetFilters}><RefreshCcw size={17} /> Limpar</button>
      </div>

      {notice ? <p className="form-error documents-notice" role="status">{notice}</p> : null}

      <div className="report-center-layout">
        <aside className="panel report-catalog">
          {REPORT_CATALOG.map((group) => (
            <section key={group.id}>
              <h2>{group.title}</h2>
              {group.reports.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === selectedReportId ? 'active' : ''}
                  onClick={() => setSelectedReportId(item.id)}
                >
                  <span>{item.title}</span>
                  <small>{item.mode === 'daily' ? 'Diario' : item.mode === 'comparison' ? 'Comparativo' : 'Periodo'}</small>
                </button>
              ))}
            </section>
          ))}
        </aside>

        <main className="report-result">
          <div className="panel report-result-header">
            <div>
              <span>{selectedDefinition?.groupTitle}</span>
              <h2>{report.title}</h2>
              <p>{report.description}</p>
            </div>
            <div className="report-actions">
              <button type="button" className="soft-button" onClick={openPreview}><FileBarChart size={17} /> Visualizar</button>
              {canExport ? (
                <>
                  <button type="button" className="icon-button" aria-label="Exportar Excel" title="Exportar Excel" onClick={exportExcel}>
                    <Download size={19} />
                  </button>
                  <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf}>
                    <FileDown size={19} />
                  </button>
                  <button type="button" className="icon-button" aria-label="Imprimir relatorio" title="Imprimir" onClick={handlePrint}>
                    <Printer size={19} />
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="standard-metrics report-summary-metrics">
            {report.kpis.map((item) => (
              <Metric key={item.label} label={item.label} value={item.formattedValue ?? item.value} />
            ))}
          </div>

          {report.comparison ? (
            <div className="panel report-comparison-strip">
              <span>Base: {report.comparison.currentLabel}</span>
              <span>Comparado: {report.comparison.comparedLabel}</span>
            </div>
          ) : null}

          <div className="panel table-panel report-table-panel">
            <table>
              <thead>
                <tr>
                  {report.columns.map((column) => <th key={column.key}>{column.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={`${report.id}-${index}`}>
                    {report.columns.map((column) => (
                      <td key={column.key}>{formatReportCell(row[column.key], column.type)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length ? (
              <div className="empty-state">
                <FileBarChart size={28} />
                <strong>Sem dados para os filtros selecionados</strong>
              </div>
            ) : null}
          </div>
        </main>
      </div>

      {previewOpen ? (
        <ReportPreview report={report} userName={getUserName(user)} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="standard-metric blue">
      <span><FileBarChart size={30} /></span>
      <div>
        <h2>{label}</h2>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function formatReportCell(value, type) {
  if (type === 'money') return formatKwanza(value);
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function ReportPreview({ report, userName, onClose }) {
  function handlePrintA4() {
    window.setTimeout(() => window.print(), 0);
  }

  function handleSavePdf() {
    window.setTimeout(() => window.print(), 0);
  }

  return (
    <div className="modal-backdrop reports-print-scope" role="dialog" aria-modal="true">
      <div className="modal-card wide report-preview-modal">
        <div className="modal-title-row">
          <h2>{report.title}</h2>
          <div className="invoice-a4-actions">
            <button type="button" className="icon-button" aria-label="Salvar PDF" title="Salvar PDF" onClick={handleSavePdf}>
              <FileDown size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Imprimir relatorio" title="Imprimir" onClick={handlePrintA4}>
              <Printer size={20} />
            </button>
            <button type="button" className="icon-button" aria-label="Fechar visualizacao" onClick={onClose}>x</button>
          </div>
        </div>
        <ReportA4
          report={report}
          branding={getStoredBranding()}
          settings={getStoredInvoiceA4Settings()}
          printedBy={userName}
        />
      </div>
    </div>
  );
}

export default Relatorios;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run reports tests**

Run:

```bash
npm test -- tests/reports.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/Relatorios.jsx tests/reportUiSource.test.mjs
git commit -m "feat: add reports center ui"
```

---

### Task 5: Report Styling and Print Scope

**Files:**
- Modify: `tests/reportUiSource.test.mjs`
- Modify: `src/assets/tailwind.css`
- Modify: `src/assets/output.css`

- [ ] **Step 1: Add failing CSS source test**

Append to `tests/reportUiSource.test.mjs`:

```js
test('report center and print styles are defined', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /\.report-center/);
  assert.match(css, /\.report-workbar/);
  assert.match(css, /\.report-catalog/);
  assert.match(css, /\.report-result-header/);
  assert.match(css, /\.report-comparison-strip/);
  assert.match(css, /\.reports-print-scope/);
  assert.match(css, /\.report-a4-page/);
  assert.match(css, /@media print/);
  assert.match(css, /body:has\(\.reports-print-scope\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: FAIL because the new CSS selectors are missing.

- [ ] **Step 3: Add CSS**

Append to `src/assets/tailwind.css` before the existing invoice A4 print block if possible:

```css
.report-center {
  gap: 16px;
}

.report-workbar {
  display: grid;
  grid-template-columns: minmax(220px, 1.4fr) repeat(6, minmax(130px, 0.7fr)) auto;
  gap: 10px;
  align-items: center;
}

.report-workbar label,
.report-workbar select,
.report-workbar input {
  min-height: 42px;
}

.report-center-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.report-catalog {
  display: grid;
  gap: 18px;
  max-height: calc(100vh - 210px);
  overflow: auto;
}

.report-catalog section {
  display: grid;
  gap: 7px;
}

.report-catalog h2 {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 500;
  text-transform: uppercase;
}

.report-catalog button {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}

.report-catalog button.active {
  border-color: var(--green);
  background: #eef7ef;
}

.report-catalog button span {
  font-weight: 500;
}

.report-catalog button small {
  color: var(--muted);
}

.report-result {
  display: grid;
  gap: 16px;
}

.report-result-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.report-result-header h2 {
  margin: 4px 0;
  font-size: 1.5rem;
  font-weight: 500;
}

.report-result-header p,
.report-result-header span {
  margin: 0;
  color: var(--muted);
}

.report-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.report-comparison-strip {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.report-comparison-strip span {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--muted);
}

.report-table-panel {
  overflow: auto;
}

.report-preview-modal {
  max-width: min(1100px, 96vw);
}

.report-a4-page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
  color: #111;
  padding: 14mm;
  font-family: Arial, sans-serif;
  font-size: 11px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
  print-color-adjust: exact;
}

.report-a4-header {
  display: grid;
  grid-template-columns: 1fr 52mm;
  gap: 12mm;
  border-bottom: 1px solid #111;
  padding-bottom: 7mm;
}

.report-a4-company h1 {
  margin: 0 0 3mm;
  font-size: 18px;
  font-weight: 600;
}

.report-a4-company p {
  margin: 1mm 0;
}

.report-a4-company span {
  font-weight: 600;
}

.report-a4-logo {
  max-width: 26mm;
  max-height: 18mm;
  object-fit: contain;
  margin-bottom: 3mm;
}

.report-a4-document-box {
  border: 1px solid #111;
  padding: 5mm;
  text-align: center;
  align-self: start;
}

.report-a4-document-box h2 {
  margin: 2mm 0;
  font-size: 15px;
  font-weight: 600;
}

.report-a4-filters,
.report-a4-comparison,
.report-a4-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3mm;
  margin-top: 6mm;
}

.report-a4-filters span,
.report-a4-comparison span,
.report-a4-kpis div {
  border: 1px solid #d7d7d7;
  padding: 3mm;
}

.report-a4-filters b,
.report-a4-kpis span {
  display: block;
  color: #555;
  font-weight: 500;
  margin-bottom: 1mm;
}

.report-a4-kpis strong {
  display: block;
  font-size: 14px;
}

.report-a4-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6mm;
}

.report-a4-table th,
.report-a4-table td {
  border-bottom: 1px solid #ddd;
  padding: 2.5mm 2mm;
  text-align: left;
}

.report-a4-table th {
  background: #f2f2f2;
  font-weight: 600;
}

.report-a4-empty {
  border: 1px solid #ddd;
  padding: 5mm;
  text-align: center;
}

.report-a4-footer {
  border-top: 1px solid #111;
  margin-top: 8mm;
  padding-top: 3mm;
  display: flex;
  justify-content: space-between;
  gap: 6mm;
  font-size: 10px;
}

@media (max-width: 1180px) {
  .report-workbar,
  .report-center-layout {
    grid-template-columns: 1fr;
  }

  .report-catalog {
    max-height: none;
  }
}

@media print {
  body:has(.reports-print-scope) .app-shell,
  body:has(.reports-print-scope) .workspace,
  body:has(.reports-print-scope) .screen-frame,
  body:has(.reports-print-scope) .modal-backdrop {
    display: block;
    background: #fff;
  }

  body:has(.reports-print-scope) .sidebar,
  body:has(.reports-print-scope) .topbar,
  body:has(.reports-print-scope) .modal-title-row,
  body:has(.reports-print-scope) .modal-actions {
    display: none !important;
  }

  .reports-print-scope,
  .reports-print-scope * {
    visibility: visible;
  }

  .reports-print-scope .modal-card {
    box-shadow: none;
    border: 0;
    padding: 0;
  }

  .report-a4-page {
    width: 210mm;
    min-height: 297mm;
    box-shadow: none;
    margin: 0;
  }
}
```

- [ ] **Step 4: Regenerate output CSS**

Run:

```bash
npm run build:tailwind
```

Expected: exit 0 and `src/assets/output.css` updated.

- [ ] **Step 5: Run source tests**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assets/tailwind.css src/assets/output.css tests/reportUiSource.test.mjs
git commit -m "style: add report center print layout"
```

---

### Task 6: Final Verification

**Files:**
- Read/check only unless failures require fixes.

- [ ] **Step 1: Run report tests**

Run:

```bash
npm test -- tests/reports.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run UI source tests**

Run:

```bash
npm test -- tests/reportUiSource.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass with 0 failures.

- [ ] **Step 4: Build CSS**

Run:

```bash
npm run build:tailwind
```

Expected: exit 0.

- [ ] **Step 5: Build app**

Run:

```bash
npm run build
```

Expected: Vite build exits 0.

- [ ] **Step 6: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files after all task commits. If generated CSS changed during final verification, commit it with:

```bash
git add src/assets/output.css
git commit -m "chore: refresh generated css"
```

---

## Self-Review

Spec coverage:

- Catalog by module: Task 1 and Task 4.
- Filters by period, shift, category, status, client/query, payment: Task 1 and Task 4.
- Daily report: Task 1.
- Difference between dates: Task 1.
- A4 preview: Task 3 and Task 4.
- Print/PDF: Task 4 and Task 5.
- Excel/CSV: Task 2 and Task 4.
- Tables, KPIs, totals: Task 1 and Task 4.
- Export permissions: Task 4.
- Tests and final verification: Tasks 1 through 6.

Placeholder scan:

- No deferred implementation markers are intentionally left in the plan.
- CSV is explicitly implemented as the Excel-compatible output for this phase.

Type consistency:

- `REPORT_CATALOG`, `buildReportData`, `buildDailyReportData`, `buildDateDifferenceReportData`, `buildReportExportRows`, and `buildReportCsv` use the same names in tests, implementation, and UI.
- Report view models consistently expose `id`, `groupId`, `title`, `mode`, `filters`, `kpis`, `columns`, `rows`, `totals`, `comparison`, and `generatedAt`.
