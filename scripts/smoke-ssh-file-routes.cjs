#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

const TOKEN = 'ssh-file-smoke-token';
const HOST_ID = 'ssh-file-smoke-host';
const SECRET_MARKER = 'SSH_FILE_SECRET_MARKER_SHOULD_NOT_BE_AUDITED';

class FakeStore {
  constructor() {
    this.auditEvents = [];
  }

  logAuditEvent(input) {
    const event = {
      id: `audit-${this.auditEvents.length + 1}`,
      timestamp: new Date(0).toISOString(),
      ...input,
      metadata: input.metadata ?? {},
    };
    this.auditEvents.push(event);
    return event;
  }
}

class FakeSshFileService {
  constructor() {
    this.calls = [];
  }

  async listDir(input) {
    this.calls.push({ method: 'listDir', input });
    const now = new Date(0).toISOString();
    return {
      hostId: input.hostId,
      path: input.path || '.',
      command: `listDir ${input.path || '.'}`,
      stdout: SECRET_MARKER,
      stderr: '',
      exitCode: 0,
      durationMs: 3,
      startedAt: now,
      completedAt: now,
      status: 'success',
      error: null,
      entries: [
        {
          name: 'app.log',
          path: '/var/log/app.log',
          type: 'file',
          size: 42,
          modified: now,
          permissions: '-rw-r--r--',
          owner: 'agent',
          group: 'agent',
        },
      ],
    };
  }

  async stat(input) {
    this.calls.push({ method: 'stat', input });
    const now = new Date(0).toISOString();
    return {
      hostId: input.hostId,
      path: input.path,
      command: `stat ${input.path}`,
      stdout: SECRET_MARKER,
      stderr: '',
      exitCode: 0,
      durationMs: 2,
      startedAt: now,
      completedAt: now,
      status: 'success',
      error: null,
      entry: {
        name: 'app.log',
        path: input.path,
        type: 'file',
        size: 42,
        modified: now,
        permissions: '-rw-r--r--',
        owner: 'agent',
        group: 'agent',
      },
    };
  }

  async download(input) {
    this.calls.push({ method: 'download', input });
    const now = new Date(0).toISOString();
    return {
      hostId: input.hostId,
      localPath: input.localPath,
      remotePath: input.remotePath,
      command: 'scp download',
      stdout: SECRET_MARKER,
      stderr: '',
      exitCode: 0,
      durationMs: 4,
      startedAt: now,
      completedAt: now,
      status: 'success',
      error: null,
      direction: 'download',
    };
  }

  async upload(input) {
    this.calls.push({ method: 'upload', input });
    const now = new Date(0).toISOString();
    return {
      hostId: input.hostId,
      localPath: input.localPath,
      remotePath: input.remotePath,
      command: 'scp upload',
      stdout: SECRET_MARKER,
      stderr: '',
      exitCode: 0,
      durationMs: 4,
      startedAt: now,
      completedAt: now,
      status: 'success',
      error: null,
      direction: 'upload',
    };
  }
}

function emptyWorkspaceFile() {
  throw new Error('workspace file APIs are not used by this smoke.');
}

async function main() {
  const store = new FakeStore();
  const sshService = new FakeSshFileService();
  let policyMode = 'safe';
  const policyService = new PolicyService(
    () => ({ operator: { policy: policyMode } }),
    (event) => store.logAuditEvent(event),
  );
  const server = new HostedServer({
    host: '127.0.0.1',
    port: 0,
    staticRoot: path.resolve(__dirname, '..', 'dist', 'renderer'),
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
        tlsGuidance: 'smoke',
      },
    }),
    listWorkspaceFiles: emptyWorkspaceFile,
    createWorkspaceFolder: emptyWorkspaceFile,
    createWorkspaceFile: emptyWorkspaceFile,
    renameWorkspaceFile: emptyWorkspaceFile,
    duplicateWorkspaceFile: emptyWorkspaceFile,
    copyWorkspaceFile: emptyWorkspaceFile,
    moveWorkspaceFile: emptyWorkspaceFile,
    deleteWorkspaceFilePermanent: emptyWorkspaceFile,
    listWorkspaceTrash: emptyWorkspaceFile,
    moveWorkspaceFileToTrash: emptyWorkspaceFile,
    restoreWorkspaceTrashItem: emptyWorkspaceFile,
    deleteWorkspaceTrashItemPermanent: emptyWorkspaceFile,
    emptyWorkspaceTrash: emptyWorkspaceFile,
    auth: {
      required: true,
      accessToken: TOKEN,
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const unauthenticated = await jsonRequest(baseUrl, '/api/ssh-files/list', {
      method: 'POST',
      body: { hostId: HOST_ID, path: '/var/log' },
    });
    assert.equal(unauthenticated.status, 401, 'unauthenticated SSH file route requires login');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: TOKEN },
    });
    assert.equal(login.status, 200, 'hosted token login succeeds');
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const missingCsrf = await jsonRequest(baseUrl, '/api/ssh-files/upload', {
      method: 'POST',
      cookie,
      body: { hostId: HOST_ID, localPath: '/tmp/local.txt', remotePath: '/tmp/remote.txt' },
    });
    assert.equal(missingCsrf.status, 403, 'state-changing hosted SSH file request requires CSRF token');

    const list = await jsonRequest(baseUrl, '/api/ssh-files/list', {
      method: 'POST',
      cookie,
      csrfToken,
      body: { hostId: HOST_ID, path: '/var/log', limit: 5 },
    });
    assert.equal(list.status, 200, 'SSH file list route succeeds through hosted API');
    assert.equal(list.json.hostId, HOST_ID);
    assert.equal(list.json.path, '/var/log');
    assert.equal(list.json.entries.length, 1);
    assert.equal(list.json.entries[0].name, 'app.log');

    const stat = await jsonRequest(baseUrl, '/api/ssh-files/stat', {
      method: 'POST',
      cookie,
      csrfToken,
      body: { hostId: HOST_ID, path: '/var/log/app.log' },
    });
    assert.equal(stat.status, 200, 'SSH file stat route succeeds through hosted API');
    assert.equal(stat.json.entry.name, 'app.log');

    const download = await jsonRequest(baseUrl, '/api/ssh-files/download', {
      method: 'POST',
      cookie,
      csrfToken,
      body: { hostId: HOST_ID, remotePath: '/var/log/app.log', localPath: '/tmp/downloaded-app.log' },
    });
    assert.equal(download.status, 200, 'SSH file download route succeeds through hosted API');
    assert.equal(download.json.direction, 'download');
    assert.equal(download.json.remotePath, '/var/log/app.log');
    assert.equal(sshService.calls.some((call) => call.method === 'download'), true, 'download dispatches to SSH file service');

    const deniedUpload = await jsonRequest(baseUrl, '/api/ssh-files/upload', {
      method: 'POST',
      cookie,
      csrfToken,
      body: { hostId: HOST_ID, localPath: '/tmp/local.txt', remotePath: '/tmp/remote.txt' },
    });
    assert.equal(deniedUpload.status, 403, 'safe policy denies host:file:write upload');
    assert.equal(sshService.calls.some((call) => call.method === 'upload'), false, 'denied upload does not dispatch to SSH service');

    policyMode = 'balanced';
    const upload = await jsonRequest(baseUrl, '/api/ssh-files/upload', {
      method: 'POST',
      cookie,
      csrfToken,
      body: { hostId: HOST_ID, localPath: '/tmp/local.txt', remotePath: '/tmp/remote.txt' },
    });
    assert.equal(upload.status, 200, 'balanced policy allows SSH file upload through hosted API');
    assert.equal(upload.json.direction, 'upload');
    assert.equal(upload.json.remotePath, '/tmp/remote.txt');
    assert.equal(sshService.calls.some((call) => call.method === 'upload'), true, 'permitted upload dispatches to SSH file service');

    const listAudit = store.auditEvents.find((event) => event.type === 'ssh_file.list_route_completed');
    const statAudit = store.auditEvents.find((event) => event.type === 'ssh_file.stat_route_completed');
    const downloadAudit = store.auditEvents.find((event) => event.type === 'ssh_file.download_route_completed');
    const uploadAudit = store.auditEvents.find((event) => event.type === 'ssh_file.upload_route_completed');
    const policyDenied = store.auditEvents.find((event) => event.type === 'policy.denied'
      && event.metadata?.capability === 'host:file:write');
    assert.ok(listAudit, 'list route audit was written');
    assert.ok(statAudit, 'stat route audit was written');
    assert.ok(downloadAudit, 'download route audit was written');
    assert.ok(uploadAudit, 'upload route audit was written');
    assert.ok(policyDenied, 'upload policy denial audit was written');
    assert.equal(listAudit.metadata.contractId, 'hosted:POST:/api/ssh-files/list');
    assert.equal(statAudit.metadata.contractId, 'hosted:POST:/api/ssh-files/stat');
    assert.equal(downloadAudit.metadata.contractId, 'hosted:POST:/api/ssh-files/download');
    assert.equal(uploadAudit.metadata.contractId, 'hosted:POST:/api/ssh-files/upload');
    assert.equal(listAudit.metadata.policyCapability, 'host:file:read');
    assert.equal(statAudit.metadata.policyCapability, 'host:file:read');
    assert.equal(downloadAudit.metadata.policyCapability, 'host:file:read');
    assert.equal(uploadAudit.metadata.policyCapability, 'host:file:write');
    assert.equal(listAudit.metadata.fileContentsLogged, false);
    assert.equal(statAudit.metadata.commandTextLogged, false);
    assert.equal(downloadAudit.metadata.localPathLogged, false);
    assert.equal(downloadAudit.metadata.remotePathLogged, false);
    assert.equal(uploadAudit.metadata.localPathLogged, false);
    assert.equal(uploadAudit.metadata.remotePathLogged, false);
    assert.equal(policyDenied.metadata.secretsLogged, false);

    const auditJson = JSON.stringify(store.auditEvents);
    assert.equal(auditJson.includes(SECRET_MARKER), false, 'audit does not include raw SSH provider output marker');
    assert.equal(auditJson.includes('listDir /var/log'), false, 'audit does not include SSH file command text');
    assert.equal(auditJson.includes('/tmp/local.txt'), false, 'audit does not include denied local transfer path');

    console.log('ssh file route smoke: hosted auth, CSRF, policy, list/stat/download/upload dispatch, and sanitized audit passed');
  } finally {
    server.close();
  }
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

function csrfFromCookie(cookie) {
  const match = cookie.match(/(?:^|; )sb_hosted_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
