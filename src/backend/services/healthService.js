// Verificações da base de dados feitas no arranque: integridade física
// (quick_check), registos órfãos (foreign_key_check) e espaço em disco.
const fs = require("fs");

const LOW_DISK_BYTES = 500 * 1024 * 1024;

let state = { integrity: null, disk: null };

async function checkDatabaseIntegrity(sequelize) {
  const checkedAt = new Date().toISOString();
  try {
    const quick = await sequelize.query("PRAGMA quick_check", { type: sequelize.QueryTypes.SELECT });
    const results = quick.map((row) => Object.values(row)[0]);
    const ok = results.length === 1 && results[0] === "ok";

    const violations = await sequelize.query("PRAGMA foreign_key_check", { type: sequelize.QueryTypes.SELECT });
    const grouped = new Map();
    for (const row of violations) {
      const key = `${row.table}->${row.parent}`;
      const entry = grouped.get(key) || { table: row.table, parent: row.parent, count: 0 };
      entry.count += 1;
      grouped.set(key, entry);
    }
    const orphans = [...grouped.values()].sort((a, b) => b.count - a.count);
    return { checkedAt, ok, problems: ok ? [] : results.slice(0, 10), orphans };
  } catch (error) {
    return { checkedAt, ok: false, problems: [error?.message || String(error)], orphans: [] };
  }
}

function checkDiskSpace(directory) {
  try {
    if (typeof fs.statfsSync !== "function") return null;
    const stats = fs.statfsSync(directory);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return { freeBytes, low: freeBytes < LOW_DISK_BYTES, checkedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function runStartupChecks({ sequelize, userDataPath }) {
  const integrity = await checkDatabaseIntegrity(sequelize);
  const disk = checkDiskSpace(userDataPath);
  state = { integrity, disk };
  if (!integrity.ok) console.error("Verificação de integridade da base falhou:", JSON.stringify(integrity.problems));
  if (integrity.orphans.length) console.warn("Registos órfãos na base:", JSON.stringify(integrity.orphans));
  if (disk?.low) console.warn(`Pouco espaço em disco: ${Math.round(disk.freeBytes / 1024 / 1024)} MB livres.`);
  return state;
}

function getHealthState() {
  return state;
}

module.exports = { runStartupChecks, checkDatabaseIntegrity, checkDiskSpace, getHealthState, LOW_DISK_BYTES };
