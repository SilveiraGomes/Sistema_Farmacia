const { getModels } = require('../database');

function stringifyDetails(details) {
  try {
    return JSON.stringify(details);
  } catch {
    return '{"serializationError":true}';
  }
}

async function recordUserAudit({ actorUserId = null, targetUserId = null, action, details = {} }) {
  const { AuditoriaUsuario } = getModels();
  return AuditoriaUsuario.create({
    ator_usuario_id: actorUserId,
    usuario_afetado_id: targetUserId,
    acao: action,
    detalhes: stringifyDetails(details),
  });
}

module.exports = {
  recordUserAudit,
};
