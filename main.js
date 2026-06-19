const { app, BrowserWindow } = require("electron");
const path = require("path");
const ipcHandlers = require("./src/backend/ipcHandlers");
const { connectDB, getModels, syncDatabaseSchema } = require("./src/backend/database");

let db = null;
let models = null;

async function initializeDatabase(electronApp) {
  db = await connectDB(electronApp, process.env.NODE_ENV || "development");
  models = getModels();
  // Sincronizar modelos com o banco de dados
  await syncDatabaseSchema(db); // Use { force: true } para recriar tabelas em desenvolvimento
  console.log("Modelos sincronizados com o banco de dados.");
}

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

app.whenReady().then(async () => {
  try {
    await initializeDatabase(app);
    await ipcHandlers.init({ db, ...models });
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
