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
import { MvpSqliteStore } from './mvp-sqlite-store';
import { TerminalSessionManager, type TerminalEventSender } from './terminal-session-manager';
import { generateBootstrapScript, listBootstrapPresets } from './bootstrap-generator';
import type {
  BootstrapGenerateInput,
  CreateAuditEventInput,
  CreateHostInput,
  MvpSettingsUpdate,
  UpdateHostInput,
} from '../shared/mvp-models';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

// Track window state for multi-window support
let mainWindow: BrowserWindow | null = null;
const mvpStore = new MvpSqliteStore(() => app.getPath('userData'));
const sendTerminalEvent: TerminalEventSender = (event) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(event.channel, event.payload);
  });
};
const terminalSessions = new TerminalSessionManager(
  (hostId) => mvpStore.getHost(hostId),
  sendTerminalEvent,
  (event) => mvpStore.logAuditEvent(event),
);
let hasRunExitCleanup = false;

const DEV_SERVER_URL = process.env.SWITCHBOARDOS_DEV_SERVER_URL;
const SHOULD_OPEN_DEVTOOLS =
  process.env.SWITCHBOARDOS_OPEN_DEVTOOLS === '1' ||
  process.argv.includes('--open-devtools');

const RENDERER_INDEX = join(__dirname, '..', '..', 'renderer', 'index.html');
const PRELOAD_PATH = join(__dirname, '..', 'preload', 'preload.js');
const RENDERER_LOAD_RETRY_DELAYS_MS = [250, 1000];

function loadRenderer(window: BrowserWindow, attempt = 0): void {
  const loadPromise = DEV_SERVER_URL
    ? window.loadURL(DEV_SERVER_URL)
    : window.loadFile(RENDERER_INDEX);

  loadPromise.catch((err) => {
    const retryDelay = RENDERER_LOAD_RETRY_DELAYS_MS[attempt];
    if (retryDelay !== undefined && !window.isDestroyed()) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          loadRenderer(window, attempt + 1);
        }
      }, retryDelay);
      return;
    }

    console.error('Failed to load renderer:', err);
  });
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
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'persist:switchboardos',
    },
  });

  loadRenderer(mainWindow);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Keep default startup headless-safe; open DevTools only when explicitly requested.
  if (!app.isPackaged && SHOULD_OPEN_DEVTOOLS) {
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
  async () => {
    return mvpStore.listHosts();
  }
);

ipcMain.handle(
  'host:get',
  async (_event, hostId: string) => {
    return mvpStore.getHost(hostId);
  }
);

ipcMain.handle(
  'host:create',
  async (_event, hostData: CreateHostInput) => {
    return mvpStore.createHost(hostData);
  }
);

ipcMain.handle(
  'host:update',
  async (_event, hostId: string, hostData: UpdateHostInput) => {
    return mvpStore.updateHost(hostId, hostData);
  }
);

ipcMain.handle(
  'host:delete',
  async (_event, hostId: string) => {
    return mvpStore.deleteHost(hostId);
  }
);

ipcMain.handle(
  'host:test-connection',
  async (_event, hostId: string) => {
    return mvpStore.testConnection(hostId);
  }
);

// MVP settings
ipcMain.handle(
  'settings:get',
  async () => {
    return mvpStore.getSettings();
  }
);

ipcMain.handle(
  'settings:update',
  async (_event, update: MvpSettingsUpdate) => {
    return mvpStore.updateSettings(update);
  }
);

// Secret storage (OS keychain)
ipcMain.handle(
  'secret:store',
  async (_event, _key: string, _value: string): Promise<boolean> => {
    // TODO: Store in OS keychain
    console.warn('secret:store not yet implemented');
    return false;
  }
);

ipcMain.handle(
  'secret:retrieve',
  async (_event, _key: string): Promise<string | null> => {
    // TODO: Retrieve from OS keychain
    console.warn('secret:retrieve not yet implemented');
    return null;
  }
);

ipcMain.handle(
  'secret:delete',
  async (_event, _key: string): Promise<boolean> => {
    // TODO: Delete from OS keychain
    console.warn('secret:delete not yet implemented');
    return false;
  }
);

// Audit logging
ipcMain.handle(
  'audit:list',
  async () => {
    return mvpStore.listAuditEvents();
  }
);

ipcMain.handle(
  'audit:log',
  async (_event, event: CreateAuditEventInput) => {
    return mvpStore.logAuditEvent(event);
  }
);

// Terminal sessions
ipcMain.handle(
  'terminal:start',
  async (_event, hostId: string) => {
    return terminalSessions.start(hostId);
  }
);

ipcMain.handle(
  'terminal:write',
  async (_event, sessionId: string, input: string) => {
    return terminalSessions.write(sessionId, input);
  }
);

ipcMain.handle(
  'terminal:resize',
  async (_event, sessionId: string, cols: number, rows: number) => {
    return terminalSessions.resize(sessionId, cols, rows);
  }
);

ipcMain.handle(
  'terminal:stop',
  async (_event, sessionId: string) => {
    return terminalSessions.stop(sessionId);
  }
);

// Bootstrap generator
ipcMain.handle(
  'bootstrap:presets',
  async () => {
    return listBootstrapPresets();
  }
);

ipcMain.handle(
  'bootstrap:generate',
  async (_event, input: BootstrapGenerateInput) => {
    const hostId = input.hostId ?? null;
    const host = hostId ? mvpStore.getHost(hostId) : null;
    const result = generateBootstrapScript(input, host);
    mvpStore.logAuditEvent({
      type: 'bootstrap.generated',
      entityType: host ? 'host' : 'bootstrap',
      entityId: host?.id ?? null,
      message: `Generated ${result.preset.name} bootstrap script${host ? ` for ${host.name}` : ''}.`,
      metadata: {
        presetId: result.preset.id,
        hostId: host?.id ?? null,
        installPackages: input.options?.installPackages ?? true,
        includeDockerCheck: input.options?.includeDockerCheck ?? false,
        executesRemotely: false,
      },
    });
    return result;
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

function cleanupForExit(message: string): void {
  if (hasRunExitCleanup) {
    return;
  }

  hasRunExitCleanup = true;
  terminalSessions.stopAll(message);
  mvpStore.close();
  console.log('SwitchboardOS shutting down...');
}

// Graceful shutdown
app.on('will-quit', () => {
  cleanupForExit('Application is shutting down.');
});

function exitFromProcessSignal(): void {
  cleanupForExit('Application received a shutdown signal.');

  if (app.isReady()) {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.destroy();
    });
  }

  setImmediate(() => {
    process.exit(0);
  });
}

process.once('SIGTERM', exitFromProcessSignal);
process.once('SIGINT', exitFromProcessSignal);

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
