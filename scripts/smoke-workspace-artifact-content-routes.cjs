#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

const TOKEN = 'workspace-artifact-smoke-token';
const SECRET_MARKER = 'WORKSPACE_ARTIFACT_SECRET_MARKER_SHOULD_NOT_BE_AUDITED';
const ARTIFACT_PATH = 'Apps/Test Applet.sbapplet.json';

class FakeStore {
  constructor() {
    this.auditEvents = [];
  }

  logAuditEvent(input) {
    const event = {
      id: `audit-${this.auditEvents.length + 1}`,
      createdAt: new Date(0).toISOString(),
      ...input,
      metadata: input.metadata ?? {},
    };
    this.auditEvents.push(event);
    return event;
  }
}

class FakeWorkspaceArtifacts {
  constructor() {
    this.files = new Map();
    this.files.set(ARTIFACT_PATH, JSON.stringify({
      schemaVersion: 1,
      kind: 'applet',
      name: 'Test Applet',
      capabilities: ['storage:scoped'],
      hiddenSource: SECRET_MARKER,
    }, null, 2));
  }

  read(relativePath) {
    const content = this.files.get(relativePath);
    if (!content) {
      throw new Error(`Missing artifact ${relativePath}`);
    }
    const manifest = JSON.parse(content);
    return {
      path: relativePath,
      name: path.basename(relativePath),
      kind: manifest.kind,
      content,
      contentType: 'application/json',
      manifest,
      capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      size: Buffer.byteLength(content),
    };
  }

  update(input) {
    this.files.set(input.path, input.content);
    return this.read(input.path);
  }
}

function emptyWorkspaceFile() {
  throw new Error('workspace file APIs are not used by this smoke.');
}

async function main() {
  const store = new FakeStore();
  const artifacts = new FakeWorkspaceArtifacts();
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
        tlsGuidance: 'smoke',
      },
    }),
    listWorkspaceFiles: emptyWorkspaceFile,
    createWorkspaceFolder: emptyWorkspaceFile,
    createWorkspaceFile: emptyWorkspaceFile,
    readWorkspaceArtifactContent: (relativePath) => artifacts.read(relativePath),
    updateWorkspaceArtifactContent: (input) => artifacts.update(input),
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
    const unauthenticated = await jsonRequest(
      baseUrl,
      `/api/workspace-artifacts/content?path=${encodeURIComponent(ARTIFACT_PATH)}`,
    );
    assert.equal(unauthenticated.status, 401, 'unauthenticated artifact content route requires login');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: TOKEN },
    });
    assert.equal(login.status, 200, 'hosted token login succeeds');
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const getResult = await jsonRequest(
      baseUrl,
      `/api/workspace-artifacts/content?path=${encodeURIComponent(ARTIFACT_PATH)}`,
      { cookie },
    );
    assert.equal(getResult.status, 200, 'artifact content read succeeds through hosted API');
    assert.equal(getResult.json.path, ARTIFACT_PATH);
    assert.equal(getResult.json.kind, 'applet');
    assert.equal(getResult.json.content.includes(SECRET_MARKER), true, 'read returns artifact content to authorized caller');

    const updatedContent = JSON.stringify({
      schemaVersion: 1,
      kind: 'applet',
      name: 'Updated Test Applet',
      capabilities: ['storage:scoped', 'host:read'],
      hiddenSource: SECRET_MARKER,
    }, null, 2);

    const missingCsrf = await jsonRequest(baseUrl, '/api/workspace-artifacts/content', {
      method: 'PUT',
      cookie,
      body: { path: ARTIFACT_PATH, content: updatedContent },
    });
    assert.equal(missingCsrf.status, 403, 'state-changing artifact content request requires CSRF token');

    const deniedUpdate = await jsonRequest(baseUrl, '/api/workspace-artifacts/content', {
      method: 'PUT',
      cookie,
      csrfToken,
      body: { path: ARTIFACT_PATH, content: updatedContent },
    });
    assert.equal(deniedUpdate.status, 403, 'safe policy denies workspace artifact content update');

    policyMode = 'balanced';
    const updateResult = await jsonRequest(baseUrl, '/api/workspace-artifacts/content', {
      method: 'PUT',
      cookie,
      csrfToken,
      body: { path: ARTIFACT_PATH, content: updatedContent },
    });
    assert.equal(updateResult.status, 200, 'balanced policy allows workspace artifact content update');
    assert.equal(updateResult.json.manifest.name, 'Updated Test Applet');
    assert.equal(updateResult.json.capabilities.length, 2);

    const readAudit = store.auditEvents.find((event) => event.type === 'workspace_artifact_content.read');
    const updateAudit = store.auditEvents.find((event) => event.type === 'workspace_artifact_content.updated');
    const policyDenied = store.auditEvents.find((event) => event.type === 'policy.denied'
      && event.metadata?.capability === 'workspace-file:write');
    assert.ok(readAudit, 'read route audit was written');
    assert.ok(updateAudit, 'update route audit was written');
    assert.ok(policyDenied, 'write denial audit was written');
    assert.equal(readAudit.metadata.contractId, 'hosted:GET:/api/workspace-artifacts/content');
    assert.equal(updateAudit.metadata.contractId, 'hosted:PUT:/api/workspace-artifacts/content');
    assert.equal(readAudit.metadata.policyCapability, 'workspace-file:read');
    assert.equal(updateAudit.metadata.policyCapability, 'workspace-file:write');
    assert.equal(readAudit.metadata.artifactContentLogged, false);
    assert.equal(updateAudit.metadata.manifestLogged, false);
    assert.equal(updateAudit.metadata.fileContentsLogged, false);
    assert.equal(typeof updateAudit.metadata.pathHash, 'string');

    const auditJson = JSON.stringify(store.auditEvents);
    assert.equal(auditJson.includes(SECRET_MARKER), false, 'audit does not include raw artifact content marker');
    assert.equal(auditJson.includes(ARTIFACT_PATH), false, 'audit does not include raw artifact path');

    console.log('workspace artifact content route smoke: hosted auth, CSRF, policy, read/update, and sanitized audit passed');
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
