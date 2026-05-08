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
  tags: string[];
  notes: string;
  lastConnectionStatus: HostConnectionStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  hostId: string;
  status: 'stubbed' | 'not_found';
  success: boolean;
  message: string;
  checkedAt: string;
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
  Pick<HostRecord, 'name' | 'address' | 'hostname' | 'port' | 'username' | 'authMode' | 'tags' | 'notes'>
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
