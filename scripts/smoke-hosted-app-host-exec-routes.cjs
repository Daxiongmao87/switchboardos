#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { HOST_ROUTE_CONTRACTS } = require('../dist/src/main/route-access-contracts.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');
const { SshService } = require('../dist/src/main/ssh-service.js');

function unusedApi() {
  throw new Error('This smoke uses hosted app-host exec routes only.');
}

async function main() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-app-host-exec-static-'));
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-app-host-exec-store-'));
  const store = new MvpSqliteStore(() => storeDir);
  const host = store.createHost({
    name: 'SECRET_EXEC_HOST_NAME',
    address: '127.0.0.1',
    hostname: '127.0.0.1',
    port: 22,
    username: 'SECRET_EXEC_USER',
    authMode: 'agent',
    keyPath: '/tmp/SECRET_EXEC_KEY',
    credentialRefId: 'SECRET_EXEC_CREDENTIAL',
    tags: ['exec-smoke'],
    group: 'exec-smoke',
    favorite: false,
    osHint: 'linux',
    bootstrapStatus: 'ready',
    defaultShell: '/bin/sh',
    defaultWorkingDirectory: '/tmp',
    capabilities: ['ssh'],
    notes: 'SECRET_EXEC_NOTES',
  });
  const appId = 'hosted-app-host-exec-smoke-app';
  const deniedAppId = 'hosted-app-host-exec-denied-app';
  store.createAppManifest({
    appId,
    name: 'Hosted App Host Exec Smoke',
    version: '1.0.0',
    entrypoint: 'generated://hosted-app-host-exec-smoke',
    capabilities: ['host:actions'],
  });
  store.createAppManifest({
    appId: deniedAppId,
    name: 'Hosted App Host Exec Denied Smoke',
    version: '1.0.0',
    entrypoint: 'generated://hosted-app-host-exec-denied-smoke',
    capabilities: [],
  });
  store.createAppPermission({
    appId,
    capability: 'host:actions',
    granted: true,
  });

  const providerExecInputs = [];
  const provider = {
    name: 'hosted-app-host-exec-smoke-provider',
    buildShellCommand: () => ({ command: 'ssh', args: [] }),
    exec: async (input) => {
      providerExecInputs.push(input);
      const now = new Date().toISOString();
      return {
        hostId: input.host.id,
        command: input.command,
        stdout: 'generated-host-exec-smoke-output',
        stderr: '',
        exitCode: 0,
        durationMs: 12,
        startedAt: now,
        completedAt: now,
        status: 'success',
        error: null,
      };
    },
    listDir: unusedApi,
    stat: unusedApi,
    upload: unusedApi,
    download: unusedApi,
    delete: unusedApi,
    move: unusedApi,
  };

  let policyMode = 'permissive';
  const policyService = new PolicyService(
    () => ({ operator: { policy: policyMode } }),
    (event) => store.logAuditEvent(event),
  );
  const sshService = new SshService(
    (hostId) => store.getHost(hostId),
    (event) => store.logAuditEvent(event),
    null,
    provider,
  );
  const server = new HostedServer({
    host: '127.0.0.1',
    port: 0,
    staticRoot,
    store,
    terminalSessions: {},
    hostOperations: {},
    sshService,
    agentOperator: {},
    policyService,
    getAppInfo: () => ({
      isPackaged: false,
      version: '0.0.0-smoke',
      platform: process.platform,
      electronVersion: undefined,
      chromeVersion: undefined,
      nodeVersion: process.versions.node,
      hosted: true,
      hostedSecurity: {
        authRequired: true,
        lanEnabled: false,
        tlsGuidance: 'MVP hosted app-host exec route smoke.',
      },
    }),
    listWorkspaceFiles: unusedApi,
    createWorkspaceFolder: unusedApi,
    createWorkspaceFile: unusedApi,
    readWorkspaceArtifactContent: unusedApi,
    updateWorkspaceArtifactContent: unusedApi,
    renameWorkspaceFile: unusedApi,
    duplicateWorkspaceFile: unusedApi,
    copyWorkspaceFile: unusedApi,
    moveWorkspaceFile: unusedApi,
    deleteWorkspaceFilePermanent: unusedApi,
    listWorkspaceTrash: unusedApi,
    moveWorkspaceFileToTrash: unusedApi,
    restoreWorkspaceTrashItem: unusedApi,
    deleteWorkspaceTrashItemPermanent: unusedApi,
    emptyWorkspaceTrash: unusedApi,
    auth: {
      required: true,
      accessToken: 'app-host-exec-smoke-token',
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const hostedContract = requireContract('hosted:POST:/api/app-host/exec');
    assert.equal(hostedContract.capability, 'host:actions');
    assert.equal(hostedContract.identity.appIdentityRequired, true);
    assert.equal(hostedContract.successAudit.eventType, 'app_host_sdk.executed');
    assert.equal(hostedContract.successAudit.metadata.commandTextLogged, false);
    assert.equal(hostedContract.successAudit.metadata.commandOutputLogged, false);
    assert.equal(hostedContract.parity.peerRouteId, 'ipc:app-host:exec');

    const ipcContract = requireContract('ipc:app-host:exec');
    assert.equal(ipcContract.parity.peerRouteId, 'hosted:POST:/api/app-host/exec');
    assert.equal(ipcContract.requestValidator, 'validateGeneratedAppHostExecInput');

    const unauthenticated = await jsonRequest(baseUrl, '/api/app-host/exec', {
      method: 'POST',
      body: {
        appId,
        windowId: 'window-hosted-exec-smoke',
        method: 'host:exec',
        hostId: host.id,
        command: 'printf --token SECRET_HOSTED_APP_HOST_EXEC',
      },
    });
    assert.equal(unauthenticated.status, 401, 'app-host exec requires hosted token session');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'app-host-exec-smoke-token' },
    });
    assert.equal(login.status, 200, `hosted token login succeeds: ${login.text}`);
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const missingCsrf = await jsonRequest(baseUrl, '/api/app-host/exec', {
      method: 'POST',
      cookie,
      body: {
        appId,
        windowId: 'window-hosted-exec-smoke',
        method: 'host:exec',
        hostId: host.id,
        command: 'printf --token SECRET_HOSTED_APP_HOST_EXEC',
      },
    });
    assert.equal(missingCsrf.status, 403, 'app-host exec requires CSRF in token-auth mode');
    assert.equal(providerExecInputs.length, 0, 'CSRF-denied exec does not reach SSH provider');

    const invalidMethod = await jsonRequest(baseUrl, '/api/app-host/exec', {
      method: 'POST',
      cookie,
      csrfToken,
      body: {
        appId,
        windowId: 'window-hosted-exec-smoke',
        method: 'host:testConnection',
        hostId: host.id,
        command: 'printf --token SECRET_HOSTED_APP_HOST_EXEC',
      },
    });
    assert.equal(invalidMethod.status, 400, 'app-host exec rejects the wrong SDK method');
    assert.equal(providerExecInputs.length, 0, 'invalid exec payload does not reach SSH provider');

    const denied = await jsonRequest(baseUrl, '/api/app-host/exec', {
      method: 'POST',
      cookie,
      csrfToken,
      body: {
        appId: deniedAppId,
        windowId: 'window-hosted-exec-denied-smoke',
        method: 'host:exec',
        hostId: host.id,
        command: 'printf --token SECRET_DENIED_HOSTED_APP_HOST_EXEC',
        timeoutMs: 3000,
      },
    });
    assert.equal(denied.status, 403, 'app-host exec requires granted host:actions permission');
    assert.equal(providerExecInputs.length, 0, 'permission-denied exec does not reach SSH provider');

    const executed = await jsonRequest(baseUrl, '/api/app-host/exec', {
      method: 'POST',
      cookie,
      csrfToken,
      body: {
        appId,
        windowId: 'window-hosted-exec-smoke',
        method: 'host:exec',
        hostId: host.id,
        command: 'printf --token SECRET_HOSTED_APP_HOST_EXEC',
        timeoutMs: 3000,
      },
    });
    assert.equal(executed.status, 200, `app-host exec succeeds: ${executed.text}`);
    assert.equal(executed.json.appId, appId);
    assert.equal(executed.json.windowId, 'window-hosted-exec-smoke');
    assert.equal(executed.json.method, 'host:exec');
    assert.equal(executed.json.hostId, host.id);
    assert.equal(executed.json.status, 'success');
    assert.equal(executed.json.stdout, 'generated-host-exec-smoke-output');
    assert.equal(Object.prototype.hasOwnProperty.call(executed.json, 'command'), false, 'generated app exec response does not echo command text');
    assert.equal(providerExecInputs.length, 1, 'successful exec reaches SSH provider once');
    assert.equal(providerExecInputs[0].command, 'printf --token SECRET_HOSTED_APP_HOST_EXEC');
    assert.equal(providerExecInputs[0].timeoutMs, 3000);
    assert.equal(providerExecInputs[0].host.id, host.id);

    policyMode = 'disabled';
    const policyDenied = await jsonRequest(baseUrl, '/api/app-host/exec', {
      method: 'POST',
      cookie,
      csrfToken,
      body: {
        appId,
        windowId: 'window-hosted-exec-smoke',
        method: 'host:exec',
        hostId: host.id,
        command: 'printf --token SECRET_POLICY_DENIED_HOSTED_APP_HOST_EXEC',
        timeoutMs: 3000,
      },
    });
    assert.equal(policyDenied.status, 403, 'disabled policy denies app-host exec');
    assert.equal(providerExecInputs.length, 1, 'policy-denied exec does not reach SSH provider');
    policyMode = 'permissive';

    const audits = store.listAuditEvents();
    const execAudit = requireAuditByContract(audits, 'app_host_sdk.executed', 'hosted:POST:/api/app-host/exec');
    assert.equal(execAudit.entityId, host.id);
    assert.equal(execAudit.metadata.appId, appId);
    assert.equal(execAudit.metadata.windowId, 'window-hosted-exec-smoke');
    assert.equal(execAudit.metadata.method, 'host:exec');
    assert.equal(execAudit.metadata.policyCapability, 'host:actions');
    assert.equal(execAudit.metadata.commandTextLogged, false);
    assert.equal(execAudit.metadata.commandOutputLogged, false);
    assert.equal(execAudit.metadata.remoteCommandExecution, true);
    assert.equal(execAudit.metadata.hostCredentialsLogged, false);
    assert.equal(execAudit.metadata.hostNotesLogged, false);
    assert.equal(execAudit.metadata.secretsLogged, false);

    const appDeniedAudit = audits.find((event) => event.type === 'app_host_sdk.denied'
      && event.metadata.appId === deniedAppId
      && event.metadata.method === 'host:exec');
    assert.ok(appDeniedAudit, 'app permission denial audit was written for blocked app-host exec');
    assert.equal(appDeniedAudit.metadata.capability, 'host:actions');
    assert.equal(appDeniedAudit.metadata.commandTextLogged, false);
    assert.equal(appDeniedAudit.metadata.commandOutputLogged, false);
    assert.equal(appDeniedAudit.metadata.secretsLogged, false);

    const policyDeniedAudit = audits.find((event) => event.type === 'policy.denied'
      && event.metadata.capability === 'host:actions'
      && event.metadata.route === '/api/app-host/exec'
      && event.metadata.appId === appId);
    assert.ok(policyDeniedAudit, 'policy denial audit was written for blocked app-host exec');
    assert.equal(policyDeniedAudit.metadata.route, '/api/app-host/exec');
    assert.equal(policyDeniedAudit.metadata.secretsLogged, false);

    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes('SECRET_HOSTED_APP_HOST_EXEC'), false, 'successful command text was not written to audit');
    assert.equal(auditJson.includes('SECRET_DENIED_HOSTED_APP_HOST_EXEC'), false, 'permission-denied command text was not written to audit');
    assert.equal(auditJson.includes('SECRET_POLICY_DENIED_HOSTED_APP_HOST_EXEC'), false, 'policy-denied command text was not written to audit');
    assert.equal(auditJson.includes('generated-host-exec-smoke-output'), false, 'exec stdout was not written to audit');
    assert.equal(auditJson.includes('SECRET_EXEC_HOST_NAME'), false, 'host name was not written to audit');
    assert.equal(auditJson.includes('SECRET_EXEC_USER'), false, 'host username was not written to audit');
    assert.equal(auditJson.includes('SECRET_EXEC_KEY'), false, 'host key path was not written to audit');
    assert.equal(auditJson.includes('SECRET_EXEC_CREDENTIAL'), false, 'host credential ref was not written to audit');
    assert.equal(auditJson.includes('SECRET_EXEC_NOTES'), false, 'host notes were not written to audit');

    console.log('hosted app-host exec route smoke: token auth, CSRF, app permission, policy, SshService dispatch, structured result, and sanitized audit passed');
  } finally {
    server.close();
    store.close();
    fs.rmSync(staticRoot, { recursive: true, force: true });
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
}

function requireContract(id) {
  const contract = HOST_ROUTE_CONTRACTS.find((candidate) => candidate.id === id);
  assert.ok(contract, `route contract exists for ${id}`);
  return contract;
}

function requireAuditByContract(audits, type, contractId) {
  const audit = audits.find((event) => event.type === type && event.metadata.contractId === contractId);
  assert.ok(audit, `${type} audit was written for ${contractId}`);
  return audit;
}

function cookieHeader(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return setCookies
    .flatMap((value) => String(value).split(/,(?=[^;]+=[^;]+)/))
    .map((value) => value.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const headers = {
    accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.csrfToken) {
    headers['x-switchboardos-csrf'] = options.csrfToken;
  }
  const init = {
    method: options.method ?? 'GET',
    headers,
  };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, response, text };
}

function csrfFromCookie(cookie) {
  const match = cookie.match(/(?:^|; )sb_hosted_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
