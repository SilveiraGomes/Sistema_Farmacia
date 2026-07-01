import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ReportA4 renders approved report print sections', async () => {
  const source = await readFile('src/components/ReportA4.jsx', 'utf8');

  assert.match(source, /function ReportA4\(\{ report, branding, settings, printedBy \}\)/);
  assert.match(source, /report-a4-page/);
  assert.match(source, /report-a4-header/);
  assert.match(source, /report-a4-document-box/);
  assert.match(source, /report-a4-data-title/);
  assert.match(source, /documentHeaderText/);
  assert.match(source, /report-a4-table/);
  assert.match(source, /report-a4-footer/);
  assert.doesNotMatch(source, /report-a4-filters/);
  assert.doesNotMatch(source, /report-a4-comparison/);
  assert.doesNotMatch(source, /report-a4-kpis/);
});

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
  assert.match(source, /className="report-period-control"/);
  assert.match(source, /aria-label="Data inicial"/);
  assert.match(source, /aria-label="Data final"/);
  assert.doesNotMatch(source, /compareStartDate/);
  assert.doesNotMatch(source, /compareEndDate/);
  assert.doesNotMatch(source, /paymentMethod/);
  assert.doesNotMatch(source, /report-comparison-strip/);
});

test('report center and print styles are defined', async () => {
  const css = await readFile('src/assets/tailwind.css', 'utf8');

  assert.match(css, /\.report-center/);
  assert.match(css, /\.report-center\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\.report-center\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.report-period-control\s*\{[^}]*width:\s*max-content/s);
  assert.match(css, /\.report-catalog/);
  assert.match(css, /\.report-result-header/);
  assert.match(css, /\.report-table-panel\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /\.reports-print-scope/);
  assert.match(css, /\.report-a4-page/);
  assert.match(css, /\.report-a4-company-text\s*\{[^}]*white-space:\s*pre-line/s);
  assert.match(css, /\.invoice-a4-company-text[^{]*\{[^}]*white-space:\s*pre-line/s);
  assert.match(css, /@media print/);
  assert.match(css, /body:has\(\.reports-print-scope\)/);
});
