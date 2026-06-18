const { Op } = require('sequelize');
const { getModels } = require('../database');
const { verifyPassword, hashPassword } = require('../security/passwords');
const { getUserPermissions } = require('./authorizationService');
const { recordUserAudit } = require('./auditService');

const MAX_LOGIN_FAILURES = 5;
const LOCK_MINUTES = 15;

let currentSession = null;

function sanitizeUser(user) {
  return {
    id: user.id,
    nome_usuario: user.nome_usuario,
    nome_completo: user.nome_completo,
    email: user.email,
    cargo: user.cargo,
    perfil_id: user.perfil_id,
    ativo: user.ativo,
    deve_trocar_senha: user.deve_trocar_senha,
    ultimo_login_em: user.ultimo_login_em,
  };
}

async function buildSession(user) {
  const permissions = await getUserPermissions(user.id);
  return {
    user: sanitizeUser(user),
    permissions,
    mustChangePassword: user.deve_trocar_senha === true,
  };
}

async function getActiveCurrentUser() {
  if (!currentSession) {
    return null;
  }

  const { Usuario } = getModels();
  const user = await Usuario.findByPk(currentSession.user.id);
  if (!user || user.ativo === false) {
    currentSession = null;
    return null;
  }

  return user;
}

async function login({ username, password }) {
  const { Usuario } = getModels();
  const user = await Usuario.findOne({
    where: {
      [Op.or]: [{ nome_usuario: username }, { email: username }],
    },
  });

  if (!user) {
    throw new Error('Credenciais invalidas.');
  }

  if (user.ativo === false) {
    await recordUserAudit({ targetUserId: user.id, action: 'LOGIN_USUARIO_INATIVO' });
    throw new Error('Usuario inativo.');
  }

  if (user.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) {
    await recordUserAudit({ targetUserId: user.id, action: 'LOGIN_USUARIO_BLOQUEADO' });
    throw new Error('Usuario temporariamente bloqueado.');
  }

  if (!verifyPassword(password, user.senha_hash)) {
    await Usuario.increment('falhas_login', {
      by: 1,
      where: { id: user.id },
    });
    await user.reload();

    const falhas = Number(user.falhas_login || 0);
    if (falhas >= MAX_LOGIN_FAILURES) {
      await Usuario.update(
        { bloqueado_ate: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) },
        { where: { id: user.id } },
      );
    }
    await recordUserAudit({ targetUserId: user.id, action: 'LOGIN_FALHA', details: { falhas } });
    throw new Error('Credenciais invalidas.');
  }

  await user.update({
    falhas_login: 0,
    bloqueado_ate: null,
    ultimo_login_em: new Date(),
  });
  await recordUserAudit({ actorUserId: user.id, targetUserId: user.id, action: 'LOGIN_SUCESSO' });

  currentSession = await buildSession(user);
  return currentSession;
}

function logout() {
  currentSession = null;
}

async function getCurrentSession() {
  return refreshCurrentSession();
}

async function refreshCurrentSession() {
  const user = await getActiveCurrentUser();
  if (!user) {
    return null;
  }

  currentSession = await buildSession(user);
  return currentSession;
}

async function changeOwnPassword({ currentPassword, newPassword }) {
  if (!currentSession) {
    throw new Error('Sessao expirada.');
  }

  const user = await getActiveCurrentUser();
  if (!user) {
    throw new Error('Sessao expirada.');
  }

  if (!verifyPassword(currentPassword, user.senha_hash)) {
    throw new Error('Senha atual invalida.');
  }

  await user.update({
    senha_hash: hashPassword(newPassword),
    deve_trocar_senha: false,
  });
  await recordUserAudit({
    actorUserId: user.id,
    targetUserId: user.id,
    action: 'TROCA_SENHA_PROPRIA',
  });

  return refreshCurrentSession();
}

module.exports = {
  login,
  logout,
  getCurrentSession,
  refreshCurrentSession,
  changeOwnPassword,
  sanitizeUser,
};
