const { Op } = require('sequelize');
const { getModels } = require('../database');

const STATUS = Object.freeze({
  RASCUNHO: 'RASCUNHO',
  ENVIADA: 'ENVIADA',
  PARCIALMENTE_RECEBIDA: 'PARCIALMENTE_RECEBIDA',
  RECEBIDA: 'RECEBIDA',
  CANCELADA: 'CANCELADA',
});

function roundCents(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function serializeItem(item) {
  const p = typeof item.get === 'function' ? item.get({ plain: true }) : item;
  return {
    id: p.id,
    produto_id: p.produto_id,
    produto_nome: p.Produto?.nome || null,
    quantidade: Number(p.quantidade),
    preco_unitario: roundCents(p.preco_unitario),
    quantidade_recebida: Number(p.quantidade_recebida || 0),
    subtotal: roundCents(p.subtotal),
  };
}

function serializeOrdem(ordem) {
  const p = typeof ordem.get === 'function' ? ordem.get({ plain: true }) : ordem;
  return {
    id: p.id,
    numero: p.numero,
    fornecedor_id: p.fornecedor_id,
    fornecedor_nome: p.Fornecedor?.nome_fantasia || null,
    status: p.status,
    total: roundCents(p.total),
    data_emissao: p.data_emissao || null,
    data_entrega_prevista: p.data_entrega_prevista || null,
    observacao: p.observacao || null,
    usuario_id: p.usuario_id || null,
    itens: (p.ItemOrdemCompras || []).map(serializeItem),
  };
}

async function buildNextNumber() {
  const { OrdemCompra } = getModels();
  const year = String(new Date().getFullYear()).slice(-2);
  const count = await OrdemCompra.count();
  return `EC${String(count + 1).padStart(3, '0')}/${year}`;
}

async function listEncomendas({ status, fornecedor_id, query } = {}) {
  const { OrdemCompra, ItemOrdemCompra, Produto, Fornecedor } = getModels();
  const where = {};
  if (status) where.status = status;
  if (fornecedor_id) where.fornecedor_id = Number(fornecedor_id);
  if (query) where.numero = { [Op.like]: `%${query}%` };

  const rows = await OrdemCompra.findAll({
    where,
    order: [['createdAt', 'DESC']],
    include: [
      { model: Fornecedor, attributes: ['nome_fantasia'], required: false },
      { model: ItemOrdemCompra, include: [{ model: Produto, attributes: ['nome'], required: false }], required: false },
    ],
  });
  return rows.map(serializeOrdem);
}

async function createEncomenda({ fornecedor_id, data_entrega_prevista, observacao, itens = [], actorUserId }) {
  const { OrdemCompra, ItemOrdemCompra, Fornecedor } = getModels();
  if (!fornecedor_id) throw Object.assign(new Error('Fornecedor e obrigatorio.'), { code: 'VALIDATION' });
  if (!itens.length) throw Object.assign(new Error('Adicione pelo menos um produto.'), { code: 'VALIDATION' });

  const fornecedor = await Fornecedor.findByPk(fornecedor_id);
  if (!fornecedor) throw Object.assign(new Error('Fornecedor nao encontrado.'), { code: 'NOT_FOUND' });

  const numero = await buildNextNumber();
  const total = itens.reduce((s, i) => s + roundCents(Number(i.quantidade) * Number(i.preco_unitario)), 0);

  const ordem = await OrdemCompra.create({
    numero,
    fornecedor_id: Number(fornecedor_id),
    status: STATUS.RASCUNHO,
    total: roundCents(total),
    data_emissao: new Date().toISOString().slice(0, 10),
    data_entrega_prevista: data_entrega_prevista || null,
    observacao: observacao ? String(observacao).trim() : null,
    usuario_id: actorUserId || null,
  });

  await ItemOrdemCompra.bulkCreate(itens.map((i) => ({
    ordem_compra_id: ordem.id,
    produto_id: Number(i.produto_id),
    quantidade: Number(i.quantidade),
    preco_unitario: roundCents(i.preco_unitario),
    quantidade_recebida: 0,
    subtotal: roundCents(Number(i.quantidade) * Number(i.preco_unitario)),
  })));

  return { id: ordem.id, numero };
}

async function updateEncomendaStatus({ id, status }) {
  const { OrdemCompra } = getModels();
  const valid = Object.values(STATUS);
  if (!valid.includes(status)) throw Object.assign(new Error('Estado invalido.'), { code: 'VALIDATION' });
  const ordem = await OrdemCompra.findByPk(id);
  if (!ordem) throw Object.assign(new Error('Encomenda nao encontrada.'), { code: 'NOT_FOUND' });
  if (ordem.status === STATUS.CANCELADA || ordem.status === STATUS.RECEBIDA) {
    throw Object.assign(new Error('Esta encomenda nao pode ser alterada.'), { code: 'VALIDATION' });
  }
  await ordem.update({ status });
  return { id: ordem.id, status };
}

// Receive goods: update ItemOrdemCompra.quantidade_recebida + add Estoque lots via FIFO entry
async function receberEncomenda({ id, recepcoes = [], actorUserId }) {
  const { OrdemCompra, ItemOrdemCompra, Estoque, Produto } = getModels();
  const ordem = await OrdemCompra.findByPk(id, { include: [ItemOrdemCompra] });
  if (!ordem) throw Object.assign(new Error('Encomenda nao encontrada.'), { code: 'NOT_FOUND' });
  if (ordem.status === STATUS.CANCELADA) throw Object.assign(new Error('Encomenda cancelada.'), { code: 'VALIDATION' });
  if (ordem.status === STATUS.RECEBIDA) throw Object.assign(new Error('Encomenda ja foi recebida.'), { code: 'VALIDATION' });

  for (const rec of recepcoes) {
    const item = (ordem.ItemOrdemCompras || []).find((i) => i.id === rec.item_id);
    if (!item) continue;
    const qtyRec = Number(rec.quantidade_recebida) || 0;
    if (qtyRec <= 0) continue;

    await item.update({ quantidade_recebida: Number(item.quantidade_recebida || 0) + qtyRec });

    // Add to Estoque as new lot
    if (rec.data_validade) {
      await Estoque.create({
        produto_id: item.produto_id,
        lote: rec.lote || `EC${id}-${item.id}-${Date.now()}`,
        quantidade: qtyRec,
        data_validade: new Date(rec.data_validade),
        data_entrada: new Date(),
        localizacao: rec.localizacao || null,
      });
    }

    // Update cost price if informed
    if (rec.preco_custo && Number(rec.preco_custo) > 0) {
      await Produto.update({ preco_custo: roundCents(rec.preco_custo) }, { where: { id: item.produto_id } });
    }
  }

  // Recalculate status
  const updatedItems = await ItemOrdemCompra.findAll({ where: { ordem_compra_id: id } });
  const allReceived = updatedItems.every((i) => Number(i.quantidade_recebida) >= Number(i.quantidade));
  const anyReceived = updatedItems.some((i) => Number(i.quantidade_recebida) > 0);
  const newStatus = allReceived ? STATUS.RECEBIDA : (anyReceived ? STATUS.PARCIALMENTE_RECEBIDA : ordem.status);
  await ordem.update({ status: newStatus });

  return { id: ordem.id, status: newStatus };
}

const SAFE_ERRORS = Object.freeze([
  'Fornecedor e obrigatorio.',
  'Adicione pelo menos um produto.',
  'Fornecedor nao encontrado.',
  'Encomenda nao encontrada.',
  'Estado invalido.',
  'Esta encomenda nao pode ser alterada.',
  'Encomenda cancelada.',
  'Encomenda ja foi recebida.',
]);

module.exports = { listEncomendas, createEncomenda, updateEncomendaStatus, receberEncomenda, SAFE_ERRORS, STATUS };
