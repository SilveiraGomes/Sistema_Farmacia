const { getModels } = require("../database");

let reportMutationQueue = Promise.resolve();

function serializeReportMutation(run) {
  const next = reportMutationQueue.then(run, run);
  reportMutationQueue = next.catch(() => {});
  return next;
}

async function enqueueReport(reportId, reportData, reportType) {
  return serializeReportMutation(async () => {
    const { ReportSyncQueue } = getModels();
    const queued = await ReportSyncQueue.create({
      reportId,
      reportData,
      reportType,
      status: "pending",
      attempts: 0,
      generatedAt: new Date(),
    });
    return queued.toJSON();
  });
}

async function getPendingReports(reportType = null) {
  const { ReportSyncQueue } = getModels();
  const where = { status: "pending" };
  if (reportType) {
    where.reportType = reportType;
  }

  return ReportSyncQueue.findAll({
    where,
    order: [["createdAt", "ASC"]],
  });
}

async function getQueueStatus() {
  const { ReportSyncQueue } = getModels();
  const [pending, synced, failed] = await Promise.all([
    ReportSyncQueue.count({ where: { status: "pending" } }),
    ReportSyncQueue.count({ where: { status: "synced" } }),
    ReportSyncQueue.count({ where: { status: "failed" } }),
  ]);

  return { pending, synced, failed };
}

async function getSyncHistory(limit = 50, offset = 0) {
  const { ReportSyncQueue } = getModels();
  const { count, rows } = await ReportSyncQueue.findAndCountAll({
    where: { status: "synced" },
    order: [["syncedAt", "DESC"]],
    limit,
    offset,
  });

  return {
    total: count,
    records: rows.map((row) => row.toJSON()),
  };
}

async function markSyncedReport(queueId, googleSheetRowId) {
  return serializeReportMutation(async () => {
    const { ReportSyncQueue } = getModels();
    const report = await ReportSyncQueue.findByPk(queueId);
    if (!report) {
      throw new Error(`Relatorio com ID ${queueId} nao encontrado na fila.`);
    }

    await report.update({
      status: "synced",
      syncedAt: new Date(),
      googleSheetRowId,
    });

    return report.toJSON();
  });
}

async function markFailedReport(queueId, errorMessage) {
  return serializeReportMutation(async () => {
    const { ReportSyncQueue } = getModels();
    const report = await ReportSyncQueue.findByPk(queueId);
    if (!report) {
      throw new Error(`Relatorio com ID ${queueId} nao encontrado na fila.`);
    }

    const newAttempts = (report.attempts || 0) + 1;
    await report.update({
      status: newAttempts >= 3 ? "failed" : "pending",
      attempts: newAttempts,
      errorMessage,
    });

    return report.toJSON();
  });
}

async function cleanupOldReports(retentionDays = 90) {
  return serializeReportMutation(async () => {
    const { ReportSyncQueue } = getModels();
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const result = await ReportSyncQueue.update(
      { deletedAt: new Date() },
      {
        where: {
          status: "synced",
          syncedAt: { [require("sequelize").Op.lt]: cutoffDate },
        },
      },
    );

    return { deletedCount: result[0] || 0 };
  });
}

async function getLastReportOfType(reportType) {
  const { ReportSyncQueue } = getModels();
  const report = await ReportSyncQueue.findOne({
    where: {
      reportType,
      status: "synced",
      deletedAt: null,
    },
    order: [["syncedAt", "DESC"]],
  });

  return report ? report.toJSON() : null;
}

module.exports = {
  enqueueReport,
  getPendingReports,
  getQueueStatus,
  getSyncHistory,
  markSyncedReport,
  markFailedReport,
  cleanupOldReports,
  getLastReportOfType,
};
