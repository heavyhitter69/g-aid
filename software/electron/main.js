const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");
const { spawn, execFileSync } = require("child_process");
const workspaceFs = require("./workspace-fs");
const desktopAuth = require("./desktop-auth");

const PROTOCOL = "gaid";
const PRODUCTION_PORT = 47821;
const dev = !app.isPackaged;
const hostname = "localhost";

app.setName("G-AID");
app.setAppUserModelId("com.geophysics.gaid");

if (process.platform === "linux") {
  // npm Electron ships chrome-sandbox without root/SUID. Chromium then aborts
  // in C++ before this file runs, so appendSwitch is too late. `dev:electron`
  // and launch-g-aid.sh pass --no-sandbox on argv. This is a fallback when the
  // helper is already missing (packaged Linux after-pack removes it).
  try {
    const helper = path.join(path.dirname(process.execPath), "chrome-sandbox");
    const st = fs.statSync(helper);
    const suidRoot = st.uid === 0 && (st.mode & 0o4000);
    if (!suidRoot) app.commandLine.appendSwitch("no-sandbox");
  } catch {
    app.commandLine.appendSwitch("no-sandbox");
  }
}

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
const windows = [];
let pendingNewWindows = 0;
let pythonProcess = null;
let ollamaProcess = null;
let authBaseUrl = "";
let pendingAuthSession = desktopAuth.createPendingSessionHolder();
let publicLogin = null;
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

function applyWindowIcon(win) {
  const file = iconPath();
  if (!file || !win || win.isDestroyed()) return;
  try {
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) {
      win.setIcon(image);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    win.setIcon(file);
  } catch {
    /* Linux/Wayland can ignore a missing icon and keep the Electron gear. */
  }
}

function wantsNewWindow(argv = process.argv) {
  return argv.some((arg) => arg === "--new-window");
}

function registerWindow(win) {
  windows.push(win);
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = win;
  win.on("closed", () => {
    const index = windows.indexOf(win);
    if (index >= 0) windows.splice(index, 1);
    if (mainWindow === win) mainWindow = windows[0] || null;
  });
}

function attachWindowGuards(win, fallbackUrl) {
  win.webContents.on("render-process-gone", (_event, details) => {
    log("Renderer gone", details && details.reason);
    if (win && !win.isDestroyed()) {
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.reload();
      }, 400);
    }
  });
  win.webContents.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    log("did-fail-load", code, desc, url);
    setTimeout(() => {
      if (win && !win.isDestroyed() && fallbackUrl) win.loadURL(fallbackUrl);
    }, 800);
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

function workspaceUrl(pathname, openPath, extra = {}) {
  const page = typeof pathname === "string" && pathname.startsWith("/") ? pathname : "/workspace";
  const [path, existingQuery] = page.split("?");
  const params = new URLSearchParams(existingQuery || "");
  if (openPath) params.set("open", openPath);
  if (extra.fresh) params.set("fresh", "1");
  const qs = params.toString();
  return `http://${hostname}:${serverPort}${path}${qs ? `?${qs}` : ""}`;
}

async function openWorkspaceWindow({ pathname, openPath, splash = false, fresh } = {}) {
  if (!serverPort) {
    pendingNewWindows += 1;
    return null;
  }
  const useFresh =
    fresh ??
    (!openPath && !(typeof pathname === "string" && /[?&]conversation=/.test(pathname)));
  const win = new BrowserWindow(browserWindowOptions());
  applyWindowIcon(win);
  registerWindow(win);
  const url = workspaceUrl(pathname, openPath, { fresh: useFresh });
  log("Opening window:", url);
  attachWindowGuards(win, url);
  if (splash) {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
    win.show();
    win.focus();
    await fadeSplashThenLoad(win, url);
  } else {
    await win.loadURL(url);
    win.show();
    win.focus();
  }
  return win;
}

async function flushPendingWindows() {
  while (pendingNewWindows > 0) {
    pendingNewWindows -= 1;
    await openWorkspaceWindow();
  }
}

function setWindowsJumpList() {
  if (process.platform !== "win32") return;
  try {
    const program = process.execPath;
    const args = dev
      ? `${JSON.stringify(path.resolve(process.argv[1] || "."))} --new-window`
      : "--new-window";
    app.setUserTasks([
      {
        program,
        arguments: args,
        iconPath: program,
        iconIndex: 0,
        title: "New Window",
        description: "Open a new G-AID window",
      },
    ]);
  } catch (err) {
    log("Jump list failed", err);
  }
}

async function openAuxWindow(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/workspace")) return;
  await openWorkspaceWindow({ pathname });
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
      if (value instanceof Error) return desktopAuth.redactSensitiveText(value.stack || value.message);
      if (typeof value === "string") return desktopAuth.redactSensitiveText(value);
      try {
        return desktopAuth.redactSensitiveText(JSON.stringify(value));
      } catch {
        return desktopAuth.redactSensitiveText(String(value));
      }
    })
    .join(" ");
  const line = `[${new Date().toISOString()}] ${text}\n`;
  console.log(text);
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

function focusMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function sendAuthSession(session) {
  if (!session || !session.access_token || !session.refresh_token) return;
  pendingAuthSession.set(session);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gaid-auth-session", {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    focusMainWindow();
  }
}

function sendAuthError(error) {
  const payload = {
    code: (error && error.code) || "auth_error",
    message: (error && error.message) || "Sign-in could not finish.",
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gaid-auth-error", payload);
    focusMainWindow();
  }
}

function isAllowedDesktopAuthIpc(event) {
  return desktopAuth.isAllowedDesktopAuthIpcSender(event, {
    windows,
    fromWebContents: (contents) => BrowserWindow.fromWebContents(contents),
    localOrigin: serverPort ? `http://${hostname}:${serverPort}` : "",
  });
}

function publicLoginResult(result) {
  return {
    started: Boolean(result && result.started),
    reason: result && result.reason ? String(result.reason) : undefined,
  };
}

function refreshAuthBaseUrl() {
  authBaseUrl = desktopAuth.resolveAuthBaseUrl({
    isPackaged: !dev,
    envValue: process.env.GAID_AUTH_BASE_URL || "",
    localDevOrigin: "",
  });
  return authBaseUrl;
}

function getPublicLogin() {
  if (!publicLogin) {
    publicLogin = desktopAuth.createPublicLoginController({
      isPackaged: !dev,
      getEnvAuthBase: () => process.env.GAID_AUTH_BASE_URL || "",
      getLocalDevOrigin: () => "",
      openExternal: (url) => shell.openExternal(url),
      onSession: (session) => sendAuthSession(session),
      onError: (error) => sendAuthError(error),
    });
  }
  return publicLogin;
}

function bundledBinary(dir, name) {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(dir, `${name}${ext}`);
}

function ensureExecutable(filePath) {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    /* ignore chmod failures on read-only images */
  }
}

function spawnHidden(exePath, args, extraEnv = {}) {
  log("spawn", exePath, args.join(" "));
  ensureExecutable(exePath);
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

  const engineDir = path.join(process.resourcesPath, "g-aid-engine");
  const enginePath = bundledBinary(engineDir, "g-aid-engine");
  if (!fs.existsSync(enginePath)) {
    log("Python engine missing:", enginePath);
    return;
  }
  pythonProcess = spawnHidden(enginePath, []);
}

function resolveOllamaPath() {
  const ollamaDir = path.join(process.resourcesPath, "ai");
  const bundled = bundledBinary(ollamaDir, "ollama");
  if (fs.existsSync(bundled)) return bundled;
  return whichOnPath("ollama");
}

function startOllamaDaemon() {
  if (dev) {
    log("Dev mode: assuming Ollama is already running on host system");
    return;
  }
  if (ollamaProcess && !ollamaProcess.killed) return;

  const ollamaDir = path.join(process.resourcesPath, "ai");
  const ollamaPath = resolveOllamaPath();
  const modelsPath = path.join(ollamaDir, "models");
  if (!ollamaPath || !fs.existsSync(ollamaPath)) {
    log("Ollama missing: bundled binary and PATH");
    return;
  }
  ollamaProcess = spawnHidden(ollamaPath, ["serve"], {
    OLLAMA_MODELS: modelsPath,
    OLLAMA_HOST: "127.0.0.1:11434",
    OLLAMA_LIBRARY_PATH: ollamaDir,
  });
  setTimeout(ensureOrchestraModel, 3000);
  setTimeout(ensureFastOrchestra, 4000);
}

function orchestraModelfilePath() {
  const candidates = [
    path.join(app.getAppPath(), "ollama", "Modelfile"),
    path.join(process.resourcesPath, "app", "ollama", "Modelfile"),
    path.join(process.resourcesPath, "ai", "Modelfile"),
    path.join(__dirname, "..", "ollama", "Modelfile"),
  ];
  return candidates.find((entry) => fs.existsSync(entry)) || null;
}

function orchestraFastModelfilePath() {
  const candidates = [
    path.join(app.getAppPath(), "ollama", "Modelfile.fast"),
    path.join(process.resourcesPath, "app", "ollama", "Modelfile.fast"),
    path.join(process.resourcesPath, "ai", "Modelfile.fast"),
    path.join(__dirname, "..", "ollama", "Modelfile.fast"),
  ];
  return candidates.find((entry) => fs.existsSync(entry)) || null;
}

function ollamaEnv() {
  const ollamaDir = path.join(process.resourcesPath, "ai");
  return {
    OLLAMA_MODELS: path.join(ollamaDir, "models"),
    OLLAMA_HOST: "127.0.0.1:11434",
    OLLAMA_LIBRARY_PATH: ollamaDir,
  };
}

function ollamaHasAlias(ollamaPath, env, alias) {
  try {
    const out = execFileSync(ollamaPath, ["list"], {
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    return String(out)
      .split(/\r?\n/)
      .some((line) => {
        const name = line.split(/\s+/)[0] || "";
        return name === alias || name === `${alias}:latest` || name.startsWith(`${alias}:`);
      });
  } catch {
    return false;
  }
}

function ensureFastOrchestra() {
  const ollamaPath = resolveOllamaPath();
  const modelfile = orchestraFastModelfilePath();
  if (!ollamaPath || !fs.existsSync(ollamaPath) || !modelfile) {
    log("G-AID Orchestra Fast model or Modelfile missing");
    return;
  }
  const env = ollamaEnv();
  if (ollamaHasAlias(ollamaPath, env, "g-aid-orchestra-fast")) {
    log("g-aid-orchestra-fast alias already present; leaving existing local alias unchanged");
    return;
  }
  spawnHidden(ollamaPath, ["create", "g-aid-orchestra-fast", "-f", modelfile], env);
}

function ensureOrchestraModel() {
  const modelfile = orchestraModelfilePath();
  if (!modelfile) {
    log("G-AID Orchestra Modelfile missing");
    return;
  }
  const ollamaDir = path.join(process.resourcesPath, "ai");
  const ollamaPath = resolveOllamaPath();
  if (!ollamaPath || !fs.existsSync(ollamaPath)) return;
  const env = {
    OLLAMA_MODELS: path.join(ollamaDir, "models"),
    OLLAMA_HOST: "127.0.0.1:11434",
    OLLAMA_LIBRARY_PATH: ollamaDir,
  };
  if (ollamaHasAlias(ollamaPath, env, "g-aid-orchestra")) {
    log("g-aid-orchestra alias already present; leaving existing local alias unchanged");
    return;
  }
  spawnHidden(ollamaPath, ["create", "g-aid-orchestra", "-f", modelfile], env);
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

function firstExisting(paths) {
  return paths.find((file) => {
    try {
      return file && fs.existsSync(file);
    } catch {
      return false;
    }
  }) || null;
}

function ensureExecutable(file) {
  if (!file || process.platform === "win32") return file;
  try {
    fs.chmodSync(file, 0o755);
  } catch {
    /* packaged files may already be executable */
  }
  return file;
}

function bundledBinary(dir, name) {
  const unix = path.join(dir, name);
  const win = path.join(dir, `${name}.exe`);
  if (process.platform === "win32") {
    const found = firstExisting([win, unix]);
    return found ? ensureExecutable(found) : win;
  }
  if (fs.existsSync(unix)) return ensureExecutable(unix);
  return unix;
}

function whichOnPath(name) {
  const dirs = String(process.env.PATH || "").split(path.delimiter);
  const names = process.platform === "win32" ? [`${name}.exe`, name] : [name];
  for (const dir of dirs) {
    for (const file of names) {
      const full = path.join(dir, file);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function iconPath() {
  const names =
    process.platform === "win32"
      ? ["icon.ico", "app-icon.png", "icon.png", "icons/512x512.png"]
      : process.platform === "darwin"
        ? ["icon.icns", "app-icon.png", "icons/512x512.png", "icon.png"]
        : ["app-icon.png", "icons/512x512.png", "icons/256x256.png", "icon.png"];
  const dirs = [
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "build"),
    path.join(app.getAppPath(), "public"),
    path.join(app.getAppPath(), "build"),
    path.join(process.resourcesPath, "app", "build"),
    path.join(process.resourcesPath, "build"),
  ];
  for (const dir of dirs) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
  }
  const fallbacks = [
    path.join(__dirname, "..", "public", "app-icon.png"),
    path.join(app.getAppPath(), "public", "app-icon.png"),
  ];
  for (const file of fallbacks) {
    if (fs.existsSync(file)) return file;
  }
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

async function fadeSplashThenLoad(win, url) {
  if (!win || win.isDestroyed()) return;
  try {
    await win.webContents.executeJavaScript(`
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
  await win.loadURL(url);
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
  applyWindowIcon(mainWindow);
  registerWindow(mainWindow);

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

  refreshAuthBaseUrl();
  if (authBaseUrl) {
    log(`Ready. Public login origin: ${authBaseUrl}`);
  } else if (!dev) {
    log("Ready. Online sign-in is not configured yet (GAID_AUTH_BASE_URL is unset).");
  } else {
    log("Ready.");
  }

  const openedFile = getOpenedFilePath();
  if (openedFile) log("Opened with file/directory:", openedFile);

  const startUrl = openedFile
    ? `http://${hostname}:${serverPort}/workspace?open=${encodeURIComponent(openedFile)}`
    : `http://${hostname}:${serverPort}/workspace`;

  await fadeSplashThenLoad(mainWindow, startUrl);
  mainWindow.show();
  mainWindow.focus();
  const pending = pendingAuthSession.peek();
  if (pending && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gaid-auth-session", pending);
  }
  attachWindowGuards(mainWindow, startUrl);
  setWindowsJumpList();
  await flushPendingWindows();

  if (process.env.GAID_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

ipcMain.handle("open-external", async (_event, url) => {
  if (typeof url !== "string") return;
  if (!/^https?:\/\//i.test(url)) return;
  await shell.openExternal(url);
});

ipcMain.handle("get-auth-base-url", (event) => {
  if (!isAllowedDesktopAuthIpc(event)) return "";
  refreshAuthBaseUrl();
  return authBaseUrl;
});
ipcMain.handle("is-public-login-configured", (event) => {
  if (!isAllowedDesktopAuthIpc(event)) return false;
  refreshAuthBaseUrl();
  return Boolean(authBaseUrl);
});
ipcMain.handle("start-public-login", async (event, mode) => {
  if (!isAllowedDesktopAuthIpc(event)) return { started: false, reason: "invalid_sender" };
  refreshAuthBaseUrl();
  return publicLoginResult(await getPublicLogin().start(mode === "signup" ? "signup" : "login"));
});
ipcMain.handle("cancel-public-login", async (event) => {
  if (!isAllowedDesktopAuthIpc(event)) return;
  await getPublicLogin().cancel();
});
ipcMain.handle("get-pending-auth-session", (event) => {
  if (!isAllowedDesktopAuthIpc(event)) return null;
  return pendingAuthSession.take();
});
ipcMain.handle("open-aux-window", async (_event, pathname) => {
  await openAuxWindow(pathname);
});

ipcMain.handle("open-new-window", async () => {
  await openWorkspaceWindow();
});

ipcMain.handle("pick-folder", async (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showOpenDialog(win, {
    title: (options && options.title) || "Open Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("index-workspace", async (_event, root) => {
  return workspaceFs.indexWorkspace(root);
});
ipcMain.handle("search-workspace", async (_event, root, query, options) => {
  return workspaceFs.searchWorkspace(root, query, options || {});
});

ipcMain.handle("read-workspace-file", async (_event, root, relativePath) => {
  return workspaceFs.readWorkspaceFile(root, relativePath);
});

ipcMain.handle("create-workspace-file", async (_event, root, relativePath, content) => {
  return workspaceFs.writeWorkspaceFile(root, relativePath, content ?? "");
});

ipcMain.handle("save-workspace-file", async (_event, root, relativePath, content) => {
  return workspaceFs.saveWorkspaceFile(root, relativePath, content ?? "");
});

ipcMain.handle("create-workspace-folder", async (_event, root, relativePath) => {
  return workspaceFs.mkdirWorkspace(root, relativePath);
});

ipcMain.handle("delete-workspace-path", async (_event, root, relativePath) => {
  const { full, relativePath: rel } = workspaceFs.resolveWorkspacePath(root, relativePath);
  if (!fs.existsSync(full)) throw new Error(`Not found: ${rel}`);
  await shell.trashItem(full);
  return rel;
});

ipcMain.handle("move-workspace-path", async (_event, root, fromRel, destFolderRel) => {
  return workspaceFs.moveWorkspacePath(root, fromRel, destFolderRel || "");
});

ipcMain.handle("copy-workspace-path", async (_event, root, fromRel, destFolderRel) => {
  return workspaceFs.copyWorkspacePath(root, fromRel, destFolderRel || "");
});

ipcMain.handle("rename-workspace-path", async (_event, root, fromRel, newName) => {
  return workspaceFs.renameWorkspacePath(root, fromRel, newName);
});

ipcMain.handle("clone-git-repo", async (_event, url, destParent) => {
  const raw = String(url || "").trim();
  if (!raw) throw new Error("Enter a git URL");
  if (!/^(https?:\/\/|git@|ssh:\/\/)/i.test(raw) && !/github\.com|gitlab\.com|bitbucket\.org/i.test(raw)) {
    throw new Error("Enter a git URL, for example https://github.com/org/repo.git");
  }
  const parent = path.resolve(String(destParent || ""));
  if (!parent || !fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new Error("Choose a folder to clone into");
  }
  const cleaned = raw.replace(/\.git$/i, "").replace(/\/+$/, "");
  const name = cleaned.split(/[:/\\]/).filter(Boolean).pop() || "repo";
  const dest = path.join(parent, name);
  if (fs.existsSync(dest)) throw new Error(`Already exists: ${dest}`);
  return await new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", raw, dest], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    child.on("error", (error) => {
      if (error && error.code === "ENOENT") {
        reject(new Error("Git is not installed. Install Git from git-scm.com and try again."));
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve(dest);
      else reject(new Error((err || `git clone failed (${code})`).trim()));
    });
  });
});

ipcMain.handle("show-item-in-folder", async (_event, root, relativePath) => {
  const resolvedRoot = path.resolve(root);
  const full = relativePath ? path.resolve(resolvedRoot, relativePath) : resolvedRoot;
  if (!workspaceFs.isInsideRoot(resolvedRoot, full)) {
    throw new Error("Path is outside the open workspace");
  }
  if (!fs.existsSync(full)) throw new Error(`Not found: ${relativePath || root}`);
  shell.showItemInFolder(full);
});

ipcMain.handle("open-path", async (_event, root, relativePath) => {
  const resolvedRoot = path.resolve(root);
  const full = relativePath ? path.resolve(resolvedRoot, relativePath) : resolvedRoot;
  if (!workspaceFs.isInsideRoot(resolvedRoot, full)) {
    throw new Error("Path is outside the open workspace");
  }
  if (!fs.existsSync(full)) throw new Error(`Not found: ${relativePath || root}`);
  const err = await shell.openPath(full);
  if (err) throw new Error(err);
});

function registerLinuxProtocolHandler() {
  if (process.platform !== "linux" || dev) return;
  const execPath = process.execPath;
  if (execPath.startsWith("/opt/") || execPath.startsWith("/usr/")) return;
  try {
    const apps = path.join(app.getPath("home"), ".local", "share", "applications");
    fs.mkdirSync(apps, { recursive: true });
    const desktop = path.join(apps, "g-aid.desktop");
    fs.writeFileSync(
      desktop,
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=G-AID",
        "Exec=" + JSON.stringify(execPath) + " %u",
        "Icon=g-aid",
        "Terminal=false",
        "Categories=Science;Education;",
        "MimeType=x-scheme-handler/gaid;",
        "StartupWMClass=g-aid",
        "",
      ].join("\n")
    );
    spawn("xdg-mime", ["default", "g-aid.desktop", "x-scheme-handler/gaid"], { stdio: "ignore" });
  } catch (err) {
    log("Linux protocol handler skipped", err);
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const startupProtocolUrl = collectProtocolUrl(process.argv);

  app.on("second-instance", (_event, commandLine) => {
    const protocolUrl = collectProtocolUrl(commandLine);
    if (protocolUrl) {
      void getPublicLogin().handleIncomingUrl(protocolUrl);
      return;
    }

    if (wantsNewWindow(commandLine)) {
      void openWorkspaceWindow();
      return;
    }

    const filePath = getOpenedFilePath(commandLine);
    if (filePath) {
      log("Second instance opened with:", filePath);
      void openWorkspaceWindow({ openPath: filePath });
      return;
    }

    const win = BrowserWindow.getFocusedWindow() || mainWindow || windows[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    void getPublicLogin().handleIncomingUrl(url);
  });

  app.whenReady().then(async () => {
    log("App ready, log file:", logPath());
    registerLinuxProtocolHandler();
    try {
      await createWindow();
      if (startupProtocolUrl) {
        void getPublicLogin().handleIncomingUrl(startupProtocolUrl);
      }
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
