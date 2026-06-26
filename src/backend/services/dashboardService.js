const { Op } = require('sequelize');
const db = require('../database');
const heldSalesService = require('./heldSalesService');

function asNumber(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getStockCounts(lowStockThreshold) {
  const sequelize = db.sequelize;
  const rows = await sequelize.query(
    `SELECT COALESCE(SUM(e.quantidade), 0) AS qty, p.estoque_minimo AS minimo
     FROM Produtos p
     LEFT JOIN Estoques e ON e.produto_id = p.id
     GROUP BY p.id, p.estoque_minimo`,
    { type: sequelize.QueryTypes.SELECT },
  );

  let outOfStock = 0;
  let lowStock = 0;
  for (const row of rows) {
    const qty = Number(row.qty) || 0;
    const threshold = Number(row.minimo) > 0 ? Number(row.minimo) : lowStockThreshold;
    if (qty === 0) outOfStock++;
    else if (qty <= threshold) lowStock++;
  }
  return { outOfStock, lowStock, total: rows.length };
}

async function getRecentSales(limit) {
  const { Venda, ItemVenda, Cliente } = db.getModels();
  const rows = await Venda.findAll({
    order: [['data_venda', 'DESC'], ['id', 'DESC']],
    limit,
    include: [
      { model: Cliente, attributes: ['nome'], required: false },
      { model: ItemVenda, attributes: ['id'], required: false },
    ],
  });

  return rows.map((v) => {
    const p = v.get({ plain: true });
    const itemCount = (p.ItemVendas || []).length;
    return {
      id: p.id,
      number: p.numero_factura || `#${p.id}`,
      total: asNumber(p.total),
      status: p.status || 'Concluida',
      data_venda: p.data_venda ? new Date(p.data_venda).toISOString() : null,
      forma_pagamento: p.forma_pagamento || '',
      cliente: p.Cliente?.nome || 'Consumidor Final',
      items: itemCount ? `${itemCount} ${itemCount === 1 ? 'produto' : 'produtos'}` : p.forma_pagamento || 'Venda',
    };
  });
}

async function getTopSellers(limit = 6) {
  const seq = db.sequelize;
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const rows = await seq.query(
    `SELECT p.nome, COALESCE(SUM(iv.quantidade), 0) AS total_vendido
     FROM ItemVendas iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Produtos p ON p.id = iv.produto_id
     WHERE v.data_venda >= :start
       AND v.status NOT IN ('ANULADO', 'Cancelada', 'Anulada')
       AND v.tipo_documento NOT IN ('PROFORMA', 'NOTA_CREDITO')
     GROUP BY p.id, p.nome
     ORDER BY total_vendido DESC
     LIMIT :limit`,
    { replacements: { start: startOfMonth.toISOString(), limit }, type: seq.QueryTypes.SELECT },
  );

  const maxQty = rows.length ? Number(rows[0].total_vendido) : 1;
  return rows.map((r) => ({
    product: r.nome,
    quantity: Number(r.total_vendido),
    percent: maxQty > 0 ? Math.round((Number(r.total_vendido) / maxQty) * 100) : 0,
  }));
}

async function getStockAlerts() {
  const seq = db.sequelize;
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [expired, expiring, outOfStock, lowStockRows] = await Promise.all([
    seq.query(
      `SELECT p.nome FROM Estoques e JOIN Produtos p ON p.id = e.produto_id
       WHERE e.quantidade > 0 AND DATE(e.data_validade) < :today
       GROUP BY p.id, p.nome`,
      { replacements: { today }, type: seq.QueryTypes.SELECT },
    ),
    seq.query(
      `SELECT p.nome FROM Estoques e JOIN Produtos p ON p.id = e.produto_id
       WHERE e.quantidade > 0 AND DATE(e.data_validade) BETWEEN :today AND :in30
       GROUP BY p.id, p.nome`,
      { replacements: { today, in30 }, type: seq.QueryTypes.SELECT },
    ),
    seq.query(
      `SELECT p.nome FROM Produtos p
       LEFT JOIN Estoques e ON e.produto_id = p.id
       GROUP BY p.id, p.nome
       HAVING COALESCE(SUM(e.quantidade), 0) = 0`,
      { type: seq.QueryTypes.SELECT },
    ),
    seq.query(
      `SELECT p.nome FROM Produtos p
       LEFT JOIN Estoques e ON e.produto_id = p.id
       WHERE p.estoque_minimo > 0
       GROUP BY p.id, p.nome, p.estoque_minimo
       HAVING COALESCE(SUM(e.quantidade), 0) > 0
         AND COALESCE(SUM(e.quantidade), 0) <= p.estoque_minimo`,
      { type: seq.QueryTypes.SELECT },
    ),
  ]);

  return {
    expired: expired.map((r) => r.nome),
    expiring: expiring.map((r) => r.nome),
    outOfStock: outOfStock.map((r) => r.nome),
    lowStock: lowStockRows.map((r) => r.nome),
  };
}

async function getFinancialSummary() {
  const { TransacaoFinanceira, Venda, ItemVenda, Produto } = db.getModels();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const notCancelledMonth = {
    data_venda: { [Op.gte]: monthStart },
    status: { [Op.notIn]: ['ANULADO', 'Cancelada', 'Anulada'] },
    tipo_documento: { [Op.notIn]: ['PROFORMA', 'NOTA_CREDITO'] },
  };

  const [totalVendasMes, totalCustoMes, pendingExpenses] = await Promise.all([
    Venda.sum('total', { where: notCancelledMonth }).then((v) => asNumber(v)),
    (async () => {
      const itens = await ItemVenda.findAll({
        where: {},
        include: [
          { model: Venda, where: notCancelledMonth, required: true, attributes: [] },
          { model: Produto, required: false, attributes: ['preco_custo'] },
        ],
        attributes: ['quantidade'],
      });
      return itens.reduce((sum, iv) => {
        const p = iv.get({ plain: true });
        return sum + asNumber(Number(p.Produto?.preco_custo || 0) * Number(p.quantidade || 0));
      }, 0);
    })(),
    TransacaoFinanceira.sum('valor', {
      where: {
        tipo: { [Op.in]: ['Despesa', 'expense'] },
        status: { [Op.in]: ['Pendente', 'Vencida'] },
      },
    }).then((v) => asNumber(v)),
  ]);

  const netProfit = asNumber(totalVendasMes - totalCustoMes);
  const netMargin = totalVendasMes > 0
    ? ((netProfit / totalVendasMes) * 100).toFixed(1)
    : '0.0';

  return { pendingExpenses, netProfit, netMargin };
}

async function getPendingInvoicesCount() {
  const { Venda } = db.getModels();
  return Venda.count({
    where: {
      tipo_documento: 'PROFORMA',
      status: { [Op.notIn]: ['ANULADO', 'CONVERTIDO'] },
    },
  });
}

async function getChartData() {
  const { Venda, TransacaoFinanceira } = db.getModels();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const [vendaRows, expRows] = await Promise.all([
    Venda.findAll({
      where: {
        data_venda: { [Op.gte]: oneYearAgo },
        status: { [Op.notIn]: ['ANULADO', 'Cancelada', 'Anulada'] },
        tipo_documento: { [Op.notIn]: ['PROFORMA', 'NOTA_CREDITO'] },
      },
      attributes: ['data_venda', 'total', 'forma_pagamento'],
    }),
    TransacaoFinanceira.findAll({
      where: {
        tipo: { [Op.in]: ['Despesa', 'expense'] },
        data_transacao: { [Op.gte]: oneYearAgo },
      },
      attributes: ['valor', 'data_transacao'],
    }),
  ]);

  const sales = vendaRows.map((v) => {
    const p = v.get({ plain: true });
    return {
      date: new Date(p.data_venda).toISOString().slice(0, 10),
      revenue: asNumber(p.total),
      cost: 0,
      quantity: 1,
      paymentMethod: p.forma_pagamento || 'Dinheiro',
      product: '', category: '', shift: 'Manha',
    };
  });

  const expenses = expRows.map((e) => {
    const p = e.get({ plain: true });
    return {
      date: new Date(p.data_transacao).toISOString().slice(0, 10),
      value: asNumber(p.valor),
      category: '', description: '', status: 'Paga', shift: 'Manha', source: 'Manual',
    };
  });

  return { sales, expenses };
}

async function getDashboardMetrics({ shiftOpenAt, lowStockThreshold = 25 }) {
  const { Venda } = db.getModels();
  const today = startOfToday();
  const shiftStart = shiftOpenAt ? new Date(shiftOpenAt) : today;
  const notCancelled = { status: { [Op.notIn]: ['ANULADO', 'Cancelada', 'Anulada'] } };

  const [
    dayTotal, dayCount, shiftTotal, shiftCount,
    stockCounts, recentSales,
    topSellers, stockAlerts, financialSummary, pendingInvoicesCount, chartData,
    heldSalesCount,
  ] = await Promise.all([
    Venda.sum('total', { where: { ...notCancelled, data_venda: { [Op.gte]: today } } }),
    Venda.count({ where: { ...notCancelled, data_venda: { [Op.gte]: today } } }),
    Venda.sum('total', { where: { ...notCancelled, data_venda: { [Op.gte]: shiftStart } } }),
    Venda.count({ where: { ...notCancelled, data_venda: { [Op.gte]: shiftStart } } }),
    getStockCounts(lowStockThreshold),
    getRecentSales(6),
    getTopSellers(6),
    getStockAlerts(),
    getFinancialSummary(),
    getPendingInvoicesCount(),
    getChartData(),
    heldSalesService.count(),
  ]);

  return {
    day: { totalVendas: asNumber(dayTotal), totalTransacoes: dayCount || 0 },
    shift: { totalVendas: asNumber(shiftTotal), totalTransacoes: shiftCount || 0 },
    stock: stockCounts,
    recentSales,
    topSellers,
    stockAlerts,
    financialSummary,
    pendingInvoicesCount: pendingInvoicesCount || 0,
    heldSalesCount: heldSalesCount || 0,
    chartData,
  };
}

module.exports = { getDashboardMetrics };
