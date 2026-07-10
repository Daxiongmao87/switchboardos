import type {
  AuditEvent,
  AgentEndpoint,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPreset,
  BootstrapPresetRecord,
  BootstrapRun,
  CommandHistoryEntry,
  ConnectionTestResult,
  AppManifest,
  AppPermission,
  AppScopedStorageDeleteResult,
  AppScopedStorageGetResult,
  AppScopedStorageRecord,
  GeneratedAppHostCapabilitiesResult,
  GeneratedAppHostExecResult,
  GeneratedAppHostGetResult,
  GeneratedAppHostListResult,
  GeneratedAppHostStatusResult,
  GeneratedAppHostTestConnectionResult,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateAuditEventInput,
  CreateAgentEndpointInput,
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
  OperatorActionExecuteInput,
  OperatorActionExecuteResult,
  OperatorProposeInput,
  OperatorProposeResult,
  SshExecInput,
  SshExecResult,
  SshFileDeleteInput,
  SshFileDeleteResult,
  SshFileListInput,
  SshFileListResult,
  SshFileMoveInput,
  SshFileMoveResult,
  SshFileStatInput,
  SshFileStatResult,
  SshFileTransferInput,
  SshFileTransferResult,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalResizeResult,
  TerminalStartResult,
  TerminalStatusEvent,
  TerminalStopResult,
  TerminalWriteResult,
  UpdateAppManifestInput,
  UpdateAgentEndpointInput,
  UpdateBootstrapPresetInput,
  UpdateBootstrapRunInput,
  UpdateCredentialRefInput,
  UpdateHostGroupInput,
  UpdateHostInput,
  UpdateHostTagInput,
  UpdateWorkspaceProfileInput,
  WorkspaceArtifactContentRecord,
  WorkspaceScriptletRunInput,
  WorkspaceScriptletRunResult,
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
  workspaceArtifactContent: {
    get: (path: string) => Promise<WorkspaceArtifactContentRecord>;
    update: (path: string, content: string) => Promise<WorkspaceArtifactContentRecord>;
  };
  workspaceScriptlet: {
    run: (input: WorkspaceScriptletRunInput) => Promise<WorkspaceScriptletRunResult>;
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
  bootstrap: {
    presets: () => Promise<BootstrapPreset[]>;
    generate: (input: BootstrapGenerateInput) => Promise<BootstrapGenerateResult>;
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
    get: (id: string) => Promise<CommandHistoryEntry | null>;
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
  appStorage: {
    get: (appId: string, key: string) => Promise<AppScopedStorageGetResult>;
    set: (appId: string, key: string, value: string) => Promise<AppScopedStorageRecord>;
    remove: (appId: string, key: string) => Promise<AppScopedStorageDeleteResult>;
  };
  appHost: {
    listHosts: (appId: string, windowId: string) => Promise<GeneratedAppHostListResult>;
    getHost: (appId: string, windowId: string, hostId: string) => Promise<GeneratedAppHostGetResult>;
    getHostStatus: (appId: string, windowId: string, hostId: string) => Promise<GeneratedAppHostStatusResult>;
    getCapabilities: (appId: string, windowId: string, hostId: string) => Promise<GeneratedAppHostCapabilitiesResult>;
    testConnection: (appId: string, windowId: string, hostId: string) => Promise<GeneratedAppHostTestConnectionResult>;
    exec: (
      appId: string,
      windowId: string,
      hostId: string,
      command: string,
      options?: { timeoutMs?: number },
    ) => Promise<GeneratedAppHostExecResult>;
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
    executeAction: (input: OperatorActionExecuteInput) => Promise<OperatorActionExecuteResult>;
  };
  ssh: {
    exec: (input: SshExecInput) => Promise<SshExecResult>;
  };
  sshFile: {
    list: (input: SshFileListInput) => Promise<SshFileListResult>;
    stat: (input: SshFileStatInput) => Promise<SshFileStatResult>;
    download: (input: SshFileTransferInput) => Promise<SshFileTransferResult>;
    upload: (input: SshFileTransferInput) => Promise<SshFileTransferResult>;
    delete: (input: SshFileDeleteInput) => Promise<SshFileDeleteResult>;
    move: (input: SshFileMoveInput) => Promise<SshFileMoveResult>;
  };
}

export function getSwitchboardApi(): SwitchboardApi | undefined {
  return (window as unknown as { sb?: SwitchboardApi }).sb;
}
