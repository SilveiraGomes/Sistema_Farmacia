import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PERMISSIONS,
  DEFAULT_PROFILES,
  ADMINISTRATOR_PROFILE,
  getPermissionKeys,
  getEssentialAdminPermissions,
} = require('../src/backend/services/permissionCatalog.js');

test('permission catalog contains unique permission keys', () => {
  const keys = getPermissionKeys();
  const unique = new Set(keys);

  assert.ok(keys.includes('usuarios.gerir_permissoes'));
  assert.ok(keys.includes('vendas.cancelar'));
  assert.equal(unique.size, keys.length);
});

test('administrator profile receives all permissions', () => {
  const admin = DEFAULT_PROFILES.find((profile) => profile.nome === ADMINISTRATOR_PROFILE);

  assert.ok(admin);
  assert.equal(admin.permissoes.length, PERMISSIONS.length);
  assert.deepEqual([...admin.permissoes].sort(), [...getPermissionKeys()].sort());
});

test('document permissions are cataloged and assigned by profile', () => {
  const documentPermissions = [
    'documentos.ver',
    'documentos.imprimir',
    'documentos.anular',
    'documentos.exportar',
    'documentos.converter',
  ];

  for (const permission of documentPermissions) {
    assert.ok(getPermissionKeys().includes(permission));
  }

  const pharmacist = DEFAULT_PROFILES.find((profile) => profile.nome === 'Farmaceutico');
  const cashier = DEFAULT_PROFILES.find((profile) => profile.nome === 'Caixa');
  const stockManager = DEFAULT_PROFILES.find((profile) => profile.nome === 'Gestor de Stock');

  assert.ok(pharmacist);
  assert.ok(cashier);
  assert.ok(stockManager);

  assert.deepEqual(
    documentPermissions.filter((permission) => pharmacist.permissoes.includes(permission)),
    ['documentos.ver', 'documentos.imprimir', 'documentos.exportar'],
  );
  assert.deepEqual(
    documentPermissions.filter((permission) => cashier.permissoes.includes(permission)),
    ['documentos.ver', 'documentos.imprimir'],
  );
  assert.deepEqual(
    documentPermissions.filter((permission) => stockManager.permissoes.includes(permission)),
    documentPermissions,
  );
});

test('document annulment is exclusive to administrator and stock manager profiles', () => {
  const profilesWithDocumentAnnulment = DEFAULT_PROFILES
    .filter((profile) => profile.permissoes.includes('documentos.anular'))
    .map((profile) => profile.nome)
    .sort();

  assert.deepEqual(profilesWithDocumentAnnulment, [ADMINISTRATOR_PROFILE, 'Gestor de Stock'].sort());
});

test('cashier profile does not receive admin permissions', () => {
  const cashier = DEFAULT_PROFILES.find((profile) => profile.nome === 'Caixa');

  assert.ok(cashier);
  assert.ok(cashier.permissoes.includes('vendas.criar'));

  for (const permission of getEssentialAdminPermissions()) {
    assert.equal(cashier.permissoes.includes(permission), false);
  }
});

test('exported permission catalog data is immutable', () => {
  assert.throws(() => {
    PERMISSIONS.push({ chave: 'teste.criar' });
  }, TypeError);

  assert.throws(() => {
    PERMISSIONS.splice(0, 1);
  }, TypeError);

  assert.throws(() => {
    PERMISSIONS[0].descricao = 'Alterado';
  }, TypeError);

  assert.throws(() => {
    DEFAULT_PROFILES.push({ nome: 'Teste', permissoes: [] });
  }, TypeError);

  assert.throws(() => {
    DEFAULT_PROFILES.splice(0, 1);
  }, TypeError);

  assert.throws(() => {
    DEFAULT_PROFILES[0].nome = 'Outro';
  }, TypeError);

  assert.throws(() => {
    DEFAULT_PROFILES[0].permissoes.push('teste.criar');
  }, TypeError);

  assert.throws(() => {
    DEFAULT_PROFILES[0].permissoes.splice(0, 1);
  }, TypeError);
});
