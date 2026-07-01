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

test('syncDatabaseSchema creates operational day and shift tables', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-operation-schema-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');

  try {
    await syncDatabaseSchema(db);

    const dayColumns = await db.query('PRAGMA table_info(DiaOperacionals)', {
      type: db.QueryTypes.SELECT,
    });
    const shiftColumns = await db.query('PRAGMA table_info(TurnoOperacionals)', {
      type: db.QueryTypes.SELECT,
    });
    const dayNames = dayColumns.map((column) => column.name);
    const shiftNames = shiftColumns.map((column) => column.name);

    for (const column of [
      'data_operacional',
      'status',
      'saldo_inicial',
      'saldo_final_informado',
      'total_vendas',
      'total_despesas',
      'total_perdas',
      'diferenca_caixa',
      'observacao_abertura',
      'observacao_fechamento',
      'aberto_por_usuario_id',
      'fechado_por_usuario_id',
      'aberto_em',
      'fechado_em',
    ]) {
      assert.ok(dayNames.includes(column), `DiaOperacionals should include ${column}`);
    }

    for (const column of [
      'dia_operacional_id',
      'nome',
      'status',
      'saldo_inicial',
      'saldo_final_informado',
      'total_vendas',
      'total_despesas',
      'total_perdas',
      'diferenca_caixa',
      'observacao_abertura',
      'observacao_fechamento',
      'aberto_por_usuario_id',
      'fechado_por_usuario_id',
      'aberto_em',
      'fechado_em',
    ]) {
      assert.ok(shiftNames.includes(column), `TurnoOperacionals should include ${column}`);
    }
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('syncDatabaseSchema enforces only one open operational day and shift at database level', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-operation-indexes-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');

  try {
    await syncDatabaseSchema(db);

    const indexes = [
      ...(await db.query('PRAGMA index_list(DiaOperacionals)', {
        type: db.QueryTypes.SELECT,
      })),
      ...(await db.query('PRAGMA index_list(TurnoOperacionals)', {
        type: db.QueryTypes.SELECT,
      })),
    ];

    assert.ok(indexes.some((index) => index.name === 'dia_operacional_one_open_unique' && index.unique === 1));
    assert.ok(indexes.some((index) => index.name === 'turno_operacional_one_open_unique' && index.unique === 1));

    await db.query(`
      INSERT INTO DiaOperacionals (
        data_operacional,
        status,
        saldo_inicial,
        total_vendas,
        total_despesas,
        total_perdas,
        diferenca_caixa,
        createdAt,
        updatedAt
      )
      VALUES ('2026-06-18', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await assert.rejects(
      () => db.query(`
        INSERT INTO DiaOperacionals (
          data_operacional,
          status,
          saldo_inicial,
          total_vendas,
          total_despesas,
          total_perdas,
          diferenca_caixa,
          createdAt,
          updatedAt
        )
        VALUES ('2026-06-19', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `),
      (error) => error.name === 'SequelizeUniqueConstraintError'
    );

    await db.query(`
      INSERT INTO DiaOperacionals (
        data_operacional,
        status,
        saldo_inicial,
        total_vendas,
        total_despesas,
        total_perdas,
        diferenca_caixa,
        createdAt,
        updatedAt
      )
      VALUES ('2026-06-19', 'Fechado', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await db.query(`
      INSERT INTO TurnoOperacionals (
        dia_operacional_id,
        nome,
        status,
        saldo_inicial,
        total_vendas,
        total_despesas,
        total_perdas,
        diferenca_caixa,
        createdAt,
        updatedAt
      )
      VALUES (1, 'Manha', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await assert.rejects(
      () => db.query(`
        INSERT INTO TurnoOperacionals (
          dia_operacional_id,
          nome,
          status,
          saldo_inicial,
          total_vendas,
          total_despesas,
          total_perdas,
          diferenca_caixa,
          createdAt,
          updatedAt
        )
        VALUES (1, 'Tarde', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `),
      (error) => error.name === 'SequelizeUniqueConstraintError'
    );
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('syncDatabaseSchema repairs duplicate open operational rows before adding indexes', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-operation-repair-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');

  try {
    await db.query(`
      CREATE TABLE DiaOperacionals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_operacional DATE NOT NULL,
        status VARCHAR(255) NOT NULL DEFAULT 'Aberto',
        saldo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0,
        saldo_final_informado DECIMAL(10,2),
        total_vendas DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_despesas DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_perdas DECIMAL(10,2) NOT NULL DEFAULT 0,
        diferenca_caixa DECIMAL(10,2) NOT NULL DEFAULT 0,
        observacao_abertura TEXT,
        observacao_fechamento TEXT,
        aberto_por_usuario_id INTEGER,
        fechado_por_usuario_id INTEGER,
        aberto_em DATETIME,
        fechado_em DATETIME,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `);
    await db.query(`
      CREATE TABLE TurnoOperacionals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dia_operacional_id INTEGER NOT NULL,
        nome VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL DEFAULT 'Aberto',
        saldo_inicial DECIMAL(10,2) NOT NULL DEFAULT 0,
        saldo_final_informado DECIMAL(10,2),
        total_vendas DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_despesas DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_perdas DECIMAL(10,2) NOT NULL DEFAULT 0,
        diferenca_caixa DECIMAL(10,2) NOT NULL DEFAULT 0,
        observacao_abertura TEXT,
        observacao_fechamento TEXT,
        aberto_por_usuario_id INTEGER,
        fechado_por_usuario_id INTEGER,
        aberto_em DATETIME,
        fechado_em DATETIME,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `);

    await db.query(`
      INSERT INTO DiaOperacionals (
        id,
        data_operacional,
        status,
        saldo_inicial,
        total_vendas,
        total_despesas,
        total_perdas,
        diferenca_caixa,
        createdAt,
        updatedAt
      )
      VALUES
        (1, '2026-06-18', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (2, '2026-06-19', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    await db.query(`
      INSERT INTO TurnoOperacionals (
        id,
        dia_operacional_id,
        nome,
        status,
        saldo_inicial,
        total_vendas,
        total_despesas,
        total_perdas,
        diferenca_caixa,
        createdAt,
        updatedAt
      )
      VALUES
        (1, 2, 'Manha', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (2, 2, 'Tarde', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (3, 1, 'Noite', 'Aberto', 0, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    await syncDatabaseSchema(db);

    const openDays = await db.query(`
      SELECT id FROM DiaOperacionals WHERE status = 'Aberto' ORDER BY id
    `, { type: db.QueryTypes.SELECT });
    const closedDays = await db.query(`
      SELECT id, status, fechado_em, observacao_fechamento
      FROM DiaOperacionals
      WHERE status = 'Fechado'
      ORDER BY id
    `, { type: db.QueryTypes.SELECT });
    const openShifts = await db.query(`
      SELECT id, dia_operacional_id FROM TurnoOperacionals WHERE status = 'Aberto' ORDER BY id
    `, { type: db.QueryTypes.SELECT });
    const closedShifts = await db.query(`
      SELECT id, status, fechado_em, observacao_fechamento
      FROM TurnoOperacionals
      WHERE status = 'Fechado'
      ORDER BY id
    `, { type: db.QueryTypes.SELECT });

    assert.deepEqual(openDays.map((day) => day.id), [2]);
    assert.equal(closedDays.length, 1);
    assert.ok(closedDays[0].fechado_em);
    assert.match(closedDays[0].observacao_fechamento, /reparar estado operacional duplicado/);

    assert.deepEqual(openShifts.map((shift) => shift.id), [2]);
    assert.equal(openShifts[0].dia_operacional_id, 2);
    assert.equal(closedShifts.length, 2);
    assert.ok(closedShifts[0].fechado_em);
    assert.match(closedShifts[0].observacao_fechamento, /reparar estado operacional duplicado/);
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
