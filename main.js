const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const ipcHandlers = require("./src/backend/ipcHandlers");
const {
  connectDB,
  getModels,
  syncDatabaseSchema,
} = require("./src/backend/database");
const reportSyncService = require("./src/backend/services/reportSyncService");

let db = null;
let models = null;

async function initializeDatabase(electronApp) {
  db = await connectDB(electronApp, process.env.NODE_ENV || "development");
  models = getModels();
  // Sincronizar modelos com o banco de dados
  await syncDatabaseSchema(db); // Use { force: true } para recriar tabelas em desenvolvimento
  console.log("Modelos sincronizados com o banco de dados.");
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "resources", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

Menu.setApplicationMenu(null);

app.whenReady().then(async () => {
  try {
    await initializeDatabase(app);
    await ipcHandlers.init({ db, ...models }, { electronApp: app });
    await initializeReportSyncService(app);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
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
