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
  close: "Encerramento",
  "pre-restore": "Pré-Restauração",
  "pre-reset": "Pré-Reset",
};

// Apenas os backups automáticos e de encerramento entram na rotação. Backups
// manuais e cópias de segurança (pré-restauração / pré-reset) nunca são apagados.
const ROTATED_TYPES = new Set(["auto", "close"]);

// Tabelas contadas em cada backup para detectar perdas de dados entre backups.
const COUNTED_TABLES = [
  "Produtos", "Categoria", "Subcategoria", "Estoques", "Vendas", "ItemVendas",
  "Clientes", "Fornecedors", "TransacaoFinanceiras", "OrdensCompra", "Usuarios",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const FREQUENCY_MS = { "24h": DAY_MS, weekly: 7 * DAY_MS, fortnightly: 14 * DAY_MS, monthly: 30 * DAY_MS };
const SCHEDULER_TICK_MS = 5 * 60 * 1000;
const SCHEDULER_FIRST_TICK_MS = 60 * 1000;
const CLOSE_BACKUP_MIN_GAP_MS = 10 * 60 * 1000;

const DEFAULT_AUTO = Object.freeze({ enabled: true, frequency: "24h", time: "23:00", onClose: true });
const DEFAULT_OPTIONS = Object.freeze({ retentionCount: 7, folderPath: "", mirrorFolderPath: "" });

const PENDING_RESTORE_DB = "restore-pending.sqlite";
const PENDING_RESTORE_META = "restore-pending.json";
const RESTORE_ROLLBACK_DB = "restore-rollback.sqlite";
const SQLITE_SIDE_FILES = ["-journal", "-wal", "-shm"];

let schedulerTimer = null;
let firstTickTimer = null;
let autoBackupRunning = false;
let electronApp = null;
let settings = { auto: { ...DEFAULT_AUTO }, options: { ...DEFAULT_OPTIONS } };
const health = { lastAutoError: null, lastAutoAt: null };

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

function buildBackupName(type = "manual", backupDir = null) {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  // Dois backups no mesmo segundo não se podem sobrepor: acrescenta um contador.
  for (let counter = 1; ; counter += 1) {
    const name = `backup-${datePart}${counter > 1 ? `-${counter}` : ""}-${type}.sqlite`;
    if (!backupDir || !fs.existsSync(path.join(backupDir, name))) return name;
  }
}

function parseBackupTypeKey(filename) {
  // backup-YYYY-MM-DD-HHMM[SS]-{type}.sqlite
  const m = filename.match(/^backup-\d{4}-\d{2}-\d{2}-\d{4}(?:\d{2})?(?:-\d+)?-([a-z-]+)\.sqlite$/);
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

// Abre o backup só para leitura: integridade + contagem de registos por tabela.
async function verifyBackupFile(filePath) {
  let handle = null;
  try {
    handle = await openSqliteReadOnly(filePath);
    const check = await sqliteAll(handle, "PRAGMA quick_check");
    const ok = check.length === 1 && Object.values(check[0])[0] === "ok";
    const tables = new Set(
      (await sqliteAll(handle, "SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name),
    );
    const counts = {};
    for (const table of COUNTED_TABLES) {
      if (!tables.has(table)) continue;
      const [row] = await sqliteAll(handle, `SELECT COUNT(*) AS n FROM "${table}"`);
      counts[table] = Number(row.n);
    }
    return { ok, counts };
  } catch (error) {
    return { ok: false, counts: null, error: error?.message || String(error) };
  } finally {
    if (handle) await sqliteClose(handle);
  }
}

// Compara com o backup anterior: tabela que ficou vazia, ou que perdeu mais de
// metade dos registos (a partir de 20), gera um aviso.
function compareBackupCounts(previous, current) {
  if (!previous || !current) return [];
  const warnings = [];
  for (const table of COUNTED_TABLES) {
    const before = Number(previous[table] ?? 0);
    const after = Number(current[table] ?? 0);
    if ((before > 0 && after === 0) || (before >= 20 && after < before * 0.5)) {
      warnings.push({ table, before, after });
    }
  }
  return warnings;
}

function findPreviousCounts(backupDir, excludeName) {
  if (!fs.existsSync(backupDir)) return null;
  for (const file of listBackupFiles(backupDir)) {
    if (file.name === excludeName) continue;
    const meta = readSidecar(file.fullPath);
    if (meta?.counts && meta.state !== "ERRO") return meta.counts;
  }
  return null;
}

function mirrorBackup(dest, mirrorFolderPath, keepCount) {
  if (!mirrorFolderPath) return null;
  try {
    ensureBackupDir(mirrorFolderPath);
    const target = path.join(mirrorFolderPath, path.basename(dest));
    fs.copyFileSync(dest, target);
    if (fs.existsSync(sidecarPath(dest))) fs.copyFileSync(sidecarPath(dest), sidecarPath(target));
    pruneOldBackups(mirrorFolderPath, keepCount);
    return { ok: true, folder: mirrorFolderPath, at: new Date().toISOString() };
  } catch (error) {
    console.error("Cópia adicional do backup falhou:", error?.message);
    return { ok: false, folder: mirrorFolderPath, at: new Date().toISOString(), error: "Pasta da cópia adicional indisponível." };
  }
}

async function createBackup({ app: appRef, keepCount, type = "manual", createdBy = "Sistema", folderPath, mirrorFolderPath } = {}) {
  const app = appRef || electronApp;
  if (!app) throw new Error("Erro ao criar backup.");

  const dbPath = getDbPath(app);
  if (!fs.existsSync(dbPath)) throw new Error("Erro ao criar backup.");

  const keep = keepCount ?? settings.options.retentionCount;
  const backupDir = getBackupDir(app, folderPath ?? (settings.options.folderPath || undefined));
  ensureBackupDir(backupDir);

  const name = buildBackupName(type, backupDir);
  const dest = path.join(backupDir, name);
  try {
    await snapshotDatabase(dbPath, dest);
  } catch (error) {
    console.error("Erro ao criar backup:", error);
    throw new Error("Erro ao criar backup.");
  }

  const stat = fs.statSync(dest);
  const verification = await verifyBackupFile(dest);
  const warnings = verification.ok ? compareBackupCounts(findPreviousCounts(backupDir, name), verification.counts) : [];
  if (!verification.ok) console.error("Backup criado mas falhou a verificação:", name, verification.error || "");
  if (warnings.length) console.warn("Backup com muito menos dados que o anterior:", name, JSON.stringify(warnings));

  const meta = {
    type,
    createdBy,
    createdAt: stat.mtime.toISOString(),
    state: verification.ok ? (warnings.length ? "AVISO" : "OK") : "ERRO",
    verifiedAt: new Date().toISOString(),
    counts: verification.counts,
    warnings,
  };
  writeSidecar(dest, meta);

  const mirror = verification.ok
    ? mirrorBackup(dest, mirrorFolderPath ?? settings.options.mirrorFolderPath, keep)
    : null;
  if (mirror) writeSidecar(dest, { ...meta, mirror });

  pruneOldBackups(backupDir, keep);

  return {
    name, path: dest, size: stat.size, createdAt: stat.mtime,
    state: meta.state, counts: meta.counts, warnings, mirror,
  };
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
        counts: meta?.counts || null,
        warnings: meta?.warnings || [],
        mirror: meta?.mirror || null,
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

  const { pendingDb, pendingMeta, rollbackDb } = getPendingPaths(app);
  try {
    removeFileIfExists(rollbackDb);
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
  if (!fs.existsSync(pendingMeta)) {
    removeFileIfExists(pendingDb);
    return null;
  }

  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(pendingMeta, "utf8")); } catch { /* usar vazio */ }

  if (!fs.existsSync(pendingDb)) {
    // O ficheiro já foi trocado mas o arranque anterior terminou antes de repor
    // as contas: retoma a finalização com a cópia de reversão.
    if (fs.existsSync(rollbackDb)) return { meta, rollbackPath: rollbackDb, resumed: true };
    removeFileIfExists(pendingMeta);
    return null;
  }

  const dbPath = getDbPath(app);
  // Com a base fechada, a cópia é consistente; serve para reverter e para
  // recuperar as contas actuais. Se já existir (tentativa anterior interrompida
  // a meio da cópia), é a base original intacta e não pode ser substituída.
  if (!fs.existsSync(rollbackDb) && fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, `${rollbackDb}.tmp`);
    fs.renameSync(`${rollbackDb}.tmp`, rollbackDb);
  }

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

// Conta que nunca foi usada: sem login e com troca de senha obrigatória (ex.: o
// admin de fábrica de uma instalação nova). Não deve substituir a do backup.
function isUnusedAccount(user) {
  return toBoolean(user.deve_trocar_senha, false) && !user.ultimo_login_em;
}

async function mergeAccounts(snapshot, transaction) {
  const { Perfil, Permissao, PerfilPermissao, Usuario } = db.getModels();
  const opts = { transaction };

  // Instalação nova (só contas nunca usadas): o backup prevalece por inteiro,
  // incluindo utilizadores, senhas e permissões dos perfis.
  if (snapshot.usuarios.every(isUnusedAccount)) {
    return { preservedUsers: 0, preservedProfiles: 0, freshInstallation: true };
  }

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
    const wanted = [...new Set(permissionIds)].sort((x, y) => x - y);
    const current = (await PerfilPermissao.findAll({ where: { perfil_id: perfil.id }, ...opts }))
      .map((link) => link.permissao_id)
      .sort((x, y) => x - y);
    const unchanged = wanted.length === current.length && wanted.every((id, i) => id === current[i]);
    if (permissionIds.length && !unchanged) {
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
    if (existing && isUnusedAccount(oldUser)) continue;
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

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  const hours = match ? Math.min(23, Number(match[1])) : 23;
  const minutes = match ? Math.min(59, Number(match[2])) : 0;
  return [hours, minutes];
}

// Próximo backup automático: na hora configurada, depois de passado o intervalo.
// Se o último automático tem mais de um intervalo (o PC estava desligado à hora
// marcada), o backup é feito de imediato.
function computeNextAutoBackup({ auto = settings.auto, lastAuto = null, now = new Date() } = {}) {
  if (!auto?.enabled) return null;
  const interval = FREQUENCY_MS[auto.frequency] || DAY_MS;
  if (!lastAuto || now - lastAuto >= interval) return now;
  const earliest = new Date(Math.max(lastAuto.getTime() + interval - 60 * 60 * 1000, now.getTime()));
  const [hours, minutes] = parseTime(auto.time);
  const slot = new Date(earliest);
  slot.setHours(hours, minutes, 0, 0);
  if (slot < earliest) slot.setDate(slot.getDate() + 1);
  return slot;
}

function getLastBackupTime(backupDir, typeKeys = null) {
  if (!backupDir || !fs.existsSync(backupDir)) return null;
  const latest = listBackupFiles(backupDir).find((f) => !typeKeys || typeKeys.includes(f.typeKey));
  return latest ? latest.mtime : null;
}

function getServiceStatus({ app: appRef, autoConfig = {}, folderPath } = {}) {
  const app = appRef || electronApp;
  const backupDir = app ? getBackupDir(app, folderPath || settings.options.folderPath || undefined) : null;
  const lastBackupTime = getLastBackupTime(backupDir);
  const lastAuto = getLastBackupTime(backupDir, ["auto"]);
  const auto = { ...settings.auto, ...autoConfig };
  const next = computeNextAutoBackup({ auto, lastAuto });
  const state = health.lastAutoError
    ? "Falha no último backup automático"
    : lastBackupTime ? "Operacional" : "Sem backups";
  return {
    lastBackup: lastBackupTime ? lastBackupTime.toISOString() : null,
    nextBackup: next ? next.toISOString() : null,
    state,
    folderPath: backupDir,
    mirrorFolderPath: settings.options.mirrorFolderPath || "",
    lastAutoError: health.lastAutoError,
  };
}

function getBackupFolderPath(app, folderPath) {
  return getBackupDir(app || electronApp, folderPath || settings.options.folderPath || undefined);
}

// Resumo para os alertas do sistema.
function getBackupHealth() {
  const app = electronApp;
  if (!app) return null;
  const backupDir = getBackupFolderPath(app);
  const files = fs.existsSync(backupDir) ? listBackupFiles(backupDir) : [];
  const latest = files[0] || null;
  const latestMeta = latest ? readSidecar(latest.fullPath) : null;
  const interval = FREQUENCY_MS[settings.auto.frequency] || DAY_MS;
  const overdue = Boolean(settings.auto.enabled)
    && (!latest || Date.now() - latest.mtime.getTime() > 2 * interval);
  return {
    folder: backupDir,
    latest: latest ? { name: latest.name, at: latest.mtime.toISOString(), state: latestMeta?.state || "OK", warnings: latestMeta?.warnings || [], mirror: latestMeta?.mirror || null } : null,
    lastAutoError: health.lastAutoError,
    overdue,
    autoEnabled: Boolean(settings.auto.enabled),
  };
}

function parseSettingRow(row) {
  try { return row ? JSON.parse(row.valor_json) : null; } catch { return null; }
}

async function loadBackupSettings() {
  try {
    const { ConfiguracaoSistema } = db.getModels();
    const rows = await ConfiguracaoSistema.findAll({ where: { chave: ["backup.auto", "backup.options"] } });
    const byKey = Object.fromEntries(rows.map((row) => [row.chave, parseSettingRow(row)]));
    settings = {
      auto: { ...DEFAULT_AUTO, ...(byKey["backup.auto"] || {}) },
      options: { ...DEFAULT_OPTIONS, ...(byKey["backup.options"] || {}) },
    };
  } catch (error) {
    console.error("Não foi possível ler as configurações de backup:", error?.message);
  }
  return settings;
}

async function runScheduledBackup(app) {
  if (autoBackupRunning) return;
  const backupDir = getBackupFolderPath(app);
  const next = computeNextAutoBackup({ lastAuto: getLastBackupTime(backupDir, ["auto"]) });
  if (!next || next > new Date()) return;
  autoBackupRunning = true;
  try {
    await createBackup({ app, type: "auto", createdBy: "Sistema" });
    health.lastAutoError = null;
    health.lastAutoAt = new Date().toISOString();
  } catch (error) {
    health.lastAutoError = { at: new Date().toISOString(), message: error?.message || "Erro ao criar backup." };
    console.error("Backup automático falhou:", error);
  } finally {
    autoBackupRunning = false;
  }
}

function stopBackupScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (firstTickTimer) clearTimeout(firstTickTimer);
  schedulerTimer = null;
  firstTickTimer = null;
}

// Verifica periodicamente (resiste a suspensão/hibernação, ao contrário de um
// temporizador longo) se chegou a hora do próximo backup automático.
async function initializeBackupScheduler(app) {
  electronApp = app;
  await loadBackupSettings();
  stopBackupScheduler();
  if (!settings.auto.enabled) return settings;
  const tick = () => { runScheduledBackup(app).catch(() => {}); };
  firstTickTimer = setTimeout(tick, SCHEDULER_FIRST_TICK_MS);
  schedulerTimer = setInterval(tick, SCHEDULER_TICK_MS);
  schedulerTimer.unref?.();
  firstTickTimer.unref?.();
  return settings;
}

// Chamado quando as configurações de backup são guardadas.
async function refreshBackupSchedule() {
  if (!electronApp) return null;
  return initializeBackupScheduler(electronApp);
}

// "Criar backup ao encerrar o sistema" — ignora se houve um backup há pouco.
async function createBackupOnClose() {
  const app = electronApp;
  if (!app || !settings.auto.onClose) return null;
  const last = getLastBackupTime(getBackupFolderPath(app));
  if (last && Date.now() - last.getTime() < CLOSE_BACKUP_MIN_GAP_MS) return null;
  return createBackup({ app, type: "close", createdBy: "Sistema" });
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
  getBackupHealth,
  initializeBackupScheduler,
  refreshBackupSchedule,
  stopBackupScheduler,
  loadBackupSettings,
  createBackupOnClose,
  runScheduledBackup,
  computeNextAutoBackup,
  compareBackupCounts,
  verifyBackupFile,
  SAFE_ERRORS,
};
