const { app, BrowserWindow, Menu, globalShortcut } = require("electron");
const path = require("path");

// Must run before app.ready() so userData path uses the correct app name.
// In dev, app.getName() = "kilsystem-pharmacy" (from package.json name).
// In production (packaged), force productName so userData is separate.
if (app.isPackaged) {
  app.setName("KILSYSTEM PHARMACY");
}
const ipcHandlers = require("./src/backend/ipcHandlers");
const {
  connectDB,
  getModels,
  syncDatabaseSchema,
} = require("./src/backend/database");
const reportSyncService = require("./src/backend/services/reportSyncService");
const backupService = require("./src/backend/services/backupService");
const authService = require("./src/backend/services/authService");
const heldSalesService = require("./src/backend/services/heldSalesService");

let db = null;
let models = null;
let mainWindow = null;

async function initializeDatabase(electronApp) {
  db = await connectDB(electronApp, electronApp.isPackaged ? "production" : "development");
  models = getModels();
  // Sincronizar modelos com o banco de dados
  await syncDatabaseSchema(db); // Use { force: true } para recriar tabelas em desenvolvimento
  await heldSalesService.clear();
  console.log("Modelos sincronizados com o banco de dados.");
}

async function initializeSessionTimeout() {
  try {
    const { ConfiguracaoSistema } = getModels();
    const row = await ConfiguracaoSistema.findOne({ where: { chave: "alerts.sessionTimeoutMinutes" } });
    const minutes = row ? JSON.parse(row.valor_json) : 30;
    authService.setSessionTimeout(Number(minutes) || 30);
  } catch { /* use default 30 min */ }
}

async function initializeBackupService(electronApp) {
  try {
    const { ConfiguracaoSistema } = getModels();
    let config = { intervalHours: 24, keepCount: 10 };
    try {
      const row = await ConfiguracaoSistema.findOne({ where: { chave: "backup.auto" } });
      if (row) config = { ...config, ...JSON.parse(row.valor_json) };
    } catch { /* use defaults */ }
    await backupService.initializeBackupScheduler(electronApp, config);
    console.log("Serviço de backup inicializado.");
  } catch (error) {
    console.error("Erro ao inicializar backup:", error);
  }
}

async function initializeReportSyncService(electronApp) {
  try {
    const { ConfiguracaoSistema } = getModels();
    let syncConfig = null;
    try {
      const row = await ConfiguracaoSistema.findOne({ where: { chave: "reports.googleSheets" } });
      if (row) syncConfig = JSON.parse(row.valor_json);
    } catch {
      syncConfig = null;
    }
    if (!syncConfig) {
      syncConfig = {
        syncEnabled: true,
        syncTime: "21:00",
        reportTypes: ["venda_turno", "venda_dia", "financeiro", "estoque"],
        retentionDays: 90,
        spreadsheetId: "",
        credentials: "",
      };
    }
    await reportSyncService.initializeSyncScheduler(electronApp, syncConfig);
    console.log("Serviço de sincronização de relatórios inicializado.");
  } catch (error) {
    console.error("Erro ao inicializar serviço de sincronização:", error);
  }
}

async function readStartFullscreen() {
  try {
    const { ConfiguracaoSistema } = getModels();
    const row = await ConfiguracaoSistema.findOne({ where: { chave: "appearance.startFullscreen" } });
    if (row) {
      const parsed = JSON.parse(row.valor_json);
      return typeof parsed === "boolean" ? parsed : true;
    }
  } catch {
    // ignore — use default
  }
  return true;
}

function createWindow(startFullscreen = true) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: startFullscreen,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "resources", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  try {
    await initializeDatabase(app);
    await ipcHandlers.init({ db, ...models }, { electronApp: app, getMainWindow: () => mainWindow });
    await initializeReportSyncService(app);
    await initializeBackupService(app);
    await initializeSessionTimeout();

    const startFullscreen = await readStartFullscreen();
    createWindow(startFullscreen);

    globalShortcut.register("F11", () => {
      if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(startFullscreen);
      }
    });
  } catch (error) {
    console.error("Erro ao inicializar a aplicacao:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  heldSalesService.clear().catch((error) => {
    console.error("Erro ao limpar clientes em espera:", error);
  });
  globalShortcut.unregisterAll();
});
