const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const host = "127.0.0.1";
const port = 5173;
const url = `http://${host}:${port}/`;

function isServerReady() {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      if (await isServerReady()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Servidor Vite nao respondeu em ${url}`));
        return;
      }

      setTimeout(check, 300);
    };

    check();
  });
}

function openBrowser() {
  const opener = spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  opener.unref();
}

async function main() {
  if (await isServerReady()) {
    console.log(`Servidor ja esta rodando em ${url}`);
    openBrowser();
    console.log("Pressione Ctrl+C para encerrar este comando.");
    setInterval(() => {}, 1000);
    return;
  }

  const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
  const vite = spawn(process.execPath, [viteBin, "--host", host, "--port", String(port), "--strictPort"], {
    stdio: "inherit",
    windowsHide: false,
  });

  process.on("SIGINT", () => vite.kill("SIGINT"));
  process.on("SIGTERM", () => vite.kill("SIGTERM"));

  vite.on("close", (code) => {
    process.exit(code ?? 0);
  });

  await waitForServer();
  openBrowser();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
