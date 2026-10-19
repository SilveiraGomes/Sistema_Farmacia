import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../src/backend/database.js');
const healthService = require('../src/backend/services/healthService.js');
const { buildSystemAlerts } = require('../src/backend/services/alertService.js');
const { runMigrations, MIGRATIONS_TABLE } = require('../src/backend/migrations/index.js');

async function withDatabase(run) {
  const dir = await mkdtemp(join(tmpdir(), 'kil-health-'));
  const log = console.log;
  console.log = () => {};
  let db;
  try {
    db = await database.connectDB({ getPath: () => dir }, 'development');
    await database.syncDatabaseSchema(db);
    console.log = log;
    await run({ db, dir, models: database.getModels() });
  } finally {
    console.log = log;
    await db?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

test('verificação de arranque: base saudável e detecção de registos órfãos', async () => {
  await withDatabase(async ({ db, dir }) => {
    const healthy = await healthService.runStartupChecks({ sequelize: db, userDataPath: dir });
    assert.equal(healthy.integrity.ok, true);
    assert.deepEqual(healthy.integrity.orphans, []);

    // Lotes de stock a apontar para produtos inexistentes (o padrão dos backups de julho).
    await db.query('PRAGMA foreign_keys = OFF');
    await db.query(`INSERT INTO "Estoques" (produto_id, lote, quantidade, data_validade, createdAt, updatedAt)
      VALUES (999, 'L1', 5, '2027-01-01', datetime(), datetime()), (998, 'L2', 3, '2027-01-01', datetime(), datetime())`);
    await db.query('PRAGMA foreign_keys = ON');
    const broken = await healthService.checkDatabaseIntegrity(db);
    assert.equal(broken.ok, true, 'ficheiro íntegro');
    assert.deepEqual(broken.orphans, [{ table: 'Estoques', parent: 'Produtos', count: 2 }]);
  });
});

test('alertas do sistema: integridade, órfãos, backups e disco, respeitando a configuração', () => {
  const all = { backupFail: true, dbCorrupt: true, integrity: true, diskSpace: true };
  const state = {
    integrity: { ok: false, problems: ['x'], orphans: [{ table: 'Estoques', parent: 'Produtos', count: 129 }] },
    disk: { low: true, freeBytes: 100 * 1024 * 1024 },
    backup: {
      lastAutoError: { message: 'Erro ao criar backup.' },
      overdue: true,
      latest: {
        name: 'backup-x.sqlite', at: new Date().toISOString(), state: 'ERRO',
        warnings: [{ table: 'Produtos', before: 302, after: 0 }],
        mirror: { ok: false, error: 'Pasta da cópia adicional indisponível.' },
      },
    },
  };
  const ids = buildSystemAlerts(all, state).map((a) => a.id);
  assert.deepEqual(ids, [
    'db-integrity', 'db-orphans', 'backup-auto-failed', 'backup-verify-failed',
    'backup-data-drop', 'backup-mirror-failed', 'backup-overdue', 'disk-space',
  ]);
  const drop = buildSystemAlerts(all, state).find((a) => a.id === 'backup-data-drop');
  assert.match(drop.message, /Produtos: 302 → 0/);
  const orphans = buildSystemAlerts(all, state).find((a) => a.id === 'db-orphans');
  assert.match(orphans.message, /129 em Lotes de stock sem Produtos/);

  const none = buildSystemAlerts({ backupFail: false, dbCorrupt: false, integrity: false, diskSpace: false }, state);
  assert.deepEqual(none, []);
  assert.deepEqual(buildSystemAlerts(all, { integrity: { ok: true, orphans: [] }, disk: { low: false } }), []);
});

test('migrações: cada uma corre uma única vez e uma falha desfaz tudo', async () => {
  await withDatabase(async ({ db }) => {
    const calls = [];
    const migrations = [
      { id: 't-001', async up(conn) { calls.push('t-001'); await conn.query('CREATE TABLE "teste_mig" (id INTEGER)'); } },
    ];
    assert.deepEqual(await runMigrations(db, migrations), ['t-001']);
    assert.deepEqual(await runMigrations(db, migrations), [], 'não repete');
    assert.deepEqual(calls, ['t-001']);

    const failing = [{ id: 't-002', async up(conn) {
      await conn.query('CREATE TABLE "parcial" (id INTEGER)');
      throw new Error('falhou a meio');
    } }];
    await assert.rejects(runMigrations(db, failing), /Migração t-002 falhou: falhou a meio/);
    const [partial] = await db.query("SELECT name FROM sqlite_master WHERE name = 'parcial'");
    assert.equal(partial.length, 0, 'alterações desfeitas');
    const applied = await db.query(`SELECT id FROM "${MIGRATIONS_TABLE}" ORDER BY id`, { type: db.QueryTypes.SELECT });
    assert.ok(applied.some((m) => m.id === '2026-10-19-001-subcategorias-unicas'));
    assert.ok(applied.some((m) => m.id === 't-001'));
    assert.ok(!applied.some((m) => m.id === 't-002'));
  });
});
