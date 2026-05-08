import type {
  AuditEvent,
  ConnectionTestResult,
  CreateAuditEventInput,
  CreateHostInput,
  HostRecord,
  MvpSettings,
  MvpSettingsUpdate,
  UpdateHostInput,
} from '../../shared/mvp-models';

export interface AppInfo {
  isPackaged: boolean;
  version: string;
  platform: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

export interface SwitchboardApi {
  app: {
    getInfo: () => Promise<AppInfo>;
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
  audit: {
    list: () => Promise<AuditEvent[]>;
    log: (event: CreateAuditEventInput) => Promise<AuditEvent>;
  };
}

export function getSwitchboardApi(): SwitchboardApi | undefined {
  return (window as unknown as { sb?: SwitchboardApi }).sb;
}
