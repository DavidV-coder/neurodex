/**
 * NeuroDEX — Electron Main Process
 */

import { app, BrowserWindow, ipcMain, Menu, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';

// __dirname = dist/electron/ — root is two levels up
const ROOT = path.join(__dirname, '..', '..');

// node-pty — native PTY support
let pty: typeof import('node-pty') | null = null;
try { pty = require('node-pty'); } catch { console.warn('[PTY] node-pty not available'); }

const ptyProcesses = new Map<number, import('node-pty').IPty>();
let ptyCounter = 0;

const CONFIG_DIR = path.join(os.homedir(), '.config', 'NeuroDEX');
const TOKEN_FILE = path.join(CONFIG_DIR, 'gateway.token');

let mainWindow: BrowserWindow | null = null;
let gatewayProcess: cp.ChildProcess | null = null;
let gatewayToken: string | null = null;

fs.mkdirSync(CONFIG_DIR, { recursive: true });

function generateToken(): string {
  return require('crypto').randomBytes(32).toString('hex');
}

function startGateway(): Promise<string> {
  return new Promise((resolve) => {
    const token = generateToken();
    gatewayToken = token;
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });

    const tsxBin = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    const gatewayScript = path.join(ROOT, 'src', 'gateway', 'start.ts');

    gatewayProcess = cp.spawn(
      tsxBin,
      [gatewayScript],
      {
        env: {
          ...process.env,
          NEURODEX_GATEWAY_TOKEN: token,
          NEURODEX_GATEWAY_PORT: '18789',
          NEURODEX_GATEWAY_HOST: '127.0.0.1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    if (gatewayProcess.stdout) {
      gatewayProcess.stdout.on('data', (data: Buffer) => {
        const msg = data.toString();
        console.log('[Gateway]', msg.trim());
        if (msg.includes('started on')) resolve(token);
      });
    }

    if (gatewayProcess.stderr) {
      gatewayProcess.stderr.on('data', (data: Buffer) => {
        console.error('[Gateway]', data.toString().trim());
      });
    }

    gatewayProcess.on('error', (err) => {
      console.error('[Gateway] spawn error:', err);
      resolve(token); // continue without gateway
    });

    // Max 4 second wait
    setTimeout(() => resolve(token), 4000);
  });
}

function createWindow(token: string): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // needed for preload to use ipcRenderer
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    title: 'NeuroDEX'
  });

  mainWindow.loadFile(path.join(ROOT, 'ui', 'index.html'));

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('gateway:token', { token, port: 18789 });
  });

  mainWindow.on('closed', () => {
    for (const [id, p] of ptyProcesses) { try { p.kill(); } catch { /**/ } ptyProcesses.delete(id); }
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('window:fullscreen', () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()));

  ipcMain.handle('config:read', async () => {
    try { return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8')); }
    catch { return {}; }
  });
  ipcMain.handle('config:write', async (_: unknown, config: Record<string, unknown>) => {
    fs.writeFileSync(path.join(CONFIG_DIR, 'settings.json'), JSON.stringify(config, null, 2), { mode: 0o600 });
    return { ok: true };
  });
  ipcMain.handle('system:info', async () => ({
    platform: process.platform, arch: process.arch,
    nodeVersion: process.version, cwd: process.cwd(),
    home: os.homedir(), hostname: os.hostname()
  }));

  ipcMain.handle('pty:create', async (_, options: { cols: number; rows: number; cwd?: string }) => {
    if (!pty) return { error: 'node-pty not available' };
    const shell = process.platform === 'win32' ? 'powershell.exe'
      : (process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash'));
    const id = ++ptyCounter;
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color', cols: options.cols ?? 80, rows: options.rows ?? 24,
      cwd: options.cwd ?? os.homedir(), env: { ...process.env } as Record<string, string>
    });
    ptyProcesses.set(id, ptyProcess);
    ptyProcess.onData((data: string) => mainWindow?.webContents.send(`pty:data:${id}`, data));
    ptyProcess.onExit(() => { ptyProcesses.delete(id); mainWindow?.webContents.send(`pty:exit:${id}`); });
    return { id };
  });
  ipcMain.on('pty:write', (_, { id, data }: { id: number; data: string }) => ptyProcesses.get(id)?.write(data));
  ipcMain.on('pty:resize', (_, { id, cols, rows }: { id: number; cols: number; rows: number }) => ptyProcesses.get(id)?.resize(cols, rows));
  ipcMain.on('pty:kill', (_, { id }: { id: number }) => { ptyProcesses.get(id)?.kill(); ptyProcesses.delete(id); });
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  registerIpcHandlers();

  try {
    const token = await startGateway();
    createWindow(token);
  } catch (err) {
    console.error('[NeuroDEX] Startup error:', err);
    createWindow(generateToken());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && gatewayToken) {
      createWindow(gatewayToken);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  gatewayProcess?.kill();
  try { fs.unlinkSync(TOKEN_FILE); } catch { /**/ }
});

app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
});
