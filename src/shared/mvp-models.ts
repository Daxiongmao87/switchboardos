export type HostAuthMode = 'placeholder' | 'password' | 'key' | 'agent';

export type HostConnectionStatus = 'untested' | 'stubbed' | 'success' | 'failed';
export type HostBootstrapStatus = 'unknown' | 'not_started' | 'pending' | 'ready' | 'failed';

export interface HostRecord {
  id: string;
  name: string;
  address: string;
  hostname: string;
  port: number;
  username: string;
  authMode: HostAuthMode;
  keyPath?: string;
  credentialRefId: string | null;
  tags: string[];
  group?: string;
  favorite?: boolean;
  osHint: string;
  bootstrapStatus: HostBootstrapStatus;
  defaultShell: string;
  defaultWorkingDirectory: string;
  capabilities: string[];
  notes: string;
  lastConnectionStatus: HostConnectionStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionTestStatus = 'success' | 'failed' | 'not_found';

export interface ConnectionTestResult {
  hostId: string;
  status: ConnectionTestStatus;
  success: boolean;
  message: string;
  checkedAt: string;
  address?: string;
  port?: number;
  latencyMs?: number;
  banner?: string;
  protocolDetected?: 'ssh' | 'unknown';
  errorCode?: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  entityType: string;
  entityId: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export type DesktopWallpaperMode = 'default' | 'grid' | 'topology' | 'plain';
export type DesktopWallpaperLayoutMode = 'fill' | 'fit' | 'stretch' | 'fit-tile' | 'tile-original' | 'center';

export interface MvpSettings {
  theme: 'system' | 'dark' | 'light';
  defaultWindowBehavior: 'floating' | 'tile-right' | 'tile-bottom';
  desktopWallpaper: DesktopWallpaperMode;
  desktopWallpaperLayout: DesktopWallpaperLayoutMode;
  sshDefaults: {
    port: number;
    username: string;
    authMode: HostAuthMode;
    connectTimeoutMs: number;
  };
  operator: {
    endpoint: string;
    policy: 'manual-approval' | 'disabled';
  };
}

export interface MvpStoreState {
  schemaVersion: 1;
  hosts: HostRecord[];
  auditEvents: AuditEvent[];
  settings: MvpSettings;
}

export type CreateHostInput = Partial<
  Pick<
    HostRecord,
    | 'name'
    | 'address'
    | 'hostname'
    | 'port'
    | 'username'
    | 'authMode'
    | 'keyPath'
    | 'credentialRefId'
    | 'tags'
    | 'group'
    | 'favorite'
    | 'osHint'
    | 'bootstrapStatus'
    | 'defaultShell'
    | 'defaultWorkingDirectory'
    | 'capabilities'
    | 'notes'
  >
>;

export type UpdateHostInput = Partial<CreateHostInput>;

export interface CreateAuditEventInput {
  type: string;
  entityType: string;
  entityId?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

export type MvpSettingsUpdate = Partial<
  Pick<MvpSettings, 'theme' | 'defaultWindowBehavior' | 'desktopWallpaper' | 'desktopWallpaperLayout'>
> & {
  sshDefaults?: Partial<MvpSettings['sshDefaults']>;
  operator?: Partial<MvpSettings['operator']>;
};

export type TerminalSessionStatus = 'starting' | 'active' | 'failed' | 'exited' | 'stopped';

export interface TerminalStartResult {
  sessionId: string | null;
  status: 'started' | 'failed';
  message: string;
  hostId: string;
}

export interface TerminalWriteResult {
  sessionId: string;
  success: boolean;
  message: string;
}

export interface TerminalResizeResult {
  sessionId: string;
  success: boolean;
  message: string;
  cols: number;
  rows: number;
}

export interface TerminalStopResult {
  sessionId: string;
  success: boolean;
  message: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  hostId: string;
  stream: 'stdout' | 'stderr' | 'system';
  data: string;
  createdAt: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  hostId: string;
  status: 'exited' | 'failed' | 'stopped';
  exitCode: number | null;
  signal: string | null;
  message: string;
  createdAt: string;
}

export interface TerminalStatusEvent {
  sessionId: string;
  hostId: string;
  status: TerminalSessionStatus;
  message: string;
  createdAt: string;
}

export type BootstrapPresetId =
  | 'debian-ubuntu'
  | 'rhel-family'
  | 'arch-linux'
  | 'macos'
  | 'windows-openssh'
  | 'generic-posix';

export interface BootstrapPreset {
  id: BootstrapPresetId;
  name: string;
  description: string;
}

export interface BootstrapGenerateOptions {
  installPackages?: boolean;
  includeDockerCheck?: boolean;
}

export interface BootstrapGenerateInput {
  presetId: BootstrapPresetId;
  hostId?: string | null;
  options?: BootstrapGenerateOptions;
}

export interface BootstrapGenerateResult {
  preset: BootstrapPreset;
  hostId: string | null;
  script: string;
  generatedAt: string;
}

export type ShellWindowState = 'floating' | 'tiled' | 'minimized' | 'maximized' | 'fullscreen';

export type ShellTilePosition =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface ShellWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShellWindowAction {
  id: string;
  label: string;
  description: string;
}

export interface ShellWindowSemanticState {
  kind: string;
  status: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface ShellWindowSnapshot {
  windowId: string;
  appId: string;
  hostId: string | null;
  title: string;
  bounds: ShellWindowBounds;
  state: ShellWindowState;
  tilePosition: ShellTilePosition | null;
  focused: boolean;
  zIndex: number;
  semanticState: ShellWindowSemanticState;
  registeredActions: ShellWindowAction[];
}

export interface WorkspaceLayoutSnapshot {
  desktopShortcutIds: Array<{
    id: string;
    appId: string;
    shellOwned?: boolean;
  }>;
  windows: Array<Omit<ShellWindowSnapshot, 'focused' | 'semanticState' | 'registeredActions'>>;
}

export interface WorkspaceProfile {
  profileId: string;
  name: string;
  updatedAt: string;
  layout: WorkspaceLayoutSnapshot;
}

export type CreateWorkspaceProfileInput = Pick<WorkspaceProfile, 'name' | 'layout'>;

export type UpdateWorkspaceProfileInput = Partial<Pick<WorkspaceProfile, 'name' | 'layout'>>;

// ============================================================
// Host Groups
// ============================================================

export interface HostGroup {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateHostGroupInput = Pick<HostGroup, 'name' | 'color'>;
export type UpdateHostGroupInput = Partial<CreateHostGroupInput>;

// ============================================================
// Host Tags (normalized)
// ============================================================

export interface HostTag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateHostTagInput = Pick<HostTag, 'name' | 'color'>;
export type UpdateHostTagInput = Partial<CreateHostTagInput>;

// ============================================================
// Credential References
// Stores non-secret references only. Secrets live in OS keychain,
// ssh-agent, or external files — never in SQLite.
// ============================================================

export type CredentialType = 'keychain_ref' | 'file_path' | 'ssh_agent' | 'env_var';

export interface CredentialRef {
  id: string;
  name: string;
  type: CredentialType;
  referenceValue: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type CreateCredentialRefInput = Pick<CredentialRef, 'name' | 'type' | 'referenceValue'> & {
  metadata?: Record<string, unknown>;
};
export type UpdateCredentialRefInput = Partial<CreateCredentialRefInput>;

// ============================================================
// App Manifests
// ============================================================

export interface AppManifest {
  id: string;
  appId: string;
  name: string;
  description: string;
  version: string;
  author: string;
  entrypoint: string;
  icon: string;
  category: string;
  capabilities: string[];
  sourceCode: string;
  packageMetadata: Record<string, unknown>;
  enabled: boolean;
  installedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateAppManifestInput = Pick<AppManifest, 'appId' | 'name' | 'version' | 'entrypoint'> & {
  description?: string;
  author?: string;
  icon?: string;
  category?: string;
  capabilities?: string[];
  sourceCode?: string;
  packageMetadata?: Record<string, unknown>;
  enabled?: boolean;
  installedAt?: string | null;
};
export type UpdateAppManifestInput = Partial<CreateAppManifestInput>;

// ============================================================
// App Permissions
// ============================================================

export interface AppPermission {
  id: string;
  appId: string;
  capability: string;
  granted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateAppPermissionInput = Pick<AppPermission, 'appId' | 'capability' | 'granted'>;

// ============================================================
// Agent Endpoints
// API key is stored as a credential reference ID, never raw.
// ============================================================

export interface AgentEndpoint {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  credentialRefId: string | null;
  model: string;
  contextLimit: number;
  toolUse: boolean;
  streaming: boolean;
  policy: 'safe' | 'balanced' | 'permissive' | 'full-trust';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateAgentEndpointInput = Pick<AgentEndpoint, 'name' | 'provider' | 'baseUrl' | 'model'> & {
  credentialRefId?: string | null;
  contextLimit?: number;
  toolUse?: boolean;
  streaming?: boolean;
  policy?: AgentEndpoint['policy'];
  enabled?: boolean;
};
export type UpdateAgentEndpointInput = Partial<CreateAgentEndpointInput>;

export type OperatorProposalRisk = 'low' | 'medium' | 'high';
export type OperatorProposalSource = 'provider' | 'fallback';
export type OperatorProposalStatus = 'pending' | 'approved' | 'dispatched' | 'failed';

export interface OperatorProposal {
  id: string;
  title: string;
  command: string;
  rationale: string;
  risk: OperatorProposalRisk;
  status: OperatorProposalStatus;
  message: string;
  source: OperatorProposalSource;
}

export interface OperatorContextSnapshot {
  request: string;
  selectedHost: {
    id: string;
    name: string;
    address: string;
    port: number;
    username: string | null;
    osHint: string;
    bootstrapStatus: string;
    capabilities: string[];
    lastConnectionStatus: HostConnectionStatus;
  };
  hosts: Array<{
    id: string;
    name: string;
    address: string;
    lastConnectionStatus: HostConnectionStatus;
    tags: string[];
  }>;
  policy: MvpSettings['operator']['policy'];
  warnings: string[];
  untrustedHostOutput: Array<{
    hostId: string;
    source: string;
    summary: string;
  }>;
}

export interface OperatorProposeInput {
  hostId: string;
  request: string;
}

export interface OperatorProposeResult {
  mode: 'provider' | 'fallback';
  endpointId: string | null;
  endpointName: string | null;
  proposals: OperatorProposal[];
  context: OperatorContextSnapshot;
  warnings: string[];
}

// ============================================================
// Bootstrap Presets (persisted)
// ============================================================

export interface BootstrapPresetRecord {
  id: string;
  presetId: string;
  name: string;
  description: string;
  scriptTemplate: string;
  variables: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateBootstrapPresetInput = Pick<BootstrapPresetRecord, 'presetId' | 'name' | 'description' | 'scriptTemplate'> & {
  variables?: string[];
  enabled?: boolean;
};
export type UpdateBootstrapPresetInput = Partial<CreateBootstrapPresetInput>;

// ============================================================
// Bootstrap Runs
// ============================================================

export interface BootstrapRun {
  id: string;
  presetId: string;
  hostId: string | null;
  scriptOutput: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export type CreateBootstrapRunInput = Pick<BootstrapRun, 'presetId' | 'hostId' | 'scriptOutput' | 'status'>;
export type UpdateBootstrapRunInput = Partial<Pick<BootstrapRun, 'scriptOutput' | 'status'>>;

// ============================================================
// Command History Metadata
// ============================================================

export interface CommandHistoryEntry {
  id: string;
  hostId: string | null;
  sessionId: string | null;
  command: string;
  exitCode: number | null;
  durationMs: number | null;
  createdAt: string;
}

export type CreateCommandHistoryInput = Pick<CommandHistoryEntry, 'command'> & {
  hostId?: string | null;
  sessionId?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
};

// ============================================================
// SSH Service
// Main-process owned. Renderer/hosted clients receive structured
// results only through typed IPC/hosted APIs.
// ============================================================

export type SshExecStatus = 'success' | 'failed' | 'unsupported';

export interface SshExecInput {
  hostId: string;
  command: string;
  timeoutMs?: number;
}

export interface SshExecResult {
  hostId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  status: SshExecStatus;
  error: string | null;
}

export interface SshFileListInput {
  hostId: string;
  path?: string;
  limit?: number;
  timeoutMs?: number;
}

export interface SshFileStatInput {
  hostId: string;
  path: string;
  timeoutMs?: number;
}

export interface SshFileTransferInput {
  hostId: string;
  localPath: string;
  remotePath: string;
  timeoutMs?: number;
}

export interface SshFileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other' | 'unknown';
  size: number | null;
  modified: string | null;
  permissions: string;
  owner: string;
  group: string;
}

export interface SshFileStatResult {
  hostId: string;
  path: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  status: SshExecStatus;
  error: string | null;
  entry: SshFileEntry | null;
}

export interface SshFileListResult {
  hostId: string;
  path: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  status: SshExecStatus;
  error: string | null;
  entries: SshFileEntry[];
}

export interface SshFileTransferResult {
  hostId: string;
  localPath: string;
  remotePath: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  status: SshExecStatus;
  error: string | null;
  direction: 'upload' | 'download';
}

// ============================================================
// Read-only Host Operations
// ============================================================

export type HostOperationKind = 'files' | 'processes' | 'services' | 'logs' | 'metrics';

export interface HostOperationInput {
  hostId: string;
  kind: HostOperationKind;
  path?: string;
  filter?: string;
  limit?: number;
}

export interface HostOperationResult {
  hostId: string;
  kind: HostOperationKind;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  status: SshExecStatus;
  error: string | null;
  summary: string;
  rows: Array<Record<string, string | number | boolean | null>>;
}
