const { getModels } = require('../database');
const {
  ADMINISTRATOR_PROFILE,
  AUTHENTICATED_BASELINE_PERMISSIONS,
  getEssentialAdminPermissions,
} = require('./permissionCatalog');

function stringifyDetails(details) {
  try {
    return JSON.stringify(details);
  } catch {
    return '{"serializationError":true}';
  }
}

function normalizePermissionKeys(permissionKeys) {
  if (!Array.isArray(permissionKeys)) {
    throw new Error('Permissoes invalidas.');
  }

  const normalizedKeys = [];
  for (const permissionKey of permissionKeys) {
    if (typeof permissionKey !== 'string' || permissionKey.trim() === '') {
      throw new Error('Chaves de permissao invalidas.');
    }
    normalizedKeys.push(permissionKey.trim());
  }

  return [...new Set(normalizedKeys)];
}

function serializeProfile(profile) {
  const permissionKeys = (profile.Permissaos || [])
    .map((permission) => permission.chave)
    .sort();

  return {
    id: profile.id,
    nome: profile.nome,
    descricao: profile.descricao,
    sistema: profile.sistema,
    ativo: profile.ativo,
    permissoes: permissionKeys,
  };
}

async function listProfiles() {
  const { Perfil, Permissao } = getModels();
  const profiles = await Perfil.findAll({
    include: [Permissao],
    order: [['nome', 'ASC']],
  });

  return profiles.map(serializeProfile);
}

async function listPermissions() {
  const { Permissao } = getModels();
  const permissions = await Permissao.findAll({
    order: [
      ['modulo', 'ASC'],
      ['acao', 'ASC'],
      ['chave', 'ASC'],
    ],
  });

  return permissions.map((permission) => ({
    id: permission.id,
    chave: permission.chave,
    modulo: permission.modulo,
    acao: permission.acao,
    descricao: permission.descricao,
  }));
}

async function updateProfilePermissions({ actorUserId, profileId, permissionKeys }) {
  const { AuditoriaUsuario, Perfil, Permissao, PerfilPermissao } = getModels();
  const profile = await Perfil.findByPk(profileId);
  if (!profile) {
    throw new Error('Perfil nao encontrado.');
  }

  const normalizedKeys = normalizePermissionKeys(permissionKeys);
  const effectiveKeys = profile.ativo
    ? [...new Set([...normalizedKeys, ...AUTHENTICATED_BASELINE_PERMISSIONS])]
    : normalizedKeys;
  const permissions = await Permissao.findAll({
    where: { chave: effectiveKeys },
  });
  const existingKeys = new Set(permissions.map((permission) => permission.chave));
  const missingKeys = effectiveKeys.filter((key) => !existingKeys.has(key));
  if (missingKeys.length > 0) {
    throw new Error(`Permissoes desconhecidas: ${missingKeys.join(', ')}`);
  }

  if (profile.nome === ADMINISTRATOR_PROFILE) {
    const nextKeys = new Set(effectiveKeys);
    const missingEssential = getEssentialAdminPermissions()
      .filter((permissionKey) => !nextKeys.has(permissionKey));

    if (missingEssential.length > 0) {
      throw new Error('Nao e possivel remover permissoes essenciais do Administrador.');
    }
  }

  const sortedPermissionKeys = [...effectiveKeys].sort();
  await Perfil.sequelize.transaction(async (transaction) => {
    await PerfilPermissao.destroy({
      where: { perfil_id: profile.id },
      transaction,
    });
    if (permissions.length > 0) {
      await PerfilPermissao.bulkCreate(permissions.map((permission) => ({
        perfil_id: profile.id,
        permissao_id: permission.id,
      })), { transaction });
    }

    await AuditoriaUsuario.create({
      ator_usuario_id: actorUserId,
      usuario_afetado_id: null,
      acao: 'PERMISSOES_PERFIL_ALTERADAS',
      detalhes: stringifyDetails({
        perfil_id: profile.id,
        perfil: profile.nome,
        permissoes: sortedPermissionKeys,
      }),
    }, { transaction });
  });

  return listProfiles();
}

module.exports = {
  listProfiles,
  listPermissions,
  updateProfilePermissions,
};
