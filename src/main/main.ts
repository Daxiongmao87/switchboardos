/**
 * SwitchboardOS — Electron Main Process
 *
 * Owns all privileged operations:
 * - Window lifecycle management
 * - IPC broker between renderer and services
 * - Access to OS keychain, filesystem, SSH, SQLite
 * - Audit logging
 *
 * Security posture:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - preload script exposes narrow typed API only
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import crypto from 'crypto';



// Track window state for multi-window support
let mainWindow: BrowserWindow | null = null;

/**
 * Get the URL for the renderer.
 * In development, load from Angular dev server.
 * In production, load from built files.
 */
function getRendererUrl(): string {
  if (process.env.ELECTRON_WEBPACK_MODE === 'serve' || !app.isPackaged) {
    return 'http://localhost:4200';
  }
  return join(__dirname, 'dist', 'switchboardos', 'index.html');
}

/**
 * Create the main application window.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '..', 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:switchboardos',
    },
  });

  // Load the renderer
  mainWindow.loadURL(getRendererUrl()).catch((err) => {
    console.error('Failed to load renderer:', err);
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// IPC Handlers — Main↔Renderer Communication
// ============================================================

/**
 * App-level queries from renderer.
 */
ipcMain.handle('app:get-info', (): Record<string, unknown> => {
  return {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
  };
});

/**
 * Window management from renderer.
 */
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:restore-bounds', (_event, bounds: Electron.Rectangle) => {
  mainWindow?.setBounds(bounds);
});

ipcMain.handle('window:get-bounds', () => {
  return mainWindow?.getBounds() ?? null;
});

/**
 * File dialog from renderer.
 */
ipcMain.handle(
  'dialog:open-file',
  async (_event, options?: Electron.OpenDialogOptions) => {
    const props = options?.properties || [];
    const dialogOptions: Record<string, unknown> = {
      properties: ['openFile', ...(props as unknown as string[])],
      title: options?.title,
      defaultPath: options?.defaultPath,
      buttonLabel: options?.buttonLabel,
      filters: options?.filters,
      securityScopedBookmarks: options?.securityScopedBookmarks,
      message: options?.message,
    };
    const result = await dialog.showOpenDialog(mainWindow!, dialogOptions as Electron.OpenDialogOptions);
    return result;
  }
);

ipcMain.handle(
  'dialog:open-directory',
  async (_event, options?: Electron.OpenDialogOptions) => {
    const props = options?.properties || [];
    const dialogOptions: Record<string, unknown> = {
      properties: ['openDirectory', ...(props as unknown as string[])],
      title: options?.title,
      defaultPath: options?.defaultPath,
      buttonLabel: options?.buttonLabel,
      filters: options?.filters,
      securityScopedBookmarks: options?.securityScopedBookmarks,
      message: options?.message,
    };
    const result = await dialog.showOpenDialog(mainWindow!, dialogOptions as Electron.OpenDialogOptions);
    return result;
  }
);

/**
 * Placeholder IPC channels — to be wired as services are implemented:
 *
 * - host:management    — Host CRUD operations
 * - ssh:session        — SSH session management
 * - secret:storage     — OS keychain access
 * - database:query     — SQLite operations
 * - audit:log          — Audit event writing
 * - agent:invoke       — Agent service calls
 * - bootstrap:generate — Bootstrap script generation
 */

// Host management
ipcMain.handle(
  'host:list',
  async (): Promise<unknown[]> => {
    // TODO: Query SQLite for host inventory
    return [];
  }
);

ipcMain.handle(
  'host:get',
  async (_event, hostId: string): Promise<unknown | null> => {
    // TODO: Query SQLite for single host
    return null;
  }
);

ipcMain.handle(
  'host:create',
  async (_event, hostData: Record<string, unknown>): Promise<string> => {
    // TODO: Insert into SQLite
    return (hostData.id as string) ?? crypto.randomUUID();
  }
);

ipcMain.handle(
  'host:update',
  async (_event, hostId: string, hostData: Record<string, unknown>): Promise<boolean> => {
    // TODO: Update in SQLite
    return true;
  }
);

ipcMain.handle(
  'host:delete',
  async (_event, hostId: string): Promise<boolean> => {
    // TODO: Delete from SQLite
    return true;
  }
);

ipcMain.handle(
  'host:test-connection',
  async (_event, hostId: string): Promise<{ success: boolean; error?: string }> => {
    // TODO: SSH connection test
    return { success: false, error: 'Not yet implemented' };
  }
);

// Secret storage (OS keychain)
ipcMain.handle(
  'secret:store',
  async (_event, key: string, value: string): Promise<boolean> => {
    // TODO: Store in OS keychain
    console.warn('secret:store not yet implemented');
    return false;
  }
);

ipcMain.handle(
  'secret:retrieve',
  async (_event, key: string): Promise<string | null> => {
    // TODO: Retrieve from OS keychain
    console.warn('secret:retrieve not yet implemented');
    return null;
  }
);

ipcMain.handle(
  'secret:delete',
  async (_event, key: string): Promise<boolean> => {
    // TODO: Delete from OS keychain
    console.warn('secret:delete not yet implemented');
    return false;
  }
);

// Audit logging
ipcMain.handle(
  'audit:log',
  async (_event, event: Record<string, unknown>): Promise<string> => {
    // TODO: Write audit event to SQLite
    console.log('Audit event:', JSON.stringify(event));
    return crypto.randomUUID();
  }
);

// ============================================================
// App Lifecycle
// ============================================================

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Create app window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch(() => { /* ignore */ });

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Graceful shutdown
app.on('will-quit', () => {
  // Clean up resources, close DB connections, etc.
  console.log('SwitchboardOS shutting down...');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
  mainWindow?.webContents.send('app:error', {
    message: 'An unexpected error occurred in the application shell.',
    details: err.message,
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason);
});
