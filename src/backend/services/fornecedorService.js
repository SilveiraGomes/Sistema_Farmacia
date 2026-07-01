const { Op } = require('sequelize');
const { getModels } = require('../database');

function serialize(row) {
  const p = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    id: p.id,
    nome_fantasia: p.nome_fantasia,
    razao_social: p.razao_social || null,
    nif: p.nif || null,
    telefone: p.telefone || null,
    email: p.email || null,
    endereco: p.endereco || null,
    contacto: p.contacto || null,
    ativo: p.ativo !== false,
    data_cadastro: p.data_cadastro ? new Date(p.data_cadastro).toISOString() : null,
  };
}

async function listFornecedores({ query = '', ativo } = {}) {
  const { Fornecedor } = getModels();
  const where = {};
  if (query) {
    where[Op.or] = [
      { nome_fantasia: { [Op.like]: `%${query}%` } },
      { nif: { [Op.like]: `%${query}%` } },
      { email: { [Op.like]: `%${query}%` } },
    ];
  }
  if (ativo !== undefined) where.ativo = ativo;
  const rows = await Fornecedor.findAll({ where, order: [['nome_fantasia', 'ASC']] });
  return rows.map(serialize);
}

async function createFornecedor({ nome_fantasia, razao_social, nif, telefone, email, endereco, contacto }) {
  const { Fornecedor } = getModels();
  if (!nome_fantasia || !String(nome_fantasia).trim()) {
    throw Object.assign(new Error('Nome do fornecedor e obrigatorio.'), { code: 'VALIDATION' });
  }
  const row = await Fornecedor.create({
    nome_fantasia: String(nome_fantasia).trim(),
    razao_social: razao_social ? String(razao_social).trim() : null,
    nif: nif ? String(nif).trim() : null,
    telefone: telefone ? String(telefone).trim() : null,
    email: email ? String(email).trim() : null,
    endereco: endereco ? String(endereco).trim() : null,
    contacto: contacto ? String(contacto).trim() : null,
    ativo: true,
  });
  return serialize(row);
}

async function updateFornecedor({ id, nome_fantasia, razao_social, nif, telefone, email, endereco, contacto }) {
  const { Fornecedor } = getModels();
  const row = await Fornecedor.findByPk(id);
  if (!row) throw Object.assign(new Error('Fornecedor nao encontrado.'), { code: 'NOT_FOUND' });
  await row.update({
    nome_fantasia: nome_fantasia ? String(nome_fantasia).trim() : row.nome_fantasia,
    razao_social: razao_social !== undefined ? (razao_social ? String(razao_social).trim() : null) : row.razao_social,
    nif: nif !== undefined ? (nif ? String(nif).trim() : null) : row.nif,
    telefone: telefone !== undefined ? (telefone ? String(telefone).trim() : null) : row.telefone,
    email: email !== undefined ? (email ? String(email).trim() : null) : row.email,
    endereco: endereco !== undefined ? (endereco ? String(endereco).trim() : null) : row.endereco,
    contacto: contacto !== undefined ? (contacto ? String(contacto).trim() : null) : row.contacto,
  });
  return serialize(row);
}

async function toggleFornecedor({ id, ativo }) {
  const { Fornecedor } = getModels();
  const row = await Fornecedor.findByPk(id);
  if (!row) throw Object.assign(new Error('Fornecedor nao encontrado.'), { code: 'NOT_FOUND' });
  await row.update({ ativo: Boolean(ativo) });
  return serialize(row);
}

const SAFE_ERRORS = Object.freeze([
  'Nome do fornecedor e obrigatorio.',
  'Fornecedor nao encontrado.',
]);

module.exports = { listFornecedores, createFornecedor, updateFornecedor, toggleFornecedor, SAFE_ERRORS };
