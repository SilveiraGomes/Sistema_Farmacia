import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../src/backend/database.js');
const backupService = require('../src/backend/services/backupService.js');

async function withInstallation(run) {
  const dir = await mkdtemp(join(tmpdir(), 'kil-backup-rel-'));
  const app = { getPath: () => dir };
  const log = console.log;
  console.log = () => {};
  let db;
  try {
    db = await database.connectDB(app, 'development');
    await database.syncDatabaseSchema(db);
    console.log = log;
    await run({ dir, app, db, models: database.getModels() });
  } finally {
    console.log = log;
    backupService.stopBackupScheduler();
    await db?.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

async function saveSetting(models, chave, value) {
  await models.ConfiguracaoSistema.upsert({ chave, grupo: chave.split('.')[0], tipo: 'object', valor_json: JSON.stringify(value) });
}

const sidecar = (file) => JSON.parse(readFileSync(`${file}.json`, 'utf8'));
const HOUR = 60 * 60 * 1000;

test('agendamento: hora configurada, intervalo e recuperação de backups perdidos', () => {
  const auto = { enabled: true, frequency: '24h', time: '23:00' };
  const now = new Date(2026, 9, 19, 10, 0, 0);
  assert.equal(backupService.computeNextAutoBackup({ auto, lastAuto: null, now }).getTime(), now.getTime(), 'sem backups: agora');

  const lastNight = new Date(2026, 9, 18, 23, 0, 0);
  const next = backupService.computeNextAutoBackup({ auto, lastAuto: lastNight, now });
  assert.deepEqual([next.getDate(), next.getHours(), next.getMinutes()], [19, 23, 0], 'hoje às 23:00');

  const twoDaysAgo = new Date(now.getTime() - 30 * HOUR);
  assert.equal(backupService.computeNextAutoBackup({ auto, lastAuto: twoDaysAgo, now }).getTime(), now.getTime(), 'PC desligado à hora marcada: agora');

  const weekly = backupService.computeNextAutoBackup({ auto: { ...auto, frequency: 'weekly' }, lastAuto: lastNight, now });
  assert.deepEqual([weekly.getDate(), weekly.getHours()], [25, 23], 'semanal: 7 dias depois, às 23:00');

  assert.equal(backupService.computeNextAutoBackup({ auto: { ...auto, enabled: false }, lastAuto: null, now }), null);
});

test('cada backup é verificado e guarda a contagem de registos; perda de dados gera aviso', async () => {
  await withInstallation(async ({ app, db, models }) => {
    await models.Fornecedor.bulkCreate(Array.from({ length: 25 }, (_, i) => ({ nome_fantasia: `F${i}` })));
    await models.Cliente.bulkCreate([{ nome: 'A' }, { nome: 'B' }]);

    const first = await backupService.createBackup({ app, type: 'manual' });
    assert.equal(first.state, 'OK');
    assert.equal(sidecar(first.path).counts.Fornecedors, 25);
    assert.equal(sidecar(first.path).counts.Clientes, 2);

    await db.query('DELETE FROM "Clientes"');
    await db.query('DELETE FROM "Fornecedors" WHERE id > 5');
    const second = await backupService.createBackup({ app, type: 'manual' });
    assert.equal(second.state, 'AVISO');
    assert.deepEqual(
      second.warnings.map((w) => `${w.table}:${w.before}->${w.after}`).sort(),
      ['Clientes:2->0', 'Fornecedors:25->5'],
    );

    const listed = await backupService.listBackups({ app });
    assert.equal(listed.find((b) => b.name === second.name).warnings.length, 2);
    assert.equal(listed.find((b) => b.name === first.name).counts.Fornecedors, 25);
  });
});

test('cópia adicional: copia backups verificados e indica falha se a pasta não estiver disponível', async () => {
  await withInstallation(async ({ dir, app }) => {
    const mirror = join(dir, 'pen-usb');
    const ok = await backupService.createBackup({ app, type: 'manual', mirrorFolderPath: mirror });
    assert.equal(ok.mirror.ok, true);
    assert.ok(existsSync(join(mirror, ok.name)));
    assert.ok(existsSync(join(mirror, `${ok.name}.json`)));

    const notAFolder = join(dir, 'ficheiro.txt');
    writeFileSync(notAFolder, 'x');
    const failed = await backupService.createBackup({ app, type: 'manual', mirrorFolderPath: join(notAFolder, 'sub') });
    assert.equal(failed.mirror.ok, false);
    assert.equal(failed.state, 'OK', 'o backup principal fica válido mesmo sem cópia adicional');
  });
});

test('agendador usa a pasta, retenção e cópia adicional configuradas', async () => {
  await withInstallation(async ({ dir, app, models }) => {
    const folder = join(dir, 'meus-backups');
    const mirror = join(dir, 'nuvem');
    await saveSetting(models, 'backup.auto', { enabled: true, frequency: '24h', time: '23:00', onClose: true });
    await saveSetting(models, 'backup.options', { retentionCount: 2, folderPath: folder, mirrorFolderPath: mirror });
    await backupService.initializeBackupScheduler(app);
    backupService.stopBackupScheduler();

    // Três backups automáticos antigos: com retenção 2, ficam só os 2 mais recentes.
    mkdirSync(folder, { recursive: true });
    const old = new Date(Date.now() - 3 * 24 * HOUR);
    for (const name of ['backup-2026-01-01-000000-auto.sqlite', 'backup-2026-01-02-000000-auto.sqlite']) {
      writeFileSync(join(folder, name), 'x');
      utimesSync(join(folder, name), old, old);
    }
    await backupService.runScheduledBackup(app);

    const autos = readdirSync(folder).filter((f) => f.endsWith('-auto.sqlite'));
    assert.equal(autos.length, 2);
    assert.ok(readdirSync(mirror).some((f) => f.endsWith('-auto.sqlite')));
    const status = backupService.getServiceStatus({ app });
    assert.equal(status.folderPath, folder);
    assert.ok(new Date(status.nextBackup) > new Date(), 'próximo backup no futuro');

    // Logo a seguir, não há novo backup (ainda não passou o intervalo).
    await backupService.runScheduledBackup(app);
    assert.equal(readdirSync(folder).filter((f) => f.endsWith('-auto.sqlite')).length, 2);
  });
});

test('backup ao encerrar respeita a configuração e não repete se houve backup recente', async () => {
  await withInstallation(async ({ dir, app, models }) => {
    const folder = join(dir, 'b');
    await saveSetting(models, 'backup.options', { retentionCount: 5, folderPath: folder, mirrorFolderPath: '' });
    await saveSetting(models, 'backup.auto', { enabled: false, frequency: '24h', time: '23:00', onClose: false });
    await backupService.initializeBackupScheduler(app);
    assert.equal(await backupService.createBackupOnClose(), null, 'desactivado');

    await saveSetting(models, 'backup.auto', { enabled: false, frequency: '24h', time: '23:00', onClose: true });
    await backupService.refreshBackupSchedule();
    const created = await backupService.createBackupOnClose();
    assert.match(created.name, /-close\.sqlite$/);
    assert.equal(await backupService.createBackupOnClose(), null, 'backup recente: não repete');
  });
});
