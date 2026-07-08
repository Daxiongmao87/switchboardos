#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

function unusedApi() {
  throw new Error('This smoke uses hosted host secondary action routes only.');
}

async function main() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-host-actions-static-'));
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-host-actions-store-'));
  const store = new MvpSqliteStore(() => storeDir);
  const sourceHost = store.createHost({
    name: 'SECRET_SOURCE_HOST_NAME',
    address: 'SECRET_SOURCE_ADDRESS',
    hostname: 'SECRET_SOURCE_ADDRESS',
    port: 2222,
    username: 'SECRET_SOURCE_USER',
    authMode: 'key',
    keyPath: '/tmp/SECRET_SOURCE_KEY',
    credentialRefId: 'SECRET_SOURCE_CREDENTIAL',
    tags: ['source-tag'],
    group: 'old-group',
    favorite: false,
    osHint: 'linux',
    bootstrapStatus: 'ready',
    defaultShell: '/bin/bash',
    defaultWorkingDirectory: '/srv/source',
    capabilities: ['ssh'],
    notes: 'SECRET_SOURCE_NOTES',
  });
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
        tlsGuidance: 'MVP hosted host secondary action route smoke.',
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
      accessToken: 'host-secondary-action-smoke-token',
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const unauthenticated = await jsonRequest(baseUrl, `/api/hosts/${sourceHost.id}/group`, {
      method: 'PATCH',
      body: { groupName: 'blocked-before-login' },
    });
    assert.equal(unauthenticated.status, 401, 'host group action requires hosted token session');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'host-secondary-action-smoke-token' },
    });
    assert.equal(login.status, 200, `hosted token login succeeds: ${login.text}`);
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const groupMissingCsrf = await jsonRequest(baseUrl, `/api/hosts/${sourceHost.id}/group`, {
      method: 'PATCH',
      cookie,
      body: { groupName: 'SECRET_GROUP_WITHOUT_CSRF' },
    });
    assert.equal(groupMissingCsrf.status, 403, 'state-changing host group action requires CSRF');
    assert.equal(store.getHost(sourceHost.id).group, 'old-group', 'CSRF denial does not mutate SQLite host group');

    const updatedGroup = await jsonRequest(baseUrl, `/api/hosts/${sourceHost.id}/group`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: { groupName: 'SECRET_GROUP_NAME' },
    });
    assert.equal(updatedGroup.status, 200, `host group action succeeds: ${updatedGroup.text}`);
    assert.equal(updatedGroup.json.group, 'SECRET_GROUP_NAME');
    assert.equal(store.getHost(sourceHost.id).group, 'SECRET_GROUP_NAME', 'host group action persists in SQLite');

    const updatedFavorite = await jsonRequest(baseUrl, `/api/hosts/${sourceHost.id}/favorite`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: { favorite: true },
    });
    assert.equal(updatedFavorite.status, 200, `host favorite action succeeds: ${updatedFavorite.text}`);
    assert.equal(updatedFavorite.json.favorite, true);
    assert.equal(store.getHost(sourceHost.id).favorite, true, 'host favorite action persists in SQLite');

    const duplicated = await jsonRequest(baseUrl, `/api/hosts/${sourceHost.id}/duplicate`, {
      method: 'POST',
      cookie,
      csrfToken,
    });
    assert.equal(duplicated.status, 200, `host duplicate action succeeds: ${duplicated.text}`);
    assert.ok(duplicated.json.id, 'host duplicate returns a persisted host id');
    assert.notEqual(duplicated.json.id, sourceHost.id, 'host duplicate creates a new host id');
    assert.equal(store.getHost(duplicated.json.id).name, 'SECRET_SOURCE_HOST_NAME (copy)', 'duplicate host persists in SQLite');

    const importedHost = makeHostRecord('import-host-id', 'SECRET_IMPORTED_HOST_NAME');
    const imported = await jsonRequest(baseUrl, '/api/hosts/import', {
      method: 'POST',
      cookie,
      csrfToken,
      body: [importedHost],
    });
    assert.equal(imported.status, 200, `host import action succeeds: ${imported.text}`);
    assert.deepEqual(imported.json, ['import-host-id']);
    assert.equal(
      store.getHost('import-host-id').name,
      'SECRET_IMPORTED_HOST_NAME',
      'host import action persists the returned id through MvpSqliteStore importHosts',
    );

    policyMode = 'safe';
    const policyDeniedDuplicate = await jsonRequest(baseUrl, `/api/hosts/${sourceHost.id}/duplicate`, {
      method: 'POST',
      cookie,
      csrfToken,
    });
    assert.equal(policyDeniedDuplicate.status, 403, 'safe policy denies host duplicate action');
    policyMode = 'permissive';

    const audits = store.listAuditEvents();
    const groupAudit = requireAuditByContract(audits, 'host.updated', 'hosted:PATCH:/api/hosts/:id/group');
    assert.equal(groupAudit.metadata.policyCapability, 'host:updateGroup');
    assert.equal(groupAudit.metadata.entityType, 'host');
    assert.equal(groupAudit.metadata.hostGroupNameLogged, false);
    assert.equal(groupAudit.metadata.hostRecordLogged, false);
    assert.equal(groupAudit.metadata.hostCredentialsLogged, false);
    assert.equal(groupAudit.metadata.hostNameLogged, false);
    assert.equal(groupAudit.metadata.hostAddressLogged, false);
    assert.equal(groupAudit.metadata.secretsLogged, false);

    const favoriteAudit = requireAuditByContract(audits, 'host.updated', 'hosted:PATCH:/api/hosts/:id/favorite');
    assert.equal(favoriteAudit.metadata.policyCapability, 'host:setFavorite');
    assert.equal(favoriteAudit.metadata.favoriteValueLogged, false);
    assert.equal(favoriteAudit.metadata.hostRecordLogged, false);
    assert.equal(favoriteAudit.metadata.hostCredentialsLogged, false);

    const duplicateAudit = requireAuditByContract(audits, 'host.duplicated', 'hosted:POST:/api/hosts/:id/duplicate');
    assert.equal(duplicateAudit.metadata.policyCapability, 'host:duplicate');
    assert.equal(duplicateAudit.entityId, duplicated.json.id);
    assert.equal(duplicateAudit.metadata.hostRecordLogged, false);
    assert.equal(duplicateAudit.metadata.sourceHostRecordLogged, false);
    assert.equal(duplicateAudit.metadata.hostCredentialsLogged, false);

    const importAudit = requireAuditByContract(audits, 'host.imported', 'hosted:POST:/api/hosts/import');
    assert.equal(importAudit.metadata.policyCapability, 'host:import');
    assert.equal(importAudit.metadata.importedHostCount, 1);
    assert.equal(importAudit.metadata.importedHostIdsLogged, false);
    assert.equal(importAudit.metadata.hostRecordsLogged, false);
    assert.equal(importAudit.metadata.hostCredentialsLogged, false);
    assert.equal(importAudit.metadata.keyPathsLogged, false);
    assert.equal(importAudit.metadata.secretsLogged, false);

    const policyDeniedAudit = audits.find((event) => event.type === 'policy.denied'
      && event.metadata.capability === 'host:duplicate');
    assert.ok(policyDeniedAudit, 'policy denial audit was written for blocked host duplicate');
    assert.equal(policyDeniedAudit.metadata.route, `/api/hosts/${sourceHost.id}/duplicate`);
    assert.equal(policyDeniedAudit.metadata.secretsLogged, false);

    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes('SECRET_SOURCE_HOST_NAME'), false, 'source host name was not written to audit');
    assert.equal(auditJson.includes('SECRET_SOURCE_ADDRESS'), false, 'source host address was not written to audit');
    assert.equal(auditJson.includes('SECRET_SOURCE_USER'), false, 'source host username was not written to audit');
    assert.equal(auditJson.includes('SECRET_SOURCE_KEY'), false, 'source key path was not written to audit');
    assert.equal(auditJson.includes('SECRET_SOURCE_CREDENTIAL'), false, 'source credential ref was not written to audit');
    assert.equal(auditJson.includes('SECRET_SOURCE_NOTES'), false, 'source host notes were not written to audit');
    assert.equal(auditJson.includes('SECRET_GROUP_NAME'), false, 'group action value was not written to audit');
    assert.equal(auditJson.includes('SECRET_GROUP_WITHOUT_CSRF'), false, 'CSRF-denied group value was not written to audit');
    assert.equal(auditJson.includes('SECRET_IMPORTED_HOST_NAME'), false, 'imported host name was not written to audit');
    assert.equal(auditJson.includes('SECRET_IMPORTED_ADDRESS'), false, 'imported host address was not written to audit');
    assert.equal(auditJson.includes('SECRET_IMPORTED_USER'), false, 'imported host username was not written to audit');
    assert.equal(auditJson.includes('SECRET_IMPORTED_CREDENTIAL'), false, 'imported credential ref was not written to audit');
    assert.equal(auditJson.includes('SECRET_IMPORTED_KEY'), false, 'imported key path was not written to audit');
    assert.equal(auditJson.includes('SECRET_IMPORTED_NOTES'), false, 'imported host notes were not written to audit');

    console.log('hosted host secondary action route smoke: actions, token auth, CSRF, policy, persistence, and sanitized audit passed');
  } finally {
    server.close();
    store.close();
    fs.rmSync(staticRoot, { recursive: true, force: true });
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
}

function makeHostRecord(id, name) {
  const now = '2026-07-08T00:00:00.000Z';
  return {
    id,
    name,
    address: 'SECRET_IMPORTED_ADDRESS',
    hostname: 'SECRET_IMPORTED_ADDRESS',
    port: 2022,
    username: 'SECRET_IMPORTED_USER',
    authMode: 'key',
    keyPath: '/tmp/SECRET_IMPORTED_KEY',
    credentialRefId: 'SECRET_IMPORTED_CREDENTIAL',
    tags: ['imported-tag'],
    group: 'imported-group',
    favorite: false,
    osHint: 'linux',
    bootstrapStatus: 'unknown',
    defaultShell: '/bin/sh',
    defaultWorkingDirectory: '/srv/imported',
    capabilities: ['ssh'],
    notes: 'SECRET_IMPORTED_NOTES',
    lastConnectionStatus: 'untested',
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
  };
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
