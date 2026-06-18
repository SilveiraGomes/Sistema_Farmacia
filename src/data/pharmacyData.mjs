export const categories = [
  { id: 1, name: 'Medicamentos', icon: 'capsule', count: 380 },
  { id: 2, name: 'Material Clinico', icon: 'kit', count: 155 },
  { id: 3, name: 'Suplementos', icon: 'vitamin', count: 67 },
  { id: 4, name: 'Cosmeticos', icon: 'cosmetic', count: 25 },
];

export const stockCategories = [
  { name: 'Antibioticos', count: 98, icon: 'pills' },
  { name: 'Suplementos', count: 67, icon: 'bottle' },
  { name: 'Vitaminas', count: 102, icon: 'jar' },
  { name: 'Cosmeticos', count: 25, icon: 'cosmetic' },
  { name: 'Dermatology/Corticosteroids', count: 56, icon: 'cream' },
  { name: 'Penso Diario', count: 35, icon: 'pad' },
  { name: 'Ataduras e Faixas', count: 80, icon: 'bandage' },
  { name: 'Material de Injecao', count: 25, icon: 'syringe' },
];

export const products = [
  { id: 1, name: 'C-12 Plus', category: 'Medicamentos', price: 2540.3, stock: 125, imageTone: 'orange' },
  { id: 2, name: 'Cloranfenicol', category: 'Medicamentos', price: 1980, stock: 44, imageTone: 'blue' },
  { id: 3, name: 'Coartem', category: 'Medicamentos', price: 2540.3, stock: 23, imageTone: 'yellow' },
  { id: 4, name: 'Cotrimoxazol', category: 'Medicamentos', price: 540.3, stock: 3, imageTone: 'red' },
  { id: 5, name: 'Clavamox', category: 'Medicamentos', price: 6800, stock: 53, imageTone: 'silver' },
  { id: 6, name: 'Cefalexina', category: 'Medicamentos', price: 2000, stock: 18, imageTone: 'green' },
  { id: 7, name: 'Tetraciclina 500mg', category: 'Medicamentos', price: 3600.95, stock: 41, imageTone: 'purple' },
  { id: 8, name: 'Gentamicina', category: 'Material Clinico', price: 1250, stock: 30, imageTone: 'teal' },
  { id: 9, name: 'Vitamina C', category: 'Suplementos', price: 900, stock: 75, imageTone: 'orange' },
  { id: 10, name: 'Agil-C Plus', category: 'Suplementos', price: 2540.3, stock: 23, imageTone: 'orange' },
  { id: 11, name: 'Gel Dermico', category: 'Cosmeticos', price: 1500, stock: 18, imageTone: 'pink' },
  { id: 12, name: 'Luvas Clinicas', category: 'Material Clinico', price: 700, stock: 200, imageTone: 'blue' },
];

export const stockItems = [
  { id: '#0001', name: 'Carbamazepina 50mg', quantity: 125, price: 2535.5, expiry: '15/09/2026', status: 'Em estoque', location: 'Gaveta GT025', category: 'Antibioticos', subcategory: 'Comprimidos' },
  { id: '#0002', name: 'Aciclovir 400mg', quantity: 0, price: 4505.7, expiry: '15/03/2025', status: 'Sem estoque', location: 'Prateleira PT012', category: 'Antibioticos', subcategory: 'Antivirais' },
  { id: '#0003', name: 'Artemether Forte 480mg', quantity: 840, price: 2000, expiry: '25/10/2027', status: 'Em estoque', location: 'Gaveta GT020', category: 'Antibioticos', subcategory: 'Antimalaricos' },
  { id: '#0004', name: 'Aspirina', quantity: 410, price: 3600.95, expiry: '10/03/2027', status: 'Em estoque', location: 'Prateleira PT025', category: 'Vitaminas', subcategory: 'Analgesicos' },
  { id: '#0005', name: 'Artemether 40mg', quantity: 25, price: 2535.5, expiry: '11/11/2026', status: 'Baixo estoque', location: 'Prateleira PT018', category: 'Antibioticos', subcategory: 'Antimalaricos' },
  { id: '#0006', name: 'Artemether 80mg', quantity: 0, price: 4505.7, expiry: '15/03/2026', status: 'Sem estoque', location: 'Prateleira PT028', category: 'Antibioticos', subcategory: 'Antimalaricos' },
  { id: '#0007', name: 'Acido Benzoico + Acido Salicilico', quantity: 98, price: 2000, expiry: '1/12/2026', status: 'Em estoque', location: 'Prateleira PT012', category: 'Dermatology/Corticosteroids', subcategory: 'Pomadas' },
  { id: '#0008', name: 'Anti-hemorroidal', quantity: 90, price: 3600.95, expiry: '12/01/2028', status: 'Em estoque', location: 'Prateleira PT005', category: 'Dermatology/Corticosteroids', subcategory: 'Supositorios' },
  { id: '#0009', name: 'Azitromicina 500mg', quantity: 64, price: 4850, expiry: '18/08/2027', status: 'Em estoque', location: 'Prateleira PT014', category: 'Antibioticos', subcategory: 'Comprimidos' },
  { id: '#0010', name: 'Amoxicilina 875mg', quantity: 22, price: 3900, expiry: '04/04/2027', status: 'Baixo estoque', location: 'Gaveta GT010', category: 'Antibioticos', subcategory: 'Comprimidos' },
  { id: '#0011', name: 'Ibuprofeno 400mg', quantity: 118, price: 1200, expiry: '21/02/2028', status: 'Em estoque', location: 'Prateleira PT021', category: 'Vitaminas', subcategory: 'Analgesicos' },
  { id: '#0012', name: 'Paracetamol 500mg', quantity: 240, price: 950, expiry: '30/06/2028', status: 'Em estoque', location: 'Prateleira PT022', category: 'Vitaminas', subcategory: 'Analgesicos' },
  { id: '#0013', name: 'Soro Fisiologico 500ml', quantity: 52, price: 850, expiry: '12/12/2027', status: 'Em estoque', location: 'Prateleira PT040', category: 'Material de Injecao', subcategory: 'Solucoes' },
  { id: '#0014', name: 'Seringa 5ml', quantity: 480, price: 120, expiry: '01/01/2029', status: 'Em estoque', location: 'Gaveta GT033', category: 'Material de Injecao', subcategory: 'Seringas' },
  { id: '#0015', name: 'Compressas Esterilizadas', quantity: 16, price: 750, expiry: '19/10/2027', status: 'Baixo estoque', location: 'Prateleira PT031', category: 'Penso Diario', subcategory: 'Compressas' },
  { id: '#0016', name: 'Atadura Elasticas 10cm', quantity: 73, price: 1300, expiry: '22/05/2028', status: 'Em estoque', location: 'Prateleira PT034', category: 'Ataduras e Faixas', subcategory: 'Ataduras' },
  { id: '#0017', name: 'Omeprazol 20mg', quantity: 135, price: 2100, expiry: '03/09/2027', status: 'Em estoque', location: 'Gaveta GT017', category: 'Gastrointestinal', subcategory: 'Capsulas' },
  { id: '#0018', name: 'Metformina 850mg', quantity: 88, price: 2750, expiry: '14/11/2027', status: 'Em estoque', location: 'Gaveta GT029', category: 'Antidiabeticos', subcategory: 'Comprimidos' },
  { id: '#0019', name: 'Losartan 50mg', quantity: 19, price: 3200, expiry: '17/07/2027', status: 'Baixo estoque', location: 'Gaveta GT030', category: 'Cardiologia', subcategory: 'Comprimidos' },
  { id: '#0020', name: 'Salbutamol Inalador', quantity: 34, price: 6800, expiry: '08/03/2027', status: 'Em estoque', location: 'Prateleira PT044', category: 'Respiratorio', subcategory: 'Inaladores' },
  { id: '#0021', name: 'Loratadina 10mg', quantity: 57, price: 1800, expiry: '29/08/2028', status: 'Em estoque', location: 'Prateleira PT018', category: 'Antialergicos', subcategory: 'Comprimidos' },
  { id: '#0022', name: 'Betametasona Creme', quantity: 12, price: 2450, expiry: '06/06/2027', status: 'Baixo estoque', location: 'Prateleira PT009', category: 'Dermatology/Corticosteroids', subcategory: 'Pomadas' },
  { id: '#0023', name: 'Protetor Solar FPS50', quantity: 38, price: 7200, expiry: '15/01/2028', status: 'Em estoque', location: 'Prateleira PT052', category: 'Cosmeticos', subcategory: 'Dermocosmeticos' },
  { id: '#0024', name: 'Vitamina D3 2000UI', quantity: 66, price: 5100, expiry: '10/10/2028', status: 'Em estoque', location: 'Prateleira PT061', category: 'Suplementos', subcategory: 'Vitaminas' },
  { id: '#0025', name: 'Zinco 20mg', quantity: 0, price: 2600, expiry: '02/02/2027', status: 'Sem estoque', location: 'Prateleira PT062', category: 'Suplementos', subcategory: 'Minerais' },
  { id: '#0026', name: 'Termometro Digital', quantity: 27, price: 4500, expiry: '31/12/2030', status: 'Em estoque', location: 'Balcao BC001', category: 'Material Clinico', subcategory: 'Equipamentos' },
];

export const STOCK_OUT_REASONS = [
  'Expiracao',
  'Danificado',
  'Furto',
  'Consumo interno',
  'Obsolescencia',
  'Outro',
];

export const invoices = [
  { number: 'FAT025/26', items: 'Paracetamol (2), Vitamina C (3), Amoxicilina (2)', value: 2535.5, status: 'PAGO', client: 'Joao de Almeida' },
  { number: 'FAT024/26', items: 'Cotrimoxazol (1), Tetraciclina Pomada (2), Vitamina C (2)', value: 4505.7, status: 'EM ESPERA', client: 'Margarida Albuquerque' },
  { number: 'FAT023/26', items: 'Preservativo (2), Germol (1), C-12 Plus (2)', value: 2000, status: 'PAGO', client: 'Dominick Yanser' },
  { number: 'FAT022/26', items: 'Cefalexina (1), Clavamox (1)', value: 3600.95, status: 'PAGO', client: 'Ana Luisa' },
];

export const bestSellers = [
  'C-12 Plus',
  'Ciprofloxacina 5%',
  'Cloranfenicol',
  'Coartem',
  'Cotrimoxazol 480mg',
  'Clavamox Susp250mg',
  'Cefalexina',
  'Tetraciclina 500mg',
  'Espectinomicina',
  'Gentamicina',
];

export const clients = [
  { id: 'CL001', name: 'Joao de Almeida', phone: '+244 923 100 200', nif: '5001234567', status: 'Activo', lastPurchase: '15/06/2026', createdAt: '2026-01-20', totalPurchases: 19, openCredit: 0 },
  { id: 'CL002', name: 'Margarida Albuquerque', phone: '+244 924 330 440', nif: '5009876543', status: 'Activo', lastPurchase: '15/06/2026', createdAt: '2026-03-04', totalPurchases: 12, openCredit: 45000 },
  { id: 'CL003', name: 'Dominick Yanser', phone: '+244 926 500 780', nif: '5012340099', status: 'Pendente', lastPurchase: '09/06/2026', createdAt: '2026-06-02', totalPurchases: 4, openCredit: 120000 },
  { id: 'CL004', name: 'Ana Luisa', phone: '+244 929 444 118', nif: '5004455667', status: 'Activo', lastPurchase: '08/06/2026', createdAt: '2026-06-10', totalPurchases: 7, openCredit: 0 },
];

export const transactions = [
  { id: 1, type: 'Receita', description: 'Venda diaria', value: 500000, date: '2026-06-11', status: 'Paga' },
  { id: 2, type: 'Despesa', description: 'Pagamento fornecedor MedAngola', value: 150000, date: '2026-06-10', status: 'Paga' },
  { id: 3, type: 'Receita', description: 'Vendas em POS', value: 320000, date: '2026-06-10', status: 'Paga' },
  { id: 4, type: 'Despesa', description: 'Aluguer da loja', value: 120000, date: '2026-06-15', status: 'Pendente' },
];

export const financeProductSales = [
  { id: 'FS001', product: 'C-12 Plus', category: 'Medicamentos', quantity: 3, revenue: 7620.9, cost: 5400, date: '2026-06-15', shift: 'Manha', paymentMethod: 'Dinheiro' },
  { id: 'FS002', product: 'Vitamina C', category: 'Suplementos', quantity: 9, revenue: 8240, cost: 4520, date: '2026-06-15', shift: 'Manha', paymentMethod: 'TPA' },
  { id: 'FS003', product: 'Cloranfenicol', category: 'Medicamentos', quantity: 3, revenue: 5940, cost: 3900, date: '2026-06-15', shift: 'Tarde', paymentMethod: 'Transferencia' },
  { id: 'FS004', product: 'Gentamicina', category: 'Material Clinico', quantity: 5, revenue: 6880, cost: 4300, date: '2026-06-16', shift: 'Tarde', paymentMethod: 'Credito' },
  { id: 'FS005', product: 'C-12 Plus', category: 'Medicamentos', quantity: 2, revenue: 5080.6, cost: 3600, date: '2026-06-10', shift: 'Noite', paymentMethod: 'Dinheiro' },
  { id: 'FS006', product: 'Coartem', category: 'Medicamentos', quantity: 3, revenue: 7620.9, cost: 5200, date: '2026-06-11', shift: 'Tarde', paymentMethod: 'TPA' },
  { id: 'FS007', product: 'Gel Dermico', category: 'Cosmeticos', quantity: 3, revenue: 4918.5, cost: 2250, date: '2026-06-05', shift: 'Manha', paymentMethod: 'Dinheiro' },
];

export const financeLosses = [
  { id: 'FL001', product: 'C-12 Plus', reason: 'Expiracao', quantity: 1, value: 2540, date: '2026-06-15', shift: 'Manha' },
  { id: 'FL002', product: 'Gel Dermico', reason: 'Danificado', quantity: 1, value: 1500, date: '2026-06-13', shift: 'Tarde' },
  { id: 'FL003', product: 'Clavamox', reason: 'Expiracao', quantity: 1, value: 6800, date: '2026-06-08', shift: 'Manha' },
  { id: 'FL004', product: 'Luvas Clinicas', reason: 'Consumo interno', quantity: 2, value: 800, date: '2026-06-05', shift: 'Noite' },
];

export const financeExpenses = [
  { id: 'FE001', category: 'Infraestrutura', description: 'Aluguer da loja', value: 120000, date: '2026-06-01', status: 'Paga' },
  { id: 'FE002', category: 'Recursos Humanos', description: 'Salarios e turnos', value: 80000, date: '2026-06-15', status: 'Paga' },
  { id: 'FE003', category: 'Servicos', description: 'Energia e agua', value: 34500, date: '2026-06-12', status: 'Paga' },
  { id: 'FE004', category: 'Fornecedores', description: 'Pagamento pendente fornecedor', value: 60000, date: '2026-06-18', status: 'Pendente' },
];

export const financeOtherRevenues = [
  { id: 'FR001', category: 'Servico', description: 'Entrega ao domicilio', value: 3500, date: '2026-06-14', status: 'Paga', source: 'Manual' },
];

export const PAYMENT_METHODS = ['Dinheiro', 'TPA', 'Transferencia', 'Credito'];

export const users = [
  { id: 1, name: 'Antonio Tomas', role: 'Administrador', email: 'antonio@esayos.local', status: 'Online' },
  { id: 2, name: 'Carla Mateus', role: 'Farmaceutica', email: 'carla@esayos.local', status: 'Activo' },
  { id: 3, name: 'Edson Pedro', role: 'Caixa', email: 'edson@esayos.local', status: 'Activo' },
  { id: 4, name: 'Marta Silva', role: 'Gestora de Stock', email: 'marta@esayos.local', status: 'Inactivo' },
];

export const salesChart = [
  { label: 'JAN', value: 46 },
  { label: 'FEV', value: 58 },
  { label: 'MAR', value: 74 },
  { label: 'ABR', value: 58 },
  { label: 'MAI', value: 64 },
  { label: 'JUN', value: 84 },
  { label: 'JUL', value: 28 },
  { label: 'AGO', value: 58 },
  { label: 'SET', value: 74 },
  { label: 'OUT', value: 64 },
  { label: 'NOV', value: 78 },
  { label: 'DEZ', value: 74 },
];

export function formatKwanza(value, options = {}) {
  const hasCents = options.cents ?? true;
  const formatted = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(Number(value));

  return `KZ ${formatted}`;
}

export function calculateCartSummary(items, discount = 0, taxRate = 0) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0));
  const tax = roundMoney(subtotal * taxRate);
  const total = roundMoney(subtotal + tax - Number(discount));

  return {
    subtotal,
    discount: Number(discount),
    tax,
    total,
  };
}

export function buildDashboardMetrics(invoiceRows = invoices, stockRows = stockItems) {
  return {
    totalSold: 1025000,
    totalTransactions: 150,
    shiftSales: 24840,
    shiftTransactions: 9,
    lowStockCount: 25,
    lowStockLabel: 'Produtos',
    pendingInvoices: invoiceRows.filter((invoice) => invoice.status === 'EM ESPERA').length,
    outOfStockRows: stockRows.filter((item) => item.status === 'Sem estoque').length,
  };
}

export function buildDashboardPeriodChart(
  data = {
    sales: financeProductSales,
    expenses: financeExpenses,
  },
  options = {},
) {
  const period = options.period ?? 'month';
  const referenceDate = options.referenceDate ?? '2026-06-15';
  const buckets = resolveDashboardChartBuckets(period, referenceDate);
  const paidExpenses = (data.expenses ?? []).filter((expense) => expense.status === 'Paga');
  const points = buckets.map((bucket) => ({
    label: bucket.label,
    sales: sumRowsByBucket(data.sales ?? [], 'revenue', bucket),
    expenses: sumRowsByBucket(paidExpenses, 'value', bucket),
  }));
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.sales, point.expenses]));
  const normalizedPoints = points.map((point) => ({
    ...point,
    salesPercent: Math.round((point.sales / maxValue) * 100),
    expensesPercent: Math.round((point.expenses / maxValue) * 100),
  }));

  return {
    period,
    label: resolveDashboardPeriodLabel(period),
    points: normalizedPoints,
    totals: {
      sales: roundMoney(normalizedPoints.reduce((sum, point) => sum + point.sales, 0)),
      expenses: roundMoney(normalizedPoints.reduce((sum, point) => sum + point.expenses, 0)),
    },
  };
}

export function buildDashboardTopSellers(salesRows = financeProductSales, limit = 6) {
  const grouped = Array.from(
    salesRows.reduce((groups, item) => {
      const current = groups.get(item.product) ?? {
        product: item.product,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += Number(item.quantity ?? 0);
      current.revenue = roundMoney(current.revenue + Number(item.revenue ?? 0));
      groups.set(item.product, current);
      return groups;
    }, new Map()).values(),
  ).sort((first, second) =>
    second.quantity - first.quantity ||
    second.revenue - first.revenue ||
    first.product.localeCompare(second.product, 'pt-AO'),
  );
  const visible = grouped.slice(0, Math.max(1, Number(limit) || 6));
  const maxQuantity = Math.max(1, ...visible.map((item) => item.quantity));

  return visible.map((item) => ({
    ...item,
    percent: Math.round((item.quantity / maxQuantity) * 100),
  }));
}

export function buildDashboardNotifications({
  invoiceRows = invoices,
  stockRows = stockItems,
  expenseRows = financeExpenses,
} = {}) {
  const outOfStock = stockRows.filter((item) => item.status === 'Sem estoque');
  const lowStock = stockRows.filter((item) => item.status === 'Baixo estoque');
  const pendingInvoices = invoiceRows.filter((invoice) => invoice.status === 'EM ESPERA');
  const pendingExpenses = expenseRows.filter((expense) => expense.status === 'Pendente');
  const pendingExpenseTotal = sumMoney(pendingExpenses, 'value');
  const notifications = [];

  if (outOfStock.length) {
    notifications.push({
      id: 'stock-out',
      severity: 'danger',
      title: 'Produtos sem estoque',
      message: `${outOfStock.length} produtos precisam de reposicao imediata.`,
      detail: outOfStock.slice(0, 3).map((item) => item.name).join(', '),
      actionLabel: 'Ver estoque',
      actionView: 'estoque',
    });
  }

  if (lowStock.length) {
    notifications.push({
      id: 'stock-low',
      severity: 'warning',
      title: 'Estoque baixo',
      message: `${lowStock.length} produtos estao abaixo do nivel recomendado.`,
      detail: lowStock.slice(0, 3).map((item) => item.name).join(', '),
      actionLabel: 'Ver estoque',
      actionView: 'estoque',
    });
  }

  if (pendingInvoices.length) {
    notifications.push({
      id: 'pending-invoices',
      severity: 'info',
      title: 'Facturas em espera',
      message: `${pendingInvoices.length} factura${pendingInvoices.length === 1 ? '' : 's'} aguardam pagamento ou conclusao.`,
      detail: pendingInvoices.map((invoice) => invoice.number).join(', '),
      actionLabel: 'Ver vendas',
      actionView: 'vendas',
    });
  }

  if (pendingExpenses.length) {
    notifications.push({
      id: 'pending-expenses',
      severity: 'warning',
      title: 'Despesas pendentes',
      message: `${formatKwanza(pendingExpenseTotal)} em despesas ainda pendentes.`,
      detail: pendingExpenses.slice(0, 3).map((expense) => expense.description).join(', '),
      actionLabel: 'Ver financas',
      actionView: 'financeiro',
    });
  }

  return notifications;
}

export function buildFinancialOverview(
  data = {
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
    otherRevenues: financeOtherRevenues,
  },
  options = {},
) {
  const period = options.period ?? 'month';
  const referenceDate = options.referenceDate ?? '2026-06-15';
  const selectedShift = options.shift ?? 'Todos';
  const periodRange = resolveFinancialPeriod(period, referenceDate);
  const matchesPeriod = (row) => isDateInRange(row.date, periodRange.start, periodRange.end);
  const matchesShift = (row) => period !== 'shift' || selectedShift === 'Todos' || row.shift === selectedShift;
  const sales = (data.sales ?? []).filter((row) => matchesPeriod(row) && matchesShift(row));
  const losses = (data.losses ?? []).filter((row) => matchesPeriod(row) && matchesShift(row));
  const expenses = (data.expenses ?? []).filter((row) => matchesPeriod(row) && row.status === 'Paga');
  const pendingExpenses = (data.expenses ?? []).filter((row) => matchesPeriod(row) && row.status === 'Pendente');
  const otherRevenues = (data.otherRevenues ?? []).filter((row) => matchesPeriod(row) && row.status === 'Paga');
  const productRevenue = sumMoney(sales, 'revenue');
  const otherRevenue = sumMoney(otherRevenues, 'value');
  const revenue = roundMoney(productRevenue + otherRevenue);
  const productCost = sumMoney(sales, 'cost');
  const grossProfit = roundMoney(productRevenue - productCost + otherRevenue);
  const totalLosses = sumMoney(losses, 'value');
  const totalExpenses = sumMoney(expenses, 'value');
  const netProfit = roundMoney(grossProfit - totalLosses - totalExpenses);

  return {
    period,
    referenceDate,
    selectedShift,
    range: periodRange,
    totals: {
      revenue,
      productRevenue,
      otherRevenue,
      productCost,
      grossProfit,
      losses: totalLosses,
      expenses: totalExpenses,
      pendingExpenses: sumMoney(pendingExpenses, 'value'),
      netProfit,
      grossMargin: resolveMargin(grossProfit, revenue),
      netMargin: resolveMargin(netProfit, revenue),
    },
    productGains: groupProductGains(sales),
    shiftBreakdown: groupSalesByShift(sales),
    paymentBreakdown: groupSalesByPaymentMethod(sales),
    lossBreakdown: groupLosses(losses),
    expenseBreakdown: groupExpenses(expenses),
    otherRevenueBreakdown: groupOtherRevenues(otherRevenues),
    pendingExpenses,
  };
}

export function buildClientMetrics(clientRows = clients, referenceDate = '2026-06-15') {
  const referenceMonth = referenceDate.slice(0, 7);

  return {
    activeClients: clientRows.filter((client) => client.status === 'Activo').length,
    purchasesToday: clientRows.filter((client) => normalizeClientDate(client.lastPurchase) === referenceDate).length,
    openCredit: sumMoney(clientRows, 'openCredit'),
    newThisMonth: clientRows.filter((client) => String(client.createdAt ?? '').startsWith(referenceMonth)).length,
  };
}

export function filterClientsForManagement(clientRows = clients, query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return clientRows;

  return clientRows.filter((client) =>
    [client.name, client.nif, client.phone, client.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function buildReportsOverview(
  data = {
    clients,
    stockRows: stockItems,
    sales: financeProductSales,
    losses: financeLosses,
    expenses: financeExpenses,
    otherRevenues: financeOtherRevenues,
  },
  options = {},
) {
  const financial = buildFinancialOverview({
    sales: data.sales ?? financeProductSales,
    losses: data.losses ?? financeLosses,
    expenses: data.expenses ?? financeExpenses,
    otherRevenues: data.otherRevenues ?? financeOtherRevenues,
  }, { period: 'month', referenceDate: options.referenceDate ?? '2026-06-15' });
  const stock = buildStockMetrics(data.stockRows ?? stockItems);
  const clientMetrics = buildClientMetrics(data.clients ?? clients, options.referenceDate ?? '2026-06-15');

  return {
    sales: {
      totalRevenue: financial.totals.productRevenue,
      totalQuantity: (data.sales ?? financeProductSales).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
      paymentBreakdown: financial.paymentBreakdown,
    },
    finance: {
      grossProfit: financial.totals.grossProfit,
      netProfit: financial.totals.netProfit,
      losses: financial.totals.losses,
      expenses: financial.totals.expenses,
    },
    stock: {
      totalProducts: stock.totalProducts,
      lowStock: stock.lowStock,
      outOfStock: stock.outOfStock,
    },
    clients: clientMetrics,
    topProducts: financial.productGains,
    stockAlerts: (data.stockRows ?? stockItems).filter((item) => item.status !== 'Em estoque').slice(0, 6),
  };
}

export function buildStockMetrics(stockRows = stockItems) {
  const groupedCategories = Array.from(
    stockRows.reduce((groups, item) => {
      const current = groups.get(item.category) ?? 0;
      groups.set(item.category, current + 1);
      return groups;
    }, new Map()),
    ([name, count]) => ({
      name,
      count,
      icon: name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3).toLowerCase(),
    }),
  );

  return {
    totalProducts: stockRows.length,
    lowStock: stockRows.filter((item) => item.status === 'Baixo estoque').length,
    outOfStock: stockRows.filter((item) => item.status === 'Sem estoque').length,
    categories: groupedCategories,
    visibleRows: stockRows.length,
  };
}

export function buildStockFormOptions(stockRows = stockItems) {
  return {
    categories: uniqueSorted(stockRows.map((item) => item.category)),
    subcategories: uniqueSorted(stockRows.map((item) => item.subcategory)),
    locations: uniqueSorted(stockRows.map((item) => item.location)),
  };
}

export function buildStockImportReference(stockRows = stockItems) {
  const categories = buildStockFormOptions(stockRows).categories;
  const subcategories = Array.from(
    stockRows.reduce((groups, item) => {
      const category = normalizeImportValue(item.category);
      const subcategory = normalizeImportValue(item.subcategory);
      if (!category || !subcategory) return groups;

      groups.set(`${normalizeLookupKey(category)}::${normalizeLookupKey(subcategory)}`, {
        category,
        name: subcategory,
      });
      return groups;
    }, new Map()).values(),
  ).sort((first, second) =>
    first.category.localeCompare(second.category, 'pt-AO') || first.name.localeCompare(second.name, 'pt-AO'),
  );

  return { categories, subcategories };
}

export function parseStockImportCsv(content) {
  const lines = String(content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitDelimitedLine(lines[0], delimiter).map(normalizeImportHeader);

  return lines.slice(1).map((line) => {
    const values = splitDelimitedLine(line, delimiter);
    return headers.reduce((row, header, index) => {
      const field = STOCK_IMPORT_HEADER_MAP[header];
      if (field) {
        row[field] = normalizeImportValue(values[index]);
      }
      return row;
    }, {});
  }).filter((row) => Object.values(row).some(Boolean));
}

export function validateStockProductImportRows(importRows, stockRows = stockItems) {
  const reference = buildStockImportReference(stockRows);
  const categoryLookup = buildLookupMap(reference.categories);
  const subcategoryLookup = buildSubcategoryLookup(reference.subcategories);
  const missingCategories = new Map();
  const missingSubcategories = new Map();
  const requiredFields = ['id', 'name', 'category', 'subcategory', 'price', 'expiry', 'location'];

  const rejectedRows = [];
  const acceptedRows = [];

  importRows.forEach((row, index) => {
    const normalizedRow = normalizeStockProductImportRow(row);
    const missingField = requiredFields.find((field) => !normalizedRow[field]);
    if (missingField) {
      rejectedRows.push({
        rowNumber: index + 2,
        row: normalizedRow,
        reason: 'Campos obrigatorios em falta.',
      });
      return;
    }

    const category = categoryLookup.get(normalizeLookupKey(normalizedRow.category));
    if (!category) {
      missingCategories.set(normalizeLookupKey(normalizedRow.category), normalizedRow.category);
      rejectedRows.push({
        rowNumber: index + 2,
        row: normalizedRow,
        reason: 'Categoria nao encontrada.',
      });
      return;
    }

    const subcategoryKey = `${normalizeLookupKey(category)}::${normalizeLookupKey(normalizedRow.subcategory)}`;
    const subcategory = subcategoryLookup.get(subcategoryKey);
    if (!subcategory) {
      missingSubcategories.set(subcategoryKey, { category, name: normalizedRow.subcategory });
      rejectedRows.push({
        rowNumber: index + 2,
        row: normalizedRow,
        reason: 'Subcategoria nao encontrada nesta categoria.',
      });
      return;
    }

    acceptedRows.push({
      ...normalizedRow,
      category,
      subcategory: subcategory.name,
      quantity: 0,
      status: 'Sem estoque',
    });
  });

  return {
    acceptedRows,
    rejectedRows,
    missingCategories: Array.from(missingCategories.values()).sort((first, second) => first.localeCompare(second, 'pt-AO')),
    missingSubcategories: Array.from(missingSubcategories.values()).sort((first, second) =>
      first.category.localeCompare(second.category, 'pt-AO') || first.name.localeCompare(second.name, 'pt-AO'),
    ),
  };
}

export function validateStockCategoryImportRows(importRows, existingCategories = []) {
  const existingLookup = new Set(existingCategories.map(normalizeLookupKey));
  const acceptedLookup = new Set();
  const acceptedRows = [];
  const rejectedRows = [];

  importRows.forEach((row, index) => {
    const name = normalizeImportValue(row.name ?? row.categoria ?? row.category);
    const key = normalizeLookupKey(name);

    if (!name) {
      rejectedRows.push({ rowNumber: index + 2, row, reason: 'Informe o nome da categoria.' });
      return;
    }

    if (existingLookup.has(key) || acceptedLookup.has(key)) {
      rejectedRows.push({ rowNumber: index + 2, row: { name }, reason: 'Categoria ja existe.' });
      return;
    }

    acceptedLookup.add(key);
    acceptedRows.push({ name });
  });

  return { acceptedRows, rejectedRows };
}

export function validateStockSubcategoryImportRows(importRows, stockRows = stockItems) {
  const reference = buildStockImportReference(stockRows);
  const categoryLookup = buildLookupMap(reference.categories);
  const existingSubcategories = new Set(
    reference.subcategories.map((item) => `${normalizeLookupKey(item.category)}::${normalizeLookupKey(item.name)}`),
  );
  const acceptedLookup = new Set();
  const missingCategories = new Map();
  const acceptedRows = [];
  const rejectedRows = [];

  importRows.forEach((row, index) => {
    const categoryValue = normalizeImportValue(row.category ?? row.categoria);
    const name = normalizeImportValue(row.subcategory ?? row.subcategoria ?? row.name ?? row.nome);
    const category = categoryLookup.get(normalizeLookupKey(categoryValue));

    if (!categoryValue || !name) {
      rejectedRows.push({ rowNumber: index + 2, row, reason: 'Informe categoria e subcategoria.' });
      return;
    }

    if (!category) {
      missingCategories.set(normalizeLookupKey(categoryValue), categoryValue);
      rejectedRows.push({ rowNumber: index + 2, row: { category: categoryValue, name }, reason: 'Categoria nao encontrada.' });
      return;
    }

    const key = `${normalizeLookupKey(category)}::${normalizeLookupKey(name)}`;
    if (existingSubcategories.has(key) || acceptedLookup.has(key)) {
      rejectedRows.push({ rowNumber: index + 2, row: { category, name }, reason: 'Subcategoria ja existe nesta categoria.' });
      return;
    }

    acceptedLookup.add(key);
    acceptedRows.push({ category, name });
  });

  return {
    acceptedRows,
    rejectedRows,
    missingCategories: Array.from(missingCategories.values()).sort((first, second) => first.localeCompare(second, 'pt-AO')),
  };
}

export function buildStockListPage(stockRows, page = 1, itemsPerPage = 10) {
  const normalizedItemsPerPage = Math.max(1, Number(itemsPerPage) || 10);
  const totalPages = Math.max(1, Math.ceil(stockRows.length / normalizedItemsPerPage));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const startIndex = (currentPage - 1) * normalizedItemsPerPage;

  return {
    rows: stockRows.slice(startIndex, startIndex + normalizedItemsPerPage),
    currentPage,
    itemsPerPage: normalizedItemsPerPage,
    totalPages,
    totalRows: stockRows.length,
    startRow: stockRows.length ? startIndex + 1 : 0,
    endRow: Math.min(startIndex + normalizedItemsPerPage, stockRows.length),
  };
}

export function buildStockInventoryCount(stockRows = stockItems, countedQuantities = {}) {
  const rows = stockRows.map((item) => {
    const rawCount = countedQuantities[item.id];
    const hasCount = rawCount !== undefined && rawCount !== null && String(rawCount).trim() !== '';
    const counted = hasCount ? Math.max(0, Math.trunc(Number(rawCount) || 0)) : null;
    const expected = Number(item.quantity ?? 0);
    const difference = counted === null ? null : counted - expected;

    return {
      id: item.id,
      name: item.name,
      location: item.location,
      expected,
      counted,
      difference,
      status: counted === null ? 'Nao contado' : difference === 0 ? 'Correto' : 'Com diferenca',
    };
  });
  const countedRows = rows.filter((item) => item.counted !== null);
  const differenceRows = rows.filter((item) => item.status === 'Com diferenca');

  return {
    totalItems: rows.length,
    countedItems: countedRows.length,
    correctItems: countedRows.filter((item) => item.status === 'Correto').length,
    differenceItems: differenceRows.length,
    pendingItems: rows.length - countedRows.length,
    hasDifferences: differenceRows.length > 0,
    rows,
    differences: differenceRows,
  };
}

export function addStockQuantity(stockRows, productId, quantity, reason = 'Entrada de estoque') {
  const amount = normalizeMovementQuantity(quantity);

  return stockRows.map((item) => {
    if (item.id !== productId) return item;

    const nextQuantity = item.quantity + amount;
    return {
      ...item,
      quantity: nextQuantity,
      status: resolveStockStatus(nextQuantity),
      lastStockMovement: {
        type: 'entrada',
        quantity: amount,
        reason: reason?.trim() || 'Entrada de estoque',
      },
    };
  });
}

export function removeStockQuantity(stockRows, productId, quantity, reason) {
  if (!STOCK_OUT_REASONS.includes(reason)) {
    throw new Error('Informe um motivo de baixa valido.');
  }

  const amount = normalizeMovementQuantity(quantity);

  return stockRows.map((item) => {
    if (item.id !== productId) return item;

    const removedQuantity = Math.min(item.quantity, amount);
    const nextQuantity = item.quantity - removedQuantity;
    return {
      ...item,
      quantity: nextQuantity,
      status: resolveStockStatus(nextQuantity),
      lastStockMovement: {
        type: 'baixa',
        quantity: removedQuantity,
        reason,
      },
    };
  });
}

function resolveDashboardChartBuckets(period, referenceDate) {
  const reference = parseDateKey(referenceDate);

  if (period === 'week') {
    const weekday = reference.getDay() || 7;
    const start = new Date(reference);
    start.setDate(reference.getDate() - weekday + 1);

    return ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'].map((label, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = formatLocalDateKey(day);

      return {
        label,
        start: key,
        end: key,
      };
    });
  }

  if (period === 'semester') {
    const startMonth = reference.getMonth() - 5;

    return Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(reference.getFullYear(), startMonth + index, 1);
      return monthBucket(monthDate);
    });
  }

  if (period === 'year') {
    return Array.from({ length: 12 }, (_, index) => monthBucket(new Date(reference.getFullYear(), index, 1)));
  }

  const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  const buckets = [];
  let weekStart = new Date(monthStart);
  let weekNumber = 1;

  while (weekStart <= monthEnd) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(Math.min(weekStart.getDate() + 6, monthEnd.getDate()));
    buckets.push({
      label: `SEM ${weekNumber}`,
      start: formatLocalDateKey(weekStart),
      end: formatLocalDateKey(weekEnd),
    });
    weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() + 1);
    weekNumber += 1;
  }

  return buckets;
}

function resolveDashboardPeriodLabel(period) {
  if (period === 'week') return 'Semanal';
  if (period === 'semester') return 'Semestral';
  if (period === 'year') return 'Anual';
  return 'Mensal';
}

function monthBucket(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return {
    label: start.toLocaleDateString('pt-AO', { month: 'short' }).replace('.', '').toUpperCase(),
    start: formatLocalDateKey(start),
    end: formatLocalDateKey(end),
  };
}

function sumRowsByBucket(rows, field, bucket) {
  return roundMoney(
    rows
      .filter((row) => row.date >= bucket.start && row.date <= bucket.end)
      .reduce((sum, row) => sum + Number(row[field] ?? 0), 0),
  );
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function resolveFinancialPeriod(period, referenceDate) {
  const reference = new Date(`${referenceDate}T00:00:00`);

  if (period === 'week') {
    const weekday = reference.getDay() || 7;
    const start = new Date(reference);
    start.setDate(reference.getDate() - weekday + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start: formatDateKey(start),
      end: formatDateKey(end),
      label: `${formatDateKey(start)} a ${formatDateKey(end)}`,
    };
  }

  if (period === 'shift') {
    return {
      start: referenceDate,
      end: referenceDate,
      label: referenceDate,
    };
  }

  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return {
    start: formatDateKey(start),
    end: formatDateKey(end),
    label: reference.toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' }),
  };
}

function isDateInRange(dateValue, startValue, endValue) {
  return dateValue >= startValue && dateValue <= endValue;
}

function normalizeClientDate(value) {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return text;

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function sumMoney(rows, field) {
  return roundMoney(rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0));
}

function resolveMargin(value, revenue) {
  if (!revenue) return 0;
  return roundMoney((value / revenue) * 100);
}

function groupProductGains(salesRows) {
  return Array.from(
    salesRows.reduce((groups, item) => {
      const current = groups.get(item.product) ?? {
        product: item.product,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };
      current.quantity += Number(item.quantity ?? 0);
      current.revenue = roundMoney(current.revenue + Number(item.revenue ?? 0));
      current.cost = roundMoney(current.cost + Number(item.cost ?? 0));
      groups.set(item.product, current);
      return groups;
    }, new Map()).values(),
  ).map((item) => {
    const profit = roundMoney(item.revenue - item.cost);
    return {
      ...item,
      profit,
      margin: resolveMargin(profit, item.revenue),
    };
  }).sort((first, second) => second.profit - first.profit || first.product.localeCompare(second.product, 'pt-AO'));
}

function groupSalesByShift(salesRows) {
  return Array.from(
    salesRows.reduce((groups, item) => {
      const current = groups.get(item.shift) ?? {
        shift: item.shift,
        revenue: 0,
        cost: 0,
        quantity: 0,
      };
      current.revenue = roundMoney(current.revenue + Number(item.revenue ?? 0));
      current.cost = roundMoney(current.cost + Number(item.cost ?? 0));
      current.quantity += Number(item.quantity ?? 0);
      groups.set(item.shift, current);
      return groups;
    }, new Map()).values(),
  ).map((item) => ({
    ...item,
    grossProfit: roundMoney(item.revenue - item.cost),
    margin: resolveMargin(item.revenue - item.cost, item.revenue),
  })).sort((first, second) => first.shift.localeCompare(second.shift, 'pt-AO'));
}

function groupSalesByPaymentMethod(salesRows) {
  const grouped = new Map(PAYMENT_METHODS.map((method) => [method, { method, value: 0, count: 0 }]));

  salesRows.forEach((item) => {
    const method = PAYMENT_METHODS.includes(item.paymentMethod) ? item.paymentMethod : 'Dinheiro';
    const current = grouped.get(method);
    current.value = roundMoney(current.value + Number(item.revenue ?? 0));
    current.count += 1;
  });

  return PAYMENT_METHODS.map((method) => grouped.get(method));
}

function groupLosses(lossRows) {
  return Array.from(
    lossRows.reduce((groups, item) => {
      const current = groups.get(item.reason) ?? { reason: item.reason, quantity: 0, value: 0 };
      current.quantity += Number(item.quantity ?? 0);
      current.value = roundMoney(current.value + Number(item.value ?? 0));
      groups.set(item.reason, current);
      return groups;
    }, new Map()).values(),
  ).sort((first, second) => second.value - first.value);
}

function groupExpenses(expenseRows) {
  return Array.from(
    expenseRows.reduce((groups, item) => {
      const current = groups.get(item.category) ?? { category: item.category, value: 0 };
      current.value = roundMoney(current.value + Number(item.value ?? 0));
      groups.set(item.category, current);
      return groups;
    }, new Map()).values(),
  ).sort((first, second) => second.value - first.value);
}

function groupOtherRevenues(revenueRows) {
  return Array.from(
    revenueRows.reduce((groups, item) => {
      const current = groups.get(item.category) ?? { category: item.category, value: 0 };
      current.value = roundMoney(current.value + Number(item.value ?? 0));
      groups.set(item.category, current);
      return groups;
    }, new Map()).values(),
  ).sort((first, second) => second.value - first.value);
}

function resolveStockStatus(quantity) {
  if (quantity <= 0) return 'Sem estoque';
  if (quantity <= 25) return 'Baixo estoque';
  return 'Em estoque';
}

function normalizeMovementQuantity(quantity) {
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Informe uma quantidade valida.');
  }

  return Math.trunc(amount);
}

function uniqueSorted(values) {
  return Array.from(
    new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())),
  ).sort((first, second) => first.localeCompare(second, 'pt-AO'));
}

const STOCK_IMPORT_HEADER_MAP = {
  codigo: 'id',
  codigobarras: 'id',
  id: 'id',
  referencia: 'id',
  designacao: 'name',
  designacaodoproduto: 'name',
  produto: 'name',
  nome: 'name',
  nomedoproduto: 'name',
  nomedacategoria: 'name',
  name: 'name',
  categoria: 'category',
  categoriaprincipal: 'category',
  category: 'category',
  subcategoria: 'subcategory',
  nomedasubcategoria: 'subcategory',
  subcategory: 'subcategory',
  preco: 'price',
  precodevenda: 'price',
  price: 'price',
  dataexpiracao: 'expiry',
  datadeexpiracao: 'expiry',
  validade: 'expiry',
  expiry: 'expiry',
  localizacao: 'location',
  localizacaodoestoque: 'location',
  local: 'location',
  location: 'location',
};

function normalizeStockProductImportRow(row) {
  return {
    id: normalizeImportValue(row.id ?? row.codigo ?? row.codigoBarras),
    name: normalizeImportValue(row.name ?? row.nome ?? row.designacao ?? row.produto),
    category: normalizeImportValue(row.category ?? row.categoria),
    subcategory: normalizeImportValue(row.subcategory ?? row.subcategoria),
    price: Number(normalizeImportValue(row.price ?? row.preco).replace(/\./g, '').replace(',', '.')),
    expiry: normalizeImportValue(row.expiry ?? row.validade ?? row.dataExpiracao),
    location: normalizeImportValue(row.location ?? row.localizacao ?? row.local),
  };
}

function buildLookupMap(values) {
  return new Map(values.map((value) => [normalizeLookupKey(value), value]));
}

function buildSubcategoryLookup(values) {
  return new Map(values.map((value) => [`${normalizeLookupKey(value.category)}::${normalizeLookupKey(value.name)}`, value]));
}

function normalizeImportHeader(value) {
  return normalizeLookupKey(value);
}

function normalizeLookupKey(value) {
  return normalizeImportValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeImportValue(value) {
  return String(value ?? '').trim();
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let isQuoted = false;

  for (const char of String(line ?? '')) {
    if (char === '"') {
      isQuoted = !isQuoted;
      continue;
    }

    if (char === delimiter && !isQuoted) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}
