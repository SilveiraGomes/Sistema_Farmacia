const { google } = require("googleapis");
const { net } = require("electron");
const { Op } = require("sequelize");
const { getModels } = require("../database");
const reportQueueService = require("./reportQueueService");

let syncScheduleTimeout = null;
let lastSyncTime = null;
let currentSyncConfig = null;

const SHEET_HEADERS = {
  venda_turno: ["data", "turno", "usuário", "valor-abertura", "vendas", "despesas", "baixas"],
  venda_dia: [
    "data", "total_entrada", "dinheiro", "tpa", "transferência", "credito",
    "total_despesa", "fornecedor", "serviços", "alimentação", "outros", "perdas",
  ],
  financeiro: ["data", "movimento", "descrição", "origem-destino", "valor", "status", "saldo_final"],
  estoque: ["data", "q_geral", "q_vendido", "q_reposto", "expirando", "baixo_estoque", "sem_estoque", "baixas"],
};

const DAILY_SHEETS = ["venda_turno", "venda_dia", "financeiro", "estoque"];

function getLocalDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayRange(date) {
  return {
    [Op.between]: [new Date(`${date}T00:00:00`), new Date(`${date}T23:59:59.999`)],
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normalizeCategory(cat) {
  return (cat || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

// venda_turno: one row per operational shift
async function generateVendaTurnoRows(date) {
  const { TurnoOperacional, DiaOperacional, Usuario } = getModels();
  const dia = await DiaOperacional.findOne({ where: { data_operacional: date } });
  if (!dia) return [];
  const turnos = await TurnoOperacional.findAll({
    where: { dia_operacional_id: dia.id },
    include: [{ model: Usuario, as: "abertoPor" }],
    order: [["id", "ASC"]],
  });
  return turnos.map((t) => [
    date,
    t.nome || "",
    t.abertoPor?.nome_completo || "",
    round2(t.saldo_inicial),
    round2(t.total_vendas),
    round2(t.total_despesas),
    round2(t.total_perdas),
  ]);
}

// venda_dia: one aggregate row for the operational day
async function generateVendaDiaRows(date) {
  const { DiaOperacional, Venda, TransacaoFinanceira } = getModels();
  const dia = await DiaOperacional.findOne({ where: { data_operacional: date } });
  if (!dia) return [];

  const vendas = await Venda.findAll({ where: { data_venda: dayRange(date) } });
  const pp = { dinheiro: 0, tpa: 0, transferencia: 0, credito: 0 };
  for (const v of vendas) {
    const m = (v.forma_pagamento || "").toLowerCase();
    if (m in pp) pp[m] += round2(v.total);
  }

  const despesas = await TransacaoFinanceira.findAll({
    where: { tipo: "expense", data_transacao: dayRange(date) },
  });
  let fornecedor = 0, servicos = 0, alimentacao = 0, outros = 0;
  for (const d of despesas) {
    const cat = normalizeCategory(d.categoria);
    if (cat === "fornecedores") fornecedor += round2(d.valor);
    else if (cat === "servicos") servicos += round2(d.valor);
    else if (cat === "alimentacao") alimentacao += round2(d.valor);
    else outros += round2(d.valor);
  }

  return [[
    date,
    round2(dia.total_vendas),
    round2(pp.dinheiro),
    round2(pp.tpa),
    round2(pp.transferencia),
    round2(pp.credito),
    round2(dia.total_despesas),
    round2(fornecedor),
    round2(servicos),
    round2(alimentacao),
    round2(outros),
    round2(dia.total_perdas),
  ]];
}

// financeiro: one row per financial transaction for the day
async function generateFinanceiroRows(date) {
  const { TransacaoFinanceira } = getModels();
  const transacoes = await TransacaoFinanceira.findAll({
    where: { data_transacao: dayRange(date) },
    order: [["data_transacao", "ASC"]],
  });
  const TIPO_LABEL = { revenue: "Receita", expense: "Despesa", loss: "Perda/Baixa" };
  let saldo = 0;
  return transacoes.map((t) => {
    const valor = round2(t.valor);
    if (t.tipo === "revenue") saldo += valor;
    else saldo -= valor;
    return [
      date,
      TIPO_LABEL[t.tipo] || t.tipo,
      t.descricao || "",
      t.origem || t.categoria || "",
      valor,
      t.status || "",
      round2(saldo),
    ];
  });
}

// estoque: one summary row per day
async function generateEstoqueRows(date) {
  const { Estoque, Produto, ItemVenda, Venda, TransacaoFinanceira } = getModels();

  const estoqueAll = await Estoque.findAll();
  const qGeral = estoqueAll.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);

  const itensVendidos = await ItemVenda.findAll({
    include: [{ model: Venda, where: { data_venda: dayRange(date) }, required: true }],
  });
  const qVendido = itensVendidos.reduce((s, iv) => s + (Number(iv.quantidade) || 0), 0);

  const reposicoes = await Estoque.findAll({ where: { data_entrada: dayRange(date) } });
  const qReposto = reposicoes.reduce((s, e) => s + (Number(e.quantidade) || 0), 0);

  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + 30);
  const expirando = await Estoque.count({
    where: { data_validade: { [Op.between]: [new Date(), expiryLimit] }, quantidade: { [Op.gt]: 0 } },
  });

  const produtos = await Produto.findAll({ include: [{ model: Estoque }] });
  let baixoEstoque = 0, semEstoque = 0;
  for (const p of produtos) {
    const qty = (p.Estoques || []).reduce((s, e) => s + (Number(e.quantidade) || 0), 0);
    if (qty === 0) semEstoque++;
    else if (qty < (Number(p.estoque_minimo) || 0)) baixoEstoque++;
  }

  const baixas = await TransacaoFinanceira.findAll({
    where: { tipo: "loss", data_transacao: dayRange(date) },
  });
  const totalBaixas = round2(baixas.reduce((s, b) => s + (Number(b.valor) || 0), 0));

  return [[date, qGeral, qVendido, qReposto, expirando, baixoEstoque, semEstoque, totalBaixas]];
}

function calculateNextSyncTime(targetHour = 21, targetMinute = 0) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetHour, targetMinute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function getDelayUntilNextSync(targetTime) {
  return Math.max(0, targetTime.getTime() - new Date().getTime());
}

async function checkConnectivity() {
  return new Promise((resolve) => {
    net
      .request("https://www.google.com")
      .on("response", () => resolve(true))
      .on("error", () => resolve(false))
      .end();
  });
}

async function authenticateWithGoogle(credentialsJson) {
  try {
    const credentials =
      typeof credentialsJson === "string" ? JSON.parse(credentialsJson) : credentialsJson;
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    return google.sheets({ version: "v4", auth });
  } catch (error) {
    throw new Error(`Falha ao autenticar com Google: ${error.message}`);
  }
}

async function ensureSheetHeaders(auth, spreadsheetId, sheetTitle) {
  const headers = SHEET_HEADERS[sheetTitle];
  if (!headers) return;
  try {
    const response = await auth.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!A1:A1`,
    });
    if (response.data.values && response.data.values.length > 0) return;
    await auth.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1`,
      valueInputOption: "RAW",
      resource: { values: [headers] },
    });
  } catch (error) {
    console.error(`Erro ao inicializar cabecalhos da sheet ${sheetTitle}:`, error.message);
  }
}

async function ensureSheetExists(auth, spreadsheetId, sheetTitle) {
  try {
    const response = await auth.spreadsheets.get({ spreadsheetId });
    const sheets = response.data.sheets || [];
    const exists = sheets.some((s) => s.properties?.title === sheetTitle);
    if (!exists) {
      await auth.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{ addSheet: { properties: { title: sheetTitle } } }],
        },
      });
    }
    await ensureSheetHeaders(auth, spreadsheetId, sheetTitle);
    return true;
  } catch (error) {
    console.error(`Erro ao criar/verificar sheet ${sheetTitle}:`, error.message);
    return false;
  }
}

async function appendRowsToSheet(auth, spreadsheetId, sheetTitle, rows) {
  if (!rows || rows.length === 0) return 0;
  await auth.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:Z`,
    valueInputOption: "USER_ENTERED",
    resource: { values: rows },
  });
  return rows.length;
}

async function syncNow(syncConfig) {
  const config = syncConfig || currentSyncConfig;
  const startTime = Date.now();

  try {
    const isOnline = await checkConnectivity();
    if (!isOnline) throw new Error("Sistema offline. Sincronizacao foi cancelada.");

    if (!config || !config.credentials || !config.spreadsheetId) {
      throw new Error("Google Sheets nao configurado. Verifique as configuracoes do sistema.");
    }

    const auth = await authenticateWithGoogle(config.credentials);
    const date = getLocalDate();

    for (const sheetTitle of DAILY_SHEETS) {
      await ensureSheetExists(auth, config.spreadsheetId, sheetTitle);
    }

    const GENERATORS = {
      venda_turno: () => generateVendaTurnoRows(date),
      venda_dia: () => generateVendaDiaRows(date),
      financeiro: () => generateFinanceiroRows(date),
      estoque: () => generateEstoqueRows(date),
    };

    let totalSynced = 0;
    let totalFailed = 0;
    const sheetResults = {};

    for (const [sheetTitle, generate] of Object.entries(GENERATORS)) {
      try {
        const rows = await generate();
        const count = await appendRowsToSheet(auth, config.spreadsheetId, sheetTitle, rows);
        sheetResults[sheetTitle] = { rows: count };
        totalSynced += count;
      } catch (error) {
        console.error(`Erro ao sincronizar ${sheetTitle}:`, error.message);
        sheetResults[sheetTitle] = { error: error.message };
        totalFailed++;
      }
    }

    await reportQueueService.cleanupOldReports(config.retentionDays || 90);
    lastSyncTime = new Date();

    return {
      success: totalFailed === 0,
      message: `Sincronizacao concluida: ${totalSynced} linha(s) enviada(s), ${totalFailed} sheet(s) com falha.`,
      duration: Date.now() - startTime,
      synced: totalSynced,
      failed: totalFailed,
      sheets: sheetResults,
      timestamp: lastSyncTime.toISOString(),
    };
  } catch (error) {
    console.error("Erro durante sincronizacao:", error);
    return {
      success: false,
      message: error.message,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

function scheduleNextSync(syncConfig) {
  if (syncScheduleTimeout) clearTimeout(syncScheduleTimeout);

  const targetHour = parseInt(syncConfig.syncTime?.split(":")[0] || "21", 10);
  const targetMinute = parseInt(syncConfig.syncTime?.split(":")[1] || "0", 10);
  const nextSync = calculateNextSyncTime(targetHour, targetMinute);
  const delay = getDelayUntilNextSync(nextSync);

  console.log(`Proxima sincronizacao agendada para ${nextSync.toLocaleString()}`);

  syncScheduleTimeout = setTimeout(async () => {
    try {
      await syncNow(syncConfig);
    } catch (error) {
      console.error("Erro na sincronizacao agendada:", error);
    }
    scheduleNextSync(syncConfig);
  }, delay);
}

async function getSyncStatus() {
  const queueStatus = await reportQueueService.getQueueStatus();
  return {
    ...queueStatus,
    lastSync: lastSyncTime?.toISOString() || null,
  };
}

async function initializeSyncScheduler(app, syncConfig) {
  if (!syncConfig || !syncConfig.syncEnabled) {
    console.log("Sincronizacao de relatorios desativada.");
    return;
  }
  currentSyncConfig = syncConfig;
  console.log("Inicializando agendamento de sincronizacao de relatorios...");
  scheduleNextSync(syncConfig);
}

function stopSyncScheduler() {
  if (syncScheduleTimeout) {
    clearTimeout(syncScheduleTimeout);
    syncScheduleTimeout = null;
  }
}

module.exports = {
  initializeSyncScheduler,
  syncNow,
  stopSyncScheduler,
  getSyncStatus,
  checkConnectivity,
  calculateNextSyncTime,
};
