const fs = require("fs");
const path = require("path");
const db = require("../database");

const SAFE_ERRORS = ["Backup não encontrado.", "Erro ao criar backup.", "Erro ao verificar integridade."];

const BACKUP_TYPES = {
  manual: "Manual",
  auto: "Automático",
  "pre-restore": "Pré-Restauração",
  "pre-reset": "Pré-Reset",
};

let autoBackupTimer = null;
let electronApp = null;

function getDbPath(app) {
  return path.join(app.getPath("userData"), "database.sqlite");
}

function getBackupDir(app, customPath) {
  if (customPath) return customPath;
  return path.join(app.getPath("userData"), "backups");
}

function ensureBackupDir(backupDir) {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

function pad(n) { return String(n).padStart(2, "0"); }

function buildBackupName(type = "manual") {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `backup-${datePart}-${type}.sqlite`;
}

function parseBackupType(filename) {
  // New format: backup-YYYY-MM-DD-HHMM-{type}.sqlite
  const m = filename.match(/^backup-\d{4}-\d{2}-\d{2}-\d{4}-([a-z-]+)\.sqlite$/);
  if (m && BACKUP_TYPES[m[1]]) return BACKUP_TYPES[m[1]];
  // Old format: backup-YYYY-MM-DD-HHMM.sqlite
  return "Manual";
}

function sidecarPath(backupFilePath) {
  return backupFilePath + ".json";
}

function readSidecar(filePath) {
  try {
    const raw = fs.readFileSync(sidecarPath(filePath), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSidecar(filePath, data) {
  try {
    fs.writeFileSync(sidecarPath(filePath), JSON.stringify(data), "utf8");
  } catch { /* non-fatal */ }
}

function pruneOldBackups(backupDir, keepCount = 10) {
  const files = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".sqlite"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  files.slice(keepCount).forEach((f) => {
    const fullPath = path.join(backupDir, f.name);
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
    try { fs.unlinkSync(sidecarPath(fullPath)); } catch { /* ignore */ }
  });
}

async function createBackup({ app: appRef, keepCount = 10, type = "manual", createdBy = "Sistema", folderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Erro ao criar backup.");

  const dbPath = getDbPath(app);
  if (!fs.existsSync(dbPath)) throw new Error("Erro ao criar backup.");

  const backupDir = getBackupDir(app, folderPath);
  ensureBackupDir(backupDir);

  const name = buildBackupName(type);
  const dest = path.join(backupDir, name);
  fs.copyFileSync(dbPath, dest);

  const stat = fs.statSync(dest);
  writeSidecar(dest, { type, createdBy, createdAt: stat.mtime.toISOString(), state: "OK" });

  pruneOldBackups(backupDir, keepCount);

  return { name, path: dest, size: stat.size, createdAt: stat.mtime };
}

async function listBackups({ app: appRef, folderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) return [];

  const backupDir = getBackupDir(app, folderPath);
  if (!fs.existsSync(backupDir)) return [];

  return fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".sqlite"))
    .map((f) => {
      const fullPath = path.join(backupDir, f);
      const stat = fs.statSync(fullPath);
      const meta = readSidecar(fullPath);
      return {
        name: f,
        size: stat.size,
        createdAt: stat.mtime,
        type: meta?.type ? (BACKUP_TYPES[meta.type] || meta.type) : parseBackupType(f),
        createdBy: meta?.createdBy || "Sistema",
        state: meta?.state || "OK",
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function restoreBackup({ name, app: appRef, createdBy = "Sistema", folderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Backup não encontrado.");

  const backupDir = getBackupDir(app, folderPath);
  const src = path.join(backupDir, name);
  if (!fs.existsSync(src)) throw new Error("Backup não encontrado.");

  const dbPath = getDbPath(app);
  // Create a pre-restore safety backup
  const safeName = buildBackupName("pre-restore");
  const safeDest = path.join(backupDir, safeName);
  fs.copyFileSync(dbPath, safeDest);
  const safeStat = fs.statSync(safeDest);
  writeSidecar(safeDest, { type: "pre-restore", createdBy, createdAt: safeStat.mtime.toISOString(), state: "OK" });

  fs.copyFileSync(src, dbPath);
  return { restored: name };
}

async function deleteBackup({ name, app: appRef, folderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Backup não encontrado.");

  const backupDir = getBackupDir(app, folderPath);
  const filePath = path.join(backupDir, name);
  if (!fs.existsSync(filePath)) throw new Error("Backup não encontrado.");

  fs.unlinkSync(filePath);
  try { fs.unlinkSync(sidecarPath(filePath)); } catch { /* ignore */ }
  return { deleted: name };
}

async function integrityCheck() {
  try {
    const seq = db.sequelize;
    const rows = await seq.query("PRAGMA integrity_check;", { type: seq.QueryTypes.SELECT });
    const results = rows.map((r) => Object.values(r)[0]);
    const ok = results.length === 1 && results[0] === "ok";
    return { ok, results };
  } catch (err) {
    throw new Error("Erro ao verificar integridade.");
  }
}

function getServiceStatus({ app: appRef, autoConfig = {}, folderPath } = {}) {
  const app = appRef || electronApp;
  const backupDir = app ? getBackupDir(app, folderPath) : null;

  let lastBackup = null;
  if (backupDir && fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".sqlite"))
      .map((f) => fs.statSync(path.join(backupDir, f)).mtime)
      .sort((a, b) => b - a);
    lastBackup = files[0] ? files[0].toISOString() : null;
  }

  let nextBackup = null;
  if (autoConfig.enabled && autoConfig.time) {
    const [h, m] = (autoConfig.time || "23:00").split(":").map(Number);
    const freq = autoConfig.frequency || "24h";
    const candidate = new Date();
    candidate.setHours(h, m, 0, 0);
    if (candidate <= new Date()) {
      if (freq === "24h") candidate.setDate(candidate.getDate() + 1);
      else if (freq === "weekly") candidate.setDate(candidate.getDate() + 7);
      else if (freq === "fortnightly") candidate.setDate(candidate.getDate() + 14);
      else if (freq === "monthly") candidate.setMonth(candidate.getMonth() + 1);
    }
    nextBackup = candidate.toISOString();
  }

  const state = lastBackup ? "Operacional" : "Sem backups";
  return { lastBackup, nextBackup, state };
}

function getBackupFolderPath(app, folderPath) {
  return getBackupDir(app || electronApp, folderPath);
}

function scheduleAutoBackup(app, intervalHours = 24, keepCount = 10, folderPath) {
  electronApp = app;
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  if (!intervalHours || intervalHours <= 0) return;

  const ms = intervalHours * 60 * 60 * 1000;
  autoBackupTimer = setInterval(() => {
    createBackup({ app, keepCount, type: "auto", createdBy: "Sistema", folderPath })
      .catch((e) => console.error("Auto-backup error:", e));
  }, ms);

  setTimeout(() => {
    createBackup({ app, keepCount, type: "auto", createdBy: "Sistema", folderPath })
      .catch((e) => console.error("Startup backup error:", e));
  }, 30_000);
}

async function initializeBackupScheduler(app, config = {}) {
  electronApp = app;
  const enabled = config.autoEnabled !== false;
  const keepCount = Number(config.keepCount ?? config.retentionCount ?? 10);
  const folderPath = config.folderPath || undefined;

  if (!enabled) return;

  const freqToHours = { "24h": 24, weekly: 168, fortnightly: 336, monthly: 720 };
  const intervalHours = freqToHours[config.autoFrequency] ?? 24;
  scheduleAutoBackup(app, intervalHours, keepCount, folderPath);
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  integrityCheck,
  getServiceStatus,
  getBackupFolderPath,
  initializeBackupScheduler,
  SAFE_ERRORS,
};
