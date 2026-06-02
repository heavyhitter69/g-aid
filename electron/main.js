const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = !app.isPackaged;
const hostname = 'localhost';
const port = 0; // Always bind to a random free port to avoid conflicts

// Initialize Next.js app
const nextApp = next({ dev, hostname, port, dir: app.getAppPath() });
const handle = nextApp.getRequestHandler();

let mainWindow;

// ─── Handle command-line arguments (for "Open with G-AID" context menu) ──────
function getOpenedFilePath() {
  // In packaged builds, args start after the exe path
  // In dev, args start after 'electron' and '.'
  const args = process.argv.slice(dev ? 2 : 1);
  // Filter out Electron/Chromium flags
  const filePath = args.find((arg) => !arg.startsWith('-') && !arg.startsWith('--'));
  return filePath || null;
}

async function createWindow() {
  await nextApp.prepare();

  // Create HTTP server for Next.js
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    
    // Get the actual assigned port if we bound to 0
    const actualPort = server.address().port;
    console.log(`> Ready on http://localhost:${actualPort}`);

    const openedFile = getOpenedFilePath();
    if (openedFile) {
      console.log(`> Opened with file/directory: ${openedFile}`);
    }

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      icon: path.join(__dirname, '..', 'build', 'icon.ico'),
      show: false, // Hide until loaded
    });

    // Build the URL, optionally passing the opened file path
    let startUrl = `http://localhost:${actualPort}`;
    if (openedFile) {
      startUrl += `/workspace?open=${encodeURIComponent(openedFile)}`;
    }
    mainWindow.loadURL(startUrl);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    if (dev) {
      mainWindow.webContents.openDevTools();
    }
  });
}

// ─── Single instance lock ────────────────────────────────────────────────────
// Prevents multiple instances; instead, focus the existing window when
// the user double-clicks a file or uses "Open with G-AID"
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Extract the file path from the new instance's command line
      const args = commandLine.slice(1);
      const filePath = args.find((arg) => !arg.startsWith('-') && !arg.startsWith('--'));
      if (filePath) {
        console.log(`> Second instance opened with: ${filePath}`);
        // Navigate to workspace with the file
        const currentUrl = mainWindow.webContents.getURL();
        const baseUrl = currentUrl.split('/workspace')[0].split('?')[0];
        mainWindow.loadURL(`${baseUrl}/workspace?open=${encodeURIComponent(filePath)}`);
      }
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
