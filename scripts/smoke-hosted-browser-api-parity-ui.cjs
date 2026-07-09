#!/usr/bin/env node

if (process.versions.electron && process.env.SWITCHBOARDOS_BROWSER_DRIVER === '1') {
  const { app, BrowserWindow } = require('electron');

  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  app.commandLine.appendSwitch('no-sandbox');

  const hostedUrl = process.env.SWITCHBOARDOS_BROWSER_DRIVER_URL;
  if (!hostedUrl) {
    console.error('SWITCHBOARDOS_BROWSER_DRIVER_URL is required.');
    process.exit(2);
  }

  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await window.loadURL(hostedUrl);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
} else {
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
const hostedPort = 9900 + Math.floor(Math.random() * 300);
const browserCdpPort = 10300 + Math.floor(Math.random() * 300);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-hosted-browser-api-'));
const electronUserDataDir = join(configDir, 'electron-user-data');
const browserUserDataDir = join(configDir, 'browser-electron-user-data');
const hostedUrl = `http://127.0.0.1:${hostedPort}/`;

const electron = spawn(electronBin, [
  '.',
  '--no-sandbox',
  `--user-data-dir=${electronUserDataDir}`,
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SANDBOX: '1',
    XDG_CONFIG_HOME: configDir,
    SWITCHBOARDOS_HOSTED_ENABLED: '1',
    SWITCHBOARDOS_HOSTED_HOST: '127.0.0.1',
    SWITCHBOARDOS_HOSTED_PORT: String(hostedPort),
    SWITCHBOARDOS_HOSTED_AUTH_REQUIRED: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let electronOutput = '';
electron.stdout.on('data', (chunk) => {
  electronOutput += chunk.toString();
});
electron.stderr.on('data', (chunk) => {
  electronOutput += chunk.toString();
});

let browser = null;
let browserOutput = '';
let cleanedUp = false;

function cleanup() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM');
  }
  if (electron.exitCode === null && electron.signalCode === null) {
    electron.kill('SIGTERM');
  }
  rmSync(configDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestText(port, pathname, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const request = get({ host: '127.0.0.1', port, path: pathname, timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode ?? 0, body });
      });
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error(`HTTP request timed out for ${pathname}`)));
  });
}

async function requestJson(port, pathname) {
  const response = await requestText(port, pathname);
  return JSON.parse(response.body);
}

async function waitForHostedUi() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (electron.exitCode !== null || electron.signalCode !== null) {
      throw new Error(`SwitchboardOS Electron exited before hosted UI was available.\n${electronOutput}`);
    }
    try {
      const response = await requestText(hostedPort, '/');
      if (response.statusCode === 200 && response.body.includes('app-root')) {
        return;
      }
    } catch {
      // Hosted server is still starting.
    }
    await sleep(300);
  }
  throw new Error(`Hosted UI did not become available on ${hostedUrl}.\n${electronOutput}`);
}

function startHostedBrowser() {
  browser = spawn(electronBin, [
    `--remote-debugging-port=${browserCdpPort}`,
    `--user-data-dir=${browserUserDataDir}`,
    '--no-sandbox',
    __filename,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: '1',
      SWITCHBOARDOS_BROWSER_DRIVER: '1',
      SWITCHBOARDOS_BROWSER_DRIVER_URL: hostedUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  browser.stdout.on('data', (chunk) => {
    browserOutput += chunk.toString();
  });
  browser.stderr.on('data', (chunk) => {
    browserOutput += chunk.toString();
  });
}

async function waitForBrowserPage() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null || browser.signalCode !== null) {
      throw new Error(`Hosted browser exited before exposing a page.\n${browserOutput}`);
    }
    try {
      const targets = await requestJson(browserCdpPort, '/json/list');
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      // Hosted browser remote debugging is still starting.
    }
    await sleep(250);
  }
  throw new Error(`No hosted browser page exposed on CDP port ${browserCdpPort}.\n${browserOutput}`);
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
      clearTimeout(pending.timeout);
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
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, cdpCommandTimeoutMs);
      this.pending.set(id, { method, resolve, reject, timeout });
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

async function waitForHostedBrowserApi(cdp) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`Boolean(
      window.location.origin === ${JSON.stringify(`http://127.0.0.1:${hostedPort}`)}
      && window.sb
      && window.sb.hostGroup
      && window.sb.hostTag
      && window.sb.credentialRef
      && window.sb.bootstrapPreset
      && window.sb.bootstrapRun
      && window.sb.commandHistory
      && window.sb.commandHistory.get
      && window.sb.audit
      && typeof window.require === 'undefined'
    )`);
    if (ready) {
      return;
    }
    await sleep(300);
  }
  throw new Error(`Hosted browser API did not expose expected surfaces.\nElectron output:\n${electronOutput}\nBrowser output:\n${browserOutput}`);
}

async function main() {
  await waitForHostedUi();
  startHostedBrowser();
  const page = await waitForBrowserPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    await waitForHostedBrowserApi(cdp);
    const result = await cdp.evaluate(`(async () => {
      const api = window.sb;
      const unique = 'browser-api-parity-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      const groupSecret = unique + '-HOST-GROUP-NAME-SECRET';
      const tagSecret = unique + '-HOST-TAG-NAME-SECRET';
      const credentialSecret = unique + '-CREDENTIAL-REFERENCE-SECRET';
      const credentialMetadataSecret = unique + '-CREDENTIAL-METADATA-SECRET';
      const presetSecret = unique + '-BOOTSTRAP-SCRIPT-TEMPLATE-SECRET';
      const runSecret = unique + '-BOOTSTRAP-SCRIPT-OUTPUT-SECRET';
      const commandSecret = unique + '-COMMAND-HISTORY-SECRET';
      const created = {
        groupId: null,
        tagId: null,
        credentialId: null,
        presetId: null,
        runId: null,
        commandId: null,
      };

      try {
        const appInfo = await api.app.getInfo();
        const authSession = await fetch('/api/auth/session').then((response) => response.json());
        const bounds = await api.window.getBounds();
        const groupBefore = await api.hostGroup.list();
        const tagBefore = await api.hostTag.list();
        const presetBefore = await api.bootstrapPreset.list();
        const runBefore = await api.bootstrapRun.list();

        const group = await api.hostGroup.create({ name: groupSecret, color: '#123456' });
        created.groupId = group.id;
        const groupRead = await api.hostGroup.get(group.id);
        const groupUpdated = await api.hostGroup.update(group.id, { name: unique + '-group-updated', color: '#654321' });
        const groupMissing = await api.hostGroup.get(unique + '-missing-group');

        const tag = await api.hostTag.create({ name: tagSecret, color: '#abcdef' });
        created.tagId = tag.id;
        const tagRead = await api.hostTag.get(tag.id);
        const tagUpdated = await api.hostTag.update(tag.id, { name: unique + '-tag-updated', color: '#fedcba' });
        const tagMissing = await api.hostTag.get(unique + '-missing-tag');

        const credential = await api.credentialRef.create({
          name: unique + '-credential',
          type: 'file_path',
          referenceValue: credentialSecret,
          metadata: { hidden: credentialMetadataSecret, source: 'hosted-browser-api-parity-smoke' },
        });
        created.credentialId = credential.id;
        const credentialRead = await api.credentialRef.get(credential.id);
        const credentialUpdated = await api.credentialRef.update(credential.id, {
          name: unique + '-credential-updated',
          referenceValue: credentialSecret + '-updated',
          metadata: { updated: credentialMetadataSecret + '-updated' },
        });
        const credentialMissing = await api.credentialRef.get(unique + '-missing-credential');

        const preset = await api.bootstrapPreset.create({
          presetId: unique + '-preset',
          name: unique + '-preset-name',
          description: 'Hosted browser preset parity smoke',
          scriptTemplate: 'echo ' + presetSecret,
          variables: ['TARGET_HOST'],
          enabled: true,
        });
        created.presetId = preset.id;
        const presetRead = await api.bootstrapPreset.get(preset.id);
        const presetUpdated = await api.bootstrapPreset.update(preset.id, {
          description: 'Updated hosted browser preset parity smoke',
          scriptTemplate: 'printf ' + presetSecret + '-updated',
          variables: ['TARGET_HOST', 'PACKAGE_SET'],
          enabled: false,
        });
        const presetMissing = await api.bootstrapPreset.get(unique + '-missing-preset');

        const run = await api.bootstrapRun.create({
          presetId: preset.id,
          hostId: null,
          scriptOutput: 'output ' + runSecret,
          status: 'pending',
        });
        created.runId = run.id;
        const runRead = await api.bootstrapRun.get(run.id);
        const runUpdated = await api.bootstrapRun.update(run.id, {
          scriptOutput: 'updated output ' + runSecret,
          status: 'success',
        });
        const runMissing = await api.bootstrapRun.get(unique + '-missing-run');

        const command = await api.commandHistory.create({
          command: 'printf ' + commandSecret,
          hostId: null,
          sessionId: null,
          exitCode: 0,
          durationMs: 12,
        });
        created.commandId = command.id;
        const commandRead = await api.commandHistory.get(command.id);
        const commandMissing = await api.commandHistory.get(unique + '-missing-command');

        const audit = await api.audit.list();
        const auditJson = JSON.stringify(audit);
        const secrets = [
          groupSecret,
          tagSecret,
          credentialSecret,
          credentialMetadataSecret,
          presetSecret,
          runSecret,
          commandSecret,
        ];

        const eventHasFlag = (type, flag) => audit.some((event) =>
          event.type === type && event.metadata && event.metadata[flag] === false,
        );

        const eventCount = (type) => audit.filter((event) => event.type === type).length;

        return {
          origin: window.location.origin,
          userAgent: navigator.userAgent,
          hostedInfo: appInfo.hosted === true
            && appInfo.hostedSecurity
            && appInfo.hostedSecurity.authRequired === false
            && authSession.authenticated === true
            && authSession.loginRequired === false,
          preloadAbsent: typeof window.require === 'undefined' && bounds === null,
          beforeCounts: {
            groups: groupBefore.length,
            tags: tagBefore.length,
            presets: presetBefore.length,
            runs: runBefore.length,
          },
          group: {
            created: Boolean(group.id),
            read: groupRead && groupRead.id === group.id,
            updated: groupUpdated && groupUpdated.color === '#654321',
            missing: groupMissing === null,
          },
          tag: {
            created: Boolean(tag.id),
            read: tagRead && tagRead.id === tag.id,
            updated: tagUpdated && tagUpdated.color === '#fedcba',
            missing: tagMissing === null,
          },
          credential: {
            created: Boolean(credential.id),
            read: credentialRead && credentialRead.referenceValue === credentialSecret,
            updated: credentialUpdated && credentialUpdated.referenceValue === credentialSecret + '-updated',
            missing: credentialMissing === null,
          },
          preset: {
            created: Boolean(preset.id),
            read: presetRead && presetRead.scriptTemplate.includes(presetSecret),
            updated: presetUpdated && presetUpdated.enabled === false,
            missing: presetMissing === null,
          },
          run: {
            created: Boolean(run.id),
            read: runRead && runRead.scriptOutput.includes(runSecret),
            updated: runUpdated && runUpdated.status === 'success',
            missing: runMissing === null,
          },
          commandHistory: {
            created: Boolean(command.id),
            read: commandRead && commandRead.command.includes(commandSecret),
            missing: commandMissing === null,
          },
          audit: {
            groupCreated: eventCount('host_group.created'),
            tagCreated: eventCount('host_tag.created'),
            credentialCreated: eventCount('credential_ref.created'),
            presetCreated: eventCount('bootstrap_preset.created'),
            runCreated: eventCount('bootstrap_run.created'),
            commandCreated: eventCount('command_history.created'),
            hostGroupNameLogged: eventHasFlag('host_group.created', 'hostGroupNameLogged'),
            hostTagNameLogged: eventHasFlag('host_tag.created', 'hostTagNameLogged'),
            credentialReferenceValueLogged: eventHasFlag('credential_ref.created', 'credentialReferenceValueLogged'),
            credentialRefMetadataLogged: eventHasFlag('credential_ref.created', 'credentialRefMetadataLogged'),
            scriptTemplateLogged: eventHasFlag('bootstrap_preset.created', 'scriptTemplateLogged'),
            scriptOutputLogged: eventHasFlag('bootstrap_run.created', 'scriptOutputLogged'),
            commandLogged: eventHasFlag('command_history.created', 'commandLogged'),
            commandOutputLogged: eventHasFlag('command_history.created', 'commandOutputLogged'),
            containsSecret: secrets.some((secret) => auditJson.includes(secret)),
          },
          cleanupTargetIds: created,
        };
      } finally {
        if (created.commandId) {
          await api.commandHistory.remove(created.commandId).catch(() => false);
        }
        if (created.runId) {
          await api.bootstrapRun.remove(created.runId).catch(() => false);
        }
        if (created.presetId) {
          await api.bootstrapPreset.remove(created.presetId).catch(() => false);
        }
        if (created.credentialId) {
          await api.credentialRef.remove(created.credentialId).catch(() => false);
        }
        if (created.tagId) {
          await api.hostTag.remove(created.tagId).catch(() => false);
        }
        if (created.groupId) {
          await api.hostGroup.remove(created.groupId).catch(() => false);
        }
      }
    })()`);

    assert.equal(result.origin, `http://127.0.0.1:${hostedPort}`, 'hosted browser loaded the hosted HTTP UI');
    assert.equal(result.hostedInfo, true, 'hosted app info reports no-auth hosted browser mode');
    assert.equal(result.preloadAbsent, true, 'hosted browser path is not using Electron preload APIs');
    assert.equal(result.group.created, true, 'hostGroup.create returned a persisted group');
    assert.equal(result.group.read, true, 'hostGroup.get returned the created group');
    assert.equal(result.group.updated, true, 'hostGroup.update returned the updated group');
    assert.equal(result.group.missing, true, 'hostGroup.get returns null for missing records');
    assert.equal(result.tag.created, true, 'hostTag.create returned a persisted tag');
    assert.equal(result.tag.read, true, 'hostTag.get returned the created tag');
    assert.equal(result.tag.updated, true, 'hostTag.update returned the updated tag');
    assert.equal(result.tag.missing, true, 'hostTag.get returns null for missing records');
    assert.equal(result.credential.created, true, 'credentialRef.create returned a persisted reference');
    assert.equal(result.credential.read, true, 'credentialRef.get returned the created reference');
    assert.equal(result.credential.updated, true, 'credentialRef.update returned the updated reference');
    assert.equal(result.credential.missing, true, 'credentialRef.get returns null for missing records');
    assert.equal(result.preset.created, true, 'bootstrapPreset.create returned a persisted preset');
    assert.equal(result.preset.read, true, 'bootstrapPreset.get returned the created preset');
    assert.equal(result.preset.updated, true, 'bootstrapPreset.update returned the updated preset');
    assert.equal(result.preset.missing, true, 'bootstrapPreset.get returns null for missing records');
    assert.equal(result.run.created, true, 'bootstrapRun.create returned a persisted run');
    assert.equal(result.run.read, true, 'bootstrapRun.get returned the created run');
    assert.equal(result.run.updated, true, 'bootstrapRun.update returned the updated run');
    assert.equal(result.run.missing, true, 'bootstrapRun.get returns null for missing records');
    assert.equal(result.commandHistory.created, true, 'commandHistory.create returned a persisted entry');
    assert.equal(result.commandHistory.read, true, 'commandHistory.get returned the created entry');
    assert.equal(result.commandHistory.missing, true, 'commandHistory.get returns null for missing records');
    assert.ok(result.audit.groupCreated >= 1, 'host group create audit was written');
    assert.ok(result.audit.tagCreated >= 1, 'host tag create audit was written');
    assert.ok(result.audit.credentialCreated >= 1, 'credential reference create audit was written');
    assert.ok(result.audit.presetCreated >= 1, 'bootstrap preset create audit was written');
    assert.ok(result.audit.runCreated >= 1, 'bootstrap run create audit was written');
    assert.ok(result.audit.commandCreated >= 1, 'command history create audit was written');
    assert.equal(result.audit.hostGroupNameLogged, true, 'host group audit metadata marks names as not logged');
    assert.equal(result.audit.hostTagNameLogged, true, 'host tag audit metadata marks names as not logged');
    assert.equal(result.audit.credentialReferenceValueLogged, true, 'credential reference audit metadata marks reference values as not logged');
    assert.equal(result.audit.credentialRefMetadataLogged, true, 'credential reference audit metadata marks metadata as not logged');
    assert.equal(result.audit.scriptTemplateLogged, true, 'bootstrap preset audit metadata marks script templates as not logged');
    assert.equal(result.audit.scriptOutputLogged, true, 'bootstrap run audit metadata marks script output as not logged');
    assert.equal(result.audit.commandLogged, true, 'command history audit metadata marks command text as not logged');
    assert.equal(result.audit.commandOutputLogged, true, 'command history audit metadata marks command output as not logged');
    assert.equal(result.audit.containsSecret, false, 'audit output does not contain browser-created secret markers');

    console.log('hosted browser API parity smoke: no-preload hosted window.sb CRUD, missing reads, and sanitized audit passed');
  } finally {
    cdp.close();
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  if (electronOutput) {
    console.error('\nElectron output:\n' + electronOutput);
  }
  if (browserOutput) {
    console.error('\nBrowser output:\n' + browserOutput);
  }
  process.exit(1);
});
}
