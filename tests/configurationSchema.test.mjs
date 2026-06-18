import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, getModels, syncDatabaseSchema } = require('../src/backend/database.js');

function fakeAppFor(userDataPath) {
  return {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };
}

test('syncDatabaseSchema creates and returns configuration models without losing data', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-configuration-schema-'));
  const db = await connectDB(fakeAppFor(userDataPath), 'development');

  try {
    await syncDatabaseSchema(db);

    const tables = await db.getQueryInterface().showAllTables();
    for (const table of ['ConfiguracoesSistema', 'OpcoesCatalogo', 'AuditoriasConfiguracao']) {
      assert.ok(tables.includes(table), `${table} should exist`);
    }

    const { ConfiguracaoSistema, OpcaoCatalogo, AuditoriaConfiguracao } = getModels();
    assert.ok(ConfiguracaoSistema);
    assert.ok(OpcaoCatalogo);
    assert.ok(AuditoriaConfiguracao);

    await ConfiguracaoSistema.create({
      chave: 'empresa.nome',
      grupo: 'empresa',
      tipo: 'texto',
      valor_json: '"Farmacia ESAYOS"',
    });

    await syncDatabaseSchema(db);

    assert.equal(await ConfiguracaoSistema.count({ where: { chave: 'empresa.nome' } }), 1);
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('OpcoesCatalogo enforces unique catalogo and codigo pairs', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-catalog-schema-'));
  const db = await connectDB(fakeAppFor(userDataPath), 'development');

  try {
    await syncDatabaseSchema(db);
    const { OpcaoCatalogo } = getModels();

    await OpcaoCatalogo.create({ catalogo: 'unidades', codigo: 'cx', nome: 'Caixa' });
    await assert.rejects(
      () => OpcaoCatalogo.create({ catalogo: 'unidades', codigo: 'cx', nome: 'Caixa duplicada' }),
      (error) => error.name === 'SequelizeUniqueConstraintError',
    );
    await OpcaoCatalogo.create({ catalogo: 'formas_pagamento', codigo: 'cx', nome: 'Caixa' });
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('connectDB uses the packaged userData SQLite database in production', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-production-database-'));
  const expectedStorage = join(userDataPath, 'database.sqlite');
  const db = await connectDB(fakeAppFor(userDataPath), 'production');

  try {
    assert.equal(db.getDialect(), 'sqlite');
    assert.equal(db.options.storage, expectedStorage);
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
