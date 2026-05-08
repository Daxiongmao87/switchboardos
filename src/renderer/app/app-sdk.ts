import type { AuditEvent, HostRecord, MvpSettings } from '../../shared/mvp-models';

export type SwitchboardAppPanelMode = 'floating' | 'tile-right' | 'tile-bottom';

export interface SwitchboardAppManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  category: 'dashboard' | 'diagnostic' | 'visualization';
  defaultPanelMode: SwitchboardAppPanelMode;
}

export interface SwitchboardAppContext {
  hosts: HostRecord[];
  auditEvents: AuditEvent[];
  settings: MvpSettings | null;
  generatedAt: string;
}

export const EXAMPLE_HOST_MAP_APP: SwitchboardAppManifest = {
  id: 'example-host-status-map',
  name: 'Host Status Map',
  description: 'Example graphical app that visualizes local host status and recent activity.',
  version: '0.1.0',
  category: 'visualization',
  defaultPanelMode: 'floating',
};

export const BUILTIN_APP_MANIFESTS: SwitchboardAppManifest[] = [
  EXAMPLE_HOST_MAP_APP,
];
