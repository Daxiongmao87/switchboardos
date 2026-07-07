#!/usr/bin/env node

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { get } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

if (typeof WebSocket !== 'function') {
  console.error('This smoke requires Node with global WebSocket support. Use the repo Node 24 runtime.');
  process.exit(2);
}

const repoRoot = join(__dirname, '..');
const electronBin = join(repoRoot, 'node_modules', '.bin', 'electron');
const port = 9800 + Math.floor(Math.random() * 300);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-artifact-content-'));
const electronUserDataDir = join(configDir, 'electron-user-data');
const secretMarker = 'WORKSPACE_ARTIFACT_UI_SECRET_MARKER_SHOULD_NOT_BE_AUDITED';

const electron = spawn(electronBin, [
  '.',
  '--no-sandbox',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${electronUserDataDir}`,
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: '1',
    XDG_CONFIG_HOME: configDir,
    SWITCHBOARDOS_HOSTED_PORT: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let electronOutput = '';
let cleanedUp = false;
electron.stdout.on('data', (chunk) => {
  electronOutput += chunk.toString();
});
electron.stderr.on('data', (chunk) => {
  electronOutput += chunk.toString();
});

function cleanup() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  electron.kill('SIGTERM');
  rmSync(configDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    const request = get({ host: '127.0.0.1', port, path: pathname, timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('CDP request timed out')));
  });
}

async function waitForRendererPage() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const targets = await getJson('/json/list');
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      // Electron is still booting.
    }
    await sleep(250);
  }
  throw new Error(`No Electron renderer page exposed on CDP port ${port}.\n${electronOutput}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  close() {
    this.ws?.close();
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, cdpCommandTimeoutMs);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }
}

async function waitForArtifactApi(cdp) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`Boolean(window.sb && window.sb.workspaceFile && window.sb.workspaceArtifactContent)`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose workspace artifact content.\n${electronOutput}`);
}

async function main() {
  const page = await waitForRendererPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    await waitForArtifactApi(cdp);
    const result = await cdp.evaluate(`(async () => {
      const api = window.sb;
      const applet = await api.workspaceFile.createFile('applet', '');
      const initial = await api.workspaceArtifactContent.get(applet.path);
      const updatedContent = JSON.stringify({
        schemaVersion: 1,
        kind: 'applet',
        name: 'Updated Electron Smoke Applet',
        capabilities: ['storage:scoped', 'host:read'],
        hiddenSource: ${JSON.stringify(secretMarker)}
      }, null, 2);
      const updated = await api.workspaceArtifactContent.update(applet.path, updatedContent);
      const reread = await api.workspaceArtifactContent.get(applet.path);
      const note = await api.workspaceFile.createFile('note', '');
      let noteDenied = false;
      try {
        await api.workspaceArtifactContent.get(note.path);
      } catch {
        noteDenied = true;
      }
      let mismatchedDenied = false;
      try {
        await api.workspaceArtifactContent.update(applet.path, JSON.stringify({
          schemaVersion: 1,
          kind: 'scriptlet',
          name: 'Wrong kind',
          capabilities: []
        }, null, 2));
      } catch {
        mismatchedDenied = true;
      }
      const audit = await api.audit.list();
      const auditJson = JSON.stringify(audit);
      const contentAuditJson = JSON.stringify(audit.filter((event) =>
        event.type === 'workspace_artifact_content.read' || event.type === 'workspace_artifact_content.updated',
      ));
      const localStorageKeys = Object.keys(window.localStorage)
        .filter((key) => key.includes('workspaceArtifactContent') || key.includes('workspace-artifact-content'));
      return {
        appletPath: applet.path,
        initialKind: initial.kind,
        initialManifestKind: initial.manifest.kind,
        updatedKind: updated.kind,
        updatedCapabilityCount: updated.capabilities.length,
        rereadName: reread.manifest.name,
        readAudit: audit.some((event) => event.type === 'workspace_artifact_content.read'
          && event.metadata && event.metadata.artifactContentLogged === false),
        updateAudit: audit.some((event) => event.type === 'workspace_artifact_content.updated'
          && event.metadata && event.metadata.manifestLogged === false),
        auditContainsSecret: auditJson.includes(${JSON.stringify(secretMarker)}),
        contentAuditContainsRawPath: contentAuditJson.includes(applet.path),
        noteDenied,
        mismatchedDenied,
        localStorageKeys
      };
    })()`);

    assert.equal(result.initialKind, 'applet', 'created applet content reads as applet');
    assert.equal(result.initialManifestKind, 'applet', 'created applet manifest kind is applet');
    assert.equal(result.updatedKind, 'applet', 'updated content remains applet');
    assert.equal(result.updatedCapabilityCount, 2, 'updated declared capabilities are returned');
    assert.equal(result.rereadName, 'Updated Electron Smoke Applet', 'updated content persists through backend workspace filesystem');
    assert.equal(result.readAudit, true, 'read route wrote sanitized audit');
    assert.equal(result.updateAudit, true, 'update route wrote sanitized audit');
    assert.equal(result.auditContainsSecret, false, 'audit does not contain raw artifact content marker');
    assert.equal(result.contentAuditContainsRawPath, false, 'content-route audit does not contain raw artifact path');
    assert.equal(result.noteDenied, true, 'note files are denied by artifact content route');
    assert.equal(result.mismatchedDenied, true, 'manifest kind/path mismatch is denied');
    assert.deepEqual(result.localStorageKeys, [], 'artifact content API does not write renderer localStorage keys');

    console.log('workspace artifact content UI smoke: Electron IPC create/read/update/persist/deny/audit/localStorage checks passed');
  } finally {
    cdp.close();
    cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
