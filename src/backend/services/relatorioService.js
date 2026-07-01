const { Op } = require("sequelize");
const db = require("../database");

const SAFE_ERRORS = [];

function round(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function pad(n) { return String(n).padStart(2, '0'); }
function toDateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function getAbcProdutos({ startDate, endDate, limit = 50 }) {
  const seq = db.sequelize;
  const rows = await seq.query(
    `SELECT p.id, p.nome, p.categoria,
       COALESCE(SUM(iv.quantidade), 0) AS unidades,
       COALESCE(SUM(iv.subtotal), 0) AS receita
     FROM Produtos p
     LEFT JOIN ItemVendas iv ON iv.produto_id = p.id
     LEFT JOIN Vendas v ON v.id = iv.venda_id
       AND v.status NOT IN ('Cancelada','Anulada')
       AND DATE(v.data_venda) BETWEEN :startDate AND :endDate
     GROUP BY p.id, p.nome, p.categoria
     ORDER BY receita DESC
     LIMIT :limit`,
    { replacements: { startDate, endDate, limit }, type: seq.QueryTypes.SELECT },
  );

  const total = rows.reduce((s, r) => s + Number(r.receita), 0);
  let cumulative = 0;
  return rows.map((r, idx) => {
    cumulative += Number(r.receita);
    const pct = total > 0 ? ((Number(r.receita) / total) * 100).toFixed(1) : '0.0';
    const cumPct = total > 0 ? ((cumulative / total) * 100).toFixed(1) : '0.0';
    const classe = cumulative / total <= 0.8 ? 'A' : cumulative / total <= 0.95 ? 'B' : 'C';
    return {
      posicao: idx + 1,
      produto: r.nome,
      categoria: r.categoria || '—',
      unidades: Number(r.unidades),
      receita: Number(r.receita),
      pct_receita: pct,
      pct_acumulado: cumPct,
      classe,
    };
  });
}

async function getValidadesProximas({ daysAhead = 90 }) {
  const seq = db.sequelize;
  const today = toDateKey(new Date());
  const limit = toDateKey(addDays(new Date(), daysAhead));
  const rows = await seq.query(
    `SELECT p.nome, p.categoria, e.lote, e.data_validade,
       e.quantidade, e.localizacao,
       CAST(JULIANDAY(e.data_validade) - JULIANDAY('now') AS INTEGER) AS dias_restantes
     FROM Estoques e
     JOIN Produtos p ON p.id = e.produto_id
     WHERE e.quantidade > 0
       AND e.data_validade IS NOT NULL
       AND DATE(e.data_validade) BETWEEN :today AND :limit
     ORDER BY e.data_validade ASC`,
    { replacements: { today, limit }, type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    produto: r.nome,
    categoria: r.categoria || '—',
    lote: r.lote || '—',
    data_validade: r.data_validade ? r.data_validade.slice(0, 10) : '—',
    quantidade: Number(r.quantidade),
    dias_restantes: Number(r.dias_restantes),
    localizacao: r.localizacao || '—',
    urgencia: Number(r.dias_restantes) <= 30 ? 'CRITICO' : Number(r.dias_restantes) <= 60 ? 'ATENCAO' : 'OK',
  }));
}

async function getStockValorizado() {
  const seq = db.sequelize;
  const rows = await seq.query(
    `SELECT p.id, p.nome, p.categoria, p.preco_venda,
       COALESCE(SUM(e.quantidade), 0) AS total_unidades,
       COALESCE(SUM(e.quantidade * COALESCE(p.preco_custo, 0)), 0) AS valor_custo,
       COALESCE(SUM(e.quantidade) * p.preco_venda, 0) AS valor_venda
     FROM Produtos p
     LEFT JOIN Estoques e ON e.produto_id = p.id AND e.quantidade > 0
     GROUP BY p.id, p.nome, p.categoria, p.preco_venda, p.preco_custo
     ORDER BY valor_custo DESC`,
    { type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    produto: r.nome,
    categoria: r.categoria || '—',
    unidades: Number(r.total_unidades),
    preco_venda: Number(r.preco_venda || 0),
    valor_custo: Number(r.valor_custo),
    valor_venda: Number(r.valor_venda),
    margem: Number(r.valor_custo) > 0
      ? (((Number(r.valor_venda) - Number(r.valor_custo)) / Number(r.valor_custo)) * 100).toFixed(1)
      : '—',
  }));
}

async function getEncomendasResumo({ startDate, endDate, status }) {
  const { OrdemCompra, Fornecedor, ItemOrdemCompra } = db.getModels();
  const where = {};
  if (status) where.status = status;
  if (startDate) where.data_emissao = { [Op.between]: [startDate, endDate || '9999-12-31'] };

  const rows = await OrdemCompra.findAll({
    where,
    include: [
      { model: Fornecedor, attributes: ['nome_fantasia'] },
      { model: ItemOrdemCompra, attributes: ['quantidade', 'quantidade_recebida', 'subtotal'] },
    ],
    order: [['data_emissao', 'DESC']],
  });

  return rows.map((o) => ({
    numero: o.numero,
    fornecedor: o.Fornecedor?.nome_fantasia || '—',
    status: o.status,
    data_emissao: o.data_emissao ? String(o.data_emissao).slice(0, 10) : '—',
    data_entrega: o.data_entrega_prevista ? String(o.data_entrega_prevista).slice(0, 10) : '—',
    itens: o.ItemOrdemCompras?.length || 0,
    total: Number(o.total || 0),
    recebido: (o.ItemOrdemCompras || []).reduce((s, i) => s + Number(i.quantidade_recebida || 0), 0),
    pendente: (o.ItemOrdemCompras || []).reduce((s, i) => s + Math.max(0, Number(i.quantidade || 0) - Number(i.quantidade_recebida || 0)), 0),
  }));
}

async function getFornecedoresResumo() {
  const seq = db.sequelize;
  const rows = await seq.query(
    `SELECT f.id, f.nome_fantasia, f.nif, f.telefone, f.ativo,
       COUNT(DISTINCT oc.id) AS total_encomendas,
       COALESCE(SUM(oc.total), 0) AS total_comprado,
       MAX(oc.data_emissao) AS ultima_encomenda
     FROM Fornecedors f
     LEFT JOIN OrdensCompra oc ON oc.fornecedor_id = f.id
     GROUP BY f.id, f.nome_fantasia, f.nif, f.telefone, f.ativo
     ORDER BY total_comprado DESC`,
    { type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    fornecedor: r.nome_fantasia,
    nif: r.nif || '—',
    telefone: r.telefone || '—',
    estado: r.ativo ? 'Activo' : 'Inactivo',
    encomendas: Number(r.total_encomendas),
    total_comprado: Number(r.total_comprado),
    ultima_encomenda: r.ultima_encomenda ? String(r.ultima_encomenda).slice(0, 10) : '—',
  }));
}

async function getDocumentosEmitidos({ startDate, endDate }) {
  const seq = db.sequelize;
  const sd = startDate || '2020-01-01';
  const ed = endDate || '9999-12-31';
  const rows = await seq.query(
    `SELECT v.numero_factura, v.tipo_documento, DATE(v.data_venda) AS data_venda,
       COALESCE(c.nome, 'Consumidor Final') AS cliente,
       v.forma_pagamento, v.total, v.desconto, v.status
     FROM Vendas v
     LEFT JOIN Clientes c ON c.id = v.cliente_id
     WHERE DATE(v.data_venda) BETWEEN :sd AND :ed
     ORDER BY v.data_venda DESC`,
    { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    numero: r.numero_factura,
    tipo: (r.tipo_documento || '').replace(/_/g, ' '),
    data: r.data_venda || '—',
    cliente: r.cliente,
    pagamento: r.forma_pagamento || '—',
    desconto: Number(r.desconto || 0),
    total: Number(r.total || 0),
    status: r.status || '—',
  }));
}

async function getClientesCreditoAberto({ startDate, endDate }) {
  const seq = db.sequelize;
  const sd = startDate || '2020-01-01';
  const ed = endDate || '9999-12-31';
  const rows = await seq.query(
    `SELECT c.nome, c.cpf_cnpj AS nif, c.telefone, c.email,
       c.limite_credito,
       COUNT(v.id) AS total_compras,
       COALESCE(SUM(v.total), 0) AS total_gasto,
       MAX(DATE(v.data_venda)) AS ultima_compra
     FROM Clientes c
     LEFT JOIN Vendas v ON v.cliente_id = c.id
       AND DATE(v.data_venda) BETWEEN :sd AND :ed
       AND v.status NOT IN ('Cancelada','Anulada')
     WHERE c.status = 'Activo'
     GROUP BY c.id, c.nome, c.cpf_cnpj, c.telefone, c.email, c.limite_credito
     ORDER BY total_gasto DESC`,
    { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    cliente: r.nome,
    nif: r.nif || '—',
    telefone: r.telefone || '—',
    limite_credito: Number(r.limite_credito || 0),
    total_compras: Number(r.total_compras || 0),
    total_gasto: Number(r.total_gasto || 0),
    ultima_compra: r.ultima_compra || '—',
  }));
}

async function getStockBaixo() {
  const seq = db.sequelize;
  const rows = await seq.query(
    `SELECT p.nome, p.categoria, p.estoque_minimo, p.codigo_barras,
       COALESCE(SUM(e.quantidade), 0) AS stock_atual
     FROM Produtos p
     LEFT JOIN Estoques e ON e.produto_id = p.id AND e.quantidade > 0
     GROUP BY p.id, p.nome, p.categoria, p.estoque_minimo, p.codigo_barras
     HAVING stock_atual <= p.estoque_minimo
     ORDER BY stock_atual ASC, p.nome ASC`,
    { type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    produto: r.nome,
    categoria: r.categoria || '—',
    codigo: r.codigo_barras || '—',
    stock_atual: Number(r.stock_atual),
    estoque_minimo: Number(r.estoque_minimo || 0),
    diferenca: Number(r.estoque_minimo || 0) - Number(r.stock_atual),
    situacao: Number(r.stock_atual) === 0 ? 'SEM STOCK' : 'ABAIXO DO MÍNIMO',
  }));
}

async function getDemonstrativoFinanceiro({ startDate, endDate }) {
  const seq = db.sequelize;
  const sd = startDate || '2020-01-01';
  const ed = endDate || '9999-12-31';
  const rows = await seq.query(
    `SELECT DATE(v.data_venda) AS data,
       COUNT(v.id) AS facturas,
       COALESCE(SUM(v.total), 0) AS receita_bruta,
       COALESCE(SUM(v.desconto), 0) AS descontos,
       COALESCE(SUM(v.total), 0) - COALESCE(SUM(v.desconto), 0) AS receita_liquida
     FROM Vendas v
     WHERE DATE(v.data_venda) BETWEEN :sd AND :ed
       AND v.status NOT IN ('Cancelada','Anulada')
     GROUP BY DATE(v.data_venda)
     ORDER BY data DESC`,
    { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    data: r.data || '—',
    facturas: Number(r.facturas),
    receita_bruta: Number(r.receita_bruta),
    descontos: Number(r.descontos),
    receita_liquida: Number(r.receita_liquida),
  }));
}

async function getVendasDetalhadas({ startDate, endDate }) {
  const seq = db.sequelize;
  const sd = startDate || '2020-01-01';
  const ed = endDate || '9999-12-31';
  const rows = await seq.query(
    `SELECT v.numero_factura, DATE(v.data_venda) AS data,
       COALESCE(c.nome, 'Consumidor Final') AS cliente,
       p.nome AS produto, p.categoria,
       iv.quantidade, iv.preco_unitario, iv.subtotal,
       v.forma_pagamento, v.status
     FROM ItemVendas iv
     JOIN Vendas v ON v.id = iv.venda_id
     JOIN Produtos p ON p.id = iv.produto_id
     LEFT JOIN Clientes c ON c.id = v.cliente_id
     WHERE DATE(v.data_venda) BETWEEN :sd AND :ed
       AND v.status NOT IN ('Cancelada','Anulada')
     ORDER BY v.data_venda DESC, v.numero_factura`,
    { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    numero: r.numero_factura,
    data: r.data || '—',
    cliente: r.cliente,
    produto: r.produto,
    categoria: r.categoria || '—',
    quantidade: Number(r.quantidade),
    preco_unitario: Number(r.preco_unitario),
    subtotal: Number(r.subtotal),
    pagamento: r.forma_pagamento || '—',
  }));
}

async function getRelatorioDiario({ startDate, endDate }) {
  const seq = db.sequelize;
  const sd = startDate || '2020-01-01';
  const ed = endDate || '9999-12-31';
  const rows = await seq.query(
    `SELECT DATE(v.data_venda) AS data,
       COUNT(v.id) AS facturas,
       COUNT(DISTINCT v.cliente_id) AS clientes,
       COALESCE(SUM(iv.quantidade), 0) AS unidades_vendidas,
       COALESCE(SUM(v.desconto), 0) AS descontos,
       COALESCE(SUM(v.total), 0) AS total_vendas
     FROM Vendas v
     LEFT JOIN ItemVendas iv ON iv.venda_id = v.id
     WHERE DATE(v.data_venda) BETWEEN :sd AND :ed
       AND v.status NOT IN ('Cancelada','Anulada')
     GROUP BY DATE(v.data_venda)
     ORDER BY data DESC`,
    { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    data: r.data || '—',
    facturas: Number(r.facturas),
    clientes: Number(r.clientes),
    unidades_vendidas: Number(r.unidades_vendidas),
    descontos: Number(r.descontos),
    total_vendas: Number(r.total_vendas),
  }));
}

async function getResumoExecutivo({ startDate, endDate }) {
  const seq = db.sequelize;
  const sd = startDate || '2020-01-01';
  const ed = endDate || '9999-12-31';
  const [vendas, clientes, produtos, stock] = await Promise.all([
    seq.query(
      `SELECT COUNT(id) AS total_facturas, COALESCE(SUM(total),0) AS receita, COALESCE(SUM(desconto),0) AS descontos
       FROM Vendas WHERE DATE(data_venda) BETWEEN :sd AND :ed AND status NOT IN ('Cancelada','Anulada')`,
      { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
    ),
    seq.query(
      `SELECT COUNT(DISTINCT cliente_id) AS clientes_unicos FROM Vendas
       WHERE DATE(data_venda) BETWEEN :sd AND :ed AND status NOT IN ('Cancelada','Anulada') AND cliente_id IS NOT NULL`,
      { replacements: { sd, ed }, type: seq.QueryTypes.SELECT },
    ),
    seq.query(
      `SELECT COUNT(id) AS total_produtos FROM Produtos`,
      { type: seq.QueryTypes.SELECT },
    ),
    seq.query(
      `SELECT COUNT(DISTINCT produto_id) AS sem_stock FROM (
         SELECT p.id AS produto_id FROM Produtos p
         LEFT JOIN Estoques e ON e.produto_id = p.id AND e.quantidade > 0
         GROUP BY p.id HAVING COALESCE(SUM(e.quantidade),0) = 0
       )`,
      { type: seq.QueryTypes.SELECT },
    ),
  ]);
  const v = vendas[0] || {};
  const c = clientes[0] || {};
  const p = produtos[0] || {};
  const s = stock[0] || {};
  return [
    { metrica: 'Facturas emitidas', valor: Number(v.total_facturas || 0) },
    { metrica: 'Receita total', valor: `KZ ${Number(v.receita || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}` },
    { metrica: 'Total descontos', valor: `KZ ${Number(v.descontos || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}` },
    { metrica: 'Clientes únicos no período', valor: Number(c.clientes_unicos || 0) },
    { metrica: 'Total de produtos cadastrados', valor: Number(p.total_produtos || 0) },
    { metrica: 'Produtos sem stock', valor: Number(s.sem_stock || 0) },
  ];
}

async function getReportData({ reportId, filters = {} }) {
  const { startDate, endDate, daysAhead, status, limit } = filters;
  switch (reportId) {
    case 'abc-produtos':
      return getAbcProdutos({ startDate: startDate || '2020-01-01', endDate: endDate || '9999-12-31', limit: limit || 50 });
    case 'validades-proximas':
      return getValidadesProximas({ daysAhead: daysAhead || 90 });
    case 'stock-valorizado':
      return getStockValorizado();
    case 'encomendas-resumo':
      return getEncomendasResumo({ startDate, endDate, status });
    case 'fornecedores-resumo':
      return getFornecedoresResumo();
    case 'documentos-emitidos':
      return getDocumentosEmitidos({ startDate, endDate });
    case 'clientes-credito-aberto':
      return getClientesCreditoAberto({ startDate, endDate });
    case 'stock-baixo':
      return getStockBaixo();
    case 'demonstrativo-financeiro':
      return getDemonstrativoFinanceiro({ startDate, endDate });
    case 'vendas-detalhadas':
      return getVendasDetalhadas({ startDate, endDate });
    case 'relatorio-diario':
      return getRelatorioDiario({ startDate, endDate });
    case 'resumo-executivo':
      return getResumoExecutivo({ startDate, endDate });
    default:
      return [];
  }
}

async function getRawData({ startDate, endDate } = {}) {
  const { Venda, ItemVenda, Produto, TransacaoFinanceira } = db.getModels();
  const seq = db.sequelize;

  const start = startDate ? new Date(startDate) : new Date('2020-01-01');
  const end = endDate
    ? (() => { const d = new Date(endDate); d.setHours(23, 59, 59, 999); return d; })()
    : new Date();
  const startStr = startDate || '2020-01-01';
  const endStr = endDate || '9999-12-31';

  // Sales
  const vendas = await Venda.findAll({
    where: {
      status: { [Op.notIn]: ['ANULADO'] },
      tipo_documento: { [Op.notIn]: ['PROFORMA', 'NOTA_CREDITO'] },
      data_venda: { [Op.between]: [start, end] },
    },
    include: [{
      model: ItemVenda,
      required: true,
      include: [{ model: Produto, required: false, attributes: ['id', 'nome', 'categoria', 'preco_custo'] }],
    }],
  });

  const sales = [];
  for (const venda of vendas) {
    const v = venda.get({ plain: true });
    const dateStr = new Date(v.data_venda).toISOString().slice(0, 10);
    for (const item of (v.ItemVendas || [])) {
      const qty = Number(item.quantidade || 0);
      const price = round(item.preco_unitario || 0);
      const cost = round(item.Produto ? Number(item.Produto.preco_custo || 0) : 0);
      sales.push({
        product: item.Produto ? item.Produto.nome : `Produto #${item.produto_id}`,
        category: item.Produto ? (item.Produto.categoria || '') : '',
        quantity: qty,
        revenue: round(price * qty),
        cost: round(cost * qty),
        paymentMethod: v.forma_pagamento || 'Dinheiro',
        date: dateStr,
        shift: 'Manha',
      });
    }
  }

  // Losses
  const lossRows = await TransacaoFinanceira.findAll({
    where: {
      [Op.or]: [
        { categoria: { [Op.in]: ['Perdas', 'Perda'] } },
        { motivo_perda: { [Op.ne]: null } },
      ],
      data_transacao: { [Op.between]: [start, end] },
    },
  });
  const losses = lossRows.map((row) => {
    const r = row.get({ plain: true });
    return {
      reason: r.motivo_perda || r.categoria || 'Perda',
      quantity: Number(r.quantidade || 1),
      value: round(r.valor),
      date: new Date(r.data_transacao).toISOString().slice(0, 10),
      shift: r.turno || 'Manha',
    };
  });

  // Expenses
  const expRows = await TransacaoFinanceira.findAll({
    where: {
      tipo: { [Op.in]: ['Despesa', 'expense'] },
      categoria: { [Op.notIn]: ['Perdas', 'Perda', 'Venda'] },
      motivo_perda: null,
      data_transacao: { [Op.between]: [start, end] },
    },
  });
  const expenses = expRows.map((row) => {
    const r = row.get({ plain: true });
    return {
      category: r.categoria || 'Outros',
      description: r.descricao || '',
      value: round(r.valor),
      date: new Date(r.data_transacao).toISOString().slice(0, 10),
      status: r.status || 'Paga',
      shift: r.turno || 'Manha',
      source: r.origem || 'Manual',
    };
  });

  // Other revenues
  const revRows = await TransacaoFinanceira.findAll({
    where: {
      tipo: { [Op.in]: ['Receita', 'revenue'] },
      origem: { [Op.ne]: 'PDV' },
      data_transacao: { [Op.between]: [start, end] },
    },
  });
  const otherRevenues = revRows.map((row) => {
    const r = row.get({ plain: true });
    return {
      category: r.categoria || 'Receita',
      description: r.descricao || '',
      value: round(r.valor),
      date: new Date(r.data_transacao).toISOString().slice(0, 10),
      status: r.status || 'Paga',
      shift: r.turno || 'Manha',
      source: r.origem || 'Manual',
    };
  });

  // Clients (raw SQL — confirmed table name Clientes)
  const clientRows = await seq.query(
    `SELECT id, nome, COALESCE(telefone, '') AS telefone,
       COALESCE(status, 'Activo') AS status,
       COALESCE(creditoAberto, 0) AS creditoAberto
     FROM Clientes`,
    { type: seq.QueryTypes.SELECT },
  );
  const clients = clientRows.map((r) => ({
    id: r.id,
    name: r.nome,
    phone: r.telefone,
    status: r.status,
    openCredit: Number(r.creditoAberto),
  }));

  // Stock rows (raw SQL — confirmed table names Produtos + Estoques)
  const stockRawRows = await seq.query(
    `SELECT p.id, p.nome, p.categoria, COALESCE(p.prateleira, '') AS prateleira,
       COALESCE(p.estoque_minimo, 0) AS estoque_minimo,
       COALESCE(SUM(e.quantidade), 0) AS total_quantidade
     FROM Produtos p
     LEFT JOIN Estoques e ON e.produto_id = p.id
     GROUP BY p.id, p.nome, p.categoria, p.prateleira, p.estoque_minimo`,
    { type: seq.QueryTypes.SELECT },
  );
  const stockRows = stockRawRows.map((r) => {
    const qty = Number(r.total_quantidade);
    const min = Number(r.estoque_minimo);
    let stockStatus = 'OK';
    if (qty === 0) stockStatus = 'Sem estoque';
    else if (qty <= min) stockStatus = 'Baixo estoque';
    return { id: r.id, name: r.nome, category: r.categoria || '', quantity: qty, status: stockStatus, location: r.prateleira };
  });

  // Documents for the period (raw SQL — confirmed table names Vendas + Clientes)
  const docRows = await seq.query(
    `SELECT v.id, v.numero_factura, v.tipo_documento, v.status,
       DATE(v.data_venda) AS data_venda, CAST(v.total AS REAL) AS total,
       v.cancelado_por, COALESCE(c.nome, 'Consumidor Final') AS cliente_nome
     FROM Vendas v
     LEFT JOIN Clientes c ON c.id = v.cliente_id
     WHERE DATE(v.data_venda) BETWEEN :startStr AND :endStr
     ORDER BY v.data_venda DESC
     LIMIT 500`,
    { replacements: { startStr, endStr }, type: seq.QueryTypes.SELECT },
  );

  const TIPO_TO_DOCSTATUS = {
    PROFORMA: 'PENDENTE', NOTA_CREDITO: 'EMITIDO',
    FACTURA_RECIBO: 'PAGO', FACTURA: 'EMITIDO', RECIBO: 'PAGO',
  };
  const documents = docRows.map((r) => {
    const tipo = r.tipo_documento || 'FACTURA_RECIBO';
    let docStatus;
    if (r.status === 'ANULADO' || r.cancelado_por) docStatus = 'ANULADO';
    else if (r.status === 'CONVERTIDO') docStatus = 'CONVERTIDO';
    else docStatus = TIPO_TO_DOCSTATUS[tipo] || 'EMITIDO';
    return {
      id: `venda-${r.id}`,
      vendaId: r.id,
      type: tipo,
      status: docStatus,
      number: r.numero_factura || `DOC-${r.id}`,
      issueDate: r.data_venda || '',
      total: Number(r.total || 0),
      clientName: r.cliente_nome,
      userName: '',
    };
  });

  return { sales, losses, expenses, otherRevenues, clients, stockRows, documents };
}

module.exports = { getReportData, getRawData, SAFE_ERRORS };
