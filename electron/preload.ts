/**
 * NeuroDEX — Electron Preload Script
 * Exposes a safe API bridge to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('NeuroDEX', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    fullscreen: () => ipcRenderer.send('window:fullscreen')
  },

  // Gateway connection info
  gateway: {
    onToken: (callback: (data: { token: string; port: number }) => void) => {
      ipcRenderer.once('gateway:token', (_, data) => callback(data));
    }
  },

  // Config
  config: {
    read: () => ipcRenderer.invoke('config:read'),
    write: (config: Record<string, unknown>) => ipcRenderer.invoke('config:write', config)
  },

  // System info
  system: {
    info: () => ipcRenderer.invoke('system:info')
  }
});
