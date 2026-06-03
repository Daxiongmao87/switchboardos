import type { AuditEvent, HostRecord, MvpSettings } from '../../shared/mvp-models';

export type SwitchboardAppPanelMode = 'floating' | 'tile-right' | 'tile-bottom';
export type SwitchboardAppCategory = 'dashboard' | 'diagnostic' | 'visualization' | 'authoring' | 'operations';
export type SwitchboardAppCapability =
  | 'host:read'
  | 'host:actions'
  | 'host:terminal'
  | 'command:read'
  | 'files:read'
  | 'services:read'
  | 'processes:read'
  | 'logs:read'
  | 'metrics:read'
  | 'storage:scoped'
  | 'local:config:read'
  | 'agent:read-state'
  | 'actions:register'
  | 'notifications:create'
  | 'secrets:reference-only';

export interface SwitchboardAppActionDescriptor {
  id: string;
  label: string;
  description: string;
  capability?: SwitchboardAppCapability;
}

export interface SwitchboardAgentReadableState {
  appId: string;
  windowId?: string;
  hostId?: string;
  summary: string;
  entities: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  availableActions: SwitchboardAppActionDescriptor[];
  riskHints?: string[];
}

export interface SwitchboardGraphicsPrimitive {
  kind: 'svg' | 'chart' | 'node-link' | 'timeline' | 'status-bar';
  semanticRole: string;
  entityIds: string[];
}

export type SwitchboardUiPrimitiveKind = 'tab-strip' | 'toolbar' | 'status-bar';
export type SwitchboardUiStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface SwitchboardUiPrimitiveBase {
  kind: SwitchboardUiPrimitiveKind;
  semanticRole: string;
  dataTestId: string;
  className: string;
}

export interface SwitchboardTabItem {
  id: string;
  label: string;
  active: boolean;
  disabled?: boolean;
  badge?: string;
}

export interface SwitchboardTabPrimitive extends SwitchboardUiPrimitiveBase {
  kind: 'tab-strip';
  tabs: SwitchboardTabItem[];
}

export interface SwitchboardToolbarAction {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  capability?: SwitchboardAppCapability;
}

export interface SwitchboardToolbarPrimitive extends SwitchboardUiPrimitiveBase {
  kind: 'toolbar';
  actions: SwitchboardToolbarAction[];
}

export interface SwitchboardStatusBarItem {
  id: string;
  label: string;
  value: string;
  tone?: SwitchboardUiStatusTone;
}

export interface SwitchboardStatusBarPrimitive extends SwitchboardUiPrimitiveBase {
  kind: 'status-bar';
  items: SwitchboardStatusBarItem[];
}

export type SwitchboardUiPrimitive =
  | SwitchboardTabPrimitive
  | SwitchboardToolbarPrimitive
  | SwitchboardStatusBarPrimitive;

export const SWITCHBOARD_STANDARD_UI_PRIMITIVES: SwitchboardUiPrimitive[] = [
  {
    kind: 'tab-strip',
    semanticRole: 'custom app section navigation tabs',
    dataTestId: 'app-sdk-tabs',
    className: 'sb-ui-tabs',
    tabs: [
      {
        id: 'overview',
        label: 'Overview',
        active: true,
      },
    ],
  },
  {
    kind: 'toolbar',
    semanticRole: 'custom app command toolbar',
    dataTestId: 'app-sdk-toolbar',
    className: 'sb-ui-toolbar',
    actions: [],
  },
  {
    kind: 'status-bar',
    semanticRole: 'custom app operational status bar',
    dataTestId: 'app-sdk-status-bar',
    className: 'sb-ui-status-bar',
    items: [],
  },
];

export interface SwitchboardAppManifest {
  appId: string;
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  entrypoint: string;
  icon: string;
  category: SwitchboardAppCategory;
  defaultPanelMode: SwitchboardAppPanelMode;
  requestedCapabilities: SwitchboardAppCapability[];
  supportedWindowModes: SwitchboardAppPanelMode[];
  minimumSwitchboardOSVersion: string;
  agentStateProvider: boolean;
  actionRegistry: SwitchboardAppActionDescriptor[];
  graphicsPrimitives: SwitchboardGraphicsPrimitive[];
  uiPrimitives?: SwitchboardUiPrimitive[];
}

export interface SwitchboardGeneratedAppPackage {
  manifest: SwitchboardAppManifest;
  sourceCode: string;
  packageMetadata: {
    isolation: 'sandboxed-iframe-srcdoc';
    sdkBridge: 'postMessage';
    nodeAccess: false;
    generatedBy: 'app-studio-demo' | string;
    actionRegistry: SwitchboardAppActionDescriptor[];
  };
}

export interface SwitchboardAppContext {
  hosts: HostRecord[];
  auditEvents: AuditEvent[];
  settings: MvpSettings | null;
  generatedAt: string;
}

export interface SwitchboardAppSdkSurface {
  module: 'window' | 'host' | 'terminal' | 'command' | 'files' | 'services' | 'processes' | 'logs' | 'metrics' | 'storage' | 'settings' | 'theme' | 'graphics' | 'agent' | 'actions' | 'notifications';
  capabilities: SwitchboardAppCapability[];
  executionOwner: 'renderer' | 'main-process';
  mvpPolicy: string;
}

export const EXAMPLE_HOST_MAP_APP: SwitchboardAppManifest = {
  appId: 'example-host-status-map',
  id: 'example-host-status-map',
  name: 'Host Status Map',
  description: 'Example graphical app that visualizes local host status and recent activity.',
  version: '0.1.0',
  author: 'SwitchboardOS',
  entrypoint: 'ExampleHostMapComponent',
  icon: 'HM',
  category: 'visualization',
  defaultPanelMode: 'floating',
  requestedCapabilities: ['host:read', 'local:config:read', 'agent:read-state'],
  supportedWindowModes: ['floating', 'tile-right', 'tile-bottom'],
  minimumSwitchboardOSVersion: '0.1.0',
  agentStateProvider: true,
  actionRegistry: [
    {
      id: 'refresh-context',
      label: 'Refresh context',
      description: 'Reload host, audit, and settings context through the typed SwitchboardOS API.',
      capability: 'host:read',
    },
    {
      id: 'open-hosts',
      label: 'Open Hosts',
      description: 'Open the built-in host inventory app.',
      capability: 'host:read',
    },
  ],
  graphicsPrimitives: [
    {
      kind: 'node-link',
      semanticRole: 'host topology map',
      entityIds: [],
    },
    {
      kind: 'status-bar',
      semanticRole: 'host reachability histogram',
      entityIds: [],
    },
  ],
  uiPrimitives: SWITCHBOARD_STANDARD_UI_PRIMITIVES,
};

export const BUILTIN_APP_MANIFESTS: SwitchboardAppManifest[] = [
  EXAMPLE_HOST_MAP_APP,
];

export const SWITCHBOARD_APP_SDK_SURFACES: SwitchboardAppSdkSurface[] = [
  {
    module: 'window',
    capabilities: ['actions:register'],
    executionOwner: 'renderer',
    mvpPolicy: 'Apps run inside shell windows and expose semantic state/actions for inspection.',
  },
  {
    module: 'host',
    capabilities: ['host:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Host inventory is read through typed preload or hosted backend APIs.',
  },
  {
    module: 'terminal',
    capabilities: ['host:terminal'],
    executionOwner: 'main-process',
    mvpPolicy: 'Terminal sessions are opened by the backend and streamed into xterm windows.',
  },
  {
    module: 'command',
    capabilities: ['command:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Command history metadata is persisted in SQLite; browser clients never execute commands directly.',
  },
  {
    module: 'files',
    capabilities: ['files:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'File Browser uses backend-owned read-only ssh commands with BatchMode credentials.',
  },
  {
    module: 'services',
    capabilities: ['services:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Service Manager reads service state only; no start/stop/restart actions are exposed in this slice.',
  },
  {
    module: 'processes',
    capabilities: ['processes:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Process Viewer reads process tables only; no kill/signal action is exposed.',
  },
  {
    module: 'logs',
    capabilities: ['logs:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Log Viewer reads bounded log tails only; no remote file mutation is exposed.',
  },
  {
    module: 'metrics',
    capabilities: ['metrics:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Host dashboard metrics are collected by backend-owned SSH probes and exposed as semantic state.',
  },
  {
    module: 'storage',
    capabilities: ['storage:scoped'],
    executionOwner: 'main-process',
    mvpPolicy: 'Generated app manifests, permissions, and workspace state are persisted through scoped SQLite APIs.',
  },
  {
    module: 'settings',
    capabilities: ['local:config:read'],
    executionOwner: 'main-process',
    mvpPolicy: 'Settings are read and updated only through typed policy-gated APIs.',
  },
  {
    module: 'theme',
    capabilities: ['local:config:read'],
    executionOwner: 'renderer',
    mvpPolicy: 'Theme tokens are inherited by shell apps and generated iframe surfaces through CSS variables.',
  },
  {
    module: 'graphics',
    capabilities: ['host:read', 'agent:read-state'],
    executionOwner: 'renderer',
    mvpPolicy: 'Graphical examples render local SVG/chart primitives from typed context.',
  },
  {
    module: 'agent',
    capabilities: ['agent:read-state'],
    executionOwner: 'main-process',
    mvpPolicy: 'Operator context and proposals are generated by the backend with untrusted host output separated.',
  },
  {
    module: 'actions',
    capabilities: ['actions:register'],
    executionOwner: 'renderer',
    mvpPolicy: 'Apps register inspectable actions that flow through shell action dispatch and policy-gated backend calls.',
  },
  {
    module: 'notifications',
    capabilities: ['notifications:create'],
    executionOwner: 'renderer',
    mvpPolicy: 'Notifications are shell-local status messages in the MVP.',
  },
];
