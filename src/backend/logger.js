// Registo de diagnóstico em ficheiro: <userData>/logs/kilsystem-AAAA-MM-DD.log.
// Duplica as mensagens da consola do processo principal, regista erros não
// tratados e erros da interface, e mantém apenas os últimos dias.
const fs = require("fs");
const path = require("path");
const util = require("util");

const RETENTION_DAYS = 14;
const LEVELS = { log: "INFO", info: "INFO", warn: "AVISO", error: "ERRO" };

let logDir = null;
let installed = false;

function pad(n) { return String(n).padStart(2, "0"); }

function currentLogFile(now = new Date()) {
  return path.join(logDir, `kilsystem-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.log`);
}

function formatArgs(args) {
  return args.map((arg) => (arg instanceof Error
    ? `${arg.message}\n${arg.stack || ""}`
    : typeof arg === "string" ? arg : util.inspect(arg, { depth: 4, breakLength: 160 }))).join(" ");
}

function writeLine(level, args) {
  if (!logDir) return;
  try {
    fs.appendFileSync(currentLogFile(), `${new Date().toISOString()} [${level}] ${formatArgs(args)}\n`, "utf8");
  } catch { /* o registo nunca pode impedir o sistema de funcionar */ }
}

function pruneOldLogs(now = Date.now()) {
  try {
    for (const name of fs.readdirSync(logDir)) {
      if (!/^kilsystem-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
      const file = path.join(logDir, name);
      if (now - fs.statSync(file).mtimeMs > RETENTION_DAYS * 24 * 60 * 60 * 1000) fs.unlinkSync(file);
    }
  } catch { /* ignorar */ }
}

function initLogger(userDataPath, { appVersion = "" } = {}) {
  logDir = path.join(userDataPath, "logs");
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignorar */ }
  pruneOldLogs();
  if (installed) return logDir;
  installed = true;

  for (const method of Object.keys(LEVELS)) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      writeLine(LEVELS[method], args);
      original(...args);
    };
  }
  // "Monitor" regista sem alterar o comportamento por omissão do Electron.
  process.on("uncaughtExceptionMonitor", (error) => writeLine("FATAL", ["Erro não tratado:", error]));
  process.on("unhandledRejection", (reason) => writeLine("ERRO", ["Promessa rejeitada sem tratamento:", reason]));

  writeLine("INFO", [`=== KILSYSTEM PHARMACY ${appVersion} a iniciar (${process.platform} ${process.arch}) ===`]);
  return logDir;
}

// Erros da interface (renderer) e falhas da janela.
function attachWindowLogging(window, label = "janela") {
  const contents = window?.webContents;
  if (!contents) return;
  contents.on("console-message", (...eventArgs) => {
    // Electron >= 35 passa um objecto de detalhes; versões anteriores passam argumentos soltos.
    const details = eventArgs[0] && typeof eventArgs[0] === "object" && "message" in eventArgs[0] ? eventArgs[0] : null;
    const level = details ? details.level : eventArgs[1];
    const message = details ? details.message : eventArgs[2];
    const source = details ? `${details.sourceId || ""}:${details.lineNumber ?? ""}` : `${eventArgs[4] || ""}:${eventArgs[3] ?? ""}`;
    const isError = level === "error" || level === 3;
    const isWarning = level === "warning" || level === 2;
    if (isError || isWarning) writeLine(isError ? "ERRO" : "AVISO", [`[${label}] ${message} (${source})`]);
  });
  contents.on("render-process-gone", (_event, details) => {
    writeLine("FATAL", [`[${label}] processo da interface terminou: ${details?.reason} (código ${details?.exitCode})`]);
  });
  contents.on("preload-error", (_event, preloadPath, error) => {
    writeLine("ERRO", [`[${label}] erro no preload ${preloadPath}:`, error]);
  });
}

function getLogDirectory() {
  return logDir;
}

module.exports = { initLogger, attachWindowLogging, getLogDirectory, pruneOldLogs };
