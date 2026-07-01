const { Op } = require('sequelize');
const { getModels } = require('../database');
const { createTemporaryPassword, hashPassword, hashPin, assertPin } = require('../security/passwords');
const { sanitizeUser } = require('./authService');
const { recordUserAudit } = require('./auditService');
const { ADMINISTRATOR_PROFILE } = require('./permissionCatalog');

const USER_FIELDS = [
  'nome_usuario',
  'nome_completo',
  'email',
  'cargo',
  'perfil_id',
];

function pickUserFields(data) {
  assertUserDataObject(data);

  return USER_FIELDS.reduce((fields, field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      fields[field] = data[field];
    }
    return fields;
  }, {});
}

function hasField(data, field) {
  return Object.prototype.hasOwnProperty.call(data, field);
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function assertUserDataObject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Dados do usuario sao obrigatorios.');
  }
}

function assertCreateUserFields(data) {
  if (isBlank(data.nome_usuario)) {
    throw new Error('nome_usuario e obrigatorio.');
  }

  if (isBlank(data.nome_completo)) {
    throw new Error('nome_completo e obrigatorio.');
  }
}

function assertUpdateUserFields(userFields) {
  if (Object.keys(userFields).length === 0) {
    throw new Error('Informe ao menos um campo para atualizar.');
  }

  if (hasField(userFields, 'nome_usuario') && isBlank(userFields.nome_usuario)) {
    throw new Error('nome_usuario e obrigatorio.');
  }

  if (hasField(userFields, 'nome_completo') && isBlank(userFields.nome_completo)) {
    throw new Error('nome_completo e obrigatorio.');
  }
}

function sanitizeUserWithProfile(user) {
  const safeUser = sanitizeUser(user);
  safeUser.perfil = user.Perfil ? {
    id: user.Perfil.id,
    nome: user.Perfil.nome,
  } : null;
  return safeUser;
}

async function assertProfileExists(profileId) {
  if (profileId === undefined || profileId === null) {
    return null;
  }

  const { Perfil } = getModels();
  const profile = await Perfil.findByPk(profileId);
  if (!profile) {
    throw new Error('Perfil nao encontrado.');
  }

  return profile;
}

async function assertUniqueUserFields(userFields, currentUserId = null) {
  const { Usuario } = getModels();
  const idFilter = currentUserId ? { id: { [Op.ne]: currentUserId } } : {};

  if (hasField(userFields, 'nome_usuario')) {
    const existingUsername = await Usuario.findOne({
      where: {
        ...idFilter,
        nome_usuario: userFields.nome_usuario,
      },
    });

    if (existingUsername) {
      throw new Error('Nome de usuario ja cadastrado.');
    }
  }

  if (hasField(userFields, 'email') && userFields.email) {
    const existingEmail = await Usuario.findOne({
      where: {
        ...idFilter,
        email: userFields.email,
      },
    });

    if (existingEmail) {
      throw new Error('Email ja cadastrado.');
    }
  }
}

async function findUserWithProfile(userId) {
  const { Perfil, Usuario } = getModels();
  return Usuario.findByPk(userId, { include: [Perfil] });
}

async function listUsers() {
  const { Perfil, Usuario } = getModels();
  const users = await Usuario.findAll({
    include: [Perfil],
    order: [['nome_completo', 'ASC']],
  });

  return users.map(sanitizeUserWithProfile);
}

async function listLoginUsers() {
  const { Usuario } = getModels();
  const users = await Usuario.findAll({
    attributes: ['id', 'nome_usuario', 'nome_completo'],
    where: { ativo: true },
    order: [['nome_completo', 'ASC']],
  });

  return users.map((user) => ({
    id: user.id,
    nome_usuario: user.nome_usuario,
    nome_completo: user.nome_completo,
  }));
}

async function createUser({ actorUserId, data }) {
  const { Perfil, Usuario } = getModels();
  const userFields = pickUserFields(data);
  assertCreateUserFields(userFields);
  await assertProfileExists(userFields.perfil_id);
  await assertUniqueUserFields(userFields);

  const temporaryPassword = createTemporaryPassword();
  const user = await Usuario.create({
    ...userFields,
    senha_hash: hashPassword(temporaryPassword),
    ativo: true,
    deve_trocar_senha: true,
  });

  await recordUserAudit({
    actorUserId,
    targetUserId: user.id,
    action: 'USUARIO_CRIADO',
    details: { nome_usuario: user.nome_usuario },
  });

  await user.reload({ include: [Perfil] });
  return {
    user: sanitizeUserWithProfile(user),
    temporaryPassword,
  };
}

async function updateUser({ actorUserId, userId, data }) {
  const user = await findUserWithProfile(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  const userFields = pickUserFields(data);
  assertUpdateUserFields(userFields);
  const nextProfile = await assertProfileExists(userFields.perfil_id);
  await assertUniqueUserFields(userFields, user.id);
  await assertAdministratorProfileReassignmentAllowed(user, userFields, nextProfile);
  await user.update(userFields);

  await recordUserAudit({
    actorUserId,
    targetUserId: user.id,
    action: 'USUARIO_EDITADO',
    details: { campos: Object.keys(userFields) },
  });

  const updated = await findUserWithProfile(user.id);
  return sanitizeUserWithProfile(updated);
}

async function isLastActiveAdministrator(user) {
  if (user.ativo === false || !user.Perfil || user.Perfil.nome !== ADMINISTRATOR_PROFILE) {
    return false;
  }

  const { Perfil, Usuario } = getModels();
  const activeAdministrators = await Usuario.count({
    where: { ativo: true },
    include: [{
      model: Perfil,
      where: { nome: ADMINISTRATOR_PROFILE },
      required: true,
    }],
  });

  return activeAdministrators <= 1;
}

async function assertAdministratorProfileReassignmentAllowed(user, userFields, nextProfile) {
  if (!hasField(userFields, 'perfil_id') || !(await isLastActiveAdministrator(user))) {
    return;
  }

  const keepsAdministratorProfile = nextProfile && nextProfile.nome === ADMINISTRATOR_PROFILE;
  if (!keepsAdministratorProfile) {
    throw new Error('Nao e possivel remover o perfil do ultimo administrador ativo.');
  }
}

async function deactivateUser({ actorUserId, userId }) {
  const user = await findUserWithProfile(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  if (await isLastActiveAdministrator(user)) {
    throw new Error('Nao e possivel inativar o ultimo administrador ativo.');
  }

  await user.update({ ativo: false });
  await recordUserAudit({
    actorUserId,
    targetUserId: user.id,
    action: 'USUARIO_INATIVADO',
  });

  const updated = await findUserWithProfile(user.id);
  return sanitizeUserWithProfile(updated);
}

async function activateUser({ actorUserId, userId }) {
  const user = await findUserWithProfile(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  await user.update({
    ativo: true,
    falhas_login: 0,
    bloqueado_ate: null,
  });
  await recordUserAudit({
    actorUserId,
    targetUserId: user.id,
    action: 'USUARIO_ATIVADO',
  });

  const updated = await findUserWithProfile(user.id);
  return sanitizeUserWithProfile(updated);
}

async function resetUserPassword({ actorUserId, userId }) {
  const user = await findUserWithProfile(userId);
  if (!user) {
    throw new Error('Usuario nao encontrado.');
  }

  const temporaryPassword = createTemporaryPassword();
  await user.update({
    senha_hash: hashPassword(temporaryPassword),
    deve_trocar_senha: true,
    falhas_login: 0,
    bloqueado_ate: null,
  });
  await recordUserAudit({
    actorUserId,
    targetUserId: user.id,
    action: 'SENHA_REDEFINIDA',
  });

  const updated = await findUserWithProfile(user.id);
  return {
    user: sanitizeUserWithProfile(updated),
    temporaryPassword,
  };
}

async function listUsersWithPin() {
  const { Usuario } = getModels();
  const users = await Usuario.findAll({
    attributes: ['id', 'nome_usuario', 'nome_completo'],
    where: { ativo: true, pin_hash: { [Op.ne]: null } },
    order: [['nome_completo', 'ASC']],
  });
  return users.map((u) => ({
    id: u.id,
    nome_usuario: u.nome_usuario,
    nome_completo: u.nome_completo,
  }));
}

async function setUserPin({ actorUserId, targetUserId, pin }) {
  assertPin(pin);
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(targetUserId);
  if (!user) throw new Error('Utilizador nao encontrado.');

  await user.update({ pin_hash: hashPin(pin) });
  await recordUserAudit({ actorUserId, targetUserId: user.id, action: 'PIN_DEFINIDO' });
  return { ok: true };
}

async function clearUserPin({ actorUserId, targetUserId }) {
  const { Usuario } = getModels();
  const user = await Usuario.findByPk(targetUserId);
  if (!user) throw new Error('Utilizador nao encontrado.');

  await user.update({ pin_hash: null });
  await recordUserAudit({ actorUserId, targetUserId: user.id, action: 'PIN_REMOVIDO' });
  return { ok: true };
}

module.exports = {
  listLoginUsers,
  listUsersWithPin,
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  resetUserPassword,
  setUserPin,
  clearUserPin,
};
