import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema } = require('../src/backend/database.js');

test('syncDatabaseSchema migrates an existing Vendas table with invoice fields', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-schema-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');

  try {
    await db.query(`
      CREATE TABLE Vendas (
        id INTEGER PRIMARY KEY,
        data_venda DATETIME,
        total DECIMAL(10,2) NOT NULL,
        desconto DECIMAL(10,2) DEFAULT '0',
        forma_pagamento VARCHAR(255) NOT NULL,
        status VARCHAR(255) DEFAULT 'Concluida',
        cliente_id INTEGER,
        usuario_id INTEGER NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `);

    await syncDatabaseSchema(db);

    const columns = await db.query('PRAGMA table_info(Vendas)', {
      type: db.QueryTypes.SELECT,
    });
    const columnNames = columns.map((column) => column.name);

    assert.ok(columnNames.includes('numero_factura'));
    assert.ok(columnNames.includes('subtotal'));
    assert.ok(columnNames.includes('imposto'));
    assert.ok(columnNames.includes('valor_pago'));
    assert.ok(columnNames.includes('troco'));

    const indexes = await db.query('PRAGMA index_list(Vendas)', {
      type: db.QueryTypes.SELECT,
    });

    assert.ok(indexes.some((index) => index.name === 'vendas_numero_factura_unique' && index.unique === 1));
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('syncDatabaseSchema migrates finance transactions with source and classification fields', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-finance-schema-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');

  try {
    await db.query(`
      CREATE TABLE TransacaoFinanceiras (
        id INTEGER PRIMARY KEY,
        tipo VARCHAR(255) NOT NULL,
        descricao TEXT,
        valor DECIMAL(10,2) NOT NULL,
        data_transacao DATETIME,
        data_vencimento DATETIME,
        status VARCHAR(255) DEFAULT 'Pendente',
        referencia_venda_id INTEGER,
        fornecedor_id INTEGER,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `);

    await syncDatabaseSchema(db);

    const columns = await db.query('PRAGMA table_info(TransacaoFinanceiras)', {
      type: db.QueryTypes.SELECT,
    });
    const columnNames = columns.map((column) => column.name);

    assert.ok(columnNames.includes('categoria'));
    assert.ok(columnNames.includes('origem'));
    assert.ok(columnNames.includes('turno'));
    assert.ok(columnNames.includes('motivo_perda'));
    assert.ok(columnNames.includes('quantidade'));
    assert.ok(columnNames.includes('produto_id'));
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
