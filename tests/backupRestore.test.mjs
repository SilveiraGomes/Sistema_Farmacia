import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const backupService = require('../src/backend/services/backupService.js');
const { hashPassword, verifyPassword } = require('../src/backend/security/passwords.js');

function fakeApp(userDataPath) {
  return { getPath: () => userDataPath };
}

async function openDatabase(app) {
  const db = await connectDB(app, 'development');
  await syncDatabaseSchema(db);
  return db;
}

// Cria um "backup antigo": instalação nova (só o admin inicial) com um fornecedor.
async function createLegacyBackup(dir) {
  const app = fakeApp(dir);
  const db = await openDatabase(app);
  await getModels().Fornecedor.create({ nome_fantasia: 'Fornecedor do Backup' });
  await db.close();
  return join(dir, 'database.sqlite');
}

test('restauro preserva utilizadores, senhas e perfis actuais e repõe os dados do backup', async () => {
  const legacyDir = await mkdtemp(join(tmpdir(), 'kil-legacy-'));
  const userData = await mkdtemp(join(tmpdir(), 'kil-restore-'));
  const app = fakeApp(userData);
  let db;
  try {
    const legacyDb = await createLegacyBackup(legacyDir);

    db = await openDatabase(app);
    const { Usuario, Perfil } = getModels();
    const caixa = await Perfil.findOne({ where: { nome: 'Caixa' } });
    await Usuario.update(
      { senha_hash: hashPassword('SenhaActual#1'), deve_trocar_senha: false },
      { where: { nome_usuario: 'admin' } },
    );
    await Usuario.create({
      nome_usuario: 'recente', nome_completo: 'Utilizador Recente', email: 'recente@test.local',
      senha_hash: hashPassword('Recente#2026'), perfil_id: caixa.id,
    });

    const backupDir = join(userData, 'backups');
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(legacyDb, join(backupDir, 'backup-2026-07-17-1953-auto.sqlite'));

    const prepared = await backupService.restoreBackup({ app, name: 'backup-2026-07-17-1953-auto.sqlite' });
    assert.equal(prepared.restartRequired, true);
    assert.equal(backupService.hasPendingRestore(app), true);
    assert.ok(readdirSync(backupDir).some((name) => name.includes('pre-restore')));

    await db.close();
    const state = backupService.applyPendingRestore(app);
    db = await openDatabase(app);
    await backupService.finalizePendingRestore(app, state);

    const models = getModels();
    assert.equal(await models.Fornecedor.count({ where: { nome_fantasia: 'Fornecedor do Backup' } }), 1);
    const admin = await models.Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(verifyPassword('SenhaActual#1', admin.senha_hash), true);
    assert.equal(admin.deve_trocar_senha, false);
    const recente = await models.Usuario.findOne({ where: { nome_usuario: 'recente' }, include: [models.Perfil] });
    assert.ok(recente);
    assert.equal(verifyPassword('Recente#2026', recente.senha_hash), true);
    assert.equal(recente.Perfil.nome, 'Caixa');
    assert.equal(backupService.hasPendingRestore(app), false);
    assert.equal(existsSync(join(userData, 'restore-rollback.sqlite')), false);
  } finally {
    await db?.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
    await rm(legacyDir, { recursive: true, force: true });
  }
});

test('restauro recusa ficheiros inválidos e reverte para a base anterior em caso de falha', async () => {
  const legacyDir = await mkdtemp(join(tmpdir(), 'kil-legacy-'));
  const userData = await mkdtemp(join(tmpdir(), 'kil-rollback-'));
  const app = fakeApp(userData);
  let db;
  try {
    const legacyDb = await createLegacyBackup(legacyDir);
    db = await openDatabase(app);
    await getModels().Usuario.create({
      nome_usuario: 'recente', nome_completo: 'Utilizador Recente',
      senha_hash: hashPassword('Recente#2026'),
    });

    const backupDir = join(userData, 'backups');
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, 'backup-2026-01-01-0000-manual.sqlite'), 'nao e sqlite');
    await assert.rejects(
      backupService.restoreBackup({ app, name: 'backup-2026-01-01-0000-manual.sqlite' }),
      /inválido ou corrompido/,
    );
    assert.equal(backupService.hasPendingRestore(app), false);

    await backupService.restoreBackup({ app, filePath: legacyDb });
    await db.close();
    const state = backupService.applyPendingRestore(app);
    backupService.rollbackPendingRestore(app, state);

    db = await openDatabase(app);
    const models = getModels();
    assert.ok(await models.Usuario.findOne({ where: { nome_usuario: 'recente' } }));
    assert.equal(await models.Fornecedor.count(), 0);
    assert.equal(backupService.hasPendingRestore(app), false);
  } finally {
    await db?.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
    await rm(legacyDir, { recursive: true, force: true });
  }
});

test('rotação automática só apaga backups automáticos antigos', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'kil-prune-'));
  const app = fakeApp(userData);
  let db;
  try {
    db = await openDatabase(app);
    const backupDir = join(userData, 'backups');
    mkdirSync(backupDir, { recursive: true });
    const old = new Date('2026-01-01T00:00:00Z');
    for (const name of [
      'backup-2026-01-01-0000-manual.sqlite',
      'backup-2026-01-01-0001-pre-restore.sqlite',
      'backup-2026-01-01-0002-auto.sqlite',
      'backup-2026-01-01-0003-auto.sqlite',
    ]) {
      writeFileSync(join(backupDir, name), 'x');
      utimesSync(join(backupDir, name), old, old);
    }

    await backupService.createBackup({ app, type: 'auto', keepCount: 1 });

    const remaining = readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'));
    assert.ok(remaining.includes('backup-2026-01-01-0000-manual.sqlite'));
    assert.ok(remaining.includes('backup-2026-01-01-0001-pre-restore.sqlite'));
    assert.equal(remaining.filter((name) => name.endsWith('-auto.sqlite')).length, 1);
    assert.equal(remaining.includes('backup-2026-01-01-0002-auto.sqlite'), false);
  } finally {
    await db?.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
  }
});
