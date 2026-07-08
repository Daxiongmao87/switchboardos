import { Component, HostListener, OnDestroy, OnInit, Type } from '@angular/core';
import type {
  AuditEvent,
  AgentEndpoint,
  AppManifest,
  AppPermission,
  ConnectionTestResult,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateAuditEventInput,
  HostRecord,
  HostOperationKind,
  HostOperationResult,
  MvpSettings,
  ShellTilePosition,
  ShellWindowAction,
  ShellWindowBounds,
  ShellWindowPreferredSize,
  ShellWindowRuntimeMetadata,
  ShellWindowSemanticState,
  ShellWindowSnapshot,
  WorkspaceArtifactContentRecord,
  WorkspaceProfile,
  WorkspaceLayoutSnapshot,
  UpdateAppManifestInput,
} from '../../shared/mvp-models';
import { AgentsComponent } from './agents/agents.component';
import { AppsComponent } from './apps/apps.component';
import { AuditComponent } from './audit/audit.component';
import { BootstrapComponent } from './bootstrap/bootstrap.component';
import { AppStudioComponent } from './app-studio/app-studio.component';
import { CommandHistoryComponent } from './command-history/command-history.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ExampleHostMapComponent } from './example-host-map/example-host-map.component';
import { GeneratedAppRuntimeComponent } from './generated-app-runtime/generated-app-runtime.component';
import { HostOperationsComponent } from './host-operations/host-operations.component';
import { HostsComponent } from './hosts/hosts.component';
import { SettingsComponent } from './settings/settings.component';
import { TerminalComponent } from './terminal/terminal.component';
import type { AppletElementContextMenuRequest } from './applet-context-menu';

interface AppInfo {
  version: string;
  platform: string;
}

interface ShellApi {
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  host: {
    list: () => Promise<HostRecord[]>;
    testConnection: (id: string) => Promise<ConnectionTestResult>;
  };
  audit: {
    list: () => Promise<AuditEvent[]>;
    log: (event: CreateAuditEventInput) => Promise<AuditEvent>;
  };
  settings: {
    get: () => Promise<MvpSettings>;
  };
  workspace: {
    listProfiles: () => Promise<WorkspaceProfile[]>;
    getProfile: (profileId: string) => Promise<WorkspaceProfile | null>;
    createProfile: (input: { name: string; layout: WorkspaceLayoutSnapshot }) => Promise<WorkspaceProfile>;
    updateProfile: (profileId: string, input: Partial<{ name: string; layout: WorkspaceLayoutSnapshot }>) => Promise<WorkspaceProfile | null>;
    deleteProfile: (profileId: string) => Promise<boolean>;
    getActiveProfileId: () => Promise<string | null>;
    setActiveProfileId: (profileId: string) => Promise<string>;
  };
  workspaceFile?: {
    list: (relativePath?: string) => Promise<WorkspaceArtifact[]>;
    createFolder: (targetPath?: string) => Promise<WorkspaceArtifact>;
    createFile: (kind: 'applet' | 'scriptlet' | 'note', targetPath?: string) => Promise<WorkspaceArtifact>;
    rename: (path: string, newName: string) => Promise<WorkspaceArtifact>;
    duplicate: (path: string) => Promise<WorkspaceArtifact>;
    copy: (path: string, targetPath?: string) => Promise<WorkspaceArtifact>;
    move: (path: string, targetPath?: string) => Promise<WorkspaceArtifact>;
    deletePermanent: (path: string) => Promise<boolean>;
    listTrash: () => Promise<WorkspaceTrashEntry[]>;
    moveToTrash: (path: string) => Promise<WorkspaceTrashEntry>;
    restoreTrashItem: (id: string) => Promise<WorkspaceArtifact>;
    deleteTrashItemPermanent: (id: string) => Promise<boolean>;
    emptyTrash: () => Promise<boolean>;
  };
  workspaceArtifactContent?: {
    get: (path: string) => Promise<WorkspaceArtifactContentRecord>;
    update: (path: string, content: string) => Promise<WorkspaceArtifactContentRecord>;
  };
  appManifest: {
    list: () => Promise<AppManifest[]>;
    get: (manifestId: string) => Promise<AppManifest | null>;
    create: (input: CreateAppManifestInput) => Promise<AppManifest>;
    update: (manifestId: string, input: UpdateAppManifestInput) => Promise<AppManifest | null>;
    remove: (manifestId: string) => Promise<boolean>;
  };
  appPermission: {
    list: (appId?: string) => Promise<AppPermission[]>;
    create: (input: CreateAppPermissionInput) => Promise<AppPermission>;
    remove: (permissionId: string) => Promise<boolean>;
  };
  agentEndpoint?: {
    list: () => Promise<AgentEndpoint[]>;
  };
  hostOperations: {
    run: (input: { hostId: string; kind: HostOperationKind; path?: string; filter?: string; limit?: number }) => Promise<HostOperationResult>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    navigate: (route: string) => void;
  };
}

function getSwitchboardApi(): ShellApi | undefined {
  return (window as unknown as { sb?: ShellApi }).sb;
}

const DESKTOP_SHORTCUTS_STORAGE_KEY = 'switchboardos.desktopShortcuts.v2';
const DESKTOP_ICON_POSITIONS_STORAGE_KEY = 'switchboardos.desktopIconPositions.v1';
const WORKSPACE_LAYOUT_STORAGE_KEY = 'switchboardos.workspaceLayout.v2';
const WORKSPACE_PROFILES_STORAGE_KEY = 'switchboardos.workspaceProfiles.v1';
const ACTIVE_WORKSPACE_PROFILE_STORAGE_KEY = 'switchboardos.activeWorkspaceProfile.v1';
const LEGACY_FIRST_RUN_COMPLETE_STORAGE_KEY = 'switchboardos.firstRunComplete.v1';
const WORKSPACE_ARTIFACTS_STORAGE_KEY = 'switchboardos.workspaceArtifacts.v1';
const DEFAULT_WORKSPACE_PROFILE_ID = 'default';
const DEFAULT_DESKTOP_SHORTCUT_IDS = ['workspace-files', 'trash'] as const;
const DEFAULT_LAUNCHER_APP_IDS = ['workspace-files', 'trash', 'hosts', 'terminal', 'settings', 'apps'] as const;
const WELCOME_APPLET_ID = 'welcome';
const WELCOME_APPLET_STATE_KEY = 'switchboardos.systemApplet.welcome.state.v1';
const WELCOME_APPLET_STATE_DESCRIPTOR: SystemAppletStateDescriptor = {
  appId: WELCOME_APPLET_ID,
  storageKey: WELCOME_APPLET_STATE_KEY,
};
const LEGACY_DEFAULT_DESKTOP_SHORTCUT_IDS = [
  'hosts',
  'terminal',
  'file-browser',
  'process-viewer',
  'service-manager',
  'log-viewer',
  'command-history',
  'app-studio',
  'bootstrap',
  'agents',
  'apps',
  'host-map',
  'audit',
  'settings',
] as const;
const SYSTEM_APPLET_SDK_CONTRACT = 'switchboardos-app-sdk-v1';
const SYSTEM_APPLET_LANGUAGE = 'typescript';
const SYSTEM_APPLET_DEFAULT_WINDOW_BEHAVIOR: MvpSettings['defaultWindowBehavior'] = 'floating';
type LauncherTarget =
  | 'desktop'
  | 'desktop-icon'
  | 'host'
  | 'taskbar'
  | 'taskbar-window'
  | 'tray-status'
  | 'terminal'
  | 'window'
  | 'launcher-row'
  | 'workspace-file'
  | 'generated-app-element'
  | 'ssh-file-object'
  | 'ssh-file-row';

type ContextMenuTarget = LauncherTarget | 'notification' | (string & {});
type ShellActionSource =
  | 'shell'
  | 'app-manifest'
  | 'window-object'
  | 'host-object'
  | 'ssh-file-provider'
  | 'generated-app-sdk'
  | 'applet-element-contribution'
  | (string & {});
type PaletteTargetScope = 'command-palette' | 'focused-window' | 'global-keyboard';
type KeyboardShortcutKind = 'shell' | 'app' | 'window-action';
type ShellPrimitiveKind = 'panel' | 'tray-status' | 'taskbar-window' | 'notification' | 'ssh-file-object' | 'generated-app-element' | (string & {});

interface ShellPrimitiveObject {
  id: string;
  kind: ShellPrimitiveKind;
  owner: 'shell' | 'file-browser' | (string & {});
  source: ShellActionSource;
  targetScope: ContextMenuTarget;
  label: string;
  actionIds: string[];
  sourceAppId?: ShellAppId;
  windowId?: string;
  notificationKind?: ShellNotificationKind;
  requiredCapabilities?: string[];
  remotePath?: string;
  workspacePath?: string;
  hostId?: string;
}

interface ShellKeyboardShortcut {
  id: string;
  label: string;
  shortcut: string;
  key: string;
  kind: KeyboardShortcutKind;
  actionId: string;
  source: ShellActionSource;
  targetScope: PaletteTargetScope;
  appId?: ShellAppId;
  ctrlOrMeta?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const SHELL_KEYBOARD_SHORTCUTS: ShellKeyboardShortcut[] = [
  {
    id: 'open-command-palette',
    label: 'Open command palette',
    shortcut: 'Ctrl+K',
    key: 'k',
    kind: 'shell',
    actionId: 'open-command-palette',
    source: 'shell',
    targetScope: 'global-keyboard',
    ctrlOrMeta: true,
  },
  {
    id: 'close-shell-overlays',
    label: 'Close active shell overlay',
    shortcut: 'Escape',
    key: 'Escape',
    kind: 'shell',
    actionId: 'close-shell-overlays',
    source: 'shell',
    targetScope: 'global-keyboard',
  },
  {
    id: 'open-workspace-files',
    label: 'Open File Explorer',
    shortcut: 'Meta+E',
    key: 'e',
    kind: 'app',
    actionId: 'open-app',
    source: 'app-manifest',
    targetScope: 'global-keyboard',
    appId: 'workspace-files',
    metaKey: true,
  },
  {
    id: 'minimize-focused-window',
    label: 'Minimize focused window',
    shortcut: 'Meta+M',
    key: 'm',
    kind: 'window-action',
    actionId: 'minimize-window',
    source: 'window-object',
    targetScope: 'focused-window',
    metaKey: true,
  },
  {
    id: 'maximize-focused-window',
    label: 'Maximize focused window',
    shortcut: 'Meta+Up',
    key: 'ArrowUp',
    kind: 'window-action',
    actionId: 'maximize-window',
    source: 'window-object',
    targetScope: 'focused-window',
    metaKey: true,
  },
  {
    id: 'fullscreen-focused-window',
    label: 'Toggle focused window fullscreen',
    shortcut: 'F11',
    key: 'F11',
    kind: 'window-action',
    actionId: 'toggle-fullscreen',
    source: 'window-object',
    targetScope: 'focused-window',
  },
  {
    id: 'tile-focused-window-left',
    label: 'Tile focused window left',
    shortcut: 'Alt+Shift+Left',
    key: 'ArrowLeft',
    kind: 'window-action',
    actionId: 'tile-left',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-right',
    label: 'Tile focused window right',
    shortcut: 'Alt+Shift+Right',
    key: 'ArrowRight',
    kind: 'window-action',
    actionId: 'tile-right',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-top',
    label: 'Tile focused window top',
    shortcut: 'Alt+Shift+Up',
    key: 'ArrowUp',
    kind: 'window-action',
    actionId: 'tile-top',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-bottom',
    label: 'Tile focused window bottom',
    shortcut: 'Alt+Shift+Down',
    key: 'ArrowDown',
    kind: 'window-action',
    actionId: 'tile-bottom',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-top-left',
    label: 'Tile focused window top left',
    shortcut: 'Alt+Shift+1',
    key: '1',
    kind: 'window-action',
    actionId: 'tile-top-left',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-top-right',
    label: 'Tile focused window top right',
    shortcut: 'Alt+Shift+2',
    key: '2',
    kind: 'window-action',
    actionId: 'tile-top-right',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-bottom-left',
    label: 'Tile focused window bottom left',
    shortcut: 'Alt+Shift+3',
    key: '3',
    kind: 'window-action',
    actionId: 'tile-bottom-left',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'tile-focused-window-bottom-right',
    label: 'Tile focused window bottom right',
    shortcut: 'Alt+Shift+4',
    key: '4',
    kind: 'window-action',
    actionId: 'tile-bottom-right',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
    shiftKey: true,
  },
  {
    id: 'close-focused-window',
    label: 'Close focused window',
    shortcut: 'Alt+F4',
    key: 'F4',
    kind: 'window-action',
    actionId: 'close-window',
    source: 'window-object',
    targetScope: 'focused-window',
    altKey: true,
  },
];

const TASKBAR_PANEL_ACTION_IDS = [
  'open-menu',
  'close-menu',
  'panel-settings',
  'add-applet',
  'arrange-lock-panel',
  'show-desktop',
  'task-manager',
] as const;
const TRAY_STATUS_ACTION_IDS = [
  'status-details',
  'tray-notification-settings',
  'tray-panel-settings',
  'refresh-status',
] as const;
const TASKBAR_WINDOW_ACTION_IDS = [
  'show-taskbar-window',
  'new-window',
  'toggle-minimize-window',
  'pin-app',
  'unpin-app',
  'pinned-default-app',
  'close-window',
] as const;
const NOTIFICATION_ACTION_IDS = [
  'dismiss-notification',
  'clear-notifications',
  'open-notification-settings',
] as const;

function buildSystemAppletManifest(input: {
  appId: ShellAppId;
  name: string;
  description: string;
  icon: string;
  defaultBounds: ShellWindowBounds;
  launcherCategory: LauncherCategory;
  capabilities: string[];
  contextMenuTargets?: LauncherTarget[];
  packageMetadata?: Record<string, unknown>;
}): AppManifest {
  const now = new Date().toISOString();
  const contextMenuTargets = input.contextMenuTargets ?? ([
    'desktop',
    'desktop-icon',
    'launcher-row',
    'taskbar',
    'taskbar-window',
    'window',
  ] as LauncherTarget[]);
  return {
    id: `system-${input.appId}`,
    appId: input.appId,
    name: input.name,
    description: input.description,
    version: '1.0.0',
    author: 'SwitchboardOS',
    entrypoint: `system://${input.appId}`,
    icon: input.icon,
    category: 'system',
    capabilities: [...input.capabilities],
    sourceCode: '',
    packageMetadata: {
      systemApplet: true,
      firstPartyTrust: true,
      runtimeKind: 'renderer',
      lifecycleKind: 'built-in',
      launcherCategory: input.launcherCategory,
      defaultWindowBehavior: SYSTEM_APPLET_DEFAULT_WINDOW_BEHAVIOR,
      defaultWindowBounds: { ...input.defaultBounds },
      supportedWindowModes: ['floating', 'tile-right', 'tile-bottom'],
      presentationModes: input.packageMetadata?.['presentationModes'] ?? ['window'],
      defaultPresentationMode: input.packageMetadata?.['defaultPresentationMode'] ?? 'window',
      contextMenuTargets: [...contextMenuTargets],
      contextMenuContributions: {
        open: {
          enabled: true,
          targets: ['desktop-icon', 'launcher-row'],
          actionId: 'open-app',
        },
        pin: {
          enabled: true,
          targets: ['launcher-row', 'taskbar-window'],
          actionId: 'pin-app',
        },
        properties: {
          enabled: true,
          targets: ['desktop-icon', 'launcher-row'],
          actionId: 'properties',
        },
        windowActions: {
          enabled: true,
          targets: ['taskbar-window', 'window'],
        },
      },
      semanticStateProvider: {
        mode: 'shell-semantic-state',
        providerId: `system.applet.${input.appId}`,
      },
      actionRegistryMarker: true,
      actionRegistry: [
        { id: 'open', label: 'Open', description: 'Open the app in a shell window.' },
        { id: 'pin-to-desktop', label: 'Pin to desktop', description: 'Add app shortcut to desktop.' },
      ],
      appletLanguage: SYSTEM_APPLET_LANGUAGE,
      sdkContract: SYSTEM_APPLET_SDK_CONTRACT,
      ...input.packageMetadata,
    },
    enabled: true,
    installedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

type ShellAppId = string;

type HostOperationAppId = 'file-browser' | 'process-viewer' | 'service-manager' | 'log-viewer';
type LauncherCategory =
  | 'core-launcher-system'
  | 'contextual-host-file-window'
  | 'advanced-developer'
  | 'optional-configured'
  | 'demo-non-core';

interface ShellAppDefinition {
  appId: ShellAppId;
  title: string;
  detail: string;
  icon: string;
  component: Type<unknown> | null;
  defaultBounds: ShellWindowBounds;
  searchable: boolean;
  launcherCategory: LauncherCategory;
  manifest?: AppManifest;
  generated?: boolean;
}

interface ShellWindow extends ShellWindowSnapshot {
  appId: ShellAppId;
  appDefinition: ShellAppDefinition;
}

type GeneratedAppWindowSdkMethod =
  | 'window:getInfo'
  | 'window:setTitle'
  | 'window:setBadge'
  | 'window:setStatus'
  | 'window:setPreferredSize';

interface GeneratedAppWindowSdkRequestDetail {
  appId: ShellAppId;
  windowId: string;
  method: GeneratedAppWindowSdkMethod;
  payload?: unknown;
  handled: boolean;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

type WorkspaceArtifactKind = 'folder' | 'applet' | 'scriptlet' | 'note';
type WorkspaceArtifactKindFilter = 'all' | WorkspaceArtifactKind;
type WorkspaceArtifactSortField = 'name' | 'kind' | 'modified' | 'size';
type WorkspaceArtifactViewMode = 'list' | 'grid';

interface WorkspaceArtifact {
  id: string;
  name: string;
  kind: WorkspaceArtifactKind;
  detail: string;
  path?: string;
  updatedAt: string;
  size?: number;
}

interface WorkspaceTrashEntry {
  id: string;
  name: string;
  kind: WorkspaceArtifactKind;
  originalPath: string;
  trashPath: string;
  deletedAt: string;
  updatedAt: string;
  size?: number;
}

type WorkspaceClipboardMode = 'copy' | 'cut';

interface WorkspaceClipboardItem {
  mode: WorkspaceClipboardMode;
  path: string;
  name: string;
}

interface WorkspaceBreadcrumb {
  label: string;
  path: string;
}

function normalizeWorkspaceArtifact(value: unknown): WorkspaceArtifact | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : null;
  const kind = record.kind as string | undefined;
  const validKinds: WorkspaceArtifactKind[] = ['folder', 'applet', 'scriptlet', 'note'];
  const validKind = validKinds.includes(kind as WorkspaceArtifactKind) ? kind : null;
  const detail = typeof record.detail === 'string' && record.detail.trim() ? record.detail.trim() : null;
  const updatedAt = typeof record.updatedAt === 'string' && record.updatedAt.trim() ? record.updatedAt.trim() : null;
  const path = typeof record.path === 'string' && record.path.trim() ? record.path.trim() : undefined;
  const size = typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined;

  if (!id || !name || !validKind || !detail || !updatedAt) {
    return null;
  }

  return {
    id,
    name,
    kind: validKind as WorkspaceArtifactKind,
    detail,
    path,
    updatedAt,
    size,
  };
}

function stringPackageMetadata(manifest: AppManifest, key: string): string | null {
  const value = manifest.packageMetadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function generatedAppArtifactPath(manifest: AppManifest): string | null {
  return stringPackageMetadata(manifest, 'artifactPath');
}

function hasGeneratedAppContentReference(manifest: AppManifest): boolean {
  return Boolean(manifest.sourceCode.trim() || generatedAppArtifactPath(manifest));
}

function generatedAppSourceFromArtifact(record: WorkspaceArtifactContentRecord): string {
  const manifest = record.manifest;
  const sourceCode = manifest['sourceCode'];
  if (typeof sourceCode === 'string') {
    return sourceCode;
  }

  const source = manifest['source'];
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const sourceRecord = source as Record<string, unknown>;
    const code = sourceRecord['code'];
    if (typeof code === 'string') {
      return code;
    }
  }

  return '';
}

function manifestStringField(record: Record<string, unknown>, key: string, fallback = ''): string {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function manifestStringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)));
}

interface DesktopIconPosition {
  x: number;
  y: number;
}

interface IconDragState {
  shortcutId: string;
  offsetX: number;
  offsetY: number;
  move: (event: MouseEvent) => void;
  end: () => void;
}

interface DesktopShortcut {
  id: string;
  appId: ShellAppId;
  shellOwned: boolean;
  label?: string;
}

type NormalizedRawShortcut = {
  appId: ShellAppId;
  id?: string;
  shellOwned: boolean;
  label?: string;
};

interface DesktopShortcutItem {
  id: string;
  appId: ShellAppId;
  shellOwned: boolean;
  definition: ShellAppDefinition;
  label?: string;
}

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  detail?: string;
  disabledReason?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  submenu?: ContextMenuItem[];
  source?: ShellActionSource;
  sourceAppId?: ShellAppId;
  sourceWindowId?: string;
  targetScope?: ContextMenuTarget;
  requiredCapabilities?: string[];
  actionId?: string;
  handler?: () => void | Promise<void>;
}

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextMenuTarget;
  label: string;
  appId?: ShellAppId;
  shortcutId?: string;
  hostId?: string;
  windowId?: string;
  workspaceArtifact?: WorkspaceArtifact;
  notification?: ShellNotificationContext;
  object?: ShellPrimitiveObject;
  contributionSurface?: 'applet-element' | 'generated-app-sdk' | (string & {});
  focusReturnElement?: HTMLElement;
  items: ContextMenuItem[];
}

type TerminalContextAction = 'copy' | 'paste' | 'clear';
type ShellNotificationKind = 'toast' | 'status' | 'error';

interface ShellNotificationContext {
  id: string;
  kind: ShellNotificationKind;
  message: string;
  toastId?: string;
}

interface ShellToastNotification {
  id: string;
  kind: 'toast';
  message: string;
  createdAt: string;
}

interface SystemAppletStateDescriptor {
  appId: ShellAppId;
  storageKey: string;
}

interface WelcomeAppletState {
  dismissed: boolean;
  dismissedAt?: string;
}

// WorkspaceProfile and WorkspaceLayoutSnapshot are imported from shared/mvp-models.ts

interface PaletteResult {
  id: string;
  label: string;
  detail: string;
  kind: 'app' | 'host-dashboard' | 'host-terminal' | 'host-operation' | 'window-action';
  appId?: ShellAppId;
  operationAppId?: HostOperationAppId;
  hostId?: string;
  windowId?: string;
  actionId?: string;
  source?: ShellActionSource;
  sourceAppId?: ShellAppId;
  targetScope?: PaletteTargetScope;
  requiredCapabilities?: string[];
  capabilities?: string[];
  shortcut?: string;
  isSystemApplet?: boolean;
  launcherCategory?: LauncherCategory;
  defaultLauncherRow?: boolean;
}

interface DragState {
  move: (event: MouseEvent) => void;
  end: (event: MouseEvent) => void;
}

interface ResizeState {
  move: (event: MouseEvent) => void;
  end: () => void;
}

interface HostMetricsSnapshot {
  os: string;
  uptime: string;
  memory: string;
  disk: string;
  collectedAt: string;
  status: string;
  error: string | null;
}

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'SwitchboardOS';
  appInfo: AppInfo | null = null;
  hosts: HostRecord[] = [];
  auditEvents: AuditEvent[] = [];
  windows: ShellWindow[] = [];
  desktopShortcuts: DesktopShortcut[] = [];
  desktopIconPositions: Record<string, DesktopIconPosition> = {};
  selectedShortcutId: string | null = null;
  launcherOpen = false;
  hostLauncherOpen = false;
  profilePanelOpen = false;
  commandPaletteOpen = false;
  inspectorOpen = false;
  paletteQuery = '';
  newProfileName = '';
  renameProfileName = '';
  activeProfileId = DEFAULT_WORKSPACE_PROFILE_ID;
  workspaceProfiles: WorkspaceProfile[] = [];
  workspaceProfilesLoaded = false;
  statusMessage = '';
  errorMessage = '';
  toasts: ShellToastNotification[] = [];
  toastTimers: number[] = [];
  toastSequence = 0;
  readonly taskbarPanelObject = this.createShellPrimitiveObject({
    id: 'shell:panel:primary',
    kind: 'panel',
    label: 'Taskbar',
    targetScope: 'taskbar',
    actionIds: [...TASKBAR_PANEL_ACTION_IDS],
  });
  readonly trayStatusObject = this.createShellPrimitiveObject({
    id: 'shell:tray:status',
    kind: 'tray-status',
    label: 'Status Area',
    targetScope: 'tray-status',
    actionIds: [...TRAY_STATUS_ACTION_IDS],
  });
  readonly notificationActionIds = [...NOTIFICATION_ACTION_IDS];
  isLoadingHosts = false;
  metricsLoadingHostId: string | null = null;
  hostMetricsById: Record<string, HostMetricsSnapshot> = {};
  firstRunOpen = false;
  desktopWallpaper: MvpSettings['desktopWallpaper'] = 'default';
  desktopWallpaperLayout: MvpSettings['desktopWallpaperLayout'] = 'fill';
  operatorSettingsConfigured = false;
  operatorAgentEndpointConfigured = false;
  contextMenu: ContextMenuState | null = null;
  workspaceArtifacts: WorkspaceArtifact[] = [];
  workspaceCurrentPath = '';
  workspaceClipboard: WorkspaceClipboardItem | null = null;
  selectedWorkspaceArtifact: WorkspaceArtifact | null = null;
  workspaceArtifactSearchText = '';
  workspaceArtifactKindFilter: WorkspaceArtifactKindFilter = 'all';
  workspaceArtifactSortBy: WorkspaceArtifactSortField = 'name';
  workspaceArtifactViewMode: WorkspaceArtifactViewMode = 'list';
  trashItems: WorkspaceTrashEntry[] = [];

  get workspaceArtifactsView(): WorkspaceArtifact[] {
    const query = this.workspaceArtifactSearchText.trim().toLowerCase();
    const filtered = this.workspaceArtifacts.filter((artifact) => {
      if (this.workspaceArtifactKindFilter !== 'all' && artifact.kind !== this.workspaceArtifactKindFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const target = this.workspaceArtifactPath(artifact).toLowerCase();
      return artifact.name.toLowerCase().includes(query)
        || artifact.detail.toLowerCase().includes(query)
        || target.includes(query);
    });

    return [...filtered].sort((left, right) => this.compareWorkspaceArtifacts(left, right));
  }

  get workspaceDisplayPath(): string {
    return this.workspaceDisplayPathForPath(this.workspaceCurrentPath);
  }

  get workspaceBreadcrumbs(): WorkspaceBreadcrumb[] {
    const segments = this.workspaceCurrentPath.split('/').filter(Boolean);
    const breadcrumbs: WorkspaceBreadcrumb[] = [
      { label: 'SwitchboardOS', path: '' },
      { label: 'Workspace', path: '' },
    ];
    let path = '';
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment;
      breadcrumbs.push({ label: segment, path });
    }
    return breadcrumbs;
  }

  get canNavigateWorkspaceUp(): boolean {
    return Boolean(this.workspaceCurrentPath);
  }

  readonly terminalComponent = TerminalComponent;
  readonly hostOperationsComponent = HostOperationsComponent;
  readonly generatedAppRuntimeComponent = GeneratedAppRuntimeComponent;
  readonly defaultShortcutIds: ShellAppId[] = [
    ...DEFAULT_DESKTOP_SHORTCUT_IDS,
  ];

  private defaultShortcutId(appId: ShellAppId): string {
    return `shortcut-${appId}`;
  }

  private legacyShortcutId(appId: ShellAppId): string {
    return `shortcut-legacy-${appId}`;
  }

  private defaultDesktopShortcuts(): DesktopShortcut[] {
    return this.defaultShortcutIds
      .filter((appId): appId is ShellAppId => this.getAppDefinition(appId) !== null)
      .map((appId) => ({ id: this.defaultShortcutId(appId), appId, shellOwned: true }));
  }

  private makeShortcutId(appId: ShellAppId): string {
    return `shortcut-${appId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  readonly appDefinitions: ShellAppDefinition[] = [
    {
      appId: 'workspace-files',
      title: 'File Explorer',
      detail: 'SwitchboardOS workspace root',
      icon: 'FE',
      component: null,
      defaultBounds: { x: 120, y: 72, width: 820, height: 560 },
      searchable: true,
      launcherCategory: 'core-launcher-system',
      manifest: buildSystemAppletManifest({
        appId: 'workspace-files',
        name: 'File Explorer',
        description: 'SwitchboardOS workspace root explorer.',
        icon: 'FE',
        defaultBounds: { x: 120, y: 72, width: 820, height: 560 },
        launcherCategory: 'core-launcher-system',
        capabilities: ['files:read', 'storage:scoped', 'local:config:read'],
      }),
    },
    {
      appId: 'trash',
      title: 'Recycle Bin',
      detail: 'Deleted workspace items (recovery area)',
      icon: 'TR',
      component: null,
      defaultBounds: { x: 180, y: 96, width: 620, height: 420 },
      searchable: true,
      launcherCategory: 'core-launcher-system',
      manifest: buildSystemAppletManifest({
        appId: 'trash',
        name: 'Recycle Bin',
        description: 'Deleted workspace recovery area.',
        icon: 'TR',
        defaultBounds: { x: 180, y: 96, width: 620, height: 420 },
        launcherCategory: 'core-launcher-system',
        capabilities: ['files:read', 'storage:scoped', 'local:config:read'],
      }),
    },
    {
      appId: 'hosts',
      title: 'Hosts',
      detail: 'Inventory and reachability',
      icon: 'H',
      component: HostsComponent,
      defaultBounds: { x: 210, y: 48, width: 760, height: 610 },
      searchable: true,
      launcherCategory: 'core-launcher-system',
      manifest: buildSystemAppletManifest({
        appId: 'hosts',
        name: 'Hosts',
        description: 'Host inventory and reachability tooling.',
        icon: 'H',
        defaultBounds: { x: 210, y: 48, width: 760, height: 610 },
        launcherCategory: 'core-launcher-system',
        capabilities: ['host:read', 'host:actions'],
      }),
    },
    {
      appId: 'terminal',
      title: 'Terminal',
      detail: 'xterm SSH session',
      icon: 'T',
      component: TerminalComponent,
      defaultBounds: { x: 530, y: 76, width: 780, height: 560 },
      searchable: true,
      launcherCategory: 'core-launcher-system',
      manifest: buildSystemAppletManifest({
        appId: 'terminal',
        name: 'Terminal',
        description: 'xterm SSH session workspace.',
        icon: 'T',
        defaultBounds: { x: 530, y: 76, width: 780, height: 560 },
        launcherCategory: 'core-launcher-system',
        capabilities: ['host:terminal', 'command:read', 'host:actions'],
        contextMenuTargets: ['desktop', 'desktop-icon', 'launcher-row', 'taskbar', 'terminal', 'window'],
      }),
    },
    {
      appId: 'bootstrap',
      title: 'Bootstrap',
      detail: 'Script generator',
      icon: 'B',
      component: BootstrapComponent,
      defaultBounds: { x: 180, y: 74, width: 980, height: 620 },
      searchable: true,
      launcherCategory: 'advanced-developer',
      manifest: buildSystemAppletManifest({
        appId: 'bootstrap',
        name: 'Bootstrap',
        description: 'Script generator',
        icon: 'B',
        defaultBounds: { x: 180, y: 74, width: 980, height: 620 },
        launcherCategory: 'advanced-developer',
        capabilities: ['host:read', 'host:actions', 'actions:register', 'local:config:read'],
      }),
    },
    {
      appId: 'file-browser',
      title: 'File Browser',
      detail: 'Read-only remote files',
      icon: 'FB',
      component: HostOperationsComponent,
      defaultBounds: { x: 170, y: 82, width: 860, height: 560 },
      searchable: true,
      launcherCategory: 'contextual-host-file-window',
      manifest: buildSystemAppletManifest({
        appId: 'file-browser',
        name: 'File Browser',
        description: 'Read-only remote files',
        icon: 'FB',
        defaultBounds: { x: 170, y: 82, width: 860, height: 560 },
        launcherCategory: 'contextual-host-file-window',
        capabilities: ['host:read', 'files:read', 'command:read'],
      }),
    },
    {
      appId: 'process-viewer',
      title: 'Process Viewer',
      detail: 'Read-only process list',
      icon: 'PV',
      component: HostOperationsComponent,
      defaultBounds: { x: 210, y: 90, width: 860, height: 560 },
      searchable: true,
      launcherCategory: 'contextual-host-file-window',
      manifest: buildSystemAppletManifest({
        appId: 'process-viewer',
        name: 'Process Viewer',
        description: 'Read-only process list',
        icon: 'PV',
        defaultBounds: { x: 210, y: 90, width: 860, height: 560 },
        launcherCategory: 'contextual-host-file-window',
        capabilities: ['host:read', 'processes:read', 'command:read'],
      }),
    },
    {
      appId: 'service-manager',
      title: 'Service Manager',
      detail: 'Read-only service state',
      icon: 'SM',
      component: HostOperationsComponent,
      defaultBounds: { x: 250, y: 98, width: 860, height: 560 },
      searchable: true,
      launcherCategory: 'contextual-host-file-window',
      manifest: buildSystemAppletManifest({
        appId: 'service-manager',
        name: 'Service Manager',
        description: 'Read-only service state',
        icon: 'SM',
        defaultBounds: { x: 250, y: 98, width: 860, height: 560 },
        launcherCategory: 'contextual-host-file-window',
        capabilities: ['host:read', 'services:read', 'command:read'],
      }),
    },
    {
      appId: 'log-viewer',
      title: 'Log Viewer',
      detail: 'Read-only host logs',
      icon: 'LV',
      component: HostOperationsComponent,
      defaultBounds: { x: 290, y: 106, width: 860, height: 560 },
      searchable: true,
      launcherCategory: 'contextual-host-file-window',
      manifest: buildSystemAppletManifest({
        appId: 'log-viewer',
        name: 'Log Viewer',
        description: 'Read-only host logs',
        icon: 'LV',
        defaultBounds: { x: 290, y: 106, width: 860, height: 560 },
        launcherCategory: 'contextual-host-file-window',
        capabilities: ['host:read', 'logs:read', 'command:read'],
      }),
    },
    {
      appId: 'command-history',
      title: 'Command History',
      detail: 'SQLite command metadata',
      icon: 'CH',
      component: CommandHistoryComponent,
      defaultBounds: { x: 280, y: 96, width: 860, height: 560 },
      searchable: true,
      launcherCategory: 'advanced-developer',
      manifest: buildSystemAppletManifest({
        appId: 'command-history',
        name: 'Command History',
        description: 'SQLite command metadata',
        icon: 'CH',
        defaultBounds: { x: 280, y: 96, width: 860, height: 560 },
        launcherCategory: 'advanced-developer',
        capabilities: ['command:read', 'local:config:read'],
      }),
    },
    {
      appId: 'app-studio',
      title: 'App Studio',
      detail: 'Monaco app authoring review',
      icon: 'AS',
      component: AppStudioComponent,
      defaultBounds: { x: 180, y: 76, width: 980, height: 620 },
      searchable: true,
      launcherCategory: 'advanced-developer',
      manifest: buildSystemAppletManifest({
        appId: 'app-studio',
        name: 'App Studio',
        description: 'Monaco app authoring review',
        icon: 'AS',
        defaultBounds: { x: 180, y: 76, width: 980, height: 620 },
        launcherCategory: 'advanced-developer',
        capabilities: ['storage:scoped', 'local:config:read', 'actions:register'],
      }),
    },
    {
      appId: 'agents',
      title: 'Operator',
      detail: 'Agent endpoint and approvals',
      icon: 'O',
      component: AgentsComponent,
      defaultBounds: { x: 164, y: 92, width: 860, height: 590 },
      searchable: true,
      launcherCategory: 'optional-configured',
      manifest: buildSystemAppletManifest({
        appId: 'agents',
        name: 'Operator',
        description: 'Agent endpoint and approvals',
        icon: 'O',
        defaultBounds: { x: 164, y: 92, width: 860, height: 590 },
        launcherCategory: 'optional-configured',
        capabilities: ['agent:read-state', 'actions:register', 'local:config:read'],
      }),
    },
    {
      appId: 'apps',
      title: 'App Manager',
      detail: 'Local applets and package registry',
      icon: 'A',
      component: AppsComponent,
      defaultBounds: { x: 128, y: 70, width: 980, height: 630 },
      searchable: true,
      launcherCategory: 'core-launcher-system',
      manifest: buildSystemAppletManifest({
        appId: 'apps',
        name: 'App Manager',
        description: 'Local applets and package registry.',
        icon: 'A',
        defaultBounds: { x: 128, y: 70, width: 980, height: 630 },
        launcherCategory: 'core-launcher-system',
        capabilities: ['storage:scoped', 'local:config:read', 'actions:register'],
      }),
    },
    {
      appId: WELCOME_APPLET_ID,
      title: 'Welcome',
      detail: 'First-run OS basics and setup entry points',
      icon: 'W',
      component: null,
      defaultBounds: { x: 0, y: 0, width: 360, height: 300 },
      searchable: false,
      launcherCategory: 'optional-configured',
      manifest: buildSystemAppletManifest({
        appId: WELCOME_APPLET_ID,
        name: 'Welcome',
        description: 'First-run OS basics and setup entry points.',
        icon: 'W',
        defaultBounds: { x: 0, y: 0, width: 360, height: 300 },
        launcherCategory: 'optional-configured',
        capabilities: ['local:config:read', 'local:config:write', 'context-menu:contribute'],
        packageMetadata: {
          shellSurface: true,
          presentationModes: ['panel', 'onboarding'],
          defaultPresentationMode: 'onboarding-panel',
          lifecycleKind: 'system-first-run',
          stateOwner: 'system-applet',
          stateStorageKey: WELCOME_APPLET_STATE_KEY,
          launcherHiddenByDefault: true,
          desktopPinnedByDefault: false,
        },
      }),
    },
    {
      appId: 'host-map',
      title: 'Host Map',
      detail: 'Graphical SDK host health map',
      icon: 'HM',
      component: ExampleHostMapComponent,
      defaultBounds: { x: 190, y: 86, width: 920, height: 620 },
      searchable: true,
      launcherCategory: 'advanced-developer',
      manifest: buildSystemAppletManifest({
        appId: 'host-map',
        name: 'Host Map',
        description: 'Graphical SDK host health map',
        icon: 'HM',
        defaultBounds: { x: 190, y: 86, width: 920, height: 620 },
        launcherCategory: 'advanced-developer',
        capabilities: ['host:read', 'metrics:read', 'agent:read-state'],
      }),
    },
    {
      appId: 'audit',
      title: 'Audit',
      detail: 'Local action history',
      icon: 'L',
      component: AuditComponent,
      defaultBounds: { x: 280, y: 86, width: 820, height: 590 },
      searchable: true,
      launcherCategory: 'demo-non-core',
      manifest: buildSystemAppletManifest({
        appId: 'audit',
        name: 'Audit',
        description: 'Local action history',
        icon: 'L',
        defaultBounds: { x: 280, y: 86, width: 820, height: 590 },
        launcherCategory: 'demo-non-core',
        capabilities: ['local:config:read'],
      }),
    },
    {
      appId: 'settings',
      title: 'Settings',
      detail: 'Local defaults',
      icon: 'S',
      component: SettingsComponent,
      defaultBounds: { x: 340, y: 76, width: 760, height: 570 },
      searchable: true,
      launcherCategory: 'core-launcher-system',
      manifest: buildSystemAppletManifest({
        appId: 'settings',
        name: 'Settings',
        description: 'Local defaults and preferences.',
        icon: 'S',
        defaultBounds: { x: 340, y: 76, width: 760, height: 570 },
        launcherCategory: 'core-launcher-system',
        capabilities: ['local:config:read', 'actions:register'],
      }),
    },
    {
      appId: 'status',
      title: 'Status',
      detail: 'Workspace overview',
      icon: 'D',
      component: DashboardComponent,
      defaultBounds: { x: 96, y: 64, width: 700, height: 540 },
      searchable: true,
      launcherCategory: 'demo-non-core',
      manifest: buildSystemAppletManifest({
        appId: 'status',
        name: 'Status',
        description: 'Workspace overview',
        icon: 'D',
        defaultBounds: { x: 96, y: 64, width: 700, height: 540 },
        launcherCategory: 'demo-non-core',
        capabilities: ['host:read', 'metrics:read', 'local:config:read'],
      }),
    },
    {
      appId: 'host-dashboard',
      title: 'Host Dashboard',
      detail: 'Host-scoped status surface',
      icon: 'HD',
      component: null,
      defaultBounds: { x: 240, y: 70, width: 620, height: 520 },
      searchable: false,
      launcherCategory: 'contextual-host-file-window',
      manifest: buildSystemAppletManifest({
        appId: 'host-dashboard',
        name: 'Host Dashboard',
        description: 'Host-scoped status surface',
        icon: 'HD',
        defaultBounds: { x: 240, y: 70, width: 620, height: 520 },
        launcherCategory: 'contextual-host-file-window',
        capabilities: ['host:read', 'metrics:read', 'host:actions'],
      }),
    },
    {
      appId: 'host-terminal',
      title: 'Host Terminal',
      detail: 'Host-scoped terminal workspace',
      icon: 'HT',
      component: TerminalComponent,
      defaultBounds: { x: 520, y: 92, width: 820, height: 580 },
      searchable: false,
      launcherCategory: 'contextual-host-file-window',
      manifest: buildSystemAppletManifest({
        appId: 'host-terminal',
        name: 'Host Terminal',
        description: 'Host-scoped terminal workspace',
        icon: 'HT',
        defaultBounds: { x: 520, y: 92, width: 820, height: 580 },
        launcherCategory: 'contextual-host-file-window',
        capabilities: ['host:read', 'host:terminal', 'command:read'],
        contextMenuTargets: ['desktop', 'desktop-icon', 'launcher-row', 'taskbar', 'terminal', 'window'],
      }),
    },
  ];
  installedAppDefinitions: ShellAppDefinition[] = [];

  private nextZIndex = 10;
  private nextWindowOrdinal = 1;
  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;
  private iconDragState: IconDragState | null = null;
  private workspaceProfilesLoadPromise: Promise<void> | null = null;
  private _navHandler: ((event: MessageEvent) => void) | null = null;
  private pendingLegacyDesktopShortcutPins: DesktopShortcut[] = [];

  constructor() {
    // Profiles are loaded asynchronously from SQLite in ngOnInit.
    // Initialize with empty defaults to avoid localStorage sync coupling.
    this.syncFirstRunState();
    this.desktopShortcuts = this.loadDesktopShortcuts();
    this.saveDesktopShortcuts();
    this.desktopIconPositions = this.loadDesktopIconPositions();
    this.workspaceArtifacts = this.loadWorkspaceArtifacts();
  }

  ngOnInit(): void {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'SwitchboardOS preload API is unavailable.';
      return;
    }

    // Listen for navigation events from hosts component
    const navHandler = (event: MessageEvent): void => {
      if (event.data?.type === 'sb:navigate' && event.data?.route) {
        this.navigate(event.data.route);
      } else if (event.data?.type === 'sb:app-installed' && event.data?.appId) {
        void this.loadInstalledApps().then(() => {
          const appId = String(event.data.appId);
          this.addShortcut(appId);
          this.openApp(appId);
        });
      } else if (event.data?.type === 'sb:app-open' && event.data?.appId) {
        void this.loadInstalledApps().then(() => {
          this.openApp(String(event.data.appId));
        });
      } else if (event.data?.type === 'sb:settings-saved') {
        if (typeof event.data.desktopWallpaper === 'string') {
          this.applyDesktopWallpaper(event.data.desktopWallpaper);
        }
        if (typeof event.data.desktopWallpaperLayout === 'string') {
          this.applyDesktopWallpaperLayout(event.data.desktopWallpaperLayout);
        }
        if (typeof event.data.theme === 'string') {
          this.applyTheme(event.data.theme);
        } else {
          void api.settings.get()
            .then((settings) => {
              this.applyTheme(settings.theme);
            })
            .catch(() => {});
        }
        void this.refreshOperatorConfigurationState();
      } else if (event.data?.type === 'sb:agent-endpoints-saved') {
        void this.refreshOperatorConfigurationState();
      }
    };
    this._navHandler = navHandler;
    window.addEventListener('message', navHandler);

    void api.app.getInfo()
      .then((info) => {
        this.appInfo = info;
      })
      .catch(() => {
        this.appInfo = null;
      });
    void api.settings.get()
      .then((settings) => {
        this.applyTheme(settings.theme);
        this.applyDesktopWallpaper(settings.desktopWallpaper);
        this.applyDesktopWallpaperLayout(settings.desktopWallpaperLayout);
        this.operatorSettingsConfigured = this.hasLegacyOperatorEndpoint(settings);
      })
      .catch(() => {
        this.applyTheme('dark');
        this.applyDesktopWallpaper('default');
        this.applyDesktopWallpaperLayout('fill');
        this.operatorSettingsConfigured = false;
      });
    void this.loadWorkspaceContext()
      .then(() => this.loadWorkspaceArtifactsFromBackend());
  }

  ngOnDestroy(): void {
    this.stopDrag();
    this.stopResize();
    this.stopIconDrag();
    this.clearToastTimers();
    if (this._navHandler) {
      window.removeEventListener('message', this._navHandler);
    }
  }

  taskbarWindowObject(windowItem: ShellWindow): ShellPrimitiveObject {
    return this.createShellPrimitiveObject({
      id: `shell:taskbar-window:${windowItem.windowId}`,
      kind: 'taskbar-window',
      source: 'window-object',
      label: windowItem.title,
      targetScope: 'taskbar-window',
      actionIds: [
        ...TASKBAR_WINDOW_ACTION_IDS,
        ...windowItem.registeredActions.map((action) => action.id),
      ],
      sourceAppId: windowItem.appId,
      windowId: windowItem.windowId,
      requiredCapabilities: windowItem.appDefinition.manifest
        ? [...windowItem.appDefinition.manifest.capabilities]
        : [],
    });
  }

  notificationContext(kind: ShellNotificationKind, message: string, toastId?: string): ShellNotificationContext {
    return {
      id: toastId ?? `shell:notification:${kind}`,
      kind,
      message,
      ...(toastId ? { toastId } : {}),
    };
  }

  notificationObject(notification: ShellNotificationContext): ShellPrimitiveObject {
    return this.createShellPrimitiveObject({
      id: notification.id,
      kind: 'notification',
      label: notification.kind === 'toast' ? 'Toast Notification' : `${notification.kind} Notification`,
      targetScope: 'notification',
      actionIds: [...NOTIFICATION_ACTION_IDS],
      notificationKind: notification.kind,
    });
  }

  shellPrimitiveActionIds(object: ShellPrimitiveObject): string {
    return object.actionIds.join(',');
  }

  shellPrimitiveCapabilities(object: ShellPrimitiveObject): string {
    return (object.requiredCapabilities ?? []).join(',');
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const keyboardShortcut = this.keyboardShortcutForEvent(event);
    if (!keyboardShortcut) {
      return;
    }

    if (keyboardShortcut.kind === 'shell' && keyboardShortcut.actionId === 'open-command-palette') {
      this.commandPaletteOpen = true;
      this.paletteQuery = '';
      event.preventDefault();
      return;
    }

    if (keyboardShortcut.kind === 'shell' && keyboardShortcut.actionId === 'close-shell-overlays') {
      this.commandPaletteOpen = false;
      this.launcherOpen = false;
      const focusReturnElement = this.contextMenu?.focusReturnElement;
      this.contextMenu = null;
      setTimeout(() => focusReturnElement?.focus(), 0);
      event.preventDefault();
      return;
    }

    if (keyboardShortcut.kind === 'app' && keyboardShortcut.appId) {
      this.openApp(keyboardShortcut.appId);
      event.preventDefault();
      return;
    }

    const focused = this.focusedWindow;
    if (keyboardShortcut.kind === 'window-action' && focused) {
      void this.runWindowAction(focused, keyboardShortcut.actionId);
      event.preventDefault();
    }
  }

  private keyboardShortcutForEvent(event: KeyboardEvent): ShellKeyboardShortcut | null {
    return SHELL_KEYBOARD_SHORTCUTS.find((shortcut) => this.keyboardShortcutMatches(shortcut, event)) ?? null;
  }

  private keyboardShortcutMatches(shortcut: ShellKeyboardShortcut, event: KeyboardEvent): boolean {
    const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const shortcutKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;
    if (eventKey !== shortcutKey) {
      return false;
    }

    if (shortcut.ctrlOrMeta) {
      if (!event.ctrlKey && !event.metaKey) {
        return false;
      }
    } else {
      if (event.ctrlKey) {
        return false;
      }
      if (Boolean(shortcut.metaKey) !== event.metaKey) {
        return false;
      }
    }

    return Boolean(shortcut.altKey) === event.altKey
      && Boolean(shortcut.shiftKey) === event.shiftKey;
  }

  private keyboardShortcutForAction(actionId: string, kind?: KeyboardShortcutKind): ShellKeyboardShortcut | null {
    return SHELL_KEYBOARD_SHORTCUTS.find((shortcut) =>
      shortcut.actionId === actionId && (!kind || shortcut.kind === kind)) ?? null;
  }

  private keyboardShortcutForApp(appId: ShellAppId): ShellKeyboardShortcut | null {
    return SHELL_KEYBOARD_SHORTCUTS.find((shortcut) =>
      shortcut.kind === 'app' && shortcut.appId === appId) ?? null;
  }

  @HostListener('document:click', ['$event'])
  closeContextMenuOnClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.context-menu')) {
      return;
    }
    this.contextMenu = null;
  }

  @HostListener('document:contextmenu', ['$event'])
  captureDocumentContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  @HostListener('window:switchboard-terminal-semantic', ['$event'])
  handleTerminalSemanticEvent(event: CustomEvent<{ windowId: string; semanticState: ShellWindowSemanticState }>): void {
    const detail = event.detail;
    const windowItem = this.windows.find((candidate) => candidate.windowId === detail?.windowId);
    if (!windowItem) {
      return;
    }

    windowItem.semanticState = detail.semanticState;
  }

  @HostListener('window:switchboard-generated-app-semantic', ['$event'])
  handleGeneratedAppSemanticEvent(event: CustomEvent<{
    windowId: string;
    semanticState: ShellWindowSemanticState;
    registeredActions?: ShellWindowAction[];
  }>): void {
    const detail = event.detail;
    const windowItem = this.windows.find((candidate) => candidate.windowId === detail?.windowId);
    if (!windowItem) {
      return;
    }

    windowItem.semanticState = detail.semanticState;
    if (Array.isArray(detail.registeredActions)) {
      windowItem.registeredActions = [
        ...detail.registeredActions,
        ...this.layoutActions(),
      ];
    }
  }

  @HostListener('window:switchboard-generated-app-window-request', ['$event'])
  handleGeneratedAppWindowRequest(event: CustomEvent<GeneratedAppWindowSdkRequestDetail>): void {
    const detail = event.detail;
    const windowItem = this.windows.find((candidate) =>
      candidate.windowId === detail?.windowId
      && candidate.appId === detail.appId
      && this.isGeneratedAppWindow(candidate));

    detail.handled = true;
    if (!windowItem) {
      detail.reject(new Error('Generated app window scope was not found.'));
      return;
    }

    try {
      detail.resolve(this.applyGeneratedAppWindowRequest(windowItem, detail.method, detail.payload));
    } catch (error) {
      detail.reject(error instanceof Error ? error : new Error('Generated app window request failed.'));
    }
  }

  get focusedWindow(): ShellWindow | null {
    return this.windows.find((windowItem) => windowItem.focused) ?? null;
  }

  get visibleWindows(): ShellWindow[] {
    return this.windows.filter((windowItem) => windowItem.state !== 'minimized');
  }

  get searchableApps(): ShellAppDefinition[] {
    return this.allAppDefinitions.filter((definition) => this.isAppDiscoverable(definition));
  }

  get operatorConfigured(): boolean {
    return this.operatorSettingsConfigured || this.operatorAgentEndpointConfigured;
  }

  get launcherApps(): ShellAppDefinition[] {
    const coreApps = DEFAULT_LAUNCHER_APP_IDS
      .map((appId) => this.getAppDefinition(appId))
      .filter((definition): definition is ShellAppDefinition =>
        definition !== null && definition.launcherCategory === 'core-launcher-system');
    const installedApps = this.installedAppDefinitions
      .filter((definition) => definition.generated && definition.searchable);
    return [...coreApps, ...installedApps];
  }

  isDefaultLauncherRow(definition: ShellAppDefinition): boolean {
    return definition.launcherCategory === 'core-launcher-system'
      && (DEFAULT_LAUNCHER_APP_IDS as readonly ShellAppId[]).includes(definition.appId);
  }

  get desktopShortcutApps(): DesktopShortcutItem[] {
    return this.desktopShortcuts
      .map((shortcut) => {
        const definition = this.getAppDefinition(shortcut.appId);
        if (!definition) {
          return null;
        }
        const label = this.visibleShortcutLabel(shortcut, definition);
        return {
          id: shortcut.id,
          appId: shortcut.appId,
          definition,
          shellOwned: shortcut.shellOwned,
          label,
        } as DesktopShortcutItem;
      })
      .filter((shortcut): shortcut is DesktopShortcutItem => Boolean(shortcut));
  }

  get allAppDefinitions(): ShellAppDefinition[] {
    return [...this.appDefinitions, ...this.installedAppDefinitions];
  }

  get welcomeApplet(): ShellAppDefinition | null {
    return this.getAppDefinition(WELCOME_APPLET_ID);
  }

  get welcomeAppletManifest(): AppManifest | null {
    return this.welcomeApplet?.manifest ?? null;
  }

  get welcomeAppletCapabilities(): string {
    return (this.welcomeAppletManifest?.capabilities ?? []).join(',');
  }

  get welcomeAppletPresentationMode(): string | null {
    const mode = this.welcomeAppletManifest?.packageMetadata['defaultPresentationMode'];
    return typeof mode === 'string' ? mode : null;
  }

  get activeProfile(): WorkspaceProfile {
    const profile = this.workspaceProfiles.find((candidate) => candidate.profileId === this.activeProfileId);
    if (profile) {
      return profile;
    }

    return this.workspaceProfiles[0] ?? this.createDefaultWorkspaceProfile();
  }

  get activeProfileName(): string {
    return this.activeProfile.name;
  }

  get paletteResults(): PaletteResult[] {
    const query = this.paletteQuery.trim().toLowerCase();
    const results: PaletteResult[] = [];

    for (const app of this.searchableApps) {
      results.push(this.appPaletteResult(app));
    }

    for (const host of this.hosts) {
      results.push({
        id: `host-dashboard:${host.id}`,
        label: `Host dashboard: ${host.name}`,
        detail: `${host.username || 'user'}@${host.address || host.hostname}:${host.port}`,
        kind: 'host-dashboard',
        hostId: host.id,
      });
      results.push({
        id: `host-terminal:${host.id}`,
        label: `Host terminal: ${host.name}`,
        detail: `${host.username || 'user'}@${host.address || host.hostname}:${host.port}`,
        kind: 'host-terminal',
        hostId: host.id,
      });
      for (const operationAppId of ['file-browser', 'log-viewer', 'service-manager', 'process-viewer'] as HostOperationAppId[]) {
        const definition = this.getAppDefinition(operationAppId);
        results.push({
          id: `${operationAppId}:${host.id}`,
          label: `${definition?.title ?? operationAppId}: ${host.name}`,
          detail: `${definition?.detail ?? 'Host operation'} for ${host.address || host.hostname}`,
          kind: 'host-operation',
          operationAppId,
          hostId: host.id,
        });
      }
    }

    const focused = this.focusedWindow;
    if (focused) {
      results.push(...this.windowActionPaletteResults(focused));
    }

    if (!query) {
      return results.slice(0, 12);
    }

    return results
      .filter((result) => `${result.label} ${result.detail}`.toLowerCase().includes(query))
      .slice(0, 12);
  }

  private appPaletteResult(app: ShellAppDefinition): PaletteResult {
    const shortcut = this.keyboardShortcutForApp(app.appId);
    const manifest = app.manifest;
    return {
      id: `app:${app.appId}`,
      label: app.title,
      detail: app.detail,
      kind: 'app',
      appId: app.appId,
      source: manifest ? 'app-manifest' : 'shell',
      sourceAppId: app.appId,
      targetScope: 'command-palette',
      actionId: 'open-app',
      requiredCapabilities: [],
      capabilities: manifest ? [...manifest.capabilities] : [],
      shortcut: shortcut?.shortcut,
      isSystemApplet: Boolean(manifest?.packageMetadata['systemApplet']),
      launcherCategory: app.launcherCategory,
      defaultLauncherRow: this.isDefaultLauncherRow(app),
    };
  }

  private windowActionPaletteResults(windowItem: ShellWindow): PaletteResult[] {
    const definition = windowItem.appDefinition;
    const contributionId = 'windowActions';
    const contributionCapabilities = this.requiredCapabilitiesForContextContribution(definition, contributionId);
    if (!this.appManifestContextContributionAllowed(definition, 'window', contributionId, ['taskbar-window', 'window'], contributionCapabilities)) {
      return [];
    }

    return windowItem.registeredActions
      .filter((action) => this.contextMenuActionCapabilitiesAllowed(definition, [
        ...contributionCapabilities,
        ...(action.capability ? [action.capability] : []),
      ]))
      .map((action) => {
        const requiredCapabilities = [
          ...contributionCapabilities,
          ...(action.capability ? [action.capability] : []),
        ];
        return {
          id: `action:${windowItem.windowId}:${action.id}`,
          label: action.label,
          detail: action.description,
          kind: 'window-action' as const,
          windowId: windowItem.windowId,
          actionId: action.id,
          source: 'window-object' as const,
          sourceAppId: definition.appId,
          targetScope: 'focused-window' as const,
          requiredCapabilities,
          capabilities: definition.manifest ? [...definition.manifest.capabilities] : [],
          shortcut: action.shortcut ?? this.keyboardShortcutForAction(action.id, 'window-action')?.shortcut,
        };
      });
  }

  async loadWorkspaceContext(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      return;
    }

    this.isLoadingHosts = true;
    this.errorMessage = '';
    try {
      const [hosts, auditEvents, agentEndpoints] = await Promise.all([
        api.host.list(),
        api.audit.list(),
        api.agentEndpoint?.list?.().catch(() => [] as AgentEndpoint[]) ?? Promise.resolve([] as AgentEndpoint[]),
      ]);
      this.hosts = hosts;
      this.auditEvents = auditEvents;
      this.operatorAgentEndpointConfigured = agentEndpoints.some((endpoint) => this.isConfiguredAgentEndpoint(endpoint));
      await this.loadInstalledApps();
      this.refreshHostScopedWindows();
      this.syncFirstRunState();
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to load host launcher context.');
    } finally {
      this.isLoadingHosts = false;
    }

    await this.loadWorkspaceProfilesFromStore();
  }

  async loadInstalledApps(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api?.appManifest) {
      this.installedAppDefinitions = [];
      return;
    }

    try {
      const manifests = await api.appManifest.list();
      const resolvedManifests = await Promise.all(manifests
        .filter((manifest) => manifest.enabled && hasGeneratedAppContentReference(manifest))
        .map((manifest) => this.resolveInstalledGeneratedAppManifest(manifest)));
      this.installedAppDefinitions = resolvedManifests
        .filter((manifest): manifest is AppManifest => manifest !== null)
        .map((manifest) => this.definitionFromManifest(manifest));
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to load installed generated apps.');
    }
  }

  private async resolveInstalledGeneratedAppManifest(manifest: AppManifest): Promise<AppManifest | null> {
    const artifactPath = generatedAppArtifactPath(manifest);
    if (!artifactPath) {
      return manifest.sourceCode.trim() ? manifest : null;
    }

    const api = getSwitchboardApi();
    if (!api?.workspaceArtifactContent) {
      if (manifest.sourceCode.trim()) {
        return {
          ...manifest,
          packageMetadata: {
            ...manifest.packageMetadata,
            artifactLoadStatus: 'fallback-manifest-source',
            artifactLoadReason: 'workspace artifact content API unavailable',
          },
        };
      }
      return null;
    }

    try {
      const artifact = await api.workspaceArtifactContent.get(artifactPath);
      const sourceCode = generatedAppSourceFromArtifact(artifact);
      if (!sourceCode.trim()) {
        if (manifest.sourceCode.trim()) {
          return {
            ...manifest,
            packageMetadata: {
              ...manifest.packageMetadata,
              artifactLoadStatus: 'fallback-manifest-source',
              artifactLoadReason: 'workspace artifact did not contain generated app source',
            },
          };
        }
        return null;
      }

      return {
        ...manifest,
        sourceCode,
        packageMetadata: {
          ...manifest.packageMetadata,
          artifactBacked: true,
          artifactPath: artifact.path,
          artifactKind: artifact.kind,
          artifactContentRoute: 'workspaceArtifactContent',
          artifactUpdatedAt: artifact.updatedAt,
          artifactSize: artifact.size,
          artifactLoadStatus: 'loaded',
          sourcePersistence: 'workspaceArtifactContent',
          sourceCodeFallback: Boolean(manifest.sourceCode.trim()),
        },
      };
    } catch (error) {
      if (manifest.sourceCode.trim()) {
        return {
          ...manifest,
          packageMetadata: {
            ...manifest.packageMetadata,
            artifactLoadStatus: 'fallback-manifest-source',
            artifactLoadReason: this.errorText(error, 'workspace artifact content unavailable'),
          },
        };
      }
      this.errorMessage = this.errorText(error, `Unable to load workspace artifact for ${manifest.name}.`);
      return null;
    }
  }

  openApp(appId: ShellAppId): void {
    const definition = this.getAppDefinition(appId);
    if (!definition || !definition.searchable) {
      return;
    }

    this.createWindow(definition, null);
    this.launcherOpen = false;
  }

  openHostDashboard(host: HostRecord): void {
    const definition = this.getAppDefinition('host-dashboard');
    if (!definition) {
      return;
    }

    this.createWindow(definition, host, `Host Dashboard - ${host.name}`);
  }

  openHostTerminal(host: HostRecord): void {
    const definition = this.getAppDefinition('host-terminal');
    if (!definition) {
      return;
    }

    this.createWindow(definition, host, `Terminal - ${host.name}`);
  }

  openHostOperation(host: HostRecord, appId: HostOperationAppId): void {
    const definition = this.getAppDefinition(appId);
    if (!definition) {
      return;
    }

    this.createWindow(definition, host, `${definition.title} - ${host.name}`);
  }

  dismissFirstRun(): void {
    this.firstRunOpen = false;
    this.writeWelcomeAppletState({
      dismissed: true,
      dismissedAt: new Date().toISOString(),
    });
  }

  startFirstRunStep(appId: ShellAppId): void {
    this.openApp(appId);
  }

  openStartMenuFromWelcome(): void {
    this.launcherOpen = true;
    this.firstRunOpen = false;
  }

  closeWindow(windowItem: ShellWindow): void {
    this.windows = this.windows.filter((candidate) => candidate.windowId !== windowItem.windowId);
    if (!this.windows.some((candidate) => candidate.focused)) {
      this.focusTopWindow();
    }
    this.notify(`${windowItem.title} closed.`);
  }

  minimizeWindow(windowItem: ShellWindow): void {
    windowItem.state = 'minimized';
    windowItem.focused = false;
    this.focusTopWindow();
  }

  toggleMaximize(windowItem: ShellWindow): void {
    windowItem.state = windowItem.state === 'maximized' ? 'floating' : 'maximized';
    windowItem.tilePosition = null;
    this.focusWindow(windowItem);
  }

  restoreWindow(windowItem: ShellWindow): void {
    windowItem.state = 'floating';
    windowItem.tilePosition = null;
    this.focusWindow(windowItem);
  }

  focusWindow(windowItem: ShellWindow): void {
    for (const candidate of this.windows) {
      candidate.focused = candidate.windowId === windowItem.windowId;
    }
    windowItem.zIndex = this.nextZIndex++;
    if (windowItem.state === 'minimized') {
      windowItem.state = 'floating';
    }
  }

  blurWorkspace(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.desktop-window, .desktop-icon, .launcher-panel, .command-palette, .inspector-panel')) {
      return;
    }

    for (const windowItem of this.windows) {
      windowItem.focused = false;
    }
  }

  tileWindow(windowItem: ShellWindow, tilePosition: ShellTilePosition): void {
    windowItem.state = 'tiled';
    windowItem.tilePosition = tilePosition;
    this.focusWindow(windowItem);
    this.notify(`${windowItem.title} tiled ${tilePosition}.`);
  }

  setFullscreen(windowItem: ShellWindow): void {
    windowItem.state = windowItem.state === 'fullscreen' ? 'floating' : 'fullscreen';
    windowItem.tilePosition = null;
    this.focusWindow(windowItem);
  }

  startDrag(event: MouseEvent, windowItem: ShellWindow): void {
    if (event.button !== 0 || this.isResponsiveWorkspace()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      return;
    }

    const surface = this.desktopSurface();
    const windowElement = (event.currentTarget as HTMLElement).closest('.desktop-window') as HTMLElement | null;
    if (!surface || !windowElement) {
      return;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const windowRect = windowElement.getBoundingClientRect();
    const offsetX = event.clientX - windowRect.left;
    const offsetY = event.clientY - windowRect.top;
    this.stopDrag();
    this.stopResize();
    windowItem.state = 'floating';
    windowItem.tilePosition = null;
    this.focusWindow(windowItem);

    const dragState: DragState = {
      move: (moveEvent: MouseEvent) => {
        const maxX = Math.max(0, surfaceRect.width - windowItem.bounds.width);
        const maxY = Math.max(0, surfaceRect.height - windowItem.bounds.height);
        windowItem.bounds = {
          ...windowItem.bounds,
          x: clamp(moveEvent.clientX - surfaceRect.left - offsetX, 0, maxX),
          y: clamp(moveEvent.clientY - surfaceRect.top - offsetY, 0, maxY),
        };
      },
      end: (endEvent: MouseEvent) => {
        this.applyEdgeSnap(endEvent, windowItem, surfaceRect);
        this.stopDrag();
      },
    };

    this.dragState = dragState;
    document.addEventListener('mousemove', dragState.move);
    document.addEventListener('mouseup', dragState.end, { once: true });
    event.preventDefault();
  }

  startResize(event: MouseEvent, windowItem: ShellWindow): void {
    if (event.button !== 0 || this.isResponsiveWorkspace()) {
      return;
    }

    const surface = this.desktopSurface();
    if (!surface) {
      return;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBounds = { ...windowItem.bounds };
    windowItem.state = 'floating';
    windowItem.tilePosition = null;
    this.stopDrag();
    this.stopResize();
    this.focusWindow(windowItem);

    const resizeState: ResizeState = {
      move: (moveEvent: MouseEvent) => {
        const maxWidth = Math.max(420, surfaceRect.width - startBounds.x);
        const maxHeight = Math.max(300, surfaceRect.height - startBounds.y);
        windowItem.bounds = {
          ...windowItem.bounds,
          width: clamp(startBounds.width + moveEvent.clientX - startX, 420, maxWidth),
          height: clamp(startBounds.height + moveEvent.clientY - startY, 300, maxHeight),
        };
      },
      end: () => {
        this.stopResize();
      },
    };

    this.resizeState = resizeState;
    document.addEventListener('mousemove', resizeState.move);
    document.addEventListener('mouseup', resizeState.end, { once: true });
    event.preventDefault();
    event.stopPropagation();
  }

  windowStyle(windowItem: ShellWindow): Record<string, string> {
    const zIndex = String(windowItem.zIndex);
    if (windowItem.state === 'maximized' || windowItem.state === 'fullscreen') {
      return {
        left: '10px',
        top: '10px',
        width: 'calc(100% - 20px)',
        height: 'calc(100% - 20px)',
        'z-index': zIndex,
      };
    }

    if (windowItem.state === 'tiled' && windowItem.tilePosition) {
      return {
        ...this.tileStyle(windowItem.tilePosition),
        'z-index': zIndex,
      };
    }

    return {
      left: `${windowItem.bounds.x}px`,
      top: `${windowItem.bounds.y}px`,
      width: `${windowItem.bounds.width}px`,
      height: `${windowItem.bounds.height}px`,
      'z-index': zIndex,
    };
  }

  selectShortcut(shortcutId: string): void {
    this.selectedShortcutId = shortcutId;
    this.launcherOpen = false;
  }

  desktopIconStyle(shortcutId: string, index: number): Record<string, string> {
    const position = this.desktopIconPositions[shortcutId] ?? this.defaultIconPosition(index);
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
    };
  }

  startDesktopIconDrag(event: MouseEvent, shortcutId: string, index: number): void {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('.desktop-icon')) {
      // A click should still select/open the icon; movement beyond a few pixels
      // is handled by the document mousemove below.
    }
    const surface = this.desktopSurface();
    if (!surface) {
      return;
    }
    const surfaceRect = surface.getBoundingClientRect();
    const current = this.desktopIconPositions[shortcutId] ?? this.defaultIconPosition(index);
    this.stopIconDrag();
    const iconDragState: IconDragState = {
      shortcutId,
      offsetX: event.clientX - surfaceRect.left - current.x,
      offsetY: event.clientY - surfaceRect.top - current.y,
      move: (moveEvent: MouseEvent) => {
        const x = clamp(moveEvent.clientX - surfaceRect.left - iconDragState.offsetX, 8, Math.max(8, surfaceRect.width - 96));
        const y = clamp(moveEvent.clientY - surfaceRect.top - iconDragState.offsetY, 8, Math.max(8, surfaceRect.height - 112));
        this.desktopIconPositions = {
          ...this.desktopIconPositions,
          [shortcutId]: { x, y },
        };
      },
      end: () => {
        this.snapDesktopIcon(shortcutId);
        this.saveDesktopIconPositions();
        this.stopIconDrag();
      },
    };
    this.iconDragState = iconDragState;
    document.addEventListener('mousemove', iconDragState.move);
    document.addEventListener('mouseup', iconDragState.end, { once: true });
  }

  openDesktopContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.desktop-icon-frame, .desktop-window, .launcher-panel, .command-palette, .profile-panel, .context-menu')) {
      return;
    }
    this.showContextMenu(event, 'desktop', 'Desktop', this.desktopContextItems());
  }

  openDesktopIconContextMenu(event: MouseEvent, shortcut: DesktopShortcutItem): void {
    this.showContextMenu(
      event,
      'desktop-icon',
      shortcut.label ?? shortcut.definition.title,
      this.desktopIconContextItems(shortcut),
      shortcut.appId,
      shortcut.id,
    );
  }

  private visibleShortcutLabel(shortcut: DesktopShortcut, definition: ShellAppDefinition): string {
    const label = typeof shortcut.label === 'string' ? shortcut.label.trim() : '';
    return label || definition.title;
  }

  private renameDesktopShortcut(shortcutId: string): void {
    const shortcut = this.desktopShortcuts.find((candidate) => candidate.id === shortcutId);
    if (!shortcut) {
      return;
    }

    const definition = this.getAppDefinition(shortcut.appId);
    if (!definition) {
      this.errorMessage = `Unable to rename shortcut "${shortcut.appId}".`;
      return;
    }

    const requestedName = window.prompt(`Rename "${definition.title}"`, this.visibleShortcutLabel(shortcut, definition));
    if (requestedName === null) {
      return;
    }
    const trimmedName = requestedName.trim();
    if (!trimmedName) {
      this.errorMessage = 'Shortcut label is required.';
      return;
    }

    const nextLabel = trimmedName === definition.title ? undefined : trimmedName;
    this.desktopShortcuts = this.desktopShortcuts.map((candidate) =>
      candidate.id === shortcutId ? { ...candidate, label: nextLabel } : candidate,
    );
    this.saveDesktopShortcuts();
    void this.persistActiveProfileLayout(false);
    this.notify(`Shortcut renamed to "${trimmedName}".`);
  }

  openTaskbarContextMenu(event: MouseEvent): void {
    this.showContextMenu(
      event,
      'taskbar',
      this.taskbarPanelObject.label,
      this.taskbarContextItems(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      this.taskbarPanelObject,
    );
  }

  openTrayStatusContextMenu(event: MouseEvent): void {
    this.showContextMenu(
      event,
      'tray-status',
      this.trayStatusObject.label,
      this.trayStatusContextItems(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      this.trayStatusObject,
    );
  }

  openTaskbarWindowContextMenu(event: MouseEvent, windowItem: ShellWindow): void {
    const object = this.taskbarWindowObject(windowItem);
    this.showContextMenu(
      event,
      'taskbar-window',
      windowItem.title,
      this.taskbarWindowContextItems(windowItem),
      windowItem.appId,
      undefined,
      windowItem.windowId,
      undefined,
      undefined,
      undefined,
      object,
    );
  }

  openWindowContextMenu(event: MouseEvent, windowItem: ShellWindow): void {
    this.showContextMenu(
      event,
      'window',
      windowItem.title,
      this.windowContextItems(windowItem),
      windowItem.appId,
      undefined,
      windowItem.windowId,
    );
  }

  openTerminalContextMenu(event: MouseEvent, windowItem: ShellWindow): void {
    const host = this.hostFor(windowItem);
    this.showContextMenu(
      event,
      'terminal',
      windowItem.title,
      this.terminalContextItems(windowItem, host),
      windowItem.appId,
      undefined,
      windowItem.windowId,
      undefined,
      host?.id ?? windowItem.hostId ?? undefined,
    );
  }

  openLauncherRowContextMenu(event: MouseEvent, appId: ShellAppId): void {
    const definition = this.getAppDefinition(appId);
    this.showContextMenu(event, 'launcher-row', definition?.title ?? appId, this.launcherRowContextItems(appId), appId);
  }

  openHostContextMenu(event: MouseEvent, host: HostRecord): void {
    this.showContextMenu(
      event,
      'host',
      host.name,
      this.hostContextItems(host),
      undefined,
      undefined,
      undefined,
      undefined,
      host.id,
    );
  }

  openAppletElementContextMenu(windowItem: ShellWindow, request: AppletElementContextMenuRequest): void {
    const actionIds = request.object.actionIds ?? request.actions.map((action) => action.id);
    const actionCapabilities = request.actions.flatMap((action) => action.requiredCapabilities ?? []);
    const capabilities = request.object.requiredCapabilities ?? Array.from(new Set(actionCapabilities));
    const sourceAppId = request.object.sourceAppId ?? windowItem.appId;
    const sourceWindowId = request.object.sourceWindowId ?? windowItem.windowId;
    const object: ShellPrimitiveObject = {
      id: request.object.id,
      kind: request.object.kind,
      owner: request.object.owner,
      source: request.object.source,
      targetScope: request.object.targetScope,
      label: request.object.label,
      actionIds,
      sourceAppId,
      windowId: sourceWindowId,
      hostId: request.object.hostId,
      remotePath: request.object.remotePath,
      requiredCapabilities: capabilities,
    };
    this.showContextMenuAt({
      x: request.x,
      y: request.y,
      target: request.target,
      label: request.label,
      items: this.appletElementContextItems(request, sourceAppId, sourceWindowId),
      appId: sourceAppId,
      windowId: sourceWindowId,
      hostId: request.object.hostId,
      object,
      contributionSurface: request.object.source === 'generated-app-sdk' ? 'generated-app-sdk' : 'applet-element',
      focusReturnElement: request.focusReturnElement,
    });
  }

  openWorkspaceArtifactContextMenu(event: MouseEvent, artifact: WorkspaceArtifact): void {
    this.showWorkspaceArtifactProperties(artifact);
    event.preventDefault();
    event.stopPropagation();
    this.showWorkspaceArtifactContextMenuAt(
      event.clientX,
      event.clientY,
      artifact,
      event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined,
    );
  }

  openNotificationContextMenu(event: MouseEvent, notification: ShellNotificationContext): void {
    const object = this.notificationObject(notification);
    this.showContextMenu(
      event,
      'notification',
      object.label,
      this.notificationContextItems(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      notification,
      object,
    );
  }

  runContextMenuAction(item: ContextMenuItem): void {
    if (item.disabled || item.submenu?.length) {
      return;
    }
    const menu = this.contextMenu;
    this.contextMenu = null;
    if (item.handler) {
      void item.handler();
      return;
    }
    const workspaceArtifact = menu?.workspaceArtifact;
    const host = this.contextHost(menu);
    if (item.id.startsWith('window-action:')) {
      const actionId = item.id.slice('window-action:'.length);
      this.runWindowMenuAction(menu?.windowId, (windowItem) => {
        void this.runWindowAction(windowItem, actionId);
      });
      return;
    }
    switch (item.id) {
      case 'open-menu':
        this.launcherOpen = true;
        return;
      case 'close-menu':
        this.launcherOpen = false;
        return;
      case 'open-app':
        if (menu?.appId) {
          this.openApp(menu.appId);
        }
        return;
      case 'duplicate-shortcut':
        if (menu?.appId) {
          this.addShortcut(menu.appId);
        }
        return;
      case 'show-taskbar-window':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.restoreWindow(windowItem));
        return;
      case 'new-window':
        this.openNewWindowForContext(menu?.windowId, menu?.appId);
        return;
      case 'toggle-minimize-window':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => {
          if (windowItem.state === 'minimized') {
            this.restoreWindow(windowItem);
            return;
          }
          this.minimizeWindow(windowItem);
        });
        return;
      case 'pin-app':
        if (menu?.appId) {
          this.addShortcut(menu.appId);
        }
        return;
      case 'unpin-app':
        if (menu?.appId) {
          this.removeShortcutByAppId(menu.appId);
        }
        return;
      case 'remove-shortcut':
        if (menu?.shortcutId) {
          this.removeShortcutById(menu.shortcutId);
        }
        return;
      case 'rename-shortcut':
        if (menu?.shortcutId) {
          this.renameDesktopShortcut(menu.shortcutId);
        }
        return;
      case 'properties':
        this.notify(`${menu?.label ?? 'Item'} properties inspected.`);
        return;
      case 'open-workspace-artifact':
        if (workspaceArtifact) {
          void this.openWorkspaceArtifact(workspaceArtifact);
        }
        return;
      case 'install-open-workspace-applet-artifact':
        if (workspaceArtifact) {
          void this.installAndOpenWorkspaceAppletArtifact(workspaceArtifact);
        }
        return;
      case 'open-with-workspace-artifact':
        if (workspaceArtifact) {
          void this.openWorkspaceArtifactWith(workspaceArtifact);
        }
        return;
      case 'rename-workspace-artifact':
        if (workspaceArtifact) {
          void this.renameWorkspaceArtifact(workspaceArtifact);
        }
        return;
      case 'duplicate-workspace-artifact':
        if (workspaceArtifact) {
          void this.duplicateWorkspaceArtifact(workspaceArtifact);
        }
        return;
      case 'delete-workspace-artifact':
        if (workspaceArtifact) {
          void this.deleteWorkspaceArtifact(workspaceArtifact);
        }
        return;
      case 'properties-workspace-artifact':
        if (workspaceArtifact) {
          this.showWorkspaceArtifactProperties(workspaceArtifact);
        }
        return;
      case 'copy-workspace-artifact':
        if (workspaceArtifact) {
          this.copyWorkspaceArtifact(workspaceArtifact);
        }
        return;
      case 'cut-workspace-artifact':
        if (workspaceArtifact) {
          this.cutWorkspaceArtifact(workspaceArtifact);
        }
        return;
      case 'paste-workspace-artifact':
        if (workspaceArtifact) {
          void this.pasteWorkspaceArtifact(workspaceArtifact);
          return;
        }
        this.notify('No target folder selected for paste.');
        return;
      case 'open-host-dashboard':
        if (host) {
          this.openHostDashboard(host);
        }
        return;
      case 'open-host-terminal':
        if (host) {
          this.openHostTerminal(host);
        }
        return;
      case 'open-host-file-explorer':
        if (host) {
          this.openHostOperation(host, 'file-browser');
        }
        return;
      case 'edit-host':
        this.openApp('hosts');
        return;
      case 'test-host-connection':
        if (host) {
          void this.testHostConnection(host);
        }
        return;
      case 'host-properties':
        if (host) {
          this.openHostDashboard(host);
        }
        return;
      case 'dismiss-notification':
        this.dismissContextNotification(menu?.notification);
        return;
      case 'clear-notifications':
        this.clearNotifications();
        return;
      case 'open-notification-settings':
        this.openApp('settings');
        return;
      case 'status-details':
        this.notify(this.appInfo ? `SwitchboardOS ${this.appInfo.version} status is ready.` : 'SwitchboardOS status is ready.');
        return;
      case 'tray-notification-settings':
      case 'tray-panel-settings':
        this.openApp('settings');
        return;
      case 'refresh-status':
        void this.loadWorkspaceContext();
        this.notify('Status area refreshed.');
        return;
      case 'terminal-copy':
        this.dispatchTerminalContextAction(menu?.windowId, 'copy');
        return;
      case 'terminal-paste':
        this.dispatchTerminalContextAction(menu?.windowId, 'paste');
        return;
      case 'terminal-clear':
        this.dispatchTerminalContextAction(menu?.windowId, 'clear');
        return;
      case 'terminal-new-window':
        this.openNewWindowForContext(menu?.windowId, menu?.appId);
        return;
      case 'terminal-open-host-dashboard':
        if (host) {
          this.openHostDashboard(host);
        }
        return;
      case 'terminal-properties':
        this.notify(`${menu?.label ?? 'Terminal'} session properties inspected.`);
        return;
      case 'new-folder-in-workspace-folder':
        if (workspaceArtifact) {
          void this.createWorkspaceArtifact('folder', this.workspaceArtifactPath(workspaceArtifact));
        }
        return;
      case 'add-applet':
        void this.createWorkspaceArtifact('applet', '');
        return;
      case 'arrange-lock-panel':
        this.notify('Panel lock and arrangement controls are not available in this build.');
        return;
      case 'task-manager':
        if (this.appDefinitions.some((definition) => definition.appId === 'apps')) {
          this.openApp('apps');
          return;
        }
        if (this.windows.length > 0) {
          const runningWindowNames = this.windows
            .map((windowItem) => windowItem.appDefinition?.title ?? windowItem.appId)
            .filter(Boolean)
            .join(', ');
          this.notify(runningWindowNames ? `Running windows: ${runningWindowNames}` : 'No running windows.');
        } else {
          this.notify('No running windows.');
        }
        return;
      case 'new-folder':
        void this.createWorkspaceArtifact('folder', '');
        return;
      case 'new-applet':
        void this.createWorkspaceArtifact('applet', '');
        return;
      case 'new-scriptlet':
        void this.createWorkspaceArtifact('scriptlet', '');
        return;
      case 'paste':
        void this.pasteWorkspaceArtifact();
        return;
      case 'arrange-icons':
        this.arrangeDesktopIcons();
        return;
      case 'change-wallpaper':
      case 'display-settings':
      case 'panel-settings':
        this.openApp('settings');
        return;
      case 'open-workspace-files':
        this.openApp('workspace-files');
        return;
      case 'refresh-context':
        void this.loadWorkspaceContext();
        return;
      case 'show-desktop':
        this.showDesktop();
        return;
      case 'minimize-window':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.minimizeWindow(windowItem));
        return;
      case 'maximize-window':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.toggleMaximize(windowItem));
        return;
      case 'tile-left':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'left'));
        return;
      case 'tile-right':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'right'));
        return;
      case 'tile-top':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'top'));
        return;
      case 'tile-bottom':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'bottom'));
        return;
      case 'tile-top-left':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'top-left'));
        return;
      case 'tile-top-right':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'top-right'));
        return;
      case 'tile-bottom-left':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'bottom-left'));
        return;
      case 'tile-bottom-right':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.tileWindow(windowItem, 'bottom-right'));
        return;
      case 'toggle-fullscreen':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.setFullscreen(windowItem));
        return;
      case 'close-window':
        this.runWindowMenuAction(menu?.windowId, (windowItem) => this.closeWindow(windowItem));
        return;
      default:
        this.notify(`${item.label} selected.`);
    }
  }

  removeShortcut(event: MouseEvent, shortcutId: string): void {
    event.stopPropagation();
    this.removeShortcutById(shortcutId);
  }

  removeShortcutById(shortcutId: string): void {
    const removed = this.desktopShortcuts.find((candidate) => candidate.id === shortcutId);
    if (!removed || removed.shellOwned) {
      return;
    }
    this.desktopShortcuts = this.desktopShortcuts.filter((candidate) => candidate.id !== shortcutId);
    if (this.selectedShortcutId === shortcutId) {
      this.selectedShortcutId = null;
    }
    const nextPositions = { ...this.desktopIconPositions };
    delete nextPositions[shortcutId];
    this.desktopIconPositions = nextPositions;
    this.saveDesktopShortcuts();
    this.saveDesktopIconPositions();
    void this.persistActiveProfileLayout(false);
  }

  removeShortcutByAppId(appId: ShellAppId): void {
    const before = this.desktopShortcuts.length;
    this.desktopShortcuts = this.desktopShortcuts.filter((shortcut) => {
      if (shortcut.appId !== appId) {
        return true;
      }
      return shortcut.shellOwned;
    });
    if (this.desktopShortcuts.length === before) {
      return;
    }

    const protectedIds = new Set(this.desktopShortcuts
      .filter((shortcut) => shortcut.appId === appId && shortcut.shellOwned)
      .map((shortcut) => shortcut.id));
    this.desktopIconPositions = Object.fromEntries(
      Object.entries(this.desktopIconPositions)
        .filter(([shortcutId]) => this.desktopShortcuts.some((shortcut) => shortcut.id === shortcutId)
          || protectedIds.has(shortcutId)),
    );
    if (this.selectedShortcutId && !this.desktopShortcuts.some((shortcut) => shortcut.id === this.selectedShortcutId)) {
      this.selectedShortcutId = null;
    }
    this.saveDesktopShortcuts();
    this.saveDesktopIconPositions();
    void this.persistActiveProfileLayout(false);
  }

  addShortcut(appId: ShellAppId): void {
    if (!this.isShellAppId(appId)) {
      return;
    }
    const definition = this.getAppDefinition(appId);
    if (!definition?.searchable) {
      return;
    }

    const shortcutId = this.makeShortcutId(appId);
    const index = this.desktopShortcuts.length;
    const shortcut: DesktopShortcut = {
      id: shortcutId,
      appId,
      shellOwned: false,
    };
    this.desktopShortcuts = [...this.desktopShortcuts, shortcut];
    this.desktopIconPositions = {
      ...this.desktopIconPositions,
      [shortcutId]: this.defaultIconPosition(index),
    };
    this.saveDesktopShortcuts();
    this.saveDesktopIconPositions();
    void this.persistActiveProfileLayout(false);
  }

  isShortcutPinned(appId: ShellAppId): boolean {
    return this.desktopShortcuts.some((shortcut) => shortcut.appId === appId);
  }

  toggleLauncher(): void {
    this.launcherOpen = !this.launcherOpen;
  }

  openFromLauncher(appId: ShellAppId): void {
    this.openApp(appId);
    this.launcherOpen = false;
  }

  async navigateWorkspacePath(path: string): Promise<void> {
    const nextPath = this.normalizeWorkspaceRelativePath(path);
    this.workspaceCurrentPath = nextPath;
    this.selectedWorkspaceArtifact = null;
    await this.loadWorkspaceArtifactsFromBackend();
  }

  async navigateWorkspaceRoot(): Promise<void> {
    await this.navigateWorkspacePath('');
  }

  async navigateWorkspaceUp(): Promise<void> {
    if (!this.workspaceCurrentPath) {
      return;
    }
    await this.navigateWorkspacePath(this.workspaceParentPath(this.workspaceCurrentPath));
  }

  async createWorkspaceArtifact(kind: WorkspaceArtifactKind, targetPath = this.workspaceCurrentPath): Promise<void> {
    const normalizedTargetPath = this.normalizeWorkspaceRelativePath(targetPath);
    const api = getSwitchboardApi();
    if (api?.workspaceFile) {
      try {
        let rawArtifact: unknown;
        if (kind === 'folder') {
          rawArtifact = await api.workspaceFile.createFolder(normalizedTargetPath);
        } else {
          rawArtifact = await api.workspaceFile.createFile(kind, normalizedTargetPath);
        }
        const normalized = normalizeWorkspaceArtifact(rawArtifact);
        if (!normalized) {
          this.errorMessage = 'Workspace artifact creation returned an invalid record.';
          return;
        }
        await this.loadWorkspaceArtifactsFromBackend();
        const includesCreated = this.workspaceArtifacts.some((a) => a.id === normalized.id);
        const createdParentPath = this.workspaceParentPath(this.workspaceArtifactPath(normalized));
        if (!includesCreated && createdParentPath === this.workspaceCurrentPath) {
          this.workspaceArtifacts = [normalized, ...this.workspaceArtifacts];
        }
        this.notify(`${normalized.name} created in ${this.workspaceDisplayPathForPath(normalizedTargetPath)}.`);
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Workspace artifact creation failed.');
      }
    }

    const label = kind === 'folder'
      ? 'New Folder'
      : kind === 'applet'
        ? 'New Applet'
        : kind === 'scriptlet'
          ? 'New Scriptlet'
          : 'New Note';
    const existing = this.workspaceArtifacts.filter((artifact) => artifact.kind === kind).length;
    const fallbackArtifact: WorkspaceArtifact = {
      id: `artifact-${Date.now().toString(36)}-${existing + 1}`,
      name: existing === 0 ? label : `${label} ${existing + 1}`,
      kind,
      detail: kind === 'folder'
        ? 'Workspace folder'
        : kind === 'applet'
          ? 'SwitchboardOS applet manifest'
          : kind === 'scriptlet'
            ? 'SSH-backed scriptlet manifest'
            : 'Workspace note',
      path: this.joinWorkspaceRelativePath(normalizedTargetPath, existing === 0 ? label : `${label} ${existing + 1}`),
      updatedAt: new Date().toISOString(),
    };
    this.workspaceArtifacts = [fallbackArtifact, ...this.workspaceArtifacts];
    this.saveWorkspaceArtifacts();
    this.notify(`${fallbackArtifact.name} created in ${this.workspaceDisplayPathForPath(normalizedTargetPath)} (local).`);
  }

  handleWorkspaceArtifactKeydown(event: KeyboardEvent, artifact: WorkspaceArtifact): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button,input,select,textarea')) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      void this.openWorkspaceArtifact(artifact);
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      void this.renameWorkspaceArtifact(artifact);
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      void this.deleteWorkspaceArtifact(artifact);
      return;
    }

    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.showWorkspaceArtifactProperties(artifact);
      const row = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      const rect = row?.getBoundingClientRect();
      this.showWorkspaceArtifactContextMenuAt(
        rect ? rect.left + Math.min(48, Math.max(16, rect.width / 3)) : window.innerWidth / 2,
        rect ? rect.top + Math.min(32, Math.max(16, rect.height / 2)) : window.innerHeight / 2,
        artifact,
        row ?? undefined,
      );
    }
  }

  async openWorkspaceArtifact(artifact: WorkspaceArtifact): Promise<void> {
    if (artifact.kind === 'folder') {
      await this.navigateWorkspacePath(this.workspaceArtifactPath(artifact));
      return;
    }

    if (this.isWorkspaceAppletArtifact(artifact)) {
      await this.installAndOpenWorkspaceAppletArtifact(artifact);
      return;
    }

    this.showWorkspaceArtifactProperties(artifact);
    this.notify(`No registered workspace viewer exists yet for "${artifact.name}".`);
  }

  isWorkspaceAppletArtifact(artifact: WorkspaceArtifact): boolean {
    return artifact.kind === 'applet' && this.workspaceArtifactPath(artifact).endsWith('.sbapplet.json');
  }

  workspaceAppletActionLabel(artifact: WorkspaceArtifact): string {
    if (!this.isWorkspaceAppletArtifact(artifact)) {
      return 'Open';
    }
    return this.installedGeneratedAppForWorkspaceArtifact(artifact)
      ? 'Launch Applet'
      : 'Install/Open Applet';
  }

  workspaceAppletOpenDisabledReason(artifact: WorkspaceArtifact): string {
    if (!this.isWorkspaceAppletArtifact(artifact)) {
      return 'This action is available for .sbapplet.json workspace artifacts.';
    }

    const api = getSwitchboardApi();
    if (!api?.workspaceArtifactContent) {
      return 'Workspace artifact content API is unavailable.';
    }
    if (!api.appManifest) {
      return 'App manifest registry API is unavailable.';
    }
    if (!api.appPermission) {
      return 'App permission API is unavailable.';
    }
    return '';
  }

  private workspaceAppletActionCapabilities(artifact: WorkspaceArtifact): string[] {
    const capabilities = ['workspace-file:read', 'app-manifest:read'];
    capabilities.push(this.installedGeneratedAppForWorkspaceArtifact(artifact) ? 'app-manifest:update' : 'app-manifest:create');
    capabilities.push('app-permission:read', 'app-permission:grant');
    return capabilities;
  }

  private installedGeneratedAppForWorkspaceArtifact(artifact: WorkspaceArtifact): ShellAppDefinition | null {
    const path = this.workspaceArtifactPath(artifact);
    return this.installedAppDefinitions.find((definition) =>
      Boolean(definition.generated && definition.manifest && generatedAppArtifactPath(definition.manifest) === path),
    ) ?? null;
  }

  private capabilitiesFromWorkspaceAppletManifest(manifestRecord: Record<string, unknown>): string[] {
    const requestedCapabilities = manifestStringArrayField(manifestRecord, 'requestedCapabilities');
    const capabilities = manifestStringArrayField(manifestRecord, 'capabilities');
    return requestedCapabilities.length > 0 ? requestedCapabilities : capabilities;
  }

  private workspaceAppletNameFromArtifact(artifact: WorkspaceArtifact): string {
    return artifact.name.endsWith('.sbapplet.json')
      ? artifact.name.slice(0, -'.sbapplet.json'.length)
      : artifact.name;
  }

  async installAndOpenWorkspaceAppletArtifact(artifact: WorkspaceArtifact): Promise<void> {
    const disabledReason = this.workspaceAppletOpenDisabledReason(artifact);
    if (disabledReason) {
      this.showWorkspaceArtifactProperties(artifact);
      this.notify(disabledReason);
      return;
    }

    const api = getSwitchboardApi();
    if (!api?.workspaceArtifactContent || !api.appManifest || !api.appPermission) {
      this.errorMessage = 'Workspace artifact install APIs are unavailable.';
      return;
    }

    const artifactPath = this.workspaceArtifactPath(artifact);
    this.errorMessage = '';
    try {
      const artifactRecord = await api.workspaceArtifactContent.get(artifactPath);
      if (artifactRecord.kind !== 'applet') {
        throw new Error('Workspace artifact content is not an applet manifest.');
      }

      const manifestRecord = artifactRecord.manifest as Record<string, unknown>;
      const sourceCode = generatedAppSourceFromArtifact(artifactRecord);
      if (!sourceCode.trim()) {
        throw new Error('Workspace applet artifact does not contain generated app source.');
      }

      const appId = manifestStringField(manifestRecord, 'appId');
      if (!appId) {
        throw new Error('Workspace applet artifact manifest is missing appId.');
      }

      const capabilities = this.capabilitiesFromWorkspaceAppletManifest(manifestRecord);
      const manifests = await api.appManifest.list();
      const existing = manifests.find((candidate) =>
        candidate.appId === appId || generatedAppArtifactPath(candidate) === artifactRecord.path,
      );
      const now = new Date().toISOString();
      const input: CreateAppManifestInput = {
        appId,
        name: manifestStringField(manifestRecord, 'name', this.workspaceAppletNameFromArtifact(artifact)),
        description: manifestStringField(manifestRecord, 'description', `Workspace applet artifact ${artifact.name}.`),
        version: manifestStringField(manifestRecord, 'version', '0.1.0'),
        author: manifestStringField(manifestRecord, 'author', 'SwitchboardOS Workspace'),
        entrypoint: manifestStringField(manifestRecord, 'entrypoint', `${appId}.js`),
        icon: manifestStringField(manifestRecord, 'icon', 'APP'),
        category: manifestStringField(manifestRecord, 'category', 'workspace-applet'),
        capabilities,
        sourceCode: '',
        packageMetadata: {
          ...(existing?.packageMetadata ?? {}),
          artifactBacked: true,
          artifactPath: artifactRecord.path,
          artifactKind: artifactRecord.kind,
          artifactContentRoute: 'workspaceArtifactContent',
          artifactUpdatedAt: artifactRecord.updatedAt,
          artifactSize: artifactRecord.size,
          sourcePersistence: 'workspaceArtifactContent',
          sourceCodeFallback: Boolean(existing?.sourceCode.trim()),
          installedFrom: 'file-explorer',
          sourceCodeLogged: false,
          isolation: 'sandboxed-iframe-srcdoc',
          sdkBridge: 'postMessage',
          nodeAccess: false,
        },
        enabled: true,
        installedAt: existing?.installedAt ?? now,
      };

      const persisted = existing
        ? await api.appManifest.update(existing.id, input)
        : await api.appManifest.create(input);
      const manifest = persisted ?? existing;
      if (!manifest) {
        throw new Error('Workspace applet manifest was not persisted.');
      }

      const permissions = await api.appPermission.list(manifest.appId);
      for (const capability of capabilities) {
        if (!permissions.some((permission) => permission.capability === capability && permission.granted)) {
          await api.appPermission.create({
            appId: manifest.appId,
            capability,
            granted: true,
          });
        }
      }

      await api.audit.log({
        type: 'workspace_artifact.app_installed',
        entityType: 'app',
        entityId: manifest.appId,
        message: 'Workspace applet artifact installed and opened from File Explorer.',
        metadata: {
          appId: manifest.appId,
          manifestId: manifest.id,
          artifactPath: artifactRecord.path,
          artifactKind: artifactRecord.kind,
          artifactContentRoute: 'workspaceArtifactContent',
          sourcePersistedInManifest: false,
          sourcePersistedInWorkspaceArtifact: true,
          sourceCodeLogged: false,
          secretsLogged: false,
        },
      });

      await this.loadInstalledApps();
      window.postMessage({ type: 'sb:app-installed', appId: manifest.appId }, '*');
      this.showWorkspaceArtifactProperties(artifact);
      this.openApp(manifest.appId);
      this.notify(`${manifest.name} launched from workspace artifact ${artifactRecord.path}.`);
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to install workspace applet artifact.');
    }
  }

  openWorkspaceArtifactWith(artifact: WorkspaceArtifact): void {
    this.showWorkspaceArtifactProperties(artifact);
    this.notify(`No registered Open With handler exists yet for "${artifact.name}".`);
  }

  showWorkspaceArtifactProperties(artifact: WorkspaceArtifact): void {
    this.selectedWorkspaceArtifact = artifact;
  }

  copyWorkspaceArtifact(artifact: WorkspaceArtifact): void {
    const path = this.workspaceArtifactPath(artifact);
    this.workspaceClipboard = {
      mode: 'copy',
      path,
      name: artifact.name,
    };
    this.notify(`Copied "${artifact.name}" to workspace clipboard.`);
  }

  cutWorkspaceArtifact(artifact: WorkspaceArtifact): void {
    const path = this.workspaceArtifactPath(artifact);
    this.workspaceClipboard = {
      mode: 'cut',
      path,
      name: artifact.name,
    };
    this.notify(`Cut "${artifact.name}" to workspace clipboard.`);
  }

  async pasteWorkspaceArtifact(targetArtifact?: WorkspaceArtifact): Promise<void> {
    if (!this.workspaceClipboard) {
      this.notify('Workspace clipboard is empty.');
      return;
    }

    if (targetArtifact && targetArtifact.kind !== 'folder') {
      this.notify('Clipboard paste is available for folder artifacts only.');
      return;
    }

    const targetPath = targetArtifact ? this.workspaceArtifactPath(targetArtifact) : '';
    const api = getSwitchboardApi();
    const clipboardMode = this.workspaceClipboard.mode;
    const originalName = this.workspaceClipboard.name;
    const applySelection = (path: string): void => {
      const artifact = this.workspaceArtifacts.find((candidate) => this.workspaceArtifactPath(candidate) === path);
      if (artifact) {
        this.showWorkspaceArtifactProperties(artifact);
      }
    };

    if (api?.workspaceFile?.copy && api.workspaceFile.move && api.workspaceFile) {
      try {
        const result = clipboardMode === 'copy'
          ? await api.workspaceFile.copy(this.workspaceClipboard.path, targetPath)
          : await api.workspaceFile.move(this.workspaceClipboard.path, targetPath);
        const normalized = normalizeWorkspaceArtifact(result);
        if (!normalized) {
          this.errorMessage = `Workspace artifact ${clipboardMode === 'copy' ? 'copy' : 'move'} result was invalid.`;
          return;
        }

        await this.loadWorkspaceArtifactsFromBackend();
        const resultPath = this.workspaceArtifactPath(normalized);
        applySelection(resultPath);
        if (clipboardMode === 'copy') {
          this.notify(`Workspace artifact "${normalized.name}" copied from "${originalName}".`);
        } else {
          this.notify(`Workspace artifact "${normalized.name}" moved from "${originalName}".`);
          this.workspaceClipboard = null;
        }
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, `Workspace artifact ${clipboardMode === 'copy' ? 'copy' : 'move'} failed.`);
        return;
      }
    }

    const source = this.workspaceArtifacts.find((candidate) =>
      this.workspaceArtifactPath(candidate) === this.workspaceClipboard?.path,
    );
    if (!source) {
      this.errorMessage = 'Clipboard artifact not found in local workspace.';
      return;
    }

    const sourceIndex = this.workspaceArtifacts.findIndex((candidate) => candidate.id === source.id);
    const sourcePath = this.workspaceArtifactPath(source);
    const sourceBaseName = source.name;
    const copyTargetArtifacts = this.workspaceArtifacts.filter((candidate) => {
      const candidatePath = this.workspaceArtifactPath(candidate);
      return candidate.id !== source.id && candidatePath !== sourcePath;
    });
    const pastedName = clipboardMode === 'copy'
      ? this.nextLocalWorkspaceArtifactCopyNameForArtifacts(copyTargetArtifacts, sourceBaseName, source.kind)
      : this.nextLocalWorkspaceArtifactCopyNameForArtifacts(copyTargetArtifacts, sourceBaseName, source.kind);
    const pasted: WorkspaceArtifact = {
      ...source,
      id: `artifact-${Date.now().toString(36)}-${this.workspaceArtifacts.length + 1}`,
      name: pastedName,
      path: pastedName,
      updatedAt: new Date().toISOString(),
    };
    this.workspaceArtifacts = (() => {
      if (clipboardMode === 'cut') {
        const nextArtifacts = copyTargetArtifacts.slice();
        const insertIndex = sourceIndex === -1 ? nextArtifacts.length : sourceIndex;
        nextArtifacts.splice(insertIndex, 0, pasted);
        return nextArtifacts;
      }
      const nextArtifacts = this.workspaceArtifacts.slice();
      const insertIndex = sourceIndex === -1 ? 0 : sourceIndex + 1;
      nextArtifacts.splice(insertIndex, 0, pasted);
      return nextArtifacts;
    })();

    this.saveWorkspaceArtifacts();
    applySelection(pastedName);
    if (clipboardMode === 'copy') {
      this.notify(`Workspace artifact "${pasted.name}" copied from "${originalName}".`);
    } else {
      this.notify(`Workspace artifact "${pasted.name}" moved from "${originalName}".`);
      this.workspaceClipboard = null;
    }
  }

  workspaceArtifactKindLabel(artifact: WorkspaceArtifact): string {
    switch (artifact.kind) {
      case 'folder':
        return 'Folder';
      case 'applet':
        return 'Applet';
      case 'scriptlet':
        return 'Scriptlet';
      case 'note':
        return 'Note';
    }
  }

  workspaceArtifactLocation(artifact: WorkspaceArtifact): string {
    return this.workspaceArtifactPath(artifact);
  }

  workspaceArtifactUrl(artifact: WorkspaceArtifact): string {
    const path = this.workspaceArtifactPath(artifact);
    return `workspace:///${path.replace(/^\/+/, '')}`;
  }

  workspaceArtifactIcon(artifact: WorkspaceArtifact): string {
    return artifact.kind === 'folder'
      ? 'DIR'
      : artifact.kind === 'applet'
        ? 'APP'
        : artifact.kind === 'scriptlet'
          ? 'SH'
          : 'TXT';
  }

  formatWorkspaceArtifactSize(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  private workspaceArtifactPath(artifact: WorkspaceArtifact): string {
    return artifact.path?.trim() || artifact.name;
  }

  private normalizeWorkspaceRelativePath(path: string): string {
    return path
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .join('/');
  }

  private joinWorkspaceRelativePath(parentPath: string, name: string): string {
    const normalizedParent = this.normalizeWorkspaceRelativePath(parentPath);
    const normalizedName = this.normalizeWorkspaceRelativePath(name);
    return normalizedParent && normalizedName
      ? `${normalizedParent}/${normalizedName}`
      : normalizedName || normalizedParent;
  }

  private workspaceParentPath(path: string): string {
    const normalizedPath = this.normalizeWorkspaceRelativePath(path);
    const segments = normalizedPath.split('/').filter(Boolean);
    segments.pop();
    return segments.join('/');
  }

  private workspaceDisplayPathForPath(path: string): string {
    const normalizedPath = this.normalizeWorkspaceRelativePath(path);
    return normalizedPath ? `/SwitchboardOS Workspace/${normalizedPath}` : '/SwitchboardOS Workspace';
  }

  async duplicateWorkspaceArtifact(artifact: WorkspaceArtifact): Promise<void> {
    const path = this.workspaceArtifactPath(artifact);
    const api = getSwitchboardApi();
    if (api?.workspaceFile?.duplicate) {
      try {
        const duplicated = await api.workspaceFile.duplicate(path);
        const normalized = normalizeWorkspaceArtifact(duplicated);
        if (!normalized) {
          this.errorMessage = 'Workspace artifact duplicate returned an invalid record.';
          return;
        }
        await this.loadWorkspaceArtifactsFromBackend();
        const selected = this.workspaceArtifacts.find((candidate) =>
          candidate.id === normalized.id || this.workspaceArtifactPath(candidate) === this.workspaceArtifactPath(normalized),
        );
        if (selected) {
          this.showWorkspaceArtifactProperties(selected);
        } else {
          this.workspaceArtifacts = [normalized, ...this.workspaceArtifacts];
          this.showWorkspaceArtifactProperties(normalized);
        }
        this.notify(`Workspace artifact duplicated as "${normalized.name}".`);
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Workspace artifact duplicate failed.');
        return;
      }
    }

    const duplicateName = this.nextLocalWorkspaceArtifactCopyName(artifact);
    const duplicate: WorkspaceArtifact = {
      ...artifact,
      id: `artifact-${Date.now().toString(36)}-${this.workspaceArtifacts.length + 1}`,
      name: duplicateName,
      path: duplicateName,
      updatedAt: new Date().toISOString(),
    };
    const sourceIndex = this.workspaceArtifacts.findIndex((candidate) => candidate.id === artifact.id);
    this.workspaceArtifacts = sourceIndex === -1
      ? [duplicate, ...this.workspaceArtifacts]
      : [
          ...this.workspaceArtifacts.slice(0, sourceIndex + 1),
          duplicate,
          ...this.workspaceArtifacts.slice(sourceIndex + 1),
        ];
    this.saveWorkspaceArtifacts();
    this.showWorkspaceArtifactProperties(duplicate);
    this.notify(`Workspace artifact "${artifact.name}" duplicated as "${duplicate.name}" (local).`);
  }

  private nextLocalWorkspaceArtifactCopyName(artifact: WorkspaceArtifact): string {
    const sourceName = artifact.name;
    if (artifact.kind === 'folder') {
      return this.nextLocalWorkspaceArtifactCopyNameForArtifacts(this.workspaceArtifacts, `${sourceName} copy`, artifact.kind);
    }

    const extension = this.workspaceArtifactExtensionForName(sourceName);
    const base = extension ? sourceName.slice(0, -extension.length) : sourceName;
    return this.nextLocalWorkspaceArtifactCopyNameForArtifacts(
      this.workspaceArtifacts,
      `${base} copy${extension}`,
      artifact.kind,
    );
  }

  private nextLocalWorkspaceArtifactCopyNameForArtifacts(
    artifacts: WorkspaceArtifact[],
    sourceName: string,
    artifactKind?: WorkspaceArtifactKind,
  ): string {
    const extension = artifactKind && artifactKind !== 'folder'
      ? this.workspaceArtifactExtensionForName(sourceName)
      : '';
    const baseSourceName = artifactKind && artifactKind !== 'folder' && extension
      ? sourceName.slice(0, -extension.length)
      : sourceName;

    if (!artifactKind || artifactKind === 'folder') {
      let name = `${baseSourceName} copy`;
      let counter = 2;
      while (artifacts.some((candidate) =>
        candidate.name === name || this.workspaceArtifactPath(candidate) === name,
      )) {
        name = `${baseSourceName} copy ${counter}`;
        counter += 1;
      }
      return name;
    }

    let name = `${baseSourceName} copy${extension}`;
    let counter = 2;
    while (artifacts.some((candidate) =>
      candidate.name === name || this.workspaceArtifactPath(candidate) === name,
    )) {
      name = `${baseSourceName} copy ${counter}${extension}`;
      counter += 1;
    }
    return name;
  }

  private nextLocalWorkspaceArtifactName(baseName: string, extension = ''): string {
    let name = `${baseName}${extension}`;
    let counter = 2;
    while (this.workspaceArtifacts.some((candidate) =>
      candidate.name === name || this.workspaceArtifactPath(candidate) === name,
    )) {
      name = `${baseName} ${counter}${extension}`;
      counter += 1;
    }
    return name;
  }

  private compareWorkspaceArtifacts(left: WorkspaceArtifact, right: WorkspaceArtifact): number {
    let result = 0;
    switch (this.workspaceArtifactSortBy) {
      case 'kind':
        result = this.compareWorkspaceArtifactText(left.kind, right.kind);
        break;
      case 'modified':
        result = this.compareWorkspaceArtifactModifiedDesc(left.updatedAt, right.updatedAt);
        break;
      case 'size':
        result = this.compareWorkspaceArtifactSize(this.workspaceArtifactSizeForSort(left), this.workspaceArtifactSizeForSort(right));
        break;
      default:
        result = this.compareWorkspaceArtifactText(left.name, right.name);
        break;
    }

    if (result !== 0) {
      return result;
    }

    result = this.compareWorkspaceArtifactText(left.kind, right.kind);
    if (result !== 0) {
      return result;
    }

    return this.compareWorkspaceArtifactText(this.workspaceArtifactPath(left), this.workspaceArtifactPath(right))
      || left.id.localeCompare(right.id);
  }

  private compareWorkspaceArtifactText(left: string, right: string): number {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  }

  private compareWorkspaceArtifactModifiedDesc(leftUpdatedAt: string, rightUpdatedAt: string): number {
    const leftTimestamp = new Date(leftUpdatedAt).getTime();
    const rightTimestamp = new Date(rightUpdatedAt).getTime();
    const leftHasTimestamp = Number.isFinite(leftTimestamp);
    const rightHasTimestamp = Number.isFinite(rightTimestamp);

    if (leftHasTimestamp && rightHasTimestamp) {
      if (leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return 0;
    }

    if (leftHasTimestamp && !rightHasTimestamp) {
      return -1;
    }

    if (!leftHasTimestamp && rightHasTimestamp) {
      return 1;
    }

    return 0;
  }

  private compareWorkspaceArtifactSize(leftSize: number, rightSize: number): number {
    if (leftSize !== rightSize) {
      return rightSize - leftSize;
    }
    return 0;
  }

  private workspaceArtifactSizeForSort(artifact: WorkspaceArtifact): number {
    return artifact.size ?? -1;
  }

  private workspaceArtifactExtensionForName(name: string): string {
    if (name.endsWith('.sbapplet.json')) {
      return '.sbapplet.json';
    }
    if (name.endsWith('.sbscriptlet.json')) {
      return '.sbscriptlet.json';
    }
    const extensionIndex = name.lastIndexOf('.');
    if (extensionIndex <= 0) {
      return '';
    }
    return name.slice(extensionIndex);
  }

  async renameWorkspaceArtifact(artifact: WorkspaceArtifact): Promise<void> {
    const path = this.workspaceArtifactPath(artifact);
    const requestedName = window.prompt(`Rename "${artifact.name}"`, artifact.name)?.trim();
    if (!requestedName) {
      this.errorMessage = requestedName === '' ? 'Workspace artifact name is required.' : '';
      return;
    }

    const api = getSwitchboardApi();
    if (api?.workspaceFile) {
      try {
        const renamed = await api.workspaceFile.rename(path, requestedName);
        const normalized = normalizeWorkspaceArtifact(renamed);
        if (!normalized) {
          this.errorMessage = 'Workspace artifact rename returned an invalid record.';
          return;
        }
        await this.loadWorkspaceArtifactsFromBackend();
        this.notify(`Workspace artifact renamed to "${normalized.name}" permanently.`);
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Workspace artifact rename failed.');
        return;
      }
    }

    const duplicate = this.workspaceArtifacts.some((candidate) =>
      candidate.id !== artifact.id && this.workspaceArtifactPath(candidate) === requestedName,
    );
    if (duplicate) {
      this.errorMessage = `A workspace artifact named "${requestedName}" already exists in this scope.`;
      return;
    }

    this.workspaceArtifacts = this.workspaceArtifacts.map((candidate) => candidate.id === artifact.id
      ? {
          ...candidate,
          name: requestedName,
          path: requestedName,
          updatedAt: new Date().toISOString(),
        }
      : candidate);
    this.saveWorkspaceArtifacts();
    this.notify(`Workspace artifact "${artifact.name}" renamed to "${requestedName}" (local).`);
  }

  async deleteWorkspaceArtifact(artifact: WorkspaceArtifact): Promise<void> {
    const path = this.workspaceArtifactPath(artifact);
    const confirmed = window.confirm(
      `Move "${artifact.name}" to Recycle Bin?`,
    );
    if (!confirmed) {
      return;
    }

    const api = getSwitchboardApi();
    if (api?.workspaceFile?.moveToTrash) {
      try {
        await api.workspaceFile.moveToTrash(path);
        await this.loadWorkspaceArtifactsFromBackend();
        await this.loadTrashItemsFromBackend();
        this.notify(`"${artifact.name}" moved to Recycle Bin.`);
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Unable to move workspace artifact to Recycle Bin.');
        return;
      }
    }

    const beforeCount = this.workspaceArtifacts.length;
    this.workspaceArtifacts = this.workspaceArtifacts.filter((candidate) => candidate.id !== artifact.id);
    if (this.workspaceArtifacts.length === beforeCount) {
      this.errorMessage = 'Workspace artifact was not found.';
      return;
    }
    this.saveWorkspaceArtifacts();
    this.notify(`"${artifact.name}" moved to Recycle Bin (local placeholder).`);
  }

  async clearTrash(): Promise<void> {
    if (this.trashItems.length === 0) {
      this.notify('Recycle Bin is empty.');
      return;
    }
    const confirmed = window.confirm('Empty Recycle Bin permanently? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    const api = getSwitchboardApi();
    if (api?.workspaceFile?.emptyTrash) {
      try {
        await api.workspaceFile.emptyTrash();
        await this.loadTrashItemsFromBackend();
        this.notify('Recycle Bin emptied.');
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Unable to empty Recycle Bin.');
        return;
      }
    }

    this.trashItems = [];
    this.notify('Recycle Bin emptied (local placeholder).');
  }

  async loadTrashItemsFromBackend(): Promise<void> {
    const api = getSwitchboardApi();
    if (api?.workspaceFile?.listTrash) {
      try {
        this.trashItems = await api.workspaceFile.listTrash();
        return;
      } catch {
        // Fallback to empty array
      }
    }
    this.trashItems = [];
  }

  async restoreTrashItem(item: WorkspaceTrashEntry): Promise<void> {
    const api = getSwitchboardApi();
    if (api?.workspaceFile?.restoreTrashItem) {
      try {
        await api.workspaceFile.restoreTrashItem(item.id);
        await this.loadWorkspaceArtifactsFromBackend();
        await this.loadTrashItemsFromBackend();
        this.notify(`"${item.name}" restored.`);
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Unable to restore item from Recycle Bin.');
        return;
      }
    }
    this.trashItems = this.trashItems.filter((entry) => entry.id !== item.id);
    this.notify(`"${item.name}" restored (local placeholder).`);
  }

  async deleteTrashItemPermanent(item: WorkspaceTrashEntry): Promise<void> {
    const confirmed = window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const api = getSwitchboardApi();
    if (api?.workspaceFile?.deleteTrashItemPermanent) {
      try {
        await api.workspaceFile.deleteTrashItemPermanent(item.id);
        await this.loadTrashItemsFromBackend();
        this.notify(`"${item.name}" removed permanently.`);
        return;
      } catch (error) {
        this.errorMessage = this.errorText(error, 'Unable to permanently delete item.');
        return;
      }
    }

    this.trashItems = this.trashItems.filter((entry) => entry.id !== item.id);
    this.notify(`"${item.name}" removed permanently (local placeholder).`);
  }

  showDesktop(): void {
    for (const windowItem of this.windows) {
      windowItem.state = 'minimized';
      windowItem.focused = false;
    }
  }

  runPaletteResult(result: PaletteResult): void {
    if (result.kind === 'app' && result.appId) {
      this.openApp(result.appId);
    } else if (result.kind === 'host-dashboard' && result.hostId) {
      const host = this.hosts.find((candidate) => candidate.id === result.hostId);
      if (host) {
        this.openHostDashboard(host);
      }
    } else if (result.kind === 'host-terminal' && result.hostId) {
      const host = this.hosts.find((candidate) => candidate.id === result.hostId);
      if (host) {
        this.openHostTerminal(host);
      }
    } else if (result.kind === 'host-operation' && result.hostId && result.operationAppId) {
      const host = this.hosts.find((candidate) => candidate.id === result.hostId);
      if (host) {
        this.openHostOperation(host, result.operationAppId);
      }
    } else if (result.kind === 'window-action' && result.windowId && result.actionId) {
      const windowItem = this.windows.find((candidate) => candidate.windowId === result.windowId);
      if (windowItem) {
        void this.runWindowAction(windowItem, result.actionId);
      }
    }
    this.commandPaletteOpen = false;
  }

  async runWindowAction(windowItem: ShellWindow, actionId: string): Promise<void> {
    const host = windowItem.hostId ? this.hosts.find((candidate) => candidate.id === windowItem.hostId) ?? null : null;
    if (actionId === 'open-host-terminal' && host) {
      this.openHostTerminal(host);
      return;
    }
    if (actionId === 'open-files' && host) {
      this.openHostOperation(host, 'file-browser');
      return;
    }
    if (actionId === 'open-logs' && host) {
      this.openHostOperation(host, 'log-viewer');
      return;
    }
    if (actionId === 'open-services' && host) {
      this.openHostOperation(host, 'service-manager');
      return;
    }
    if (actionId === 'open-processes' && host) {
      this.openHostOperation(host, 'process-viewer');
      return;
    }
    if (actionId === 'test-connection' && host) {
      await this.testHostConnection(host, windowItem);
      return;
    }
    if (actionId === 'refresh-metrics' && host) {
      await this.refreshHostMetrics(host, windowItem);
      this.notify(`Metrics refreshed for ${host.name}.`);
      return;
    }
    if (actionId === 'refresh-hosts') {
      await this.loadWorkspaceContext();
      this.notify('Host and audit context refreshed.');
      return;
    }
    if (actionId === 'open-hosts') {
      this.openApp('hosts');
      return;
    }
    if (actionId === 'open-command-history') {
      this.openApp('command-history');
      return;
    }
    if (actionId === 'open-apps') {
      this.openApp('apps');
      return;
    }
    if (actionId === 'minimize-window') {
      this.minimizeWindow(windowItem);
      return;
    }
    if (actionId === 'maximize-window') {
      this.toggleMaximize(windowItem);
      return;
    }
    if (actionId === 'tile-left') {
      this.tileWindow(windowItem, 'left');
      return;
    }
    if (actionId === 'tile-right') {
      this.tileWindow(windowItem, 'right');
      return;
    }
    if (actionId === 'tile-top') {
      this.tileWindow(windowItem, 'top');
      return;
    }
    if (actionId === 'tile-bottom') {
      this.tileWindow(windowItem, 'bottom');
      return;
    }
    if (actionId === 'tile-top-left') {
      this.tileWindow(windowItem, 'top-left');
      return;
    }
    if (actionId === 'tile-top-right') {
      this.tileWindow(windowItem, 'top-right');
      return;
    }
    if (actionId === 'tile-bottom-left') {
      this.tileWindow(windowItem, 'bottom-left');
      return;
    }
    if (actionId === 'tile-bottom-right') {
      this.tileWindow(windowItem, 'bottom-right');
      return;
    }
    if (actionId === 'toggle-fullscreen') {
      this.setFullscreen(windowItem);
      return;
    }
    if (actionId === 'close-window') {
      this.closeWindow(windowItem);
      return;
    }

    this.notify(`Registered action inspected: ${actionId}.`);
  }

  async testHostConnection(host: HostRecord, windowItem?: ShellWindow): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'SwitchboardOS preload API is unavailable.';
      return;
    }

    try {
      const result = await api.host.testConnection(host.id);
      await this.loadWorkspaceContext();
      this.notify(`${host.name}: ${result.message}`);
      if (windowItem) {
        this.refreshWindowSemantics(windowItem);
      }
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Connection test failed.');
    }
  }

  saveWorkspaceLayout(): void {
    void this.persistActiveProfileLayout();
    this.notify(`Workspace profile "${this.activeProfileName}" saved.`);
  }

  restoreWorkspaceLayout(): void {
    try {
      this.restoreProfileLayout(this.activeProfile);
      this.notify(`Workspace profile "${this.activeProfileName}" restored.`);
    } catch {
      this.errorMessage = 'Unable to restore workspace profile layout.';
    }
  }

  async createWorkspaceProfile(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'SwitchboardOS preload API is unavailable.';
      return;
    }

    const name = this.newProfileName.trim() || `Workspace ${this.workspaceProfiles.length + 1}`;
    await this.persistActiveProfileLayout(false);
    try {
      const profile = await api.workspace.createProfile({
        name,
        layout: this.emptyWorkspaceLayout(),
      });
      this.workspaceProfiles = [...this.workspaceProfiles, profile];
      this.activeProfileId = profile.profileId;
      this.desktopShortcuts = this.defaultDesktopShortcuts();
      this.ensureDefaultIconPositions();
      this.windows = [];
      this.newProfileName = '';
      this.renameProfileName = profile.name;
      const activeLayout = this.currentWorkspaceLayoutSnapshot();
      const storedProfile = await api.workspace.updateProfile(profile.profileId, { layout: activeLayout });
      if (storedProfile) {
        this.workspaceProfiles = this.workspaceProfiles.map((candidate) =>
          candidate.profileId === storedProfile.profileId ? storedProfile : candidate,
        );
      }
      await api.workspace.setActiveProfileId(profile.profileId);
      this.notify(`Workspace profile "${name}" created.`);
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to create workspace profile.');
    }
  }

  async switchWorkspaceProfile(profileId: string): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'SwitchboardOS preload API is unavailable.';
      return;
    }

    const profile = this.workspaceProfiles.find((candidate) => candidate.profileId === profileId);
    if (!profile || profile.profileId === this.activeProfileId) {
      return;
    }

    await this.persistActiveProfileLayout(false);
    this.activeProfileId = profile.profileId;
    this.renameProfileName = profile.name;
    try {
      this.restoreProfileLayout(profile);
      await api.workspace.setActiveProfileId(profile.profileId);
      this.notify(`Switched to workspace profile "${profile.name}".`);
    } catch (error) {
      this.errorMessage = this.errorText(error, `Unable to switch to workspace profile "${profile.name}".`);
    }
  }

  async renameActiveWorkspaceProfile(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'SwitchboardOS preload API is unavailable.';
      return;
    }

    const name = this.renameProfileName.trim();
    if (!name) {
      this.errorMessage = 'Workspace profile name is required.';
      return;
    }

    try {
      const updated = await api.workspace.updateProfile(this.activeProfileId, { name });
      if (updated) {
        this.workspaceProfiles = this.workspaceProfiles.map((profile) => profile.profileId === this.activeProfileId
          ? updated
          : profile);
      }
      this.notify(`Workspace profile renamed to "${name}".`);
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to rename workspace profile.');
    }
  }

  async deleteWorkspaceProfile(profileId: string): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'SwitchboardOS preload API is unavailable.';
      return;
    }

    if (this.workspaceProfiles.length <= 1) {
      this.errorMessage = 'At least one workspace profile is required.';
      return;
    }

    const deleted = this.workspaceProfiles.find((profile) => profile.profileId === profileId);
    try {
      const success = await api.workspace.deleteProfile(profileId);
      if (!success) {
        this.errorMessage = 'Workspace profile was not found in store.';
        return;
      }
      this.workspaceProfiles = this.workspaceProfiles.filter((profile) => profile.profileId !== profileId);
      if (this.activeProfileId === profileId) {
        const nextProfile = this.workspaceProfiles[0];
        this.activeProfileId = nextProfile.profileId;
        this.renameProfileName = nextProfile.name;
        this.restoreProfileLayout(nextProfile);
        await api.workspace.setActiveProfileId(nextProfile.profileId);
      }
      if (deleted) {
        this.notify(`Workspace profile "${deleted.name}" deleted.`);
      }
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to delete workspace profile.');
    }
  }

  inspectWindowJson(windowItem: ShellWindow | null): string {
    if (!windowItem) {
      return 'No focused shell window.';
    }

    const snapshot: ShellWindowSnapshot = {
      windowId: windowItem.windowId,
      appId: windowItem.appId,
      hostId: windowItem.hostId,
      title: windowItem.title,
      bounds: windowItem.bounds,
      state: windowItem.state,
      tilePosition: windowItem.tilePosition,
      focused: windowItem.focused,
      zIndex: windowItem.zIndex,
      runtimeMetadata: windowItem.runtimeMetadata,
      semanticState: windowItem.semanticState,
      registeredActions: windowItem.registeredActions,
    };
    return JSON.stringify(snapshot, null, 2);
  }

  windowPreferredSizeText(windowItem: ShellWindow): string | null {
    return windowItem.runtimeMetadata.preferredSize
      ? JSON.stringify(windowItem.runtimeMetadata.preferredSize)
      : null;
  }

  private applyGeneratedAppWindowRequest(
    windowItem: ShellWindow,
    method: GeneratedAppWindowSdkMethod,
    payload: unknown,
  ): unknown {
    if (method === 'window:getInfo') {
      return this.generatedAppWindowInfo(windowItem);
    }

    if (method === 'window:setTitle') {
      const title = this.sdkStringField(payload, 'title', 80, true);
      if (!title) {
        throw new Error('Generated app window SDK field "title" is required.');
      }
      windowItem.title = title;
      this.touchWindowRuntimeMetadata(windowItem, {});
      return this.generatedAppWindowInfo(windowItem);
    }

    if (method === 'window:setBadge') {
      const badge = this.sdkStringField(payload, 'badge', 12, false);
      this.touchWindowRuntimeMetadata(windowItem, { badge });
      return this.generatedAppWindowInfo(windowItem);
    }

    if (method === 'window:setStatus') {
      const status = this.sdkStringField(payload, 'status', 48, false);
      this.touchWindowRuntimeMetadata(windowItem, { status });
      return this.generatedAppWindowInfo(windowItem);
    }

    if (method === 'window:setPreferredSize') {
      const preferredSize = this.sdkPreferredSize(payload);
      this.touchWindowRuntimeMetadata(windowItem, { preferredSize });
      return this.generatedAppWindowInfo(windowItem);
    }

    throw new Error(`Unsupported generated app window SDK method: ${method}`);
  }

  private generatedAppWindowInfo(windowItem: ShellWindow): Record<string, unknown> {
    return {
      appId: windowItem.appId,
      windowId: windowItem.windowId,
      title: windowItem.title,
      bounds: { ...windowItem.bounds },
      state: windowItem.state,
      tilePosition: windowItem.tilePosition,
      focused: windowItem.focused,
      zIndex: windowItem.zIndex,
      badge: windowItem.runtimeMetadata.badge,
      status: windowItem.runtimeMetadata.status,
      preferredSize: windowItem.runtimeMetadata.preferredSize,
      theme: document.body.classList.contains('light') ? 'light' : 'dark',
      scale: window.devicePixelRatio || 1,
    };
  }

  private touchWindowRuntimeMetadata(windowItem: ShellWindow, patch: Partial<ShellWindowRuntimeMetadata>): void {
    windowItem.runtimeMetadata = {
      ...windowItem.runtimeMetadata,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  }

  private sdkStringField(payload: unknown, field: string, maxLength: number, required: boolean): string | null {
    const record = isPlainRecord(payload) ? payload : {};
    const raw = record[field];
    if (raw === null || raw === undefined || raw === '') {
      if (required) {
        throw new Error(`Generated app window SDK field "${field}" is required.`);
      }
      return null;
    }
    if (typeof raw !== 'string') {
      throw new Error(`Generated app window SDK field "${field}" must be a string.`);
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      if (required) {
        throw new Error(`Generated app window SDK field "${field}" is required.`);
      }
      return null;
    }
    if (trimmed.length > maxLength) {
      throw new Error(`Generated app window SDK field "${field}" exceeds ${maxLength} characters.`);
    }
    return trimmed;
  }

  private sdkPreferredSize(payload: unknown): ShellWindowPreferredSize | null {
    if (payload === null || payload === undefined) {
      return null;
    }
    const record = isPlainRecord(payload) ? payload : {};
    const preferredSize: ShellWindowPreferredSize = {
      minWidth: this.sdkOptionalDimension(record['minWidth'], 'minWidth', 240, 1600),
      minHeight: this.sdkOptionalDimension(record['minHeight'], 'minHeight', 160, 1200),
      maxWidth: this.sdkOptionalDimension(record['maxWidth'], 'maxWidth', 320, 2400),
      maxHeight: this.sdkOptionalDimension(record['maxHeight'], 'maxHeight', 240, 1800),
    };
    if (preferredSize.minWidth !== null && preferredSize.maxWidth !== null && preferredSize.minWidth > preferredSize.maxWidth) {
      throw new Error('Generated app window SDK preferred size minWidth exceeds maxWidth.');
    }
    if (preferredSize.minHeight !== null && preferredSize.maxHeight !== null && preferredSize.minHeight > preferredSize.maxHeight) {
      throw new Error('Generated app window SDK preferred size minHeight exceeds maxHeight.');
    }
    if (Object.values(preferredSize).every((value) => value === null)) {
      return null;
    }
    return preferredSize;
  }

  private sdkOptionalDimension(value: unknown, field: string, min: number, max: number): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Generated app window SDK field "${field}" must be a finite number.`);
    }
    const rounded = Math.round(value);
    if (rounded < min || rounded > max) {
      throw new Error(`Generated app window SDK field "${field}" is outside ${min}-${max}.`);
    }
    return rounded;
  }

  hostFor(windowItem: ShellWindow): HostRecord | null {
    return windowItem.hostId
      ? this.hosts.find((host) => host.id === windowItem.hostId) ?? null
      : null;
  }

  statusText(value: string | null | undefined): string {
    return value?.trim() || 'unknown';
  }

  hostCapabilitiesSummary(host: HostRecord): string {
    return host.capabilities.length > 0 ? host.capabilities.join(', ') : 'unknown';
  }

  hostCredentialSummary(host: HostRecord): string {
    if (host.credentialRefId) {
      return `credential ref ${host.credentialRefId}`;
    }
    if (host.keyPath) {
      return `key path/reference ${host.keyPath}`;
    }
    if (host.authMode === 'agent') {
      return 'ssh-agent';
    }
    return `${host.authMode} / no stored secret`;
  }

  hostMetricText(host: HostRecord, key: 'os' | 'uptime' | 'memory' | 'disk'): string {
    const metric = this.hostMetricsById[host.id];
    if (!metric) {
      return key === 'os' ? this.statusText(host.osHint) : 'not probed';
    }
    return metric[key] || 'unknown';
  }

  async refreshHostMetrics(host: HostRecord, windowItem?: ShellWindow): Promise<void> {
    const api = getSwitchboardApi();
    if (!api?.hostOperations) {
      this.errorMessage = 'Host operations API is unavailable.';
      return;
    }

    this.metricsLoadingHostId = host.id;
    this.errorMessage = '';
    try {
      const result = await api.hostOperations.run({
        hostId: host.id,
        kind: 'metrics',
        limit: 1,
      });
      const row = result.rows[0] ?? {};
      this.hostMetricsById = {
        ...this.hostMetricsById,
        [host.id]: {
          os: String(row['os'] ?? host.osHint ?? 'unknown'),
          uptime: String(row['uptime'] ?? 'unknown'),
          memory: String(row['memory'] ?? 'unknown'),
          disk: String(row['disk'] ?? 'unknown'),
          collectedAt: result.completedAt,
          status: result.status,
          error: result.status === 'success' ? null : result.error ?? result.summary,
        },
      };
      if (windowItem) {
        this.refreshWindowSemantics(windowItem);
      }
    } catch (error) {
      this.hostMetricsById = {
        ...this.hostMetricsById,
        [host.id]: {
          os: this.statusText(host.osHint),
          uptime: 'unknown',
          memory: 'unknown',
          disk: 'unknown',
          collectedAt: new Date().toISOString(),
          status: 'failed',
          error: this.errorText(error, 'Unable to refresh host metrics.'),
        },
      };
    } finally {
      this.metricsLoadingHostId = null;
    }
  }

  hostTerminalInputs(windowItem: ShellWindow): Record<string, unknown> {
    const host = this.hostFor(windowItem);
    return {
      shellWindowId: windowItem.windowId,
      hostContextId: windowItem.hostId,
      hostContextTitle: host?.name ?? windowItem.title,
      hostContextLocked: true,
    };
  }

  terminalInputs(windowItem: ShellWindow): Record<string, unknown> {
    return {
      shellWindowId: windowItem.windowId,
    };
  }

  hostOperationInputs(windowItem: ShellWindow, mode: HostOperationKind): Record<string, unknown> {
    const host = this.hostFor(windowItem);
    return {
      mode,
      hostContextId: windowItem.hostId,
      hostContextTitle: host?.name ?? windowItem.title,
      hostContextLocked: Boolean(windowItem.hostId),
      openAppletElementContextMenu: (request: AppletElementContextMenuRequest) => this.openAppletElementContextMenu(windowItem, request),
    };
  }

  generatedAppInputs(windowItem: ShellWindow): Record<string, unknown> {
    return {
      manifest: windowItem.appDefinition.manifest ?? null,
      windowId: windowItem.windowId,
      hosts: this.hosts,
      openAppletElementContextMenu: (request: AppletElementContextMenuRequest) => this.openAppletElementContextMenu(windowItem, request),
    };
  }

  isGeneratedAppWindow(windowItem: ShellWindow): boolean {
    return Boolean(windowItem.appDefinition.generated && windowItem.appDefinition.manifest);
  }

  recentAuditForHost(hostId: string | null): AuditEvent[] {
    if (!hostId) {
      return [];
    }
    return this.auditEvents
      .filter((event) => event.entityId === hostId || event.metadata?.['hostId'] === hostId)
      .slice(0, 5);
  }

  trackWindow(_index: number, windowItem: ShellWindow): string {
    return windowItem.windowId;
  }

  trackShortcut(_index: number, shortcut: DesktopShortcutItem): string {
    return shortcut.id;
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  trackApp(_index: number, app: ShellAppDefinition): string {
    return app.appId;
  }

  trackPaletteResult(_index: number, result: PaletteResult): string {
    return result.id;
  }

  trackAction(_index: number, action: ShellWindowAction): string {
    return action.id;
  }

  trackWorkspaceArtifact(_index: number, artifact: WorkspaceArtifact): string {
    return artifact.id;
  }

  trackTrashItem(_index: number, item: WorkspaceTrashEntry): string {
    return item.id;
  }

  minimize(): void {
    void getSwitchboardApi()?.window.minimize();
  }

  maximize(): void {
    void getSwitchboardApi()?.window.maximize();
  }

  close(): void {
    void getSwitchboardApi()?.window.close();
  }

  navigate(route: string): void {
    // Parse route: e.g. '/dashboard?hostId=xxx' or '/terminal?hostId=xxx'
    const firstSlash = route.indexOf('/');
    const appPart = route.slice(firstSlash + 1).split('?')[0];
    const queryString = route.slice(route.indexOf('?') + 1);
    const params = new URLSearchParams(queryString);

    if (appPart === 'dashboard') {
      const hostId = params.get('hostId');
      if (hostId) {
        const host = this.hosts.find((h) => h.id === hostId);
        if (host) {
          this.openHostDashboard(host);
          return;
        }
      }
      // No hostId or host not found — open general status
      this.openApp('status');
    } else if (appPart === 'terminal') {
      const hostId = params.get('hostId');
      if (hostId) {
        const host = this.hosts.find((h) => h.id === hostId);
        if (host) {
          this.openHostTerminal(host);
          return;
        }
      }
      this.openApp('terminal');
    } else if (appPart === 'file-browser' || appPart === 'file-manager' || appPart === 'files') {
      this.navigateHostOperation(params.get('hostId'), 'file-browser');
    } else if (appPart === 'logs') {
      this.navigateHostOperation(params.get('hostId'), 'log-viewer');
    } else if (appPart === 'services') {
      this.navigateHostOperation(params.get('hostId'), 'service-manager');
    } else if (appPart === 'processes') {
      this.navigateHostOperation(params.get('hostId'), 'process-viewer');
    } else if (appPart === 'command-history') {
      this.openApp('command-history');
    } else if (appPart === 'app-studio') {
      this.openApp('app-studio');
    } else if (appPart === 'hosts') {
      this.openApp('hosts');
    } else if (appPart === 'settings') {
      this.openApp('settings');
    } else if (appPart === 'agents') {
      this.openApp('agents');
    } else if (appPart === 'bootstrap') {
      this.openApp('bootstrap');
    } else if (appPart === 'audit') {
      this.openApp('audit');
    } else if (appPart === 'apps') {
      this.openApp('apps');
    }
  }

  private navigateHostOperation(hostId: string | null, appId: HostOperationAppId): void {
    const host = hostId ? this.hosts.find((candidate) => candidate.id === hostId) : null;
    if (host) {
      this.openHostOperation(host, appId);
      return;
    }

    this.openApp(appId);
  }

  private currentWorkspaceLayoutSnapshot(): WorkspaceLayoutSnapshot {
    return {
      desktopShortcutIds: this.desktopShortcuts,
      windows: this.windows.map((windowItem) => ({
        windowId: windowItem.windowId,
        appId: windowItem.appId,
        hostId: windowItem.hostId,
        title: windowItem.title,
        bounds: windowItem.bounds,
        state: windowItem.state,
        tilePosition: windowItem.tilePosition,
        zIndex: windowItem.zIndex,
        runtimeMetadata: windowItem.runtimeMetadata,
      })),
    };
  }

  private async persistActiveProfileLayout(showError = true): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      return;
    }

    const snapshot = this.currentWorkspaceLayoutSnapshot();

    try {
      const updated = await api.workspace.updateProfile(this.activeProfileId, { layout: snapshot });
      if (updated) {
        this.workspaceProfiles = this.workspaceProfiles.map((profile) => profile.profileId === this.activeProfileId
          ? updated
          : profile);
      }
      // Keep legacy layout key as a read-only fallback for external recovery only
      window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      if (showError) {
        this.errorMessage = this.errorText(error, 'Unable to save workspace profile layout.');
      }
    }
  }

  private restoreProfileLayout(profile: WorkspaceProfile): boolean {
    const definitionFor = (appId: string): ShellAppDefinition | null => this.getAppDefinition(appId as ShellAppId);
    const layout = this.normalizeWorkspaceLayout(profile.layout ?? this.emptyWorkspaceLayout());
    this.desktopShortcuts = layout.desktopShortcutIds
      .map((shortcut) => {
        const definition = definitionFor(shortcut.appId);
        if (!definition) {
          return null;
        }
        return {
          id: shortcut.id,
          appId: definition.appId,
          shellOwned: Boolean(shortcut.shellOwned),
          label: shortcut.label,
        } as DesktopShortcut;
      })
      .filter((shortcut): shortcut is DesktopShortcut => shortcut !== null);
    if (this.desktopShortcuts.length === 0) {
      this.desktopShortcuts = this.defaultDesktopShortcuts();
    }
    const migratedDesktopShortcuts = this.reconcilePendingLegacyDesktopShortcutPins();
    this.desktopIconPositions = this.restoreShortcutPositionTargets(this.desktopIconPositions);
    this.ensureDefaultIconPositions();
    this.saveDesktopShortcuts();
    this.windows = layout.windows
      .map((snapshot) => {
        const definition = definitionFor(snapshot.appId);
        if (!definition) {
          return null;
        }
        const host = snapshot.hostId ? this.hosts.find((candidate) => candidate.id === snapshot.hostId) ?? null : null;
        return this.createWindowFromSnapshot(definition, snapshot, host);
      })
      .filter((windowItem): windowItem is ShellWindow => Boolean(windowItem));
    this.nextZIndex = Math.max(10, ...this.windows.map((windowItem) => windowItem.zIndex + 1));
    this.focusTopWindow();
    return migratedDesktopShortcuts;
  }

  private emptyWorkspaceLayout(): WorkspaceLayoutSnapshot {
    return {
      desktopShortcutIds: this.defaultDesktopShortcuts(),
      windows: [],
    };
  }

  private showContextMenu(
    event: MouseEvent,
    target: ContextMenuState['target'],
    label: string,
    items: ContextMenuItem[],
    appId?: ShellAppId,
    shortcutId?: string,
    windowId?: string,
    workspaceArtifact?: WorkspaceArtifact,
    hostId?: string,
    notification?: ShellNotificationContext,
    object?: ShellPrimitiveObject,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.showContextMenuAt({
      x: event.clientX,
      y: event.clientY,
      target,
      label,
      items,
      appId,
      shortcutId,
      windowId,
      workspaceArtifact,
      hostId,
      notification,
      object,
    });
  }

  private showContextMenuAt(input: {
    x: number;
    y: number;
    target: ContextMenuState['target'];
    label: string;
    items: ContextMenuItem[];
    appId?: ShellAppId;
    shortcutId?: string;
    windowId?: string;
    workspaceArtifact?: WorkspaceArtifact;
    hostId?: string;
    notification?: ShellNotificationContext;
    object?: ShellPrimitiveObject;
    contributionSurface?: ContextMenuState['contributionSurface'];
    focusReturnElement?: HTMLElement;
  }): void {
    this.contextMenu = {
      x: input.x,
      y: input.y,
      target: input.target,
      label: input.label,
      appId: input.appId,
      shortcutId: input.shortcutId,
      hostId: input.hostId,
      windowId: input.windowId,
      workspaceArtifact: input.workspaceArtifact,
      notification: input.notification,
      object: input.object,
      contributionSurface: input.contributionSurface,
      focusReturnElement: input.focusReturnElement,
      items: input.items,
    };
    this.focusContextMenuFirstAction();
  }

  private focusContextMenuFirstAction(): void {
    setTimeout(() => {
      document.querySelector<HTMLElement>('[data-testid="context-menu"] button:not(:disabled)')?.focus();
    }, 0);
  }

  handleContextMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const focusReturnElement = this.contextMenu?.focusReturnElement;
    this.contextMenu = null;
    setTimeout(() => focusReturnElement?.focus(), 0);
  }

  private createShellPrimitiveObject(input: {
    id: string;
    kind: ShellPrimitiveKind;
    label: string;
    targetScope: ContextMenuState['target'];
    actionIds: string[];
    source?: ShellActionSource;
    sourceAppId?: ShellAppId;
    windowId?: string;
    notificationKind?: ShellNotificationKind;
    requiredCapabilities?: string[];
    workspacePath?: string;
  }): ShellPrimitiveObject {
    return {
      id: input.id,
      kind: input.kind,
      owner: 'shell',
      source: input.source ?? 'shell',
      targetScope: input.targetScope,
      label: input.label,
      actionIds: [...input.actionIds],
      ...(input.sourceAppId ? { sourceAppId: input.sourceAppId } : {}),
      ...(input.windowId ? { windowId: input.windowId } : {}),
      ...(input.notificationKind ? { notificationKind: input.notificationKind } : {}),
      ...(input.requiredCapabilities ? { requiredCapabilities: [...input.requiredCapabilities] } : {}),
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
    };
  }

  private shellContextItem(target: ContextMenuState['target'], item: ContextMenuItem): ContextMenuItem {
    return {
      ...item,
      source: item.source ?? 'shell',
      targetScope: item.targetScope ?? target,
      actionId: item.actionId ?? item.id,
      submenu: item.submenu?.map((subItem) => this.shellContextItem(target, subItem)),
    };
  }

  private shellContextItems(target: ContextMenuState['target'], items: ContextMenuItem[]): ContextMenuItem[] {
    return items.map((item) => this.shellContextItem(target, item));
  }

  private contextHost(menu: ContextMenuState | null | undefined): HostRecord | null {
    if (!menu?.hostId) {
      return null;
    }
    return this.hosts.find((candidate) => candidate.id === menu.hostId) ?? null;
  }

  private showWorkspaceArtifactContextMenuAt(
    x: number,
    y: number,
    artifact: WorkspaceArtifact,
    focusReturnElement?: HTMLElement,
  ): void {
    const items = this.workspaceArtifactContextItems(artifact);
    this.showContextMenuAt({
      x,
      y,
      target: 'workspace-file',
      label: artifact.name,
      items,
      appId: 'workspace-files',
      workspaceArtifact: artifact,
      object: this.workspaceArtifactShellObject(artifact, items),
      focusReturnElement,
    });
  }

  private workspaceArtifactShellObject(artifact: WorkspaceArtifact, items: ContextMenuItem[]): ShellPrimitiveObject {
    const path = this.workspaceArtifactPath(artifact);
    const actionIds = items.flatMap((item) => [
      item.actionId ?? item.id,
      ...(item.submenu ?? []).map((subItem) => subItem.actionId ?? subItem.id),
    ]);
    const requiredCapabilities = Array.from(new Set(items.flatMap((item) => [
      ...(item.requiredCapabilities ?? []),
      ...((item.submenu ?? []).flatMap((subItem) => subItem.requiredCapabilities ?? [])),
    ])));
    return {
      id: `workspace:${path}`,
      kind: this.isWorkspaceAppletArtifact(artifact) ? 'workspace-applet-artifact' : 'workspace-file',
      owner: 'workspace-files',
      source: 'workspace-file-object',
      targetScope: 'workspace-file',
      label: artifact.name,
      actionIds,
      sourceAppId: 'workspace-files',
      workspacePath: path,
      requiredCapabilities,
    };
  }

  private workspaceArtifactContextItems(artifact: WorkspaceArtifact): ContextMenuItem[] {
    const path = this.workspaceArtifactPath(artifact);
    const canPasteHere = Boolean(this.workspaceClipboard) && artifact.kind === 'folder';
    const clipboardDetail = this.workspaceClipboard
      ? `${this.workspaceClipboard.mode === 'copy' ? 'Copy' : 'Move'} "${this.workspaceClipboard.name}" from clipboard`
      : 'No item in workspace clipboard.';
    const appletDisabledReason = this.isWorkspaceAppletArtifact(artifact)
      ? this.workspaceAppletOpenDisabledReason(artifact)
      : '';
    const openItem: ContextMenuItem = this.isWorkspaceAppletArtifact(artifact)
      ? {
        id: 'install-open-workspace-applet-artifact',
        label: this.workspaceAppletActionLabel(artifact),
        icon: 'APP',
        shortcut: 'Enter',
        disabled: Boolean(appletDisabledReason),
        disabledReason: appletDisabledReason || undefined,
        detail: appletDisabledReason || 'Install or launch this applet through workspace artifact content.',
        requiredCapabilities: this.workspaceAppletActionCapabilities(artifact),
      }
      : {
        id: 'open-workspace-artifact',
        label: 'Open',
        icon: 'O',
        shortcut: 'Enter',
        detail: artifact.kind === 'folder' ? `Open ${path}` : 'Shows properties; no workspace viewer is registered yet.',
        requiredCapabilities: ['workspace-file:read'],
      };
    return this.workspaceArtifactObjectContextItems([
      openItem,
      {
        id: 'open-with-workspace-artifact',
        label: 'Open With',
        icon: 'OW',
        detail: 'No Open With handlers are registered yet.',
        disabled: true,
        disabledReason: 'No Open With handlers are registered for this artifact.',
      },
      ...(artifact.kind === 'folder'
        ? [{
          id: 'new-folder-in-workspace-folder',
          label: 'New Folder',
          icon: '+',
          shortcut: 'Ctrl+Shift+N',
          detail: `Create inside ${path}.`,
          requiredCapabilities: ['workspace-file:write'],
        }]
        : []),
      {
        id: 'rename-workspace-artifact',
        label: 'Rename',
        icon: 'R',
        shortcut: 'F2',
        separatorBefore: true,
        detail: path,
        requiredCapabilities: ['workspace-file:write'],
      },
      {
        id: 'copy-workspace-artifact',
        label: 'Copy',
        icon: 'C',
        shortcut: 'Ctrl+C',
        detail: `Copy "${path}" to clipboard.`,
        requiredCapabilities: ['workspace-file:read'],
      },
      {
        id: 'cut-workspace-artifact',
        label: 'Cut',
        icon: 'X',
        shortcut: 'Ctrl+X',
        detail: `Move "${path}" to clipboard.`,
        requiredCapabilities: ['workspace-file:write'],
      },
      {
        id: 'paste-workspace-artifact',
        label: 'Paste',
        icon: 'P',
        shortcut: 'Ctrl+V',
        disabled: !canPasteHere,
        disabledReason: canPasteHere ? undefined : 'Choose a folder as paste target.',
        detail: canPasteHere ? clipboardDetail : 'Choose a folder as paste target.',
        requiredCapabilities: ['workspace-file:write'],
      },
      {
        id: 'duplicate-workspace-artifact',
        label: 'Duplicate',
        icon: 'D',
        shortcut: 'Ctrl+D',
        detail: 'Creates a workspace copy.',
        requiredCapabilities: ['workspace-file:write'],
      },
      {
        id: 'delete-workspace-artifact',
        label: 'Move to Recycle Bin',
        icon: 'TR',
        shortcut: 'Delete',
        separatorBefore: true,
        danger: true,
        detail: 'Moves the item to the Recycle Bin.',
        requiredCapabilities: ['workspace-file:write'],
      },
      {
        id: 'properties-workspace-artifact',
        label: 'Properties',
        icon: 'I',
        shortcut: 'Alt+Enter',
        separatorBefore: true,
        detail: path,
        requiredCapabilities: ['workspace-file:read'],
      },
    ]);
  }

  private workspaceArtifactObjectContextItems(items: ContextMenuItem[]): ContextMenuItem[] {
    return items.map((item) => ({
      ...item,
      source: item.source ?? 'workspace-file-object',
      sourceAppId: item.sourceAppId ?? 'workspace-files',
      targetScope: item.targetScope ?? 'workspace-file',
      actionId: item.actionId ?? item.id,
      submenu: item.submenu?.map((subItem) => ({
        ...subItem,
        source: subItem.source ?? 'workspace-file-object',
        sourceAppId: subItem.sourceAppId ?? 'workspace-files',
        targetScope: subItem.targetScope ?? 'workspace-file',
        actionId: subItem.actionId ?? subItem.id,
      })),
    }));
  }

  private desktopContextItems(): ContextMenuItem[] {
    const canPaste = Boolean(this.workspaceClipboard);
    const clipboardAction = this.workspaceClipboard?.mode === 'copy' ? 'Copy' : 'Move';
    return [
      { id: 'new-folder', label: 'New Folder', icon: '+', shortcut: 'Ctrl+Shift+N' },
      {
        id: 'new-workspace-artifact',
        label: 'New',
        icon: 'N',
        submenu: [
          { id: 'new-applet', label: 'Applet', icon: 'A' },
          { id: 'new-scriptlet', label: 'Scriptlet', icon: 'SH' },
        ],
      },
      {
        id: 'paste',
        label: 'Paste',
        icon: 'P',
        shortcut: 'Ctrl+V',
        disabled: !canPaste,
        separatorBefore: true,
        detail: canPaste
          ? `${clipboardAction} "${this.workspaceClipboard?.name}" into workspace root.`
          : 'Clipboard is empty.',
      },
      { id: 'arrange-icons', label: 'Arrange Icons', icon: 'G', separatorBefore: true },
      { id: 'change-wallpaper', label: 'Change Wallpaper', icon: 'W' },
      { id: 'display-settings', label: 'Display / Theme Settings', icon: 'S' },
      { id: 'open-workspace-files', label: 'Open File Explorer', icon: 'FE', shortcut: 'Meta+E', separatorBefore: true },
      { id: 'refresh-context', label: 'Refresh', icon: 'R', shortcut: 'F5' },
    ];
  }

  private appManifestContextMenuItem(
    definition: ShellAppDefinition,
    target: ContextMenuState['target'],
    contributionId: string,
    fallbackTargets: LauncherTarget[],
    item: ContextMenuItem,
  ): ContextMenuItem | null {
    const requiredCapabilities = this.requiredCapabilitiesForContextContribution(definition, contributionId);
    if (!this.appManifestContextContributionAllowed(definition, target, contributionId, fallbackTargets, requiredCapabilities)) {
      return null;
    }

    return {
      ...item,
      source: 'app-manifest',
      sourceAppId: definition.appId,
      targetScope: target,
      requiredCapabilities,
      actionId: item.actionId ?? item.id,
    };
  }

  private appOpenContextItem(definition: ShellAppDefinition, target: ContextMenuState['target']): ContextMenuItem | null {
    return this.appManifestContextMenuItem(
      definition,
      target,
      'open',
      ['desktop-icon', 'launcher-row'],
      { id: 'open-app', label: 'Open', icon: 'O', shortcut: target === 'desktop-icon' ? 'Enter' : undefined },
    );
  }

  private appPinContextItem(definition: ShellAppDefinition, target: ContextMenuState['target']): ContextMenuItem | null {
    return this.appManifestContextMenuItem(
      definition,
      target,
      'pin',
      ['launcher-row', 'taskbar-window'],
      this.pinContextItem(definition.appId),
    );
  }

  private appPropertiesContextItem(definition: ShellAppDefinition, target: ContextMenuState['target']): ContextMenuItem | null {
    return this.appManifestContextMenuItem(
      definition,
      target,
      'properties',
      ['desktop-icon', 'launcher-row'],
      {
        id: 'properties',
        label: 'Properties',
        icon: 'I',
        shortcut: target === 'desktop-icon' ? 'Alt+Enter' : undefined,
      },
    );
  }

  private desktopIconContextItems(shortcut: DesktopShortcutItem): ContextMenuItem[] {
    const openItem = this.appOpenContextItem(shortcut.definition, 'desktop-icon')
      ?? { id: 'open-app', label: 'Open', icon: 'O', shortcut: 'Enter', source: 'shell' as const };
    const propertiesItem = this.appPropertiesContextItem(shortcut.definition, 'desktop-icon')
      ?? { id: 'properties', label: 'Properties', icon: 'I', shortcut: 'Alt+Enter', source: 'shell' as const };
    return [
      openItem,
      {
        id: 'duplicate-shortcut',
        label: 'Duplicate Shortcut',
        icon: 'D',
        shortcut: 'Ctrl+D',
      },
      {
        id: 'rename-shortcut',
        label: 'Rename',
        icon: 'R',
        shortcut: 'F2',
      },
      {
        id: 'remove-shortcut',
        label: 'Remove Shortcut',
        icon: 'TR',
        shortcut: 'Delete',
        separatorBefore: true,
        disabled: shortcut.shellOwned,
      },
      {
        ...propertiesItem,
        separatorBefore: true,
      },
    ];
  }

  private taskbarContextItems(): ContextMenuItem[] {
    return this.shellContextItems('taskbar', [
      { id: this.launcherOpen ? 'close-menu' : 'open-menu', label: this.launcherOpen ? 'Close Menu' : 'Open Menu' },
      { id: 'panel-settings', label: 'Panel Settings' },
      { id: 'add-applet', label: 'Add Applet' },
      { id: 'arrange-lock-panel', label: 'Arrange/Lock Panel' },
      { id: 'show-desktop', label: 'Show Desktop' },
      { id: 'task-manager', label: 'Task Manager / Running Windows' },
    ]);
  }

  private trayStatusContextItems(): ContextMenuItem[] {
    return this.shellContextItems('tray-status', [
      { id: 'status-details', label: 'Status Details', detail: this.appInfo ? `SwitchboardOS ${this.appInfo.version}` : 'SwitchboardOS is ready.' },
      { id: 'tray-notification-settings', label: 'Notification Settings' },
      { id: 'tray-panel-settings', label: 'Panel Settings' },
      { id: 'refresh-status', label: 'Refresh Status' },
    ]);
  }

  private taskbarWindowContextItems(windowItem: ShellWindow): ContextMenuItem[] {
    const appActions = this.windowAppActionContextItems(windowItem, 'taskbar-window');
    const pinItem = this.appPinContextItem(windowItem.appDefinition, 'taskbar-window')
      ?? this.shellContextItem('taskbar-window', this.pinContextItem(windowItem.appId));
    return [
      this.shellContextItem('taskbar-window', { id: 'show-taskbar-window', label: windowItem.state === 'minimized' ? 'Restore' : 'Show' }),
      this.shellContextItem('taskbar-window', { id: 'new-window', label: 'New Window' }),
      this.shellContextItem('taskbar-window', { id: 'toggle-minimize-window', label: windowItem.state === 'minimized' ? 'Restore Window' : 'Minimize' }),
      pinItem,
      ...(appActions.length > 0
        ? [this.shellContextItem('taskbar-window', { id: 'taskbar-app-actions', label: 'App Actions', submenu: appActions })]
        : []),
      this.shellContextItem('taskbar-window', { id: 'close-window', label: 'Close Window', danger: true }),
    ];
  }

  private windowContextItems(windowItem: ShellWindow): ContextMenuItem[] {
    const appActions = this.windowAppActionContextItems(windowItem, 'window');
    return [
      { id: 'minimize-window', label: 'Minimize', icon: '-', shortcut: 'Meta+M' },
      { id: 'maximize-window', label: windowItem.state === 'maximized' ? 'Restore' : 'Maximize', icon: '[]', shortcut: 'Meta+Up' },
      { id: 'tile-left', label: 'Tile Left', icon: 'L', separatorBefore: true },
      { id: 'tile-right', label: 'Tile Right', icon: 'R' },
      { id: 'tile-top', label: 'Tile Top', icon: 'T' },
      { id: 'tile-bottom', label: 'Tile Bottom', icon: 'B' },
      { id: 'tile-top-left', label: 'Top Left', icon: '1' },
      { id: 'tile-top-right', label: 'Top Right', icon: '2' },
      { id: 'tile-bottom-left', label: 'Bottom Left', icon: '3' },
      { id: 'tile-bottom-right', label: 'Bottom Right', icon: '4' },
      { id: 'toggle-fullscreen', label: 'Fullscreen', icon: 'F', shortcut: 'F11', separatorBefore: true },
      ...(appActions.length > 0 ? [{ id: 'window-app-actions', label: 'App Actions', submenu: appActions, separatorBefore: true }] : []),
      { id: 'close-window', label: 'Close Window', icon: 'X', shortcut: 'Alt+F4', danger: true, separatorBefore: true },
    ];
  }

  private terminalContextItems(windowItem: ShellWindow, host: HostRecord | null): ContextMenuItem[] {
    return [
      { id: 'terminal-copy', label: 'Copy', icon: 'C', shortcut: 'Ctrl+Shift+C', detail: 'Copy selected terminal text.' },
      { id: 'terminal-paste', label: 'Paste', icon: 'P', shortcut: 'Ctrl+Shift+V', detail: 'Paste clipboard text into the active terminal session.' },
      { id: 'terminal-clear', label: 'Clear', icon: 'CL', shortcut: 'Ctrl+L', detail: 'Clear this terminal view.' },
      {
        id: 'terminal-new-window',
        label: 'Split/New Terminal',
        icon: 'T',
        separatorBefore: true,
        detail: host ? `Open another terminal for ${host.name}.` : 'Open another terminal workspace.',
      },
      {
        id: 'terminal-open-host-dashboard',
        label: 'Open Host Dashboard',
        icon: 'HD',
        disabled: !host,
        detail: host ? host.name : 'Requires a host-scoped terminal.',
      },
      {
        id: 'terminal-properties',
        label: host ? 'Session Properties' : 'Terminal Properties',
        icon: 'I',
        separatorBefore: true,
        detail: host ? `${host.username || 'user'}@${host.address || host.hostname}` : windowItem.windowId,
      },
    ];
  }

  private notificationContextItems(): ContextMenuItem[] {
    return this.shellContextItems('notification', [
      { id: 'dismiss-notification', label: 'Dismiss Notification' },
      { id: 'clear-notifications', label: 'Clear All Notifications' },
      { id: 'open-notification-settings', label: 'Notification Settings' },
    ]);
  }

  private dispatchTerminalContextAction(windowId: string | undefined, action: TerminalContextAction): void {
    if (!windowId) {
      this.notify('Terminal window is unavailable.');
      return;
    }

    window.dispatchEvent(new CustomEvent('switchboard-terminal-command', {
      detail: {
        windowId,
        action,
      },
    }));
  }

  private dismissContextNotification(notification: ShellNotificationContext | undefined): void {
    if (!notification) {
      return;
    }

    if (notification.kind === 'error') {
      this.errorMessage = '';
      return;
    }
    if (notification.kind === 'status') {
      this.statusMessage = '';
      return;
    }
    if (notification.toastId) {
      this.toasts = this.toasts.filter((toast) => toast.id !== notification.toastId);
      return;
    }

    this.toasts = this.toasts.filter((toast) => toast.message !== notification.message);
  }

  private clearNotifications(): void {
    this.errorMessage = '';
    this.statusMessage = '';
    this.toasts = [];
    this.clearToastTimers();
  }

  private launcherRowContextItems(appId: ShellAppId): ContextMenuItem[] {
    const definition = this.getAppDefinition(appId);
    if (!definition) {
      return [
        { id: 'open-app', label: 'Open', source: 'shell' },
        this.pinContextItem(appId),
        { id: 'properties', label: 'Properties', source: 'shell' },
      ];
    }

    return [
      this.appOpenContextItem(definition, 'launcher-row') ?? { id: 'open-app', label: 'Open', source: 'shell' },
      this.appPinContextItem(definition, 'launcher-row') ?? this.pinContextItem(appId),
      this.appPropertiesContextItem(definition, 'launcher-row') ?? { id: 'properties', label: 'Properties', source: 'shell' },
    ];
  }

  private hostContextItems(host: HostRecord): ContextMenuItem[] {
    return [
      { id: 'open-host-dashboard', label: 'Open Dashboard', detail: host.name },
      { id: 'open-host-terminal', label: 'Open Terminal', detail: `${host.username || 'user'}@${host.address || host.hostname}` },
      { id: 'open-host-file-explorer', label: 'Open File Explorer', detail: 'SSH/SFTP-backed host filesystem.' },
      {
        id: 'run-host-scriptlet',
        label: 'Run Scriptlet',
        disabled: true,
        detail: 'Select a scriptlet workspace artifact before running it on a host.',
      },
      { id: 'edit-host', label: 'Edit Host' },
      { id: 'test-host-connection', label: 'Test Connection' },
      { id: 'host-properties', label: 'Properties', detail: host.id },
    ];
  }

  private appletElementContextItems(
    request: AppletElementContextMenuRequest,
    sourceAppId: ShellAppId,
    sourceWindowId: string,
  ): ContextMenuItem[] {
    return request.actions.map((action) => ({
      id: `applet-element:${request.object.kind}:${action.id}`,
      label: action.label,
      icon: action.icon,
      shortcut: action.shortcut,
      detail: action.detail ?? action.disabledReason ?? undefined,
      disabledReason: action.disabledReason || undefined,
      disabled: Boolean(action.disabled || action.disabledReason),
      danger: Boolean(action.destructive),
      separatorBefore: Boolean(action.separatorBefore),
      source: action.source ?? request.object.source,
      sourceAppId: action.sourceAppId ?? sourceAppId,
      sourceWindowId: action.sourceWindowId ?? sourceWindowId,
      targetScope: action.targetScope ?? request.object.targetScope,
      requiredCapabilities: [...(action.requiredCapabilities ?? [])],
      actionId: action.id,
      handler: action.handler,
    }));
  }

  private runWindowMenuAction(windowId: string | undefined, callback: (windowItem: ShellWindow) => void): void {
    const windowItem = this.windows.find((candidate) => candidate.windowId === windowId);
    if (windowItem) {
      callback(windowItem);
    }
  }

  private openNewWindowForContext(windowId: string | undefined, appId: ShellAppId | undefined): void {
    const sourceWindow = this.windows.find((candidate) => candidate.windowId === windowId);
    const definition = appId ? this.getAppDefinition(appId) : sourceWindow?.appDefinition;
    if (!definition) {
      return;
    }
    const host = sourceWindow?.hostId ? this.hosts.find((candidate) => candidate.id === sourceWindow.hostId) ?? null : null;
    const title = host ? `${definition.title} - ${host.name}` : undefined;
    this.createWindow(definition, host, title);
  }

  private windowAppActionContextItems(windowItem: ShellWindow, target: ContextMenuState['target']): ContextMenuItem[] {
    const definition = windowItem.appDefinition;
    const fallbackTargets: LauncherTarget[] = ['taskbar-window', 'window'];
    const contributionId = 'windowActions';
    const contributionCapabilities = this.requiredCapabilitiesForContextContribution(definition, contributionId);
    if (!this.appManifestContextContributionAllowed(definition, target, contributionId, fallbackTargets, contributionCapabilities)) {
      return [];
    }

    const shellOwnedActions = new Set([
      'minimize-window',
      'maximize-window',
      'tile-left',
      'tile-right',
      'tile-top',
      'tile-bottom',
      'tile-top-left',
      'tile-top-right',
      'tile-bottom-left',
      'tile-bottom-right',
      'toggle-fullscreen',
      'close-window',
    ]);
    return windowItem.registeredActions
      .filter((action) => !shellOwnedActions.has(action.id))
      .filter((action) => this.contextMenuActionCapabilitiesAllowed(definition, [
        ...contributionCapabilities,
        ...(action.capability ? [action.capability] : []),
      ]))
      .map((action) => ({
        id: `window-action:${action.id}`,
        label: action.label,
        detail: action.description,
        shortcut: action.shortcut,
        source: 'window-object' as const,
        sourceAppId: definition.appId,
        targetScope: target,
        requiredCapabilities: [
          ...contributionCapabilities,
          ...(action.capability ? [action.capability] : []),
        ],
        actionId: action.id,
      }));
  }

  private appManifestContextContributionAllowed(
    definition: ShellAppDefinition,
    target: ContextMenuState['target'],
    contributionId: string,
    fallbackTargets: LauncherTarget[],
    requiredCapabilities: string[],
  ): boolean {
    const manifest = definition.manifest;
    if (!manifest) {
      return false;
    }

    const manifestTargets = this.contextMenuTargetsForManifest(manifest);
    if (!manifestTargets.includes(target as LauncherTarget)) {
      return false;
    }

    const contribution = this.contextMenuContributionValue(manifest, contributionId);
    if (contribution === false) {
      return false;
    }

    if (contribution && typeof contribution === 'object' && !Array.isArray(contribution)) {
      const contributionRecord = contribution as Record<string, unknown>;
      const enabled = contributionRecord['enabled'];
      if (enabled === false) {
        return false;
      }

      const targetOverride = this.stringArrayFromUnknown(contributionRecord['targets'])
        .filter((item): item is LauncherTarget => this.isContextMenuTarget(item));
      const allowedTargets = targetOverride.length > 0 ? targetOverride : fallbackTargets;
      if (!allowedTargets.includes(target as LauncherTarget)) {
        return false;
      }
    } else if (contribution !== true && contribution !== undefined) {
      return false;
    } else if (!fallbackTargets.includes(target as LauncherTarget)) {
      return false;
    }

    return this.contextMenuActionCapabilitiesAllowed(definition, requiredCapabilities);
  }

  private requiredCapabilitiesForContextContribution(definition: ShellAppDefinition, contributionId: string): string[] {
    const contribution = definition.manifest
      ? this.contextMenuContributionValue(definition.manifest, contributionId)
      : undefined;
    if (!contribution || typeof contribution !== 'object' || Array.isArray(contribution)) {
      return [];
    }

    const contributionRecord = contribution as Record<string, unknown>;
    const requiredCapabilities = this.stringArrayFromUnknown(contributionRecord['requiredCapabilities']);
    const capability = typeof contributionRecord['capability'] === 'string' && contributionRecord['capability'].trim()
      ? contributionRecord['capability'].trim()
      : null;
    return [...new Set([
      ...requiredCapabilities,
      ...(capability ? [capability] : []),
    ])];
  }

  private contextMenuActionCapabilitiesAllowed(definition: ShellAppDefinition, requiredCapabilities: string[]): boolean {
    if (requiredCapabilities.length === 0) {
      return true;
    }

    const granted = new Set(definition.manifest?.capabilities ?? []);
    return requiredCapabilities.every((capability) => granted.has(capability));
  }

  private contextMenuContributionValue(manifest: AppManifest, contributionId: string): unknown {
    const contributions = manifest.packageMetadata['contextMenuContributions'];
    if (!contributions || typeof contributions !== 'object' || Array.isArray(contributions)) {
      return undefined;
    }
    return (contributions as Record<string, unknown>)[contributionId];
  }

  private contextMenuTargetsForManifest(manifest: AppManifest): LauncherTarget[] {
    const targets = this.stringArrayFromUnknown(manifest.packageMetadata['contextMenuTargets'])
      .filter((item): item is LauncherTarget => this.isContextMenuTarget(item));
    return targets.length > 0 ? targets : ['desktop', 'desktop-icon', 'launcher-row', 'taskbar', 'taskbar-window', 'window'];
  }

  private stringArrayFromUnknown(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
      : [];
  }

  private isContextMenuTarget(value: string): value is LauncherTarget {
    return [
      'desktop',
      'desktop-icon',
      'host',
      'taskbar',
      'taskbar-window',
      'tray-status',
      'terminal',
      'window',
      'launcher-row',
      'workspace-file',
      'generated-app-element',
    ].includes(value);
  }

  private pinContextItem(appId: ShellAppId): ContextMenuItem {
    if (!this.isShortcutPinned(appId)) {
      return { id: 'pin-app', label: 'Pin to Desktop' };
    }
    if (this.defaultShortcutIds.includes(appId)) {
      return {
        id: 'pinned-default-app',
        label: 'Pinned to Desktop',
        disabled: true,
        detail: 'Shell-owned default desktop icon.',
      };
    }
    return { id: 'unpin-app', label: 'Unpin from Desktop' };
  }

  private defaultIconPosition(index: number): DesktopIconPosition {
    return {
      x: 18,
      y: 18 + index * 96,
    };
  }

  private snapDesktopIcon(shortcutId: string): void {
    const position = this.desktopIconPositions[shortcutId];
    if (!position) {
      return;
    }
    const gridX = 18 + Math.round((position.x - 18) / 96) * 96;
    const gridY = 18 + Math.round((position.y - 18) / 96) * 96;
    this.desktopIconPositions = {
      ...this.desktopIconPositions,
      [shortcutId]: {
        x: Math.max(8, gridX),
        y: Math.max(8, gridY),
      },
    };
  }

  private arrangeDesktopIcons(): void {
    const positions: Record<string, DesktopIconPosition> = {};
    this.desktopShortcuts.forEach((shortcut, index) => {
      positions[shortcut.id] = this.defaultIconPosition(index);
    });
    this.desktopIconPositions = positions;
    this.saveDesktopIconPositions();
    this.notify('Desktop icons arranged.');
  }

  private ensureDefaultIconPositions(): void {
    const positions = { ...this.desktopIconPositions };
    this.desktopShortcuts.forEach((shortcut, index) => {
      positions[shortcut.id] ??= this.defaultIconPosition(index);
    });
    this.desktopIconPositions = positions;
  }

  private stopIconDrag(): void {
    if (!this.iconDragState) {
      return;
    }
    document.removeEventListener('mousemove', this.iconDragState.move);
    this.iconDragState = null;
  }

  private syncFirstRunState(): void {
    const welcomeState = this.readWelcomeAppletState();
    this.firstRunOpen = !welcomeState.dismissed;
  }

  private readWelcomeAppletState(): WelcomeAppletState {
    const state = this.readSystemAppletState<WelcomeAppletState>(WELCOME_APPLET_STATE_DESCRIPTOR);
    if (state) {
      return state;
    }

    const legacyDismissed = window.localStorage.getItem(LEGACY_FIRST_RUN_COMPLETE_STORAGE_KEY) === 'true';
    const migratedState: WelcomeAppletState = legacyDismissed
      ? { dismissed: true }
      : { dismissed: false };
    this.writeWelcomeAppletState(migratedState);
    return migratedState;
  }

  private writeWelcomeAppletState(state: WelcomeAppletState): void {
    this.writeSystemAppletState(WELCOME_APPLET_STATE_DESCRIPTOR, state);
  }

  private readSystemAppletState<TState>(descriptor: SystemAppletStateDescriptor): TState | null {
    try {
      const raw = window.localStorage.getItem(descriptor.storageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { state?: TState } | TState;
      if (parsed && typeof parsed === 'object' && 'state' in parsed) {
        return parsed.state ?? null;
      }
      return parsed as TState;
    } catch {
      return null;
    }
  }

  private writeSystemAppletState<TState>(descriptor: SystemAppletStateDescriptor, state: TState): void {
    window.localStorage.setItem(descriptor.storageKey, JSON.stringify({
      appId: descriptor.appId,
      state,
      updatedAt: new Date().toISOString(),
    }));
  }

  private createWindow(definition: ShellAppDefinition, host: HostRecord | null, overrideTitle?: string): ShellWindow {
    const offset = (this.nextWindowOrdinal - 1) % 6;
    const bounds = this.fitWindowToDesktop({
      ...definition.defaultBounds,
      x: definition.defaultBounds.x + offset * 26,
      y: definition.defaultBounds.y + offset * 22,
    });
    const title = overrideTitle ?? definition.title;
    const windowItem: ShellWindow = {
      windowId: `window-${Date.now().toString(36)}-${this.nextWindowOrdinal++}`,
      appId: definition.appId,
      hostId: host?.id ?? null,
      title,
      bounds,
      state: 'floating',
      tilePosition: null,
      focused: true,
      zIndex: this.nextZIndex++,
      runtimeMetadata: defaultWindowRuntimeMetadata(),
      semanticState: this.buildSemanticState(definition.appId, host),
      registeredActions: this.registeredActionsFor(definition.appId, host),
      appDefinition: definition,
    };
    for (const candidate of this.windows) {
      candidate.focused = false;
    }
    this.windows = [...this.windows, windowItem];
    this.notify(`${title} opened.`);
    if (definition.appId === 'trash') {
      void this.loadTrashItemsFromBackend();
    }
    return windowItem;
  }

  private createWindowFromSnapshot(
    definition: ShellAppDefinition,
    snapshot: WorkspaceLayoutSnapshot['windows'][number],
    host: HostRecord | null,
  ): ShellWindow {
    return {
      windowId: snapshot.windowId,
      appId: definition.appId,
      hostId: snapshot.hostId,
      title: snapshot.title,
      bounds: this.fitWindowToDesktop(snapshot.bounds),
      state: snapshot.state,
      tilePosition: snapshot.tilePosition,
      focused: false,
      zIndex: snapshot.zIndex,
      runtimeMetadata: normalizeWindowRuntimeMetadata(snapshot.runtimeMetadata),
      semanticState: this.buildSemanticState(definition.appId, host),
      registeredActions: this.registeredActionsFor(definition.appId, host),
      appDefinition: definition,
    };
  }

  private refreshHostScopedWindows(): void {
    for (const windowItem of this.windows) {
      this.refreshWindowSemantics(windowItem);
    }
  }

  private refreshWindowSemantics(windowItem: ShellWindow): void {
    const host = this.hostFor(windowItem);
    windowItem.semanticState = this.buildSemanticState(windowItem.appId, host);
    windowItem.registeredActions = this.registeredActionsFor(windowItem.appId, host);
  }

  private buildSemanticState(appId: ShellAppId, host: HostRecord | null): ShellWindowSemanticState {
    if (appId === 'host-dashboard' && host) {
      const metrics = this.hostMetricsById[host.id] ?? null;
      return {
        kind: 'host-dashboard',
        status: metrics?.status ?? host.lastConnectionStatus,
        summary: `${host.name} at ${host.address || host.hostname}:${host.port}`,
        metadata: {
          hostId: host.id,
          hostName: host.name,
          address: host.address || host.hostname,
          port: host.port,
          username: host.username || null,
          credentialRefId: host.credentialRefId,
          credentialReference: this.hostCredentialSummary(host),
          group: host.group ?? null,
          tags: host.tags,
          osInfo: this.hostMetricText(host, 'os'),
          uptime: this.hostMetricText(host, 'uptime'),
          memory: this.hostMetricText(host, 'memory'),
          disk: this.hostMetricText(host, 'disk'),
          metricsCollectedAt: metrics?.collectedAt ?? null,
          metricsError: metrics?.error ?? null,
          bootstrapStatus: host.bootstrapStatus || 'unknown',
          defaultShell: host.defaultShell || 'unknown',
          defaultWorkingDirectory: host.defaultWorkingDirectory || 'unknown',
          knownCapabilities: host.capabilities,
          quickActions: ['test-connection', 'refresh-metrics', 'open-host-terminal', 'open-files', 'open-logs', 'open-services', 'open-processes'],
          lastCheckedAt: host.lastCheckedAt,
          recentAuditCount: this.recentAuditForHost(host.id).length,
        },
      };
    }

    if (appId === 'host-terminal' && host) {
      return {
        kind: 'terminal',
        status: 'host-scoped-workspace',
        summary: `Terminal workspace for ${host.name}`,
        metadata: {
          hostId: host.id,
          hostName: host.name,
          target: `${host.username ? `${host.username}@` : ''}${host.address || host.hostname}:${host.port}`,
          executionPolicy: 'existing SSH terminal component; shell metadata is host scoped',
          secretsStored: false,
        },
      };
    }

    if (appId === 'terminal') {
      return {
        kind: 'terminal',
        status: 'general-terminal-workspace',
        summary: 'General terminal app with host selector and xterm renderer.',
        metadata: {
          hostScoped: false,
          xterm: true,
          secretsStored: false,
        },
      };
    }

    if (appId === 'host-map') {
      const failedHosts = this.hosts.filter((candidate) => candidate.lastConnectionStatus === 'failed').length;
      const successfulHosts = this.hosts.filter((candidate) => candidate.lastConnectionStatus === 'success').length;
      return {
        kind: 'graphical-host-map',
        status: failedHosts > 0 ? 'attention' : 'ready',
        summary: `Graphical SDK app showing ${this.hosts.length} hosts, ${successfulHosts} reachable, ${failedHosts} failed.`,
        metadata: {
          appSdk: true,
          graphical: true,
          hostCount: this.hosts.length,
          successfulHosts,
          failedHosts,
          capabilities: ['host:read', 'local:config:read', 'agent:read-state'],
          noCommandExecution: true,
        },
      };
    }

    if (this.isHostOperationApp(appId)) {
      const definition = this.getAppDefinition(appId);
      return {
        kind: appId,
        status: host ? 'host-scoped-read-only' : 'ready',
        summary: host
          ? `${definition?.title ?? appId} for ${host.name}`
          : `${definition?.title ?? appId} with selectable host context.`,
        metadata: {
          hostScoped: Boolean(host),
          hostId: host?.id ?? null,
          hostName: host?.name ?? null,
          operationKind: this.operationKindForApp(appId),
          backend: 'ssh-batchmode-read-only',
          commandHistory: true,
          secretsStored: false,
        },
      };
    }

    if (appId === 'command-history') {
      return {
        kind: 'command-history',
        status: 'open',
        summary: 'SQLite command metadata viewer.',
        metadata: {
          storage: 'sqlite',
          commandOutputStored: false,
        },
      };
    }

    if (appId === 'app-studio') {
      return {
        kind: 'app-studio',
        status: 'monaco-install',
        summary: 'Monaco-backed app manifest/code review and local generated app installation surface.',
        metadata: {
          monaco: true,
          capabilityApproval: true,
          installPerformed: true,
        },
      };
    }

    const generatedDefinition = this.getAppDefinition(appId);
    if (generatedDefinition?.generated && generatedDefinition.manifest) {
      const manifest = generatedDefinition.manifest;
      const artifactPath = generatedAppArtifactPath(manifest);
      const sourcePersistence = stringPackageMetadata(manifest, 'sourcePersistence') ?? 'appManifest.sourceCode';
      return {
        kind: 'generated-app',
        status: 'installed',
        summary: `${manifest.name} generated app is installed and ready to run in sandboxed iframe.`,
        metadata: {
          appId: manifest.appId,
          manifestId: manifest.id,
          artifactBacked: Boolean(artifactPath),
          artifactPath,
          artifactKind: stringPackageMetadata(manifest, 'artifactKind'),
          artifactContentRoute: stringPackageMetadata(manifest, 'artifactContentRoute'),
          artifactLoadStatus: stringPackageMetadata(manifest, 'artifactLoadStatus'),
          sourcePersistence,
          sourceCodeLoaded: Boolean(manifest.sourceCode),
          sourceCodePersisted: Boolean(manifest.sourceCode) && sourcePersistence !== 'workspaceArtifactContent',
          isolation: 'sandboxed-iframe-srcdoc',
          sdkBridge: 'postMessage',
          nodeAccess: false,
          capabilities: manifest.capabilities,
        },
      };
    }

    return {
      kind: appId,
      status: 'open',
      summary: `${this.getAppDefinition(appId)?.title ?? appId} app window.`,
      metadata: {
        hostScoped: false,
      },
    };
  }

  private registeredActionsFor(appId: ShellAppId, host: HostRecord | null): ShellWindowAction[] {
    const layoutActions = this.layoutActions();

    if (appId === 'host-dashboard' && host) {
      return [
        { id: 'test-connection', label: 'Test connection', description: `Run the local reachability check for ${host.name}.` },
        { id: 'refresh-metrics', label: 'Refresh metrics', description: `Collect OS, uptime, memory, and disk for ${host.name}.` },
        { id: 'open-host-terminal', label: 'Open host terminal', description: `Open a host-scoped terminal window for ${host.name}.` },
        { id: 'open-files', label: 'Open files', description: `Open the host-scoped file browser for ${host.name}.` },
        { id: 'open-logs', label: 'Open logs', description: `Open the host-scoped log viewer for ${host.name}.` },
        { id: 'open-services', label: 'Open services', description: `Open the host-scoped service manager for ${host.name}.` },
        { id: 'open-processes', label: 'Open processes', description: `Open the host-scoped process viewer for ${host.name}.` },
        { id: 'refresh-hosts', label: 'Refresh context', description: 'Reload hosts and audit events for this dashboard.' },
        ...layoutActions,
      ];
    }

    if (appId === 'host-terminal' && host) {
      return [
        { id: 'refresh-hosts', label: 'Refresh host context', description: `Reload host metadata for ${host.name}.` },
        ...layoutActions,
      ];
    }

    if (appId === 'host-map') {
      return [
        { id: 'refresh-hosts', label: 'Refresh map context', description: 'Reload host and audit context for the graphical SDK app.' },
        { id: 'open-hosts', label: 'Open Hosts', description: 'Open the host inventory app from the graphical SDK app.' },
        ...layoutActions,
      ];
    }

    if (this.isHostOperationApp(appId)) {
      const appTitle = this.getAppDefinition(appId)?.title ?? appId;
      return [
        { id: 'refresh-hosts', label: 'Refresh host context', description: `Reload hosts before using ${appTitle}.` },
        { id: 'open-command-history', label: 'Open command history', description: 'Open command metadata recorded by read-only operations.' },
        ...layoutActions,
      ];
    }

    if (appId === 'app-studio') {
      return [
        { id: 'open-apps', label: 'Open Apps', description: 'Open the local App SDK registry.' },
        ...layoutActions,
      ];
    }

    const generatedDefinition = this.getAppDefinition(appId);
    if (generatedDefinition?.generated && generatedDefinition.manifest) {
      const registered = actionRegistryFromManifest(generatedDefinition.manifest);
      return [
        ...registered,
        ...layoutActions,
      ];
    }

    return [
      { id: 'refresh-hosts', label: 'Refresh workspace context', description: 'Reload host launcher and audit context.' },
      ...layoutActions,
    ];
  }

  private getAppDefinition(appId: ShellAppId): ShellAppDefinition | null {
    return this.allAppDefinitions.find((definition) => definition.appId === appId) ?? null;
  }

  private isAppDiscoverable(definition: ShellAppDefinition): boolean {
    if (!definition.searchable) {
      return false;
    }

    if (definition.appId === 'agents') {
      return this.operatorConfigured;
    }

    if (definition.launcherCategory === 'optional-configured' && !definition.generated) {
      return false;
    }

    return true;
  }

  private async refreshOperatorConfigurationState(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.operatorSettingsConfigured = false;
      this.operatorAgentEndpointConfigured = false;
      return;
    }

    const [settings, agentEndpoints] = await Promise.all([
      api.settings.get().catch(() => null),
      api.agentEndpoint?.list?.().catch(() => [] as AgentEndpoint[]) ?? Promise.resolve([] as AgentEndpoint[]),
    ]);

    this.operatorSettingsConfigured = settings ? this.hasLegacyOperatorEndpoint(settings) : false;
    this.operatorAgentEndpointConfigured = agentEndpoints.some((endpoint) => this.isConfiguredAgentEndpoint(endpoint));
  }

  private hasLegacyOperatorEndpoint(settings: MvpSettings): boolean {
    return Boolean(settings.operator.endpoint.trim());
  }

  private isConfiguredAgentEndpoint(endpoint: AgentEndpoint): boolean {
    return Boolean(endpoint.enabled && endpoint.baseUrl.trim() && endpoint.model.trim());
  }

  private definitionFromManifest(manifest: AppManifest): ShellAppDefinition {
    return {
      appId: manifest.appId,
      title: manifest.name,
      detail: manifest.description || `Generated ${manifest.category || 'local'} app`,
      icon: manifest.icon || 'GA',
      component: GeneratedAppRuntimeComponent,
      defaultBounds: { x: 220, y: 88, width: 820, height: 560 },
      searchable: true,
      launcherCategory: 'optional-configured',
      manifest,
      generated: true,
    };
  }

  private layoutActions(): ShellWindowAction[] {
    return [
      { id: 'minimize-window', label: 'Minimize window', description: 'Minimize this shell window.', shortcut: 'Meta+M' },
      { id: 'maximize-window', label: 'Maximize or restore window', description: 'Toggle the maximized state for this shell window.', shortcut: 'Meta+Up' },
      { id: 'tile-left', label: 'Tile left', description: 'Snap this shell window to the left half.', shortcut: 'Alt+Shift+Left' },
      { id: 'tile-right', label: 'Tile right', description: 'Snap this shell window to the right half.', shortcut: 'Alt+Shift+Right' },
      { id: 'tile-top', label: 'Tile top', description: 'Snap this shell window to the top half.', shortcut: 'Alt+Shift+Up' },
      { id: 'tile-bottom', label: 'Tile bottom', description: 'Snap this shell window to the bottom half.', shortcut: 'Alt+Shift+Down' },
      { id: 'tile-top-left', label: 'Tile top left', description: 'Snap this shell window to the top-left quadrant.', shortcut: 'Alt+Shift+1' },
      { id: 'tile-top-right', label: 'Tile top right', description: 'Snap this shell window to the top-right quadrant.', shortcut: 'Alt+Shift+2' },
      { id: 'tile-bottom-left', label: 'Tile bottom left', description: 'Snap this shell window to the bottom-left quadrant.', shortcut: 'Alt+Shift+3' },
      { id: 'tile-bottom-right', label: 'Tile bottom right', description: 'Snap this shell window to the bottom-right quadrant.', shortcut: 'Alt+Shift+4' },
      { id: 'toggle-fullscreen', label: 'Toggle fullscreen', description: 'Toggle fullscreen mode for this shell window.', shortcut: 'F11' },
      { id: 'close-window', label: 'Close window', description: 'Close this shell window.', shortcut: 'Alt+F4' },
    ];
  }

  private isHostOperationApp(appId: ShellAppId): appId is HostOperationAppId {
    return appId === 'file-browser'
      || appId === 'process-viewer'
      || appId === 'service-manager'
      || appId === 'log-viewer';
  }

  private operationKindForApp(appId: HostOperationAppId): HostOperationKind {
    const map: Record<HostOperationAppId, HostOperationKind> = {
      'file-browser': 'files',
      'process-viewer': 'processes',
      'service-manager': 'services',
      'log-viewer': 'logs',
    };
    return map[appId];
  }

  private focusTopWindow(): void {
    const visible = this.visibleWindows;
    if (visible.length === 0) {
      return;
    }
    const topWindow = [...visible].sort((a, b) => b.zIndex - a.zIndex)[0];
    this.focusWindow(topWindow);
  }

  private applyEdgeSnap(event: MouseEvent, windowItem: ShellWindow, surfaceRect: DOMRect): void {
    const pointerX = event.clientX - surfaceRect.left;
    const pointerY = event.clientY - surfaceRect.top;
    const edgeSize = 30;
    const cornerSize = 90;

    if (pointerX <= cornerSize && pointerY <= cornerSize) {
      this.tileWindow(windowItem, 'top-left');
      return;
    }
    if (pointerX >= surfaceRect.width - cornerSize && pointerY <= cornerSize) {
      this.tileWindow(windowItem, 'top-right');
      return;
    }
    if (pointerX <= cornerSize && pointerY >= surfaceRect.height - cornerSize) {
      this.tileWindow(windowItem, 'bottom-left');
      return;
    }
    if (pointerX >= surfaceRect.width - cornerSize && pointerY >= surfaceRect.height - cornerSize) {
      this.tileWindow(windowItem, 'bottom-right');
      return;
    }
    if (pointerY <= edgeSize) {
      this.tileWindow(windowItem, 'top');
      return;
    }
    if (pointerY >= surfaceRect.height - edgeSize) {
      this.tileWindow(windowItem, 'bottom');
      return;
    }
    if (pointerX <= edgeSize) {
      this.tileWindow(windowItem, 'left');
      return;
    }
    if (pointerX >= surfaceRect.width - edgeSize) {
      this.tileWindow(windowItem, 'right');
    }
  }

  private tileStyle(tilePosition: ShellTilePosition): Record<string, string> {
    const halfWidth = 'calc(50% - 15px)';
    const halfHeight = 'calc(50% - 15px)';
    const fullWidth = 'calc(100% - 20px)';
    const fullHeight = 'calc(100% - 20px)';
    const styles: Record<ShellTilePosition, Record<string, string>> = {
      left: { left: '10px', top: '10px', width: halfWidth, height: fullHeight },
      right: { right: '10px', top: '10px', width: halfWidth, height: fullHeight },
      top: { left: '10px', top: '10px', width: fullWidth, height: halfHeight },
      bottom: { left: '10px', bottom: '10px', width: fullWidth, height: halfHeight },
      'top-left': { left: '10px', top: '10px', width: halfWidth, height: halfHeight },
      'top-right': { right: '10px', top: '10px', width: halfWidth, height: halfHeight },
      'bottom-left': { left: '10px', bottom: '10px', width: halfWidth, height: halfHeight },
      'bottom-right': { right: '10px', bottom: '10px', width: halfWidth, height: halfHeight },
    };
    return styles[tilePosition];
  }

  private fitWindowToDesktop(bounds: ShellWindowBounds): ShellWindowBounds {
    const surface = this.desktopSurface();
    const surfaceWidth = surface?.clientWidth ?? window.innerWidth;
    const surfaceHeight = surface?.clientHeight ?? Math.max(360, window.innerHeight - 74);
    const width = Math.min(Math.max(420, bounds.width), Math.max(420, surfaceWidth - 20));
    const height = Math.min(Math.max(300, bounds.height), Math.max(300, surfaceHeight - 20));
    const x = clamp(bounds.x, 10, Math.max(10, surfaceWidth - width - 10));
    const y = clamp(bounds.y, 10, Math.max(10, surfaceHeight - height - 10));
    return { x, y, width, height };
  }

  private desktopSurface(): HTMLElement | null {
    return document.querySelector('.desktop-surface');
  }

  private isResponsiveWorkspace(): boolean {
    return window.innerWidth < 760;
  }

  private stopDrag(): void {
    if (!this.dragState) {
      return;
    }
    document.removeEventListener('mousemove', this.dragState.move);
    document.removeEventListener('mouseup', this.dragState.end);
    this.dragState = null;
  }

  private stopResize(): void {
    if (!this.resizeState) {
      return;
    }
    document.removeEventListener('mousemove', this.resizeState.move);
    document.removeEventListener('mouseup', this.resizeState.end);
    this.resizeState = null;
  }

  private loadDesktopShortcuts(): DesktopShortcut[] {
    try {
      const stored = window.localStorage.getItem(DESKTOP_SHORTCUTS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as unknown : null;
      if (Array.isArray(parsed)) {
        const hasLegacyDefaultClutter = this.isLegacyDefaultShortcutSet(this.desktopShortcutAppIdsFromUnknownList(parsed));
        const shortcuts = this.normalizeDesktopShortcuts(parsed);
        this.pendingLegacyDesktopShortcutPins = hasLegacyDefaultClutter
          ? this.explicitUserShortcutPinsFrom(shortcuts)
          : [];
        return shortcuts.length > 0 ? shortcuts : this.defaultDesktopShortcuts();
      }
    } catch {
      this.pendingLegacyDesktopShortcutPins = [];
      return this.defaultDesktopShortcuts();
    }
    this.pendingLegacyDesktopShortcutPins = [];
    return this.defaultDesktopShortcuts();
  }

  private desktopShortcutAppIdsFromUnknownList(value: unknown[]): ShellAppId[] {
    return value
      .map((item) => {
        if (typeof item === 'string' && this.isShellAppId(item)) {
          return item;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const appId = (item as Partial<DesktopShortcut>).appId;
        return appId && this.isShellAppId(appId) ? appId : null;
      })
      .filter((appId): appId is ShellAppId => appId !== null);
  }

  private explicitUserShortcutPinsFrom(shortcuts: DesktopShortcut[]): DesktopShortcut[] {
    return shortcuts
      .filter((shortcut) => this.isExplicitUserDesktopShortcut(shortcut))
      .map((shortcut) => ({
        id: shortcut.id,
        appId: shortcut.appId,
        shellOwned: false,
        ...(shortcut.label ? { label: shortcut.label } : {}),
      }));
  }

  private async loadWorkspaceProfilesFromStore(): Promise<void> {
    if (this.workspaceProfilesLoadPromise) {
      return this.workspaceProfilesLoadPromise;
    }

    this.workspaceProfilesLoadPromise = this.loadWorkspaceProfilesFromStoreOnce()
      .finally(() => {
        this.workspaceProfilesLoadPromise = null;
      });

    return this.workspaceProfilesLoadPromise;
  }

  private async loadWorkspaceProfilesFromStoreOnce(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      return;
    }

    try {
      let profiles = await api.workspace.listProfiles();
      const activeId = await api.workspace.getActiveProfileId();

      if (profiles.length === 0) {
        // Migrate from localStorage if available
        const legacyProfiles = this.loadLegacyWorkspaceProfiles();
        if (legacyProfiles.length > 0) {
          for (const profile of legacyProfiles) {
            await api.workspace.createProfile({ name: profile.name, layout: profile.layout });
          }
          profiles = await api.workspace.listProfiles();
        }

        profiles = await api.workspace.listProfiles();
        if (profiles.length === 0) {
          const defaultProfile = await api.workspace.createProfile({
            name: 'Default workspace',
            layout: this.loadLegacyWorkspaceLayout() ?? this.currentWorkspaceLayoutSnapshot(),
          });
          profiles = await api.workspace.listProfiles();
          if (profiles.length === 0) {
            profiles = [defaultProfile];
          }
        }
      }

      this.workspaceProfiles = profiles;
      this.workspaceProfilesLoaded = true;

      if (activeId && profiles.some((p) => p.profileId === activeId)) {
        this.activeProfileId = activeId;
      } else {
        this.activeProfileId = profiles[0]?.profileId ?? DEFAULT_WORKSPACE_PROFILE_ID;
        await api.workspace.setActiveProfileId(this.activeProfileId);
      }

      this.renameProfileName = this.activeProfile.name;
      const migratedDesktopShortcuts = this.restoreProfileLayout(this.activeProfile);
      if (migratedDesktopShortcuts) {
        await this.persistActiveProfileLayout(false);
      }
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to load workspace profiles from store.');
      // Fallback to empty default
      this.workspaceProfiles = [this.createDefaultWorkspaceProfile()];
      this.activeProfileId = DEFAULT_WORKSPACE_PROFILE_ID;
    }
  }

  private loadLegacyWorkspaceProfiles(): WorkspaceProfile[] {
    try {
      const stored = window.localStorage.getItem(WORKSPACE_PROFILES_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as unknown : null;
      if (Array.isArray(parsed)) {
        const profiles = parsed
          .map((value) => this.normalizeWorkspaceProfile(value))
          .filter((profile): profile is WorkspaceProfile => Boolean(profile));
        if (profiles.length > 0) {
          return profiles;
        }
      }
    } catch {
      // Fall through to empty.
    }
    return [];
  }

  private createDefaultWorkspaceProfile(): WorkspaceProfile {
    const legacyLayout = this.loadLegacyWorkspaceLayout();
    return {
      profileId: DEFAULT_WORKSPACE_PROFILE_ID,
      name: 'Default workspace',
      updatedAt: new Date().toISOString(),
      layout: legacyLayout ?? this.currentWorkspaceLayoutSnapshot(),
    };
  }

  private normalizeWorkspaceProfile(value: unknown): WorkspaceProfile | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Partial<WorkspaceProfile>;
    const profileId = typeof record.profileId === 'string' && record.profileId.trim()
      ? record.profileId
      : `profile-${Date.now().toString(36)}`;
    const name = typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : 'Untitled workspace';
    const updatedAt = typeof record.updatedAt === 'string'
      ? record.updatedAt
      : new Date().toISOString();

    return {
      profileId,
      name,
      updatedAt,
      layout: this.normalizeWorkspaceLayout(record.layout),
    };
  }

  private normalizeWorkspaceLayout(value: unknown): WorkspaceLayoutSnapshot {
    if (!value || typeof value !== 'object') {
      return this.emptyWorkspaceLayout();
    }

    const record = value as Partial<WorkspaceLayoutSnapshot>;
    const desktopShortcutIds = Array.isArray(record.desktopShortcutIds)
      ? this.normalizeDesktopShortcuts(record.desktopShortcutIds)
      : this.emptyWorkspaceLayout().desktopShortcutIds;
    const windows = Array.isArray(record.windows)
      ? record.windows
          .map((windowItem): WorkspaceLayoutSnapshot['windows'][number] | null => {
            if (!windowItem
              || typeof windowItem !== 'object'
              || typeof windowItem.windowId !== 'string'
              || typeof windowItem.appId !== 'string'
              || !this.isShellAppId(windowItem.appId)
              || !windowItem.bounds
              || !Number.isFinite(windowItem.bounds.x)
              || !Number.isFinite(windowItem.bounds.y)
              || !Number.isFinite(windowItem.bounds.width)
              || !Number.isFinite(windowItem.bounds.height)) {
              return null;
            }
            return {
              windowId: windowItem.windowId,
              appId: windowItem.appId,
              hostId: typeof windowItem.hostId === 'string' ? windowItem.hostId : null,
              title: typeof windowItem.title === 'string' && windowItem.title.trim()
                ? windowItem.title.trim()
                : this.getAppDefinition(windowItem.appId)?.title ?? windowItem.appId,
              bounds: {
                x: windowItem.bounds.x,
                y: windowItem.bounds.y,
                width: windowItem.bounds.width,
                height: windowItem.bounds.height,
              },
              state: windowItem.state,
              tilePosition: windowItem.tilePosition,
              zIndex: Number.isFinite(windowItem.zIndex) ? windowItem.zIndex : 1,
              runtimeMetadata: normalizeWindowRuntimeMetadata(windowItem.runtimeMetadata),
            };
          })
          .filter((windowItem): windowItem is WorkspaceLayoutSnapshot['windows'][number] => windowItem !== null)
      : [];

    return {
      desktopShortcutIds,
      windows,
    };
  }

  private normalizeDesktopShortcuts(value: unknown[]): DesktopShortcut[] {
    const raw = value
      .map((item) => {
        if (typeof item === 'string' && this.isShellAppId(item)) {
          return { appId: item, shellOwned: true } as NormalizedRawShortcut;
        }
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Partial<DesktopShortcut>;
        if (!record.appId || !this.isShellAppId(record.appId)) {
          return null;
        }
        const label = typeof record.label === 'string'
          ? record.label.trim()
          : '';
        return {
          appId: record.appId,
          id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined,
          shellOwned: Boolean(record.shellOwned),
          ...(label ? { label } : {}),
        };
      })
      .filter((entry): entry is NormalizedRawShortcut => Boolean(entry));

    const defaultShortcutSet = new Set<ShellAppId>(this.defaultShortcutIds);
    const legacyDefaultClutter = this.isLegacyDefaultShortcutSet(raw.map((entry) => entry.appId));
    const normalized: DesktopShortcut[] = this.defaultDesktopShortcuts()
      .map((shortcut) => {
        const storedDefault = raw.find((entry) => entry.appId === shortcut.appId && entry.label);
        return {
          ...shortcut,
          ...(storedDefault?.label ? { label: storedDefault.label } : {}),
        };
      });
    const usedIds = new Set<string>();
    normalized.forEach((shortcut) => usedIds.add(shortcut.id));

    for (const entry of raw) {
      if (defaultShortcutSet.has(entry.appId)) {
        continue;
      }
      if (legacyDefaultClutter
        && this.isLegacyDefaultShortcutApp(entry.appId)
        && !this.isExplicitUserShortcut(entry)) {
        continue;
      }

      const shortcutId = entry.id ?? this.legacyShortcutId(entry.appId);
      if (usedIds.has(shortcutId)) {
        continue;
      }
      usedIds.add(shortcutId);
      normalized.push({
        id: shortcutId,
        appId: entry.appId,
        shellOwned: false,
        ...(entry.label ? { label: entry.label } : {}),
      });
    }

    return normalized.length > 0 ? normalized : this.defaultDesktopShortcuts();
  }

  private isLegacyDefaultShortcutApp(appId: ShellAppId): boolean {
    return (LEGACY_DEFAULT_DESKTOP_SHORTCUT_IDS as readonly ShellAppId[]).includes(appId);
  }

  private isExplicitUserShortcut(entry: NormalizedRawShortcut): boolean {
    return this.isExplicitUserDesktopShortcut(entry);
  }

  private isExplicitUserDesktopShortcut(entry: { appId: ShellAppId; id?: string; shellOwned?: boolean }): boolean {
    if (!entry.id || entry.shellOwned) {
      return false;
    }
    return entry.id.startsWith(`shortcut-${entry.appId}-`);
  }

  private reconcilePendingLegacyDesktopShortcutPins(): boolean {
    if (this.pendingLegacyDesktopShortcutPins.length === 0) {
      return false;
    }

    const usedIds = new Set(this.desktopShortcuts.map((shortcut) => shortcut.id));
    let changed = false;
    for (const pin of this.pendingLegacyDesktopShortcutPins) {
      if (usedIds.has(pin.id) || !this.getAppDefinition(pin.appId)) {
        continue;
      }
      usedIds.add(pin.id);
      this.desktopShortcuts = [
        ...this.desktopShortcuts,
        {
          id: pin.id,
          appId: pin.appId,
          shellOwned: false,
          ...(pin.label ? { label: pin.label } : {}),
        },
      ];
      changed = true;
    }
    this.pendingLegacyDesktopShortcutPins = [];
    return changed;
  }

  private isLegacyDefaultShortcutSet(shortcutIds: string[]): boolean {
    const shortcutSet = new Set(shortcutIds);
    const legacyMatches = LEGACY_DEFAULT_DESKTOP_SHORTCUT_IDS
      .filter((appId) => shortcutSet.has(appId)).length;
    return legacyMatches >= 8;
  }

  private loadLegacyWorkspaceLayout(): WorkspaceLayoutSnapshot | null {
    try {
      const stored = window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY);
      return stored ? this.normalizeWorkspaceLayout(JSON.parse(stored) as unknown) : null;
    } catch {
      return null;
    }
  }

  private loadActiveProfileIdFromLocalStorage(): string | null {
    try {
      const stored = window.localStorage.getItem(ACTIVE_WORKSPACE_PROFILE_STORAGE_KEY);
      if (stored) {
        return stored;
      }
    } catch {
      // ignore
    }
    return null;
  }

  // saveWorkspaceProfiles removed: SQLite is the source of truth for workspace profiles.
  // localStorage profile keys are retained only for one-time migration on first load.

  private saveDesktopShortcuts(): void {
    try {
      window.localStorage.setItem(DESKTOP_SHORTCUTS_STORAGE_KEY, JSON.stringify(this.desktopShortcuts));
    } catch {
      this.errorMessage = 'Unable to persist desktop shortcuts.';
    }
  }

  private loadDesktopIconPositions(): Record<string, DesktopIconPosition> {
    try {
      const stored = window.localStorage.getItem(DESKTOP_ICON_POSITIONS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as unknown : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const positions: Record<string, DesktopIconPosition> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!value || typeof value !== 'object') {
            continue;
          }
          const candidate = value as Partial<DesktopIconPosition>;
          if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y)) {
            const shortcutId = this.defaultShortcutIds.includes(key as ShellAppId)
              ? this.defaultShortcutId(key as ShellAppId)
              : key;
            positions[shortcutId] = { x: Number(candidate.x), y: Number(candidate.y) };
          }
        }
        return positions;
      }
    } catch {
      // Fall through to defaults.
    }
    return {};
  }

  private restoreShortcutPositionTargets(positions: Record<string, DesktopIconPosition>): Record<string, DesktopIconPosition> {
    const restored: Record<string, DesktopIconPosition> = {};
    const reusablePositions = { ...positions };

    for (const shortcut of this.desktopShortcuts) {
      const direct = reusablePositions[shortcut.id];
      if (direct) {
        delete reusablePositions[shortcut.id];
        restored[shortcut.id] = direct;
        continue;
      }

      const legacyDefaultKey = this.legacyShortcutId(shortcut.appId);
      const appKey = this.defaultShortcutIds.includes(shortcut.appId) ? this.defaultShortcutId(shortcut.appId) : undefined;
      const fallbackKeys = [legacyDefaultKey, appKey, shortcut.appId].filter((key): key is string => Boolean(key));

      const fallbackKey = fallbackKeys.find((key) => reusablePositions[key]);
      if (!fallbackKey) {
        continue;
      }

      const fallbackPosition = reusablePositions[fallbackKey];
      delete reusablePositions[fallbackKey];
      restored[shortcut.id] = fallbackPosition;
    }
    return restored;
  }

  private saveDesktopIconPositions(): void {
    try {
      window.localStorage.setItem(DESKTOP_ICON_POSITIONS_STORAGE_KEY, JSON.stringify(this.desktopIconPositions));
    } catch {
      this.errorMessage = 'Unable to persist desktop icon positions.';
    }
  }

  private loadWorkspaceArtifacts(): WorkspaceArtifact[] {
    try {
      const stored = window.localStorage.getItem(WORKSPACE_ARTIFACTS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) as unknown : null;
      if (Array.isArray(parsed)) {
        const artifacts = parsed.filter((item): item is WorkspaceArtifact => {
          if (!item || typeof item !== 'object') {
            return false;
          }
          const record = item as Partial<WorkspaceArtifact>;
          return typeof record.id === 'string'
            && typeof record.name === 'string'
            && (record.kind === 'folder' || record.kind === 'applet' || record.kind === 'scriptlet' || record.kind === 'note')
            && typeof record.detail === 'string'
            && typeof record.updatedAt === 'string';
        });
        if (artifacts.length > 0) {
          return artifacts;
        }
      }
    } catch {
      // Fall through to default artifacts.
    }
    return [
      {
        id: 'welcome-note',
        name: 'Workspace Root',
        kind: 'note',
        detail: 'Constrained SwitchboardOS workspace folder',
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  private saveWorkspaceArtifacts(): void {
    try {
      window.localStorage.setItem(WORKSPACE_ARTIFACTS_STORAGE_KEY, JSON.stringify(this.workspaceArtifacts));
    } catch {
      this.errorMessage = 'Unable to persist workspace artifacts.';
    }
  }

  private async loadWorkspaceArtifactsFromBackend(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api?.workspaceFile) {
      this.workspaceArtifacts = this.loadWorkspaceArtifactsForPath(this.workspaceCurrentPath);
      return;
    }

    try {
      const backendArtifacts = await api.workspaceFile.list(this.workspaceCurrentPath);
      const normalized: WorkspaceArtifact[] = Array.isArray(backendArtifacts)
        ? backendArtifacts
            .map((item) => normalizeWorkspaceArtifact(item))
            .filter((a): a is WorkspaceArtifact => a !== null)
        : [];
      this.workspaceArtifacts = normalized;
      return;
    } catch {
      // Fall through to localStorage fallback.
    }

    this.workspaceArtifacts = this.loadWorkspaceArtifactsForPath(this.workspaceCurrentPath);
  }

  private loadWorkspaceArtifactsForPath(path: string): WorkspaceArtifact[] {
    const normalizedPath = this.normalizeWorkspaceRelativePath(path);
    return this.loadWorkspaceArtifacts().filter((artifact) =>
      this.workspaceParentPath(this.workspaceArtifactPath(artifact)) === normalizedPath,
    );
  }

  private isShellAppId(value: unknown): value is ShellAppId {
    return typeof value === 'string' && this.allAppDefinitions.some((definition) => definition.appId === value);
  }

  private applyTheme(theme: MvpSettings['theme']): void {
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
    const useLight = theme === 'light' || (theme === 'system' && prefersLight);
    document.body.classList.toggle('light', useLight);
  }

  private applyDesktopWallpaper(mode: MvpSettings['desktopWallpaper']): void {
    const validWallpaperModes: MvpSettings['desktopWallpaper'][] = ['default', 'grid', 'topology', 'plain'];
    if (!validWallpaperModes.includes(mode)) {
      return;
    }
    this.desktopWallpaper = mode;
    const root = document.documentElement;
    root.setAttribute('data-desktop-wallpaper', mode);
  }

  private applyDesktopWallpaperLayout(mode: MvpSettings['desktopWallpaperLayout']): void {
    const validWallpaperLayouts: MvpSettings['desktopWallpaperLayout'][] = ['fill', 'fit', 'stretch', 'fit-tile', 'tile-original', 'center'];
    if (!validWallpaperLayouts.includes(mode)) {
      mode = 'fill';
    }
    this.desktopWallpaperLayout = mode;
    const root = document.documentElement;
    root.setAttribute('data-desktop-wallpaper-layout', mode);
  }

  private notify(message: string): void {
    this.statusMessage = message;
    const toast = this.createToastNotification(message);
    this.toasts = [toast, ...this.toasts].slice(0, 3);
    const timerId = window.setTimeout(() => {
      if (this.statusMessage === message) {
        this.statusMessage = '';
      }
      this.toasts = this.toasts.filter((candidate) => candidate.id !== toast.id);
      this.toastTimers = this.toastTimers.filter((candidate) => candidate !== timerId);
    }, 3500);
    this.toastTimers = [...this.toastTimers, timerId];
  }

  private createToastNotification(message: string): ShellToastNotification {
    this.toastSequence += 1;
    return {
      id: `shell:notification:toast:${this.toastSequence}`,
      kind: 'toast',
      message,
      createdAt: new Date().toISOString(),
    };
  }

  private clearToastTimers(): void {
    this.toastTimers.forEach((timerId) => window.clearTimeout(timerId));
    this.toastTimers = [];
  }

  private errorText(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultWindowRuntimeMetadata(): ShellWindowRuntimeMetadata {
  return {
    badge: null,
    status: null,
    preferredSize: null,
    updatedAt: null,
  };
}

function normalizeWindowRuntimeMetadata(value: unknown): ShellWindowRuntimeMetadata {
  if (!isPlainRecord(value)) {
    return defaultWindowRuntimeMetadata();
  }
  return {
    badge: typeof value['badge'] === 'string' && value['badge'].trim() ? value['badge'].trim().slice(0, 12) : null,
    status: typeof value['status'] === 'string' && value['status'].trim() ? value['status'].trim().slice(0, 48) : null,
    preferredSize: normalizeWindowPreferredSize(value['preferredSize']),
    updatedAt: typeof value['updatedAt'] === 'string' && value['updatedAt'].trim() ? value['updatedAt'] : null,
  };
}

function normalizeWindowPreferredSize(value: unknown): ShellWindowPreferredSize | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const preferredSize: ShellWindowPreferredSize = {
    minWidth: normalizedOptionalDimension(value['minWidth']),
    minHeight: normalizedOptionalDimension(value['minHeight']),
    maxWidth: normalizedOptionalDimension(value['maxWidth']),
    maxHeight: normalizedOptionalDimension(value['maxHeight']),
  };
  return Object.values(preferredSize).some((dimension) => dimension !== null) ? preferredSize : null;
}

function normalizedOptionalDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function actionRegistryFromManifest(manifest: AppManifest): ShellWindowAction[] {
  const registry = manifest.packageMetadata['actionRegistry'];
  if (!Array.isArray(registry)) {
    return [];
  }

  const grantedCapabilities = new Set(manifest.capabilities);
  return registry
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => {
      const capability = typeof item['capability'] === 'string' && item['capability'].trim()
        ? item['capability'].trim()
        : undefined;
      const shortcut = typeof item['shortcut'] === 'string' && item['shortcut'].trim()
        ? item['shortcut'].trim()
        : undefined;
      return {
        id: typeof item['id'] === 'string' && item['id'].trim() ? item['id'].trim() : 'generated-action',
        label: typeof item['label'] === 'string' && item['label'].trim() ? item['label'].trim() : 'Generated action',
        description: typeof item['description'] === 'string' && item['description'].trim()
          ? item['description'].trim()
          : 'Generated app registered this action through its manifest.',
        ...(capability ? { capability } : {}),
        ...(shortcut ? { shortcut } : {}),
      };
    })
    .filter((action) => !action.capability || grantedCapabilities.has(action.capability));
}
