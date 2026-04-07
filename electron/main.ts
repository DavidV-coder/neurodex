/**
 * NeuroDEX — Electron Main Process
 * Manages the app window, Gateway lifecycle, and system integration.
 */

import { app, BrowserWindow, ipcMain, Menu, Tray, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { GatewayServer } from '../src/gateway/server.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'NeuroDEX');
const TOKEN_FILE = path.join(CONFIG_DIR, 'gateway.token');

let mainWindow: BrowserWindow | null = null;
let gateway: GatewayServer | null = null;
let tray: Tray | null = null;

// Ensure config directory
fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

async function startGateway(): Promise<string> {
  gateway = new GatewayServer({ port: 18789, host: '127.0.0.1' });
  gateway.setupPermissionBridge();
  await gateway.start();

  // Save token for CLI access
  const token = gateway.getToken();
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });

  return token;
}

function createWindow(gatewayToken: string): void {
  const isDev = process.env.NODE_ENV === 'development';

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: false,
    frame: false, // Frameless for sci-fi look
    transparent: false,
    backgroundColor: '#000a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: path.join(__dirname, '../ui/assets/icons/neurodex.png'),
    title: 'NeuroDEX'
  });

  // Load UI
  mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Pass gateway token to renderer via preload
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('gateway:token', {
      token: gatewayToken,
      port: 18789
    });
  });

  // Window controls via IPC
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('window:fullscreen', () => {
    mainWindow?.setFullScreen(!mainWindow.isFullScreen());
  });

  // Config access via IPC
  ipcMain.handle('config:read', async () => {
    try {
      const configFile = path.join(CONFIG_DIR, 'settings.json');
      return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch { return {}; }
  });

  ipcMain.handle('config:write', async (_, config: Record<string, unknown>) => {
    const configFile = path.join(CONFIG_DIR, 'settings.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    return { ok: true };
  });

  ipcMain.handle('system:info', async () => ({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    cwd: process.cwd(),
    home: os.homedir(),
    hostname: os.hostname()
  }));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Force dark mode
  nativeTheme.themeSource = 'dark';

  // Disable menu bar
  Menu.setApplicationMenu(null);

  try {
    const token = await startGateway();
    createWindow(token);
  } catch (err) {
    console.error('[NeuroDEX] Failed to start Gateway:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startGateway().then(token => createWindow(token));
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  gateway?.stop();
  try { fs.unlinkSync(TOKEN_FILE); } catch { /**/ }
});

// Security: prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
});
