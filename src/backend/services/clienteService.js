const { Op } = require('sequelize');
const { getModels } = require('../database');

function serializeCliente(row, extraData = {}) {
  const c = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    id: c.id,
    nome: c.nome,
    nif: c.cpf_cnpj || '',
    telefone: c.telefone || '',
    email: c.email || '',
    endereco: c.endereco || '',
    status: c.status || 'Activo',
    limite_credito: Number(c.limite_credito || 0),
    data_cadastro: c.data_cadastro
      ? new Date(c.data_cadastro).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    totalCompras: extraData.totalCompras || 0,
    ultimaCompra: extraData.ultimaCompra || null,
    creditoAberto: extraData.creditoAberto || 0,
  };
}

async function listClientes({ query = '' } = {}) {
  const { Cliente, Venda } = getModels();
  const where = {};
  if (query) {
    where[Op.or] = [
      { nome: { [Op.like]: `%${query}%` } },
      { cpf_cnpj: { [Op.like]: `%${query}%` } },
      { telefone: { [Op.like]: `%${query}%` } },
    ];
  }
  const rows = await Cliente.findAll({
    where,
    order: [['nome', 'ASC']],
    include: [{ model: Venda, required: false, attributes: ['id', 'data_venda', 'total', 'status'] }],
  });

  return rows.map((r) => {
    const c = r.get({ plain: true });
    const vendas = c.Vendas || [];
    const totalCompras = vendas.length;
    const sorted = [...vendas].sort((a, b) => new Date(b.data_venda) - new Date(a.data_venda));
    const ultimaCompra = sorted[0]
      ? new Date(sorted[0].data_venda).toISOString().slice(0, 10)
      : null;
    return serializeCliente(r, { totalCompras, ultimaCompra, creditoAberto: 0 });
  });
}

async function getCliente(id) {
  const { Cliente, Venda } = getModels();
  const row = await Cliente.findByPk(id, {
    include: [{ model: Venda, required: false, attributes: ['id', 'data_venda', 'total', 'status'] }],
  });
  if (!row) throw Object.assign(new Error('Cliente nao encontrado.'), { code: 'NOT_FOUND' });
  const c = row.get({ plain: true });
  const vendas = c.Vendas || [];
  const totalCompras = vendas.length;
  const sorted = [...vendas].sort((a, b) => new Date(b.data_venda) - new Date(a.data_venda));
  const ultimaCompra = sorted[0]
    ? new Date(sorted[0].data_venda).toISOString().slice(0, 10)
    : null;
  return serializeCliente(row, { totalCompras, ultimaCompra });
}

async function createCliente(data) {
  const { Cliente } = getModels();
  if (!data.nome) throw Object.assign(new Error('Nome do cliente e obrigatorio.'), { code: 'VALIDATION' });
  const cliente = await Cliente.create({
    nome: String(data.nome).trim(),
    cpf_cnpj: data.nif ? String(data.nif).trim() : null,
    telefone: data.telefone || null,
    email: data.email || null,
    endereco: data.endereco || null,
    status: data.status || 'Activo',
    limite_credito: Number(data.limite_credito || 0),
  });
  return serializeCliente(cliente);
}

async function updateCliente(id, data) {
  const { Cliente } = getModels();
  const cliente = await Cliente.findByPk(id);
  if (!cliente) throw Object.assign(new Error('Cliente nao encontrado.'), { code: 'NOT_FOUND' });

  const updates = {};
  if (data.nome !== undefined) updates.nome = String(data.nome).trim();
  if (data.nif !== undefined) updates.cpf_cnpj = data.nif || null;
  if (data.telefone !== undefined) updates.telefone = data.telefone || null;
  if (data.email !== undefined) updates.email = data.email || null;
  if (data.endereco !== undefined) updates.endereco = data.endereco || null;
  if (data.status !== undefined) updates.status = data.status;
  if (data.limite_credito !== undefined) updates.limite_credito = Number(data.limite_credito) || 0;

  await cliente.update(updates);
  return serializeCliente(cliente);
}

async function deleteCliente(id) {
  const { Cliente, Venda } = getModels();
  const cliente = await Cliente.findByPk(id);
  if (!cliente) throw Object.assign(new Error('Cliente nao encontrado.'), { code: 'NOT_FOUND' });

  const vendasCount = await Venda.count({ where: { cliente_id: Number(id) } });
  if (vendasCount > 0) {
    throw Object.assign(
      new Error('Cliente nao pode ser removido: possui vendas registadas.'),
      { code: 'CONSTRAINT' },
    );
  }

  await cliente.destroy();
  return { ok: true };
}

const SAFE_ERRORS = Object.freeze([
  'Nome do cliente e obrigatorio.',
  'Cliente nao encontrado.',
  'Cliente nao pode ser removido: possui vendas registadas.',
]);

module.exports = {
  listClientes,
  getCliente,
  createCliente,
  updateCliente,
  deleteCliente,
  SAFE_ERRORS,
};
