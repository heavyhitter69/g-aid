const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");
const { spawn } = require("child_process");
const workspaceFs = require("./workspace-fs");

const PROTOCOL = "gaid";
const PRODUCTION_PORT = 47821;
const dev = !app.isPackaged;
const hostname = "localhost";

app.setName("G-AID");
app.setAppUserModelId("com.geophysics.gaid");

if (dev) {
  app.setAsDefaultProtocolClient(
    PROTOCOL,
    process.execPath,
    [path.resolve(process.argv[1])]
  );
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

let mainWindow;
const extraWindows = [];
let pythonProcess = null;
let ollamaProcess = null;
let authBaseUrl = process.env.GAID_AUTH_URL || "";
let pendingAuthUrl = null;
let serverPort = PRODUCTION_PORT;

function browserWindowOptions() {
  return {
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "G-AID",
    backgroundColor: "#0b0b0b",
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#181818",
      symbolColor: "#cccccc",
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: iconPath(),
    show: true,
  };
}

function trackExtraWindow(win) {
  extraWindows.push(win);
  win.on("closed", () => {
    const index = extraWindows.indexOf(win);
    if (index >= 0) extraWindows.splice(index, 1);
  });
}

async function openAuxWindow(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/workspace")) return;
  if (!serverPort) return;

  const win = new BrowserWindow(browserWindowOptions());
  trackExtraWindow(win);
  const url = `http://${hostname}:${serverPort}${pathname}`;
  log("Opening auxiliary window:", url);
  await win.loadURL(url);
  win.show();
  win.focus();
}

function logPath() {
  try {
    return path.join(app.getPath("userData"), "main.log");
  } catch {
    return path.join(app.getPath("temp"), "g-aid-main.log");
  }
}

function log(...args) {
  const text = args
    .map((value) => {
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");
  const line = `[${new Date().toISOString()}] ${text}\n`;
  console.log(...args);
  try {
    fs.appendFileSync(logPath(), line);
  } catch {
    /* ignore log write failures */
  }
}

function showFatal(title, err) {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  log("FATAL", title, message);
  dialog.showErrorBox(title, `${message}\n\nLog: ${logPath()}`);
}

function isProtocolUrl(value) {
  return typeof value === "string" && value.toLowerCase().startsWith(`${PROTOCOL}://`);
}

function collectProtocolUrl(argv = []) {
  return argv.find((arg) => isProtocolUrl(arg)) || null;
}

function getOpenedFilePath(argv = process.argv) {
  const args = argv.slice(dev ? 2 : 1);
  return (
    args.find(
      (arg) =>
        typeof arg === "string" &&
        !arg.startsWith("-") &&
        !arg.startsWith("--") &&
        !isProtocolUrl(arg)
    ) || null
  );
}

function sendAuthUrl(url) {
  if (!url) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gaid-auth", url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    pendingAuthUrl = null;
  } else {
    pendingAuthUrl = url;
  }
}

function spawnHidden(exePath, args, extraEnv = {}) {
  log("spawn", exePath, args.join(" "));
  const child = spawn(exePath, args, {
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
  });
  child.stdout.on("data", (data) => log(`[${path.basename(exePath)}]`, String(data).trim()));
  child.stderr.on("data", (data) => log(`[${path.basename(exePath)} err]`, String(data).trim()));
  child.on("error", (err) => log("spawn error", exePath, err));
  child.on("exit", (code, signal) => log("exit", exePath, "code", code, "signal", signal));
  return child;
}

function startPythonBackend() {
  if (dev) {
    log("Dev mode: assuming Python backend is handled by concurrently");
    return;
  }
  if (pythonProcess && !pythonProcess.killed) return;

  const enginePath = path.join(process.resourcesPath, "g-aid-engine", "g-aid-engine.exe");
  if (!fs.existsSync(enginePath)) {
    log("Python engine missing:", enginePath);
    return;
  }
  pythonProcess = spawnHidden(enginePath, []);
}

function startOllamaDaemon() {
  if (dev) {
    log("Dev mode: assuming Ollama is already running on host system");
    return;
  }
  if (ollamaProcess && !ollamaProcess.killed) return;

  const ollamaDir = path.join(process.resourcesPath, "ai");
  const ollamaPath = path.join(ollamaDir, "ollama.exe");
  const modelsPath = path.join(ollamaDir, "models");
  if (!fs.existsSync(ollamaPath)) {
    log("Ollama missing:", ollamaPath);
    return;
  }
  ollamaProcess = spawnHidden(ollamaPath, ["serve"], {
    OLLAMA_MODELS: modelsPath,
    OLLAMA_HOST: "127.0.0.1:11434",
    OLLAMA_LIBRARY_PATH: ollamaDir,
  });
}

function listenOnPort(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address().port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, hostname);
  });
}

function iconPath() {
  const packaged = path.join(process.resourcesPath, "app", "build", "icon.ico");
  const asarSibling = path.join(__dirname, "..", "build", "icon.ico");
  if (fs.existsSync(asarSibling)) return asarSibling;
  if (fs.existsSync(packaged)) return packaged;
  return undefined;
}

function splashLogoSrc() {
  const candidates = [
    path.join(__dirname, "..", "public", "app-icon.png"),
    path.join(app.getAppPath(), "public", "app-icon.png"),
    path.join(__dirname, "..", "build", "icon.png"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

async function fadeSplashThenLoad(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.webContents.executeJavaScript(`
      (() => new Promise((resolve) => {
        const wrap = document.getElementById("wrap");
        const logo = document.querySelector(".logo");
        const finish = () => {
          if (logo) logo.style.animation = "none";
          if (wrap) {
            wrap.style.transition = "opacity 480ms ease";
            wrap.style.opacity = "0";
          }
          document.documentElement.style.background = "#0b0b0b";
          document.body.style.background = "#0b0b0b";
          setTimeout(resolve, 500);
        };
        if (wrap && wrap.classList.contains("ready")) {
          finish();
          return;
        }
        const poll = setInterval(() => {
          if (wrap && wrap.classList.contains("ready")) {
            clearInterval(poll);
            finish();
          }
        }, 40);
        setTimeout(() => {
          clearInterval(poll);
          finish();
        }, 2200);
      }))()
    `);
  } catch (err) {
    log("Splash fade skipped", err);
  }
  await mainWindow.loadURL(url);
}

function splashHtml() {
  const logo = splashLogoSrc();
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>G-AID</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0b0b0b; color: #9fe8d0;
        font-family: "Segoe UI", sans-serif; display: flex; align-items: center; justify-content: center; }
      .wrap { text-align: center; opacity: 0.55; transition: opacity 0.7s ease; }
      .wrap.ready { opacity: 1; }
      .logo { width: 72px; height: 72px; border-radius: 16px; display: ${logo ? "block" : "none"};
        margin: 0 auto; animation: pulse 1.7s ease-in-out infinite; will-change: transform, opacity; }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.72; }
        50% { transform: scale(1.07); opacity: 1; }
      }
      .word { font-size: 28px; letter-spacing: 0.18em; margin: 20px 0 0; min-height: 1.2em; font-weight: 400; }
      .caret { display: inline-block; width: 2px; height: 0.9em; margin-left: 3px; background: #9fe8d0;
        vertical-align: -2px; animation: blink 0.9s step-end infinite; }
      @keyframes blink { 50% { opacity: 0; } }
    </style>
  </head>
  <body>
    <div class="wrap" id="wrap">
      ${logo ? `<img class="logo" src="${logo}" alt="" />` : ""}
      <div class="word"><span id="typed"></span><span class="caret" id="caret"></span></div>
    </div>
    <script>
      (function () {
        var word = "G-AID";
        var i = 0;
        var typed = document.getElementById("typed");
        var caret = document.getElementById("caret");
        var wrap = document.getElementById("wrap");
        function tick() {
          if (i < word.length) {
            i += 1;
            typed.textContent = word.slice(0, i);
            setTimeout(tick, 150);
          } else if (caret) {
            caret.remove();
            wrap.classList.add("ready");
          }
        }
        setTimeout(tick, 280);
      })();
    </script>
  </body>
</html>`;
}

async function createWindow() {
  mainWindow = new BrowserWindow(browserWindowOptions());

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
  mainWindow.show();
  mainWindow.focus();

  const next = require("next");
  const nextApp = next({
    dev,
    hostname,
    port: dev ? 0 : PRODUCTION_PORT,
    dir: app.getAppPath(),
  });
  const handle = nextApp.getRequestHandler();

  log("Preparing Next.js from", app.getAppPath());
  await nextApp.prepare();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  try {
    serverPort = await listenOnPort(server, dev ? 0 : PRODUCTION_PORT);
  } catch (err) {
    if (!dev && err && err.code === "EADDRINUSE") {
      serverPort = await listenOnPort(server, 0);
    } else {
      throw err;
    }
  }

  if (!authBaseUrl) {
    authBaseUrl = `http://${hostname}:${serverPort}`;
  }

  log(`Ready on ${authBaseUrl}`);

  const openedFile = getOpenedFilePath();
  if (openedFile) log("Opened with file/directory:", openedFile);

  const startUrl = openedFile
    ? `http://${hostname}:${serverPort}/workspace?open=${encodeURIComponent(openedFile)}`
    : `http://${hostname}:${serverPort}/workspace`;

  await fadeSplashThenLoad(startUrl);
  mainWindow.show();
  mainWindow.focus();
  if (pendingAuthUrl) sendAuthUrl(pendingAuthUrl);

  if (dev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

ipcMain.handle("open-external", async (_event, url) => {
  if (typeof url !== "string") return;
  if (!/^https?:\/\//i.test(url)) return;
  await shell.openExternal(url);
});

ipcMain.handle("get-auth-base-url", () => authBaseUrl);
ipcMain.handle("get-pending-auth", () => pendingAuthUrl);
ipcMain.handle("open-aux-window", async (_event, pathname) => {
  await openAuxWindow(pathname);
});

ipcMain.handle("pick-folder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: "Open Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("index-workspace", async (_event, root) => {
  return workspaceFs.indexWorkspace(root);
});

ipcMain.handle("read-workspace-file", async (_event, root, relativePath) => {
  return workspaceFs.readWorkspaceFile(root, relativePath);
});

ipcMain.handle("create-workspace-file", async (_event, root, relativePath, content) => {
  return workspaceFs.writeWorkspaceFile(root, relativePath, content ?? "");
});

ipcMain.handle("create-workspace-folder", async (_event, root, relativePath) => {
  return workspaceFs.mkdirWorkspace(root, relativePath);
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const startupProtocolUrl = collectProtocolUrl(process.argv);
  if (startupProtocolUrl) pendingAuthUrl = startupProtocolUrl;

  app.on("second-instance", (_event, commandLine) => {
    const protocolUrl = collectProtocolUrl(commandLine);
    if (protocolUrl) {
      sendAuthUrl(protocolUrl);
      return;
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();

      const filePath = getOpenedFilePath(commandLine);
      if (filePath) {
        log("Second instance opened with:", filePath);
        mainWindow.loadURL(
          `http://${hostname}:${serverPort}/workspace?open=${encodeURIComponent(filePath)}`
        );
      }
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    sendAuthUrl(url);
  });

  app.whenReady().then(async () => {
    log("App ready, log file:", logPath());
    try {
      await createWindow();
      startOllamaDaemon();
      startPythonBackend();
    } catch (err) {
      showFatal("G-AID failed to start", err);
      app.quit();
    }

    app.on("activate", function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((err) => showFatal("G-AID failed to start", err));
      }
    });
  });

  app.on("will-quit", () => {
    if (pythonProcess) pythonProcess.kill();
    if (ollamaProcess) ollamaProcess.kill();
  });
}

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
