const { Op } = require('sequelize');
const db = require('../database');

async function getSystemAlerts(alertConfig = {}) {
  const alerts = [];
  const now = new Date();

  try {
    const models = db.getModels();

    // Turno aberto há mais de 12 horas
    if (alertConfig.longShift !== false && models.TurnoOperacional) {
      const cutoff = new Date(now - 12 * 60 * 60 * 1000);
      const open = await models.TurnoOperacional.findOne({
        where: { fechado_em: null, aberto_em: { [Op.lt]: cutoff } },
        attributes: ['aberto_em'],
      });
      if (open) {
        const hours = Math.floor((now - new Date(open.get('aberto_em'))) / (60 * 60 * 1000));
        alerts.push({
          id: 'long-shift',
          severity: 'warning',
          type: 'operation',
          title: 'Turno aberto há muito tempo',
          message: `O turno está aberto há ${hours} horas. Considere encerrar o turno.`,
          actionView: 'operacao',
          actionLabel: 'Ver operação',
        });
      }
    }

    // Dia operacional aberto há mais de 24 horas
    if (alertConfig.longDay !== false && models.DiaOperacional) {
      const cutoff = new Date(now - 24 * 60 * 60 * 1000);
      const open = await models.DiaOperacional.findOne({
        where: { fechado_em: null, aberto_em: { [Op.lt]: cutoff } },
        attributes: ['aberto_em'],
      });
      if (open) {
        const hours = Math.floor((now - new Date(open.get('aberto_em'))) / (60 * 60 * 1000));
        alerts.push({
          id: 'long-day',
          severity: 'danger',
          type: 'operation',
          title: 'Dia operacional aberto há mais de 24h',
          message: `O dia operacional está aberto há ${hours} horas. Encerre imediatamente.`,
          actionView: 'operacao',
          actionLabel: 'Ver operação',
        });
      }
    }
  } catch {
    // Non-critical — never block the app
  }

  return alerts;
}

module.exports = { getSystemAlerts };
