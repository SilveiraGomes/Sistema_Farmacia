const { Op } = require("sequelize");
const db = require("../database");

const SAFE_ERRORS = [];

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
     LEFT JOIN ItensVenda iv ON iv.produto_id = p.id
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
       COALESCE(SUM(e.quantidade * COALESCE(e.preco_custo, 0)), 0) AS valor_custo,
       COALESCE(SUM(e.quantidade) * p.preco_venda, 0) AS valor_venda
     FROM Produtos p
     LEFT JOIN Estoques e ON e.produto_id = p.id AND e.quantidade > 0
     GROUP BY p.id, p.nome, p.categoria, p.preco_venda
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
     FROM Fornecedores f
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
    default:
      return [];
  }
}

module.exports = { getReportData, SAFE_ERRORS };
