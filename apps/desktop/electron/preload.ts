import { contextBridge, ipcRenderer } from 'electron';

/**
 * This is the entire surface area exposed to the renderer (React app).
 * Nothing else from Node.js or Electron's main process is reachable from
 * the renderer — there is no `require`, no `fs`, no `process.env` with
 * secrets, nothing. Every function below maps to a single, narrow,
 * purpose-built IPC handler in electron/main.ts.
 */
contextBridge.exposeInMainWorld('desktopApi', {
  secureStorage: {
    setRefreshToken: (token: string): Promise<{ persisted: boolean }> =>
      ipcRenderer.invoke('secure-storage:set-refresh-token', token),
    getRefreshToken: (): Promise<string | null> => ipcRenderer.invoke('secure-storage:get-refresh-token'),
    clearRefreshToken: (): Promise<boolean> => ipcRenderer.invoke('secure-storage:clear-refresh-token'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  },
  platform: process.platform,
});

export {};
