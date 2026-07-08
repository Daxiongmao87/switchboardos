#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

function unusedApi() {
  throw new Error('This smoke uses hosted credential reference routes only.');
}

async function main() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-credential-ref-static-'));
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-credential-ref-store-'));
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
        tlsGuidance: 'MVP hosted credential reference route smoke.',
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
      accessToken: 'credential-ref-smoke-token',
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const unauthenticated = await jsonRequest(baseUrl, '/api/credential-refs');
    assert.equal(unauthenticated.status, 401, 'credential reference list requires hosted token session');

    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'credential-ref-smoke-token' },
    });
    assert.equal(login.status, 200, `hosted token login succeeds: ${login.text}`);
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const emptyList = await jsonRequest(baseUrl, '/api/credential-refs', { cookie });
    assert.equal(emptyList.status, 200, 'credential reference list succeeds');
    assert.deepEqual(emptyList.json, [], 'fresh SQLite store has no credential references');

    const missing = await jsonRequest(baseUrl, '/api/credential-refs/missing-ref', { cookie });
    assert.equal(missing.status, 200, 'missing credential reference read has deterministic null behavior');
    assert.equal(missing.json, null, 'missing credential reference is not fabricated');

    const createInput = {
      name: 'SECRET_CREDENTIAL_REF_NAME',
      type: 'file_path',
      referenceValue: '/tmp/SECRET_PRIVATE_KEY_PATH',
      metadata: {
        label: 'SECRET_METADATA_LABEL',
        fingerprint: 'SECRET_METADATA_FINGERPRINT',
      },
    };
    const missingCsrfCreate = await jsonRequest(baseUrl, '/api/credential-refs', {
      method: 'POST',
      cookie,
      body: createInput,
    });
    assert.equal(missingCsrfCreate.status, 403, 'credential reference create requires CSRF in token-auth mode');
    assert.equal(store.listCredentialRefs().length, 0, 'CSRF-denied credential reference create does not persist');

    const created = await jsonRequest(baseUrl, '/api/credential-refs', {
      method: 'POST',
      cookie,
      csrfToken,
      body: createInput,
    });
    assert.equal(created.status, 200, `credential reference create succeeds: ${created.text}`);
    assert.ok(created.json.id, 'credential reference create returns an id');
    assert.equal(created.json.name, createInput.name);
    assert.equal(created.json.referenceValue, createInput.referenceValue);
    assert.equal(store.getCredentialRef(created.json.id).referenceValue, createInput.referenceValue, 'create persists metadata reference in SQLite');

    const listed = await jsonRequest(baseUrl, '/api/credential-refs', { cookie });
    assert.equal(listed.status, 200, 'credential reference list returns persisted record');
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].id, created.json.id);

    const fetched = await jsonRequest(baseUrl, `/api/credential-refs/${created.json.id}`, { cookie });
    assert.equal(fetched.status, 200, 'credential reference get succeeds');
    assert.equal(fetched.json.referenceValue, createInput.referenceValue);

    const updateInput = {
      name: 'UPDATED_SECRET_CREDENTIAL_REF_NAME',
      type: 'env_var',
      referenceValue: 'SECRET_ENV_VAR_NAME',
      metadata: {
        label: 'UPDATED_SECRET_METADATA_LABEL',
      },
    };
    const updated = await jsonRequest(baseUrl, `/api/credential-refs/${created.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: updateInput,
    });
    assert.equal(updated.status, 200, `credential reference update succeeds: ${updated.text}`);
    assert.equal(updated.json.type, 'env_var');
    assert.equal(updated.json.referenceValue, 'SECRET_ENV_VAR_NAME');
    assert.equal(store.getCredentialRef(created.json.id).metadata.label, 'UPDATED_SECRET_METADATA_LABEL', 'update persists metadata in SQLite');

    policyMode = 'safe';
    const policyDeniedUpdate = await jsonRequest(baseUrl, `/api/credential-refs/${created.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: {
        referenceValue: 'BLOCKED_SECRET_REFERENCE_VALUE',
      },
    });
    assert.equal(policyDeniedUpdate.status, 403, 'safe policy denies credential reference update');
    assert.equal(
      store.getCredentialRef(created.json.id).referenceValue,
      'SECRET_ENV_VAR_NAME',
      'policy-denied credential reference update does not mutate SQLite',
    );
    policyMode = 'permissive';

    const hostedSecretAttempt = await jsonRequest(baseUrl, '/api/secrets', {
      method: 'POST',
      cookie,
      csrfToken,
      body: {
        key: 'SECRET_KEY_NAME',
        value: 'SECRET_RAW_MATERIAL',
      },
    });
    assert.equal(hostedSecretAttempt.status, 404, 'hosted secret API was not created for credential reference parity');

    const deleted = await jsonRequest(baseUrl, `/api/credential-refs/${created.json.id}`, {
      method: 'DELETE',
      cookie,
      csrfToken,
    });
    assert.equal(deleted.status, 200, 'credential reference delete succeeds');
    assert.equal(deleted.json, true);
    assert.equal(store.getCredentialRef(created.json.id), null, 'delete removes credential reference metadata from SQLite');

    const audits = store.listAuditEvents();
    const createAudit = requireAuditByContract(audits, 'credential_ref.created', 'hosted:POST:/api/credential-refs');
    assert.equal(createAudit.metadata.policyCapability, 'credential-ref:create');
    assert.equal(createAudit.metadata.storesSecretMaterial, false);
    assert.equal(createAudit.metadata.credentialRefNameLogged, false);
    assert.equal(createAudit.metadata.credentialReferenceValueLogged, false);
    assert.equal(createAudit.metadata.credentialRefMetadataLogged, false);
    assert.equal(createAudit.metadata.rawCredentialMaterialLogged, false);
    assert.equal(createAudit.metadata.osKeychainAccess, false);
    assert.equal(createAudit.metadata.sshAgentAccess, false);
    assert.equal(createAudit.metadata.secretsLogged, false);

    const updateAudit = requireAuditByContract(audits, 'credential_ref.updated', 'hosted:PATCH:/api/credential-refs/:id');
    assert.equal(updateAudit.metadata.policyCapability, 'credential-ref:update');
    assert.equal(updateAudit.metadata.entityId, created.json.id);
    assert.equal(updateAudit.metadata.credentialRefMetadataKeyCount, 1);
    assert.equal(updateAudit.metadata.credentialReferenceValueLogged, false);
    assert.equal(updateAudit.metadata.rawCredentialMaterialLogged, false);

    const deleteAudit = requireAuditByContract(audits, 'credential_ref.deleted', 'hosted:DELETE:/api/credential-refs/:id');
    assert.equal(deleteAudit.metadata.policyCapability, 'credential-ref:delete');
    assert.equal(deleteAudit.metadata.entityId, created.json.id);
    assert.equal(deleteAudit.metadata.credentialRefFound, true);
    assert.equal(deleteAudit.metadata.credentialReferenceValueLogged, false);

    const policyDeniedAudit = audits.find((event) => event.type === 'policy.denied'
      && event.metadata.capability === 'credential-ref:update');
    assert.ok(policyDeniedAudit, 'policy denial audit was written for blocked credential reference update');
    assert.equal(policyDeniedAudit.metadata.route, `/api/credential-refs/${created.json.id}`);
    assert.equal(policyDeniedAudit.metadata.secretsLogged, false);

    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes('SECRET_CREDENTIAL_REF_NAME'), false, 'credential reference name was not written to audit');
    assert.equal(auditJson.includes('UPDATED_SECRET_CREDENTIAL_REF_NAME'), false, 'updated credential reference name was not written to audit');
    assert.equal(auditJson.includes('SECRET_PRIVATE_KEY_PATH'), false, 'credential reference value was not written to audit');
    assert.equal(auditJson.includes('SECRET_ENV_VAR_NAME'), false, 'updated credential reference value was not written to audit');
    assert.equal(auditJson.includes('BLOCKED_SECRET_REFERENCE_VALUE'), false, 'policy-denied credential reference value was not written to audit');
    assert.equal(auditJson.includes('SECRET_METADATA_LABEL'), false, 'credential reference metadata was not written to audit');
    assert.equal(auditJson.includes('UPDATED_SECRET_METADATA_LABEL'), false, 'updated credential reference metadata was not written to audit');
    assert.equal(auditJson.includes('SECRET_RAW_MATERIAL'), false, 'hosted secret attempt material was not written to audit');
    assert.equal(auditJson.includes('SECRET_KEY_NAME'), false, 'hosted secret attempt key was not written to audit');

    console.log('hosted credential reference route smoke: CRUD, token auth, CSRF, policy, persistence, no hosted secrets, and sanitized audit passed');
  } finally {
    server.close();
    store.close();
    fs.rmSync(staticRoot, { recursive: true, force: true });
    fs.rmSync(storeDir, { recursive: true, force: true });
  }
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
