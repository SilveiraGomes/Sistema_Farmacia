'use strict';

const db = require('../database');

const HELD_KEY = 'app.heldSales';

async function load() {
  const { ConfiguracaoSistema } = db.getModels();
  try {
    const row = await ConfiguracaoSistema.findOne({ where: { chave: HELD_KEY } });
    if (!row) return [];
    return JSON.parse(row.valor_json) || [];
  } catch {
    return [];
  }
}

async function save(sales) {
  const { ConfiguracaoSistema } = db.getModels();
  const list = Array.isArray(sales) ? sales : [];
  await ConfiguracaoSistema.upsert({
    chave: HELD_KEY,
    grupo: 'app_state',
    tipo: 'json',
    valor_json: JSON.stringify(list),
  });
  return { ok: true, count: list.length };
}

async function count() {
  const { ConfiguracaoSistema } = db.getModels();
  try {
    const row = await ConfiguracaoSistema.findOne({ where: { chave: HELD_KEY } });
    if (!row) return 0;
    return (JSON.parse(row.valor_json) || []).length;
  } catch {
    return 0;
  }
}

async function clear() {
  const { ConfiguracaoSistema } = db.getModels();
  await ConfiguracaoSistema.destroy({ where: { chave: HELD_KEY } });
  return { ok: true, count: 0 };
}

module.exports = { load, save, count, clear };
