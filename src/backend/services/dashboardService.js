const { Op } = require('sequelize');
const db = require('../database');

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

async function getDashboardMetrics({ shiftOpenAt, lowStockThreshold = 25 }) {
  const { Venda } = db.getModels();
  const today = startOfToday();
  const shiftStart = shiftOpenAt ? new Date(shiftOpenAt) : today;
  const notCancelled = { status: { [Op.notIn]: ['Cancelada', 'Anulada'] } };

  const [dayTotal, dayCount, shiftTotal, shiftCount, stockCounts, recentSales] = await Promise.all([
    Venda.sum('total', { where: { ...notCancelled, data_venda: { [Op.gte]: today } } }),
    Venda.count({ where: { ...notCancelled, data_venda: { [Op.gte]: today } } }),
    Venda.sum('total', { where: { ...notCancelled, data_venda: { [Op.gte]: shiftStart } } }),
    Venda.count({ where: { ...notCancelled, data_venda: { [Op.gte]: shiftStart } } }),
    getStockCounts(lowStockThreshold),
    getRecentSales(10),
  ]);

  return {
    day: { totalVendas: asNumber(dayTotal), totalTransacoes: dayCount || 0 },
    shift: { totalVendas: asNumber(shiftTotal), totalTransacoes: shiftCount || 0 },
    stock: stockCounts,
    recentSales,
  };
}

module.exports = { getDashboardMetrics };
