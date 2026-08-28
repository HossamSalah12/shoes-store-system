"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
/**
 * ELECTRON SECURITY POSTURE (per spec section 18)
 * ================================================
 * - contextIsolation: true — the renderer's JS world is fully isolated from
 *   the preload script's world; the only bridge is the explicit,
 *   narrow `window.desktopApi` surface defined in preload.ts.
 * - nodeIntegration: false — the renderer (React app) has ZERO access to
 *   Node.js builtins (fs, child_process, require, etc.).
 * - sandbox: true — runs the renderer in Chromium's OS-level sandbox.
 * - No database credentials, JWT secrets, or any server-side configuration
 *   ever ship to this process or the renderer. This process only knows the
 *   PUBLIC API base URL (configurable, not secret) that the desktop app
 *   talks to over HTTPS.
 * - Tokens (access/refresh) issued by the backend are held in the
 *   renderer's in-memory React state for the current session and handed to
 *   preload only for the narrow purpose of persisting the refresh token via
 *   Electron's `safeStorage` (OS keychain-backed encryption) — never written
 *   to a plain file, never logged.
 */
const isDev = !electron_1.app.isPackaged;
function createMainWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: 'نظام إدارة محلات الأحذية — Shoes Store Management System',
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });
    // Content-Security-Policy — dynamically chosen based on dev vs. production.
    //
    // In DEVELOPMENT, the renderer loads from the Vite dev server
    // (http://localhost:5173) rather than from bundled local files, and Vite
    // itself injects a small INLINE <script> for @vitejs/plugin-react's Fast
    // Refresh "preamble" plus an HMR websocket connection. A strict
    // `script-src 'self'` (no 'unsafe-inline', no dev-server origin) blocks
    // that inline script outright — which is exactly the
    // "@vitejs/plugin-react can't detect preamble" error and the
    // "Refused to execute inline script" CSP violation seen in dev. None of
    // this loosening ships in the packaged app: production still gets the
    // original strict, no-inline, no-eval policy below, because the built
    // renderer bundle (apps/desktop/dist) contains zero inline scripts.
    const devCsp = "default-src 'self' http://localhost:5173; " +
        "script-src 'self' 'unsafe-inline' http://localhost:5173; " +
        "style-src 'self' 'unsafe-inline' http://localhost:5173; " +
        "img-src 'self' data: https: http://localhost:5173; " +
        "connect-src 'self' https: wss: ws://localhost:5173 http://localhost:5173 http://localhost:4000;";
    const productionCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:;";
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [isDev ? devCsp : productionCsp],
            },
        });
    });
    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        win.loadFile(node_path_1.default.join(__dirname, '../dist/index.html'));
    }
    // Never allow the renderer to open arbitrary new windows/navigate away
    // from the app (defense against a compromised/injected script trying to
    // pivot into a phishing page).
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('http://localhost:5173') && !url.startsWith('file://')) {
            event.preventDefault();
        }
    });
    return win;
}
electron_1.app.whenReady().then(() => {
    createMainWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// --- Secure local storage of the refresh token via the OS keychain ---
// (electron's `safeStorage` API — encrypts using OS-level credentials,
// Keychain on macOS / DPAPI on Windows / libsecret on Linux). We store only
// the refresh token (never the access token, which is short-lived and kept
// in renderer memory only) and never write plaintext secrets to disk.
const electron_2 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
function tokenFilePath() {
    return node_path_1.default.join(electron_1.app.getPath('userData'), 'session.enc');
}
electron_1.ipcMain.handle('secure-storage:set-refresh-token', (_event, token) => {
    if (!electron_2.safeStorage.isEncryptionAvailable()) {
        // On a platform without OS-level encryption support, we deliberately do
        // NOT fall back to plaintext storage — the user simply has to log in
        // again each launch, which is safer than persisting a plaintext secret.
        return { persisted: false };
    }
    const encrypted = electron_2.safeStorage.encryptString(token);
    node_fs_1.default.writeFileSync(tokenFilePath(), encrypted);
    return { persisted: true };
});
electron_1.ipcMain.handle('secure-storage:get-refresh-token', () => {
    try {
        if (!electron_2.safeStorage.isEncryptionAvailable() || !node_fs_1.default.existsSync(tokenFilePath()))
            return null;
        const encrypted = node_fs_1.default.readFileSync(tokenFilePath());
        return electron_2.safeStorage.decryptString(encrypted);
    }
    catch {
        return null;
    }
});
electron_1.ipcMain.handle('secure-storage:clear-refresh-token', () => {
    try {
        if (node_fs_1.default.existsSync(tokenFilePath()))
            node_fs_1.default.unlinkSync(tokenFilePath());
    }
    catch {
        /* ignore */
    }
    return true;
});
electron_1.ipcMain.handle('app:get-version', () => electron_1.app.getVersion());
//# sourceMappingURL=main.js.map