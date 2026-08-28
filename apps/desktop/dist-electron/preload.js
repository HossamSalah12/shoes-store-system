"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * This is the entire surface area exposed to the renderer (React app).
 * Nothing else from Node.js or Electron's main process is reachable from
 * the renderer — there is no `require`, no `fs`, no `process.env` with
 * secrets, nothing. Every function below maps to a single, narrow,
 * purpose-built IPC handler in electron/main.ts.
 */
electron_1.contextBridge.exposeInMainWorld('desktopApi', {
    secureStorage: {
        setRefreshToken: (token) => electron_1.ipcRenderer.invoke('secure-storage:set-refresh-token', token),
        getRefreshToken: () => electron_1.ipcRenderer.invoke('secure-storage:get-refresh-token'),
        clearRefreshToken: () => electron_1.ipcRenderer.invoke('secure-storage:clear-refresh-token'),
    },
    app: {
        getVersion: () => electron_1.ipcRenderer.invoke('app:get-version'),
    },
    platform: process.platform,
});
//# sourceMappingURL=preload.js.map