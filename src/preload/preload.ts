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
  AgentEndpoint,
  AppManifest,
  AppPermission,
  AuditEvent,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPreset,
  BootstrapPresetRecord,
  BootstrapRun,
  CommandHistoryEntry,
  ConnectionTestResult,
  CreateAgentEndpointInput,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateAuditEventInput,
  CreateBootstrapPresetInput,
  CreateBootstrapRunInput,
  CreateCommandHistoryInput,
  CreateCredentialRefInput,
  CreateHostGroupInput,
  CreateHostInput,
  CreateHostTagInput,
  CreateWorkspaceProfileInput,
  CredentialRef,
  HostOperationInput,
  HostOperationResult,
  HostGroup,
  HostRecord,
  HostTag,
  MvpSettings,
  MvpSettingsUpdate,
  OperatorProposeInput,
  OperatorProposeResult,
  SshExecInput,
  SshExecResult,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalResizeResult,
  TerminalStartResult,
  TerminalStatusEvent,
  TerminalStopResult,
  TerminalWriteResult,
  UpdateAgentEndpointInput,
  UpdateAppManifestInput,
  UpdateBootstrapPresetInput,
  UpdateBootstrapRunInput,
  UpdateCredentialRefInput,
  UpdateHostGroupInput,
  UpdateHostInput,
  UpdateHostTagInput,
  UpdateWorkspaceProfileInput,
  WorkspaceProfile,
} from '../shared/mvp-models';

// ============================================================
// Type declarations for the exposed API
// ============================================================

interface WorkspaceFileEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  detail: string;
  path: string;
  updatedAt: string;
  size?: number;
}

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
    navigate: (route: string): void => {
      window.postMessage({ type: 'sb:navigate', route }, '*');
    },
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
    updateGroup: (hostId: string, groupName: string): Promise<HostRecord | null> =>
      invoke('host:updateGroup', hostId, groupName),
    setFavorite: (hostId: string, favorite: boolean): Promise<HostRecord | null> =>
      invoke('host:setFavorite', hostId, favorite),
    duplicate: (hostId: string): Promise<HostRecord | null> =>
      invoke('host:duplicate', hostId),
    import: (hosts: HostRecord[]): Promise<string[]> =>
      invoke('host:import', hosts),
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

  // --- Workspace Profiles ---
  workspace: {
    listProfiles: (): Promise<WorkspaceProfile[]> =>
      invoke('workspace:list-profiles'),
    getProfile: (profileId: string): Promise<WorkspaceProfile | null> =>
      invoke('workspace:get-profile', profileId),
    createProfile: (input: CreateWorkspaceProfileInput): Promise<WorkspaceProfile> =>
      invoke('workspace:create-profile', input),
    updateProfile: (profileId: string, input: UpdateWorkspaceProfileInput): Promise<WorkspaceProfile | null> =>
      invoke('workspace:update-profile', profileId, input),
    deleteProfile: (profileId: string): Promise<boolean> =>
      invoke('workspace:delete-profile', profileId),
    getActiveProfileId: (): Promise<string | null> =>
      invoke('workspace:get-active-profile-id'),
    setActiveProfileId: (profileId: string): Promise<string> =>
      invoke('workspace:set-active-profile-id', profileId),
  },

  workspaceFile: {
    list: (relativePath = ''): Promise<WorkspaceFileEntry[]> =>
      invoke('workspace-file:list', relativePath),
    createFolder: (targetPath = ''): Promise<WorkspaceFileEntry> =>
      invoke('workspace-file:create-folder', targetPath),
    createFile: (kind: 'applet' | 'scriptlet' | 'note', targetPath = ''): Promise<WorkspaceFileEntry> =>
      invoke('workspace-file:create-file', kind, targetPath),
    rename: (path: string, newName: string): Promise<WorkspaceFileEntry> =>
      invoke('workspace-file:rename', path, newName),
    duplicate: (path: string): Promise<WorkspaceFileEntry> =>
      invoke('workspace-file:duplicate', path),
    copy: (path: string, targetPath = ''): Promise<WorkspaceFileEntry> =>
      invoke('workspace-file:copy', path, targetPath),
    move: (path: string, targetPath = ''): Promise<WorkspaceFileEntry> =>
      invoke('workspace-file:move', path, targetPath),
    deletePermanent: (path: string): Promise<boolean> =>
      invoke('workspace-file:delete-permanent', path),
  },

  // --- Host Groups ---
  hostGroup: {
    list: (): Promise<HostGroup[]> => invoke('host-group:list'),
    get: (id: string): Promise<HostGroup | null> => invoke('host-group:get', id),
    create: (input: CreateHostGroupInput): Promise<HostGroup> => invoke('host-group:create', input),
    update: (id: string, input: UpdateHostGroupInput): Promise<HostGroup | null> => invoke('host-group:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('host-group:delete', id),
  },

  // --- Host Tags ---
  hostTag: {
    list: (): Promise<HostTag[]> => invoke('host-tag:list'),
    get: (id: string): Promise<HostTag | null> => invoke('host-tag:get', id),
    create: (input: CreateHostTagInput): Promise<HostTag> => invoke('host-tag:create', input),
    update: (id: string, input: UpdateHostTagInput): Promise<HostTag | null> => invoke('host-tag:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('host-tag:delete', id),
  },

  // --- Credential References ---
  credentialRef: {
    list: (): Promise<CredentialRef[]> => invoke('credential-ref:list'),
    get: (id: string): Promise<CredentialRef | null> => invoke('credential-ref:get', id),
    create: (input: CreateCredentialRefInput): Promise<CredentialRef> => invoke('credential-ref:create', input),
    update: (id: string, input: UpdateCredentialRefInput): Promise<CredentialRef | null> => invoke('credential-ref:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('credential-ref:delete', id),
  },

  // --- App Manifests ---
  appManifest: {
    list: (): Promise<AppManifest[]> => invoke('app-manifest:list'),
    get: (id: string): Promise<AppManifest | null> => invoke('app-manifest:get', id),
    create: (input: CreateAppManifestInput): Promise<AppManifest> => invoke('app-manifest:create', input),
    update: (id: string, input: UpdateAppManifestInput): Promise<AppManifest | null> => invoke('app-manifest:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('app-manifest:delete', id),
  },

  // --- App Permissions ---
  appPermission: {
    list: (appId?: string): Promise<AppPermission[]> => invoke('app-permission:list', appId),
    create: (input: CreateAppPermissionInput): Promise<AppPermission> => invoke('app-permission:create', input),
    remove: (id: string): Promise<boolean> => invoke('app-permission:delete', id),
  },

  // --- Agent Endpoints ---
  agentEndpoint: {
    list: (): Promise<AgentEndpoint[]> => invoke('agent-endpoint:list'),
    get: (id: string): Promise<AgentEndpoint | null> => invoke('agent-endpoint:get', id),
    create: (input: CreateAgentEndpointInput): Promise<AgentEndpoint> => invoke('agent-endpoint:create', input),
    update: (id: string, input: UpdateAgentEndpointInput): Promise<AgentEndpoint | null> => invoke('agent-endpoint:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('agent-endpoint:delete', id),
  },

  // --- Operator ---
  agent: {
    propose: (input: OperatorProposeInput): Promise<OperatorProposeResult> =>
      invoke('agent:propose', input),
  },

  // --- Bootstrap Presets ---
  bootstrapPreset: {
    list: (): Promise<BootstrapPresetRecord[]> => invoke('bootstrap-preset:list'),
    get: (id: string): Promise<BootstrapPresetRecord | null> => invoke('bootstrap-preset:get', id),
    create: (input: CreateBootstrapPresetInput): Promise<BootstrapPresetRecord> => invoke('bootstrap-preset:create', input),
    update: (id: string, input: UpdateBootstrapPresetInput): Promise<BootstrapPresetRecord | null> => invoke('bootstrap-preset:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('bootstrap-preset:delete', id),
  },

  // --- Bootstrap Runs ---
  bootstrapRun: {
    list: (): Promise<BootstrapRun[]> => invoke('bootstrap-run:list'),
    get: (id: string): Promise<BootstrapRun | null> => invoke('bootstrap-run:get', id),
    create: (input: CreateBootstrapRunInput): Promise<BootstrapRun> => invoke('bootstrap-run:create', input),
    update: (id: string, input: UpdateBootstrapRunInput): Promise<BootstrapRun | null> => invoke('bootstrap-run:update', id, input),
    remove: (id: string): Promise<boolean> => invoke('bootstrap-run:delete', id),
  },

  // --- Command History ---
  commandHistory: {
    list: (limit?: number): Promise<CommandHistoryEntry[]> => invoke('command-history:list', limit),
    create: (input: CreateCommandHistoryInput): Promise<CommandHistoryEntry> => invoke('command-history:create', input),
    remove: (id: string): Promise<boolean> => invoke('command-history:delete', id),
  },

  // --- Read-only Host Operations ---
  hostOperations: {
    run: (input: HostOperationInput): Promise<HostOperationResult> => invoke('host-operation:run', input),
  },

  // --- Structured SSH Execution ---
  ssh: {
    exec: (input: SshExecInput): Promise<SshExecResult> => invoke('ssh:exec', input),
  },

  // --- Bootstrap Generator ---
  bootstrap: {
    presets: (): Promise<BootstrapPreset[]> =>
      invoke('bootstrap:presets'),
    generate: (input: BootstrapGenerateInput): Promise<BootstrapGenerateResult> =>
      invoke('bootstrap:generate', input),
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
        navigate: (route: string) => void;
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
        updateGroup: (hostId: string, groupName: string) => Promise<HostRecord | null>;
        setFavorite: (hostId: string, favorite: boolean) => Promise<HostRecord | null>;
        duplicate: (hostId: string) => Promise<HostRecord | null>;
        import: (hosts: HostRecord[]) => Promise<string[]>;
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
      workspace: {
        listProfiles: () => Promise<WorkspaceProfile[]>;
        getProfile: (profileId: string) => Promise<WorkspaceProfile | null>;
        createProfile: (input: CreateWorkspaceProfileInput) => Promise<WorkspaceProfile>;
        updateProfile: (profileId: string, input: UpdateWorkspaceProfileInput) => Promise<WorkspaceProfile | null>;
        deleteProfile: (profileId: string) => Promise<boolean>;
        getActiveProfileId: () => Promise<string | null>;
        setActiveProfileId: (profileId: string) => Promise<string>;
      };
      workspaceFile: {
        list: (relativePath?: string) => Promise<WorkspaceFileEntry[]>;
        createFolder: (targetPath?: string) => Promise<WorkspaceFileEntry>;
        createFile: (kind: 'applet' | 'scriptlet' | 'note', targetPath?: string) => Promise<WorkspaceFileEntry>;
        rename: (path: string, newName: string) => Promise<WorkspaceFileEntry>;
        copy: (path: string, targetPath?: string) => Promise<WorkspaceFileEntry>;
        move: (path: string, targetPath?: string) => Promise<WorkspaceFileEntry>;
        deletePermanent: (path: string) => Promise<boolean>;
      };
      hostGroup: {
        list: () => Promise<HostGroup[]>;
        get: (id: string) => Promise<HostGroup | null>;
        create: (input: CreateHostGroupInput) => Promise<HostGroup>;
        update: (id: string, input: UpdateHostGroupInput) => Promise<HostGroup | null>;
        remove: (id: string) => Promise<boolean>;
      };
      hostTag: {
        list: () => Promise<HostTag[]>;
        get: (id: string) => Promise<HostTag | null>;
        create: (input: CreateHostTagInput) => Promise<HostTag>;
        update: (id: string, input: UpdateHostTagInput) => Promise<HostTag | null>;
        remove: (id: string) => Promise<boolean>;
      };
      credentialRef: {
        list: () => Promise<CredentialRef[]>;
        get: (id: string) => Promise<CredentialRef | null>;
        create: (input: CreateCredentialRefInput) => Promise<CredentialRef>;
        update: (id: string, input: UpdateCredentialRefInput) => Promise<CredentialRef | null>;
        remove: (id: string) => Promise<boolean>;
      };
      appManifest: {
        list: () => Promise<AppManifest[]>;
        get: (id: string) => Promise<AppManifest | null>;
        create: (input: CreateAppManifestInput) => Promise<AppManifest>;
        update: (id: string, input: UpdateAppManifestInput) => Promise<AppManifest | null>;
        remove: (id: string) => Promise<boolean>;
      };
      appPermission: {
        list: (appId?: string) => Promise<AppPermission[]>;
        create: (input: CreateAppPermissionInput) => Promise<AppPermission>;
        remove: (id: string) => Promise<boolean>;
      };
      agentEndpoint: {
        list: () => Promise<AgentEndpoint[]>;
        get: (id: string) => Promise<AgentEndpoint | null>;
        create: (input: CreateAgentEndpointInput) => Promise<AgentEndpoint>;
        update: (id: string, input: UpdateAgentEndpointInput) => Promise<AgentEndpoint | null>;
        remove: (id: string) => Promise<boolean>;
      };
      agent: {
        propose: (input: OperatorProposeInput) => Promise<OperatorProposeResult>;
      };
      bootstrapPreset: {
        list: () => Promise<BootstrapPresetRecord[]>;
        get: (id: string) => Promise<BootstrapPresetRecord | null>;
        create: (input: CreateBootstrapPresetInput) => Promise<BootstrapPresetRecord>;
        update: (id: string, input: UpdateBootstrapPresetInput) => Promise<BootstrapPresetRecord | null>;
        remove: (id: string) => Promise<boolean>;
      };
      bootstrapRun: {
        list: () => Promise<BootstrapRun[]>;
        get: (id: string) => Promise<BootstrapRun | null>;
        create: (input: CreateBootstrapRunInput) => Promise<BootstrapRun>;
        update: (id: string, input: UpdateBootstrapRunInput) => Promise<BootstrapRun | null>;
        remove: (id: string) => Promise<boolean>;
      };
      commandHistory: {
        list: (limit?: number) => Promise<CommandHistoryEntry[]>;
        create: (input: CreateCommandHistoryInput) => Promise<CommandHistoryEntry>;
        remove: (id: string) => Promise<boolean>;
      };
      hostOperations: {
        run: (input: HostOperationInput) => Promise<HostOperationResult>;
      };
      ssh: {
        exec: (input: SshExecInput) => Promise<SshExecResult>;
      };
      bootstrap: {
        presets: () => Promise<BootstrapPreset[]>;
        generate: (input: BootstrapGenerateInput) => Promise<BootstrapGenerateResult>;
      };
    };
  }
}
