import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sales operation and finance consume central catalogs', async () => {
  const sales = await readFile('src/components/Vendas.jsx', 'utf8');
  const operation = await readFile('src/components/Operacao.jsx', 'utf8');
  const finance = await readFile('src/components/Financeiro.jsx', 'utf8');
  assert.match(sales, /useCatalog\(CATALOG_KEYS\.PAYMENT_METHODS/);
  assert.doesNotMatch(sales, /const paymentMethods = \[/);
  assert.match(operation, /useCatalog\(CATALOG_KEYS\.OPERATION_SHIFTS/);
  assert.doesNotMatch(operation, /const shiftNames = \[/);
  assert.match(finance, /useCatalog\(CATALOG_KEYS\.EXPENSE_CATEGORIES/);
  assert.match(finance, /useCatalog\(CATALOG_KEYS\.REVENUE_CATEGORIES/);
  assert.match(finance, /useCatalog\(CATALOG_KEYS\.LOSS_REASONS/);
  assert.doesNotMatch(finance, /const expenseCategories = \[/);
});

test('remaining consumers use catalogs and live snapshot settings', async () => {
  const stock = await readFile('src/components/Estoque.jsx', 'utf8');
  const clients = await readFile('src/components/Clientes.jsx', 'utf8');
  const documents = await readFile('src/components/Documentos.jsx', 'utf8');
  const dashboard = await readFile('src/components/Dashboard.jsx', 'utf8');
  const sales = await readFile('src/components/Vendas.jsx', 'utf8');
  const reports = await readFile('src/components/Relatorios.jsx', 'utf8');
  assert.match(stock, /CATALOG_KEYS\.STOCK_UNITS/);
  assert.match(stock, /CATALOG_KEYS\.PRODUCT_LOCATIONS/);
  assert.match(clients, /CATALOG_KEYS\.CLIENT_STATUSES/);
  assert.match(documents, /CATALOG_KEYS\.DOCUMENT_TYPES/);
  assert.match(documents, /CATALOG_KEYS\.DOCUMENT_STATUSES/);
  assert.match(dashboard, /stock\.lowStockThreshold/);
  assert.match(dashboard, /alerts\.dashboardEnabled/);
  assert.doesNotMatch(sales, /getStoredBranding|getStoredInvoiceA4Settings/);
  assert.doesNotMatch(reports, /getStoredBranding|getStoredInvoiceA4Settings/);
  assert.match(sales, /useSettings/);
  assert.match(reports, /useSettings/);
});
