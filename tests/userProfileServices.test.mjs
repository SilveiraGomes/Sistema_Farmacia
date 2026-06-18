import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { verifyPassword, hashPassword } = require('../src/backend/security/passwords.js');
const {
  ADMINISTRATOR_PROFILE,
  getEssentialAdminPermissions,
} = require('../src/backend/services/permissionCatalog.js');
const {
  activateUser,
  createUser,
  deactivateUser,
  listLoginUsers,
  listUsers,
  resetUserPassword,
  updateUser,
} = require('../src/backend/services/userService.js');
const {
  listPermissions,
  listProfiles,
  updateProfilePermissions,
} = require('../src/backend/services/profileService.js');

async function withServices(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-user-profile-'));
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

async function getAdminUser(Usuario) {
  return Usuario.findOne({ where: { nome_usuario: 'admin' } });
}

async function getProfileByName(Perfil, name) {
  const profile = await Perfil.findOne({ where: { nome: name } });
  assert.ok(profile, `expected seeded profile ${name}`);
  return profile;
}

test('createUser creates a user with a temporary password and stores only its hash', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');

    const result = await createUser({
      actorUserId: actor.id,
      data: {
        nome_usuario: 'maria',
        nome_completo: 'Maria da Farmacia',
        email: 'maria@esayos.local',
        cargo: 'Caixa',
        perfil_id: cashierProfile.id,
      },
    });

    assert.equal(result.temporaryPassword.length, 12);
    assert.equal(result.user.senha_hash, undefined);
    assert.equal(result.user.nome_usuario, 'maria');
    assert.equal(result.user.ativo, true);
    assert.equal(result.user.deve_trocar_senha, true);
    assert.deepEqual(result.user.perfil, { id: cashierProfile.id, nome: 'Caixa' });

    const stored = await Usuario.findOne({ where: { nome_usuario: 'maria' } });
    assert.notEqual(stored.senha_hash, result.temporaryPassword);
    assert.equal(verifyPassword(result.temporaryPassword, stored.senha_hash), true);
    assert.equal(stored.deve_trocar_senha, true);

    const audit = await AuditoriaUsuario.findOne({ where: { acao: 'USUARIO_CRIADO' } });
    assert.equal(audit.ator_usuario_id, actor.id);
    assert.equal(audit.usuario_afetado_id, stored.id);
  });
});

test('createUser rejects missing required data with service validation', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');

    await assert.rejects(
      () => createUser({ actorUserId: actor.id }),
      /Dados do usuario sao obrigatorios/
    );
    await assert.rejects(
      () => createUser({
        actorUserId: actor.id,
        data: {
          nome_usuario: 'semnome',
          perfil_id: cashierProfile.id,
        },
      }),
      /nome_completo e obrigatorio/
    );
  });
});

test('createUser rejects duplicate username and email with service errors', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');

    await Usuario.create({
      nome_usuario: 'duplicado',
      senha_hash: hashPassword('SenhaDuplicado123!'),
      nome_completo: 'Usuario Duplicado',
      email: 'duplicado@esayos.local',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    await assert.rejects(
      () => createUser({
        actorUserId: actor.id,
        data: {
          nome_usuario: 'duplicado',
          nome_completo: 'Outro Duplicado',
          email: 'outro@esayos.local',
          perfil_id: cashierProfile.id,
        },
      }),
      /Nome de usuario ja cadastrado/
    );
    await assert.rejects(
      () => createUser({
        actorUserId: actor.id,
        data: {
          nome_usuario: 'outro',
          nome_completo: 'Email Duplicado',
          email: 'duplicado@esayos.local',
          perfil_id: cashierProfile.id,
        },
      }),
      /Email ja cadastrado/
    );
  });
});

test('resetUserPassword returns a one-time temporary password and requires password change', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const user = await Usuario.create({
      nome_usuario: 'joao',
      senha_hash: hashPassword('SenhaAntiga123!'),
      nome_completo: 'Joao Caixa',
      email: 'joao@esayos.local',
      cargo: 'Caixa',
      perfil_id: cashierProfile.id,
      ativo: true,
      deve_trocar_senha: false,
      falhas_login: 4,
      bloqueado_ate: new Date(Date.now() + 60_000),
    });

    const result = await resetUserPassword({ actorUserId: actor.id, userId: user.id });

    assert.equal(result.temporaryPassword.length, 12);
    assert.equal(result.user.senha_hash, undefined);
    assert.equal(result.user.deve_trocar_senha, true);

    const stored = await Usuario.findByPk(user.id);
    assert.notEqual(stored.senha_hash, result.temporaryPassword);
    assert.equal(verifyPassword(result.temporaryPassword, stored.senha_hash), true);
    assert.equal(verifyPassword('SenhaAntiga123!', stored.senha_hash), false);
    assert.equal(stored.deve_trocar_senha, true);
    assert.equal(stored.falhas_login, 0);
    assert.equal(stored.bloqueado_ate, null);

    const audit = await AuditoriaUsuario.findOne({ where: { acao: 'SENHA_REDEFINIDA' } });
    assert.equal(audit.ator_usuario_id, actor.id);
    assert.equal(audit.usuario_afetado_id, user.id);
  });
});

test('user mutations reject missing users', async () => {
  await withServices(async ({ Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const missingUserId = 9999;

    await assert.rejects(
      () => updateUser({
        actorUserId: actor.id,
        userId: missingUserId,
        data: { nome_completo: 'Nao Existe' },
      }),
      /Usuario nao encontrado/
    );
    await assert.rejects(
      () => deactivateUser({ actorUserId: actor.id, userId: missingUserId }),
      /Usuario nao encontrado/
    );
    await assert.rejects(
      () => activateUser({ actorUserId: actor.id, userId: missingUserId }),
      /Usuario nao encontrado/
    );
    await assert.rejects(
      () => resetUserPassword({ actorUserId: actor.id, userId: missingUserId }),
      /Usuario nao encontrado/
    );
  });
});

test('deactivateUser prevents deactivating the last active administrator', async () => {
  await withServices(async ({ Usuario }) => {
    const actor = await getAdminUser(Usuario);

    await assert.rejects(
      () => deactivateUser({ actorUserId: actor.id, userId: actor.id }),
      /ultimo administrador ativo/i
    );

    const stored = await Usuario.findByPk(actor.id);
    assert.equal(stored.ativo, true);
  });
});

test('deactivateUser inactivates a user and records audit', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const user = await Usuario.create({
      nome_usuario: 'inativar',
      senha_hash: hashPassword('SenhaInativar123!'),
      nome_completo: 'Usuario Inativar',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    const deactivated = await deactivateUser({ actorUserId: actor.id, userId: user.id });
    const stored = await Usuario.findByPk(user.id);

    assert.equal(deactivated.ativo, false);
    assert.equal(stored.ativo, false);

    const audit = await AuditoriaUsuario.findOne({ where: { acao: 'USUARIO_INATIVADO' } });
    assert.equal(audit.ator_usuario_id, actor.id);
    assert.equal(audit.usuario_afetado_id, user.id);
  });
});

test('listUsers returns sanitized users sorted by full name with profile summary', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    await Usuario.create({
      nome_usuario: 'zeta',
      senha_hash: hashPassword('SenhaZeta123!'),
      nome_completo: 'Zeta Usuario',
      perfil_id: null,
      ativo: true,
    });
    await Usuario.create({
      nome_usuario: 'ana',
      senha_hash: hashPassword('SenhaAna123!'),
      nome_completo: 'Ana Usuario',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    const users = await listUsers();
    const names = users.map((user) => user.nome_completo);
    const ana = users.find((user) => user.nome_usuario === 'ana');
    const zeta = users.find((user) => user.nome_usuario === 'zeta');

    assert.deepEqual(names, [...names].sort());
    assert.equal(ana.senha_hash, undefined);
    assert.deepEqual(ana.perfil, { id: cashierProfile.id, nome: 'Caixa' });
    assert.equal(zeta.perfil, null);
  });
});

test('listLoginUsers returns only active sanitized login choices sorted by name', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    await Usuario.create({
      nome_usuario: 'zeta',
      senha_hash: hashPassword('SenhaZeta123!'),
      nome_completo: 'Zeta Usuario',
      email: 'zeta@esayos.local',
      perfil_id: cashierProfile.id,
      ativo: true,
    });
    await Usuario.create({
      nome_usuario: 'ana',
      senha_hash: hashPassword('SenhaAna123!'),
      nome_completo: 'Ana Usuario',
      email: 'ana@esayos.local',
      perfil_id: cashierProfile.id,
      ativo: false,
    });

    const users = await listLoginUsers();

    assert.deepEqual(users.map((user) => user.nome_completo), ['Administrador', 'Zeta Usuario']);
    assert.deepEqual(users.map((user) => Object.keys(user).sort()), [
      ['id', 'nome_completo', 'nome_usuario'],
      ['id', 'nome_completo', 'nome_usuario'],
    ]);
    assert.equal(users.some((user) => user.nome_usuario === 'ana'), false);
  });
});

test('updateUser changes basic fields and returns a sanitized user', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const stockProfile = await getProfileByName(Perfil, 'Gestor de Stock');
    const user = await Usuario.create({
      nome_usuario: 'editavel',
      senha_hash: hashPassword('SenhaEditavel123!'),
      nome_completo: 'Usuario Editavel',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    const updated = await updateUser({
      actorUserId: actor.id,
      userId: user.id,
      data: {
        nome_completo: 'Usuario Alterado',
        email: 'alterado@esayos.local',
        cargo: 'Stock',
        perfil_id: stockProfile.id,
        ativo: false,
      },
    });

    assert.equal(updated.senha_hash, undefined);
    assert.equal(updated.nome_completo, 'Usuario Alterado');
    assert.equal(updated.email, 'alterado@esayos.local');
    assert.equal(updated.ativo, true);
    assert.deepEqual(updated.perfil, { id: stockProfile.id, nome: 'Gestor de Stock' });

    const audit = await AuditoriaUsuario.findOne({ where: { acao: 'USUARIO_EDITADO' } });
    assert.equal(audit.ator_usuario_id, actor.id);
    assert.equal(audit.usuario_afetado_id, user.id);
  });
});

test('updateUser rejects missing data with service validation', async () => {
  await withServices(async ({ Usuario }) => {
    const actor = await getAdminUser(Usuario);

    await assert.rejects(
      () => updateUser({ actorUserId: actor.id, userId: actor.id }),
      /Dados do usuario sao obrigatorios/
    );
  });
});

test('updateUser rejects duplicate username and email with service errors', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const firstUser = await Usuario.create({
      nome_usuario: 'primeiro',
      senha_hash: hashPassword('SenhaPrimeiro123!'),
      nome_completo: 'Primeiro Usuario',
      email: 'primeiro@esayos.local',
      perfil_id: cashierProfile.id,
      ativo: true,
    });
    const secondUser = await Usuario.create({
      nome_usuario: 'segundo',
      senha_hash: hashPassword('SenhaSegundo123!'),
      nome_completo: 'Segundo Usuario',
      email: 'segundo@esayos.local',
      perfil_id: cashierProfile.id,
      ativo: true,
    });

    await assert.rejects(
      () => updateUser({
        actorUserId: actor.id,
        userId: secondUser.id,
        data: { nome_usuario: firstUser.nome_usuario },
      }),
      /Nome de usuario ja cadastrado/
    );
    await assert.rejects(
      () => updateUser({
        actorUserId: actor.id,
        userId: secondUser.id,
        data: { email: firstUser.email },
      }),
      /Email ja cadastrado/
    );
  });
});

test('updateUser prevents moving the last active administrator to another profile', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');

    await assert.rejects(
      () => updateUser({
        actorUserId: actor.id,
        userId: actor.id,
        data: { perfil_id: cashierProfile.id },
      }),
      /ultimo administrador ativo/i
    );

    const stored = await Usuario.findByPk(actor.id);
    assert.notEqual(stored.perfil_id, cashierProfile.id);
  });
});

test('activateUser reactivates user, clears lock state, and records audit', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const user = await Usuario.create({
      nome_usuario: 'reativar',
      senha_hash: hashPassword('SenhaReativar123!'),
      nome_completo: 'Usuario Reativar',
      perfil_id: cashierProfile.id,
      ativo: false,
      falhas_login: 5,
      bloqueado_ate: new Date(Date.now() + 60_000),
    });

    const activated = await activateUser({ actorUserId: actor.id, userId: user.id });
    const stored = await Usuario.findByPk(user.id);

    assert.equal(activated.ativo, true);
    assert.equal(stored.ativo, true);
    assert.equal(stored.falhas_login, 0);
    assert.equal(stored.bloqueado_ate, null);

    const audit = await AuditoriaUsuario.findOne({ where: { acao: 'USUARIO_ATIVADO' } });
    assert.equal(audit.ator_usuario_id, actor.id);
    assert.equal(audit.usuario_afetado_id, user.id);
  });
});

test('listProfiles returns sorted permission keys for each profile', async () => {
  await withServices(async () => {
    const profiles = await listProfiles();

    assert.ok(profiles.length > 0);
    for (const profile of profiles) {
      assert.deepEqual(profile.permissoes, [...profile.permissoes].sort());
    }
  });
});

test('updateProfilePermissions prevents removing essential Administrator permissions', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const adminProfile = await getProfileByName(Perfil, ADMINISTRATOR_PROFILE);
    const profiles = await listProfiles();
    const currentAdmin = profiles.find((profile) => profile.id === adminProfile.id);
    const [essential] = getEssentialAdminPermissions();
    const reducedPermissions = currentAdmin.permissoes.filter((key) => key !== essential);

    await assert.rejects(
      () => updateProfilePermissions({
        actorUserId: actor.id,
        profileId: adminProfile.id,
        permissionKeys: reducedPermissions,
      }),
      /permissoes essenciais/i
    );

    const unchangedProfiles = await listProfiles();
    const unchangedAdmin = unchangedProfiles.find((profile) => profile.id === adminProfile.id);
    assert.ok(unchangedAdmin.permissoes.includes(essential));
  });
});

test('updateProfilePermissions rejects missing profile', async () => {
  await withServices(async ({ Usuario }) => {
    const actor = await getAdminUser(Usuario);

    await assert.rejects(
      () => updateProfilePermissions({
        actorUserId: actor.id,
        profileId: 9999,
        permissionKeys: ['dashboard.ver'],
      }),
      /Perfil nao encontrado/
    );
  });
});

test('updateProfilePermissions rejects unknown permission keys', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');

    await assert.rejects(
      () => updateProfilePermissions({
        actorUserId: actor.id,
        profileId: cashierProfile.id,
        permissionKeys: ['dashboard.ver', 'permissao.inexistente'],
      }),
      /Permissoes desconhecidas: permissao\.inexistente/
    );
  });
});

test('updateProfilePermissions rejects invalid permission key values', async () => {
  await withServices(async ({ Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');

    for (const permissionKeys of [
      ['dashboard.ver', ''],
      ['dashboard.ver', '   '],
      ['dashboard.ver', 123],
    ]) {
      await assert.rejects(
        () => updateProfilePermissions({
          actorUserId: actor.id,
          profileId: cashierProfile.id,
          permissionKeys,
        }),
        /Chaves de permissao invalidas/
      );
    }
  });
});

test('listPermissions returns catalog rows sorted by module and action', async () => {
  await withServices(async () => {
    const permissions = await listPermissions();
    const labels = permissions.map((permission) => (
      `${permission.modulo}:${permission.acao}:${permission.chave}`
    ));

    assert.ok(permissions.some((permission) => permission.chave === 'usuarios.gerir_permissoes'));
    assert.deepEqual(labels, [...labels].sort());
  });
});

test('updateProfilePermissions replaces a non-administrator profile permission set', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const nextPermissions = ['dashboard.ver', 'vendas.ver'];

    const profiles = await updateProfilePermissions({
      actorUserId: actor.id,
      profileId: cashierProfile.id,
      permissionKeys: ['vendas.ver', 'dashboard.ver', 'vendas.ver'],
    });
    const cashier = profiles.find((profile) => profile.id === cashierProfile.id);

    assert.deepEqual(cashier.permissoes, nextPermissions);

    const audit = await AuditoriaUsuario.findOne({
      where: { acao: 'PERMISSOES_PERFIL_ALTERADAS' },
    });
    assert.equal(audit.ator_usuario_id, actor.id);
  });
});

test('updateProfilePermissions rolls back permission changes when audit fails', async () => {
  await withServices(async ({ AuditoriaUsuario, Perfil, Usuario }) => {
    const actor = await getAdminUser(Usuario);
    const cashierProfile = await getProfileByName(Perfil, 'Caixa');
    const beforeProfiles = await listProfiles();
    const beforeCashier = beforeProfiles.find((profile) => profile.id === cashierProfile.id);
    const originalCreate = AuditoriaUsuario.create;

    AuditoriaUsuario.create = async () => {
      throw new Error('Falha de auditoria simulada.');
    };
    try {
      await assert.rejects(
        () => updateProfilePermissions({
          actorUserId: actor.id,
          profileId: cashierProfile.id,
          permissionKeys: ['dashboard.ver'],
        }),
        /Falha de auditoria simulada/
      );
    } finally {
      AuditoriaUsuario.create = originalCreate;
    }

    const afterProfiles = await listProfiles();
    const afterCashier = afterProfiles.find((profile) => profile.id === cashierProfile.id);
    assert.deepEqual(afterCashier.permissoes, beforeCashier.permissoes);
  });
});
