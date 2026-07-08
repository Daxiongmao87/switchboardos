#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HostedServer } = require('../dist/src/main/hosted-server.js');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');
const { PolicyService } = require('../dist/src/main/policy-service.js');

function unusedApi() {
  throw new Error('This smoke uses hosted persisted bootstrap routes only.');
}

async function main() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-bootstrap-static-'));
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboardos-hosted-bootstrap-store-'));
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
        tlsGuidance: 'MVP hosted bootstrap route smoke.',
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
      accessToken: 'bootstrap-smoke-token',
      sessionTtlMs: 60_000,
      lanEnabled: false,
    },
  });

  const { url } = await server.start();
  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  try {
    const login = await jsonRequest(baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { token: 'bootstrap-smoke-token' },
    });
    assert.equal(login.status, 200, `hosted token login succeeds: ${login.text}`);
    const cookie = cookieHeader(login.response);
    const csrfToken = csrfFromCookie(cookie);
    assert.ok(cookie.includes('sb_hosted_session='), 'session cookie is set');
    assert.ok(csrfToken, 'csrf cookie is set');

    const builtInPresets = await jsonRequest(baseUrl, '/api/bootstrap/presets', { cookie });
    assert.equal(builtInPresets.status, 200, 'built-in bootstrap presets remain reachable');
    assert.ok(Array.isArray(builtInPresets.json), 'built-in bootstrap preset route keeps array response shape');
    assert.ok(
      builtInPresets.json.some((preset) => preset.id === 'debian-ubuntu'),
      'built-in bootstrap preset route still returns generator presets',
    );
    assert.equal(
      Object.hasOwn(builtInPresets.json[0], 'scriptTemplate'),
      false,
      'built-in generator preset response was not replaced by persisted preset records',
    );

    const emptyPersistedPresets = await jsonRequest(baseUrl, '/api/bootstrap/persisted-presets', { cookie });
    assert.equal(emptyPersistedPresets.status, 200, 'persisted preset list succeeds');
    assert.deepEqual(emptyPersistedPresets.json, [], 'fresh SQLite store has no persisted bootstrap presets');

    const missingPreset = await jsonRequest(baseUrl, '/api/bootstrap/persisted-presets/missing-preset', { cookie });
    assert.equal(missingPreset.status, 200, 'missing persisted preset read has deterministic null behavior');
    assert.equal(missingPreset.json, null, 'missing persisted preset is not fabricated');

    const missingRun = await jsonRequest(baseUrl, '/api/bootstrap/runs/missing-run', { cookie });
    assert.equal(missingRun.status, 200, 'missing bootstrap run read has deterministic null behavior');
    assert.equal(missingRun.json, null, 'missing bootstrap run is not fabricated');

    const presetInput = {
      presetId: 'smoke-persisted',
      name: 'Smoke persisted preset',
      description: 'A persisted preset created through the hosted API.',
      scriptTemplate: 'RAW_TEMPLATE_SECRET=do-not-log',
      variables: ['packageName', 'serviceName'],
      enabled: true,
    };
    const missingCsrf = await jsonRequest(baseUrl, '/api/bootstrap/persisted-presets', {
      method: 'POST',
      cookie,
      body: presetInput,
    });
    assert.equal(missingCsrf.status, 403, 'state-changing persisted preset create requires CSRF in token-auth mode');

    const createdPreset = await jsonRequest(baseUrl, '/api/bootstrap/persisted-presets', {
      method: 'POST',
      cookie,
      csrfToken,
      body: presetInput,
    });
    assert.equal(createdPreset.status, 200, `persisted preset create succeeds: ${createdPreset.text}`);
    assert.ok(createdPreset.json.id, 'persisted preset create returns a record id');
    assert.equal(createdPreset.json.scriptTemplate, presetInput.scriptTemplate, 'response includes persisted template content');
    assert.equal(store.listBootstrapPresets().length, 1, 'persisted preset create writes to real SQLite store');
    assert.equal(
      store.getBootstrapPreset(createdPreset.json.id).scriptTemplate,
      presetInput.scriptTemplate,
      'SQLite store preserved persisted preset script template',
    );

    const fetchedPreset = await jsonRequest(baseUrl, `/api/bootstrap/persisted-presets/${createdPreset.json.id}`, { cookie });
    assert.equal(fetchedPreset.status, 200, 'persisted preset get succeeds');
    assert.equal(fetchedPreset.json.id, createdPreset.json.id);

    const updatedPreset = await jsonRequest(baseUrl, `/api/bootstrap/persisted-presets/${createdPreset.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: {
        name: 'Updated smoke persisted preset',
        scriptTemplate: 'UPDATED_RAW_TEMPLATE=still-not-in-audit',
        variables: ['packageName'],
      },
    });
    assert.equal(updatedPreset.status, 200, `persisted preset update succeeds: ${updatedPreset.text}`);
    assert.equal(updatedPreset.json.name, 'Updated smoke persisted preset');
    assert.deepEqual(store.getBootstrapPreset(createdPreset.json.id).variables, ['packageName']);

    const runInput = {
      presetId: createdPreset.json.id,
      hostId: null,
      scriptOutput: 'RAW_OUTPUT_SECRET=do-not-log',
      status: 'running',
    };
    const createdRun = await jsonRequest(baseUrl, '/api/bootstrap/runs', {
      method: 'POST',
      cookie,
      csrfToken,
      body: runInput,
    });
    assert.equal(createdRun.status, 200, `bootstrap run create succeeds: ${createdRun.text}`);
    assert.ok(createdRun.json.id, 'bootstrap run create returns a record id');
    assert.equal(store.getBootstrapRun(createdRun.json.id).scriptOutput, runInput.scriptOutput);

    const listedRuns = await jsonRequest(baseUrl, '/api/bootstrap/runs', { cookie });
    assert.equal(listedRuns.status, 200, 'bootstrap run list succeeds');
    assert.equal(listedRuns.json.length, 1);

    const updatedRun = await jsonRequest(baseUrl, `/api/bootstrap/runs/${createdRun.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: {
        scriptOutput: 'UPDATED_RAW_OUTPUT=still-not-in-audit',
        status: 'success',
      },
    });
    assert.equal(updatedRun.status, 200, `bootstrap run update succeeds: ${updatedRun.text}`);
    assert.equal(updatedRun.json.status, 'success');
    assert.equal(store.getBootstrapRun(createdRun.json.id).status, 'success');

    policyMode = 'safe';
    const policyDeniedUpdate = await jsonRequest(baseUrl, `/api/bootstrap/persisted-presets/${createdPreset.json.id}`, {
      method: 'PATCH',
      cookie,
      csrfToken,
      body: { name: 'Blocked by safe policy' },
    });
    assert.equal(policyDeniedUpdate.status, 403, 'safe policy denies persisted preset update');
    policyMode = 'permissive';

    const deletedRun = await jsonRequest(baseUrl, `/api/bootstrap/runs/${createdRun.json.id}`, {
      method: 'DELETE',
      cookie,
      csrfToken,
    });
    assert.equal(deletedRun.status, 200, 'bootstrap run delete succeeds');
    assert.equal(deletedRun.json, true);
    assert.equal(store.getBootstrapRun(createdRun.json.id), null);

    const deletedPreset = await jsonRequest(baseUrl, `/api/bootstrap/persisted-presets/${createdPreset.json.id}`, {
      method: 'DELETE',
      cookie,
      csrfToken,
    });
    assert.equal(deletedPreset.status, 200, 'persisted preset delete succeeds');
    assert.equal(deletedPreset.json, true);
    assert.equal(store.getBootstrapPreset(createdPreset.json.id), null);

    const audits = store.listAuditEvents();
    const presetCreateAudit = requireAudit(audits, 'bootstrap_preset.created');
    assert.equal(presetCreateAudit.metadata.contractId, 'hosted:POST:/api/bootstrap/persisted-presets');
    assert.equal(presetCreateAudit.metadata.policyCapability, 'bootstrap:preset:create');
    assert.equal(presetCreateAudit.metadata.policyDecision, 'allowed');
    assert.equal(presetCreateAudit.metadata.scriptTemplateLogged, false);

    const presetUpdateAudit = requireAudit(audits, 'bootstrap_preset.updated');
    assert.equal(presetUpdateAudit.metadata.contractId, 'hosted:PATCH:/api/bootstrap/persisted-presets/:id');
    assert.equal(presetUpdateAudit.metadata.scriptTemplateLogged, false);

    const runCreateAudit = requireAudit(audits, 'bootstrap_run.created');
    assert.equal(runCreateAudit.metadata.contractId, 'hosted:POST:/api/bootstrap/runs');
    assert.equal(runCreateAudit.metadata.policyCapability, 'bootstrap:run:create');
    assert.equal(runCreateAudit.metadata.scriptOutputLogged, false);

    const runUpdateAudit = requireAudit(audits, 'bootstrap_run.updated');
    assert.equal(runUpdateAudit.metadata.contractId, 'hosted:PATCH:/api/bootstrap/runs/:id');
    assert.equal(runUpdateAudit.metadata.scriptOutputLogged, false);

    const policyDeniedAudit = audits.find((event) => event.type === 'policy.denied'
      && event.metadata.capability === 'bootstrap:preset:update');
    assert.ok(policyDeniedAudit, 'policy denial audit was written for blocked persisted preset update');
    assert.equal(policyDeniedAudit.metadata.route, `/api/bootstrap/persisted-presets/${createdPreset.json.id}`);

    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes('RAW_TEMPLATE_SECRET'), false, 'raw preset template was not written to audit');
    assert.equal(auditJson.includes('UPDATED_RAW_TEMPLATE'), false, 'updated raw preset template was not written to audit');
    assert.equal(auditJson.includes('RAW_OUTPUT_SECRET'), false, 'raw run output was not written to audit');
    assert.equal(auditJson.includes('UPDATED_RAW_OUTPUT'), false, 'updated raw run output was not written to audit');

    console.log('hosted persisted bootstrap route smoke: CRUD, CSRF, policy, persistence, and sanitized audit passed');
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
