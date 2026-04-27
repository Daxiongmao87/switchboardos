/**
 * SwitchboardOS — Preload Script
 *
 * Bridges the renderer (Angular) to the Electron main process.
 * Exposes a narrow, typed API via window.sb (SwitchboardOS API).
 *
 * Security principles:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - No direct access to Electron, require, or Node APIs
 * - Only expose specific, typed IPC channels
 */

import { contextBridge, ipcRenderer } from 'electron';

// ============================================================
// Type declarations for the exposed API
// ============================================================

interface AppInfo {
  isPackaged: boolean;
  version: string;
  platform: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

interface HostRecord {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  connected?: boolean;
  lastSeen?: string;
}

interface DialogResult {
  filePaths: string[];
  canceled: boolean;
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================
// IPC helper — typed wrapper around ipcRenderer.invoke
// ============================================================

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args);
}

// ============================================================
// Exposed API — window.sb
// ============================================================

contextBridge.exposeInMainWorld('sb', {
  // --- App ---
  app: {
    getInfo: (): Promise<AppInfo> => invoke('app:get-info'),
  },

  // --- Window Management ---
  window: {
    minimize: (): Promise<void> => invoke('window:minimize'),
    maximize: (): Promise<void> => invoke('window:maximize'),
    close: (): Promise<void> => invoke('window:close'),
    getBounds: (): Promise<WindowBounds | null> => invoke('window:get-bounds'),
    restoreBounds: (bounds: WindowBounds): Promise<void> =>
      invoke('window:restore-bounds', bounds),
  },

  // --- Dialogs ---
  dialog: {
    openFile: (options?: Electron.OpenDialogOptions): Promise<DialogResult> =>
      invoke('dialog:open-file', options),
    openDirectory: (options?: Electron.OpenDialogOptions): Promise<DialogResult> =>
      invoke('dialog:open-directory', options),
  },

  // --- Host Management ---
  host: {
    list: (): Promise<HostRecord[]> => invoke('host:list'),
    get: (id: string): Promise<HostRecord | null> => invoke('host:get', id),
    create: (data: Omit<HostRecord, 'id'>): Promise<string> =>
      invoke('host:create', data),
    update: (id: string, data: Partial<HostRecord>): Promise<boolean> =>
      invoke('host:update', id, data),
    remove: (id: string): Promise<boolean> =>
      invoke('host:delete', id),
    testConnection: (id: string): Promise<{ success: boolean; error?: string }> =>
      invoke('host:test-connection', id),
  },

  // --- Secret Storage (OS Keychain) ---
  secret: {
    store: (key: string, value: string): Promise<boolean> =>
      invoke('secret:store', key, value),
    retrieve: (key: string): Promise<string | null> =>
      invoke('secret:retrieve', key),
    remove: (key: string): Promise<boolean> =>
      invoke('secret:delete', key),
  },

  // --- Audit ---
  audit: {
    log: (event: Record<string, unknown>): Promise<string> =>
      invoke('audit:log', event),
  },

  // --- Event Listening (one-way, main → renderer) ---
  on: (channel: string, callback: (...args: unknown[]) => void): void => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  // --- Remove all listeners for a channel ---
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Type augmentation so TypeScript knows about window.sb
declare global {
  interface Window {
    sb: {
      app: { getInfo: () => Promise<AppInfo> };
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        getBounds: () => Promise<WindowBounds | null>;
        restoreBounds: (bounds: WindowBounds) => Promise<void>;
      };
      dialog: {
        openFile: (options?: Electron.OpenDialogOptions) => Promise<DialogResult>;
        openDirectory: (options?: Electron.OpenDialogOptions) => Promise<DialogResult>;
      };
      host: {
        list: () => Promise<HostRecord[]>;
        get: (id: string) => Promise<HostRecord | null>;
        create: (data: Omit<HostRecord, 'id'>) => Promise<string>;
        update: (id: string, data: Partial<HostRecord>) => Promise<boolean>;
        remove: (id: string) => Promise<boolean>;
        testConnection: (id: string) => Promise<{ success: boolean; error?: string }>;
      };
      secret: {
        store: (key: string, value: string) => Promise<boolean>;
        retrieve: (key: string) => Promise<string | null>;
        remove: (key: string) => Promise<boolean>;
      };
      audit: {
        log: (event: Record<string, unknown>) => Promise<string>;
      };
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
