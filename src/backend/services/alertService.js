const { Op } = require('sequelize');
const db = require('../database');
const healthService = require('./healthService');

const TABLE_LABELS = {
  Produtos: 'Produtos', Categoria: 'Categorias', Subcategoria: 'Subcategorias', Estoques: 'Lotes de stock',
  Vendas: 'Vendas', ItemVendas: 'Itens de venda', Clientes: 'Clientes', Fornecedors: 'Fornecedores',
  TransacaoFinanceiras: 'Transacções financeiras', OrdensCompra: 'Encomendas', ItensOrdemCompra: 'Itens de encomenda',
  Usuarios: 'Utilizadores', TurnoOperacionals: 'Turnos', DiaOperacionals: 'Dias operacionais',
};
const label = (table) => TABLE_LABELS[table] || table;

const DEFAULT_SYSTEM_ALERTS = { backupFail: true, dbCorrupt: true, integrity: true, diskSpace: true };

async function readSystemAlertConfig(models) {
  try {
    const row = await models.ConfiguracaoSistema.findOne({ where: { chave: 'alerts.systemAlerts' } });
    return { ...DEFAULT_SYSTEM_ALERTS, ...(row ? JSON.parse(row.valor_json) : {}) };
  } catch {
    return { ...DEFAULT_SYSTEM_ALERTS };
  }
}

// Alertas de integridade da base, backups e disco (ver healthService/backupService).
function buildSystemAlerts(config, { integrity, disk, backup } = {}) {
  const alerts = [];
  const settingsAction = { actionView: 'configuracoes', actionLabel: 'Ver backups' };

  if (config.dbCorrupt !== false && integrity && !integrity.ok) {
    alerts.push({
      id: 'db-integrity', severity: 'danger', type: 'system',
      title: 'Base de dados com erros de integridade',
      message: 'A verificação da base de dados detectou erros. Faça um backup e contacte o suporte KIL SYSTEM.',
      ...settingsAction,
    });
  }
  if (config.integrity !== false && integrity?.orphans?.length) {
    const total = integrity.orphans.reduce((sum, o) => sum + o.count, 0);
    const detail = integrity.orphans.slice(0, 3).map((o) => `${o.count} em ${label(o.table)} sem ${label(o.parent)}`).join('; ');
    alerts.push({
      id: 'db-orphans', severity: 'danger', type: 'system',
      title: 'Dados em falta na base de dados',
      message: `${total} registo(s) apontam para dados inexistentes (${detail}). Contacte o suporte KIL SYSTEM.`,
      ...settingsAction,
    });
  }
  if (config.backupFail !== false && backup) {
    if (backup.lastAutoError) {
      alerts.push({
        id: 'backup-auto-failed', severity: 'danger', type: 'system',
        title: 'O backup automático falhou',
        message: `${backup.lastAutoError.message} Verifique a pasta de backups.`,
        ...settingsAction,
      });
    }
    const latest = backup.latest;
    if (latest?.state === 'ERRO') {
      alerts.push({
        id: 'backup-verify-failed', severity: 'danger', type: 'system',
        title: 'O último backup não passou na verificação',
        message: `O ficheiro ${latest.name} está danificado. Crie um novo backup.`,
        ...settingsAction,
      });
    }
    if (latest?.warnings?.length) {
      const detail = latest.warnings.map((w) => `${label(w.table)}: ${w.before} → ${w.after}`).join('; ');
      alerts.push({
        id: 'backup-data-drop', severity: 'danger', type: 'system',
        title: 'O último backup tem muito menos dados que o anterior',
        message: `${detail}. Se não apagou estes dados, não faça novos backups por cima e contacte o suporte.`,
        ...settingsAction,
      });
    }
    if (latest?.mirror && latest.mirror.ok === false) {
      alerts.push({
        id: 'backup-mirror-failed', severity: 'warning', type: 'system',
        title: 'Cópia adicional do backup não foi feita',
        message: `${latest.mirror.error} Ligue a pen/disco ou altere a pasta da cópia adicional.`,
        ...settingsAction,
      });
    }
    if (backup.overdue) {
      alerts.push({
        id: 'backup-overdue', severity: 'warning', type: 'system',
        title: 'Sem backups recentes',
        message: latest ? `O último backup é de ${new Date(latest.at).toLocaleDateString('pt-AO')}.` : 'Ainda não existe nenhum backup.',
        ...settingsAction,
      });
    }
  }
  if (config.diskSpace !== false && disk?.low) {
    alerts.push({
      id: 'disk-space', severity: 'warning', type: 'system',
      title: 'Pouco espaço em disco',
      message: `Restam ${Math.round(disk.freeBytes / 1024 / 1024)} MB livres. Liberte espaço para garantir os backups.`,
    });
  }
  return alerts;
}

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

    const backupService = require('./backupService');
    const config = await readSystemAlertConfig(models);
    alerts.push(...buildSystemAlerts(config, {
      ...healthService.getHealthState(),
      backup: backupService.getBackupHealth(),
    }));
  } catch {
    // Non-critical — never block the app
  }

  return alerts;
}

module.exports = { getSystemAlerts, buildSystemAlerts };
