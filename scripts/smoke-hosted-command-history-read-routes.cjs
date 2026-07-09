#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { HOST_ROUTE_CONTRACTS } = require('../dist/src/main/route-access-contracts.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

function unusedApi() {
  throw new Error('This smoke uses hosted command-history routes only.');
}

async function main() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-command-history-static-'));
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-command-history-store-'));
  const store = new MvpSqliteStore(() => storeDir);
  let policyMode = 'permissive';
  const policyService = new PolicyService(
    () => ({ operator: { policy: policyMode } }),
    (event) => store.logAuditEvent(event),
  );
  const server = new HostedServer({
    host: '127.0.0.1',
    port: 0,
    staticRoot,
    store,
    terminalSessions: {},
    hostOperations: {},
    sshService: {},
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
        tlsGuidance: 'MVP hosted command-history route smoke.',
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
      accessToken: 'command-history-smoke-token',
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const hostedReadContract = requireContract('hosted:GET:/api/command-history/:id');
    assert.equal(hostedReadContract.successAudit.required, false);
    assert.equal(hostedReadContract.successAudit.metadata.actionClass, 'command-history-route');
    assert.equal(hostedReadContract.successAudit.metadata.mutatingOperation, false);
    assert.equal(hostedReadContract.successAudit.metadata.commandLogged, false);
    assert.equal(hostedReadContract.successAudit.metadata.commandOutputLogged, false);
    assert.equal(hostedReadContract.parity.peerRouteId, 'ipc:command-history:get');

    const ipcReadContract = requireContract('ipc:command-history:get');
    assert.equal(ipcReadContract.parity.peerRouteId, 'hosted:GET:/api/command-history/:id');
    assert.equal(ipcReadContract.successAudit.metadata.commandLogged, false);
    assert.equal(ipcReadContract.successAudit.metadata.commandOutputLogged, false);

    const unauthenticated = await jsonRequest(baseUrl, '/api/command-history');
    assert.equal(unauthenticated.status, 401, 'command history list requires hosted token session');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'command-history-smoke-token' },
    });
    assert.equal(login.status, 200, `hosted token login succeeds: ${login.text}`);
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const missingBeforeCreate = await jsonRequest(baseUrl, '/api/command-history/missing-entry', { cookie });
    assert.equal(missingBeforeCreate.status, 200, 'missing command history read succeeds');
    assert.equal(missingBeforeCreate.json, null, 'missing command history entry returns null');

    const createInput = {
      command: 'SECRET_COMMAND_TEXT --token SECRET_COMMAND_TOKEN',
      hostId: 'host-command-history-smoke',
      sessionId: 'session-command-history-smoke',
      exitCode: 0,
      durationMs: 321,
    };
    const missingCsrfCreate = await jsonRequest(baseUrl, '/api/command-history', {
      method: 'POST',
      cookie,
      body: createInput,
    });
    assert.equal(missingCsrfCreate.status, 403, 'command history create requires CSRF in token-auth mode');
    assert.equal(store.listCommandHistory().length, 0, 'CSRF-denied command history create does not persist');

    const created = await jsonRequest(baseUrl, '/api/command-history', {
      method: 'POST',
      cookie,
      csrfToken,
      body: createInput,
    });
    assert.equal(created.status, 200, `command history create succeeds: ${created.text}`);
    assert.ok(created.json.id, 'command history create returns an id');
    assert.equal(created.json.command, createInput.command);
    assert.equal(
      store.getCommandHistoryEntry(created.json.id).command,
      createInput.command,
      'create persists command history entry in SQLite',
    );

    const fetched = await jsonRequest(baseUrl, `/api/command-history/${created.json.id}`, { cookie });
    assert.equal(fetched.status, 200, 'command history read-by-id succeeds');
    assert.equal(fetched.json.id, created.json.id);
    assert.equal(fetched.json.command, createInput.command);
    assert.equal(fetched.json.hostId, createInput.hostId);

    const listed = await jsonRequest(baseUrl, '/api/command-history', { cookie });
    assert.equal(listed.status, 200, 'command history list succeeds');
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].id, created.json.id);

    const invalidLimit = await jsonRequest(baseUrl, '/api/command-history?limit=0', { cookie });
    assert.equal(invalidLimit.status, 400, 'invalid command history list limit is rejected');

    await new Promise((resolve) => setTimeout(resolve, 5));
    const secondInput = {
      command: 'SECOND_SECRET_COMMAND --token SECOND_SECRET_TOKEN',
      hostId: 'host-command-history-smoke',
      sessionId: 'session-command-history-smoke-2',
      exitCode: 1,
      durationMs: 654,
    };
    const secondCreated = await jsonRequest(baseUrl, '/api/command-history', {
      method: 'POST',
      cookie,
      csrfToken,
      body: secondInput,
    });
    assert.equal(secondCreated.status, 200, `second command history create succeeds: ${secondCreated.text}`);
    assert.ok(secondCreated.json.id, 'second command history create returns an id');

    const limitedList = await jsonRequest(baseUrl, '/api/command-history?limit=1', { cookie });
    assert.equal(limitedList.status, 200, 'limited command history list succeeds');
    assert.equal(limitedList.json.length, 1, 'limited command history list returns one entry');
    assert.equal(limitedList.json[0].id, secondCreated.json.id, 'limited command history list returns the newest entry');

    policyMode = 'disabled';
    const policyDeniedRead = await jsonRequest(baseUrl, `/api/command-history/${created.json.id}`, { cookie });
    assert.equal(policyDeniedRead.status, 403, 'disabled policy denies command history read');
    policyMode = 'permissive';

    const deleted = await jsonRequest(baseUrl, `/api/command-history/${created.json.id}`, {
      method: 'DELETE',
      cookie,
      csrfToken,
    });
    assert.equal(deleted.status, 200, 'command history delete succeeds');
    assert.equal(deleted.json, true);
    assert.equal(store.getCommandHistoryEntry(created.json.id), null, 'delete removes command history entry from SQLite');

    const missingAfterDelete = await jsonRequest(baseUrl, `/api/command-history/${created.json.id}`, { cookie });
    assert.equal(missingAfterDelete.status, 200, 'deleted command history read succeeds');
    assert.equal(missingAfterDelete.json, null, 'deleted command history entry returns null');

    const audits = store.listAuditEvents();
    const createAudit = requireAuditByContract(audits, 'command_history.created', 'hosted:POST:/api/command-history');
    assert.equal(createAudit.metadata.policyCapability, 'command-history:create');
    assert.equal(createAudit.metadata.hasHostId, true);
    assert.equal(createAudit.metadata.hasSessionId, true);
    assert.equal(createAudit.metadata.hasExitCode, true);
    assert.equal(createAudit.metadata.hasDurationMs, true);
    assert.equal(createAudit.metadata.commandLogged, false);
    assert.equal(createAudit.metadata.commandOutputLogged, false);

    const deleteAudit = requireAuditByContract(audits, 'command_history.deleted', 'hosted:DELETE:/api/command-history/:id');
    assert.equal(deleteAudit.metadata.policyCapability, 'command-history:delete');
    assert.equal(deleteAudit.metadata.entityId, created.json.id);
    assert.equal(deleteAudit.metadata.deleted, true);
    assert.equal(deleteAudit.metadata.commandLogged, false);
    assert.equal(deleteAudit.metadata.commandOutputLogged, false);

    const deniedAudit = audits.find((event) => event.type === 'policy.denied'
      && event.metadata.capability === 'command-history:read');
    assert.ok(deniedAudit, 'policy denial audit was written for blocked command history read');
    assert.equal(deniedAudit.metadata.route, '/api/command-history/:id');
    assert.equal(deniedAudit.metadata.entityId, created.json.id);
    assert.equal(deniedAudit.metadata.secretsLogged, false);

    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes('SECRET_COMMAND_TEXT'), false, 'command text was not written to audit');
    assert.equal(auditJson.includes('SECRET_COMMAND_TOKEN'), false, 'command token text was not written to audit');
    assert.equal(auditJson.includes('SECOND_SECRET_COMMAND'), false, 'second command text was not written to audit');
    assert.equal(auditJson.includes('SECOND_SECRET_TOKEN'), false, 'second command token text was not written to audit');
    assert.equal(auditJson.includes(createInput.sessionId), false, 'session id was not written through command payload audit');
    assert.equal(auditJson.includes(secondInput.sessionId), false, 'second session id was not written through command payload audit');

    console.log('hosted command-history read route smoke: get/list limit parity, token auth, CSRF, policy, persistence, missing null, and sanitized audit passed');
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
