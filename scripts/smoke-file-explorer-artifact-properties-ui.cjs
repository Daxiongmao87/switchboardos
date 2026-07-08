#!/usr/bin/env node
// Rendered Electron smoke for File Explorer workspace artifact Properties/Get Info.

const assert = require('assert');
const { spawn } = require('child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('fs');
const { get } = require('http');
const { tmpdir } = require('os');
const { join } = require('path');

if (typeof WebSocket !== 'function') {
  console.error('This smoke requires Node with global WebSocket support. Use the repo Node 24 runtime.');
  process.exit(2);
}

const repoRoot = join(__dirname, '..');
const electronBin = join(repoRoot, 'node_modules', '.bin', 'electron');
const port = 11200 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-file-explorer-artifact-properties-'));
const screenshotPath = join(tmpdir(), 'switchboardos-file-explorer-artifact-properties-smoke.png');
const electronUserDataDir = join(configDir, 'electron-user-data');
const appletSourceMarker = 'PROPERTIES_APPLET_RAW_SOURCE_SHOULD_NOT_RENDER';
const scriptletRawMarker = 'PROPERTIES_SCRIPTLET_RAW_COMMAND_SHOULD_NOT_RENDER';

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
electron.stdout.on('data', (chunk) => {
  electronOutput += chunk.toString();
});
electron.stderr.on('data', (chunk) => {
  electronOutput += chunk.toString();
});

let cleanupDone = false;

function cleanup() {
  if (cleanupDone) {
    return;
  }
  cleanupDone = true;
  electron.kill('SIGKILL');
  rmSync(configDir, { recursive: true, force: true });
}

function waitForElectronExit(timeoutMs) {
  if (electron.exitCode !== null || electron.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      electron.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    electron.once('exit', onExit);
  });
}

async function shutdownElectron() {
  if (cleanupDone) {
    return;
  }
  cleanupDone = true;
  if (electron.exitCode === null && electron.signalCode === null) {
    electron.kill('SIGTERM');
    const exited = await waitForElectronExit(2500);
    if (!exited) {
      electron.kill('SIGKILL');
      await waitForElectronExit(2500);
    }
  }
  rmSync(configDir, { recursive: true, force: true });
}

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const request = get({ host: '127.0.0.1', port, path, timeout: 1000 }, (response) => {
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
      const pages = await getJson('/json/list');
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      // Electron may still be starting.
    }
    await sleep(250);
  }
  throw new Error(`Renderer page not available.\n${electronOutput}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          pending.resolve(message.result);
        }
      }
    };
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('CDP WebSocket failed to connect.'));
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

async function waitForShellApi(cdp) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`Boolean(
      window.sb
      && window.sb.workspaceFile
      && window.sb.workspaceArtifactContent
      && window.sb.workspaceScriptlet
      && window.sb.appManifest
      && window.sb.appPermission
      && window.sb.audit
    )`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose artifact properties dependencies.\n${electronOutput}`);
}

async function main() {
  const page = await waitForRendererPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');

  try {
    await waitForShellApi(cdp);
    const report = await cdp.evaluate(`(async () => {
      const appletSourceMarker = ${JSON.stringify(appletSourceMarker)};
      const scriptletRawMarker = ${JSON.stringify(scriptletRawMarker)};
      const appId = 'file-explorer-properties-smoke';
      const scriptletHostId = 'missing-host-properties-smoke';
      const appletManifest = {
        schemaVersion: 1,
        kind: 'applet',
        appId,
        name: 'Properties Applet Smoke',
        description: 'Applet artifact properties smoke.',
        version: '0.1.0',
        author: 'SwitchboardOS smoke',
        entrypoint: appId + '.js',
        icon: 'PI',
        category: 'workspace-applet',
        capabilities: ['host:read', 'context-menu:contribute'],
        sourceCode: "document.getElementById('app').textContent = '" + appletSourceMarker + "';",
        source: {
          language: 'javascript',
          entrypoint: appId + '.js',
          code: "document.getElementById('app').textContent = '" + appletSourceMarker + "';",
        },
        provenance: {
          generatedBy: 'artifact-properties-smoke',
          sourceCodeLogged: false,
          secretsLogged: false,
        },
      };
      const scriptletManifest = {
        schemaVersion: 1,
        kind: 'scriptlet',
        name: 'Properties Scriptlet Smoke',
        description: 'Scriptlet artifact properties smoke.',
        hostId: scriptletHostId,
        capabilities: ['ssh:exec'],
        command: 'printf ' + JSON.stringify(scriptletRawMarker),
        source: {
          language: 'shell',
          code: 'printf ' + JSON.stringify(scriptletRawMarker),
        },
        provenance: {
          generatedBy: 'artifact-properties-smoke',
          sourceLogged: false,
          secretsLogged: false,
        },
      };
      const malformedAppletManifest = {
        kind: 'applet',
        name: 'Malformed Applet Properties Smoke',
        capabilities: [],
      };
      const notReadyScriptletManifest = {
        kind: 'scriptlet',
        name: 'Not Ready Scriptlet Properties Smoke',
        capabilities: [],
      };

      const waitFor = async (predicate, label, timeout = 30000) => {
        const deadline = Date.now() + timeout;
        let lastError = '';
        while (Date.now() < deadline) {
          try {
            const value = await predicate();
            if (value) return value;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError : ''));
      };
      const textIncludes = (element, text) => (element?.textContent || '').includes(text);
      const click = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const rightClick = (element) => element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: element.getBoundingClientRect().left + 24,
        clientY: element.getBoundingClientRect().top + 18,
      }));
      const keydown = (element, key, options = {}) => element.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
        ...options,
      }));
      const menuButton = (actionId) => document.querySelector('[data-testid="context-menu"] [data-action-id="' + actionId + '"]');
      const byTestId = (testId) => document.querySelector('[data-testid="' + testId + '"]');
      const text = (testId) => byTestId(testId)?.textContent?.trim() || '';
      const selectedInfo = async () => {
        await waitFor(() => byTestId('workspace-artifact-info') && !byTestId('workspace-artifact-info-loading'), 'artifact properties info');
        const panelText = byTestId('workspace-artifact-properties')?.textContent || '';
        return {
          manifestName: text('artifact-info-manifest-name'),
          manifestKind: text('artifact-info-manifest-kind'),
          schemaVersion: text('artifact-info-schema-version'),
          capabilities: text('artifact-info-capabilities'),
          sourceRoute: text('artifact-info-source-route'),
          provenance: text('artifact-info-provenance'),
          path: text('artifact-info-path'),
          appletInstallStatus: text('artifact-info-applet-install-status'),
          appletInstalledAppId: text('artifact-info-applet-installed-app-id'),
          appletAppId: text('artifact-info-applet-app-id'),
          appletSourcePersistence: text('artifact-info-applet-source-persistence'),
          scriptletHost: text('artifact-info-scriptlet-host'),
          scriptletCommand: text('artifact-info-scriptlet-command'),
          scriptletReadiness: text('artifact-info-scriptlet-readiness'),
          scriptletApi: text('artifact-info-scriptlet-api'),
          validationText: text('artifact-info-validation') || text('artifact-info-validation-ok'),
          panelHasRawAppletSource: panelText.includes(appletSourceMarker),
          panelHasRawScriptletCommand: panelText.includes(scriptletRawMarker) || panelText.includes('printf '),
        };
      };
      const rowFor = async (path) => waitFor(
        () => [...document.querySelectorAll('.workspace-file-item')]
          .find((row) => row.getAttribute('data-workspace-artifact-path') === path) || null,
        'workspace row ' + path,
      );

      await waitFor(() => document.querySelector('[data-testid="desktop-shell"]'), 'desktop shell');
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'e',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }));
      const fileWindow = await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="workspace-files"]'),
        'File Explorer shell window',
      );
      const newAppletButton = await waitFor(
        () => [...fileWindow.querySelectorAll('button')]
          .find((button) => textIncludes(button, 'New Applet')) || null,
        'New Applet button',
      );
      const newScriptletButton = await waitFor(
        () => [...fileWindow.querySelectorAll('button')]
          .find((button) => textIncludes(button, 'New Scriptlet')) || null,
        'New Scriptlet button',
      );

      click(newAppletButton);
      const appletEntry = await waitFor(async () => {
        const entries = await window.sb.workspaceFile.list('');
        return entries.find((entry) => entry.kind === 'applet' && entry.path?.endsWith('.sbapplet.json')) || null;
      }, 'created applet artifact');
      await window.sb.workspaceArtifactContent.update(appletEntry.path, JSON.stringify(appletManifest, null, 2));
      const appletRow = await rowFor(appletEntry.path);
      appletRow.focus();
      click(appletRow);
      const appletInfoBeforeInstall = await selectedInfo();

      rightClick(appletRow);
      const menu = await waitFor(
        () => document.querySelector('[data-testid="context-menu"][data-context-target="workspace-file"]'),
        'workspace artifact context menu',
      );
      const propertiesAction = menuButton('properties-workspace-artifact');
      const contextPropertiesReport = {
        contextTarget: menu.getAttribute('data-context-target') || '',
        objectKind: menu.getAttribute('data-shell-object-kind') || '',
        objectOwner: menu.getAttribute('data-shell-object-owner') || '',
        objectSource: menu.getAttribute('data-shell-object-source') || '',
        sourceAppId: menu.getAttribute('data-shell-object-source-app-id') || '',
        targetPath: menu.getAttribute('data-target-path') || '',
        actionIds: [...menu.querySelectorAll('[data-action-id]')].map((item) => item.getAttribute('data-action-id') || ''),
        propertiesLabel: propertiesAction?.textContent?.trim() || '',
        propertiesSource: propertiesAction?.getAttribute('data-action-source') || '',
      };
      click(propertiesAction);
      const appletInfoFromContextProperties = await selectedInfo();

      click(appletRow.querySelector('[data-testid="workspace-artifact-open-action"]'));
      await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="' + appId + '"]'),
        'generated app window opened from applet artifact',
        60000,
      );
      click(appletRow);
      const appletInfoAfterInstall = await waitFor(async () => {
        const info = await selectedInfo();
        return info.appletInstallStatus.includes('Installed') ? info : null;
      }, 'applet properties after registry install', 60000);

      click(newScriptletButton);
      const scriptletEntry = await waitFor(async () => {
        const entries = await window.sb.workspaceFile.list('');
        return entries.find((entry) => entry.kind === 'scriptlet' && entry.path?.endsWith('.sbscriptlet.json')) || null;
      }, 'created scriptlet artifact');
      await window.sb.workspaceArtifactContent.update(scriptletEntry.path, JSON.stringify(scriptletManifest, null, 2));
      const scriptletRow = await rowFor(scriptletEntry.path);
      scriptletRow.focus();
      keydown(scriptletRow, 'Enter', { altKey: true });
      const scriptletInfoFromKeyboard = await selectedInfo();

      click(newAppletButton);
      const malformedAppletEntry = await waitFor(async () => {
        const entries = await window.sb.workspaceFile.list('');
        return entries
          .filter((entry) => entry.kind === 'applet' && entry.path?.endsWith('.sbapplet.json'))
          .find((entry) => entry.path !== appletEntry.path) || null;
      }, 'created malformed applet artifact');
      await window.sb.workspaceArtifactContent.update(malformedAppletEntry.path, JSON.stringify(malformedAppletManifest, null, 2));
      const malformedAppletRow = await rowFor(malformedAppletEntry.path);
      click(malformedAppletRow);
      const malformedAppletInfo = await selectedInfo();

      click(newScriptletButton);
      const notReadyScriptletEntry = await waitFor(async () => {
        const entries = await window.sb.workspaceFile.list('');
        return entries
          .filter((entry) => entry.kind === 'scriptlet' && entry.path?.endsWith('.sbscriptlet.json'))
          .find((entry) => entry.path !== scriptletEntry.path) || null;
      }, 'created not-ready scriptlet artifact');
      await window.sb.workspaceArtifactContent.update(notReadyScriptletEntry.path, JSON.stringify(notReadyScriptletManifest, null, 2));
      const notReadyScriptletRow = await rowFor(notReadyScriptletEntry.path);
      click(notReadyScriptletRow);
      const notReadyScriptletInfo = await selectedInfo();

      const audit = await window.sb.audit.list();
      const scriptletRunAuditCount = audit.filter((event) => event.type === 'workspace_scriptlet.run_completed').length;
      const localStorageSourceKeys = Object.keys(localStorage).filter((key) =>
        /scriptlet.*source|source.*scriptlet|workspaceScriptlet|workspace-scriptlet|workspaceArtifactContent|workspace-artifact-content|manifest.*source|source.*manifest/i.test(key),
      );

      return {
        appletPath: appletEntry.path,
        scriptletPath: scriptletEntry.path,
        appletInfoBeforeInstall,
        contextPropertiesReport,
        appletInfoFromContextProperties,
        appletInfoAfterInstall,
        scriptletInfoFromKeyboard,
        malformedAppletInfo,
        notReadyScriptletInfo,
        scriptletRunAuditCount,
        localStorageSourceKeys,
      };
    })()`);

    assert.equal(report.appletInfoBeforeInstall.manifestName, 'Properties Applet Smoke', 'Applet properties read manifest name.');
    assert.equal(report.appletInfoBeforeInstall.manifestKind, 'applet', 'Applet properties read manifest kind.');
    assert.equal(report.appletInfoBeforeInstall.schemaVersion, '1', 'Applet properties read schemaVersion.');
    assert.equal(report.appletInfoBeforeInstall.capabilities.includes('2 declared'), true, 'Applet properties show capability count.');
    assert.equal(report.appletInfoBeforeInstall.capabilities.includes('host:read'), true, 'Applet properties show declared host capability.');
    assert.equal(report.appletInfoBeforeInstall.sourceRoute, 'workspaceArtifactContent', 'Applet properties show workspaceArtifactContent source route.');
    assert.equal(report.appletInfoBeforeInstall.provenance, 'artifact-properties-smoke', 'Applet properties show safe provenance metadata.');
    assert.equal(report.appletInfoBeforeInstall.appletInstallStatus, 'Not installed', 'Applet properties do not fake installed status from filename.');
    assert.equal(report.appletInfoBeforeInstall.appletAppId, 'file-explorer-properties-smoke', 'Applet properties show manifest appId.');
    assert.equal(report.appletInfoBeforeInstall.panelHasRawAppletSource, false, 'Applet properties do not render raw generated source.');
    assert.equal(report.contextPropertiesReport.contextTarget, 'workspace-file', 'Properties context menu uses workspace file target.');
    assert.equal(report.contextPropertiesReport.objectKind, 'workspace-applet-artifact', 'Properties context menu preserves applet artifact object kind.');
    assert.equal(report.contextPropertiesReport.objectOwner, 'workspace-files', 'Properties context menu preserves object owner.');
    assert.equal(report.contextPropertiesReport.objectSource, 'workspace-file-object', 'Properties context menu preserves object source.');
    assert.equal(report.contextPropertiesReport.sourceAppId, 'workspace-files', 'Properties context menu preserves source app id.');
    assert.equal(report.contextPropertiesReport.targetPath, report.appletPath, 'Properties context menu carries artifact path identity.');
    assert.equal(report.contextPropertiesReport.actionIds.includes('properties-workspace-artifact'), true, 'Context menu includes Properties action.');
    assert.equal(report.contextPropertiesReport.propertiesSource, 'workspace-file-object', 'Properties action source is workspace file object.');
    assert.equal(report.appletInfoFromContextProperties.path, report.appletPath, 'Context-menu Properties uses same artifact get-info path.');
    assert.equal(report.appletInfoAfterInstall.appletInstallStatus, 'Installed and enabled from workspaceArtifactContent', 'Applet properties show registry-backed installed status after install/open.');
    assert.equal(report.appletInfoAfterInstall.appletInstalledAppId, 'file-explorer-properties-smoke', 'Applet properties show installed app id from registry.');
    assert.equal(report.appletInfoAfterInstall.appletSourcePersistence, 'workspaceArtifactContent', 'Applet properties show artifact-backed source persistence.');
    assert.equal(report.appletInfoAfterInstall.panelHasRawAppletSource, false, 'Applet installed properties do not render raw source.');
    assert.equal(report.scriptletInfoFromKeyboard.manifestName, 'Properties Scriptlet Smoke', 'Alt+Enter opens scriptlet properties.');
    assert.equal(report.scriptletInfoFromKeyboard.manifestKind, 'scriptlet', 'Scriptlet properties read manifest kind.');
    assert.equal(report.scriptletInfoFromKeyboard.capabilities.includes('ssh:exec'), true, 'Scriptlet properties show declared ssh:exec capability.');
    assert.equal(report.scriptletInfoFromKeyboard.scriptletHost, 'missing-host-properties-smoke', 'Scriptlet properties show host id presence.');
    assert.equal(report.scriptletInfoFromKeyboard.scriptletCommand, 'command declared', 'Scriptlet properties show command presence without command text.');
    assert.equal(report.scriptletInfoFromKeyboard.scriptletReadiness, 'Ready to run through workspaceScriptlet.run', 'Scriptlet properties show run readiness without executing.');
    assert.equal(report.scriptletInfoFromKeyboard.scriptletApi, 'workspaceScriptlet available', 'Scriptlet properties show workspaceScriptlet API availability.');
    assert.equal(report.scriptletInfoFromKeyboard.panelHasRawScriptletCommand, false, 'Scriptlet properties do not render raw command/source.');
    assert.equal(report.malformedAppletInfo.validationText.includes('Manifest schemaVersion is missing.'), true, 'Malformed applet properties show missing schema validation.');
    assert.equal(report.malformedAppletInfo.validationText.includes('Applet manifest is missing appId.'), true, 'Malformed applet properties show missing appId validation.');
    assert.equal(report.notReadyScriptletInfo.validationText.includes('Scriptlet manifest is missing the ssh:exec capability.'), true, 'Scriptlet properties show missing capability validation.');
    assert.equal(report.notReadyScriptletInfo.validationText.includes('Scriptlet manifest is missing hostId.'), true, 'Scriptlet properties show missing host validation.');
    assert.equal(report.notReadyScriptletInfo.validationText.includes('Scriptlet manifest is missing command or source.code.'), true, 'Scriptlet properties show missing command validation.');
    assert.equal(report.notReadyScriptletInfo.scriptletReadiness.includes('requires ssh:exec capability'), true, 'Not-ready scriptlet properties show readiness reason.');
    assert.equal(report.scriptletRunAuditCount, 0, 'Properties smoke did not execute scriptlets.');
    assert.deepEqual(report.localStorageSourceKeys, [], 'Properties path does not persist source or manifest through localStorage keys.');

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({ ok: true, ...report, screenshotPath }, null, 2));
  } finally {
    cdp.close();
    await shutdownElectron();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    console.error(electronOutput);
    process.exit(1);
  });
