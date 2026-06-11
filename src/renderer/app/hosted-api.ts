import type {
  AuditEvent,
  AgentEndpoint,
  AppManifest,
  AppPermission,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPreset,
  CommandHistoryEntry,
  ConnectionTestResult,
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
import type { AppInfo } from './switchboard-api';

type TerminalEventChannel = 'terminal:output' | 'terminal:status' | 'terminal:exit';

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

interface WorkspaceFileEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  detail: string;
  path: string;
  updatedAt: string;
  size: number;
}

interface WorkspaceTrashEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  originalPath: string;
  trashPath: string;
  deletedAt: string;
  updatedAt: string;
  size: number;
}

interface HostedSwitchboardApi {
  app: {
    getInfo: () => Promise<AppInfo & { hosted?: boolean }>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    getBounds: () => Promise<WindowBounds | null>;
    restoreBounds: (bounds: WindowBounds) => Promise<void>;
  };
  dialog: {
    openFile: (_options?: Record<string, unknown>) => Promise<DialogResult>;
    openDirectory: (_options?: Record<string, unknown>) => Promise<DialogResult>;
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
  secret: {
    store: (_key: string, _value: string) => Promise<boolean>;
    retrieve: (_key: string) => Promise<string | null>;
    remove: (_key: string) => Promise<boolean>;
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

interface HostedRequestOptions {
  method?: string;
  body?: unknown;
}

export function installHostedApiFallback(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const target = window as unknown as { sb?: HostedSwitchboardApi };
  if (target.sb || !isHostedBrowserContext()) {
    return;
  }

  target.sb = createHostedApi();
}

function isHostedBrowserContext(): boolean {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

function createHostedApi(): HostedSwitchboardApi {
  return {
    app: {
      getInfo: () => request('/api/app/info'),
    },
    window: {
      minimize: () => Promise.resolve(),
      maximize: () => Promise.resolve(),
      close: () => Promise.resolve(),
      getBounds: () => Promise.resolve(null),
      restoreBounds: () => Promise.resolve(),
    },
    dialog: {
      openFile: () => Promise.resolve({ filePaths: [], canceled: true }),
      openDirectory: () => Promise.resolve({ filePaths: [], canceled: true }),
    },
    host: {
      list: () => request('/api/hosts'),
      get: (id: string) => request(`/api/hosts/${encodeURIComponent(id)}`),
      create: (data: CreateHostInput) => request('/api/hosts', { method: 'POST', body: data }),
      update: (id: string, data: UpdateHostInput) =>
        request(`/api/hosts/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
      remove: (id: string) => request(`/api/hosts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      testConnection: (id: string) => request(`/api/hosts/${encodeURIComponent(id)}/test`, { method: 'POST' }),
    },
    settings: {
      get: () => request('/api/settings'),
      update: (update: MvpSettingsUpdate) => request('/api/settings', { method: 'PATCH', body: update }),
    },
    secret: {
      store: () => Promise.resolve(false),
      retrieve: () => Promise.resolve(null),
      remove: () => Promise.resolve(false),
    },
    audit: {
      list: () => request('/api/audit'),
      log: (event: CreateAuditEventInput) => request('/api/audit', { method: 'POST', body: event }),
    },
    terminal: {
      start: (hostId: string) => request('/api/terminal/start', { method: 'POST', body: { hostId } }),
      write: (sessionId: string, input: string) =>
        request('/api/terminal/write', { method: 'POST', body: { sessionId, input } }),
      resize: (sessionId: string, cols: number, rows: number) =>
        request('/api/terminal/resize', { method: 'POST', body: { sessionId, cols, rows } }),
      stop: (sessionId: string) => request('/api/terminal/stop', { method: 'POST', body: { sessionId } }),
      onOutput: (callback: (event: TerminalOutputEvent) => void) =>
        subscribeTerminalEvent('terminal:output', callback),
      onStatus: (callback: (event: TerminalStatusEvent) => void) =>
        subscribeTerminalEvent('terminal:status', callback),
      onExit: (callback: (event: TerminalExitEvent) => void) =>
        subscribeTerminalEvent('terminal:exit', callback),
    },
    workspace: {
      listProfiles: () => request('/api/workspace/profiles'),
      getProfile: (profileId: string) => request(`/api/workspace/profiles/${encodeURIComponent(profileId)}`),
      createProfile: (input: CreateWorkspaceProfileInput) =>
        request('/api/workspace/profiles', { method: 'POST', body: input }),
      updateProfile: (profileId: string, input: UpdateWorkspaceProfileInput) =>
        request(`/api/workspace/profiles/${encodeURIComponent(profileId)}`, { method: 'PATCH', body: input }),
      deleteProfile: (profileId: string) =>
        request(`/api/workspace/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' }),
      getActiveProfileId: () => request('/api/workspace/active-profile-id'),
      setActiveProfileId: (profileId: string) =>
        request('/api/workspace/active-profile-id', { method: 'PUT', body: { profileId } }),
    },
    workspaceFile: {
      list: (relativePath = '') => {
        const query = relativePath
          ? `?path=${encodeURIComponent(relativePath)}`
          : '';
        return request(`/api/workspace-files${query}`);
      },
      createFolder: (targetPath = '') =>
        request('/api/workspace-files/folder', { method: 'POST', body: { targetPath } }),
      createFile: (kind: 'applet' | 'scriptlet' | 'note', targetPath = '') =>
        request('/api/workspace-files/file', { method: 'POST', body: { kind, targetPath } }),
      rename: (path: string, newName: string) =>
        request('/api/workspace-files', { method: 'PATCH', body: { path, newName } }),
      duplicate: (path: string) =>
        request('/api/workspace-files/duplicate', { method: 'POST', body: { path } }),
      copy: (path: string, targetPath = '') =>
        request('/api/workspace-files/copy', { method: 'POST', body: { path, targetPath } }),
      move: (path: string, targetPath = '') =>
        request('/api/workspace-files/move', { method: 'POST', body: { path, targetPath } }),
      deletePermanent: (path: string) =>
        request<boolean>(`/api/workspace-files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
      listTrash: () => request('/api/workspace-files/trash'),
      moveToTrash: (path: string) =>
        request('/api/workspace-files/trash', { method: 'POST', body: { path } }),
      restoreTrashItem: (id: string) =>
        request('/api/workspace-files/trash/restore', { method: 'POST', body: { id } }),
      deleteTrashItemPermanent: (id: string) =>
        request<boolean>(`/api/workspace-files/trash/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      emptyTrash: () =>
        request<boolean>('/api/workspace-files/trash', { method: 'DELETE' }),
    },
    bootstrap: {
      presets: () => request('/api/bootstrap/presets'),
      generate: (input: BootstrapGenerateInput) =>
        request('/api/bootstrap/generate', { method: 'POST', body: input }),
    },
    commandHistory: {
      list: () => request('/api/command-history'),
      create: (input: CreateCommandHistoryInput) =>
        request('/api/command-history', { method: 'POST', body: input }),
      remove: (id: string) =>
        request(`/api/command-history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    hostOperations: {
      run: (input: HostOperationInput) =>
        request('/api/host-operations/run', { method: 'POST', body: input }),
    },
    appManifest: {
      list: () => request('/api/app-manifests'),
      get: (id: string) => request(`/api/app-manifests/${encodeURIComponent(id)}`),
      create: (input: CreateAppManifestInput) =>
        request('/api/app-manifests', { method: 'POST', body: input }),
      update: (id: string, input: UpdateAppManifestInput) =>
        request(`/api/app-manifests/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
      remove: (id: string) =>
        request(`/api/app-manifests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    appPermission: {
      list: (appId?: string) =>
        request(appId ? `/api/app-permissions?appId=${encodeURIComponent(appId)}` : '/api/app-permissions'),
      create: (input: CreateAppPermissionInput) =>
        request('/api/app-permissions', { method: 'POST', body: input }),
      remove: (id: string) =>
        request(`/api/app-permissions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    agentEndpoint: {
      list: () => request('/api/agent-endpoints'),
      get: (id: string) => request(`/api/agent-endpoints/${encodeURIComponent(id)}`),
      create: (input: CreateAgentEndpointInput) =>
        request('/api/agent-endpoints', { method: 'POST', body: input }),
      update: (id: string, input: UpdateAgentEndpointInput) =>
        request(`/api/agent-endpoints/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
      remove: (id: string) =>
        request(`/api/agent-endpoints/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    },
    agent: {
      propose: (input: OperatorProposeInput) =>
        request('/api/agent/propose', { method: 'POST', body: input }),
    },
    ssh: {
      exec: (input: SshExecInput) =>
        request('/api/ssh/exec', { method: 'POST', body: input }),
    },
  };
}

async function request<T>(path: string, options: HostedRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  if (isStateChangingRequest(init.method ?? 'GET')) {
    const csrfToken = cookieValue('sb_hosted_csrf');
    if (csrfToken) {
      headers['X-SwitchboardOS-CSRF'] = csrfToken;
    }
  }

  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // Fall through to HTTP status text.
  }
  return `Hosted API request failed with HTTP ${response.status}.`;
}

function cookieValue(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

function isStateChangingRequest(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function subscribeTerminalEvent<T>(
  channel: TerminalEventChannel,
  callback: (event: T) => void,
): () => void {
  return subscribeHostedEvent(channel, callback as (...args: unknown[]) => void);
}

function subscribeHostedEvent(channel: string, callback: (...args: unknown[]) => void): () => void {
  const source = new EventSource(`/api/terminal/events?channel=${encodeURIComponent(channel)}`);
  const listener = (event: Event) => {
    try {
      callback(JSON.parse((event as MessageEvent<string>).data) as unknown);
    } catch (error) {
      console.error('Unable to parse hosted event payload.', error);
    }
  };

  source.addEventListener(channel, listener);
  return () => {
    source.removeEventListener(channel, listener);
    source.close();
  };
}
