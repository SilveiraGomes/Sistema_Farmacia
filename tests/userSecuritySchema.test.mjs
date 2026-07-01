import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { verifyPassword } = require('../src/backend/security/passwords.js');
const { PERMISSIONS, DEFAULT_PROFILES, ADMINISTRATOR_PROFILE } = require('../src/backend/services/permissionCatalog.js');

async function withDatabase(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-user-security-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await syncDatabaseSchema(db);
    await run(db, getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

async function withDatabaseBeforeSync(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-user-security-'));
  const fakeApp = {
    getPath(name) {
      assert.equal(name, 'userData');
      return userDataPath;
    },
  };

  const db = await connectDB(fakeApp, 'development');
  try {
    await run(db, getModels());
  } finally {
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

async function assertProfilePermissionInvariant(db, models) {
  const profilePermissions = await models.PerfilPermissao.findAll({ raw: true });
  const profilePermissionPairs = profilePermissions.map((permissionLink) => (
    `${permissionLink.perfil_id}:${permissionLink.permissao_id}`
  ));
  const uniqueProfilePermissionPairs = new Set(profilePermissionPairs);
  const indexes = await db.getQueryInterface().showIndex('PerfilPermissaos');
  const hasNamedUniqueIndex = indexes.some((index) => index.name === 'perfil_permissao_unique_pair' && index.unique);
  const existingLink = profilePermissions[0];

  assert.ok(profilePermissions.length > 0);
  assert.equal(profilePermissionPairs.length, uniqueProfilePermissionPairs.size);
  assert.equal(hasNamedUniqueIndex, true);
  await assert.rejects(
    models.PerfilPermissao.create({
      perfil_id: existingLink.perfil_id,
      permissao_id: existingLink.permissao_id,
    }),
  );
}

test('syncDatabaseSchema creates user security tables and columns', async () => {
  await withDatabase(async (db) => {
    const userColumns = await db.query('PRAGMA table_info(Usuarios)', {
      type: db.QueryTypes.SELECT,
    });
    const userColumnNames = userColumns.map((column) => column.name);

    assert.ok(userColumnNames.includes('perfil_id'));
    assert.ok(userColumnNames.includes('deve_trocar_senha'));
    assert.ok(userColumnNames.includes('ultimo_login_em'));
    assert.ok(userColumnNames.includes('falhas_login'));
    assert.ok(userColumnNames.includes('bloqueado_ate'));

    const tables = await db.getQueryInterface().showAllTables();
    assert.ok(tables.includes('Perfis'));
    assert.ok(tables.includes('Permissaos'));
    assert.ok(tables.includes('PerfilPermissaos'));
    assert.ok(tables.includes('AuditoriaUsuarios'));
  });
});

test('syncDatabaseSchema migrates legacy Usuarios table without losing users', async () => {
  await withDatabaseBeforeSync(async (db, models) => {
    await db.query(`
      CREATE TABLE Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_usuario VARCHAR(255) NOT NULL UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        nome_completo VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        cargo VARCHAR(255),
        ativo TINYINT(1) DEFAULT 1,
        data_cadastro DATETIME,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `);
    await db.query(`
      INSERT INTO Usuarios (
        nome_usuario,
        senha_hash,
        nome_completo,
        email,
        cargo,
        ativo,
        data_cadastro,
        createdAt,
        updatedAt
      )
      VALUES (
        'legacy',
        'legacy-hash',
        'Usuario Legado',
        'legacy@esayos.local',
        'Caixa',
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      INSERT INTO Usuarios (
        nome_usuario,
        senha_hash,
        nome_completo,
        email,
        cargo,
        ativo,
        data_cadastro,
        createdAt,
        updatedAt
      )
      VALUES (
        'stock_legacy',
        'legacy-hash',
        'Usuario Stock',
        'stock@esayos.local',
        'Gestor de Stock',
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);
    await db.query(`
      INSERT INTO Usuarios (
        nome_usuario,
        senha_hash,
        nome_completo,
        email,
        cargo,
        ativo,
        data_cadastro,
        createdAt,
        updatedAt
      )
      VALUES (
        'unknown_legacy',
        'legacy-hash',
        'Usuario Sem Cargo',
        'unknown@esayos.local',
        '',
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `);

    await syncDatabaseSchema(db);

    const userColumns = await db.query('PRAGMA table_info(Usuarios)', {
      type: db.QueryTypes.SELECT,
    });
    const userColumnNames = userColumns.map((column) => column.name);
    const legacyUser = await models.Usuario.findOne({ where: { nome_usuario: 'legacy' } });
    const stockUser = await models.Usuario.findOne({ where: { nome_usuario: 'stock_legacy' } });
    const unknownUser = await models.Usuario.findOne({ where: { nome_usuario: 'unknown_legacy' } });
    const caixaProfile = await models.Perfil.findOne({ where: { nome: 'Caixa' } });
    const stockProfile = await models.Perfil.findOne({ where: { nome: 'Gestor de Stock' } });

    assert.ok(userColumnNames.includes('perfil_id'));
    assert.ok(userColumnNames.includes('deve_trocar_senha'));
    assert.ok(userColumnNames.includes('ultimo_login_em'));
    assert.ok(userColumnNames.includes('falhas_login'));
    assert.ok(userColumnNames.includes('bloqueado_ate'));
    assert.ok(legacyUser);
    assert.equal(legacyUser.nome_completo, 'Usuario Legado');
    assert.equal(legacyUser.perfil_id, caixaProfile.id);
    assert.equal(stockUser.perfil_id, stockProfile.id);
    assert.equal(unknownUser.perfil_id, caixaProfile.id);
  });
});

test('syncDatabaseSchema seeds profiles, permissions, and first admin', async () => {
  await withDatabase(async (db, models) => {
    const adminProfile = await models.Perfil.findOne({ where: { nome: 'Administrador' } });
    const adminUser = await models.Usuario.findOne({ where: { nome_usuario: 'admin' } });
    const permissions = await models.Permissao.findAll();
    const profiles = await models.Perfil.findAll();
    const profileNames = new Set(profiles.map((profile) => profile.nome));
    const permissionsByKey = new Map(permissions.map((permission) => [permission.chave, permission]));
    const expectedAdminProfile = DEFAULT_PROFILES.find((profile) => profile.nome === ADMINISTRATOR_PROFILE);
    const adminPermissions = await adminProfile.getPermissaos();
    const adminPermissionKeys = adminPermissions.map((permission) => permission.chave).sort();

    assert.ok(adminProfile);
    assert.ok(adminUser);
    assert.equal(adminUser.perfil_id, adminProfile.id);
    assert.equal(adminUser.deve_trocar_senha, true);
    assert.equal(verifyPassword('Admin123!', adminUser.senha_hash), true);

    for (const profile of DEFAULT_PROFILES) {
      assert.equal(profileNames.has(profile.nome), true);
    }

    for (const expectedPermission of PERMISSIONS) {
      const permission = permissionsByKey.get(expectedPermission.chave);

      assert.ok(permission);
      assert.equal(permission.modulo, expectedPermission.modulo);
      assert.equal(permission.acao, expectedPermission.acao);
      assert.equal(permission.descricao, expectedPermission.descricao);
    }

    assert.deepEqual(adminPermissionKeys, [...expectedAdminProfile.permissoes].sort());

    for (const expectedProfile of DEFAULT_PROFILES) {
      const profile = profiles.find((seededProfile) => seededProfile.nome === expectedProfile.nome);
      const profilePermissions = await profile.getPermissaos();
      const profilePermissionKeys = profilePermissions.map((permission) => permission.chave).sort();

      assert.deepEqual(profilePermissionKeys, [...expectedProfile.permissoes].sort());
    }
  });
});

test('PerfilPermissao enforces unique permission links', async () => {
  await withDatabase(async (db, models) => {
    const adminProfile = await models.Perfil.findOne({ where: { nome: ADMINISTRATOR_PROFILE } });
    const permission = await models.Permissao.findOne({ where: { chave: PERMISSIONS[0].chave } });

    await assert.rejects(
      models.PerfilPermissao.create({
        perfil_id: adminProfile.id,
        permissao_id: permission.id,
      }),
    );
  });
});

test('syncDatabaseSchema preserves custom non-admin profile permissions on later syncs', async () => {
  await withDatabase(async (db, models) => {
    const cashierProfile = await models.Perfil.findOne({ where: { nome: 'Caixa' } });
    const dashboardPermission = await models.Permissao.findOne({ where: { chave: 'dashboard.ver' } });

    await models.PerfilPermissao.destroy({ where: { perfil_id: cashierProfile.id } });
    await models.PerfilPermissao.create({
      perfil_id: cashierProfile.id,
      permissao_id: dashboardPermission.id,
    });

    await syncDatabaseSchema(db);

    const permissionsAfterSecondSync = await cashierProfile.getPermissaos();
    const permissionKeysAfterSecondSync = permissionsAfterSecondSync
      .map((permission) => permission.chave)
      .sort();

    assert.deepEqual(permissionKeysAfterSecondSync, ['configuracoes.ver', 'dashboard.ver']);
    await assertProfilePermissionInvariant(db, models);
  });
});

test('syncDatabaseSchema adds snapshot baseline to existing nonempty operational profiles', async () => {
  await withDatabase(async (db, models) => {
    const baseline = await models.Permissao.findOne({ where: { chave: 'configuracoes.ver' } });
    const custom = await models.Permissao.findOne({ where: { chave: 'dashboard.ver' } });

    for (const profileName of ['Caixa', 'Farmaceutico']) {
      const profile = await models.Perfil.findOne({ where: { nome: profileName } });
      await models.PerfilPermissao.destroy({ where: { perfil_id: profile.id } });
      await models.PerfilPermissao.create({ perfil_id: profile.id, permissao_id: custom.id });
    }

    await syncDatabaseSchema(db);

    for (const profileName of ['Caixa', 'Farmaceutico']) {
      const profile = await models.Perfil.findOne({ where: { nome: profileName } });
      const keys = (await profile.getPermissaos()).map(({ chave }) => chave).sort();
      assert.deepEqual(keys, ['configuracoes.ver', 'dashboard.ver'], profileName);
      assert.equal(keys.includes('configuracoes.editar'), false);
      assert.ok(baseline.id);
    }
    await assertProfilePermissionInvariant(db, models);
  });
});

test('syncDatabaseSchema adds newly cataloged permissions to existing administrator profile', async () => {
  await withDatabase(async (db, models) => {
    const adminProfile = await models.Perfil.findOne({ where: { nome: ADMINISTRATOR_PROFILE } });
    const documentPermission = await models.Permissao.findOne({ where: { chave: 'documentos.ver' } });

    await models.PerfilPermissao.destroy({
      where: {
        perfil_id: adminProfile.id,
        permissao_id: documentPermission.id,
      },
    });

    await syncDatabaseSchema(db);

    const permissionsAfterSync = await adminProfile.getPermissaos();
    const permissionKeysAfterSync = permissionsAfterSync.map((permission) => permission.chave);

    assert.equal(permissionKeysAfterSync.includes('documentos.ver'), true);
    await assertProfilePermissionInvariant(db, models);
  });
});

test('syncDatabaseSchema normalizes legacy inline unique PerfilPermissaos table', async () => {
  await withDatabaseBeforeSync(async (db, models) => {
    await db.query(`
      CREATE TABLE PerfilPermissaos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perfil_id INTEGER NOT NULL,
        permissao_id INTEGER NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        UNIQUE(perfil_id, permissao_id)
      )
    `);

    await syncDatabaseSchema(db);

    await assertProfilePermissionInvariant(db, models);
  });
});

test('syncDatabaseSchema normalizes legacy explicit unique index on PerfilPermissaos', async () => {
  await withDatabaseBeforeSync(async (db, models) => {
    await db.query(`
      CREATE TABLE PerfilPermissaos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perfil_id INTEGER NOT NULL,
        permissao_id INTEGER NOT NULL,
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL
      )
    `);
    await db.query(`
      CREATE UNIQUE INDEX legacy_perfil_permissao_unique
      ON PerfilPermissaos (perfil_id, permissao_id)
    `);

    await syncDatabaseSchema(db);

    await assertProfilePermissionInvariant(db, models);
  });
});

test('syncDatabaseSchema updates existing seeded permission and profile metadata', async () => {
  await withDatabase(async (db, models) => {
    const expectedPermission = PERMISSIONS[0];
    const expectedProfile = DEFAULT_PROFILES.find((profile) => profile.nome === ADMINISTRATOR_PROFILE);

    await models.Permissao.update(
      {
        modulo: 'Desatualizado',
        acao: 'desatualizada',
        descricao: 'Descricao antiga',
      },
      { where: { chave: expectedPermission.chave } },
    );
    await models.Perfil.update(
      {
        descricao: 'Perfil antigo',
        sistema: false,
        ativo: false,
      },
      { where: { nome: expectedProfile.nome } },
    );

    await syncDatabaseSchema(db);
    await syncDatabaseSchema(db);

    const permission = await models.Permissao.findOne({ where: { chave: expectedPermission.chave } });
    const profile = await models.Perfil.findOne({ where: { nome: expectedProfile.nome } });
    const adminPermissions = await profile.getPermissaos();

    assert.equal(permission.modulo, expectedPermission.modulo);
    assert.equal(permission.acao, expectedPermission.acao);
    assert.equal(permission.descricao, expectedPermission.descricao);
    assert.equal(profile.descricao, expectedProfile.descricao);
    assert.equal(profile.sistema, expectedProfile.sistema);
    assert.equal(profile.ativo, true);
    assert.equal(adminPermissions.length, expectedProfile.permissoes.length);
    await assertProfilePermissionInvariant(db, models);
  });
});
