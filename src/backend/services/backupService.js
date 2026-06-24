const fs = require("fs");
const path = require("path");

const SAFE_ERRORS = ["Backup não encontrado.", "Erro ao criar backup."];

let autoBackupTimer = null;
let electronApp = null;

function getDbPath(app) {
  return path.join(app.getPath("userData"), "database.sqlite");
}

function getBackupDir(app) {
  return path.join(app.getPath("userData"), "backups");
}

function ensureBackupDir(backupDir) {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

function pad(n) { return String(n).padStart(2, "0"); }

function buildBackupName() {
  const now = new Date();
  return `backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.sqlite`;
}

function pruneOldBackups(backupDir, keepCount = 10) {
  const files = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".sqlite"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);

  files.slice(keepCount).forEach((f) => {
    try { fs.unlinkSync(path.join(backupDir, f.name)); } catch { /* ignore */ }
  });
}

async function createBackup({ app: appRef, keepCount = 10 } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Erro ao criar backup.");

  const dbPath = getDbPath(app);
  if (!fs.existsSync(dbPath)) throw new Error("Erro ao criar backup.");

  const backupDir = getBackupDir(app);
  ensureBackupDir(backupDir);

  const name = buildBackupName();
  const dest = path.join(backupDir, name);
  fs.copyFileSync(dbPath, dest);
  pruneOldBackups(backupDir, keepCount);

  const stat = fs.statSync(dest);
  return { name, path: dest, size: stat.size, createdAt: stat.mtime };
}

async function listBackups({ app: appRef } = {}) {
  const app = appRef || electronApp;
  if (!app) return [];

  const backupDir = getBackupDir(app);
  if (!fs.existsSync(backupDir)) return [];

  return fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".sqlite"))
    .map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function restoreBackup({ name, app: appRef } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Backup não encontrado.");

  const backupDir = getBackupDir(app);
  const src = path.join(backupDir, name);
  if (!fs.existsSync(src)) throw new Error("Backup não encontrado.");

  const dbPath = getDbPath(app);
  // Save current state before overwriting
  const safeName = `pre-restore-${buildBackupName()}`;
  fs.copyFileSync(dbPath, path.join(backupDir, safeName));
  fs.copyFileSync(src, dbPath);
  return { restored: name };
}

function scheduleAutoBackup(app, intervalHours = 24, keepCount = 10) {
  electronApp = app;
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  if (!intervalHours || intervalHours <= 0) return;

  const ms = intervalHours * 60 * 60 * 1000;
  autoBackupTimer = setInterval(() => {
    createBackup({ app, keepCount }).catch((e) => console.error("Auto-backup error:", e));
  }, ms);

  // Also run once after 30s so we have a fresh backup on startup
  setTimeout(() => {
    createBackup({ app, keepCount }).catch((e) => console.error("Startup backup error:", e));
  }, 30_000);
}

async function initializeBackupScheduler(app, config = {}) {
  electronApp = app;
  const intervalHours = Number(config.intervalHours ?? 24);
  const keepCount = Number(config.keepCount ?? 10);
  scheduleAutoBackup(app, intervalHours, keepCount);
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  initializeBackupScheduler,
  SAFE_ERRORS,
};
