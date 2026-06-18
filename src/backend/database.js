const { Sequelize, DataTypes } = require("sequelize");
const path = require("path");
const { hashPassword } = require("./security/passwords");
const { PERMISSIONS, DEFAULT_PROFILES, ADMINISTRATOR_PROFILE } = require("./services/permissionCatalog");

let sequelize = null;
let models = null;

const VENDAS_INVOICE_INDEX = "vendas_numero_factura_unique";
const PERFIL_PERMISSAO_UNIQUE_INDEX = "perfil_permissao_unique_pair";
const DIA_OPERACIONAL_ONE_OPEN_INDEX = "dia_operacional_one_open_unique";
const TURNO_OPERACIONAL_ONE_OPEN_INDEX = "turno_operacional_one_open_unique";

function defineModels(db) {
  const Categoria = db.define("Categoria", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome: { type: DataTypes.STRING, unique: true, allowNull: false },
    codigo: { type: DataTypes.STRING, unique: true },
    descricao: { type: DataTypes.TEXT },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const Subcategoria = db.define("Subcategoria", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    categoria_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Categoria, key: "id" } },
    nome: { type: DataTypes.STRING, allowNull: false },
    codigo: { type: DataTypes.STRING },
    descricao: { type: DataTypes.TEXT },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const Produto = db.define("Produto", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome: { type: DataTypes.STRING, allowNull: false },
    descricao: { type: DataTypes.TEXT },
    codigo_barras: { type: DataTypes.STRING, unique: true, allowNull: false },
    preco_venda: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    preco_custo: { type: DataTypes.DECIMAL(10, 2) },
    fabricante: { type: DataTypes.STRING },
    categoria: { type: DataTypes.STRING },
    categoria_id: { type: DataTypes.INTEGER, references: { model: Categoria, key: "id" } },
    subcategoria_id: { type: DataTypes.INTEGER, references: { model: Subcategoria, key: "id" } },
    unidade_medida: { type: DataTypes.STRING, defaultValue: "Unidade" },
    estoque_minimo: { type: DataTypes.INTEGER, defaultValue: 0 },
    receita_obrigatoria: { type: DataTypes.BOOLEAN, defaultValue: false },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const Estoque = db.define("Estoque", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    produto_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Produto, key: "id" } },
    lote: { type: DataTypes.STRING, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    data_validade: { type: DataTypes.DATE, allowNull: false },
    data_entrada: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    localizacao: { type: DataTypes.STRING },
  });

  const Venda = db.define("Venda", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    numero_factura: { type: DataTypes.STRING },
    data_venda: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    imposto: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    desconto: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    forma_pagamento: { type: DataTypes.STRING, allowNull: false },
    valor_pago: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    troco: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    status: { type: DataTypes.STRING, defaultValue: "Concluida" },
    cliente_id: { type: DataTypes.INTEGER },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  });

  const ItemVenda = db.define("ItemVenda", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    venda_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Venda, key: "id" } },
    produto_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Produto, key: "id" } },
    lote: { type: DataTypes.STRING, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    preco_unitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  });

  const TransacaoFinanceira = db.define("TransacaoFinanceira", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tipo: { type: DataTypes.STRING, allowNull: false },
    categoria: { type: DataTypes.STRING },
    origem: { type: DataTypes.STRING, defaultValue: "Manual" },
    descricao: { type: DataTypes.TEXT },
    valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    data_transacao: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    data_vencimento: { type: DataTypes.DATE },
    status: { type: DataTypes.STRING, defaultValue: "Pendente" },
    turno: { type: DataTypes.STRING },
    motivo_perda: { type: DataTypes.STRING },
    quantidade: { type: DataTypes.INTEGER },
    produto_id: { type: DataTypes.INTEGER },
    referencia_venda_id: { type: DataTypes.INTEGER },
    fornecedor_id: { type: DataTypes.INTEGER },
  });

  const DiaOperacional = db.define("DiaOperacional", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    data_operacional: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: "Aberto", allowNull: false },
    saldo_inicial: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    saldo_final_informado: { type: DataTypes.DECIMAL(10, 2) },
    total_vendas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    total_despesas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    total_perdas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    diferenca_caixa: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    observacao_abertura: { type: DataTypes.TEXT },
    observacao_fechamento: { type: DataTypes.TEXT },
    aberto_por_usuario_id: { type: DataTypes.INTEGER },
    fechado_por_usuario_id: { type: DataTypes.INTEGER },
    aberto_em: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fechado_em: { type: DataTypes.DATE },
  });

  const TurnoOperacional = db.define("TurnoOperacional", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    dia_operacional_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: DiaOperacional, key: "id" },
    },
    nome: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: "Aberto", allowNull: false },
    saldo_inicial: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    saldo_final_informado: { type: DataTypes.DECIMAL(10, 2) },
    total_vendas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    total_despesas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    total_perdas: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    diferenca_caixa: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0, allowNull: false },
    observacao_abertura: { type: DataTypes.TEXT },
    observacao_fechamento: { type: DataTypes.TEXT },
    aberto_por_usuario_id: { type: DataTypes.INTEGER },
    fechado_por_usuario_id: { type: DataTypes.INTEGER },
    aberto_em: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fechado_em: { type: DataTypes.DATE },
  });

  const Cliente = db.define("Cliente", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome: { type: DataTypes.STRING, allowNull: false },
    cpf_cnpj: { type: DataTypes.STRING, unique: true },
    telefone: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING, unique: true },
    endereco: { type: DataTypes.TEXT },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const Fornecedor = db.define("Fornecedor", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome_fantasia: { type: DataTypes.STRING, allowNull: false },
    razao_social: { type: DataTypes.STRING },
    cnpj: { type: DataTypes.STRING, unique: true, allowNull: false },
    telefone: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING, unique: true },
    endereco: { type: DataTypes.TEXT },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const Perfil = db.define("Perfil", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome: { type: DataTypes.STRING, unique: true, allowNull: false },
    descricao: { type: DataTypes.TEXT },
    sistema: { type: DataTypes.BOOLEAN, defaultValue: false },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: "Perfis",
  });

  const Permissao = db.define("Permissao", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    chave: { type: DataTypes.STRING, unique: true, allowNull: false },
    modulo: { type: DataTypes.STRING, allowNull: false },
    acao: { type: DataTypes.STRING, allowNull: false },
    descricao: { type: DataTypes.TEXT },
  });

  const PerfilPermissao = db.define("PerfilPermissao", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    perfil_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Perfil, key: "id" } },
    permissao_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Permissao, key: "id" } },
  });

  const Usuario = db.define("Usuario", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome_usuario: { type: DataTypes.STRING, unique: true, allowNull: false },
    senha_hash: { type: DataTypes.STRING, allowNull: false },
    nome_completo: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, unique: true },
    cargo: { type: DataTypes.STRING },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    perfil_id: { type: DataTypes.INTEGER, references: { model: Perfil, key: "id" } },
    deve_trocar_senha: { type: DataTypes.BOOLEAN, defaultValue: false },
    ultimo_login_em: { type: DataTypes.DATE },
    falhas_login: { type: DataTypes.INTEGER, defaultValue: 0 },
    bloqueado_ate: { type: DataTypes.DATE },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const AuditoriaUsuario = db.define("AuditoriaUsuario", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ator_usuario_id: { type: DataTypes.INTEGER },
    usuario_afetado_id: { type: DataTypes.INTEGER },
    acao: { type: DataTypes.STRING, allowNull: false },
    detalhes: { type: DataTypes.TEXT },
    data_evento: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  Categoria.hasMany(Subcategoria, { foreignKey: "categoria_id" });
  Subcategoria.belongsTo(Categoria, { foreignKey: "categoria_id" });

  Categoria.hasMany(Produto, { foreignKey: "categoria_id" });
  Produto.belongsTo(Categoria, { foreignKey: "categoria_id" });

  Subcategoria.hasMany(Produto, { foreignKey: "subcategoria_id" });
  Produto.belongsTo(Subcategoria, { foreignKey: "subcategoria_id" });

  Produto.hasMany(Estoque, { foreignKey: "produto_id" });
  Estoque.belongsTo(Produto, { foreignKey: "produto_id" });

  Venda.hasMany(ItemVenda, { foreignKey: "venda_id" });
  ItemVenda.belongsTo(Venda, { foreignKey: "venda_id" });
  ItemVenda.belongsTo(Produto, { foreignKey: "produto_id" });

  Venda.belongsTo(Cliente, { foreignKey: "cliente_id" });
  Cliente.hasMany(Venda, { foreignKey: "cliente_id" });

  Venda.belongsTo(Usuario, { foreignKey: "usuario_id" });
  Usuario.hasMany(Venda, { foreignKey: "usuario_id" });

  TransacaoFinanceira.belongsTo(Venda, { foreignKey: "referencia_venda_id" });
  TransacaoFinanceira.belongsTo(Produto, { foreignKey: "produto_id" });
  TransacaoFinanceira.belongsTo(Fornecedor, { foreignKey: "fornecedor_id" });
  Fornecedor.hasMany(TransacaoFinanceira, { foreignKey: "fornecedor_id" });

  DiaOperacional.hasMany(TurnoOperacional, { foreignKey: "dia_operacional_id" });
  TurnoOperacional.belongsTo(DiaOperacional, { foreignKey: "dia_operacional_id" });
  DiaOperacional.belongsTo(Usuario, { as: "abertoPor", foreignKey: "aberto_por_usuario_id" });
  DiaOperacional.belongsTo(Usuario, { as: "fechadoPor", foreignKey: "fechado_por_usuario_id" });
  TurnoOperacional.belongsTo(Usuario, { as: "abertoPor", foreignKey: "aberto_por_usuario_id" });
  TurnoOperacional.belongsTo(Usuario, { as: "fechadoPor", foreignKey: "fechado_por_usuario_id" });

  Perfil.belongsToMany(Permissao, {
    through: { model: PerfilPermissao, unique: false },
    foreignKey: "perfil_id",
    otherKey: "permissao_id",
  });
  Permissao.belongsToMany(Perfil, {
    through: { model: PerfilPermissao, unique: false },
    foreignKey: "permissao_id",
    otherKey: "perfil_id",
  });
  Perfil.hasMany(Usuario, { foreignKey: "perfil_id" });
  Usuario.belongsTo(Perfil, { foreignKey: "perfil_id" });
  AuditoriaUsuario.belongsTo(Usuario, { as: "ator", foreignKey: "ator_usuario_id" });
  AuditoriaUsuario.belongsTo(Usuario, { as: "usuarioAfetado", foreignKey: "usuario_afetado_id" });

  return {
    Categoria,
    Subcategoria,
    Produto,
    Estoque,
    Venda,
    ItemVenda,
    TransacaoFinanceira,
    DiaOperacional,
    TurnoOperacional,
    Cliente,
    Fornecedor,
    Usuario,
    Perfil,
    Permissao,
    PerfilPermissao,
    AuditoriaUsuario,
  };
}

function hasTable(tables, tableName) {
  return tables.some((table) => {
    if (typeof table === "string") {
      return table === tableName;
    }

    return Object.values(table).includes(tableName);
  });
}

async function ensureSqliteVendasColumns(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "Vendas")) {
    return;
  }

  const columns = await queryInterface.describeTable("Vendas");
  const vendasColumns = [
    ["numero_factura", { type: DataTypes.STRING }],
    ["subtotal", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }],
    ["imposto", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }],
    ["valor_pago", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }],
    ["troco", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 }],
  ];

  for (const [name, definition] of vendasColumns) {
    if (!columns[name]) {
      await queryInterface.addColumn("Vendas", name, definition);
    }
  }
}

async function ensureVendasInvoiceIndex(db) {
  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "Vendas")) {
    return;
  }

  const indexes = await queryInterface.showIndex("Vendas");
  const hasInvoiceIndex = indexes.some((index) => {
    const fieldNames = (index.fields || []).map((field) => field.attribute || field.name);

    return index.name === VENDAS_INVOICE_INDEX ||
      (index.unique && fieldNames.length === 1 && fieldNames[0] === "numero_factura");
  });

  if (!hasInvoiceIndex) {
    await queryInterface.addIndex("Vendas", ["numero_factura"], {
      name: VENDAS_INVOICE_INDEX,
      unique: true,
    });
  }
}

async function ensureSqliteOperationalOpenIndexes(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const hasOperationalDays = hasTable(tables, "DiaOperacionals");
  const hasOperationalShifts = hasTable(tables, "TurnoOperacionals");

  await repairDuplicateOpenOperationalRows(db, {
    hasOperationalDays,
    hasOperationalShifts,
  });

  if (hasOperationalDays) {
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${DIA_OPERACIONAL_ONE_OPEN_INDEX}
      ON DiaOperacionals (status)
      WHERE status = 'Aberto'
    `);
  }

  if (hasOperationalShifts) {
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${TURNO_OPERACIONAL_ONE_OPEN_INDEX}
      ON TurnoOperacionals (status)
      WHERE status = 'Aberto'
    `);
  }
}

async function closeOpenOperationalRows(db, tableName, whereClause) {
  await db.query(`
    UPDATE ${tableName}
    SET
      status = 'Fechado',
      fechado_em = COALESCE(fechado_em, CURRENT_TIMESTAMP),
      observacao_fechamento = CASE
        WHEN observacao_fechamento IS NULL OR TRIM(observacao_fechamento) = ''
          THEN 'Fechado automaticamente ao reparar estado operacional duplicado.'
        ELSE observacao_fechamento || CHAR(10) || 'Fechado automaticamente ao reparar estado operacional duplicado.'
      END,
      updatedAt = CURRENT_TIMESTAMP
    WHERE status = 'Aberto'
      AND (${whereClause})
  `);
}

async function repairDuplicateOpenOperationalRows(db, { hasOperationalDays, hasOperationalShifts }) {
  let keptOpenDayId = null;

  if (hasOperationalDays) {
    const rows = await db.query(`
      SELECT id
      FROM DiaOperacionals
      WHERE status = 'Aberto'
      ORDER BY id DESC
      LIMIT 1
    `, { type: db.QueryTypes.SELECT });

    keptOpenDayId = rows.length > 0 ? rows[0].id : null;

    if (keptOpenDayId !== null) {
      await closeOpenOperationalRows(db, "DiaOperacionals", `id <> ${Number(keptOpenDayId)}`);
    }
  }

  if (!hasOperationalShifts) {
    return;
  }

  if (keptOpenDayId === null) {
    await closeOpenOperationalRows(db, "TurnoOperacionals", "1 = 1");
    return;
  }

  const rows = await db.query(`
    SELECT id
    FROM TurnoOperacionals
    WHERE status = 'Aberto'
      AND dia_operacional_id = ${Number(keptOpenDayId)}
    ORDER BY id DESC
    LIMIT 1
  `, { type: db.QueryTypes.SELECT });
  const keptOpenShiftId = rows.length > 0 ? rows[0].id : null;

  if (keptOpenShiftId === null) {
    await closeOpenOperationalRows(db, "TurnoOperacionals", `dia_operacional_id <> ${Number(keptOpenDayId)}`);
    return;
  }

  await closeOpenOperationalRows(
    db,
    "TurnoOperacionals",
    `dia_operacional_id <> ${Number(keptOpenDayId)} OR id <> ${Number(keptOpenShiftId)}`
  );
}

async function ensureSqliteFinanceColumns(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "TransacaoFinanceiras")) {
    return;
  }

  const columns = await queryInterface.describeTable("TransacaoFinanceiras");
  const financeColumns = [
    ["categoria", { type: DataTypes.STRING }],
    ["origem", { type: DataTypes.STRING, defaultValue: "Manual" }],
    ["turno", { type: DataTypes.STRING }],
    ["motivo_perda", { type: DataTypes.STRING }],
    ["quantidade", { type: DataTypes.INTEGER }],
    ["produto_id", { type: DataTypes.INTEGER }],
  ];

  for (const [name, definition] of financeColumns) {
    if (!columns[name]) {
      await queryInterface.addColumn("TransacaoFinanceiras", name, definition);
    }
  }
}

async function ensureSqliteUsuarioSecurityColumns(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "Usuarios")) {
    return;
  }

  const columns = await queryInterface.describeTable("Usuarios");
  const userColumns = [
    ["perfil_id", { type: DataTypes.INTEGER }],
    ["deve_trocar_senha", { type: DataTypes.BOOLEAN, defaultValue: false }],
    ["ultimo_login_em", { type: DataTypes.DATE }],
    ["falhas_login", { type: DataTypes.INTEGER, defaultValue: 0 }],
    ["bloqueado_ate", { type: DataTypes.DATE }],
  ];

  for (const [name, definition] of userColumns) {
    if (!columns[name]) {
      await queryInterface.addColumn("Usuarios", name, definition);
    }
  }
}

async function ensurePerfilPermissaoUniqueIndex(db) {
  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "PerfilPermissaos")) {
    return;
  }

  const indexes = await queryInterface.showIndex("PerfilPermissaos");
  const hasUniquePairIndex = indexes.some((index) => {
    const fieldNames = (index.fields || []).map((field) => field.attribute || field.name);

    return index.name === PERFIL_PERMISSAO_UNIQUE_INDEX ||
      (index.unique &&
        fieldNames.length === 2 &&
        fieldNames.includes("perfil_id") &&
        fieldNames.includes("permissao_id"));
  });

  if (hasUniquePairIndex) {
    return;
  }

  if (db.getDialect() === "sqlite") {
    await db.query(`
      DELETE FROM PerfilPermissaos
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM PerfilPermissaos
        GROUP BY perfil_id, permissao_id
      )
    `);
  }

  await queryInterface.addIndex("PerfilPermissaos", ["perfil_id", "permissao_id"], {
    name: PERFIL_PERMISSAO_UNIQUE_INDEX,
    unique: true,
  });
}

async function normalizePerfilPermissaoTableForSqliteAlter(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "PerfilPermissaos")) {
    return;
  }

  const indexes = await queryInterface.showIndex("PerfilPermissaos");
  const hasIndex = indexes.some((index) => index.name === PERFIL_PERMISSAO_UNIQUE_INDEX);
  const hasLegacyUniqueIndex = indexes.some((index) => index.unique && index.name !== PERFIL_PERMISSAO_UNIQUE_INDEX);

  if (hasIndex) {
    await queryInterface.removeIndex("PerfilPermissaos", PERFIL_PERMISSAO_UNIQUE_INDEX);
  }

  if (!hasLegacyUniqueIndex) {
    return;
  }

  await db.query(`
    CREATE TABLE PerfilPermissaos_normalized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      perfil_id INTEGER NOT NULL,
      permissao_id INTEGER NOT NULL,
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    )
  `);
  await db.query(`
    INSERT INTO PerfilPermissaos_normalized (
      perfil_id,
      permissao_id,
      createdAt,
      updatedAt
    )
    SELECT
      perfil_id,
      permissao_id,
      COALESCE(MIN(createdAt), CURRENT_TIMESTAMP),
      COALESCE(MIN(updatedAt), CURRENT_TIMESTAMP)
    FROM PerfilPermissaos
    GROUP BY perfil_id, permissao_id
  `);
  await db.query("DROP TABLE PerfilPermissaos");
  await db.query("ALTER TABLE PerfilPermissaos_normalized RENAME TO PerfilPermissaos");
}

async function assignProfilesToExistingUsers() {
  const { Perfil, Usuario } = getModels();
  const fallbackProfile = await Perfil.findOne({ where: { nome: "Caixa" } });

  for (const profile of DEFAULT_PROFILES) {
    const perfil = await Perfil.findOne({ where: { nome: profile.nome } });

    if (perfil) {
      await Usuario.update(
        { perfil_id: perfil.id },
        { where: { perfil_id: null, cargo: profile.nome } },
      );
    }
  }

  if (fallbackProfile) {
    await Usuario.update(
      { perfil_id: fallbackProfile.id },
      { where: { perfil_id: null } },
    );
  }
}

async function seedPermissionsAndProfiles() {
  const { Perfil, Permissao, PerfilPermissao, Usuario } = getModels();

  for (const permission of PERMISSIONS) {
    const [permissao, created] = await Permissao.findOrCreate({
      where: { chave: permission.chave },
      defaults: permission,
    });

    if (!created) {
      await permissao.update({
        modulo: permission.modulo,
        acao: permission.acao,
        descricao: permission.descricao,
      });
    }
  }

  for (const profile of DEFAULT_PROFILES) {
    const profileDefaults = {
      descricao: profile.descricao,
      sistema: profile.sistema,
      ativo: profile.ativo ?? true,
    };
    const [perfil, created] = await Perfil.findOrCreate({
      where: { nome: profile.nome },
      defaults: profileDefaults,
    });

    if (!created) {
      await perfil.update(profileDefaults);
    }

    const existingPermissionLinks = created
      ? 0
      : await PerfilPermissao.count({ where: { perfil_id: perfil.id } });

    if (existingPermissionLinks === 0 || profile.nome === ADMINISTRATOR_PROFILE) {
      const permissions = await Permissao.findAll({
        where: { chave: profile.permissoes },
      });
      await PerfilPermissao.bulkCreate(permissions.map((permission) => ({
        perfil_id: perfil.id,
        permissao_id: permission.id,
      })), { ignoreDuplicates: true });
    }
  }

  await assignProfilesToExistingUsers();

  const userCount = await Usuario.count();
  if (userCount === 0) {
    const adminProfile = await Perfil.findOne({ where: { nome: ADMINISTRATOR_PROFILE } });
    await Usuario.create({
      nome_usuario: "admin",
      senha_hash: hashPassword("Admin123!"),
      nome_completo: "Administrador",
      email: "admin@esayos.local",
      cargo: ADMINISTRATOR_PROFILE,
      perfil_id: adminProfile.id,
      ativo: true,
      deve_trocar_senha: true,
    });
  }
}

async function syncModels(db) {
  if (db.getDialect() !== "sqlite") {
    await db.sync({ alter: true });
    return;
  }

  await db.query("PRAGMA foreign_keys = OFF");
  try {
    await normalizePerfilPermissaoTableForSqliteAlter(db);
    await db.sync({ alter: true });
  } finally {
    await db.query("PRAGMA foreign_keys = ON");
  }
}

async function syncDatabaseSchema(db) {
  await ensureSqliteVendasColumns(db);
  await ensureSqliteFinanceColumns(db);
  await ensureSqliteUsuarioSecurityColumns(db);
  await syncModels(db);
  await ensureVendasInvoiceIndex(db);
  await ensureSqliteOperationalOpenIndexes(db);
  await ensurePerfilPermissaoUniqueIndex(db);
  await seedPermissionsAndProfiles();
}

async function connectDB(app, env = "development") {
  if (env === "development") {
    sequelize = new Sequelize({
      dialect: "sqlite",
      storage: path.join(app.getPath("userData"), "database.sqlite"),
      logging: false,
    });
  } else if (env === "production") {
    sequelize = new Sequelize("database", "username", "password", {
      host: "localhost",
      dialect: "mysql",
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });
  } else {
    throw new Error(`Ambiente de banco de dados invalido: ${env}`);
  }

  models = defineModels(sequelize);

  try {
    await sequelize.authenticate();
    console.log("Conexao com o banco de dados estabelecida com sucesso.");
    return sequelize;
  } catch (error) {
    console.error("Nao foi possivel conectar ao banco de dados:", error);
    throw error;
  }
}

function getModels() {
  if (!models) {
    throw new Error("Os models ainda nao foram inicializados. Chame connectDB primeiro.");
  }

  return models;
}

module.exports = {
  connectDB,
  getModels,
  syncDatabaseSchema,
  get sequelize() {
    return sequelize;
  },
};
