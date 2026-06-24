const { Op } = require("sequelize");
const db = require("../database");

const SAFE_ERRORS = [
  "Transação não encontrada.",
  "Valor inválido.",
];

function serializeTransacao(t) {
  return {
    id: t.id,
    tipo: t.tipo,
    categoria: t.categoria,
    descricao: t.descricao,
    valor: Number(t.valor),
    data_transacao: t.data_transacao,
    data_vencimento: t.data_vencimento,
    status: t.status,
    fornecedor: t.Fornecedor ? t.Fornecedor.nome_fantasia : null,
  };
}

async function listContasPagar() {
  const { TransacaoFinanceira, Fornecedor } = db.getModels();
  const rows = await TransacaoFinanceira.findAll({
    where: {
      tipo: "expense",
      status: { [Op.in]: ["Pendente", "Vencida"] },
    },
    include: [{ model: Fornecedor, required: false }],
    order: [["data_vencimento", "ASC"]],
  });
  return rows.map(serializeTransacao);
}

async function marcarPago(id) {
  const { TransacaoFinanceira } = db.getModels();
  const t = await TransacaoFinanceira.findByPk(id);
  if (!t) throw new Error("Transação não encontrada.");
  await t.update({ status: "Paga" });
  return serializeTransacao(t);
}

module.exports = { listContasPagar, marcarPago, SAFE_ERRORS };
