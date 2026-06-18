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
