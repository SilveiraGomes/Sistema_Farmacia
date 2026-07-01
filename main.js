const { app, BrowserWindow, Menu, dialog, globalShortcut, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
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
const { createLicenseClient } = require("./src/backend/licensing/licenseClient");
const { createLicenseService } = require("./src/backend/licensing/licenseService");
const { createLicenseStore } = require("./src/backend/licensing/licenseStore");
const { createMachineFingerprint } = require("./src/backend/licensing/machineFingerprint");
const { verifyLicenseDocument } = require("./src/backend/licensing/licenseVerifier");

let db = null;
let models = null;
let mainWindow = null;
let licenseService = null;

function initializeLicenseService(electronApp) {
  try {
    const publicKeyPath = process.env.KILSYSTEM_LICENSE_PUBLIC_KEY_PATH ||
      path.join(__dirname, "resources", "license-public.pem");
    const publicKey = fs.readFileSync(publicKeyPath, "utf8");
    licenseService = createLicenseService({
      client: createLicenseClient(),
      store: createLicenseStore({
        directory: path.join(electronApp.getPath("userData"), "license"),
        safeStorage,
      }),
      publicKey,
      machineFingerprint: createMachineFingerprint,
      verifyDocument: verifyLicenseDocument,
    });
    licenseService.status();
  } catch (error) {
    console.error("Licenciamento não configurado:", error?.message);
    const unavailable = () => {
      const failure = new Error("Serviço de licenças não configurado.");
      failure.code = "LICENSE_UNAVAILABLE";
      throw failure;
    };
    licenseService = {
      status: () => ({ state: "configuration_error", canWrite: false, readOnly: true }),
      activate: unavailable,
      validate: unavailable,
      machineId: () => "",
      assertWriteAllowed: unavailable,
    };
  }
  return licenseService;
}

async function initializeDatabase(electronApp) {
  db = await connectDB(electronApp, electronApp.isPackaged ? "production" : "development");
  models = getModels();
  // Sincronizar modelos com o banco de dados
  await syncDatabaseSchema(db); // Use { force: true } para recriar tabelas em desenvolvimento
  if (licenseService?.status()?.canWrite === true) {
    await heldSalesService.clear();
  }
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

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Actualização disponível",
      message: "Uma nova versão do KILSYSTEM PHARMACY foi transferida.",
      detail: "Reinicie a aplicação para instalar a actualização.",
      buttons: ["Reiniciar agora", "Mais tarde"],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    }).catch(() => {});
  });
  autoUpdater.checkForUpdates().catch(() => {});
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
    initializeLicenseService(app);
    await initializeDatabase(app);
    await ipcHandlers.init(
      { db, ...models },
      { electronApp: app, getMainWindow: () => mainWindow, licenseService },
    );
    await initializeReportSyncService(app);
    await initializeBackupService(app);
    await initializeSessionTimeout();

    const startFullscreen = await readStartFullscreen();
    createWindow(startFullscreen);
    setupAutoUpdater();

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
  try {
    if (licenseService?.status()?.canWrite === true) {
      heldSalesService.clear().catch((error) => {
        console.error("Erro ao limpar clientes em espera:", error);
      });
    }
  } catch (error) {
    console.error("Licença indisponível durante encerramento:", error?.message);
  }
  globalShortcut.unregisterAll();
});
