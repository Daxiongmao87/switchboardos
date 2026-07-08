#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

function unusedApi() {
  throw new Error('This smoke uses hosted host group/tag routes only.');
}

async function main() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-host-org-static-'));
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-host-org-store-'));
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
        tlsGuidance: 'MVP hosted host group/tag route smoke.',
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
      accessToken: 'host-org-smoke-token',
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const unauthenticated = await jsonRequest(baseUrl, '/api/host-groups');
    assert.equal(unauthenticated.status, 401, 'host group list requires hosted token session');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'host-org-smoke-token' },
    });
    assert.equal(login.status, 200, `hosted token login succeeds: ${login.text}`);
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const emptyGroups = await jsonRequest(baseUrl, '/api/host-groups', { cookie });
    assert.equal(emptyGroups.status, 200, 'host group list succeeds');
    assert.deepEqual(emptyGroups.json, [], 'fresh SQLite store has no host groups');

    const emptyTags = await jsonRequest(baseUrl, '/api/host-tags', { cookie });
    assert.equal(emptyTags.status, 200, 'host tag list succeeds');
    assert.deepEqual(emptyTags.json, [], 'fresh SQLite store has no host tags');

    const missingGroup = await jsonRequest(baseUrl, '/api/host-groups/missing-group', { cookie });
    assert.equal(missingGroup.status, 200, 'missing host group read has deterministic null behavior');
    assert.equal(missingGroup.json, null, 'missing host group is not fabricated');

    const missingTag = await jsonRequest(baseUrl, '/api/host-tags/missing-tag', { cookie });
    assert.equal(missingTag.status, 200, 'missing host tag read has deterministic null behavior');
    assert.equal(missingTag.json, null, 'missing host tag is not fabricated');

    const groupInput = {
      name: 'SECRET_HOST_GROUP_NAME',
      color: '#3366ff',
    };
    const groupMissingCsrf = await jsonRequest(baseUrl, '/api/host-groups', {
      method: 'POST',
      cookie,
      body: groupInput,
    });
    assert.equal(groupMissingCsrf.status, 403, 'state-changing host group create requires CSRF in token-auth mode');

    const createdGroup = await jsonRequest(baseUrl, '/api/host-groups', {
      method: 'POST',
      cookie,
      csrfToken,
      body: groupInput,
    });
    assert.equal(createdGroup.status, 200, `host group create succeeds: ${createdGroup.text}`);
    assert.ok(createdGroup.json.id, 'host group create returns a record id');
    assert.equal(createdGroup.json.name, groupInput.name);
    assert.equal(store.listHostGroups().length, 1, 'host group create writes to real SQLite store');
    assert.equal(store.getHostGroup(createdGroup.json.id).name, groupInput.name, 'SQLite store preserved host group name');

    const fetchedGroup = await jsonRequest(baseUrl, `/api/host-groups/${createdGroup.json.id}`, { cookie });
    assert.equal(fetchedGroup.status, 200, 'host group get succeeds');
    assert.equal(fetchedGroup.json.id, createdGroup.json.id);

    const updatedGroup = await jsonRequest(baseUrl, `/api/host-groups/${createdGroup.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: {
        name: 'UPDATED_SECRET_HOST_GROUP_NAME',
        color: '#114488',
      },
    });
    assert.equal(updatedGroup.status, 200, `host group update succeeds: ${updatedGroup.text}`);
    assert.equal(updatedGroup.json.color, '#114488');
    assert.equal(store.getHostGroup(createdGroup.json.id).name, 'UPDATED_SECRET_HOST_GROUP_NAME');

    const tagInput = {
      name: 'SECRET_HOST_TAG_NAME',
      color: '#44aa66',
    };
    const tagMissingCsrf = await jsonRequest(baseUrl, '/api/host-tags', {
      method: 'POST',
      cookie,
      body: tagInput,
    });
    assert.equal(tagMissingCsrf.status, 403, 'state-changing host tag create requires CSRF in token-auth mode');

    const createdTag = await jsonRequest(baseUrl, '/api/host-tags', {
      method: 'POST',
      cookie,
      csrfToken,
      body: tagInput,
    });
    assert.equal(createdTag.status, 200, `host tag create succeeds: ${createdTag.text}`);
    assert.ok(createdTag.json.id, 'host tag create returns a record id');
    assert.equal(createdTag.json.name, tagInput.name);
    assert.equal(store.listHostTags().length, 1, 'host tag create writes to real SQLite store');
    assert.equal(store.getHostTag(createdTag.json.id).name, tagInput.name, 'SQLite store preserved host tag name');

    const fetchedTag = await jsonRequest(baseUrl, `/api/host-tags/${createdTag.json.id}`, { cookie });
    assert.equal(fetchedTag.status, 200, 'host tag get succeeds');
    assert.equal(fetchedTag.json.id, createdTag.json.id);

    const updatedTag = await jsonRequest(baseUrl, `/api/host-tags/${createdTag.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: {
        name: 'UPDATED_SECRET_HOST_TAG_NAME',
        color: '#225533',
      },
    });
    assert.equal(updatedTag.status, 200, `host tag update succeeds: ${updatedTag.text}`);
    assert.equal(updatedTag.json.color, '#225533');
    assert.equal(store.getHostTag(createdTag.json.id).name, 'UPDATED_SECRET_HOST_TAG_NAME');

    policyMode = 'safe';
    const policyDeniedUpdate = await jsonRequest(baseUrl, `/api/host-groups/${createdGroup.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: { name: 'BLOCKED_SECRET_HOST_GROUP_NAME' },
    });
    assert.equal(policyDeniedUpdate.status, 403, 'safe policy denies host group update');
    policyMode = 'permissive';

    const deletedTag = await jsonRequest(baseUrl, `/api/host-tags/${createdTag.json.id}`, {
      method: 'DELETE',
      cookie,
      csrfToken,
    });
    assert.equal(deletedTag.status, 200, 'host tag delete succeeds');
    assert.equal(deletedTag.json, true);
    assert.equal(store.getHostTag(createdTag.json.id), null);

    const deletedGroup = await jsonRequest(baseUrl, `/api/host-groups/${createdGroup.json.id}`, {
      method: 'DELETE',
      cookie,
      csrfToken,
    });
    assert.equal(deletedGroup.status, 200, 'host group delete succeeds');
    assert.equal(deletedGroup.json, true);
    assert.equal(store.getHostGroup(createdGroup.json.id), null);

    const audits = store.listAuditEvents();
    const groupCreateAudit = requireAudit(audits, 'host_group.created');
    assert.equal(groupCreateAudit.metadata.contractId, 'hosted:POST:/api/host-groups');
    assert.equal(groupCreateAudit.metadata.policyCapability, 'host-group:create');
    assert.equal(groupCreateAudit.metadata.policyDecision, 'allowed');
    assert.equal(groupCreateAudit.metadata.hostGroupNameLogged, false);
    assert.equal(groupCreateAudit.metadata.hostGroupColorLogged, false);
    assert.equal(groupCreateAudit.metadata.hostRecordsLogged, false);
    assert.equal(groupCreateAudit.metadata.hostCredentialsLogged, false);
    assert.equal(groupCreateAudit.metadata.secretsLogged, false);

    const groupUpdateAudit = requireAudit(audits, 'host_group.updated');
    assert.equal(groupUpdateAudit.metadata.contractId, 'hosted:PATCH:/api/host-groups/:id');
    assert.equal(groupUpdateAudit.metadata.policyCapability, 'host-group:update');
    assert.equal(groupUpdateAudit.metadata.entityId, createdGroup.json.id);
    assert.equal(groupUpdateAudit.metadata.hostGroupNameLogged, false);

    const groupDeleteAudit = requireAudit(audits, 'host_group.deleted');
    assert.equal(groupDeleteAudit.metadata.contractId, 'hosted:DELETE:/api/host-groups/:id');
    assert.equal(groupDeleteAudit.metadata.policyCapability, 'host-group:delete');

    const tagCreateAudit = requireAudit(audits, 'host_tag.created');
    assert.equal(tagCreateAudit.metadata.contractId, 'hosted:POST:/api/host-tags');
    assert.equal(tagCreateAudit.metadata.policyCapability, 'host-tag:create');
    assert.equal(tagCreateAudit.metadata.policyDecision, 'allowed');
    assert.equal(tagCreateAudit.metadata.hostTagNameLogged, false);
    assert.equal(tagCreateAudit.metadata.hostTagColorLogged, false);
    assert.equal(tagCreateAudit.metadata.hostRecordsLogged, false);
    assert.equal(tagCreateAudit.metadata.hostCredentialsLogged, false);
    assert.equal(tagCreateAudit.metadata.secretsLogged, false);

    const tagUpdateAudit = requireAudit(audits, 'host_tag.updated');
    assert.equal(tagUpdateAudit.metadata.contractId, 'hosted:PATCH:/api/host-tags/:id');
    assert.equal(tagUpdateAudit.metadata.policyCapability, 'host-tag:update');
    assert.equal(tagUpdateAudit.metadata.entityId, createdTag.json.id);
    assert.equal(tagUpdateAudit.metadata.hostTagNameLogged, false);

    const tagDeleteAudit = requireAudit(audits, 'host_tag.deleted');
    assert.equal(tagDeleteAudit.metadata.contractId, 'hosted:DELETE:/api/host-tags/:id');
    assert.equal(tagDeleteAudit.metadata.policyCapability, 'host-tag:delete');

    const policyDeniedAudit = audits.find((event) => event.type === 'policy.denied'
      && event.metadata.capability === 'host-group:update');
    assert.ok(policyDeniedAudit, 'policy denial audit was written for blocked host group update');
    assert.equal(policyDeniedAudit.metadata.route, `/api/host-groups/${createdGroup.json.id}`);
    assert.equal(policyDeniedAudit.metadata.secretsLogged, false);

    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes('SECRET_HOST_GROUP_NAME'), false, 'raw host group create name was not written to audit');
    assert.equal(auditJson.includes('UPDATED_SECRET_HOST_GROUP_NAME'), false, 'raw host group update name was not written to audit');
    assert.equal(auditJson.includes('BLOCKED_SECRET_HOST_GROUP_NAME'), false, 'raw denied host group update name was not written to audit');
    assert.equal(auditJson.includes('SECRET_HOST_TAG_NAME'), false, 'raw host tag create name was not written to audit');
    assert.equal(auditJson.includes('UPDATED_SECRET_HOST_TAG_NAME'), false, 'raw host tag update name was not written to audit');
    assert.equal(auditJson.includes('#3366ff'), false, 'raw host group create color was not written to audit');
    assert.equal(auditJson.includes('#44aa66'), false, 'raw host tag create color was not written to audit');

    console.log('hosted host group/tag route smoke: CRUD, token auth, CSRF, policy, persistence, and sanitized audit passed');
  } finally {
    server.close();
    store.close();
    fs.rmSync(staticRoot, { recursive: true, force: true });
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
}

function requireAudit(audits, type) {
  const audit = audits.find((event) => event.type === type);
  assert.ok(audit, `${type} audit was written`);
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
