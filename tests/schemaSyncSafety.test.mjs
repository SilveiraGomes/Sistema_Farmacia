import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { Sequelize } = require('sequelize');

async function boot(dir) {
  const db = await connectDB({ getPath: () => dir }, 'development');
  await syncDatabaseSchema(db);
  return db;
}

test('arranques seguintes não reconstroem tabelas quando os modelos não mudaram', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kil-schema-'));
  const originalQuery = Sequelize.prototype.query;
  try {
    let db = await boot(dir);
    await db.close();

    const drops = [];
    Sequelize.prototype.query = function (sql, ...rest) {
      const text = typeof sql === 'string' ? sql : sql?.query || '';
      if (/DROP TABLE/i.test(text)) drops.push(text);
      return originalQuery.call(this, sql, ...rest);
    };
    db = await boot(dir);
    await db.close();
    assert.deepEqual(drops, []);
  } finally {
    Sequelize.prototype.query = originalQuery;
    await rm(dir, { recursive: true, force: true });
  }
});

test('tabelas _backup deixadas por uma reconstrução interrompida são devolvidas à tabela principal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kil-schema-'));
  let db;
  try {
    db = await boot(dir);
    await getModels().Fornecedor.bulkCreate([
      { nome_fantasia: 'Fornecedor A' },
      { nome_fantasia: 'Fornecedor B' },
    ]);
    // Simula o estado deixado por um encerramento a meio do sync antigo:
    // a tabela principal vazia e os dados apenas na tabela temporária.
    await db.query('PRAGMA foreign_keys = OFF');
    await db.query('CREATE TABLE "Fornecedors_backup" AS SELECT * FROM "Fornecedors"');
    await db.query('DELETE FROM "Fornecedors"');
    await db.close();

    db = await boot(dir);
    assert.equal(await getModels().Fornecedor.count(), 2);
    const [rows] = await db.query("SELECT name FROM sqlite_master WHERE name = 'Fornecedors_backup'");
    assert.equal(rows.length, 0);
  } finally {
    await db?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
