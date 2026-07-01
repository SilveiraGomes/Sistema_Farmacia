import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { connectDB, syncDatabaseSchema, getModels } = require('../src/backend/database.js');
const { verifyPassword } = require('../src/backend/security/passwords.js');
const {
  login,
  logout,
  getCurrentSession,
  refreshCurrentSession,
  changeOwnPassword,
} = require('../src/backend/services/authService.js');

async function withAuth(run) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'pharmacy-auth-'));
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
    logout();
    await db.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
}

function parseAuditDetails(audit) {
  return JSON.parse(audit.detalhes);
}

test('login returns safe session for valid credentials', async () => {
  await withAuth(async () => {
    const session = await login({ username: 'admin', password: 'Admin123!' });

    assert.equal(session.user.nome_usuario, 'admin');
    assert.equal(session.user.senha_hash, undefined);
    assert.ok(session.permissions.includes('usuarios.gerir_permissoes'));
    assert.equal(session.mustChangePassword, true);
    assert.equal((await getCurrentSession()).user.nome_usuario, 'admin');
  });
});

test('login rejects invalid password and increments failures', async () => {
  await withAuth(async ({ Usuario }) => {
    await assert.rejects(
      () => login({ username: 'admin', password: 'errada' }),
      /Credenciais invalidas/
    );

    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(admin.falhas_login, 1);
  });
});

test('login rejects unknown username', async () => {
  await withAuth(async () => {
    await assert.rejects(
      () => login({ username: 'desconhecido', password: 'Admin123!' }),
      /Credenciais invalidas/
    );
  });
});

test('concurrent failed logins increment each failure', async () => {
  await withAuth(async ({ Usuario }) => {
    const attempts = Array.from({ length: 5 }, () => (
      assert.rejects(
        () => login({ username: 'admin', password: 'errada' }),
        /Credenciais invalidas/
      )
    ));

    await Promise.all(attempts);

    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(admin.falhas_login, 5);
    assert.ok(admin.bloqueado_ate instanceof Date);
  });
});

test('login locks user after maximum failures', async () => {
  await withAuth(async ({ Usuario }) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        () => login({ username: 'admin', password: 'errada' }),
        /Credenciais invalidas/
      );
    }

    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(admin.falhas_login, 5);
    assert.ok(admin.bloqueado_ate instanceof Date);

    await assert.rejects(
      () => login({ username: 'admin', password: 'Admin123!' }),
      /Usuario temporariamente bloqueado/
    );
  });
});

test('successful login clears previous failures and expired lock', async () => {
  await withAuth(async ({ Usuario }) => {
    await Usuario.update(
      {
        falhas_login: 4,
        bloqueado_ate: new Date(Date.now() - 60 * 1000),
      },
      { where: { nome_usuario: 'admin' } }
    );

    const session = await login({ username: 'admin', password: 'Admin123!' });
    assert.equal(session.user.senha_hash, undefined);

    const admin = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.equal(admin.falhas_login, 0);
    assert.equal(admin.bloqueado_ate, null);
  });
});

test('login rejects inactive user', async () => {
  await withAuth(async ({ Usuario }) => {
    await Usuario.update({ ativo: false }, { where: { nome_usuario: 'admin' } });

    await assert.rejects(
      () => login({ username: 'admin', password: 'Admin123!' }),
      /Usuario inativo/
    );
  });
});

test('getCurrentSession refreshes permission changes', async () => {
  await withAuth(async ({ PerfilPermissao, Permissao }) => {
    const session = await login({ username: 'admin', password: 'Admin123!' });
    assert.ok(session.permissions.includes('usuarios.gerir_permissoes'));

    const permission = await Permissao.findOne({
      where: { chave: 'usuarios.gerir_permissoes' },
    });
    await PerfilPermissao.destroy({
      where: {
        perfil_id: session.user.perfil_id,
        permissao_id: permission.id,
      },
    });

    const refreshed = await getCurrentSession();
    assert.equal(refreshed.user.senha_hash, undefined);
    assert.equal(refreshed.permissions.includes('usuarios.gerir_permissoes'), false);
  });
});

test('refreshCurrentSession clears deleted user session', async () => {
  await withAuth(async ({ AuditoriaUsuario, Usuario }) => {
    await login({ username: 'admin', password: 'Admin123!' });
    await AuditoriaUsuario.destroy({ where: {} });
    await Usuario.destroy({ where: { nome_usuario: 'admin' } });

    assert.equal(await refreshCurrentSession(), null);
    assert.equal(await getCurrentSession(), null);
  });
});

test('refreshCurrentSession clears inactive user session', async () => {
  await withAuth(async ({ Usuario }) => {
    await login({ username: 'admin', password: 'Admin123!' });
    await Usuario.update({ ativo: false }, { where: { nome_usuario: 'admin' } });

    assert.equal(await refreshCurrentSession(), null);
    assert.equal(await getCurrentSession(), null);
  });
});

test('changeOwnPassword rejects unauthenticated session', async () => {
  await withAuth(async () => {
    await assert.rejects(
      () => changeOwnPassword({
        currentPassword: 'Admin123!',
        newPassword: 'NovaSenha123!',
      }),
      /Sessao expirada/
    );
  });
});

test('changeOwnPassword rejects invalid current password', async () => {
  await withAuth(async () => {
    await login({ username: 'admin', password: 'Admin123!' });

    await assert.rejects(
      () => changeOwnPassword({
        currentPassword: 'SenhaErrada123!',
        newPassword: 'NovaSenha123!',
      }),
      /Senha atual invalida/
    );
  });
});

test('changeOwnPassword rejects inactive current session and clears it', async () => {
  await withAuth(async ({ Usuario }) => {
    await login({ username: 'admin', password: 'Admin123!' });
    await Usuario.update({ ativo: false }, { where: { nome_usuario: 'admin' } });

    await assert.rejects(
      () => changeOwnPassword({
        currentPassword: 'Admin123!',
        newPassword: 'NovaSenha123!',
      }),
      /Sessao expirada/
    );
    assert.equal(await getCurrentSession(), null);
  });
});

test('changeOwnPassword clears forced password change', async () => {
  await withAuth(async () => {
    await login({ username: 'admin', password: 'Admin123!' });
    const session = await changeOwnPassword({
      currentPassword: 'Admin123!',
      newPassword: 'NovaSenha123!',
    });

    assert.equal(session.mustChangePassword, false);
    assert.equal(session.user.senha_hash, undefined);
  });
});

test('changeOwnPassword changes stored hash and clears forced password change', async () => {
  await withAuth(async ({ Usuario }) => {
    await login({ username: 'admin', password: 'Admin123!' });
    const before = await Usuario.findOne({ where: { nome_usuario: 'admin' } });

    await changeOwnPassword({
      currentPassword: 'Admin123!',
      newPassword: 'NovaSenha123!',
    });

    const after = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    assert.notEqual(after.senha_hash, before.senha_hash);
    assert.equal(verifyPassword('NovaSenha123!', after.senha_hash), true);
    assert.equal(after.deve_trocar_senha, false);
  });
});

test('login and own password change are audited', async () => {
  await withAuth(async ({ AuditoriaUsuario, Usuario }) => {
    const session = await login({ username: 'admin', password: 'Admin123!' });
    await changeOwnPassword({
      currentPassword: 'Admin123!',
      newPassword: 'NovaSenha123!',
    });

    const audits = await AuditoriaUsuario.findAll({
      order: [['id', 'ASC']],
    });
    const successAudit = audits.find((audit) => audit.acao === 'LOGIN_SUCESSO');
    const passwordAudit = audits.find((audit) => audit.acao === 'TROCA_SENHA_PROPRIA');
    const admin = await Usuario.findByPk(session.user.id);

    assert.equal(successAudit.ator_usuario_id, admin.id);
    assert.equal(successAudit.usuario_afetado_id, admin.id);
    assert.equal(passwordAudit.ator_usuario_id, admin.id);
    assert.equal(passwordAudit.usuario_afetado_id, admin.id);
  });
});

test('failed inactive and blocked login attempts are audited', async () => {
  await withAuth(async ({ AuditoriaUsuario, Usuario }) => {
    await assert.rejects(
      () => login({ username: 'admin', password: 'errada' }),
      /Credenciais invalidas/
    );

    const adminAfterFailure = await Usuario.findOne({ where: { nome_usuario: 'admin' } });
    let failedAudit = await AuditoriaUsuario.findOne({
      where: { acao: 'LOGIN_FALHA' },
    });
    assert.equal(failedAudit.ator_usuario_id, null);
    assert.equal(failedAudit.usuario_afetado_id, adminAfterFailure.id);
    assert.deepEqual(parseAuditDetails(failedAudit), { falhas: 1 });

    await Usuario.update({ ativo: false }, { where: { id: adminAfterFailure.id } });
    await assert.rejects(
      () => login({ username: 'admin', password: 'Admin123!' }),
      /Usuario inativo/
    );
    const inactiveAudit = await AuditoriaUsuario.findOne({
      where: { acao: 'LOGIN_USUARIO_INATIVO' },
    });
    assert.equal(inactiveAudit.ator_usuario_id, null);
    assert.equal(inactiveAudit.usuario_afetado_id, adminAfterFailure.id);

    await Usuario.update(
      {
        ativo: true,
        bloqueado_ate: new Date(Date.now() + 15 * 60 * 1000),
      },
      { where: { id: adminAfterFailure.id } }
    );
    await assert.rejects(
      () => login({ username: 'admin', password: 'Admin123!' }),
      /Usuario temporariamente bloqueado/
    );
    const blockedAudit = await AuditoriaUsuario.findOne({
      where: { acao: 'LOGIN_USUARIO_BLOQUEADO' },
    });
    assert.equal(blockedAudit.ator_usuario_id, null);
    assert.equal(blockedAudit.usuario_afetado_id, adminAfterFailure.id);
  });
});
