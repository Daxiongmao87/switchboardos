import { createReadStream, existsSync, statSync } from 'fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { extname, join, normalize, relative, sep } from 'path';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { generateBootstrapScript, listBootstrapPresets } from './bootstrap-generator';
import type { AgentOperatorService } from './agent-operator-service';
import type { HostOperationRunner } from './host-operation-runner';
import type { MvpSqliteStore } from './mvp-sqlite-store';
import { PolicyDeniedError, type PolicyCapability, type PolicyService } from './policy-service';
import {
  RuntimeValidationError,
  validateBootstrapGenerateInput,
  validateHostOperationInput,
  validateOperatorProposeInput,
  validateSettingsUpdate,
  validateSshExecInput,
  validateSshFileListInput,
  validateSshFileStatInput,
  validateSshFileTransferInput,
  validateTerminalResizeInput,
  validateTerminalStartInput,
  validateTerminalStopInput,
  validateTerminalWriteInput,
} from './runtime-validation';
import type { SshService } from './ssh-service';
import type { TerminalSessionManager } from './terminal-session-manager';
import type {
  BootstrapGenerateInput,
  CreateAgentEndpointInput,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateCommandHistoryInput,
  CreateAuditEventInput,
  CreateHostInput,
  CreateWorkspaceProfileInput,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalStatusEvent,
  UpdateAgentEndpointInput,
  UpdateAppManifestInput,
  UpdateHostInput,
  UpdateWorkspaceProfileInput,
} from '../shared/mvp-models';

type TerminalChannel = 'terminal:output' | 'terminal:status' | 'terminal:exit';

type TerminalHostedEvent =
  | { channel: 'terminal:output'; payload: TerminalOutputEvent }
  | { channel: 'terminal:status'; payload: TerminalStatusEvent }
  | { channel: 'terminal:exit'; payload: TerminalExitEvent };

export interface HostedServerAppInfo {
  isPackaged: boolean;
  version: string;
  platform: NodeJS.Platform;
  electronVersion: string | undefined;
  chromeVersion: string | undefined;
  nodeVersion: string;
  hosted: true;
  hostedSecurity: {
    authRequired: boolean;
    lanEnabled: boolean;
    tlsGuidance: string;
  };
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

interface HostedServerOptions {
  host: string;
  port: number;
  staticRoot: string;
  store: MvpSqliteStore;
  terminalSessions: TerminalSessionManager;
  hostOperations: HostOperationRunner;
  sshService: SshService;
  agentOperator: AgentOperatorService;
  policyService: PolicyService;
  getAppInfo: () => HostedServerAppInfo;
  listWorkspaceFiles: (relativePath: string) => WorkspaceFileEntry[];
  createWorkspaceFolder: (targetRelativePath?: string) => WorkspaceFileEntry;
  createWorkspaceFile: (kind: WorkspaceFileEntry['kind'], targetRelativePath?: string) => WorkspaceFileEntry;
  renameWorkspaceFile: (relativePath: string, newName: string) => WorkspaceFileEntry;
  duplicateWorkspaceFile: (relativePath: string) => WorkspaceFileEntry;
  copyWorkspaceFile: (relativePath: string, targetRelativePath?: string) => WorkspaceFileEntry;
  moveWorkspaceFile: (relativePath: string, targetRelativePath?: string) => WorkspaceFileEntry;
  deleteWorkspaceFilePermanent: (relativePath: string) => boolean;
  auth: HostedAuthOptions;
}

interface HostedAuthOptions {
  required: boolean;
  accessToken: string | null;
  sessionTtlMs: number;
  lanEnabled: boolean;
}

type HostedCapability = PolicyCapability;

interface SseClient {
  id: number;
  channel: TerminalChannel | null;
  response: ServerResponse;
}

interface HostedSession {
  id: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  remoteAddress: string;
  userAgent: string;
}

interface LoginAttemptBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 17680;
const MAX_BODY_BYTES = 1024 * 1024;
const SESSION_COOKIE = 'sb_hosted_session';
const CSRF_COOKIE = 'sb_hosted_csrf';
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function hostedBindHostFromEnv(): string {
  const requested = process.env.SWITCHBOARDOS_HOSTED_HOST
    || process.env.SWITCHBOARDOS_HOSTED_BIND
    || DEFAULT_HOST;
  if (requested === '127.0.0.1' || requested === 'localhost' || requested === '::1') {
    return requested;
  }

  if (isTruthyEnv(process.env.SWITCHBOARDOS_HOSTED_LAN)
    || isTruthyEnv(process.env.SWITCHBOARDOS_HOSTED_ALLOW_LAN)
    || isTruthyEnv(process.env.SWITCHBOARDOS_HOSTED_LAN_ENABLED)) {
    return requested;
  }

  console.warn(`SwitchboardOS hosted mode requires SWITCHBOARDOS_HOSTED_LAN=1 for non-local bind address "${requested}"; using ${DEFAULT_HOST}.`);
  return DEFAULT_HOST;
}

export function hostedPortFromEnv(): number {
  const raw = process.env.SWITCHBOARDOS_HOSTED_PORT;
  if (!raw) {
    return DEFAULT_PORT;
  }

  const port = Number(raw);
  if (Number.isInteger(port) && port >= 0 && port <= 65535) {
    return port;
  }

  console.warn(`Invalid SWITCHBOARDOS_HOSTED_PORT "${raw}"; using ${DEFAULT_PORT}.`);
  return DEFAULT_PORT;
}

export class HostedServer {
  private server: Server | null = null;
  private readonly sseClients = new Map<number, SseClient>();
  private readonly sessions = new Map<string, HostedSession>();
  private readonly loginAttempts = new Map<string, LoginAttemptBucket>();
  private nextSseClientId = 1;

  constructor(private readonly options: HostedServerOptions) {}

  async start(): Promise<{ url: string }> {
    if (this.server) {
      return { url: this.url() };
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.options.port, this.options.host, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });

    return { url: this.url() };
  }

  async stop(): Promise<void> {
    this.close();
  }

  close(): void {
    for (const client of this.sseClients.values()) {
      client.response.end();
    }
    this.sseClients.clear();
    this.server?.close();
    this.server = null;
  }

  broadcastTerminalEvent(event: TerminalHostedEvent): void {
    const data = `event: ${event.channel}\ndata: ${JSON.stringify(event.payload)}\n\n`;
    for (const client of this.sseClients.values()) {
      if (client.channel && client.channel !== event.channel) {
        continue;
      }
      client.response.write(data);
    }
  }

  url(): string {
    const address = this.server?.address();
    const port = typeof address === 'object' && address ? address.port : this.options.port;
    const host = this.options.host.includes(':') ? `[${this.options.host}]` : this.options.host;
    return `http://${host}:${port}/`;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      this.applySecurityHeaders(response);

      if (!request.url) {
        this.sendJson(response, 400, { error: 'Missing request URL.' });
        return;
      }

      const url = new URL(request.url, this.url());
      if (!this.isClientAllowed(request)) {
        this.auditHostedAccess('hosted.request_denied', 'Denied non-local hosted request while LAN access is disabled.', request, {
          path: url.pathname,
          reason: 'lan_disabled',
        });
        this.sendJson(response, 403, { error: 'Hosted server only accepts local clients unless LAN access is explicitly enabled.' });
        return;
      }

      if (url.pathname.startsWith('/api/auth/')) {
        await this.handleAuthRequest(request, response, url);
        return;
      }

      const session = this.requireHostedSession(request, response, url);
      if (session === false) {
        return;
      }

      if (
        session
        && url.pathname.startsWith('/api/')
        && isStateChangingMethod(request.method ?? 'GET')
        && !this.isValidCsrfRequest(request, session)
      ) {
        this.auditHostedAccess('hosted.request_denied', 'Denied hosted request with invalid CSRF token.', request, {
          path: url.pathname,
          reason: 'csrf_denied',
        });
        this.sendJson(response, 403, { error: 'Missing or invalid CSRF token.' });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        await this.handleApiRequest(request, response, url, session);
        return;
      }

      this.handleStaticRequest(request, response, url);
    } catch (error) {
      if (error instanceof HttpError) {
        this.sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      if (error instanceof PolicyDeniedError || error instanceof RuntimeValidationError) {
        this.sendJson(response, error.statusCode, { error: error.message });
        return;
      }

      this.sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Hosted server request failed.',
      });
    }
  }

  private async handleApiRequest(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    session: HostedSession | null,
  ): Promise<void> {
    if (url.pathname === '/api/terminal/events' && request.method === 'GET') {
      this.requireHostedCapability(request, session, 'terminal:start', url.pathname);
      this.openTerminalEventStream(request, response, url);
      return;
    }

    const method = request.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD'
      ? {}
      : await this.readJsonBody(request);
    const segments = url.pathname.split('/').filter(Boolean).slice(1);
    const result = await this.routeApi(method, segments, body, request, session, url);
    this.sendJson(response, 200, result);
  }

  private async handleAuthRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const method = request.method ?? 'GET';
    if (url.pathname === '/api/auth/session' && method === 'GET') {
      const session = this.getSessionFromRequest(request);
      this.sendJson(response, 200, {
        loginRequired: this.options.auth.required,
        authenticated: Boolean(session),
        expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
      });
      return;
    }

    if (url.pathname === '/api/auth/login' && method === 'POST') {
      await this.handleAuthLogin(request, response);
      return;
    }

    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      this.handleAuthLogout(request, response);
      return;
    }

    throw new HttpError(404, `No hosted auth route for ${method} ${url.pathname}.`);
  }

  private async handleAuthLogin(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.options.auth.required) {
      this.sendJson(response, 200, { authenticated: true, loginRequired: false });
      return;
    }

    const remoteAddress = this.remoteAddress(request);
    if (!this.canAttemptLogin(remoteAddress)) {
      this.auditHostedAccess('hosted.login_rate_limited', 'Hosted login attempt was rate-limited.', request, {
        remoteAddress,
      });
      this.sendJson(response, 429, { error: 'Too many hosted login attempts. Try again later.' });
      return;
    }

    const token = await this.readLoginToken(request);
    if (!this.options.auth.accessToken || !tokensMatch(token, this.options.auth.accessToken)) {
      this.auditHostedAccess('hosted.login_failed', 'Hosted login failed.', request, {
        remoteAddress,
        reason: 'invalid_token',
      });
      this.sendJson(response, 401, { error: 'Hosted login failed.', loginRequired: true });
      return;
    }

    const now = Date.now();
    const session: HostedSession = {
      id: randomBytes(24).toString('base64url'),
      csrfToken: randomBytes(24).toString('base64url'),
      createdAt: now,
      expiresAt: now + this.options.auth.sessionTtlMs,
      lastSeenAt: now,
      remoteAddress,
      userAgent: String(request.headers['user-agent'] ?? ''),
    };
    this.sessions.set(session.id, session);
    this.setAuthCookies(response, session);
    this.auditHostedAccess('hosted.login_succeeded', 'Hosted login succeeded.', request, {
      sessionId: session.id,
      remoteAddress,
      lanEnabled: this.options.auth.lanEnabled,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });

    if (acceptsHtml(request)) {
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }

    this.sendJson(response, 200, {
      authenticated: true,
      loginRequired: true,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  }

  private handleAuthLogout(request: IncomingMessage, response: ServerResponse): void {
    const session = this.getSessionFromRequest(request);
    if (session) {
      this.sessions.delete(session.id);
      this.auditHostedAccess('hosted.logout', 'Hosted session logged out.', request, {
        sessionId: session.id,
      });
    }
    this.clearAuthCookies(response);
    if (acceptsHtml(request)) {
      response.writeHead(303, { Location: '/' });
      response.end();
      return;
    }
    this.sendJson(response, 200, { authenticated: false, loginRequired: this.options.auth.required });
  }

  private requireHostedSession(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): HostedSession | null | false {
    if (!this.options.auth.required) {
      return null;
    }

    const session = this.getSessionFromRequest(request);
    if (session) {
      return session;
    }

    if (url.pathname.startsWith('/api/')) {
      this.auditHostedAccess('hosted.request_denied', 'Denied unauthenticated hosted API request.', request, {
        path: url.pathname,
        reason: 'login_required',
      });
      this.sendJson(response, 401, {
        error: 'Hosted login required.',
        loginRequired: true,
      });
      return false;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      this.sendLoginPage(response);
      return false;
    }

    this.sendJson(response, 401, {
      error: 'Hosted login required.',
      loginRequired: true,
    });
    return false;
  }

  private async routeApi(
    method: string,
    segments: string[],
    body: unknown,
    request: IncomingMessage,
    session: HostedSession | null,
    url: URL,
  ): Promise<unknown> {
    const [resource, actionOrId, subAction] = segments;

    if (resource === 'app' && actionOrId === 'info' && method === 'GET') {
      return this.options.getAppInfo();
    }

    if (resource === 'hosts') {
      if (segments.length === 1 && method === 'GET') {
        return this.options.store.listHosts();
      }
      if (segments.length === 1 && method === 'POST') {
        return this.options.store.createHost(asRecord(body) as CreateHostInput);
      }
      if (actionOrId && subAction === undefined && method === 'GET') {
        return this.options.store.getHost(decodeURIComponent(actionOrId));
      }
      if (actionOrId && subAction === undefined && method === 'PATCH') {
        return this.options.store.updateHost(decodeURIComponent(actionOrId), asRecord(body) as UpdateHostInput);
      }
      if (actionOrId && subAction === undefined && method === 'DELETE') {
        return this.options.store.deleteHost(decodeURIComponent(actionOrId));
      }
      if (actionOrId && subAction === 'test' && method === 'POST') {
        return this.options.store.testConnection(decodeURIComponent(actionOrId));
      }
    }

    if (resource === 'settings') {
      if (method === 'GET') {
        return this.options.store.getSettings();
      }
      if (method === 'PATCH') {
        this.requireHostedCapability(request, session, 'settings:update', url.pathname);
        return this.options.store.updateSettings(validateSettingsUpdate(body));
      }
    }

    if (resource === 'audit') {
      if (method === 'GET') {
        return this.options.store.listAuditEvents();
      }
      if (method === 'POST') {
        return this.options.store.logAuditEvent(asRecord(body) as unknown as CreateAuditEventInput);
      }
    }

    if (resource === 'workspace') {
      return this.routeWorkspaceApi(method, segments, body);
    }

    if (resource === 'workspace-files') {
      return this.routeWorkspaceFileApi(method, segments, body, url);
    }

    if (resource === 'command-history') {
      return this.routeCommandHistoryApi(method, actionOrId, body);
    }

    if (resource === 'app-manifests') {
      if (method !== 'GET') {
        this.requireHostedCapability(request, session, 'settings:update', url.pathname);
      }
      return this.routeAppManifestApi(method, actionOrId, body);
    }

    if (resource === 'app-permissions') {
      if (method !== 'GET') {
        this.requireHostedCapability(request, session, 'settings:update', url.pathname);
      }
      return this.routeAppPermissionApi(method, actionOrId, body, url);
    }

    if (resource === 'agent-endpoints') {
      if (method !== 'GET') {
        this.requireHostedCapability(request, session, 'settings:update', url.pathname);
      }
      return this.routeAgentEndpointApi(method, actionOrId, body);
    }

    if (resource === 'agent') {
      return this.routeAgentApi(method, actionOrId, body);
    }

    if (resource === 'host-operations') {
      this.requireHostedCapability(request, session, 'host-operation:run', url.pathname, bodyHostId(body));
      return this.routeHostOperationsApi(method, actionOrId, body);
    }

    if (resource === 'ssh') {
      this.requireHostedCapability(request, session, 'ssh:exec', url.pathname, bodyHostId(body));
      return this.routeSshApi(method, actionOrId, body);
    }

    if (resource === 'bootstrap') {
      if (actionOrId === 'presets' && method === 'GET') {
        return listBootstrapPresets();
      }
      if (actionOrId === 'generate' && method === 'POST') {
        this.requireHostedCapability(request, session, 'bootstrap:generate', url.pathname, bodyHostId(body));
        return this.generateBootstrap(validateBootstrapGenerateInput(body));
      }
    }

    if (resource === 'terminal') {
      const capability = terminalCapabilityForAction(actionOrId);
      if (capability) {
        this.requireHostedCapability(
          request,
          session,
          capability,
          url.pathname,
          bodyHostId(body),
          bodySessionId(body),
        );
      }
      return this.routeTerminalApi(method, actionOrId, body);
    }

    throw new HttpError(404, `No hosted API route for ${method} /api/${segments.join('/')}.`);
  }

  private routeWorkspaceApi(method: string, segments: string[], body: unknown): unknown {
    const [, collection, idOrAction] = segments;
    if (collection === 'profiles') {
      if (segments.length === 2 && method === 'GET') {
        return this.options.store.listWorkspaceProfiles();
      }
      if (segments.length === 2 && method === 'POST') {
        return this.options.store.createWorkspaceProfile(asRecord(body) as CreateWorkspaceProfileInput);
      }
      if (idOrAction && method === 'GET') {
        return this.options.store.getWorkspaceProfile(decodeURIComponent(idOrAction));
      }
      if (idOrAction && method === 'PATCH') {
        return this.options.store.updateWorkspaceProfile(
          decodeURIComponent(idOrAction),
          asRecord(body) as UpdateWorkspaceProfileInput,
        );
      }
      if (idOrAction && method === 'DELETE') {
        return this.options.store.deleteWorkspaceProfile(decodeURIComponent(idOrAction));
      }
    }

    if (collection === 'active-profile-id') {
      if (method === 'GET') {
        return this.options.store.getActiveWorkspaceProfileId();
      }
      if (method === 'PUT' || method === 'POST') {
        const profileId = stringField(body, 'profileId');
        this.options.store.setActiveWorkspaceProfileId(profileId);
        return profileId;
      }
    }

    throw new HttpError(404, `No hosted workspace route for ${method} /api/${segments.join('/')}.`);
  }

  private routeWorkspaceFileApi(
    method: string,
    segments: string[],
    body: unknown,
    url: URL,
  ): unknown {
    const [, action] = segments;

    if (!action && method === 'GET') {
      return this.options.listWorkspaceFiles(url.searchParams.get('path') ?? '');
    }

    if (action === 'folder' && method === 'POST') {
      const targetRelativePath = optionalStringField(body, 'targetPath');
      return this.options.createWorkspaceFolder(targetRelativePath);
    }

    if (action === 'file' && method === 'POST') {
      const record = asRecord(body);
      const requestedKind = record.kind;
      const kind = requestedKind === 'applet' || requestedKind === 'scriptlet' || requestedKind === 'note'
        ? requestedKind
        : 'note';
      const targetRelativePath = optionalStringField(record, 'targetPath');
      return this.options.createWorkspaceFile(kind, targetRelativePath);
    }

    if (action === 'duplicate' && method === 'POST') {
      const sourcePath = stringField(asRecord(body), 'path');
      return this.options.duplicateWorkspaceFile(sourcePath);
    }

    if (action === 'copy' && method === 'POST') {
      const record = asRecord(body);
      const sourcePath = stringField(record, 'path');
      const targetRelativePath = typeof record.targetPath === 'string'
        ? record.targetPath
        : '';
      return this.options.copyWorkspaceFile(sourcePath, targetRelativePath);
    }

    if (action === 'move' && method === 'POST') {
      const record = asRecord(body);
      const sourcePath = stringField(record, 'path');
      const targetRelativePath = typeof record.targetPath === 'string'
        ? record.targetPath
        : '';
      return this.options.moveWorkspaceFile(sourcePath, targetRelativePath);
    }

    if (!action && method === 'PATCH') {
      const record = asRecord(body);
      const renamePath = stringField(record, 'path');
      const renamed = typeof record.newName === 'string'
        ? record.newName
        : typeof record.name === 'string'
          ? record.name
          : '';
      if (!renamed) {
        throw new HttpError(400, 'Missing string field "newName" or "name".');
      }
      return this.options.renameWorkspaceFile(renamePath, renamed);
    }

    if (!action && method === 'DELETE') {
      const relativePath = url.searchParams.get('path');
      if (!relativePath) {
        throw new HttpError(400, 'Missing required query parameter "path".');
      }
      return this.options.deleteWorkspaceFilePermanent(relativePath);
    }

    throw new HttpError(404, `No hosted workspace-files route for ${method} /api/${segments.join('/')}.`);
  }

  private routeCommandHistoryApi(method: string, action: string | undefined, body: unknown): unknown {
    if (!action && method === 'GET') {
      return this.options.store.listCommandHistory();
    }
    if (!action && method === 'POST') {
      return this.options.store.createCommandHistoryEntry(asRecord(body) as CreateCommandHistoryInput);
    }
    if (action && method === 'DELETE') {
      return this.options.store.deleteCommandHistoryEntry(decodeURIComponent(action));
    }

    throw new HttpError(404, `No hosted command history route for ${method}.`);
  }

  private routeAppManifestApi(method: string, action: string | undefined, body: unknown): unknown {
    if (!action && method === 'GET') {
      return this.options.store.listAppManifests();
    }
    if (!action && method === 'POST') {
      return this.options.store.createAppManifest(asRecord(body) as CreateAppManifestInput);
    }
    if (action && method === 'GET') {
      return this.options.store.getAppManifest(decodeURIComponent(action));
    }
    if (action && method === 'PATCH') {
      return this.options.store.updateAppManifest(decodeURIComponent(action), asRecord(body) as UpdateAppManifestInput);
    }
    if (action && method === 'DELETE') {
      return this.options.store.deleteAppManifest(decodeURIComponent(action));
    }

    throw new HttpError(404, `No hosted app manifest route for ${method}.`);
  }

  private routeAppPermissionApi(method: string, action: string | undefined, body: unknown, url: URL): unknown {
    if (!action && method === 'GET') {
      return this.options.store.listAppPermissions(url.searchParams.get('appId') ?? undefined);
    }
    if (!action && method === 'POST') {
      return this.options.store.createAppPermission(asRecord(body) as CreateAppPermissionInput);
    }
    if (action && method === 'DELETE') {
      return this.options.store.deleteAppPermission(decodeURIComponent(action));
    }

    throw new HttpError(404, `No hosted app permission route for ${method}.`);
  }

  private routeAgentEndpointApi(method: string, action: string | undefined, body: unknown): unknown {
    if (!action && method === 'GET') {
      return this.options.store.listAgentEndpoints();
    }
    if (!action && method === 'POST') {
      return this.options.store.createAgentEndpoint(asRecord(body) as CreateAgentEndpointInput);
    }
    if (action && method === 'GET') {
      return this.options.store.getAgentEndpoint(decodeURIComponent(action));
    }
    if (action && method === 'PATCH') {
      return this.options.store.updateAgentEndpoint(decodeURIComponent(action), asRecord(body) as UpdateAgentEndpointInput);
    }
    if (action && method === 'DELETE') {
      return this.options.store.deleteAgentEndpoint(decodeURIComponent(action));
    }

    throw new HttpError(404, `No hosted agent endpoint route for ${method}.`);
  }

  private routeAgentApi(method: string, action: string | undefined, body: unknown): Promise<unknown> {
    if (action === 'propose' && method === 'POST') {
      return this.options.agentOperator.propose(validateOperatorProposeInput(body));
    }

    throw new HttpError(404, `No hosted agent route for ${method}.`);
  }

  private routeHostOperationsApi(method: string, action: string | undefined, body: unknown): Promise<unknown> {
    if (action === 'run' && method === 'POST') {
      return this.options.hostOperations.run(validateHostOperationInput(body));
    }

    throw new HttpError(404, `No hosted host operation route for ${method}.`);
  }

  private routeSshApi(method: string, action: string | undefined, body: unknown): Promise<unknown> {
    if (action === 'exec' && method === 'POST') {
      return this.options.sshService.exec(validateSshExecInput(body));
    }

    throw new HttpError(404, `No hosted SSH route for ${method}.`);
  }

  private routeTerminalApi(method: string, action: string | undefined, body: unknown): unknown {
    if (method !== 'POST') {
      throw new HttpError(405, 'Terminal hosted API only accepts POST commands.');
    }

    if (action === 'start') {
      return this.options.terminalSessions.start(validateTerminalStartInput(asRecord(body).hostId));
    }
    if (action === 'write') {
      const validated = validateTerminalWriteInput(asRecord(body).sessionId, asRecord(body).input);
      return this.options.terminalSessions.write(validated.sessionId, validated.input);
    }
    if (action === 'resize') {
      const record = asRecord(body);
      const validated = validateTerminalResizeInput(record.sessionId, record.cols, record.rows);
      return this.options.terminalSessions.resize(
        validated.sessionId,
        validated.cols,
        validated.rows,
      );
    }
    if (action === 'stop') {
      return this.options.terminalSessions.stop(validateTerminalStopInput(asRecord(body).sessionId));
    }

    throw new HttpError(404, `No hosted terminal action "${action ?? ''}".`);
  }

  private openTerminalEventStream(request: IncomingMessage, response: ServerResponse, url: URL): void {
    const channelParam = url.searchParams.get('channel');
    const channel = isTerminalChannel(channelParam) ? channelParam : null;
    const id = this.nextSseClientId++;

    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });
    response.write(': connected\n\n');

    this.sseClients.set(id, { id, channel, response });
    request.on('close', () => {
      this.sseClients.delete(id);
    });
  }

  private handleStaticRequest(request: IncomingMessage, response: ServerResponse, url: URL): void {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      this.sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    const filePath = this.resolveStaticFilePath(url.pathname);
    if (!filePath) {
      this.sendJson(response, 403, { error: 'Forbidden path.' });
      return;
    }

    const existingPath = existsSync(filePath) && statSync(filePath).isFile()
      ? filePath
      : join(this.options.staticRoot, 'index.html');
    if (!existsSync(existingPath)) {
      this.sendJson(response, 404, { error: 'Built renderer index.html was not found. Run npm run build first.' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(existingPath)] ?? 'application/octet-stream',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(existingPath).pipe(response);
  }

  private resolveStaticFilePath(pathname: string): string | null {
    const decoded = decodeURIComponent(pathname);
    const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
    const fullPath = normalize(join(this.options.staticRoot, relativePath));
    const rel = relative(this.options.staticRoot, fullPath);
    if (rel.startsWith('..') || rel.includes(`..${sep}`) || fullPath === this.options.staticRoot) {
      return null;
    }
    return fullPath;
  }

  private async readJsonBody(request: IncomingMessage): Promise<unknown> {
    const text = (await this.readBodyText(request)).trim();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpError(400, 'Invalid JSON request body.');
    }
  }

  private async readBodyText(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        throw new HttpError(413, 'Request body is too large.');
      }
      chunks.push(buffer);
    }

    if (chunks.length === 0) {
      return '';
    }

    return Buffer.concat(chunks).toString('utf8');
  }

  private async readLoginToken(request: IncomingMessage): Promise<string> {
    const text = await this.readBodyText(request);
    const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return new URLSearchParams(text).get('token') ?? '';
    }

    if (!text.trim()) {
      return '';
    }

    try {
      const parsed = JSON.parse(text) as unknown;
      const token = asRecord(parsed).token;
      return typeof token === 'string' ? token : '';
    } catch {
      return '';
    }
  }

  private canAttemptLogin(remoteAddress: string): boolean {
    const now = Date.now();
    const bucket = this.loginAttempts.get(remoteAddress);
    if (!bucket || bucket.resetAt <= now) {
      this.loginAttempts.set(remoteAddress, {
        count: 1,
        resetAt: now + LOGIN_ATTEMPT_WINDOW_MS,
      });
      return true;
    }

    bucket.count += 1;
    return bucket.count <= LOGIN_ATTEMPT_LIMIT;
  }

  private sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(`${JSON.stringify(data)}\n`);
  }

  private sendLoginPage(response: ServerResponse): void {
    response.setHeader('Cache-Control', 'no-store');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SwitchboardOS Hosted Login</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #151922; color: #e8edf7; }
    main { width: min(420px, calc(100vw - 32px)); border: 1px solid #313849; border-radius: 8px; padding: 24px; background: #1d2330; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0 0 16px; color: #aeb8ca; line-height: 1.5; }
    .warning { border: 1px solid #8a6d1d; border-radius: 6px; padding: 10px; background: #2a230f; color: #f7dda1; font-size: 13px; }
    label { display: grid; gap: 8px; margin-bottom: 16px; font-size: 13px; color: #c9d2e3; }
    input { border: 1px solid #3a4356; border-radius: 6px; padding: 10px 12px; background: #121722; color: #f5f7fb; font: inherit; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: #4f7cff; color: white; font: inherit; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>SwitchboardOS Hosted Login</h1>
    <p>This browser session needs the hosted access token printed by the SwitchboardOS backend or provided through SWITCHBOARDOS_HOSTED_AUTH_TOKEN.</p>
    <p class="warning">For non-local access, run this behind TLS or a trusted reverse proxy. Browser clients remain untrusted and state-changing APIs require a session plus CSRF token.</p>
    <form method="post" action="/api/auth/login">
      <label>
        Access token
        <input name="token" type="password" autocomplete="current-password" required autofocus>
      </label>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`);
  }

  private generateBootstrap(input: BootstrapGenerateInput) {
    const hostId = input.hostId ?? null;
    const host = hostId ? this.options.store.getHost(hostId) : null;
    const result = generateBootstrapScript(input, host);
    this.options.store.logAuditEvent({
      type: 'bootstrap.generated',
      entityType: host ? 'host' : 'bootstrap',
      entityId: host?.id ?? null,
      message: `Generated ${result.preset.name} bootstrap script${host ? ` for ${host.name}` : ''}.`,
      metadata: {
        presetId: result.preset.id,
        hostId: host?.id ?? null,
        installPackages: input.options?.installPackages ?? true,
        includeDockerCheck: input.options?.includeDockerCheck ?? false,
        executesRemotely: false,
      },
    });
    return result;
  }

  private getSessionFromRequest(request: IncomingMessage): HostedSession | null {
    if (!this.options.auth.required) {
      return null;
    }

    const sessionId = this.cookieValue(request, SESSION_COOKIE);
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    const now = Date.now();
    if (!session || session.expiresAt <= now) {
      if (session) {
        this.sessions.delete(session.id);
      }
      return null;
    }

    session.lastSeenAt = now;
    session.expiresAt = now + this.options.auth.sessionTtlMs;
    return session;
  }

  private isValidCsrfRequest(request: IncomingMessage, session: HostedSession): boolean {
    const header = request.headers['x-switchboardos-csrf'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    const cookieValue = this.cookieValue(request, CSRF_COOKIE);
    return typeof headerValue === 'string'
      && headerValue === session.csrfToken
      && cookieValue === session.csrfToken;
  }

  private setAuthCookies(response: ServerResponse, session: HostedSession): void {
    const maxAgeSeconds = Math.max(1, Math.floor(this.options.auth.sessionTtlMs / 1000));
    response.setHeader('Set-Cookie', [
      `${SESSION_COOKIE}=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`,
      `${CSRF_COOKIE}=${encodeURIComponent(session.csrfToken)}; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`,
    ]);
  }

  private clearAuthCookies(response: ServerResponse): void {
    response.setHeader('Set-Cookie', [
      `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      `${CSRF_COOKIE}=; SameSite=Strict; Path=/; Max-Age=0`,
    ]);
  }

  private cookieValue(request: IncomingMessage, name: string): string | null {
    const rawCookie = request.headers.cookie;
    if (!rawCookie) {
      return null;
    }

    for (const part of rawCookie.split(';')) {
      const [rawName, ...rawValue] = part.trim().split('=');
      if (rawName === name) {
        return decodeURIComponent(rawValue.join('='));
      }
    }
    return null;
  }

  private auditHostedAccess(
    type: string,
    message: string,
    request: IncomingMessage,
    metadata: Record<string, unknown>,
  ): void {
    try {
      this.options.store.logAuditEvent({
        type,
        entityType: 'hosted-web',
        entityId: null,
        message,
        metadata: {
          ...metadata,
          remoteAddress: this.remoteAddress(request),
          userAgent: String(request.headers['user-agent'] ?? ''),
          lanEnabled: this.options.auth.lanEnabled,
        },
      });
    } catch (error) {
      console.error('Unable to write hosted access audit event.', error);
    }
  }

  private applySecurityHeaders(response: ServerResponse): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
  }

  private requireHostedCapability(
    request: IncomingMessage,
    session: HostedSession | null,
    capability: HostedCapability,
    route: string,
    hostId: string | null = null,
    sessionId: string | null = null,
  ): void {
    if (this.options.auth.required && !session) {
      throw new HttpError(401, 'Hosted login required.');
    }

    this.options.policyService.assertAllowed(capability, {
      caller: 'hosted',
      route,
      action: capability,
      hostId,
      sessionId: sessionId ?? session?.id ?? null,
    });
  }

  private isClientAllowed(request: IncomingMessage): boolean {
    return this.options.auth.lanEnabled || this.isLocalPeer(request);
  }

  private isLocalPeer(request: IncomingMessage): boolean {
    const address = request.socket.remoteAddress;
    return !address || address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  }

  private remoteAddress(request: IncomingMessage): string {
    return request.socket.remoteAddress ?? 'unknown';
  }
}

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(value: unknown, field: string): string {
  const record = asRecord(value);
  const fieldValue = record[field];
  if (typeof fieldValue !== 'string') {
    throw new HttpError(400, `Missing string field "${field}".`);
  }
  return fieldValue;
}

function optionalStringField(value: unknown, field: string): string {
  const fieldValue = asRecord(value)[field];
  return typeof fieldValue === 'string' ? fieldValue : '';
}

function bodyHostId(value: unknown): string | null {
  const hostId = asRecord(value).hostId;
  return typeof hostId === 'string' && hostId.trim() ? hostId.trim() : null;
}

function bodySessionId(value: unknown): string | null {
  const sessionId = asRecord(value).sessionId;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
}

function terminalCapabilityForAction(action: string | undefined): PolicyCapability | null {
  if (action === 'start') {
    return 'terminal:start';
  }
  if (action === 'write') {
    return 'terminal:write';
  }
  if (action === 'resize') {
    return 'terminal:resize';
  }
  if (action === 'stop') {
    return 'terminal:stop';
  }
  return null;
}

function tokensMatch(candidate: string, expected: string): boolean {
  const left = createHash('sha256').update(candidate).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

function acceptsHtml(request: IncomingMessage): boolean {
  return String(request.headers.accept ?? '').includes('text/html')
    || String(request.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded');
}

function isStateChangingMethod(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function isTruthyEnv(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

function isTerminalChannel(value: string | null): value is TerminalChannel {
  return value === 'terminal:output' || value === 'terminal:status' || value === 'terminal:exit';
}
