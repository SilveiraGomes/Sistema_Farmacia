import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_STOCK_STATUSES,
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

test('buildReportData includes ISO datetime sales inside same-day ranges', () => {
  const report = buildReportData('vendas-detalhadas', {
    sales: [
      { product: 'Venda com hora', category: 'Teste', quantity: 2, revenue: 5000, cost: 2000, date: '2026-06-15T10:00:00', shift: 'Manha', paymentMethod: 'TPA' },
      { product: 'Outro dia', category: 'Teste', quantity: 1, revenue: 9000, cost: 3000, date: '2026-06-16T08:00:00', shift: 'Manha', paymentMethod: 'TPA' },
    ],
  }, {
    startDate: '2026-06-15',
    endDate: '2026-06-15',
  });

  assert.deepEqual(report.rows.map((row) => row.product), ['Venda com hora']);
  assert.equal(report.totals.revenue, 5000);
  assert.equal(report.totals.quantity, 2);
});

test('buildReportData executive summary uses the same sales range as the detailed report', () => {
  const data = {
    sales: [
      { product: 'Dia filtrado', category: 'Teste', quantity: 3, revenue: 3000, cost: 1200, date: '2026-06-15', shift: 'Manha', paymentMethod: 'Dinheiro' },
      { product: 'Fora do dia', category: 'Teste', quantity: 9, revenue: 9000, cost: 3000, date: '2026-06-16', shift: 'Manha', paymentMethod: 'Dinheiro' },
    ],
    losses: [
      { product: 'Dia filtrado', reason: 'Expiracao', quantity: 1, value: 100, date: '2026-06-15', shift: 'Manha' },
      { product: 'Fora do dia', reason: 'Expiracao', quantity: 1, value: 900, date: '2026-06-16', shift: 'Manha' },
    ],
    expenses: [
      { category: 'Servicos', description: 'Dia filtrado', value: 250, date: '2026-06-15', status: 'Paga' },
      { category: 'Servicos', description: 'Fora do dia', value: 800, date: '2026-06-16', status: 'Paga' },
    ],
  };
  const filters = {
    startDate: '2026-06-15',
    endDate: '2026-06-15',
  };

  const summary = buildReportData('resumo-executivo', data, filters);
  const details = buildReportData('vendas-detalhadas', data, filters);

  assert.equal(summary.totals.totalRevenue, details.totals.revenue);
  assert.equal(summary.kpis.find((kpi) => kpi.key === 'transactions').value, details.totals.quantity);
  assert.equal(summary.totals.losses, 100);
  assert.equal(summary.totals.expenses, 250);
});

test('buildReportData generates a financial report for the requested month', () => {
  const finance = buildReportData('demonstrativo-financeiro', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    referenceDate: '2026-06-30',
  });

  assert.equal(finance.totals.netProfit, -225509.1);
});

test('buildReportData financial report excludes rows outside explicit start and end dates', () => {
  const finance = buildReportData('demonstrativo-financeiro', {
    sales: [
      { product: 'Dentro', category: 'Teste', quantity: 1, revenue: 1000, cost: 400, date: '2026-06-30', shift: 'Manha', paymentMethod: 'TPA' },
      { product: 'Antes', category: 'Teste', quantity: 1, revenue: 9000, cost: 100, date: '2026-06-29', shift: 'Manha', paymentMethod: 'TPA' },
      { product: 'Depois', category: 'Teste', quantity: 1, revenue: 8000, cost: 100, date: '2026-07-01', shift: 'Manha', paymentMethod: 'TPA' },
    ],
    losses: [
      { product: 'Dentro', reason: 'Expiracao', quantity: 1, value: 50, date: '2026-06-30', shift: 'Manha' },
      { product: 'Antes', reason: 'Expiracao', quantity: 1, value: 700, date: '2026-06-29', shift: 'Manha' },
    ],
    expenses: [
      { category: 'Servicos', description: 'Dentro', value: 200, date: '2026-06-30', status: 'Paga' },
      { category: 'Servicos', description: 'Depois', value: 600, date: '2026-07-01', status: 'Paga' },
    ],
    otherRevenues: [
      { category: 'Servico', description: 'Dentro', value: 25, date: '2026-06-30', status: 'Paga' },
      { category: 'Servico', description: 'Antes', value: 500, date: '2026-06-29', status: 'Paga' },
    ],
  }, {
    startDate: '2026-06-30',
    endDate: '2026-06-30',
  });

  assert.equal(finance.totals.productRevenue, 1000);
  assert.equal(finance.totals.otherRevenue, 25);
  assert.equal(finance.totals.losses, 50);
  assert.equal(finance.totals.expenses, 200);
  assert.equal(finance.totals.netProfit, 375);
  assert.deepEqual(finance.rows.map((row) => row.value), [1000, 25, 400, 50, 200, 375]);
});

test('buildReportData uses provided reference date instead of a hardcoded fallback', () => {
  const report = buildReportData('resumo-executivo', {
    ...reportData,
    clients: [
      { id: 'CL900', name: 'Novo Cliente', status: 'Activo', createdAt: '2026-07-03', lastPurchase: '03/07/2026', openCredit: 0 },
    ],
  }, {
    referenceDate: '2026-07-03',
  });

  assert.equal(report.generatedAt, '2026-07-03T00:00:00.000Z');
  assert.equal(report.totals.openCredit, 0);
});

test('buildReportData generates stock report with centralized critical statuses', () => {
  const stock = buildReportData('stock-baixo', reportData, {});

  assert.deepEqual(CRITICAL_STOCK_STATUSES, Object.freeze(['Baixo estoque', 'Sem estoque']));
  assert.ok(stock.rows.every((row) => CRITICAL_STOCK_STATUSES.includes(row.status)));
});

test('buildReportData generates clients and documents reports with filters', () => {
  const clientsReport = buildReportData('clientes-credito-aberto', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
  });
  const documentReport = buildReportData('documentos-emitidos', reportData, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    status: 'ANULADO',
  });

  assert.deepEqual(clientsReport.rows.map((row) => row.name), ['Margarida Albuquerque', 'Dominick Yanser']);
  assert.deepEqual(documentReport.rows.map((row) => row.number), ['FAT025/26']);
  assert.equal(documentReport.totals.total, 0);
});

test('buildReportData generates operation report for open day and shift', () => {
  const operation = buildReportData('estado-operacional', {
    ...reportData,
    operationState: {
      canOperate: true,
      day: { data_operacional: '2026-06-18', saldo_inicial: 10000 },
      shift: { nome: 'Manha', saldo_inicial: 5000 },
      message: 'Operacao aberta',
    },
  }, {});

  assert.equal(operation.rows[0].status, 'Aberto');
  assert.equal(operation.rows[0].shift, 'Manha');
  assert.equal(operation.rows[0].canOperate, true);
});

test('buildReportData marks operation as blocked when the day is open without a shift', () => {
  const operation = buildReportData('estado-operacional', {
    ...reportData,
    operationState: {
      canOperate: false,
      day: { data_operacional: '2026-06-18', saldo_inicial: 10000 },
      shift: null,
      message: 'Abra um turno para operar',
    },
  }, {});

  assert.equal(operation.rows[0].status, 'Bloqueado');
  assert.equal(operation.rows[0].shift, '');
  assert.equal(operation.rows[0].canOperate, false);
});
