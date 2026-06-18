import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { getPermissionKeys } = require('../src/backend/services/permissionCatalog.js');
const {
  getUserPermissions,
  hasPermission,
  assertPermission,
} = require('../src/backend/services/authorizationService.js');

async function withModels(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-authz-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

test('administrator has all seeded permissions', async () => {
  await withModels(async ({ Usuario }) => {
    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    const permissions = await getUserPermissions(admin.id);
    const expectedPermissions = getPermissionKeys().sort();

    assert.deepEqual(permissions, expectedPermissions);
    assert.equal(await hasPermission(admin.id, 'vendas.cancelar'), true);
  });
});

test('assertPermission rejects missing permission', async () => {
  await withModels(async ({ Usuario, Perfil }) => {
    const cashierProfile = await Perfil.findOne({ where: { nome: 'Caixa' } });
    const cashier = await Usuario.create({
      nome_usuario: 'caixa1',
      senha_hash: 'hash',
      nome_completo: 'Caixa Um',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    await assert.rejects(
      () => assertPermission(cashier.id, 'usuarios.gerir_permissoes'),
      (error) => {
        assert.match(error.message, /Permissao insuficiente/);
        assert.equal(error.code, 'PERMISSION_DENIED');
        return true;
      }
    );
  });
});

test('missing user returns no permissions', async () => {
  await withModels(async () => {
    assert.deepEqual(await getUserPermissions(9999), []);
  });
});

test('user with no profile returns no permissions', async () => {
  await withModels(async ({ Usuario }) => {
    const user = await Usuario.create({
      nome_usuario: 'semperfil',
      senha_hash: 'hash',
      nome_completo: 'Sem Perfil',
      perfil_id: null,
      ativo: true,
    });

    assert.deepEqual(await getUserPermissions(user.id), []);
  });
});

test('inactive user returns no permissions', async () => {
  await withModels(async ({ Usuario, Perfil }) => {
    const cashierProfile = await Perfil.findOne({ where: { nome: 'Caixa' } });
    const user = await Usuario.create({
      nome_usuario: 'inativo',
      senha_hash: 'hash',
      nome_completo: 'Usuario Inativo',
      perfil_id: cashierProfile.id,
      ativo: false,
    });

    assert.deepEqual(await getUserPermissions(user.id), []);
  });
});

test('active user with inactive profile returns no permissions', async () => {
  await withModels(async ({ Usuario, Perfil }) => {
    const cashierProfile = await Perfil.findOne({ where: { nome: 'Caixa' } });
    await cashierProfile.update({ ativo: false });
    const user = await Usuario.create({
      nome_usuario: 'perfilinativo',
      senha_hash: 'hash',
      nome_completo: 'Perfil Inativo',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    assert.deepEqual(await getUserPermissions(user.id), []);
  });
});
