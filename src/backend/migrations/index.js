// Migrações versionadas da base de dados.
//
// Regras para alterações futuras ao esquema ou aos dados:
//  - criar uma entrada nova no fim de MIGRATIONS com um id único (data + número);
//  - nunca alterar nem remover uma migração já publicada;
//  - a função `up` recebe a ligação Sequelize e NÃO abre transacções: o executor
//    corre cada migração dentro de BEGIN IMMEDIATE ... COMMIT e regista-a em
//    _kil_migrations; se falhar, tudo é desfeito e o arranque é interrompido.
const { normalizeSubcategoryKey } = require("../services/subcategoryKeys");
const {
  DEFAULT_PROFILES,
  PERMISSIONS,
  PERMISSIONS_REVISED_IN_1_0_6,
} = require("../services/permissionCatalog");

const MIGRATIONS_TABLE = "_kil_migrations";

async function tableExists(db, name) {
  const rows = await db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", {
    replacements: [name],
    type: db.QueryTypes.SELECT,
  });
  return rows.length > 0;
}

// Junta subcategorias repetidas na mesma categoria (mesmo nome ignorando acentos,
// maiúsculas e espaços); os produtos passam para a subcategoria que fica.
// Não abre transacção: quem chama é responsável por ela.
async function unifySubcategories(db) {
  if (!(await tableExists(db, "Subcategoria"))) return 0;
  const rows = await db.query(
    'SELECT id, categoria_id, nome, ativo, descricao, imagem FROM "Subcategoria" ORDER BY id',
    { type: db.QueryTypes.SELECT },
  );
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeSubcategoryKey(row.categoria_id, row.nome);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let removed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.find((row) => Number(row.ativo) !== 0) || group[0];
    for (const dup of group) {
      if (dup.id === keep.id) continue;
      await db.query('UPDATE "Produtos" SET subcategoria_id = ? WHERE subcategoria_id = ?', { replacements: [keep.id, dup.id] });
      if (!keep.descricao && dup.descricao) {
        keep.descricao = dup.descricao;
        await db.query('UPDATE "Subcategoria" SET descricao = ? WHERE id = ?', { replacements: [dup.descricao, keep.id] });
      }
      if (!keep.imagem && dup.imagem) {
        keep.imagem = dup.imagem;
        await db.query('UPDATE "Subcategoria" SET imagem = ? WHERE id = ?', { replacements: [dup.imagem, keep.id] });
      }
      await db.query('DELETE FROM "Subcategoria" WHERE id = ?', { replacements: [dup.id] });
      removed += 1;
    }
  }
  if (removed) console.log(`[migração] Subcategorias duplicadas unificadas: ${removed} removida(s).`);
  return removed;
}

function sequelizeTimestamp(date = new Date()) {
  return date.toISOString().replace("T", " ").replace("Z", " +00:00");
}

// Alinha os perfis de sistema já existentes com as predefinições do catálogo,
// apenas para as chaves indicadas: concede as que a predefinição inclui e retira
// as restantes. Perfis criados pelo administrador e outras permissões ficam
// intactos; depois disto tudo continua editável em Utilizadores › Permissões.
async function alignSystemProfilesWithCatalog(db, keys = PERMISSIONS_REVISED_IN_1_0_6) {
  for (const table of ["Perfis", "Permissaos", "PerfilPermissaos"]) {
    if (!(await tableExists(db, table))) return 0;
  }
  const stamp = sequelizeTimestamp();
  // As permissões novas ainda não existem: o catálogo só é semeado depois das migrações.
  for (const key of keys) {
    const definition = PERMISSIONS.find((permission) => permission.chave === key);
    if (!definition) continue;
    await db.query(
      'INSERT OR IGNORE INTO "Permissaos" (chave, modulo, acao, descricao, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      { replacements: [definition.chave, definition.modulo, definition.acao, definition.descricao, stamp, stamp] },
    );
  }

  const select = (sql, replacements) => db.query(sql, { replacements, type: db.QueryTypes.SELECT });
  let changes = 0;
  for (const profile of DEFAULT_PROFILES) {
    const [perfil] = await select('SELECT id FROM "Perfis" WHERE nome = ?', [profile.nome]);
    if (!perfil) continue;
    for (const key of keys) {
      const [permissao] = await select('SELECT id FROM "Permissaos" WHERE chave = ?', [key]);
      if (!permissao) continue;
      const [link] = await select(
        'SELECT id FROM "PerfilPermissaos" WHERE perfil_id = ? AND permissao_id = ?',
        [perfil.id, permissao.id],
      );
      const wanted = profile.permissoes.includes(key);
      if (wanted && !link) {
        await db.query(
          'INSERT INTO "PerfilPermissaos" (perfil_id, permissao_id, createdAt, updatedAt) VALUES (?, ?, ?, ?)',
          { replacements: [perfil.id, permissao.id, stamp, stamp] },
        );
        changes += 1;
      } else if (!wanted && link) {
        await db.query('DELETE FROM "PerfilPermissaos" WHERE id = ?', { replacements: [link.id] });
        changes += 1;
      }
    }
  }
  if (changes) console.log(`[migração] Perfis de sistema alinhados com as predefinições: ${changes} alteração(ões).`);
  return changes;
}

const MIGRATIONS = [
  {
    id: "2026-10-19-001-subcategorias-unicas",
    description: "Unifica subcategorias repetidas na mesma categoria e religa os produtos.",
    up: unifySubcategories,
  },
  {
    id: "2026-10-22-001-perfis-predefinicoes-1-0-6",
    description: "Abertura de dia/turno para todos os perfis de sistema; editar/importar estoque e ver custo conforme as predefinições.",
    up: (db) => alignSystemProfilesWithCatalog(db),
  },
];

async function appliedMigrationIds(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (id TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)`);
  const rows = await db.query(`SELECT id FROM "${MIGRATIONS_TABLE}"`, { type: db.QueryTypes.SELECT });
  return new Set(rows.map((row) => row.id));
}

async function runMigrations(db, migrations = MIGRATIONS) {
  if (db.getDialect() !== "sqlite") return [];
  const applied = await appliedMigrationIds(db);
  const ran = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.query("BEGIN IMMEDIATE");
    try {
      await migration.up(db);
      await db.query(`INSERT INTO "${MIGRATIONS_TABLE}" (id, aplicada_em) VALUES (?, ?)`, {
        replacements: [migration.id, new Date().toISOString()],
      });
      await db.query("COMMIT");
      ran.push(migration.id);
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      error.message = `Migração ${migration.id} falhou: ${error.message}`;
      throw error;
    }
  }
  return ran;
}

module.exports = {
  MIGRATIONS,
  runMigrations,
  unifySubcategories,
  alignSystemProfilesWithCatalog,
  MIGRATIONS_TABLE,
};
