#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

const STATIC_ROOT = path.resolve(__dirname, '..', 'dist', 'renderer');

function unusedApi() {
  throw new Error('This smoke uses hosted app info and host create routes only.');
}

async function main() {
  assert.ok(fs.existsSync(path.join(STATIC_ROOT, 'index.html')), 'renderer build must exist before hosted no-auth smoke');
  assert.ok(fs.existsSync(path.join(STATIC_ROOT, 'main.js')), 'renderer main.js must exist before hosted no-auth smoke');

  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-no-auth-'));
  const store = new MvpSqliteStore(() => storeDir);
  const policyService = new PolicyService(
    () => ({ operator: { policy: 'permissive' } }),
    (event) => store.logAuditEvent(event),
  );
  const server = new HostedServer({
    host: '127.0.0.1',
    port: 0,
    staticRoot: STATIC_ROOT,
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
        authRequired: false,
        lanEnabled: true,
        tlsGuidance: 'MVP no-auth hosted test mode.',
      },
    }),
    listWorkspaceFiles: unusedApi,
    createWorkspaceFolder: unusedApi,
    createWorkspaceFile: unusedApi,
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
      required: false,
      accessToken: null,
      sessionTtlMs: 60_000,
      lanEnabled: true,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const root = await textRequest(baseUrl, '/');
    assert.equal(root.status, 200, 'hosted app shell is reachable without token login');
    assert.equal(root.text.includes('Access token'), false, 'hosted app shell is not the token login page');

    const mainBundle = await textRequest(baseUrl, '/main.js');
    assert.equal(mainBundle.status, 200, 'hosted main.js bundle is reachable without token login');

    const session = await jsonRequest(baseUrl, '/api/auth/session');
    assert.equal(session.status, 200, 'session endpoint is reachable without token login');
    assert.equal(session.json.loginRequired, false, 'session reports no login requirement');
    assert.equal(session.json.authenticated, true, 'session reports authenticated in no-auth hosted mode');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'ignored-in-no-auth-mode' },
    });
    assert.equal(login.status, 200, 'login route remains harmless in no-auth hosted mode');
    assert.equal(login.json.loginRequired, false);
    assert.equal(login.json.authenticated, true);

    const appInfo = await jsonRequest(baseUrl, '/api/app/info');
    assert.equal(appInfo.status, 200, 'hosted app info is reachable without token login');
    assert.equal(appInfo.json.hostedSecurity.authRequired, false);

    const createHost = await jsonRequest(baseUrl, '/api/hosts', {
      method: 'POST',
      body: {
        name: 'No-auth smoke host',
        address: '127.0.0.1',
        port: 22,
        username: 'agent',
        authMode: 'agent',
        tags: ['smoke', 'hosted'],
        osHint: 'linux',
        bootstrapStatus: 'not_started',
      },
    });
    assert.equal(
      createHost.status,
      200,
      `state-changing hosted API succeeds without token, session cookie, or CSRF header: ${createHost.text}`,
    );
    assert.ok(createHost.json.id, 'state-changing hosted route returned persisted host id');
    assert.equal(store.listHosts().length, 1, 'state-changing hosted route persisted to real SQLite store');
    const storedHost = store.getHost(createHost.json.id);
    assert.deepEqual(storedHost.tags, ['smoke', 'hosted'], 'state-changing hosted route preserved host tags in SQLite');

    const createAudit = store.listAuditEvents().find((event) => event.type === 'host.created');
    assert.ok(createAudit, 'state-changing hosted route wrote success audit');
    assert.equal(createAudit.metadata.contractId, 'hosted:POST:/api/hosts');
    assert.equal(createAudit.metadata.policyCapability, 'host:create');
    assert.equal(createAudit.metadata.policyDecision, 'allowed');

    console.log('hosted no-auth smoke: app shell, session, login no-op, app info, state-changing API, policy, and audit passed');
  } finally {
    server.close();
    store.close();
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
}

async function textRequest(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      accept: 'text/html,application/javascript',
    },
  });
  const text = await response.text();
  return { status: response.status, response, text };
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const headers = {
    accept: 'application/json',
    ...(options.headers ?? {}),
  };
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
