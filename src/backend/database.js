const { Sequelize, DataTypes } = require("sequelize");
const path = require("path");
const { hashPassword } = require("./security/passwords");
const {
  PERMISSIONS,
  DEFAULT_PROFILES,
  ADMINISTRATOR_PROFILE,
  AUTHENTICATED_BASELINE_PERMISSIONS,
} = require("./services/permissionCatalog");

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
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Categoria, key: "id" },
    },
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
    categoria_id: {
      type: DataTypes.INTEGER,
      references: { model: Categoria, key: "id" },
    },
    subcategoria_id: {
      type: DataTypes.INTEGER,
      references: { model: Subcategoria, key: "id" },
    },
    unidade_medida: { type: DataTypes.STRING, defaultValue: "Unidade" },
    estoque_minimo: { type: DataTypes.INTEGER, defaultValue: 0 },
    receita_obrigatoria: { type: DataTypes.BOOLEAN, defaultValue: false },
    prateleira: { type: DataTypes.STRING },
    gaveta: { type: DataTypes.STRING },
    zona: { type: DataTypes.STRING },
    observacao_localizacao: { type: DataTypes.TEXT },
    data_cadastro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  const Estoque = db.define("Estoque", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    produto_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Produto, key: "id" },
    },
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
    subtotal: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
    imposto: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
    desconto: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
    forma_pagamento: { type: DataTypes.STRING, allowNull: false },
    valor_pago: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
    troco: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
    status: { type: DataTypes.STRING, defaultValue: "Concluida" },
    cliente_id: { type: DataTypes.INTEGER },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  });

  const ItemVenda = db.define("ItemVenda", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    venda_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Venda, key: "id" },
    },
    produto_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Produto, key: "id" },
    },
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
    status: {
      type: DataTypes.STRING,
      defaultValue: "Aberto",
      allowNull: false,
    },
    saldo_inicial: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    saldo_final_informado: { type: DataTypes.DECIMAL(10, 2) },
    total_vendas: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    total_despesas: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    total_perdas: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    diferenca_caixa: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
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
    status: {
      type: DataTypes.STRING,
      defaultValue: "Aberto",
      allowNull: false,
    },
    saldo_inicial: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    saldo_final_informado: { type: DataTypes.DECIMAL(10, 2) },
    total_vendas: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    total_despesas: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    total_perdas: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    diferenca_caixa: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
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

  const Perfil = db.define(
    "Perfil",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nome: { type: DataTypes.STRING, unique: true, allowNull: false },
      descricao: { type: DataTypes.TEXT },
      sistema: { type: DataTypes.BOOLEAN, defaultValue: false },
      ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      tableName: "Perfis",
    },
  );

  const Permissao = db.define("Permissao", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    chave: { type: DataTypes.STRING, unique: true, allowNull: false },
    modulo: { type: DataTypes.STRING, allowNull: false },
    acao: { type: DataTypes.STRING, allowNull: false },
    descricao: { type: DataTypes.TEXT },
  });

  const PerfilPermissao = db.define("PerfilPermissao", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    perfil_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Perfil, key: "id" },
    },
    permissao_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Permissao, key: "id" },
    },
  });

  const Usuario = db.define("Usuario", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nome_usuario: { type: DataTypes.STRING, unique: true, allowNull: false },
    senha_hash: { type: DataTypes.STRING, allowNull: false },
    nome_completo: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, unique: true },
    cargo: { type: DataTypes.STRING },
    ativo: { type: DataTypes.BOOLEAN, defaultValue: true },
    perfil_id: {
      type: DataTypes.INTEGER,
      references: { model: Perfil, key: "id" },
    },
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

  const ConfiguracaoSistema = db.define(
    "ConfiguracaoSistema",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      chave: { type: DataTypes.STRING, allowNull: false, unique: true },
      grupo: { type: DataTypes.STRING, allowNull: false },
      tipo: { type: DataTypes.STRING, allowNull: false },
      valor_json: { type: DataTypes.TEXT, allowNull: false },
      versao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      atualizado_por_usuario_id: { type: DataTypes.INTEGER },
    },
    {
      tableName: "ConfiguracoesSistema",
    },
  );

  const OpcaoCatalogo = db.define(
    "OpcaoCatalogo",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      catalogo: { type: DataTypes.STRING, allowNull: false },
      codigo: { type: DataTypes.STRING, allowNull: false },
      nome: { type: DataTypes.STRING, allowNull: false },
      ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sistema: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadados_json: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: "{}",
      },
      versao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      atualizado_por_usuario_id: { type: DataTypes.INTEGER },
    },
    {
      tableName: "OpcoesCatalogo",
      indexes: [{ unique: true, fields: ["catalogo", "codigo"] }],
    },
  );

  const AuditoriaConfiguracao = db.define(
    "AuditoriaConfiguracao",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ator_usuario_id: { type: DataTypes.INTEGER },
      tipo_alvo: { type: DataTypes.STRING, allowNull: false },
      alvo_chave: { type: DataTypes.STRING, allowNull: false },
      acao: { type: DataTypes.STRING, allowNull: false },
      valor_anterior_json: { type: DataTypes.TEXT },
      valor_novo_json: { type: DataTypes.TEXT },
      data_evento: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "AuditoriasConfiguracao",
    },
  );

  const ReportSyncQueue = db.define(
    "ReportSyncQueue",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      reportId: { type: DataTypes.STRING, allowNull: false },
      reportType: { type: DataTypes.STRING, allowNull: false },
      reportData: { type: DataTypes.JSON, allowNull: false },
      googleSheetRowId: { type: DataTypes.STRING },
      status: {
        type: DataTypes.ENUM("pending", "synced", "failed"),
        defaultValue: "pending",
        allowNull: false,
      },
      attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
      errorMessage: { type: DataTypes.TEXT },
      generatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      syncedAt: { type: DataTypes.DATE },
      deletedAt: { type: DataTypes.DATE },
    },
    {
      tableName: "ReportSyncQueues",
      indexes: [
        { fields: ["status", "createdAt"] },
        { fields: ["reportType", "createdAt"] },
      ],
    },
  );

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

  DiaOperacional.hasMany(TurnoOperacional, {
    foreignKey: "dia_operacional_id",
  });
  TurnoOperacional.belongsTo(DiaOperacional, {
    foreignKey: "dia_operacional_id",
  });
  DiaOperacional.belongsTo(Usuario, {
    as: "abertoPor",
    foreignKey: "aberto_por_usuario_id",
  });
  DiaOperacional.belongsTo(Usuario, {
    as: "fechadoPor",
    foreignKey: "fechado_por_usuario_id",
  });
  TurnoOperacional.belongsTo(Usuario, {
    as: "abertoPor",
    foreignKey: "aberto_por_usuario_id",
  });
  TurnoOperacional.belongsTo(Usuario, {
    as: "fechadoPor",
    foreignKey: "fechado_por_usuario_id",
  });

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
  AuditoriaUsuario.belongsTo(Usuario, {
    as: "ator",
    foreignKey: "ator_usuario_id",
  });
  AuditoriaUsuario.belongsTo(Usuario, {
    as: "usuarioAfetado",
    foreignKey: "usuario_afetado_id",
  });
  ConfiguracaoSistema.belongsTo(Usuario, {
    as: "atualizadoPorConfiguracao",
    foreignKey: "atualizado_por_usuario_id",
  });
  OpcaoCatalogo.belongsTo(Usuario, {
    as: "atualizadoPorOpcaoCatalogo",
    foreignKey: "atualizado_por_usuario_id",
  });
  AuditoriaConfiguracao.belongsTo(Usuario, {
    as: "atorConfiguracao",
    foreignKey: "ator_usuario_id",
  });

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
    ConfiguracaoSistema,
    OpcaoCatalogo,
    AuditoriaConfiguracao,
    ReportSyncQueue,
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

async function dropSqliteAlterBackupTables(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  const residualSuffixes = ['_backup', '_status_fix', '_normalized'];
  const residualTables = tables.flatMap((table) => {
    const name = typeof table === 'string' ? table : Object.values(table).find((v) => typeof v === 'string') || '';
    return residualSuffixes.some((s) => name.endsWith(s)) ? [name] : [];
  });

  for (const tableName of residualTables) {
    console.log(`[syncDB] Dropping residual table: "${tableName}"`);
    await db.query(`DROP TABLE IF EXISTS "${tableName}"`);
  }
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
    ["subtotal", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 }],
    ["imposto", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 }],
    ["valor_pago", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 }],
    ["troco", { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 }],
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
    const fieldNames = (index.fields || []).map(
      (field) => field.attribute || field.name,
    );

    return (
      index.name === VENDAS_INVOICE_INDEX ||
      (index.unique &&
        fieldNames.length === 1 &&
        fieldNames[0] === "numero_factura")
    );
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
    await recreatePartialStatusIndex(db, 'DiaOperacionals', DIA_OPERACIONAL_ONE_OPEN_INDEX);
  }

  if (hasOperationalShifts) {
    await recreatePartialStatusIndex(db, 'TurnoOperacionals', TURNO_OPERACIONAL_ONE_OPEN_INDEX);
  }
}

async function recreatePartialStatusIndex(db, tableName, indexName) {
  // Remove any full (non-partial) unique index on 'status' that could block closing shifts/days
  const conflictingIndexes = await db.query(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND name != ? AND sql IS NOT NULL`,
    { replacements: [tableName, indexName], type: db.QueryTypes.SELECT },
  );
  for (const idx of conflictingIndexes) {
    const sql = idx.sql || '';
    if (sql.includes('UNIQUE') && /\bstatus\b/.test(sql) && !sql.includes('WHERE')) {
      await db.query(`DROP INDEX IF EXISTS "${idx.name}"`);
    }
  }

  const rows = await db.query(
    `SELECT sql FROM sqlite_master WHERE type='index' AND name=?`,
    { replacements: [indexName], type: db.QueryTypes.SELECT },
  );
  const existingDef = rows[0]?.sql || '';
  const isCorrectPartial = existingDef.includes("WHERE") && existingDef.toLowerCase().includes("aberto");

  if (existingDef && !isCorrectPartial) {
    await db.query(`DROP INDEX IF EXISTS "${indexName}"`);
  }

  if (!existingDef || !isCorrectPartial) {
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ${indexName}
      ON ${tableName} (status)
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

async function repairDuplicateOpenOperationalRows(
  db,
  { hasOperationalDays, hasOperationalShifts },
) {
  let keptOpenDayId = null;

  if (hasOperationalDays) {
    const rows = await db.query(
      `
      SELECT id
      FROM DiaOperacionals
      WHERE status = 'Aberto'
      ORDER BY id DESC
      LIMIT 1
    `,
      { type: db.QueryTypes.SELECT },
    );

    keptOpenDayId = rows.length > 0 ? rows[0].id : null;

    if (keptOpenDayId !== null) {
      await closeOpenOperationalRows(
        db,
        "DiaOperacionals",
        `id <> ${Number(keptOpenDayId)}`,
      );
    }
  }

  if (!hasOperationalShifts) {
    return;
  }

  if (keptOpenDayId === null) {
    await closeOpenOperationalRows(db, "TurnoOperacionals", "1 = 1");
    return;
  }

  const rows = await db.query(
    `
    SELECT id
    FROM TurnoOperacionals
    WHERE status = 'Aberto'
      AND dia_operacional_id = ${Number(keptOpenDayId)}
    ORDER BY id DESC
    LIMIT 1
  `,
    { type: db.QueryTypes.SELECT },
  );
  const keptOpenShiftId = rows.length > 0 ? rows[0].id : null;

  if (keptOpenShiftId === null) {
    await closeOpenOperationalRows(
      db,
      "TurnoOperacionals",
      `dia_operacional_id <> ${Number(keptOpenDayId)}`,
    );
    return;
  }

  await closeOpenOperationalRows(
    db,
    "TurnoOperacionals",
    `dia_operacional_id <> ${Number(keptOpenDayId)} OR id <> ${Number(keptOpenShiftId)}`,
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
    const fieldNames = (index.fields || []).map(
      (field) => field.attribute || field.name,
    );

    return (
      index.name === PERFIL_PERMISSAO_UNIQUE_INDEX ||
      (index.unique &&
        fieldNames.length === 2 &&
        fieldNames.includes("perfil_id") &&
        fieldNames.includes("permissao_id"))
    );
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

  await queryInterface.addIndex(
    "PerfilPermissaos",
    ["perfil_id", "permissao_id"],
    {
      name: PERFIL_PERMISSAO_UNIQUE_INDEX,
      unique: true,
    },
  );
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
  const hasIndex = indexes.some(
    (index) => index.name === PERFIL_PERMISSAO_UNIQUE_INDEX,
  );
  const hasLegacyUniqueIndex = indexes.some(
    (index) => index.unique && index.name !== PERFIL_PERMISSAO_UNIQUE_INDEX,
  );

  if (hasIndex) {
    await queryInterface.removeIndex(
      "PerfilPermissaos",
      PERFIL_PERMISSAO_UNIQUE_INDEX,
    );
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
  await db.query(
    "ALTER TABLE PerfilPermissaos_normalized RENAME TO PerfilPermissaos",
  );
}

async function normalizeOpcaoCatalogoTableForSqliteAlter(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  if (!hasTable(tables, "OpcoesCatalogo")) {
    return;
  }

  const indexes = await queryInterface.showIndex("OpcoesCatalogo");
  const hasLegacyUniqueCatalogIndex = indexes.some((index) => {
    if (!index.unique) {
      return false;
    }

    const fieldNames = (index.fields || []).map(
      (field) => field.attribute || field.name,
    );

    return fieldNames.length === 1 && fieldNames[0] === "catalogo";
  });

  const tableInfo = await db.query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'OpcoesCatalogo'",
    { type: db.QueryTypes.SELECT },
  );
  const tableSql = tableInfo.length > 0 ? tableInfo[0].sql || "" : "";
  const columns = await queryInterface.describeTable("OpcoesCatalogo");
  const hasProblematicColumnUnique =
    /`?catalogo`?\s+[^,]*UNIQUE/i.test(tableSql) ||
    /`?codigo`?\s+[^,]*UNIQUE/i.test(tableSql) ||
    Boolean(columns.catalogo?.unique) ||
    Boolean(columns.codigo?.unique);

  if (!hasLegacyUniqueCatalogIndex && !hasProblematicColumnUnique) {
    return;
  }

  await db.query(`
    CREATE TABLE OpcoesCatalogo_normalized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      catalogo VARCHAR(255) NOT NULL,
      codigo VARCHAR(255) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      sistema TINYINT(1) NOT NULL DEFAULT 0,
      metadados_json TEXT NOT NULL DEFAULT '{}',
      versao INTEGER NOT NULL DEFAULT 1,
      atualizado_por_usuario_id INTEGER REFERENCES Usuarios(id),
      createdAt DATETIME NOT NULL,
      updatedAt DATETIME NOT NULL
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS opcoes_catalogo_catalogo_codigo
    ON OpcoesCatalogo_normalized (catalogo, codigo)
  `);

  await db.query(`
    INSERT INTO OpcoesCatalogo_normalized (
      id,
      catalogo,
      codigo,
      nome,
      ordem,
      ativo,
      sistema,
      metadados_json,
      versao,
      atualizado_por_usuario_id,
      createdAt,
      updatedAt
    )
    SELECT
      id,
      catalogo,
      codigo,
      nome,
      ordem,
      ativo,
      sistema,
      metadados_json,
      versao,
      atualizado_por_usuario_id,
      createdAt,
      updatedAt
    FROM OpcoesCatalogo
  `);

  await db.query("DROP TABLE OpcoesCatalogo");
  await db.query(
    "ALTER TABLE OpcoesCatalogo_normalized RENAME TO OpcoesCatalogo",
  );
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

    if (
      existingPermissionLinks === 0 ||
      profile.nome === ADMINISTRATOR_PROFILE
    ) {
      const permissions = await Permissao.findAll({
        where: { chave: profile.permissoes },
      });
      await PerfilPermissao.bulkCreate(
        permissions.map((permission) => ({
          perfil_id: perfil.id,
          permissao_id: permission.id,
        })),
        { ignoreDuplicates: true },
      );
    }

    if (profile.nome !== ADMINISTRATOR_PROFILE) {
      for (const permissionKey of AUTHENTICATED_BASELINE_PERMISSIONS) {
        const baselinePermission = await Permissao.findOne({
          where: { chave: permissionKey },
        });
        await PerfilPermissao.findOrCreate({
          where: { perfil_id: perfil.id, permissao_id: baselinePermission.id },
        });
      }
    }
  }

  await assignProfilesToExistingUsers();

  const userCount = await Usuario.count();
  if (userCount === 0) {
    const adminProfile = await Perfil.findOne({
      where: { nome: ADMINISTRATOR_PROFILE },
    });
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


async function normalizeOperationalTablesForSqliteAlter(db) {
  if (db.getDialect() !== 'sqlite') return;

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  // Map SQLite table name → Sequelize model name (as registered in db.models)
  const modelMap = {
    DiaOperacionals: 'DiaOperacional',
    TurnoOperacionals: 'TurnoOperacional',
  };

  for (const [tableName, modelName] of Object.entries(modelMap)) {
    if (!hasTable(tables, tableName)) continue;

    const [tableInfo] = await db.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
      { replacements: [tableName], type: db.QueryTypes.SELECT },
    );
    const tableSql = tableInfo?.sql || '';
    console.log(`[syncDB] ${tableName} DDL: ${tableSql}`);

    // 1) PRAGMA index_list: detect full UNIQUE on status column
    const indexList = await db.query(
      `PRAGMA index_list("${tableName}")`,
      { type: db.QueryTypes.SELECT },
    );

    let needsRebuild = false;
    for (const idx of indexList) {
      if (!idx.unique || idx.partial) continue;
      const idxInfo = await db.query(
        `PRAGMA index_info("${idx.name}")`,
        { type: db.QueryTypes.SELECT },
      );
      const cols = idxInfo.map((r) => String(r.name || '').toLowerCase());
      if (!cols.includes('status')) continue;

      if (idx.origin === 'c') {
        // Standalone CREATE INDEX — drop it without rebuilding the table
        console.log(`[syncDB] ${tableName}: dropping standalone full UNIQUE on status: "${idx.name}"`);
        await db.query(`DROP INDEX IF EXISTS "${idx.name}"`);
      } else {
        // Inline constraint in CREATE TABLE (origin='u') — table rebuild required
        console.log(`[syncDB] ${tableName}: inline UNIQUE on status (origin=${idx.origin}) — rebuild needed`);
        needsRebuild = true;
      }
    }

    // 2) If timestamps have 'Invalid date' default, sync({ alter: true }) will try to
    //    alter the table and may create a backup that inherits stale constraints.
    //    Rebuild now using Sequelize's own schema so the alter cycle is skipped entirely.
    if (!needsRebuild && tableSql.includes("'Invalid date'")) {
      console.log(`[syncDB] ${tableName}: 'Invalid date' timestamp default — rebuild needed`);
      needsRebuild = true;
    }

    if (!needsRebuild) {
      console.log(`[syncDB] ${tableName}: schema ok`);
      continue;
    }

    // Rebuild using createTableQuery so the resulting schema exactly matches what
    // sync({ alter: true }) expects — preventing a second alter cycle on next startup.
    const model = db.models[modelName];
    const tmpName = `${tableName}_normalized`;
    const processedAttrs = queryInterface.queryGenerator.attributesToSQL(model.rawAttributes);
    const createSql = queryInterface.queryGenerator.createTableQuery(tmpName, processedAttrs, {});

    const existingCols = await queryInterface.describeTable(tableName);
    const existingColSet = new Set(Object.keys(existingCols));
    const colsToTransfer = Object.keys(model.rawAttributes).filter((c) => existingColSet.has(c));
    const colsCsv = colsToTransfer.map((c) => `"${c}"`).join(', ');

    await db.query(`DROP TABLE IF EXISTS "${tmpName}"`);
    await db.query(createSql);
    await db.query(`INSERT INTO "${tmpName}" (${colsCsv}) SELECT ${colsCsv} FROM "${tableName}"`);
    await db.query(`DROP TABLE "${tableName}"`);
    await db.query(`ALTER TABLE "${tmpName}" RENAME TO "${tableName}"`);

    const [rebuilt] = await db.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`,
      { replacements: [tableName], type: db.QueryTypes.SELECT },
    );
    console.log(`[syncDB] ${tableName} rebuilt. New DDL: ${rebuilt?.sql}`);
  }
}

async function syncModels(db) {
  if (db.getDialect() !== "sqlite") {
    await db.sync({ alter: true });
    return;
  }

  await db.query("PRAGMA foreign_keys = OFF");
  try {
    await dropSqliteAlterBackupTables(db);
    // Drop partial UNIQUE indexes before sync. Sequelize's describeTable does not
    // check the partial flag, so it marks status.unique=true for partial indexes.
    // This causes changeColumn to generate a backup with status UNIQUE, which
    // then fails on INSERT when multiple Fechado rows exist. The indexes are
    // recreated by ensureSqliteOperationalOpenIndexes after sync completes.
    await db.query(`DROP INDEX IF EXISTS "${DIA_OPERACIONAL_ONE_OPEN_INDEX}"`);
    await db.query(`DROP INDEX IF EXISTS "${TURNO_OPERACIONAL_ONE_OPEN_INDEX}"`);
    await normalizeOperationalTablesForSqliteAlter(db);
    await normalizeOpcaoCatalogoTableForSqliteAlter(db);
    await normalizePerfilPermissaoTableForSqliteAlter(db);
    await db.sync({ alter: true });
  } finally {
    await db.query("PRAGMA foreign_keys = ON");
  }
}

async function ensureSqliteOperationalColumns(db) {
  if (db.getDialect() !== "sqlite") {
    return;
  }

  const queryInterface = db.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  const decimalZero = { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0, allowNull: true };
  const dateNullable = { type: DataTypes.DATE, allowNull: true };
  const textNullable = { type: DataTypes.TEXT, allowNull: true };
  const intNullable = { type: DataTypes.INTEGER, allowNull: true };

  const sharedFinancialColumns = [
    ["saldo_final_informado", decimalZero],
    ["total_vendas", decimalZero],
    ["total_despesas", decimalZero],
    ["total_perdas", decimalZero],
    ["diferenca_caixa", decimalZero],
    ["observacao_abertura", textNullable],
    ["observacao_fechamento", textNullable],
    ["fechado_por_usuario_id", intNullable],
    ["fechado_em", dateNullable],
  ];

  if (hasTable(tables, "DiaOperacionals")) {
    const columns = await queryInterface.describeTable("DiaOperacionals");
    for (const [name, definition] of sharedFinancialColumns) {
      if (!columns[name]) {
        await queryInterface.addColumn("DiaOperacionals", name, definition);
      }
    }
  }

  if (hasTable(tables, "TurnoOperacionals")) {
    const columns = await queryInterface.describeTable("TurnoOperacionals");
    const turnoColumns = [
      ...sharedFinancialColumns,
      ["aberto_por_usuario_id", intNullable],
    ];
    for (const [name, definition] of turnoColumns) {
      if (!columns[name]) {
        await queryInterface.addColumn("TurnoOperacionals", name, definition);
      }
    }
  }
}

async function syncDatabaseSchema(db) {
  await ensureSqliteVendasColumns(db);
  await ensureSqliteFinanceColumns(db);
  await ensureSqliteUsuarioSecurityColumns(db);
  await ensureSqliteOperationalColumns(db);
  await syncModels(db);
  await ensureVendasInvoiceIndex(db);
  await ensureSqliteOperationalOpenIndexes(db);
  await ensurePerfilPermissaoUniqueIndex(db);
  await seedPermissionsAndProfiles();
}

async function connectDB(app, env = "development") {
  if (env === "development" || env === "production") {
    sequelize = new Sequelize({
      dialect: "sqlite",
      storage: path.join(app.getPath("userData"), "database.sqlite"),
      logging: false,
    });
  } else {
    throw new Error(`Ambiente de banco de dados invalido: ${env}`);
  }

  models = defineModels(sequelize);

  try {
    await sequelize.authenticate();
    console.log("Conexão com o banco de dados estabelecida com sucesso.");
    return sequelize;
  } catch (error) {
    console.error("Nao foi possivel conectar ao banco de dados:", error);
    throw error;
  }
}

function getModels() {
  if (!models) {
    throw new Error(
      "Os models ainda nao foram inicializados. Chame connectDB primeiro.",
    );
  }

  return models;
}

module.exports = {
  connectDB,
  defineModels,
  getModels,
  syncDatabaseSchema,
  get sequelize() {
    return sequelize;
  },
};
