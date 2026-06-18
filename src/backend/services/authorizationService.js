const { getModels } = require('../database');

async function getUserPermissions(userId) {
  const { Usuario, Perfil, Permissao } = getModels();
  const user = await Usuario.findByPk(userId, {
    include: [
      {
        model: Perfil,
        include: [Permissao],
      },
    ],
  });

  if (!user || !user.Perfil || user.ativo === false || user.Perfil.ativo === false) {
    return [];
  }

  return user.Perfil.Permissaos.map((permission) => permission.chave).sort();
}

async function hasPermission(userId, permissionKey) {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permissionKey);
}

async function assertPermission(userId, permissionKey) {
  const allowed = await hasPermission(userId, permissionKey);
  if (!allowed) {
    const error = new Error('Permissao insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }
}

module.exports = {
  getUserPermissions,
  hasPermission,
  assertPermission,
};
