const { Op } = require('sequelize');
const db = require('../database');

const SAFE_ERRORS = [
  'Transação não encontrada.',
  'Valor inválido.',
  'Descricao e obrigatoria.',
  'Valor deve ser maior que zero.',
  'Movimento nao encontrado.',
  'Movimento automatico nao pode ser removido manualmente.',
];

function roundCents(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

// Accept both PT ('Despesa'/'Receita') and EN ('expense'/'revenue') stored values
function normalizeTipo(tipo) {
  if (!tipo) return 'Receita';
  const map = { expense: 'Despesa', revenue: 'Receita', despesa: 'Despesa', receita: 'Receita' };
  return map[String(tipo).toLowerCase()] || tipo;
}

function serializeTransacao(t) {
  const row = typeof t.get === 'function' ? t.get({ plain: true }) : t;
  return {
    id: row.id,
    tipo: normalizeTipo(row.tipo),
    type: normalizeTipo(row.tipo) === 'Receita' ? 'Receita' : 'Despesa',
    categoria: row.categoria || '',
    category: row.categoria || '',
    descricao: row.descricao || '',
    description: row.descricao || '',
    valor: roundCents(row.valor),
    value: roundCents(row.valor),
    data_transacao: row.data_transacao ? new Date(row.data_transacao).toISOString().slice(0, 10) : null,
    date: row.data_transacao ? new Date(row.data_transacao).toISOString().slice(0, 10) : null,
    data_vencimento: row.data_vencimento,
    status: row.status || 'Paga',
    turno: row.turno || null,
    shift: row.turno || null,
    origem: row.origem || 'Manual',
    source: row.origem || 'Manual',
    motivo_perda: row.motivo_perda || null,
    fornecedor: row.Fornecedor ? row.Fornecedor.nome_fantasia : null,
    referencia_venda_id: row.referencia_venda_id || null,
  };
}

async function listContasPagar() {
  const { TransacaoFinanceira, Fornecedor } = db.getModels();
  const rows = await TransacaoFinanceira.findAll({
    where: {
      tipo: { [Op.in]: ['expense', 'Despesa'] },
      status: { [Op.in]: ['Pendente', 'Vencida'] },
    },
    include: [{ model: Fornecedor, required: false }],
    order: [['data_vencimento', 'ASC']],
  });
  return rows.map(serializeTransacao);
}

async function marcarPago(id) {
  const { TransacaoFinanceira } = db.getModels();
  const t = await TransacaoFinanceira.findByPk(id);
  if (!t) throw new Error('Transação não encontrada.');
  await t.update({ status: 'Paga' });
  return serializeTransacao(t);
}

async function listTransactions({ dateFrom, dateTo, tipo } = {}) {
  const { TransacaoFinanceira, Fornecedor } = db.getModels();
  const where = {};
  if (tipo) where.tipo = { [Op.in]: [tipo, normalizeTipo(tipo)] };
  if (dateFrom || dateTo) {
    where.data_transacao = {};
    if (dateFrom) where.data_transacao[Op.gte] = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.data_transacao[Op.lte] = end;
    }
  }
  const rows = await TransacaoFinanceira.findAll({
    where,
    include: [{ model: Fornecedor, required: false }],
    order: [['data_transacao', 'DESC']],
    limit: 500,
  });
  return rows.map(serializeTransacao);
}

// Returns raw data arrays for buildFinancialOverview on the frontend
async function getOverviewData({ referenceDate } = {}) {
  const { Venda, ItemVenda, Produto, TransacaoFinanceira } = db.getModels();

  // Determine date window: full month containing referenceDate
  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);

  // Product sales from Venda + ItemVenda (exclude cancelled/proforma/nota_credito)
  const vendas = await Venda.findAll({
    where: {
      status: { [Op.notIn]: ['ANULADO'] },
      tipo_documento: { [Op.notIn]: ['PROFORMA', 'NOTA_CREDITO'] },
      data_venda: { [Op.between]: [monthStart, monthEnd] },
    },
    include: [{
      model: ItemVenda,
      required: true,
      include: [{ model: Produto, required: false, attributes: ['id', 'nome', 'preco_custo'] }],
    }],
  });

  const sales = [];
  for (const venda of vendas) {
    const v = typeof venda.get === 'function' ? venda.get({ plain: true }) : venda;
    const dateStr = new Date(v.data_venda).toISOString().slice(0, 10);
    for (const item of (v.ItemVendas || [])) {
      const qty = Number(item.quantidade || 0);
      const unitPrice = roundCents(item.preco_unitario || 0);
      const unitCost = roundCents(item.Produto ? Number(item.Produto.preco_custo || 0) : 0);
      sales.push({
        product: item.Produto ? item.Produto.nome : `Produto #${item.produto_id}`,
        quantity: qty,
        revenue: roundCents(unitPrice * qty),
        cost: roundCents(unitCost * qty),
        paymentMethod: v.forma_pagamento || 'Dinheiro',
        date: dateStr,
        shift: 'Manha',
      });
    }
  }

  // Losses from TransacaoFinanceira
  const lossRows = await TransacaoFinanceira.findAll({
    where: {
      [Op.or]: [
        { categoria: { [Op.in]: ['Perdas', 'Perda'] } },
        { motivo_perda: { [Op.ne]: null } },
      ],
      data_transacao: { [Op.between]: [monthStart, monthEnd] },
    },
  });

  const losses = lossRows.map((row) => {
    const r = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
      reason: r.motivo_perda || r.categoria || 'Perda',
      quantity: Number(r.quantidade || 1),
      value: roundCents(r.valor),
      date: new Date(r.data_transacao).toISOString().slice(0, 10),
      shift: r.turno || 'Manha',
    };
  });

  // Expenses (non-loss, non-PDV)
  const expenseRows = await TransacaoFinanceira.findAll({
    where: {
      tipo: { [Op.in]: ['Despesa', 'expense'] },
      categoria: { [Op.notIn]: ['Perdas', 'Perda', 'Venda'] },
      motivo_perda: null,
      data_transacao: { [Op.between]: [monthStart, monthEnd] },
    },
  });

  const expenses = expenseRows.map((row) => {
    const r = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
      category: r.categoria || 'Outros',
      description: r.descricao || '',
      value: roundCents(r.valor),
      date: new Date(r.data_transacao).toISOString().slice(0, 10),
      status: r.status || 'Paga',
      shift: r.turno || 'Manha',
      source: r.origem || 'Manual',
    };
  });

  // Other revenues (manual, not from PDV sales)
  const revenueRows = await TransacaoFinanceira.findAll({
    where: {
      tipo: { [Op.in]: ['Receita', 'revenue'] },
      origem: { [Op.ne]: 'PDV' },
      data_transacao: { [Op.between]: [monthStart, monthEnd] },
    },
  });

  const otherRevenues = revenueRows.map((row) => {
    const r = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
      category: r.categoria || 'Receita',
      description: r.descricao || '',
      value: roundCents(r.valor),
      date: new Date(r.data_transacao).toISOString().slice(0, 10),
      status: r.status || 'Paga',
      shift: r.turno || 'Manha',
      source: r.origem || 'Manual',
    };
  });

  return { sales, losses, expenses, otherRevenues };
}

async function createTransaction(data, actorUserId) {
  const { TransacaoFinanceira } = db.getModels();

  if (!data.descricao || !String(data.descricao).trim()) {
    throw Object.assign(new Error('Descricao e obrigatoria.'), { code: 'VALIDATION' });
  }
  const value = Number(data.valor || data.value || 0);
  if (!value || value <= 0) {
    throw Object.assign(new Error('Valor deve ser maior que zero.'), { code: 'VALIDATION' });
  }

  const tipoNorm = normalizeTipo(data.tipo || data.type || 'Despesa');
  const row = await TransacaoFinanceira.create({
    tipo: tipoNorm,
    categoria: data.categoria || data.category || 'Manual',
    descricao: String(data.descricao || data.description || '').trim(),
    valor: roundCents(value),
    data_transacao: data.data ? new Date(data.data) : new Date(),
    data_vencimento: data.data_vencimento ? new Date(data.data_vencimento) : null,
    status: data.status || 'Paga',
    turno: data.turno || data.shift || null,
    motivo_perda: data.motivo_perda || null,
    quantidade: data.quantidade ? Number(data.quantidade) : null,
    origem: 'Manual',
  });

  return serializeTransacao(row);
}

async function deleteTransaction(id, actorUserId) {
  const { TransacaoFinanceira } = db.getModels();

  const t = await TransacaoFinanceira.findByPk(id);
  if (!t) throw Object.assign(new Error('Movimento nao encontrado.'), { code: 'NOT_FOUND' });

  const row = t.get({ plain: true });
  if (row.origem && row.origem !== 'Manual' && row.origem !== null) {
    throw Object.assign(new Error('Movimento automatico nao pode ser removido manualmente.'), { code: 'CONSTRAINT' });
  }

  await t.destroy();
  return { ok: true };
}

module.exports = {
  listContasPagar,
  marcarPago,
  listTransactions,
  getOverviewData,
  createTransaction,
  deleteTransaction,
  SAFE_ERRORS,
};
