import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vendas opens an A4 invoice preview after finalizing a sale', async () => {
  const source = await readFile('src/components/Vendas.jsx', 'utf8');

  assert.match(source, /import InvoiceA4 from '\.\/InvoiceA4'/);
  assert.match(source, /buildFinalizedSaleDocument/);
  assert.match(source, /buildInvoiceA4ViewModel/);
  assert.match(source, /getStoredInvoiceA4Settings/);
  assert.match(source, /getStoredBranding/);
  assert.match(source, /finalizedDocument/);
  assert.match(source, /function finalizeSale/);
  assert.match(source, /<InvoiceA4 viewModel=\{viewModel\} \/>/);
});

test('Vendas lists the latest five sale documents after held clients', async () => {
  const source = await readFile('src/components/Vendas.jsx', 'utf8');
  const heldIndex = source.indexOf('<HeldSalesTable');
  const recentIndex = source.indexOf('<RecentSaleDocumentsTable');

  assert.notEqual(heldIndex, -1);
  assert.notEqual(recentIndex, -1);
  assert.ok(recentIndex > heldIndex);
  assert.match(source, /buildRecentSaleDocuments/);
  assert.match(source, /recentSaleDocuments/);
  assert.match(source, /Ultimos 5 Documentos de Vendas/);
  assert.match(source, /function RecentSaleDocumentsTable/);
  assert.match(source, /onOpenDocument\(document\)/);
});

test('Vendas starts invoices with final consumer until a client is selected', async () => {
  const source = await readFile('src/components/Vendas.jsx', 'utf8');
  const workflowSource = await readFile('src/data/salesWorkflow.mjs', 'utf8');

  assert.match(source, /DEFAULT_SALE_CLIENT/);
  assert.match(source, /useState\(DEFAULT_SALE_CLIENT\)/);
  assert.match(source, /selectedClient\?\.nif/);
  assert.match(workflowSource, /Consumidor Final/);
  assert.match(workflowSource, /9999999999/);
  assert.doesNotMatch(source, /useState\(clients\[0\]\)/);
});
