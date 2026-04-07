/**
 * NeuroDEX — Electron Preload Script
 * Secure bridge between renderer and main process.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('NeuroDEX', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    fullscreen: () => ipcRenderer.send('window:fullscreen')
  },

  gateway: {
    onToken: (callback: (data: { token: string; port: number }) => void) => {
      ipcRenderer.once('gateway:token', (_, data) => callback(data));
    }
  },

  config: {
    read: () => ipcRenderer.invoke('config:read'),
    write: (config: Record<string, unknown>) => ipcRenderer.invoke('config:write', config)
  },

  system: {
    info: () => ipcRenderer.invoke('system:info')
  },

  // PTY — real terminal
  pty: {
    create: (options: { cols: number; rows: number; cwd?: string }) =>
      ipcRenderer.invoke('pty:create', options),

    write: (id: number, data: string) =>
      ipcRenderer.send('pty:write', { id, data }),

    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', { id, cols, rows }),

    kill: (id: number) =>
      ipcRenderer.send('pty:kill', { id }),

    onData: (id: number, callback: (data: string) => void) => {
      const channel = `pty:data:${id}`;
      const handler = (_: unknown, data: string) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },

    onExit: (id: number, callback: () => void) => {
      ipcRenderer.once(`pty:exit:${id}`, callback);
    }
  }
});
