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
const { setupAutoUpdateService } = require("./src/backend/services/updateService");
const { createCentralLicenseClient } = require("./src/backend/licensing/centralLicenseClient");
const { createCentralLicenseService } = require("./src/backend/licensing/centralLicenseService");
const { createCentralLicenseStore } = require("./src/backend/licensing/centralLicenseStore");
const { createMachineFingerprint } = require("./src/backend/licensing/machineFingerprint");
const { verifyCentralLicenseBundle } = require("./src/backend/licensing/centralLicenseVerifier");
const { verifySupportAccessBundle } = require("./src/backend/licensing/supportAccessVerifier");

const RELAUNCH_FLAG = "--kil-relaunch";

let db = null;
let models = null;
let mainWindow = null;
let splashWindow = null;
let splashStatus = "A iniciar o sistema...";
let licenseService = null;
let restoreOutcome = null;
let restartScheduled = false;
let stopAutoUpdateService = () => {};

// ── Ecrã de carregamento ──────────────────────────────────────────────────────

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    title: "KILSYSTEM PHARMACY",
    backgroundColor: "#0b4a22",
    icon: path.join(__dirname, "resources", "icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  splashWindow.once("ready-to-show", () => splashWindow?.show());
  splashWindow.webContents.on("did-finish-load", () => setSplashStatus(splashStatus));
  splashWindow.on("closed", () => { splashWindow = null; });
  splashWindow.loadFile(path.join(__dirname, "resources", "splash.html"), {
    query: { version: app.getVersion() },
  });
}

function setSplashStatus(text) {
  splashStatus = text;
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)})`)
    .catch(() => {});
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
}

// ── Instância única e reinício ────────────────────────────────────────────────

async function acquireSingleInstanceLock() {
  // Depois de um reinício pedido pelo sistema, a instância anterior pode ainda
  // estar a terminar; espera alguns segundos antes de desistir.
  const attempts = process.argv.includes(RELAUNCH_FLAG) ? 30 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (app.requestSingleInstanceLock()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function focusExistingWindow() {
  const win = mainWindow || splashWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function restartApplication({ delayMs = 0 } = {}) {
  if (restartScheduled) return;
  restartScheduled = true;
  setTimeout(() => {
    const args = process.argv.slice(1).filter((arg) => arg !== RELAUNCH_FLAG);
    app.relaunch({ args: [...args, RELAUNCH_FLAG] });
    app.quit();
  }, delayMs);
}

function initializeLicenseService(electronApp) {
  try {
    const publicKeyPath = process.env.KILSYSTEM_LICENSE_PUBLIC_KEY_PATH ||
      path.join(__dirname, "resources", "license-public.pem");
    const publicKey = fs.readFileSync(publicKeyPath, "utf8");
    licenseService = createCentralLicenseService({
      client: createCentralLicenseClient(),
      store: createCentralLicenseStore({
        directory: path.join(electronApp.getPath("userData"), "license"),
        safeStorage,
      }),
      publicKey,
      machineFingerprint: createMachineFingerprint,
      verifyBundle: verifyCentralLicenseBundle,
      verifySupportBundle: verifySupportAccessBundle,
      appVersion: electronApp.getVersion(),
      diagnostic: (error) => console.error("Falha de licenciamento:", error?.message),
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
      redeemSupportAccess: unavailable,
      machineId: () => "",
      assertWriteAllowed: unavailable,
    };
  }
  return licenseService;
}

async function openDatabase(electronApp) {
  db = await connectDB(electronApp, electronApp.isPackaged ? "production" : "development");
  models = getModels();
  // Sincronizar modelos com o banco de dados
  await syncDatabaseSchema(db); // Use { force: true } para recriar tabelas em desenvolvimento
}

async function initializeDatabase(electronApp) {
  let pendingRestore = null;
  try {
    pendingRestore = backupService.applyPendingRestore(electronApp);
  } catch (error) {
    console.error("Não foi possível aplicar o backup pendente:", error);
    restoreOutcome = { ok: false };
  }

  if (pendingRestore) setSplashStatus("A restaurar o backup...");
  try {
    await openDatabase(electronApp);
    if (pendingRestore) {
      const summary = await backupService.finalizePendingRestore(electronApp, pendingRestore);
      restoreOutcome = { ok: true, ...summary };
    }
  } catch (error) {
    if (!pendingRestore) throw error;
    console.error("Falha ao concluir a restauração; a repor a base anterior:", error);
    await db?.close().catch(() => {});
    backupService.rollbackPendingRestore(electronApp, pendingRestore);
    restoreOutcome = { ok: false, backup: pendingRestore.meta?.sourceName || null };
    await openDatabase(electronApp);
  }

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

function showRestoreOutcome() {
  if (!restoreOutcome || !mainWindow) return;
  const outcome = restoreOutcome;
  restoreOutcome = null;
  const backupLabel = outcome.backup ? ` «${outcome.backup}»` : "";
  const options = outcome.ok
    ? {
        type: "info",
        title: "Backup restaurado",
        message: `Backup${backupLabel} restaurado com sucesso.`,
        detail: "As contas de utilizador actuais foram mantidas. Entre com o seu utilizador e senha habituais.",
      }
    : {
        type: "error",
        title: "Restauração não concluída",
        message: `Não foi possível restaurar o backup${backupLabel}.`,
        detail: "A base de dados anterior foi mantida sem alterações.",
      };
  dialog.showMessageBox(mainWindow, { ...options, buttons: ["OK"] }).catch(() => {});
}

function createWindow(startFullscreen = true) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    fullscreen: startFullscreen,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "resources", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  let revealed = false;
  const reveal = () => {
    if (revealed || !mainWindow) return;
    revealed = true;
    mainWindow.show();
    mainWindow.focus();
    closeSplashWindow();
    showRestoreOutcome();
  };
  mainWindow.once("ready-to-show", reveal);
  setTimeout(reveal, 20_000);

  mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

Menu.setApplicationMenu(null);

app.on("second-instance", focusExistingWindow);

app.whenReady().then(async () => {
  if (!(await acquireSingleInstanceLock())) {
    app.quit();
    return;
  }

  try {
    createSplashWindow();
    setSplashStatus("A verificar a licença...");
    initializeLicenseService(app);
    setSplashStatus("A preparar a base de dados...");
    await initializeDatabase(app);
    setSplashStatus("A carregar as configurações...");
    await ipcHandlers.init(
      { db, ...models },
      {
        electronApp: app,
        getMainWindow: () => mainWindow,
        licenseService,
        restartApp: restartApplication,
      },
    );
    await initializeReportSyncService(app);
    await initializeBackupService(app);
    await initializeSessionTimeout();

    setSplashStatus("A abrir o sistema...");
    const startFullscreen = await readStartFullscreen();
    createWindow(startFullscreen);
    licenseService.onStateChanged?.((state) => {
      mainWindow?.webContents?.send("license:state-changed", state);
    });
    licenseService.startScheduler?.();
    stopAutoUpdateService = setupAutoUpdateService({
      app,
      autoUpdater,
      dialog,
      getMainWindow: () => mainWindow,
    });

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
    closeSplashWindow();
    dialog.showErrorBox(
      "KILSYSTEM PHARMACY",
      "Não foi possível iniciar o sistema. Feche e volte a abrir a aplicação; se o problema persistir contacte o suporte KIL SYSTEM.",
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  stopAutoUpdateService();
  licenseService?.stopScheduler?.();
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
