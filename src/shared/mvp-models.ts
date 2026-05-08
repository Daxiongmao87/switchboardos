export type HostAuthMode = 'placeholder' | 'password' | 'key' | 'agent';

export type HostConnectionStatus = 'untested' | 'stubbed' | 'success' | 'failed';

export interface HostRecord {
  id: string;
  name: string;
  address: string;
  hostname: string;
  port: number;
  username: string;
  authMode: HostAuthMode;
  keyPath?: string;
  tags: string[];
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

export interface MvpSettings {
  theme: 'system' | 'dark' | 'light';
  defaultWindowBehavior: 'floating' | 'tile-right' | 'tile-bottom';
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
  Pick<HostRecord, 'name' | 'address' | 'hostname' | 'port' | 'username' | 'authMode' | 'keyPath' | 'tags' | 'notes'>
>;

export type UpdateHostInput = Partial<CreateHostInput>;

export interface CreateAuditEventInput {
  type: string;
  entityType: string;
  entityId?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

export type MvpSettingsUpdate = Partial<Pick<MvpSettings, 'theme' | 'defaultWindowBehavior'>> & {
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

export type BootstrapPresetId = 'debian-ubuntu' | 'generic-posix';

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
