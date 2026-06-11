import type {
  AuditEvent,
  AgentEndpoint,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPreset,
  CommandHistoryEntry,
  ConnectionTestResult,
  AppManifest,
  AppPermission,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateAuditEventInput,
  CreateAgentEndpointInput,
  CreateCommandHistoryInput,
  CreateHostInput,
  CreateWorkspaceProfileInput,
  HostOperationInput,
  HostOperationResult,
  HostRecord,
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
  UpdateAppManifestInput,
  UpdateAgentEndpointInput,
  UpdateHostInput,
  UpdateWorkspaceProfileInput,
  WorkspaceProfile,
} from '../../shared/mvp-models';

export interface AppInfo {
  isPackaged: boolean;
  version: string;
  platform: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  hosted?: boolean;
}

interface DialogResult {
  filePaths: string[];
  canceled: boolean;
}

interface WorkspaceFileEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  detail: string;
  path: string;
  updatedAt: string;
  size?: number;
}

export interface WorkspaceTrashEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  originalPath: string;
  trashPath: string;
  deletedAt: string;
  updatedAt: string;
  size: number;
}

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SwitchboardApi {
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    getBounds: () => Promise<WindowBounds | null>;
    restoreBounds: (bounds: WindowBounds) => Promise<void>;
    navigate: (route: string) => void;
  };
  dialog: {
    openFile: (options?: Record<string, unknown>) => Promise<DialogResult>;
    openDirectory: (options?: Record<string, unknown>) => Promise<DialogResult>;
  };
  host: {
    list: () => Promise<HostRecord[]>;
    get: (id: string) => Promise<HostRecord | null>;
    create: (data: CreateHostInput) => Promise<HostRecord>;
    update: (id: string, data: UpdateHostInput) => Promise<HostRecord | null>;
    remove: (id: string) => Promise<boolean>;
    testConnection: (id: string) => Promise<ConnectionTestResult>;
    updateGroup: (id: string, groupName: string) => Promise<HostRecord | null>;
    setFavorite: (id: string, favorite: boolean) => Promise<HostRecord | null>;
    duplicate: (id: string) => Promise<HostRecord | null>;
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
    duplicate: (path: string) => Promise<WorkspaceFileEntry>;
    copy: (path: string, targetPath?: string) => Promise<WorkspaceFileEntry>;
    move: (path: string, targetPath?: string) => Promise<WorkspaceFileEntry>;
    deletePermanent: (path: string) => Promise<boolean>;
    listTrash: () => Promise<WorkspaceTrashEntry[]>;
    moveToTrash: (path: string) => Promise<WorkspaceTrashEntry>;
    restoreTrashItem: (id: string) => Promise<WorkspaceFileEntry>;
    deleteTrashItemPermanent: (id: string) => Promise<boolean>;
    emptyTrash: () => Promise<boolean>;
  };
  bootstrap: {
    presets: () => Promise<BootstrapPreset[]>;
    generate: (input: BootstrapGenerateInput) => Promise<BootstrapGenerateResult>;
  };
  commandHistory: {
    list: (limit?: number) => Promise<CommandHistoryEntry[]>;
    create: (input: CreateCommandHistoryInput) => Promise<CommandHistoryEntry>;
    remove: (id: string) => Promise<boolean>;
  };
  hostOperations: {
    run: (input: HostOperationInput) => Promise<HostOperationResult>;
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
  ssh: {
    exec: (input: SshExecInput) => Promise<SshExecResult>;
  };
}

export function getSwitchboardApi(): SwitchboardApi | undefined {
  return (window as unknown as { sb?: SwitchboardApi }).sb;
}
