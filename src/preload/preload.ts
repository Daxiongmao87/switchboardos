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
import type {
  AuditEvent,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPreset,
  ConnectionTestResult,
  CreateAuditEventInput,
  CreateHostInput,
  HostRecord,
  MvpSettings,
  MvpSettingsUpdate,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalResizeResult,
  TerminalStartResult,
  TerminalStatusEvent,
  TerminalStopResult,
  TerminalWriteResult,
  UpdateHostInput,
} from '../shared/mvp-models';

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

function subscribe<T>(
  channel: string,
  callback: (event: T) => void,
): (() => void) {
  const subscription = (_event: Electron.IpcRendererEvent, payload: T) => {
    callback(payload);
  };
  ipcRenderer.on(channel, subscription);
  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
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
    create: (data: CreateHostInput): Promise<HostRecord> =>
      invoke('host:create', data),
    update: (id: string, data: UpdateHostInput): Promise<HostRecord | null> =>
      invoke('host:update', id, data),
    remove: (id: string): Promise<boolean> =>
      invoke('host:delete', id),
    testConnection: (id: string): Promise<ConnectionTestResult> =>
      invoke('host:test-connection', id),
  },

  // --- MVP Settings ---
  settings: {
    get: (): Promise<MvpSettings> => invoke('settings:get'),
    update: (update: MvpSettingsUpdate): Promise<MvpSettings> =>
      invoke('settings:update', update),
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
    list: (): Promise<AuditEvent[]> => invoke('audit:list'),
    log: (event: CreateAuditEventInput): Promise<AuditEvent> =>
      invoke('audit:log', event),
  },

  // --- Terminal Sessions ---
  terminal: {
    start: (hostId: string): Promise<TerminalStartResult> =>
      invoke('terminal:start', hostId),
    write: (sessionId: string, input: string): Promise<TerminalWriteResult> =>
      invoke('terminal:write', sessionId, input),
    resize: (sessionId: string, cols: number, rows: number): Promise<TerminalResizeResult> =>
      invoke('terminal:resize', sessionId, cols, rows),
    stop: (sessionId: string): Promise<TerminalStopResult> =>
      invoke('terminal:stop', sessionId),
    onOutput: (callback: (event: TerminalOutputEvent) => void): (() => void) =>
      subscribe('terminal:output', callback),
    onStatus: (callback: (event: TerminalStatusEvent) => void): (() => void) =>
      subscribe('terminal:status', callback),
    onExit: (callback: (event: TerminalExitEvent) => void): (() => void) =>
      subscribe('terminal:exit', callback),
  },

  // --- Bootstrap Generator ---
  bootstrap: {
    presets: (): Promise<BootstrapPreset[]> =>
      invoke('bootstrap:presets'),
    generate: (input: BootstrapGenerateInput): Promise<BootstrapGenerateResult> =>
      invoke('bootstrap:generate', input),
  },

  // --- Event Listening (one-way, main → renderer) ---
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
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
        create: (data: CreateHostInput) => Promise<HostRecord>;
        update: (id: string, data: UpdateHostInput) => Promise<HostRecord | null>;
        remove: (id: string) => Promise<boolean>;
        testConnection: (id: string) => Promise<ConnectionTestResult>;
      };
      settings: {
        get: () => Promise<MvpSettings>;
        update: (update: MvpSettingsUpdate) => Promise<MvpSettings>;
      };
      secret: {
        store: (key: string, value: string) => Promise<boolean>;
        retrieve: (key: string) => Promise<string | null>;
        remove: (key: string) => Promise<boolean>;
      };
      audit: {
        list: () => Promise<AuditEvent[]>;
        log: (event: CreateAuditEventInput) => Promise<AuditEvent>;
      };
      terminal: {
        start: (hostId: string) => Promise<TerminalStartResult>;
        write: (sessionId: string, input: string) => Promise<TerminalWriteResult>;
        resize: (sessionId: string, cols: number, rows: number) => Promise<TerminalResizeResult>;
        stop: (sessionId: string) => Promise<TerminalStopResult>;
        onOutput: (callback: (event: TerminalOutputEvent) => void) => () => void;
        onStatus: (callback: (event: TerminalStatusEvent) => void) => () => void;
        onExit: (callback: (event: TerminalExitEvent) => void) => () => void;
      };
      bootstrap: {
        presets: () => Promise<BootstrapPreset[]>;
        generate: (input: BootstrapGenerateInput) => Promise<BootstrapGenerateResult>;
      };
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
