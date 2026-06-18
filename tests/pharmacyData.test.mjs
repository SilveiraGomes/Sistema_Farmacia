import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STOCK_OUT_REASONS,
  addStockQuantity,
  buildDashboardMetrics,
  buildDashboardNotifications,
  buildDashboardPeriodChart,
  buildDashboardTopSellers,
  buildClientMetrics,
  buildFinancialOverview,
  buildReportsOverview,
  buildStockFormOptions,
  buildStockImportReference,
  buildStockInventoryCount,
  buildStockListPage,
  buildStockMetrics,
  calculateCartSummary,
  clients,
  formatKwanza,
  financeExpenses,
  financeLosses,
  financeProductSales,
  parseStockImportCsv,
  removeStockQuantity,
  invoices,
  stockItems,
  validateStockCategoryImportRows,
  validateStockProductImportRows,
  validateStockSubcategoryImportRows,
} from '../src/data/pharmacyData.mjs';

test('formatKwanza formats values in the app currency style', () => {
  assert.equal(formatKwanza(1025000), 'KZ 1.025.000,00');
  assert.equal(formatKwanza(2540.3), 'KZ 2.540,30');
});

test('buildDashboardMetrics calculates the visible dashboard totals', () => {
  const metrics = buildDashboardMetrics(invoices, stockItems);

  assert.equal(metrics.totalSold, 1025000);
  assert.equal(metrics.shiftSales, 24840);
  assert.equal(metrics.lowStockCount, 25);
});

test('buildDashboardPeriodChart prepares sales and expense series for dashboard periods', () => {
  const weekChart = buildDashboardPeriodChart({
    sales: financeProductSales,
    expenses: financeExpenses,
  }, { period: 'week', referenceDate: '2026-06-15' });
  const semesterChart = buildDashboardPeriodChart({
    sales: financeProductSales,
    expenses: financeExpenses,
  }, { period: 'semester', referenceDate: '2026-06-15' });

  assert.deepEqual(weekChart.points.map((point) => point.label), ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']);
  assert.equal(weekChart.points[0].sales, 21800.9);
  assert.equal(weekChart.points[0].expenses, 80000);
  assert.equal(weekChart.totals.sales, 28680.9);
  assert.equal(weekChart.totals.expenses, 80000);
  assert.deepEqual(semesterChart.points.map((point) => point.label), ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN']);
  assert.equal(semesterChart.points.at(-1).sales, 46300.9);
  assert.equal(semesterChart.points.at(-1).expenses, 234500);
});

test('buildDashboardTopSellers ranks products for a horizontal chart', () => {
  const sellers = buildDashboardTopSellers(financeProductSales, 3);

  assert.deepEqual(sellers.map((item) => ({
    product: item.product,
    quantity: item.quantity,
    revenue: item.revenue,
    percent: item.percent,
  })), [
    { product: 'Vitamina C', quantity: 9, revenue: 8240, percent: 100 },
    { product: 'C-12 Plus', quantity: 5, revenue: 12701.5, percent: 56 },
    { product: 'Gentamicina', quantity: 5, revenue: 6880, percent: 56 },
  ]);
});

test('buildDashboardNotifications exposes actionable operational alerts', () => {
  const notifications = buildDashboardNotifications({
    invoiceRows: invoices,
    stockRows: stockItems,
    expenseRows: financeExpenses,
  });

  assert.deepEqual(notifications.map((item) => item.id), [
    'stock-out',
    'stock-low',
    'pending-invoices',
    'pending-expenses',
  ]);
  assert.equal(notifications[0].actionLabel, 'Ver estoque');
  assert.match(notifications[2].message, /1 factura/i);
  assert.match(notifications[3].message, /KZ 60.000,00/);
});

test('buildStockMetrics counts stock states and categories', () => {
  const metrics = buildStockMetrics(stockItems);
  const antibiotics = metrics.categories.find((category) => category.name === 'Antibioticos');

  assert.equal(metrics.totalProducts, stockItems.length);
  assert.equal(metrics.lowStock, stockItems.filter((item) => item.status === 'Baixo estoque').length);
  assert.equal(metrics.outOfStock, stockItems.filter((item) => item.status === 'Sem estoque').length);
  assert.deepEqual(antibiotics, { name: 'Antibioticos', count: 7, icon: 'ant' });
});

test('buildStockFormOptions derives unique product categories, subcategories and locations', () => {
  const options = buildStockFormOptions([
    { category: 'Antibioticos', subcategory: 'Antivirais', location: 'Prateleira PT012' },
    { category: 'Antibioticos', subcategory: 'Antivirais', location: 'Prateleira PT012' },
    { category: 'Vitaminas', subcategory: 'Comprimidos', location: 'Gaveta GT025' },
    { category: '', subcategory: null, location: undefined },
  ]);

  assert.deepEqual(options.categories, ['Antibioticos', 'Vitaminas']);
  assert.deepEqual(options.subcategories, ['Antivirais', 'Comprimidos']);
  assert.deepEqual(options.locations, ['Gaveta GT025', 'Prateleira PT012']);
});

test('buildStockListPage paginates stock rows by requested item count', () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({ id: `#${String(index + 1).padStart(4, '0')}` }));
  const page = buildStockListPage(rows, 2, 10);

  assert.equal(page.totalRows, 23);
  assert.equal(page.totalPages, 3);
  assert.equal(page.currentPage, 2);
  assert.deepEqual(page.rows.map((item) => item.id), [
    '#0011',
    '#0012',
    '#0013',
    '#0014',
    '#0015',
    '#0016',
    '#0017',
    '#0018',
    '#0019',
    '#0020',
  ]);
});

test('buildStockInventoryCount compares counted shelf quantities with expected stock', () => {
  const result = buildStockInventoryCount([
    { id: '#0001', name: 'Carbamazepina 50mg', quantity: 125, location: 'Gaveta GT025' },
    { id: '#0002', name: 'Aciclovir 400mg', quantity: 0, location: 'Prateleira PT012' },
    { id: '#0003', name: 'Artemether Forte 480mg', quantity: 840, location: 'Gaveta GT020' },
  ], {
    '#0001': '125',
    '#0002': '3',
    '#0003': '830',
  });

  assert.equal(result.totalItems, 3);
  assert.equal(result.correctItems, 1);
  assert.equal(result.differenceItems, 2);
  assert.equal(result.hasDifferences, true);
  assert.deepEqual(result.rows.map((item) => ({
    id: item.id,
    expected: item.expected,
    counted: item.counted,
    difference: item.difference,
    status: item.status,
  })), [
    { id: '#0001', expected: 125, counted: 125, difference: 0, status: 'Correto' },
    { id: '#0002', expected: 0, counted: 3, difference: 3, status: 'Com diferenca' },
    { id: '#0003', expected: 840, counted: 830, difference: -10, status: 'Com diferenca' },
  ]);
});

test('buildStockImportReference lists categories before their subcategories', () => {
  const reference = buildStockImportReference([
    { category: 'Antibioticos', subcategory: 'Comprimidos' },
    { category: 'Antibioticos', subcategory: 'Antivirais' },
    { category: 'Vitaminas', subcategory: 'Analgesicos' },
    { category: 'Vitaminas', subcategory: 'Analgesicos' },
  ]);

  assert.deepEqual(reference.categories, ['Antibioticos', 'Vitaminas']);
  assert.deepEqual(reference.subcategories, [
    { category: 'Antibioticos', name: 'Antivirais' },
    { category: 'Antibioticos', name: 'Comprimidos' },
    { category: 'Vitaminas', name: 'Analgesicos' },
  ]);
});

test('parseStockImportCsv maps common spreadsheet headers to product fields', () => {
  const rows = parseStockImportCsv(
    'Codigo,Designacao,Categoria,Subcategoria,Preco,Data Expiracao,Localizacao\n' +
    '#9001,Produto Teste,Antibioticos,Comprimidos,1200,31/12/2028,Gaveta GT001',
  );

  assert.deepEqual(rows, [
    {
      id: '#9001',
      name: 'Produto Teste',
      category: 'Antibioticos',
      subcategory: 'Comprimidos',
      price: '1200',
      expiry: '31/12/2028',
      location: 'Gaveta GT001',
    },
  ]);
});

test('validateStockProductImportRows rejects unknown categories and subcategories', () => {
  const result = validateStockProductImportRows([
    {
      id: '#9001',
      name: 'Produto Teste',
      category: 'Antibioticos',
      subcategory: 'Comprimidos',
      price: '1200',
      expiry: '31/12/2028',
      location: 'Gaveta GT001',
    },
    {
      id: '#9002',
      name: 'Produto Sem Categoria',
      category: 'Categoria Nova',
      subcategory: 'Comprimidos',
      price: '900',
      expiry: '31/12/2028',
      location: 'Gaveta GT002',
    },
    {
      id: '#9003',
      name: 'Produto Sem Subcategoria',
      category: 'Antibioticos',
      subcategory: 'Subcategoria Nova',
      price: '900',
      expiry: '31/12/2028',
      location: 'Gaveta GT003',
    },
  ], stockItems);

  assert.equal(result.acceptedRows.length, 1);
  assert.equal(result.acceptedRows[0].quantity, 0);
  assert.equal(result.acceptedRows[0].status, 'Sem estoque');
  assert.deepEqual(result.missingCategories, ['Categoria Nova']);
  assert.deepEqual(result.missingSubcategories, [
    { category: 'Antibioticos', name: 'Subcategoria Nova' },
  ]);
  assert.equal(result.rejectedRows.length, 2);
});

test('validateStockCategoryImportRows inserts only new category names', () => {
  const result = validateStockCategoryImportRows([
    { name: 'Antibioticos' },
    { categoria: 'Ortopedia' },
    { categoria: '' },
  ], ['Antibioticos']);

  assert.deepEqual(result.acceptedRows, [{ name: 'Ortopedia' }]);
  assert.deepEqual(result.rejectedRows.map((row) => row.reason), [
    'Categoria ja existe.',
    'Informe o nome da categoria.',
  ]);
});

test('validateStockSubcategoryImportRows rejects subcategories without existing category', () => {
  const result = validateStockSubcategoryImportRows([
    { category: 'Antibioticos', subcategory: 'Injetaveis' },
    { category: 'Categoria Nova', subcategory: 'Teste' },
    { category: 'Antibioticos', subcategory: 'Comprimidos' },
  ], stockItems);

  assert.deepEqual(result.acceptedRows, [
    { category: 'Antibioticos', name: 'Injetaveis' },
  ]);
  assert.deepEqual(result.missingCategories, ['Categoria Nova']);
  assert.deepEqual(result.rejectedRows.map((row) => row.reason), [
    'Categoria nao encontrada.',
    'Subcategoria ja existe nesta categoria.',
  ]);
});

test('addStockQuantity increases product stock and refreshes status', () => {
  const rows = addStockQuantity(stockItems, '#0002', 12, 'Reposicao de fornecedor');
  const product = rows.find((item) => item.id === '#0002');

  assert.equal(product.quantity, 12);
  assert.equal(product.status, 'Baixo estoque');
  assert.deepEqual(product.lastStockMovement, {
    type: 'entrada',
    quantity: 12,
    reason: 'Reposicao de fornecedor',
  });
});

test('removeStockQuantity lowers product stock with a required reason', () => {
  assert.ok(STOCK_OUT_REASONS.includes('Furto'));

  const rows = removeStockQuantity(stockItems, '#0001', 130, 'Furto');
  const product = rows.find((item) => item.id === '#0001');

  assert.equal(product.quantity, 0);
  assert.equal(product.status, 'Sem estoque');
  assert.deepEqual(product.lastStockMovement, {
    type: 'baixa',
    quantity: 125,
    reason: 'Furto',
  });
});

test('removeStockQuantity rejects stock decreases without a valid reason', () => {
  assert.throws(
    () => removeStockQuantity(stockItems, '#0001', 2, ''),
    /motivo/i,
  );
});

test('calculateCartSummary applies discount before total', () => {
  const summary = calculateCartSummary([
    { quantity: 2, price: 2540.3 },
    { quantity: 1, price: 540.3 },
  ], 580.2);

  assert.equal(summary.subtotal, 5620.9);
  assert.equal(summary.discount, 580.2);
  assert.equal(summary.total, 5040.7);
});

test('buildFinancialOverview calculates monthly product gains, losses and business expenses', () => {
  const overview = buildFinancialOverview({
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
  }, { period: 'month', referenceDate: '2026-06-15' });

  const c12Plus = overview.productGains.find((item) => item.product === 'C-12 Plus');

  assert.equal(overview.totals.revenue, 46300.9);
  assert.equal(overview.totals.productCost, 29170);
  assert.equal(overview.totals.grossProfit, 17130.9);
  assert.equal(overview.totals.losses, 11640);
  assert.equal(overview.totals.expenses, 234500);
  assert.equal(overview.totals.netProfit, -229009.1);
  assert.deepEqual(c12Plus, {
    product: 'C-12 Plus',
    quantity: 5,
    revenue: 12701.5,
    cost: 9000,
    profit: 3701.5,
    margin: 29.14,
  });
});

test('buildFinancialOverview filters gains by week and shift', () => {
  const weekOverview = buildFinancialOverview({
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
  }, { period: 'week', referenceDate: '2026-06-15' });
  const shiftOverview = buildFinancialOverview({
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
  }, { period: 'shift', referenceDate: '2026-06-15', shift: 'Manha' });

  assert.equal(weekOverview.totals.revenue, 28680.9);
  assert.equal(weekOverview.shiftBreakdown.find((item) => item.shift === 'Manha').grossProfit, 5940.9);
  assert.equal(shiftOverview.totals.revenue, 15860.9);
  assert.deepEqual(shiftOverview.productGains.map((item) => item.product), ['Vitamina C', 'C-12 Plus']);
});

test('buildFinancialOverview combines automatic finance data with manual entries', () => {
  const overview = buildFinancialOverview({
    sales: [
      { product: 'Teste A', category: 'Teste', quantity: 2, revenue: 2000, cost: 1200, date: '2026-06-15', shift: 'Manha' },
    ],
    losses: [
      { product: 'Teste A', reason: 'Expiracao', quantity: 1, value: 500, date: '2026-06-15', shift: 'Manha' },
    ],
    expenses: [
      { category: 'Servicos', description: 'Energia', value: 300, date: '2026-06-15', status: 'Paga' },
    ],
    otherRevenues: [
      { category: 'Servico', description: 'Entrega ao domicilio', value: 150, date: '2026-06-15', status: 'Paga' },
    ],
  }, { period: 'shift', referenceDate: '2026-06-15', shift: 'Manha' });

  assert.equal(overview.totals.productRevenue, 2000);
  assert.equal(overview.totals.otherRevenue, 150);
  assert.equal(overview.totals.revenue, 2150);
  assert.equal(overview.totals.grossProfit, 950);
  assert.equal(overview.totals.netProfit, 150);
});

test('buildFinancialOverview groups sales entries by payment method', () => {
  const overview = buildFinancialOverview({
    sales: [
      { product: 'Teste A', quantity: 1, revenue: 1000, cost: 500, date: '2026-06-15', shift: 'Manha', paymentMethod: 'Dinheiro' },
      { product: 'Teste B', quantity: 1, revenue: 2500, cost: 1000, date: '2026-06-15', shift: 'Manha', paymentMethod: 'TPA' },
      { product: 'Teste C', quantity: 1, revenue: 1200, cost: 600, date: '2026-06-15', shift: 'Tarde', paymentMethod: 'Transferencia' },
    ],
    losses: [],
    expenses: [],
    otherRevenues: [],
  }, { period: 'day', referenceDate: '2026-06-15' });

  assert.deepEqual(overview.paymentBreakdown, [
    { method: 'Dinheiro', value: 1000, count: 1 },
    { method: 'TPA', value: 2500, count: 1 },
    { method: 'Transferencia', value: 1200, count: 1 },
    { method: 'Credito', value: 0, count: 0 },
  ]);
});

test('buildClientMetrics derives active clients, purchases and open credit', () => {
  const metrics = buildClientMetrics(clients, '2026-06-15');

  assert.deepEqual(metrics, {
    activeClients: 3,
    purchasesToday: 2,
    openCredit: 165000,
    newThisMonth: 2,
  });
});

test('buildReportsOverview combines sales, finance, stock and clients into report cards', () => {
  const overview = buildReportsOverview({
    clients,
    stockRows: stockItems,
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
  }, { referenceDate: '2026-06-15' });

  assert.equal(overview.sales.totalRevenue, 46300.9);
  assert.equal(overview.sales.totalQuantity, 28);
  assert.equal(overview.finance.netProfit, -225509.1);
  assert.equal(overview.stock.outOfStock, 3);
  assert.equal(overview.clients.openCredit, 165000);
  assert.deepEqual(overview.topProducts.map((item) => item.product).slice(0, 2), ['Vitamina C', 'C-12 Plus']);
});
