const { Op } = require('sequelize');
const { getModels } = require('../database');

function roundCents(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function serializeLote(row) {
  const p = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    id: p.id,
    produto_id: p.produto_id,
    lote: p.lote,
    quantidade: Number(p.quantidade) || 0,
    data_validade: p.data_validade ? new Date(p.data_validade).toISOString().slice(0, 10) : null,
    data_entrada: p.data_entrada ? new Date(p.data_entrada).toISOString() : null,
    localizacao: p.localizacao || null,
  };
}

function serializeProduto(row) {
  const p = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    id: p.id,
    nome: p.nome,
    codigo_barras: p.codigo_barras,
    preco_venda: roundCents(p.preco_venda),
    preco_custo: roundCents(p.preco_custo),
    estoque_minimo: Number(p.estoque_minimo) || 0,
    categoria: p.categoria || null,
    fabricante: p.fabricante || null,
    unidade_medida: p.unidade_medida || 'Unidade',
  };
}

async function getLotes(produtoId) {
  const { Estoque } = getModels();
  const rows = await Estoque.findAll({
    where: { produto_id: produtoId },
    order: [['data_validade', 'ASC'], ['data_entrada', 'ASC']],
  });
  return rows.map(serializeLote);
}

async function addStockLot({ produto_id, lote, quantidade, data_validade, localizacao, preco_custo }) {
  const { Estoque, Produto } = getModels();
  if (!produto_id) throw Object.assign(new Error('Produto e obrigatorio.'), { code: 'VALIDATION' });
  if (!quantidade || Number(quantidade) <= 0) throw Object.assign(new Error('Quantidade deve ser maior que zero.'), { code: 'VALIDATION' });
  if (!data_validade) throw Object.assign(new Error('Data de validade e obrigatoria.'), { code: 'VALIDATION' });

  const produto = await Produto.findByPk(produto_id);
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });

  const loteId = lote ? String(lote).trim() : `L${Date.now()}`;
  const row = await Estoque.create({
    produto_id: Number(produto_id),
    lote: loteId,
    quantidade: Number(quantidade),
    data_validade: new Date(data_validade),
    data_entrada: new Date(),
    localizacao: localizacao ? String(localizacao).trim() : null,
  });

  if (preco_custo && Number(preco_custo) > 0) {
    await produto.update({ preco_custo: roundCents(preco_custo) });
  }

  return serializeLote(row);
}

// FIFO: deduct from oldest lots first (earliest expiry → earliest entry)
async function deductStockFIFO({ produto_id, quantidade, motivo }) {
  const { Estoque } = getModels();
  if (!produto_id) throw Object.assign(new Error('Produto e obrigatorio.'), { code: 'VALIDATION' });
  const qty = Number(quantidade);
  if (!qty || qty <= 0) throw Object.assign(new Error('Quantidade deve ser maior que zero.'), { code: 'VALIDATION' });

  const lots = await Estoque.findAll({
    where: { produto_id: Number(produto_id), quantidade: { [Op.gt]: 0 } },
    order: [['data_validade', 'ASC'], ['data_entrada', 'ASC']],
  });

  const totalAvailable = lots.reduce((sum, l) => sum + Number(l.quantidade), 0);
  if (totalAvailable < qty) {
    throw Object.assign(
      new Error(`Estoque insuficiente. Disponivel: ${totalAvailable}, solicitado: ${qty}.`),
      { code: 'INSUFFICIENT_STOCK' },
    );
  }

  let remaining = qty;
  const deducted = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const deduct = Math.min(Number(lot.quantidade), remaining);
    await lot.update({ quantidade: Number(lot.quantidade) - deduct });
    deducted.push({ lote: lot.lote, quantidade: deduct });
    remaining -= deduct;
  }

  return { deducted, motivo: motivo || null };
}

async function updateProductPrice({ produto_id, preco_venda, preco_custo }) {
  const { Produto } = getModels();
  const produto = await Produto.findByPk(produto_id);
  if (!produto) throw Object.assign(new Error('Produto nao encontrado.'), { code: 'NOT_FOUND' });
  const updates = {};
  if (preco_venda !== undefined && Number(preco_venda) >= 0) updates.preco_venda = roundCents(preco_venda);
  if (preco_custo !== undefined && Number(preco_custo) >= 0) updates.preco_custo = roundCents(preco_custo);
  if (Object.keys(updates).length === 0) throw Object.assign(new Error('Nenhum preco informado.'), { code: 'VALIDATION' });
  await produto.update(updates);
  return serializeProduto(produto);
}

async function listPrices({ query = '' } = {}) {
  const { Produto, Estoque } = getModels();
  const where = {};
  if (query) where.nome = { [Op.like]: `%${query}%` };
  const rows = await Produto.findAll({
    where,
    order: [['nome', 'ASC']],
    include: [{ model: Estoque, attributes: ['quantidade'], required: false }],
  });
  return rows.map((r) => {
    const p = r.get({ plain: true });
    const totalStock = (p.Estoques || []).reduce((s, e) => s + Number(e.quantidade || 0), 0);
    return { ...serializeProduto(r), totalStock };
  });
}

const SAFE_ERRORS = Object.freeze([
  'Produto e obrigatorio.',
  'Quantidade deve ser maior que zero.',
  'Data de validade e obrigatoria.',
  'Produto nao encontrado.',
  'Nenhum preco informado.',
]);

module.exports = {
  getLotes,
  addStockLot,
  deductStockFIFO,
  updateProductPrice,
  listPrices,
  SAFE_ERRORS,
};
