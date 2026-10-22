import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vendas opens an A4 invoice preview after finalizing a sale', async () => {
  const source = await readFile('src/components/Vendas.jsx', 'utf8');

  assert.match(source, /import InvoiceA4 from '\.\/InvoiceA4'/);
  assert.match(source, /request\('vendas\.create'/); // o documento final vem do backend
  assert.match(source, /buildInvoiceA4ViewModel/);
  assert.match(source, /buildDocumentSettingsFromSnapshot/);
  assert.match(source, /useSettings/);
  // O número fiscal é reservado no backend, na mesma transacção da venda.
  assert.doesNotMatch(source, /configuration\.document\.reserveNumber/);
  assert.doesNotMatch(source, /getStoredInvoiceA4Settings|getStoredBranding/);
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
  assert.match(source, /const RECENT_DOCUMENTS_LIMIT = 5;/);
  assert.match(source, /request\('vendas\.recentDocuments', \{ limit: RECENT_DOCUMENTS_LIMIT \}\)/);
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

test('documentos fiscais usam sempre a série reservada no backend, sem números de recurso', async () => {
  for (const file of ['src/components/Vendas.jsx', 'src/components/Documentos.jsx']) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /documentType: 'nota_credito'/, file);
    assert.doesNotMatch(source, /reserveNumber[^;]*\.catch\(/, file);
  }
  for (const file of ['src/components/Vendas.jsx', 'src/components/Documentos.jsx']) {
    const source = await readFile(file, 'utf8');
    // Venda, conversão e anulação: o backend reserva o número dentro da transacção.
    assert.doesNotMatch(source, /configuration\.document\.reserveNumber/, file);
    assert.doesNotMatch(source, /creditNoteNumber|numero_factura,/, file);
  }
  const documentos = await readFile('src/components/Documentos.jsx', 'utf8');
  assert.match(documentos, /request\('vendas\.convertProforma', \{ venda_id: document\.vendaId \}\)/);
  const vendas = await readFile('src/components/Vendas.jsx', 'utf8');
  // O número previsto vem da série fiscal, não da contagem dos documentos recentes.
  assert.match(vendas, /settings\?\.documents\?\.fiscal\?\.value\?\.series/);
  assert.doesNotMatch(vendas, /recentSaleDocuments\.filter\(\(d\) => d\.type === docType\)/);
});
