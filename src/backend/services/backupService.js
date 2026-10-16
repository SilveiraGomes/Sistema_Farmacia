const fs = require("fs");
const path = require("path");
const db = require("../database");

const SAFE_ERRORS = [
  "Backup não encontrado.",
  "Erro ao criar backup.",
  "Erro ao verificar integridade.",
  "Ficheiro de backup inválido ou corrompido.",
  "Erro ao preparar a restauração do backup.",
];

const BACKUP_TYPES = {
  manual: "Manual",
  auto: "Automático",
  "pre-restore": "Pré-Restauração",
  "pre-reset": "Pré-Reset",
};

// Apenas os backups automáticos entram na rotação. Backups manuais e cópias de
// segurança (pré-restauração / pré-reset) nunca são apagados automaticamente.
const ROTATED_TYPES = new Set(["auto"]);

const PENDING_RESTORE_DB = "restore-pending.sqlite";
const PENDING_RESTORE_META = "restore-pending.json";
const RESTORE_ROLLBACK_DB = "restore-rollback.sqlite";
const SQLITE_SIDE_FILES = ["-journal", "-wal", "-shm"];

let autoBackupTimer = null;
let startupBackupTimer = null;
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
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `backup-${datePart}-${type}.sqlite`;
}

function parseBackupTypeKey(filename) {
  // backup-YYYY-MM-DD-HHMM[SS]-{type}.sqlite
  const m = filename.match(/^backup-\d{4}-\d{2}-\d{2}-\d{4}(?:\d{2})?-([a-z-]+)\.sqlite$/);
  if (m && BACKUP_TYPES[m[1]]) return m[1];
  // Formato antigo: backup-YYYY-MM-DD-HHMM.sqlite
  return "manual";
}

function parseBackupType(filename) {
  return BACKUP_TYPES[parseBackupTypeKey(filename)];
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

function getBackupTypeKey(fullPath) {
  const meta = readSidecar(fullPath);
  if (meta?.type && BACKUP_TYPES[meta.type]) return meta.type;
  return parseBackupTypeKey(path.basename(fullPath));
}

function listBackupFiles(backupDir) {
  return fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".sqlite"))
    .map((f) => {
      const fullPath = path.join(backupDir, f);
      return { name: f, fullPath, mtime: fs.statSync(fullPath).mtime, typeKey: getBackupTypeKey(fullPath) };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function pruneOldBackups(backupDir, keepCount = 10) {
  const keep = Math.max(1, Number(keepCount) || 10);
  listBackupFiles(backupDir)
    .filter((f) => ROTATED_TYPES.has(f.typeKey))
    .slice(keep)
    .forEach((f) => {
      try { fs.unlinkSync(f.fullPath); } catch { /* ignore */ }
      try { fs.unlinkSync(sidecarPath(f.fullPath)); } catch { /* ignore */ }
    });
}

function removeFileIfExists(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
}

function removeSqliteSideFiles(dbFilePath) {
  SQLITE_SIDE_FILES.forEach((suffix) => removeFileIfExists(dbFilePath + suffix));
}

// Copia a base aberta de forma consistente (VACUUM INTO respeita transacções em
// curso). Se a ligação não estiver disponível, recorre a uma cópia simples.
async function snapshotDatabase(dbPath, dest) {
  removeFileIfExists(dest);
  const seq = db.sequelize;
  if (seq) {
    try {
      await seq.query("VACUUM INTO :dest", { replacements: { dest } });
      return;
    } catch (error) {
      console.error("VACUUM INTO falhou, a usar cópia directa:", error?.message);
      removeFileIfExists(dest);
    }
  }
  fs.copyFileSync(dbPath, dest);
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
  try {
    await snapshotDatabase(dbPath, dest);
  } catch (error) {
    console.error("Erro ao criar backup:", error);
    throw new Error("Erro ao criar backup.");
  }

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

// ── Leitura directa de ficheiros SQLite (fora da ligação principal) ───────────

function openSqliteReadOnly(filePath) {
  const sqlite3 = require("sqlite3");
  return new Promise((resolve, reject) => {
    const handle = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (error) => {
      if (error) reject(error);
      else resolve(handle);
    });
  });
}

function sqliteAll(handle, sql) {
  return new Promise((resolve, reject) => {
    handle.all(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function sqliteClose(handle) {
  return new Promise((resolve) => handle.close(() => resolve()));
}

async function validateBackupFile(filePath) {
  let handle = null;
  try {
    handle = await openSqliteReadOnly(filePath);
    const check = await sqliteAll(handle, "PRAGMA quick_check");
    const ok = check.length === 1 && Object.values(check[0])[0] === "ok";
    const tables = await sqliteAll(handle, "SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = new Set(tables.map((t) => t.name));
    if (!ok || !names.has("Usuarios") || !names.has("Perfis")) {
      throw new Error("invalid");
    }
  } catch {
    throw new Error("Ficheiro de backup inválido ou corrompido.");
  } finally {
    if (handle) await sqliteClose(handle);
  }
}

async function readAccountsSnapshot(filePath) {
  const handle = await openSqliteReadOnly(filePath);
  try {
    const tables = new Set(
      (await sqliteAll(handle, "SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name),
    );
    const read = async (table) => (tables.has(table) ? sqliteAll(handle, `SELECT * FROM "${table}"`) : []);
    return {
      usuarios: await read("Usuarios"),
      perfis: await read("Perfis"),
      permissoes: await read("Permissaos"),
      perfilPermissoes: await read("PerfilPermissaos"),
    };
  } finally {
    await sqliteClose(handle);
  }
}

// ── Restauração em duas fases ─────────────────────────────────────────────────
// 1) prepareRestore (com o sistema em execução): valida o ficheiro, cria uma
//    cópia de segurança da base actual e deixa o backup em espera.
// 2) applyPendingRestore + finalizePendingRestore (no arranque seguinte, antes de
//    abrir a base): troca o ficheiro com a base fechada, migra o esquema e
//    repõe as contas de utilizador actuais (logins, senhas, PINs e perfis).

function getPendingPaths(app) {
  const userData = app.getPath("userData");
  return {
    pendingDb: path.join(userData, PENDING_RESTORE_DB),
    pendingMeta: path.join(userData, PENDING_RESTORE_META),
    rollbackDb: path.join(userData, RESTORE_ROLLBACK_DB),
  };
}

function resolveRestoreSource(app, { name, filePath, folderPath }) {
  if (name) {
    const backupDir = getBackupDir(app, folderPath);
    return path.join(backupDir, path.basename(String(name)));
  }
  if (filePath) return String(filePath);
  return null;
}

async function restoreBackup({ name, filePath, app: appRef, createdBy = "Sistema", folderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Backup não encontrado.");

  const src = resolveRestoreSource(app, { name, filePath, folderPath });
  if (!src || !fs.existsSync(src)) throw new Error("Backup não encontrado.");

  await validateBackupFile(src);

  const safety = await createBackup({ app, type: "pre-restore", createdBy, folderPath });

  const { pendingDb, pendingMeta } = getPendingPaths(app);
  try {
    const tmp = `${pendingDb}.tmp`;
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, pendingDb);
    fs.writeFileSync(pendingMeta, JSON.stringify({
      source: src,
      sourceName: path.basename(src),
      safetyBackup: safety.path,
      requestedBy: createdBy,
      requestedAt: new Date().toISOString(),
    }), "utf8");
  } catch (error) {
    console.error("Erro ao preparar restauração:", error);
    removeFileIfExists(pendingDb);
    removeFileIfExists(pendingMeta);
    throw new Error("Erro ao preparar a restauração do backup.");
  }

  return { restored: path.basename(src), safetyBackup: safety.name, restartRequired: true };
}

function hasPendingRestore(app) {
  const { pendingDb, pendingMeta } = getPendingPaths(app);
  return fs.existsSync(pendingDb) && fs.existsSync(pendingMeta);
}

// Deve ser chamado ANTES de abrir a base de dados.
function applyPendingRestore(app) {
  const { pendingDb, pendingMeta, rollbackDb } = getPendingPaths(app);
  if (!fs.existsSync(pendingDb) || !fs.existsSync(pendingMeta)) {
    removeFileIfExists(pendingDb);
    removeFileIfExists(pendingMeta);
    return null;
  }

  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(pendingMeta, "utf8")); } catch { /* usar vazio */ }

  const dbPath = getDbPath(app);
  // Com a base fechada, a cópia é consistente; serve para reverter e para
  // recuperar as contas actuais.
  removeFileIfExists(rollbackDb);
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, rollbackDb);

  const state = { meta, rollbackPath: fs.existsSync(rollbackDb) ? rollbackDb : null };
  try {
    // Um journal pendente da base antiga corromperia a base restaurada.
    removeSqliteSideFiles(dbPath);
    fs.copyFileSync(pendingDb, dbPath);
    removeFileIfExists(pendingDb);
  } catch (error) {
    rollbackPendingRestore(app, state);
    throw error;
  }

  return state;
}

function toBoolean(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(" ", "T").replace(" ", ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function mergeAccounts(snapshot, transaction) {
  const { Perfil, Permissao, PerfilPermissao, Usuario } = db.getModels();
  const opts = { transaction };

  const currentPermissionKeyById = new Map(snapshot.permissoes.map((p) => [p.id, p.chave]));
  const permissionIdByKey = new Map(
    (await Permissao.findAll(opts)).map((p) => [p.chave, p.id]),
  );

  const profileIdMap = new Map();
  for (const oldProfile of snapshot.perfis) {
    let perfil = await Perfil.findOne({ where: { nome: oldProfile.nome }, ...opts });
    const fields = {
      descricao: oldProfile.descricao ?? null,
      sistema: toBoolean(oldProfile.sistema, false),
      ativo: toBoolean(oldProfile.ativo, true),
    };
    if (perfil) {
      await perfil.update(fields, opts);
    } else {
      perfil = await Perfil.create({ nome: oldProfile.nome, ...fields }, opts);
    }
    profileIdMap.set(oldProfile.id, perfil.id);

    const permissionIds = snapshot.perfilPermissoes
      .filter((link) => link.perfil_id === oldProfile.id)
      .map((link) => permissionIdByKey.get(currentPermissionKeyById.get(link.permissao_id)))
      .filter(Boolean);
    if (permissionIds.length) {
      await PerfilPermissao.destroy({ where: { perfil_id: perfil.id }, ...opts });
      await PerfilPermissao.bulkCreate(
        [...new Set(permissionIds)].map((permissao_id) => ({ perfil_id: perfil.id, permissao_id })),
        { ignoreDuplicates: true, ...opts },
      );
    }
  }

  let preserved = 0;
  for (const oldUser of snapshot.usuarios) {
    if (!oldUser.nome_usuario || !oldUser.senha_hash) continue;
    const fields = {
      senha_hash: oldUser.senha_hash,
      pin_hash: oldUser.pin_hash ?? null,
      nome_completo: oldUser.nome_completo || oldUser.nome_usuario,
      cargo: oldUser.cargo ?? null,
      ativo: toBoolean(oldUser.ativo, true),
      perfil_id: profileIdMap.get(oldUser.perfil_id) ?? null,
      deve_trocar_senha: toBoolean(oldUser.deve_trocar_senha, false),
      ultimo_login_em: toDateOrNull(oldUser.ultimo_login_em),
      falhas_login: 0,
      bloqueado_ate: null,
    };

    const existing = await Usuario.findOne({ where: { nome_usuario: oldUser.nome_usuario }, ...opts });
    let email = oldUser.email || null;
    if (email) {
      const owner = await Usuario.findOne({ where: { email }, ...opts });
      if (owner && (!existing || owner.id !== existing.id)) email = existing ? existing.email : null;
    }

    if (existing) {
      await existing.update({ ...fields, email }, opts);
    } else {
      await Usuario.create({ nome_usuario: oldUser.nome_usuario, ...fields, email }, opts);
    }
    preserved += 1;
  }

  return { preservedUsers: preserved, preservedProfiles: profileIdMap.size };
}

// Deve ser chamado DEPOIS de abrir e sincronizar a base restaurada.
async function finalizePendingRestore(app, state) {
  const { pendingMeta, rollbackDb } = getPendingPaths(app);
  let result = { preservedUsers: 0, preservedProfiles: 0 };

  if (state?.rollbackPath && fs.existsSync(state.rollbackPath)) {
    const snapshot = await readAccountsSnapshot(state.rollbackPath);
    result = await db.sequelize.transaction((transaction) => mergeAccounts(snapshot, transaction));
  }

  try {
    const { recordUserAudit } = require("./auditService");
    await recordUserAudit({
      action: "BACKUP_RESTAURADO",
      details: {
        backup: state?.meta?.sourceName || null,
        solicitado_por: state?.meta?.requestedBy || null,
        backup_seguranca: state?.meta?.safetyBackup ? path.basename(state.meta.safetyBackup) : null,
        ...result,
      },
    });
  } catch (error) {
    console.error("Não foi possível registar a auditoria da restauração:", error?.message);
  }

  removeFileIfExists(pendingMeta);
  removeFileIfExists(rollbackDb);
  return { ...result, backup: state?.meta?.sourceName || null };
}

// Repõe a base anterior se a restauração falhar. A base deve estar fechada.
function rollbackPendingRestore(app, state) {
  const { pendingDb, pendingMeta, rollbackDb } = getPendingPaths(app);
  const dbPath = getDbPath(app);
  if (state?.rollbackPath && fs.existsSync(state.rollbackPath)) {
    removeSqliteSideFiles(dbPath);
    fs.copyFileSync(state.rollbackPath, dbPath);
  }
  removeFileIfExists(pendingDb);
  removeFileIfExists(pendingMeta);
  removeFileIfExists(rollbackDb);
}

async function deleteBackup({ name, app: appRef, folderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Backup não encontrado.");

  const backupDir = getBackupDir(app, folderPath);
  const filePath = path.join(backupDir, path.basename(String(name || "")));
  if (!name || !fs.existsSync(filePath)) throw new Error("Backup não encontrado.");

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
  return { lastBackup, nextBackup, state, folderPath: backupDir };
}

function getBackupFolderPath(app, folderPath) {
  return getBackupDir(app || electronApp, folderPath);
}

function getLastAutoBackupTime(backupDir) {
  if (!fs.existsSync(backupDir)) return null;
  const latest = listBackupFiles(backupDir).find((f) => f.typeKey === "auto");
  return latest ? latest.mtime : null;
}

function scheduleAutoBackup(app, intervalHours = 24, keepCount = 10, folderPath) {
  electronApp = app;
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  if (startupBackupTimer) clearTimeout(startupBackupTimer);
  if (!intervalHours || intervalHours <= 0) return;

  const ms = intervalHours * 60 * 60 * 1000;
  autoBackupTimer = setInterval(() => {
    createBackup({ app, keepCount, type: "auto", createdBy: "Sistema", folderPath })
      .catch((e) => console.error("Auto-backup error:", e));
  }, ms);

  // Só cria backup no arranque se o último automático for mais antigo que o
  // intervalo configurado; reinícios repetidos não substituem backups antigos.
  const lastAuto = getLastAutoBackupTime(getBackupDir(app, folderPath));
  if (lastAuto && Date.now() - lastAuto.getTime() < ms) return;

  startupBackupTimer = setTimeout(() => {
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
  hasPendingRestore,
  applyPendingRestore,
  finalizePendingRestore,
  rollbackPendingRestore,
  validateBackupFile,
  readAccountsSnapshot,
  mergeAccounts,
  deleteBackup,
  integrityCheck,
  getServiceStatus,
  getBackupFolderPath,
  initializeBackupScheduler,
  SAFE_ERRORS,
};
