const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Windows sandbox conflict: the renderer fails to launch with exitCode 18
// without this. See electron/electron#49167.
app.commandLine.appendSwitch('disable-gpu-sandbox');

const TARGET = 'https://www.officetown.app';
const ALLOWED_ORIGINS = new Set([
  'https://officetown.app',
  'https://www.officetown.app',
]);

const PATCH_SOURCE = fs.readFileSync(
  path.join(__dirname, 'patches', 'auto-scroll-provenance.js'),
  'utf-8'
);

let mainWindow = null;
let patchLogged = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // sandbox stays at its default (true).
    },
  });

  try {
    const info = require('./build-info.json');
    console.log(`[wrapper] ${info.git} - electron ${info.electron} - ${info.platform}`);
  } catch {}

  mainWindow.on('minimize', () => console.log('[win] minimize'));
  mainWindow.on('restore',  () => console.log('[win] restore'));
  mainWindow.on('hide',     () => console.log('[win] hide'));
  mainWindow.on('show',     () => console.log('[win] show'));
  mainWindow.on('blur',     () => console.log('[win] blur'));
  mainWindow.on('focus',    () => console.log('[win] focus'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[popup]', url);
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', async () => {
    let origin;
    try { origin = new URL(mainWindow.webContents.getURL()).origin; }
    catch { return; }

    if (!ALLOWED_ORIGINS.has(origin)) {
      console.log(`[wrapper] patch skipped on ${origin}`);
      return;
    }

    await mainWindow.webContents.executeJavaScript(PATCH_SOURCE, false);
    if (!patchLogged) {
      patchLogged = true;
      console.log('[wrapper] auto-scroll provenance patch injected');
    }
  });

  // Error telemetry. Keep permanently: a blank window with no output is
  // undebuggable, and these two are the only signal when it happens.
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = ERR_ABORTED, fires on every redirect/cancel
    console.log('[did-fail-load]', { code, desc, url });
  });

  mainWindow.webContents.on('render-process-gone', (e, details) => {
    console.log('[render-process-gone]', details);
  });

  mainWindow.loadURL(TARGET).catch((err) => console.log('[loadURL error]', err));
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});