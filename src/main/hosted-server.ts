import { createReadStream, existsSync, statSync } from 'fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { extname, join, normalize, relative, sep } from 'path';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { generateBootstrapScript, listBootstrapPresets } from './bootstrap-generator';
import type { AgentOperatorService } from './agent-operator-service';
import type { HostOperationRunner } from './host-operation-runner';
import type { MvpSqliteStore } from './mvp-sqlite-store';
import { AppCapabilityDeniedError, PolicyDeniedError, type PolicyCapability, type PolicyService } from './policy-service';
import {
  RuntimeValidationError,
  validateAgentEndpointCreateInput,
  validateAgentEndpointIdInput,
  validateAgentEndpointUpdateInput,
  validateAppManifestCreateInput,
  validateAppManifestIdInput,
  validateAppManifestUpdateInput,
  validateAppPermissionCreateInput,
  validateAppPermissionIdInput,
  validateAppPermissionListInput,
  validateAppScopedStorageDeleteInput,
  validateAppScopedStorageGetInput,
  validateAppScopedStorageSetInput,
  validateAuditEventInput,
  validateGeneratedAppHostCapabilitiesInput,
  validateGeneratedAppHostGetInput,
  validateGeneratedAppHostListInput,
  validateGeneratedAppHostStatusInput,
  validateGeneratedAppHostTestConnectionInput,
  validateBootstrapGenerateInput,
  validateCommandHistoryCreateInput,
  validateCommandHistoryEntryIdInput,
  validateHostCreateInput,
  validateHostIdInput,
  validateHostUpdateInput,
  validateHostOperationInput,
  validateOperatorActionExecuteInput,
  validateOperatorProposeInput,
  validateSettingsUpdate,
  validateSshExecInput,
  validateSshFileDeleteInput,
  validateSshFileListInput,
  validateSshFileStatInput,
  validateSshFileTransferInput,
  validateTerminalResizeInput,
  validateTerminalStartInput,
  validateTerminalStopInput,
  validateTerminalWriteInput,
  validateNoInput,
  validateWorkspaceFileCopyMoveInput,
  validateWorkspaceFileCreateFileInput,
  validateWorkspaceFileListInput,
  validateWorkspaceFilePathInput,
  validateWorkspaceFileRenameInput,
  validateWorkspaceFileTargetPathInput,
  validateWorkspaceActiveProfileInput,
  validateWorkspaceProfileCreateInput,
  validateWorkspaceProfileIdInput,
  validateWorkspaceProfileUpdateInput,
  validateWorkspaceTrashIdInput,
} from './runtime-validation';
import { getHostRouteContract, runHostRouteContract } from './route-access-contracts';
import type { SshService } from './ssh-service';
import type { TerminalSessionManager } from './terminal-session-manager';
import type {
  AgentEndpoint,
  AppManifest,
  AppPermission,
  AppScopedStorageDeleteResult,
  AppScopedStorageGetInput,
  AppScopedStorageGetResult,
  AppScopedStorageRecord,
  GeneratedAppHostCapabilitiesResult,
  GeneratedAppHostGetResult,
  GeneratedAppHostListInput,
  GeneratedAppHostListResult,
  GeneratedAppHostSdkResult,
  GeneratedAppHostStatusResult,
  GeneratedAppHostSummary,
  GeneratedAppHostTargetInput,
  GeneratedAppHostTestConnectionResult,
  HostRecord,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  CommandHistoryEntry,
  ConnectionTestResult,
  MvpSettingsUpdate,
  OperatorActionExecuteResult,
  OperatorProposeResult,
  SshExecResult,
  SshFileDeleteResult,
  SshFileListResult,
  SshFileStatResult,
  SshFileTransferResult,
  TerminalResizeResult,
  TerminalStartResult,
  TerminalStopResult,
  TerminalWriteResult,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalStatusEvent,
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
  listWorkspaceTrash: () => WorkspaceTrashEntry[];
  moveWorkspaceFileToTrash: (relativePath: string) => WorkspaceTrashEntry;
  restoreWorkspaceTrashItem: (id: string) => WorkspaceFileEntry;
  deleteWorkspaceTrashItemPermanent: (id: string) => boolean;
  emptyWorkspaceTrash: () => boolean;
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
      if (error instanceof PolicyDeniedError || error instanceof AppCapabilityDeniedError || error instanceof RuntimeValidationError) {
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
      validateHostedNoRequestBody({});
      await this.runHostedTerminalRoute({
        contractId: 'hosted:GET:/api/terminal/events',
        session,
        route: '/api/terminal/events',
        action: 'GET /api/terminal/events',
        entityType: 'terminal_event_stream',
        input: {},
        execute: () => ({ subscribed: true }),
        successAuditMetadata: () => ({
          channel: isTerminalChannel(url.searchParams.get('channel'))
            ? url.searchParams.get('channel')
            : null,
          terminalInputLogged: false,
          terminalOutputLogged: false,
        }),
      });
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
      const loginRequired = this.options.auth.required;
      this.sendJson(response, 200, {
        loginRequired,
        authenticated: loginRequired ? Boolean(session) : true,
        expiresAt: loginRequired && session ? new Date(session.expiresAt).toISOString() : null,
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
    this.sendJson(response, 200, {
      authenticated: !this.options.auth.required,
      loginRequired: this.options.auth.required,
    });
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
        const contract = getHostRouteContract('hosted:POST:/api/hosts');
        if (!contract) {
          throw new HttpError(500, 'Missing hosted host create route contract.');
        }
        const validatedInput = validateHostCreateInput(asRecord(body));
        return runHostRouteContract({
          contract,
          policyService: this.options.policyService,
          logAuditEvent: (event) => this.options.store.logAuditEvent(event),
          context: {
            caller: 'hosted',
            route: '/api/hosts',
            action: 'POST /api/hosts',
            sessionId: session?.id ?? null,
          },
          input: validatedInput,
          execute: () => this.options.store.createHost(validatedInput),
        });
      }
      if (actionOrId && subAction === undefined && method === 'GET') {
        return this.options.store.getHost(decodeURIComponent(actionOrId));
      }
      if (actionOrId && subAction === undefined && method === 'PATCH') {
        const contract = getHostRouteContract('hosted:PATCH:/api/hosts/:id');
        if (!contract) {
          throw new HttpError(500, 'Missing hosted host update route contract.');
        }
        const hostId = validateHostIdInput(decodeURIComponent(actionOrId));
        const validatedInput = validateHostUpdateInput(asRecord(body));
        return runHostRouteContract({
          contract,
          policyService: this.options.policyService,
          logAuditEvent: (event) => this.options.store.logAuditEvent(event),
          context: {
            caller: 'hosted',
            route: `/api/hosts/${hostId}`,
            action: 'PATCH /api/hosts/:id',
            hostId,
            sessionId: session?.id ?? null,
          },
          input: validatedInput,
          execute: () => this.options.store.updateHost(hostId, validatedInput),
        });
      }
      if (actionOrId && subAction === undefined && method === 'DELETE') {
        const contract = getHostRouteContract('hosted:DELETE:/api/hosts/:id');
        if (!contract) {
          throw new HttpError(500, 'Missing hosted host delete route contract.');
        }
        const hostId = validateHostIdInput(decodeURIComponent(actionOrId));
        return runHostRouteContract({
          contract,
          policyService: this.options.policyService,
          logAuditEvent: (event) => this.options.store.logAuditEvent(event),
          context: {
            caller: 'hosted',
            route: `/api/hosts/${hostId}`,
            action: 'DELETE /api/hosts/:id',
            hostId,
            sessionId: session?.id ?? null,
          },
          input: hostId,
          execute: () => this.options.store.deleteHost(hostId),
        });
      }
      if (actionOrId && subAction === 'test' && method === 'POST') {
        const contract = getHostRouteContract('hosted:POST:/api/hosts/:id/test');
        if (!contract) {
          throw new HttpError(500, 'Missing hosted host test-connection route contract.');
        }
        const hostId = validateHostIdInput(decodeURIComponent(actionOrId));
        return runHostRouteContract({
          contract,
          policyService: this.options.policyService,
          logAuditEvent: (event) => this.options.store.logAuditEvent(event),
          context: {
            caller: 'hosted',
            route: `/api/hosts/${hostId}/test`,
            action: 'POST /api/hosts/:id/test',
            hostId,
            sessionId: session?.id ?? null,
          },
          input: hostId,
          execute: () => this.options.store.testConnection(hostId),
        });
      }
    }

    if (resource === 'settings') {
      if (method === 'GET') {
        validateHostedNoRequestBody(body);
        return this.runHostedSettingsRoute({
          contractId: 'hosted:GET:/api/settings',
          session,
          route: '/api/settings',
          action: 'GET /api/settings',
          entityType: 'settings',
          input: null,
          execute: () => this.options.store.getSettings(),
        });
      }
      if (method === 'PATCH') {
        const validatedUpdate = validateSettingsUpdate(body);
        return this.runHostedSettingsRoute({
          contractId: 'hosted:PATCH:/api/settings',
          session,
          route: '/api/settings',
          action: 'PATCH /api/settings',
          entityType: 'settings',
          input: validatedUpdate,
          execute: () => this.options.store.updateSettings(validatedUpdate),
          successAuditMetadata: () => this.settingsRouteSuccessMetadata(validatedUpdate),
        });
      }
    }

    if (resource === 'audit') {
      if (method === 'GET') {
        validateHostedNoRequestBody(body);
        return this.runHostedAuditRoute({
          contractId: 'hosted:GET:/api/audit',
          session,
          route: '/api/audit',
          action: 'GET /api/audit',
          entityType: 'audit_event',
          input: null,
          execute: () => this.options.store.listAuditEvents(),
        });
      }
      if (method === 'POST') {
        const auditEvent = validateAuditEventInput(asRecord(body));
        return this.runHostedAuditRoute({
          contractId: 'hosted:POST:/api/audit',
          session,
          route: '/api/audit',
          action: 'POST /api/audit',
          entityType: 'audit_event',
          input: auditEvent,
          execute: () => this.options.store.logAuditEvent(auditEvent),
        });
      }
    }

    if (resource === 'workspace') {
      return this.routeWorkspaceApi(method, segments, body, session);
    }

    if (resource === 'workspace-files') {
      return this.routeWorkspaceFileApi(method, segments, body, url, session);
    }

    if (resource === 'command-history') {
      return this.routeCommandHistoryApi(method, actionOrId, body, session);
    }

    if (resource === 'app-manifests') {
      return this.routeAppManifestApi(method, actionOrId, body, session);
    }

    if (resource === 'app-permissions') {
      return this.routeAppPermissionApi(method, actionOrId, body, url, session);
    }

    if (resource === 'app-storage') {
      return this.routeAppStorageApi(method, segments, body, session);
    }

    if (resource === 'app-host') {
      return this.routeAppHostSdkApi(method, actionOrId, body, session);
    }

    if (resource === 'agent-endpoints') {
      return this.routeAgentEndpointApi(method, actionOrId, body, session);
    }

    if (resource === 'agent') {
      return this.routeAgentApi(method, actionOrId, body, session);
    }

    if (resource === 'host-operations') {
      if (method !== 'POST' || actionOrId !== 'run') {
        throw new HttpError(404, `No hosted host operation route for ${method}.`);
      }

      const contract = getHostRouteContract('hosted:POST:/api/host-operations/run');
      if (!contract) {
        throw new HttpError(500, 'Missing hosted host operation route contract.');
      }
      const validatedInput = validateHostOperationInput(body);
      return runHostRouteContract({
        contract,
        policyService: this.options.policyService,
        logAuditEvent: (event) => this.options.store.logAuditEvent(event),
        context: {
          caller: 'hosted',
          route: '/api/host-operations/run',
          action: 'POST /api/host-operations/run',
          hostId: validatedInput.hostId,
          sessionId: session?.id ?? null,
        },
        input: validatedInput,
        execute: () => this.options.hostOperations.run(validatedInput),
      });
    }

    if (resource === 'ssh') {
      return this.routeSshApi(method, actionOrId, body, session);
    }

    if (resource === 'ssh-files') {
      return this.routeSshFileApi(method, actionOrId, body, session);
    }

    if (resource === 'bootstrap') {
      return this.routeBootstrapApi(method, actionOrId, body, session);
    }

    if (resource === 'terminal') {
      return this.routeTerminalApi(method, actionOrId, body, session);
    }

    throw new HttpError(404, `No hosted API route for ${method} /api/${segments.join('/')}.`);
  }

  private routeWorkspaceApi(
    method: string,
    segments: string[],
    body: unknown,
    session: HostedSession | null,
  ): unknown {
    const [, collection, idOrAction] = segments;
    if (collection === 'profiles') {
      if (segments.length === 2 && method === 'GET') {
        validateHostedNoRequestBody(body);
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:GET:/api/workspace/profiles',
          session,
          route: '/api/workspace/profiles',
          action: 'GET /api/workspace/profiles',
          entityType: 'workspace_profile',
          input: null,
          execute: () => this.options.store.listWorkspaceProfiles(),
        });
      }
      if (segments.length === 2 && method === 'POST') {
        const input = validateWorkspaceProfileCreateInput(asRecord(body));
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:POST:/api/workspace/profiles',
          session,
          route: '/api/workspace/profiles',
          action: 'POST /api/workspace/profiles',
          entityType: 'workspace_profile',
          input,
          execute: () => this.options.store.createWorkspaceProfile(input),
        });
      }
      if (idOrAction && method === 'GET') {
        validateHostedNoRequestBody(body);
        const profileId = validateWorkspaceProfileIdInput(decodeURIComponent(idOrAction));
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:GET:/api/workspace/profiles/:id',
          session,
          route: `/api/workspace/profiles/${profileId}`,
          action: 'GET /api/workspace/profiles/:id',
          entityId: profileId,
          entityType: 'workspace_profile',
          input: profileId,
          execute: () => this.options.store.getWorkspaceProfile(profileId),
        });
      }
      if (idOrAction && method === 'PATCH') {
        const profileId = validateWorkspaceProfileIdInput(decodeURIComponent(idOrAction));
        const input = validateWorkspaceProfileUpdateInput(asRecord(body));
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:PATCH:/api/workspace/profiles/:id',
          session,
          route: `/api/workspace/profiles/${profileId}`,
          action: 'PATCH /api/workspace/profiles/:id',
          entityId: profileId,
          entityType: 'workspace_profile',
          input,
          execute: () => this.options.store.updateWorkspaceProfile(profileId, input),
        });
      }
      if (idOrAction && method === 'DELETE') {
        validateHostedNoRequestBody(body);
        const profileId = validateWorkspaceProfileIdInput(decodeURIComponent(idOrAction));
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:DELETE:/api/workspace/profiles/:id',
          session,
          route: `/api/workspace/profiles/${profileId}`,
          action: 'DELETE /api/workspace/profiles/:id',
          entityId: profileId,
          entityType: 'workspace_profile',
          input: profileId,
          execute: () => this.options.store.deleteWorkspaceProfile(profileId),
        });
      }
    }

    if (collection === 'active-profile-id') {
      if (method === 'GET') {
        validateHostedNoRequestBody(body);
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:GET:/api/workspace/active-profile-id',
          session,
          route: '/api/workspace/active-profile-id',
          action: 'GET /api/workspace/active-profile-id',
          entityType: 'workspace_state',
          input: null,
          execute: () => this.options.store.getActiveWorkspaceProfileId(),
        });
      }
      if (method === 'PUT') {
        const profileId = validateWorkspaceActiveProfileInput(body);
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:PUT:/api/workspace/active-profile-id',
          session,
          route: '/api/workspace/active-profile-id',
          action: 'PUT /api/workspace/active-profile-id',
          entityId: profileId,
          entityType: 'workspace_state',
          input: { profileId },
          execute: () => {
            this.options.store.setActiveWorkspaceProfileId(profileId);
            return profileId;
          },
        });
      }
      if (method === 'POST') {
        const profileId = validateWorkspaceActiveProfileInput(body);
        return this.runHostedWorkspaceProfileRoute({
          contractId: 'hosted:POST:/api/workspace/active-profile-id',
          session,
          route: '/api/workspace/active-profile-id',
          action: 'POST /api/workspace/active-profile-id',
          entityId: profileId,
          entityType: 'workspace_state',
          input: { profileId },
          execute: () => {
            this.options.store.setActiveWorkspaceProfileId(profileId);
            return profileId;
          },
        });
      }
    }

    throw new HttpError(404, `No hosted workspace route for ${method} /api/${segments.join('/')}.`);
  }

  private requireRouteAccessContract(contractId: string): NonNullable<ReturnType<typeof getHostRouteContract>> {
    const contract = getHostRouteContract(contractId);
    if (!contract) {
      throw new HttpError(500, `Missing route access contract: ${contractId}`);
    }
    return contract;
  }

  private runHostedAuditRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
    });
  }

  private runHostedSshRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      hostId?: string | null;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => Promise<TResult> | TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        hostId: params.hostId ?? null,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedTerminalRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      hostId?: string | null;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        hostId: params.hostId ?? null,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedAgentEndpointRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedAppRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityId?: string | null;
      entityType: string;
      appId?: string | null;
      hostId?: string | null;
      input: unknown;
      execute: () => Promise<TResult> | TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        appId: params.appId ?? null,
        hostId: params.hostId ?? null,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedBootstrapRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      hostId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        hostId: params.hostId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedCommandHistoryRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedSettingsRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityType: string;
      input: unknown;
      execute: () => TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private settingsRouteSuccessMetadata(update: MvpSettingsUpdate): Record<string, unknown> {
    return {
      themeUpdated: update.theme !== undefined,
      windowBehaviorUpdated: update.defaultWindowBehavior !== undefined,
      wallpaperUpdated: update.desktopWallpaper !== undefined || update.desktopWallpaperLayout !== undefined,
      sshDefaultsUpdated: update.sshDefaults !== undefined,
      operatorUpdated: update.operator !== undefined,
      settingsValuesLogged: false,
      secretsLogged: false,
    };
  }

  private commandHistoryRouteSuccessMetadata(result: CommandHistoryEntry | boolean): Record<string, unknown> {
    if (typeof result === 'boolean') {
      return {
        deleted: result,
        commandLogged: false,
        commandOutputLogged: false,
      };
    }

    return {
      hasHostId: Boolean(result.hostId),
      hasSessionId: Boolean(result.sessionId),
      hasExitCode: result.exitCode !== null,
      hasDurationMs: result.durationMs !== null,
      commandLogged: false,
      commandOutputLogged: false,
    };
  }

  private runHostedAgentOperatorRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      hostId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => Promise<TResult> | TResult;
      successAuditMetadata?: (result: TResult) => Record<string, unknown>;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        hostId: params.hostId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
      successAuditMetadata: params.successAuditMetadata,
    });
  }

  private runHostedWorkspaceProfileRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
    });
  }

  private runHostedWorkspaceFileRoute<TResult>(
    params: {
      contractId: string;
      session: HostedSession | null;
      route: string;
      action: string;
      entityId?: string | null;
      entityType: string;
      input: unknown;
      execute: () => TResult;
    },
  ): Promise<TResult> {
    return runHostRouteContract({
      contract: this.requireRouteAccessContract(params.contractId),
      policyService: this.options.policyService,
      logAuditEvent: (event) => this.options.store.logAuditEvent(event),
      context: {
        caller: 'hosted',
        route: params.route,
        action: params.action,
        entityId: params.entityId ?? null,
        entityType: params.entityType,
        sessionId: params.session?.id ?? null,
      },
      input: params.input,
      execute: params.execute,
    });
  }

  private routeWorkspaceFileApi(
    method: string,
    segments: string[],
    body: unknown,
    url: URL,
    session: HostedSession | null,
  ): unknown {
    const [, action, subAction] = segments;

    if (!action && method === 'GET') {
      const path = validateWorkspaceFileListInput(url.searchParams.get('path'));
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:GET:/api/workspace-files',
        session,
        route: '/api/workspace-files',
        action: 'GET /api/workspace-files',
        entityId: path || null,
        entityType: 'workspace_file',
        input: path,
        execute: () => this.options.listWorkspaceFiles(path),
      });
    }

    if (action === 'folder' && method === 'POST') {
      const targetRelativePath = validateWorkspaceFileTargetPathInput(asRecord(body).targetPath);
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/folder',
        session,
        route: '/api/workspace-files/folder',
        action: 'POST /api/workspace-files/folder',
        entityId: targetRelativePath || null,
        entityType: 'workspace_file',
        input: targetRelativePath,
        execute: () => this.options.createWorkspaceFolder(targetRelativePath),
      });
    }

    if (action === 'file' && method === 'POST') {
      const input = validateWorkspaceFileCreateFileInput(asRecord(body));
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/file',
        session,
        route: '/api/workspace-files/file',
        action: 'POST /api/workspace-files/file',
        entityId: input.targetPath || null,
        entityType: 'workspace_file',
        input,
        execute: () => this.options.createWorkspaceFile(input.kind, input.targetPath),
      });
    }

    if (action === 'duplicate' && method === 'POST') {
      const sourcePath = validateWorkspaceFilePathInput(asRecord(body).path);
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/duplicate',
        session,
        route: '/api/workspace-files/duplicate',
        action: 'POST /api/workspace-files/duplicate',
        entityId: sourcePath,
        entityType: 'workspace_file',
        input: sourcePath,
        execute: () => this.options.duplicateWorkspaceFile(sourcePath),
      });
    }

    if (action === 'copy' && method === 'POST') {
      const input = validateWorkspaceFileCopyMoveInput(asRecord(body));
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/copy',
        session,
        route: '/api/workspace-files/copy',
        action: 'POST /api/workspace-files/copy',
        entityId: input.path,
        entityType: 'workspace_file',
        input,
        execute: () => this.options.copyWorkspaceFile(input.path, input.targetPath),
      });
    }

    if (action === 'move' && method === 'POST') {
      const input = validateWorkspaceFileCopyMoveInput(asRecord(body));
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/move',
        session,
        route: '/api/workspace-files/move',
        action: 'POST /api/workspace-files/move',
        entityId: input.path,
        entityType: 'workspace_file',
        input,
        execute: () => this.options.moveWorkspaceFile(input.path, input.targetPath),
      });
    }

    if (action === 'trash') {
      return this.routeWorkspaceTrashApi(method, subAction, body, session);
    }

    if (!action && method === 'PATCH') {
      const record = asRecord(body);
      const input = validateWorkspaceFileRenameInput({
        path: record.path,
        newName: record.newName ?? record.name,
      });
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:PATCH:/api/workspace-files',
        session,
        route: '/api/workspace-files',
        action: 'PATCH /api/workspace-files',
        entityId: input.path,
        entityType: 'workspace_file',
        input,
        execute: () => this.options.renameWorkspaceFile(input.path, input.newName),
      });
    }

    if (!action && method === 'DELETE') {
      const relativePath = validateWorkspaceFilePathInput(url.searchParams.get('path'));
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:DELETE:/api/workspace-files',
        session,
        route: '/api/workspace-files',
        action: 'DELETE /api/workspace-files',
        entityId: relativePath,
        entityType: 'workspace_file',
        input: relativePath,
        execute: () => this.options.deleteWorkspaceFilePermanent(relativePath),
      });
    }

    throw new HttpError(404, `No hosted workspace-files route for ${method} /api/${segments.join('/')}.`);
  }

  private routeWorkspaceTrashApi(
    method: string,
    subAction: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): unknown {
    if (subAction === 'restore' && method === 'POST') {
      const id = validateWorkspaceTrashIdInput(asRecord(body).id);
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/trash/restore',
        session,
        route: '/api/workspace-files/trash/restore',
        action: 'POST /api/workspace-files/trash/restore',
        entityId: id,
        entityType: 'workspace_trash',
        input: id,
        execute: () => this.options.restoreWorkspaceTrashItem(id),
      });
    }

    if (subAction && method === 'DELETE') {
      const id = validateWorkspaceTrashIdInput(decodeURIComponent(subAction));
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:DELETE:/api/workspace-files/trash/:id',
        session,
        route: `/api/workspace-files/trash/${id}`,
        action: 'DELETE /api/workspace-files/trash/:id',
        entityId: id,
        entityType: 'workspace_trash',
        input: id,
        execute: () => this.options.deleteWorkspaceTrashItemPermanent(id),
      });
    }

    if (!subAction && method === 'GET') {
      validateHostedNoRequestBody(body);
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:GET:/api/workspace-files/trash',
        session,
        route: '/api/workspace-files/trash',
        action: 'GET /api/workspace-files/trash',
        entityType: 'workspace_trash',
        input: null,
        execute: () => this.options.listWorkspaceTrash(),
      });
    }

    if (!subAction && method === 'POST') {
      const path = validateWorkspaceFilePathInput(asRecord(body).path);
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:POST:/api/workspace-files/trash',
        session,
        route: '/api/workspace-files/trash',
        action: 'POST /api/workspace-files/trash',
        entityId: path,
        entityType: 'workspace_file',
        input: path,
        execute: () => this.options.moveWorkspaceFileToTrash(path),
      });
    }

    if (!subAction && method === 'DELETE') {
      validateHostedNoRequestBody(body);
      return this.runHostedWorkspaceFileRoute({
        contractId: 'hosted:DELETE:/api/workspace-files/trash',
        session,
        route: '/api/workspace-files/trash',
        action: 'DELETE /api/workspace-files/trash',
        entityType: 'workspace_trash',
        input: null,
        execute: () => this.options.emptyWorkspaceTrash(),
      });
    }

    throw new HttpError(404, `No hosted workspace trash route for ${method}.`);
  }

  private routeCommandHistoryApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): unknown {
    if (!action && method === 'GET') {
      validateHostedNoRequestBody(body);
      return this.runHostedCommandHistoryRoute({
        contractId: 'hosted:GET:/api/command-history',
        session,
        route: '/api/command-history',
        action: 'GET /api/command-history',
        entityType: 'command_history',
        input: null,
        execute: () => this.options.store.listCommandHistory(),
      });
    }
    if (!action && method === 'POST') {
      const input = validateCommandHistoryCreateInput(asRecord(body));
      return this.runHostedCommandHistoryRoute({
        contractId: 'hosted:POST:/api/command-history',
        session,
        route: '/api/command-history',
        action: 'POST /api/command-history',
        entityType: 'command_history',
        input,
        execute: () => this.options.store.createCommandHistoryEntry(input),
        successAuditMetadata: (result) => this.commandHistoryRouteSuccessMetadata(result),
      });
    }
    if (action && method === 'DELETE') {
      const entryId = validateCommandHistoryEntryIdInput(decodeURIComponent(action));
      return this.runHostedCommandHistoryRoute({
        contractId: 'hosted:DELETE:/api/command-history/:id',
        session,
        route: '/api/command-history/:id',
        action: 'DELETE /api/command-history/:id',
        entityId: entryId,
        entityType: 'command_history',
        input: entryId,
        execute: () => this.options.store.deleteCommandHistoryEntry(entryId),
        successAuditMetadata: (result) => this.commandHistoryRouteSuccessMetadata(result),
      });
    }

    throw new HttpError(404, `No hosted command history route for ${method}.`);
  }

  private routeBootstrapApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): unknown {
    if (action === 'presets' && method === 'GET') {
      validateHostedNoRequestBody(body);
      return this.runHostedBootstrapRoute({
        contractId: 'hosted:GET:/api/bootstrap/presets',
        session,
        route: '/api/bootstrap/presets',
        action: 'GET /api/bootstrap/presets',
        entityType: 'bootstrap',
        input: null,
        execute: () => listBootstrapPresets(),
      });
    }

    if (action === 'generate' && method === 'POST') {
      const input = validateBootstrapGenerateInput(body);
      const hostId = input.hostId ?? null;
      return this.runHostedBootstrapRoute({
        contractId: 'hosted:POST:/api/bootstrap/generate',
        session,
        route: '/api/bootstrap/generate',
        action: 'POST /api/bootstrap/generate',
        hostId,
        entityType: hostId ? 'host' : 'bootstrap',
        input,
        execute: () => this.generateBootstrap(input),
        successAuditMetadata: (result) => bootstrapGenerateRouteSuccessMetadata(result, input),
      });
    }

    throw new HttpError(404, `No hosted bootstrap route for ${method}.`);
  }

  private routeAppManifestApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): unknown {
    if (!action && method === 'GET') {
      validateHostedNoRequestBody(body);
      return this.runHostedAppRoute({
        contractId: 'hosted:GET:/api/app-manifests',
        session,
        route: '/api/app-manifests',
        action: 'GET /api/app-manifests',
        entityType: 'app_manifest',
        input: null,
        execute: () => this.options.store.listAppManifests(),
      });
    }
    if (!action && method === 'POST') {
      const input = validateAppManifestCreateInput(asRecord(body));
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-manifests',
        session,
        route: '/api/app-manifests',
        action: 'POST /api/app-manifests',
        entityType: 'app_manifest',
        appId: input.appId,
        input,
        execute: () => this.options.store.createAppManifest(input),
        successAuditMetadata: appManifestRouteSuccessMetadata,
      });
    }
    if (action && method === 'GET') {
      validateHostedNoRequestBody(body);
      const manifestId = validateAppManifestIdInput(decodeURIComponent(action));
      return this.runHostedAppRoute({
        contractId: 'hosted:GET:/api/app-manifests/:id',
        session,
        route: `/api/app-manifests/${manifestId}`,
        action: 'GET /api/app-manifests/:id',
        entityId: manifestId,
        entityType: 'app_manifest',
        input: manifestId,
        execute: () => this.options.store.getAppManifest(manifestId),
      });
    }
    if (action && method === 'PATCH') {
      const manifestId = validateAppManifestIdInput(decodeURIComponent(action));
      const input = validateAppManifestUpdateInput(asRecord(body));
      return this.runHostedAppRoute({
        contractId: 'hosted:PATCH:/api/app-manifests/:id',
        session,
        route: `/api/app-manifests/${manifestId}`,
        action: 'PATCH /api/app-manifests/:id',
        entityId: manifestId,
        entityType: 'app_manifest',
        appId: input.appId ?? null,
        input,
        execute: () => this.options.store.updateAppManifest(manifestId, input),
        successAuditMetadata: appManifestRouteSuccessMetadata,
      });
    }
    if (action && method === 'DELETE') {
      validateHostedNoRequestBody(body);
      const manifestId = validateAppManifestIdInput(decodeURIComponent(action));
      return this.runHostedAppRoute({
        contractId: 'hosted:DELETE:/api/app-manifests/:id',
        session,
        route: `/api/app-manifests/${manifestId}`,
        action: 'DELETE /api/app-manifests/:id',
        entityId: manifestId,
        entityType: 'app_manifest',
        input: manifestId,
        execute: () => this.options.store.deleteAppManifest(manifestId),
        successAuditMetadata: appManifestRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted app manifest route for ${method}.`);
  }

  private routeAppPermissionApi(
    method: string,
    action: string | undefined,
    body: unknown,
    url: URL,
    session: HostedSession | null,
  ): unknown {
    if (!action && method === 'GET') {
      validateHostedNoRequestBody(body);
      const appId = validateAppPermissionListInput(url.searchParams.get('appId'));
      return this.runHostedAppRoute({
        contractId: 'hosted:GET:/api/app-permissions',
        session,
        route: '/api/app-permissions',
        action: 'GET /api/app-permissions',
        entityType: 'app_permission',
        appId: appId ?? null,
        input: appId ?? null,
        execute: () => this.options.store.listAppPermissions(appId),
      });
    }
    if (!action && method === 'POST') {
      const input = validateAppPermissionCreateInput(asRecord(body));
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-permissions',
        session,
        route: '/api/app-permissions',
        action: 'POST /api/app-permissions',
        entityType: 'app_permission',
        appId: input.appId,
        input,
        execute: () => this.options.store.createAppPermission(input),
        successAuditMetadata: appPermissionRouteSuccessMetadata,
      });
    }
    if (action && method === 'DELETE') {
      validateHostedNoRequestBody(body);
      const permissionId = validateAppPermissionIdInput(decodeURIComponent(action));
      return this.runHostedAppRoute({
        contractId: 'hosted:DELETE:/api/app-permissions/:id',
        session,
        route: `/api/app-permissions/${permissionId}`,
        action: 'DELETE /api/app-permissions/:id',
        entityId: permissionId,
        entityType: 'app_permission',
        input: permissionId,
        execute: () => this.options.store.deleteAppPermission(permissionId),
        successAuditMetadata: appPermissionRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted app permission route for ${method}.`);
  }

  private routeAppStorageApi(
    method: string,
    segments: string[],
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    const appIdSegment = segments[1];
    const keySegment = segments[2];
    if (!appIdSegment || !keySegment || segments.length !== 3) {
      throw new HttpError(404, `No hosted app storage route for ${method}.`);
    }

    const appId = decodeURIComponent(appIdSegment);
    const key = decodeURIComponent(keySegment);
    if (method === 'GET') {
      validateHostedNoRequestBody(body);
      const input = validateAppScopedStorageGetInput({ appId, key });
      return this.runHostedAppRoute({
        contractId: 'hosted:GET:/api/app-storage/:appId/:key',
        session,
        route: `/api/app-storage/${input.appId}/${appScopedStorageKeyHash(input.key)}`,
        action: 'GET /api/app-storage/:appId/:key',
        entityId: appScopedStorageEntityId(input.appId, input.key),
        entityType: 'app_scoped_storage',
        appId: input.appId,
        input,
        execute: () => {
          this.assertAppScopedStorageGranted(input, 'GET /api/app-storage/:appId/:key');
          return this.options.store.getAppScopedStorage(input);
        },
        successAuditMetadata: appScopedStorageRouteSuccessMetadata,
      });
    }

    if (method === 'PUT') {
      const input = validateAppScopedStorageSetInput({
        appId,
        key,
        value: asRecord(body).value,
      });
      return this.runHostedAppRoute({
        contractId: 'hosted:PUT:/api/app-storage/:appId/:key',
        session,
        route: `/api/app-storage/${input.appId}/${appScopedStorageKeyHash(input.key)}`,
        action: 'PUT /api/app-storage/:appId/:key',
        entityId: appScopedStorageEntityId(input.appId, input.key),
        entityType: 'app_scoped_storage',
        appId: input.appId,
        input,
        execute: () => {
          this.assertAppScopedStorageGranted(input, 'PUT /api/app-storage/:appId/:key');
          return this.options.store.setAppScopedStorage(input);
        },
        successAuditMetadata: appScopedStorageRouteSuccessMetadata,
      });
    }

    if (method === 'DELETE') {
      validateHostedNoRequestBody(body);
      const input = validateAppScopedStorageDeleteInput({ appId, key });
      return this.runHostedAppRoute({
        contractId: 'hosted:DELETE:/api/app-storage/:appId/:key',
        session,
        route: `/api/app-storage/${input.appId}/${appScopedStorageKeyHash(input.key)}`,
        action: 'DELETE /api/app-storage/:appId/:key',
        entityId: appScopedStorageEntityId(input.appId, input.key),
        entityType: 'app_scoped_storage',
        appId: input.appId,
        input,
        execute: () => {
          this.assertAppScopedStorageGranted(input, 'DELETE /api/app-storage/:appId/:key');
          return this.options.store.deleteAppScopedStorage(input);
        },
        successAuditMetadata: appScopedStorageRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted app storage route for ${method}.`);
  }

  private assertAppScopedStorageGranted(input: AppScopedStorageGetInput, action: string): void {
    if (this.options.store.hasGrantedAppPermission(input.appId, 'storage:scoped')) {
      return;
    }

    this.options.store.logAuditEvent({
      type: 'app_storage.denied',
      entityType: 'app',
      entityId: input.appId,
      message: 'Generated app scoped storage request denied.',
      metadata: {
        actionClass: 'app-storage-route',
        action,
        appId: input.appId,
        capability: 'storage:scoped',
        granted: false,
        keyHash: appScopedStorageKeyHash(input.key),
        keyLength: input.key.length,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    });
    throw new AppCapabilityDeniedError(input.appId, 'storage:scoped', action);
  }

  private routeAppHostSdkApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    if (method !== 'POST') {
      throw new HttpError(404, `No hosted app host SDK route for ${method}.`);
    }

    if (action === 'list') {
      const input = validateGeneratedAppHostListInput(body);
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-host/list',
        session,
        route: '/api/app-host/list',
        action: 'POST /api/app-host/list',
        entityId: input.appId,
        entityType: 'app',
        appId: input.appId,
        input,
        execute: () => {
          this.assertGeneratedAppHostCapabilityGranted(input, 'POST /api/app-host/list');
          return generatedAppHostListResult(input, this.options.store.listHosts());
        },
        successAuditMetadata: generatedAppHostRouteSuccessMetadata,
      });
    }

    if (action === 'get') {
      const input = validateGeneratedAppHostGetInput(body);
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-host/get',
        session,
        route: '/api/app-host/get',
        action: 'POST /api/app-host/get',
        hostId: input.hostId,
        entityType: 'host',
        appId: input.appId,
        input,
        execute: () => {
          this.assertGeneratedAppHostCapabilityGranted(input, 'POST /api/app-host/get');
          return generatedAppHostGetResult(input, this.options.store.getHost(input.hostId));
        },
        successAuditMetadata: generatedAppHostRouteSuccessMetadata,
      });
    }

    if (action === 'status') {
      const input = validateGeneratedAppHostStatusInput(body);
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-host/status',
        session,
        route: '/api/app-host/status',
        action: 'POST /api/app-host/status',
        hostId: input.hostId,
        entityType: 'host',
        appId: input.appId,
        input,
        execute: () => {
          this.assertGeneratedAppHostCapabilityGranted(input, 'POST /api/app-host/status');
          return generatedAppHostStatusResult(input, this.options.store.getHost(input.hostId));
        },
        successAuditMetadata: generatedAppHostRouteSuccessMetadata,
      });
    }

    if (action === 'capabilities') {
      const input = validateGeneratedAppHostCapabilitiesInput(body);
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-host/capabilities',
        session,
        route: '/api/app-host/capabilities',
        action: 'POST /api/app-host/capabilities',
        hostId: input.hostId,
        entityType: 'host',
        appId: input.appId,
        input,
        execute: () => {
          this.assertGeneratedAppHostCapabilityGranted(input, 'POST /api/app-host/capabilities');
          return generatedAppHostCapabilitiesResult(input, this.options.store.getHost(input.hostId));
        },
        successAuditMetadata: generatedAppHostRouteSuccessMetadata,
      });
    }

    if (action === 'test-connection') {
      const input = validateGeneratedAppHostTestConnectionInput(body);
      return this.runHostedAppRoute({
        contractId: 'hosted:POST:/api/app-host/test-connection',
        session,
        route: '/api/app-host/test-connection',
        action: 'POST /api/app-host/test-connection',
        hostId: input.hostId,
        entityType: 'host',
        appId: input.appId,
        input,
        execute: async () => {
          this.assertGeneratedAppHostCapabilityGranted(input, 'POST /api/app-host/test-connection');
          return generatedAppHostTestConnectionResult(input, await this.options.store.testConnection(input.hostId));
        },
        successAuditMetadata: generatedAppHostRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted app host SDK route for ${method} /api/app-host/${action ?? ''}.`);
  }

  private assertGeneratedAppHostCapabilityGranted(
    input: GeneratedAppHostListInput | GeneratedAppHostTargetInput,
    action: string,
  ): void {
    const capability = generatedAppHostCapabilityForMethod(input);
    if (this.options.store.hasGrantedAppPermission(input.appId, capability)) {
      return;
    }

    this.options.store.logAuditEvent({
      type: 'app_host_sdk.denied',
      entityType: 'app',
      entityId: input.appId,
      message: 'Generated app host SDK request denied.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        action,
        appId: input.appId,
        windowId: input.windowId,
        method: input.method,
        hostId: 'hostId' in input ? input.hostId : null,
        capability,
        granted: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    });
    throw new AppCapabilityDeniedError(input.appId, capability, action);
  }

  private routeAgentEndpointApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    if (!action && method === 'GET') {
      validateHostedNoRequestBody(body);
      return this.runHostedAgentEndpointRoute({
        contractId: 'hosted:GET:/api/agent-endpoints',
        session,
        route: '/api/agent-endpoints',
        action: 'GET /api/agent-endpoints',
        entityType: 'agent_endpoint',
        input: null,
        execute: () => this.options.store.listAgentEndpoints(),
      });
    }
    if (!action && method === 'POST') {
      const validatedInput = validateAgentEndpointCreateInput(body);
      return this.runHostedAgentEndpointRoute({
        contractId: 'hosted:POST:/api/agent-endpoints',
        session,
        route: '/api/agent-endpoints',
        action: 'POST /api/agent-endpoints',
        entityType: 'agent_endpoint',
        input: validatedInput,
        execute: () => this.options.store.createAgentEndpoint(validatedInput),
        successAuditMetadata: agentEndpointRouteSuccessMetadata,
      });
    }
    if (action && method === 'GET') {
      const endpointId = validateAgentEndpointIdInput(decodeURIComponent(action));
      return this.runHostedAgentEndpointRoute({
        contractId: 'hosted:GET:/api/agent-endpoints/:id',
        session,
        route: '/api/agent-endpoints/:id',
        action: 'GET /api/agent-endpoints/:id',
        entityId: endpointId,
        entityType: 'agent_endpoint',
        input: endpointId,
        execute: () => this.options.store.getAgentEndpoint(endpointId),
      });
    }
    if (action && method === 'PATCH') {
      const endpointId = validateAgentEndpointIdInput(decodeURIComponent(action));
      const validatedInput = validateAgentEndpointUpdateInput(body);
      return this.runHostedAgentEndpointRoute({
        contractId: 'hosted:PATCH:/api/agent-endpoints/:id',
        session,
        route: '/api/agent-endpoints/:id',
        action: 'PATCH /api/agent-endpoints/:id',
        entityId: endpointId,
        entityType: 'agent_endpoint',
        input: validatedInput,
        execute: () => this.options.store.updateAgentEndpoint(endpointId, validatedInput),
        successAuditMetadata: agentEndpointRouteSuccessMetadata,
      });
    }
    if (action && method === 'DELETE') {
      const endpointId = validateAgentEndpointIdInput(decodeURIComponent(action));
      return this.runHostedAgentEndpointRoute({
        contractId: 'hosted:DELETE:/api/agent-endpoints/:id',
        session,
        route: '/api/agent-endpoints/:id',
        action: 'DELETE /api/agent-endpoints/:id',
        entityId: endpointId,
        entityType: 'agent_endpoint',
        input: endpointId,
        execute: () => this.options.store.deleteAgentEndpoint(endpointId),
      });
    }

    throw new HttpError(404, `No hosted agent endpoint route for ${method}.`);
  }

  private routeAgentApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    if (action === 'propose' && method === 'POST') {
      const validatedInput = validateOperatorProposeInput(body);
      return this.runHostedAgentOperatorRoute({
        contractId: 'hosted:POST:/api/agent/propose',
        session,
        route: '/api/agent/propose',
        action: 'POST /api/agent/propose',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.agentOperator.propose(validatedInput),
        successAuditMetadata: operatorProposeRouteSuccessMetadata,
      });
    }

    if (action === 'execute-action' && method === 'POST') {
      const validatedInput = validateOperatorActionExecuteInput(body);
      return this.runHostedAgentOperatorRoute({
        contractId: 'hosted:POST:/api/agent/execute-action',
        session,
        route: '/api/agent/execute-action',
        action: 'POST /api/agent/execute-action',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.agentOperator.executeApprovedAction(validatedInput, this.options.terminalSessions),
        successAuditMetadata: operatorActionRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted agent route for ${method}.`);
  }

  private routeSshApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    if (action === 'exec' && method === 'POST') {
      const validatedInput = validateSshExecInput(body);
      return this.runHostedSshRoute({
        contractId: 'hosted:POST:/api/ssh/exec',
        session,
        route: '/api/ssh/exec',
        action: 'POST /api/ssh/exec',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.sshService.exec(validatedInput),
        successAuditMetadata: sshExecRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted SSH route for ${method}.`);
  }

  private routeSshFileApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    if (method !== 'POST') {
      throw new HttpError(405, 'SSH file hosted API only accepts POST commands.');
    }

    if (action === 'list') {
      const validatedInput = validateSshFileListInput(body);
      return this.runHostedSshRoute({
        contractId: 'hosted:POST:/api/ssh-files/list',
        session,
        route: '/api/ssh-files/list',
        action: 'POST /api/ssh-files/list',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.sshService.listDir(validatedInput),
        successAuditMetadata: sshFileListRouteSuccessMetadata,
      });
    }

    if (action === 'stat') {
      const validatedInput = validateSshFileStatInput(body);
      return this.runHostedSshRoute({
        contractId: 'hosted:POST:/api/ssh-files/stat',
        session,
        route: '/api/ssh-files/stat',
        action: 'POST /api/ssh-files/stat',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.sshService.stat(validatedInput),
        successAuditMetadata: sshFileStatRouteSuccessMetadata,
      });
    }

    if (action === 'download') {
      const validatedInput = validateSshFileTransferInput(body);
      return this.runHostedSshRoute({
        contractId: 'hosted:POST:/api/ssh-files/download',
        session,
        route: '/api/ssh-files/download',
        action: 'POST /api/ssh-files/download',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.sshService.download(validatedInput),
        successAuditMetadata: sshFileTransferRouteSuccessMetadata,
      });
    }

    if (action === 'upload') {
      const validatedInput = validateSshFileTransferInput(body);
      return this.runHostedSshRoute({
        contractId: 'hosted:POST:/api/ssh-files/upload',
        session,
        route: '/api/ssh-files/upload',
        action: 'POST /api/ssh-files/upload',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.sshService.upload(validatedInput),
        successAuditMetadata: sshFileTransferRouteSuccessMetadata,
      });
    }

    if (action === 'delete') {
      const validatedInput = validateSshFileDeleteInput(body);
      return this.runHostedSshRoute({
        contractId: 'hosted:POST:/api/ssh-files/delete',
        session,
        route: '/api/ssh-files/delete',
        action: 'POST /api/ssh-files/delete',
        hostId: validatedInput.hostId,
        entityType: 'host',
        input: validatedInput,
        execute: () => this.options.sshService.delete(validatedInput),
        successAuditMetadata: sshFileDeleteRouteSuccessMetadata,
      });
    }

    throw new HttpError(404, `No hosted SSH file route for ${method}.`);
  }

  private routeTerminalApi(
    method: string,
    action: string | undefined,
    body: unknown,
    session: HostedSession | null,
  ): Promise<unknown> {
    if (method !== 'POST') {
      throw new HttpError(405, 'Terminal hosted API only accepts POST commands.');
    }

    if (action === 'start') {
      const validatedHostId = validateTerminalStartInput(asRecord(body).hostId);
      return this.runHostedTerminalRoute({
        contractId: 'hosted:POST:/api/terminal/start',
        session,
        route: '/api/terminal/start',
        action: 'POST /api/terminal/start',
        hostId: validatedHostId,
        entityType: 'host',
        input: validatedHostId,
        execute: () => this.options.terminalSessions.start(validatedHostId),
        successAuditMetadata: terminalRouteSuccessMetadata,
      });
    }
    if (action === 'write') {
      const validated = validateTerminalWriteInput(asRecord(body).sessionId, asRecord(body).input);
      return this.runHostedTerminalRoute({
        contractId: 'hosted:POST:/api/terminal/write',
        session,
        route: '/api/terminal/write',
        action: 'POST /api/terminal/write',
        entityId: validated.sessionId,
        entityType: 'terminal_session',
        input: validated,
        execute: () => this.options.terminalSessions.write(validated.sessionId, validated.input),
        successAuditMetadata: terminalRouteSuccessMetadata,
      });
    }
    if (action === 'resize') {
      const record = asRecord(body);
      const validated = validateTerminalResizeInput(record.sessionId, record.cols, record.rows);
      return this.runHostedTerminalRoute({
        contractId: 'hosted:POST:/api/terminal/resize',
        session,
        route: '/api/terminal/resize',
        action: 'POST /api/terminal/resize',
        entityId: validated.sessionId,
        entityType: 'terminal_session',
        input: validated,
        execute: () => this.options.terminalSessions.resize(
          validated.sessionId,
          validated.cols,
          validated.rows,
        ),
        successAuditMetadata: terminalRouteSuccessMetadata,
      });
    }
    if (action === 'stop') {
      const validatedSessionId = validateTerminalStopInput(asRecord(body).sessionId);
      return this.runHostedTerminalRoute({
        contractId: 'hosted:POST:/api/terminal/stop',
        session,
        route: '/api/terminal/stop',
        action: 'POST /api/terminal/stop',
        entityId: validatedSessionId,
        entityType: 'terminal_session',
        input: validatedSessionId,
        execute: () => this.options.terminalSessions.stop(validatedSessionId),
        successAuditMetadata: terminalRouteSuccessMetadata,
      });
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
    return generateBootstrapScript(input, host);
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

function validateHostedNoRequestBody(value: unknown): void {
  if (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).length === 0
  ) {
    validateNoInput(undefined);
    return;
  }
  validateNoInput(value);
}

function sshExecRouteSuccessMetadata(result: SshExecResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    commandTextLogged: false,
    commandOutputLogged: false,
    secretsLogged: false,
  };
}

function sshFileListRouteSuccessMetadata(result: SshFileListResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    entryCount: result.entries.length,
    path: result.path,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function sshFileStatRouteSuccessMetadata(result: SshFileStatResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    entryFound: Boolean(result.entry),
    path: result.path,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function sshFileTransferRouteSuccessMetadata(result: SshFileTransferResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    direction: result.direction,
    localPathLogged: false,
    remotePathLogged: false,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function sshFileDeleteRouteSuccessMetadata(result: SshFileDeleteResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    operation: 'delete',
    recursive: result.recursive,
    deleted: result.deleted,
    pathHash: hashAuditPath(result.path),
    pathLength: result.path.length,
    remotePathLogged: false,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function hashAuditPath(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

function terminalRouteSuccessMetadata(
  result: TerminalStartResult | TerminalWriteResult | TerminalResizeResult | TerminalStopResult,
): Record<string, unknown> {
  return {
    resultStatus: 'status' in result ? result.status : null,
    success: 'success' in result ? result.success : null,
    sessionId: result.sessionId,
    cols: 'cols' in result ? result.cols : null,
    rows: 'rows' in result ? result.rows : null,
    terminalInputLogged: false,
    terminalOutputLogged: false,
  };
}

function agentEndpointRouteSuccessMetadata(result: AgentEndpoint | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      endpointFound: Boolean(result),
      storesSecretMaterial: false,
      apiKeyLogged: false,
    };
  }

  return {
    endpointId: result.id,
    endpointProvider: result.provider,
    endpointModel: result.model,
    endpointPolicy: result.policy,
    endpointEnabled: result.enabled,
    credentialRefIdLogged: false,
    storesSecretMaterial: false,
    apiKeyLogged: false,
  };
}

function appManifestRouteSuccessMetadata(result: AppManifest | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      manifestFound: Boolean(result),
      sourceCodeLogged: false,
      packageMetadataLogged: false,
    };
  }

  return {
    manifestId: result.id,
    appId: result.appId,
    appVersion: result.version,
    appCategory: result.category,
    appEnabled: result.enabled,
    requestedCapabilityCount: result.capabilities.length,
    sourceCodeLogged: false,
    packageMetadataLogged: false,
  };
}

function appPermissionRouteSuccessMetadata(result: AppPermission | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      permissionFound: Boolean(result),
    };
  }

  return {
    permissionId: result.id,
    appId: result.appId,
    capability: result.capability,
    granted: result.granted,
  };
}

type AppScopedStorageResult = AppScopedStorageGetResult | AppScopedStorageRecord | AppScopedStorageDeleteResult;

function appScopedStorageEntityId(appId: string, key: string): string {
  return `${appId}:${appScopedStorageKeyHash(key)}`;
}

function appScopedStorageKeyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function appScopedStorageRouteSuccessMetadata(result: AppScopedStorageResult): Record<string, unknown> {
  const value = 'value' in result ? result.value : null;
  return {
    appId: result.appId,
    keyHash: appScopedStorageKeyHash(result.key),
    keyLength: result.key.length,
    valuePresent: value !== null,
    valueLength: typeof value === 'string' ? value.length : 0,
    deleted: 'deleted' in result ? result.deleted : false,
    found: 'found' in result ? result.found : true,
    storageValueLogged: false,
    sourceCodeLogged: false,
    packageMetadataLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

function generatedAppHostCapabilityForMethod(input: GeneratedAppHostListInput | GeneratedAppHostTargetInput): PolicyCapability {
  return input.method === 'host:testConnection' ? 'host:actions' : 'host:read';
}

function generatedAppHostSummary(host: HostRecord): GeneratedAppHostSummary {
  return {
    id: host.id,
    name: host.name,
    address: host.address || host.hostname,
    port: host.port,
    lastConnectionStatus: host.lastConnectionStatus,
    lastCheckedAt: host.lastCheckedAt,
    osHint: host.osHint,
    bootstrapStatus: host.bootstrapStatus,
    capabilities: [...host.capabilities],
    tags: [...host.tags],
  };
}

function generatedAppHostStatus(host: HostRecord): GeneratedAppHostStatusResult['status'] {
  return {
    id: host.id,
    lastConnectionStatus: host.lastConnectionStatus,
    lastCheckedAt: host.lastCheckedAt,
    bootstrapStatus: host.bootstrapStatus,
    osHint: host.osHint,
  };
}

function generatedAppHostListResult(input: GeneratedAppHostListInput, hosts: HostRecord[]): GeneratedAppHostListResult {
  const safeHosts = hosts.map(generatedAppHostSummary);
  return {
    ...input,
    hosts: safeHosts,
    hostCount: safeHosts.length,
  };
}

function generatedAppHostGetResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:get' }>,
  host: HostRecord | null,
): GeneratedAppHostGetResult {
  return {
    ...input,
    host: host ? generatedAppHostSummary(host) : null,
    found: Boolean(host),
  };
}

function generatedAppHostStatusResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:getStatus' }>,
  host: HostRecord | null,
): GeneratedAppHostStatusResult {
  return {
    ...input,
    status: host ? generatedAppHostStatus(host) : null,
    found: Boolean(host),
  };
}

function generatedAppHostCapabilitiesResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:getCapabilities' }>,
  host: HostRecord | null,
): GeneratedAppHostCapabilitiesResult {
  return {
    ...input,
    capabilities: host ? [...host.capabilities] : [],
    found: Boolean(host),
  };
}

function generatedAppHostTestConnectionResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:testConnection' }>,
  result: ConnectionTestResult,
): GeneratedAppHostTestConnectionResult {
  return {
    ...input,
    status: result.status,
    success: result.success,
    message: result.message,
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    protocolDetected: result.protocolDetected,
    errorCode: result.errorCode,
  };
}

function generatedAppHostRouteSuccessMetadata(result: GeneratedAppHostSdkResult): Record<string, unknown> {
  const found = 'found' in result ? result.found : true;
  return {
    appId: result.appId,
    windowId: result.windowId,
    method: result.method,
    hostId: 'hostId' in result ? result.hostId : null,
    hostCount: 'hostCount' in result ? result.hostCount : null,
    found,
    success: 'success' in result ? result.success : null,
    status: 'status' in result && typeof result.status === 'string' ? result.status : null,
    capability: generatedAppHostCapabilityForMethod(result),
    hostCredentialsLogged: false,
    hostNotesLogged: false,
    sourceCodeLogged: false,
    packageMetadataLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

function bootstrapGenerateRouteSuccessMetadata(
  result: BootstrapGenerateResult,
  input: BootstrapGenerateInput,
): Record<string, unknown> {
  return {
    presetId: result.preset.id,
    hostId: result.hostId,
    installPackages: input.options?.installPackages ?? true,
    includeDockerCheck: input.options?.includeDockerCheck ?? false,
    generatedScriptLogged: false,
    generatedScriptLength: result.script.length,
    generatedScriptLineCount: result.script.split(/\r?\n/).length,
    executesRemotely: false,
  };
}

function operatorProposeRouteSuccessMetadata(result: OperatorProposeResult): Record<string, unknown> {
  return {
    mode: result.mode,
    endpointId: result.endpointId,
    proposalCount: result.proposals.length,
    warningCount: result.warnings.length,
    proposalOnly: true,
    structuredActionExecution: false,
    operatorRequestLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

function operatorActionRouteSuccessMetadata(result: OperatorActionExecuteResult): Record<string, unknown> {
  return {
    proposalId: result.proposalId,
    proposalSource: result.proposalSource,
    proposalRisk: result.proposalRisk,
    actionKind: result.actionKind,
    executionStatus: result.status,
    terminalSessionId: result.terminalSessionId,
    terminalStartStatus: result.terminalStartStatus,
    terminalWriteAccepted: result.terminalWriteAccepted,
    requiresApproval: result.requiresApproval,
    approved: result.approved,
    proposalOnly: false,
    structuredActionExecution: true,
    operatorRequestLogged: false,
    requestLogged: false,
    proposedCommandsLogged: false,
    commandLogged: false,
    terminalInputLogged: false,
    commandOutputLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
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
