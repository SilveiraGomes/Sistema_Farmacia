const { Op } = require('sequelize');
const { getModels } = require('../database');
const { deductStockFIFO } = require('./estoqueService');

function roundCents(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

// Map IPC docType string → DB tipo_documento
const IPC_TO_TIPO = {
  factura: 'FACTURA',
  factura_recibo: 'FACTURA_RECIBO',
  recibo: 'RECIBO',
  proforma: 'PROFORMA',
  credito: 'CREDITO',
  nota_credito: 'NOTA_CREDITO',
};

// DB tipo_documento → DOCUMENT_STATUSES value used on frontend
const TIPO_TO_STATUS = {
  FACTURA: 'EMITIDO',
  FACTURA_RECIBO: 'PAGO',
  RECIBO: 'PAGO',
  PROFORMA: 'PENDENTE',
  CREDITO: 'EMITIDO',
  NOTA_CREDITO: 'EMITIDO',
};

function serializeVendaAsDocument(row) {
  const v = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  const items = (v.ItemVendas || []).map((item) => ({
    productId: String(item.produto_id || ''),
    description: item.Produto ? item.Produto.nome : (item.nome_produto || ''),
    quantity: Number(item.quantidade || 0),
    unitPrice: roundCents(item.preco_unitario || 0),
    discount: 0,
    taxRate: 0,
    taxValue: 0,
    total: roundCents(item.subtotal || 0),
    lote: item.lote || '',
  }));

  const tipo = v.tipo_documento || 'FACTURA_RECIBO';
  return {
    id: `venda-${v.id}`,
    vendaId: v.id,
    type: tipo,
    status: v.status || TIPO_TO_STATUS[tipo] || 'PAGO',
    number: v.numero_factura || '',
    issueDate: v.data_venda ? new Date(v.data_venda).toISOString().slice(0, 10) : '',
    dueDate: v.data_venda ? new Date(v.data_venda).toISOString().slice(0, 10) : '',
    clientName: v.Cliente ? v.Cliente.nome : 'Consumidor Final',
    clientTaxId: v.Cliente ? (v.Cliente.cpf_cnpj || '999999999') : '999999999',
    clientPhone: v.Cliente ? (v.Cliente.telefone || '') : '',
    paymentMethod: v.forma_pagamento || '',
    userName: v.Usuario ? (v.Usuario.nome_completo || v.Usuario.nome_usuario || '') : '',
    items,
    subtotal: roundCents(v.subtotal || 0),
    discount: roundCents(v.desconto || 0),
    tax: roundCents(v.imposto || 0),
    retention: 0,
    total: roundCents(v.total || 0),
    received: roundCents(v.valor_pago || 0),
    change: roundCents(v.troco || 0),
    cancelledAt: v.cancelado_em ? new Date(v.cancelado_em).toISOString() : null,
    cancelledBy: v.cancelado_por || '',
    cancellationReason: v.cancelamento_motivo || '',
    originDocumentId: v.origem_documento_id ? `venda-${v.origem_documento_id}` : null,
  };
}

async function createVenda(data, actorUserId) {
  const { Venda, ItemVenda, Produto, Cliente, Usuario, TransacaoFinanceira } = getModels();

  const { items, cliente_id, docType, paymentMethod, subtotal, desconto, imposto, total, valorPago, troco, numero_factura } = data;

  if (!items || !items.length) throw Object.assign(new Error('Carrinho vazio.'), { code: 'VALIDATION' });
  if (!paymentMethod) throw Object.assign(new Error('Forma de pagamento e obrigatoria.'), { code: 'VALIDATION' });
  if (!total || Number(total) <= 0) throw Object.assign(new Error('Total invalido.'), { code: 'VALIDATION' });
  if (!numero_factura) throw Object.assign(new Error('Numero de documento e obrigatorio.'), { code: 'VALIDATION' });

  const tipoDoc = IPC_TO_TIPO[docType] || 'FACTURA_RECIBO';
  const isProforma = tipoDoc === 'PROFORMA';
  const status = TIPO_TO_STATUS[tipoDoc] || 'PAGO';

  // FIFO stock deduction — collect lot assignments per product
  const lotAssignments = {}; // produto_id → [{ lote, quantidade }]
  if (!isProforma) {
    for (const item of items) {
      try {
        const result = await deductStockFIFO({
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          motivo: `Venda ${tipoDoc} ${numero_factura}`,
        });
        lotAssignments[item.produto_id] = result.deducted;
      } catch (e) {
        const label = item.nome ? `"${item.nome}": ` : '';
        throw Object.assign(new Error(`${label}${e.message}`), { code: e.code });
      }
    }
  }

  const venda = await Venda.create({
    numero_factura,
    data_venda: new Date(),
    total: roundCents(total),
    subtotal: roundCents(subtotal || total),
    imposto: roundCents(imposto || 0),
    desconto: roundCents(desconto || 0),
    forma_pagamento: paymentMethod,
    valor_pago: roundCents(valorPago || total),
    troco: roundCents(troco || 0),
    status,
    tipo_documento: tipoDoc,
    cliente_id: cliente_id || null,
    usuario_id: actorUserId,
  });

  // Create ItemVenda rows — one per FIFO lot assignment (may be multiple rows per product)
  for (const item of items) {
    const lots = lotAssignments[item.produto_id] || [{ lote: 'PROFORMA', quantidade: Number(item.quantidade) }];
    for (const lot of lots) {
      await ItemVenda.create({
        venda_id: venda.id,
        produto_id: item.produto_id,
        lote: lot.lote,
        quantidade: lot.quantidade,
        preco_unitario: roundCents(item.preco_unitario || 0),
        subtotal: roundCents((Number(item.preco_unitario) || 0) * lot.quantidade),
      });
    }
  }

  // Record financial transaction for non-proforma sales
  if (!isProforma) {
    await TransacaoFinanceira.create({
      tipo: 'Receita',
      categoria: 'Venda',
      origem: 'PDV',
      descricao: `${tipoDoc.replace('_', '/').replace('FACTURA', 'Factura').replace('RECIBO', 'Recibo')} ${numero_factura}`,
      valor: roundCents(total),
      data_transacao: new Date(),
      status: status === 'PAGO' ? 'Pago' : 'Pendente',
      referencia_venda_id: venda.id,
    });
  }

  // Reload with all associations for the response document
  const reloaded = await Venda.findByPk(venda.id, {
    include: [
      { model: Cliente, required: false },
      { model: Usuario, required: false, attributes: ['id', 'nome_completo', 'nome_usuario'] },
      {
        model: ItemVenda, required: false,
        include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }],
      },
    ],
  });

  return serializeVendaAsDocument(reloaded);
}

async function listRecentDocuments({ limit = 10 } = {}) {
  const { Venda, ItemVenda, Produto, Cliente, Usuario } = getModels();

  const rows = await Venda.findAll({
    where: { status: { [Op.ne]: 'EM_ESPERA' } },
    order: [['data_venda', 'DESC']],
    limit: Number(limit) || 10,
    include: [
      { model: Cliente, required: false },
      { model: Usuario, required: false, attributes: ['id', 'nome_completo', 'nome_usuario'] },
      {
        model: ItemVenda, required: false,
        include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }],
      },
    ],
  });

  return rows.map(serializeVendaAsDocument);
}

async function listDocuments({ type, status, dateFrom, dateTo, limit = 200 } = {}) {
  const { Venda, ItemVenda, Produto, Cliente, Usuario } = getModels();
  const where = {};
  if (type) where.tipo_documento = type;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.data_venda = {};
    if (dateFrom) where.data_venda[Op.gte] = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.data_venda[Op.lte] = end;
    }
  }

  const rows = await Venda.findAll({
    where,
    order: [['data_venda', 'DESC']],
    limit: Number(limit) || 200,
    include: [
      { model: Cliente, required: false },
      { model: Usuario, required: false, attributes: ['id', 'nome_completo', 'nome_usuario'] },
      {
        model: ItemVenda, required: false,
        include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }],
      },
    ],
  });

  return rows.map(serializeVendaAsDocument);
}

async function convertProforma({ venda_id, invoiceNumber }, actorUserId) {
  const { Venda, ItemVenda, Produto, Cliente, Usuario, TransacaoFinanceira } = getModels();

  const original = await Venda.findByPk(venda_id, {
    include: [
      { model: Cliente, required: false },
      { model: ItemVenda, required: false, include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }] },
    ],
  });

  if (!original) throw Object.assign(new Error('Documento nao encontrado.'), { code: 'NOT_FOUND' });

  const v = original.get({ plain: true });
  if (v.tipo_documento !== 'PROFORMA') throw Object.assign(new Error('Apenas proformas podem ser convertidas.'), { code: 'VALIDATION' });
  if (v.status === 'CONVERTIDO') throw Object.assign(new Error('Proforma ja convertida.'), { code: 'VALIDATION' });
  if (v.status === 'ANULADO') throw Object.assign(new Error('Proforma anulada nao pode ser convertida.'), { code: 'VALIDATION' });

  // Deduct FIFO stock for each item
  for (const item of v.ItemVendas || []) {
    await deductStockFIFO({
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      motivo: `Conversao Proforma → Factura ${invoiceNumber}`,
    });
  }

  // Record financial transaction
  await TransacaoFinanceira.create({
    tipo: 'Receita',
    categoria: 'Venda',
    origem: 'PDV',
    descricao: `Factura ${invoiceNumber} (convertida de Proforma ${v.numero_factura})`,
    valor: roundCents(v.total),
    data_transacao: new Date(),
    status: 'Pago',
    referencia_venda_id: venda_id,
  });

  // Update the proforma to FACTURA
  await original.update({
    tipo_documento: 'FACTURA',
    status: 'EMITIDO',
    numero_factura: invoiceNumber,
    usuario_id: actorUserId,
  });

  const reloaded = await Venda.findByPk(venda_id, {
    include: [
      { model: Cliente, required: false },
      { model: Usuario, required: false, attributes: ['id', 'nome_completo', 'nome_usuario'] },
      {
        model: ItemVenda, required: false,
        include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }],
      },
    ],
  });

  return serializeVendaAsDocument(reloaded);
}

async function cancelDocument({ venda_id, reason, creditNoteNumber }, actorUserId) {
  const { Venda, ItemVenda, Produto, Cliente, Usuario } = getModels();

  const original = await Venda.findByPk(venda_id, {
    include: [
      { model: Cliente, required: false },
      { model: ItemVenda, required: false, include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }] },
    ],
  });

  if (!original) throw Object.assign(new Error('Documento nao encontrado.'), { code: 'NOT_FOUND' });

  const v = original.get({ plain: true });
  if (v.status === 'ANULADO') throw Object.assign(new Error('Documento ja foi anulado.'), { code: 'VALIDATION' });
  if (v.tipo_documento === 'NOTA_CREDITO') throw Object.assign(new Error('Nota de credito nao pode ser anulada.'), { code: 'VALIDATION' });
  if (v.tipo_documento === 'PROFORMA') throw Object.assign(new Error('Proforma nao pode ser anulada por este metodo.'), { code: 'VALIDATION' });

  const cancelledAt = new Date();
  const { Usuario: UsuarioModel } = getModels();
  const actor = await UsuarioModel.findByPk(actorUserId, { attributes: ['nome_completo', 'nome_usuario'] });
  const actorName = actor ? (actor.nome_completo || actor.nome_usuario || 'Utilizador') : 'Utilizador';

  // Mark original as cancelled
  await original.update({
    status: 'ANULADO',
    cancelamento_motivo: reason || '',
    cancelado_por: actorName,
    cancelado_em: cancelledAt,
  });

  // Create nota de crédito referencing the original
  const notaCredito = await Venda.create({
    numero_factura: creditNoteNumber,
    data_venda: cancelledAt,
    total: roundCents(v.total),
    subtotal: roundCents(v.subtotal || 0),
    imposto: roundCents(v.imposto || 0),
    desconto: roundCents(v.desconto || 0),
    forma_pagamento: v.forma_pagamento,
    valor_pago: roundCents(v.valor_pago || 0),
    troco: 0,
    status: 'EMITIDO',
    tipo_documento: 'NOTA_CREDITO',
    cancelamento_motivo: reason || '',
    cancelado_por: actorName,
    cancelado_em: cancelledAt,
    origem_documento_id: venda_id,
    cliente_id: v.cliente_id || null,
    usuario_id: actorUserId,
  });

  // Copy items to nota de crédito
  for (const item of v.ItemVendas || []) {
    await ItemVenda.create({
      venda_id: notaCredito.id,
      produto_id: item.produto_id,
      lote: item.lote,
      quantidade: item.quantidade,
      preco_unitario: roundCents(item.preco_unitario || 0),
      subtotal: roundCents(item.subtotal || 0),
    });
  }

  const reloaded = await Venda.findByPk(notaCredito.id, {
    include: [
      { model: Cliente, required: false },
      { model: Usuario, required: false, attributes: ['id', 'nome_completo', 'nome_usuario'] },
      {
        model: ItemVenda, required: false,
        include: [{ model: Produto, required: false, attributes: ['id', 'nome'] }],
      },
    ],
  });

  return {
    cancelledDoc: {
      vendaId: venda_id,
      status: 'ANULADO',
      cancelledAt: cancelledAt.toISOString(),
      cancelledBy: actorName,
      cancellationReason: reason || '',
    },
    creditNote: serializeVendaAsDocument(reloaded),
  };
}

const SAFE_ERRORS = Object.freeze([
  'Carrinho vazio.',
  'Forma de pagamento e obrigatoria.',
  'Total invalido.',
  'Numero de documento e obrigatorio.',
  'Documento nao encontrado.',
  'Documento ja foi anulado.',
  'Nota de credito nao pode ser anulada.',
  'Proforma nao pode ser anulada por este metodo.',
  'Apenas proformas podem ser convertidas.',
  'Proforma ja convertida.',
  'Proforma anulada nao pode ser convertida.',
]);

module.exports = {
  createVenda,
  listRecentDocuments,
  listDocuments,
  convertProforma,
  cancelDocument,
  SAFE_ERRORS,
};
