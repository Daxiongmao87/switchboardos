#!/usr/bin/env node
// Rendered Electron smoke for File Explorer .sbapplet.json artifact install/open actions.

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
const port = 10000 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-file-explorer-applet-'));
const screenshotPath = join(tmpdir(), 'switchboardos-file-explorer-applet-smoke.png');
const electronUserDataDir = join(configDir, 'electron-user-data');
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
      && window.sb.appManifest
      && window.sb.appPermission
      && window.sb.audit
    )`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose File Explorer artifact dependencies.\n${electronOutput}`);
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
      const appId = 'file-explorer-artifact-smoke';
      const marker = 'File Explorer Artifact App Ready';
      const sourceCode = [
        "const root = document.getElementById('app');",
        "root.innerHTML = '<main data-testid=\\"file-explorer-artifact-app\\"><h1>File Explorer Artifact App Ready</h1><p>Launched through File Explorer artifact action.</p></main>';",
        "window.SwitchboardOS?.window?.setStatus?.('artifact-opened');"
      ].join('\\n');
      const artifactManifest = {
        schemaVersion: 1,
        kind: 'applet',
        appId,
        name: 'File Explorer Artifact Smoke',
        description: 'Generated applet artifact installed from File Explorer.',
        version: '0.1.0',
        author: 'SwitchboardOS smoke',
        entrypoint: appId + '.js',
        icon: 'FA',
        category: 'workspace-applet',
        capabilities: ['host:read', 'context-menu:contribute'],
        sourceCode,
        source: {
          language: 'javascript',
          entrypoint: appId + '.js',
          code: sourceCode,
        },
        provenance: {
          generatedBy: 'file-explorer-artifact-smoke',
          approvedBy: 'rendered-smoke',
          sourceCodeLogged: false,
          secretsLogged: false,
        },
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
      click(newAppletButton);
      const artifactEntry = await waitFor(async () => {
        const entries = await window.sb.workspaceFile.list('');
        return entries.find((entry) => entry.kind === 'applet' && entry.path?.endsWith('.sbapplet.json')) || null;
      }, 'created workspace applet artifact');
      const updatedArtifact = await window.sb.workspaceArtifactContent.update(
        artifactEntry.path,
        JSON.stringify(artifactManifest, null, 2),
      );
      const artifactReadback = await window.sb.workspaceArtifactContent.get(artifactEntry.path);
      const artifactRow = await waitFor(
        () => [...fileWindow.querySelectorAll('.workspace-file-item')]
          .find((row) => row.getAttribute('data-workspace-artifact-path') === artifactEntry.path) || null,
        'workspace applet row in File Explorer',
      );
      const visibleActionText = artifactRow.querySelector('[data-testid="workspace-artifact-open-action"]')?.textContent?.trim() || '';

      artifactRow.focus();
      rightClick(artifactRow);
      const rightClickMenu = await waitFor(
        () => document.querySelector('[data-testid="context-menu"][data-context-target="workspace-file"]'),
        'right-click shared workspace artifact context menu',
      );
      const rightClickReport = {
        contextTarget: rightClickMenu.getAttribute('data-context-target') || '',
        objectKind: rightClickMenu.getAttribute('data-shell-object-kind') || '',
        objectOwner: rightClickMenu.getAttribute('data-shell-object-owner') || '',
        objectSource: rightClickMenu.getAttribute('data-shell-object-source') || '',
        sourceAppId: rightClickMenu.getAttribute('data-shell-object-source-app-id') || '',
        targetPath: rightClickMenu.getAttribute('data-target-path') || '',
        actionIds: [...rightClickMenu.querySelectorAll('[data-action-id]')].map((item) => item.getAttribute('data-action-id') || ''),
        installActionCapabilities: menuButton('install-open-workspace-applet-artifact')?.getAttribute('data-required-capabilities') || '',
        installActionSource: menuButton('install-open-workspace-applet-artifact')?.getAttribute('data-action-source') || '',
        disabledReasons: [...rightClickMenu.querySelectorAll('[data-disabled-reason]')]
          .map((item) => item.getAttribute('data-disabled-reason') || '')
          .filter(Boolean),
      };
      keydown(document.activeElement || rightClickMenu, 'Escape');
      await waitFor(
        () => !document.querySelector('[data-testid="context-menu"]') && document.activeElement === artifactRow,
        'Escape returns focus to workspace artifact row',
      );

      keydown(artifactRow, 'F10', { shiftKey: true });
      const keyboardMenu = await waitFor(
        () => document.querySelector('[data-testid="context-menu"][data-context-target="workspace-file"]'),
        'keyboard shared workspace artifact context menu',
      );
      const keyboardReport = {
        contextTarget: keyboardMenu.getAttribute('data-context-target') || '',
        objectKind: keyboardMenu.getAttribute('data-shell-object-kind') || '',
        targetPath: keyboardMenu.getAttribute('data-target-path') || '',
      };
      click(menuButton('install-open-workspace-applet-artifact'));

      const generatedWindow = await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="' + appId + '"]'),
        'generated app launched from File Explorer',
        60000,
      );
      const runtime = await waitFor(
        () => generatedWindow.querySelector('[data-testid="generated-app-runtime"]'),
        'generated app runtime',
      );
      await waitFor(
        () => {
          const srcdoc = runtime.querySelector('iframe')?.getAttribute('srcdoc') || '';
          const status = runtime.getAttribute('data-semantic-status') || '';
          return srcdoc.includes(marker) && status !== 'loading';
        },
        'artifact-backed generated runtime from File Explorer source',
        60000,
      );
      const runtimeSrcdoc = runtime.querySelector('iframe')?.getAttribute('srcdoc') || '';
      const manifest = await waitFor(async () => {
        const manifests = await window.sb.appManifest.list();
        return manifests.find((candidate) => candidate.appId === appId) || null;
      }, 'registry manifest created from File Explorer artifact');
      const permissions = await window.sb.appPermission.list(appId);
      const audit = await window.sb.audit.list();
      const auditJson = JSON.stringify(audit.filter((event) =>
        event.entityId === appId || event.metadata?.appId === appId || event.metadata?.artifactPath === artifactEntry.path,
      ));
      const localStorageSourceKeys = Object.keys(localStorage).filter((key) =>
        /generated.*source|source.*generated|appStudio.*source|workspaceArtifactContent|workspace-artifact-content/i.test(key),
      );

      return {
        appId,
        artifactPath: artifactEntry.path,
        updatedArtifactKind: updatedArtifact.kind,
        artifactReadbackKind: artifactReadback.kind,
        artifactReadbackAppId: artifactReadback.manifest?.appId || '',
        artifactReadbackHasSource: JSON.stringify(artifactReadback.manifest || {}).includes(marker),
        visibleActionText,
        rightClickReport,
        keyboardReport,
        manifestSourceCodeLength: manifest.sourceCode.length,
        manifestPackageMetadata: manifest.packageMetadata,
        permissions: permissions.map((permission) => ({
          capability: permission.capability,
          granted: permission.granted,
        })),
        runtimeStatus: runtime.getAttribute('data-semantic-status') || '',
        runtimeCapabilities: runtime.getAttribute('data-granted-capabilities') || '',
        runtimeSrcdocHasArtifactSource: runtimeSrcdoc.includes(marker),
        runtimeSrcdocHasFallback: runtimeSrcdoc.includes('Generated app fallback'),
        auditHasRawSource: auditJson.includes(marker) || auditJson.includes('Launched through File Explorer artifact action'),
        auditSourceCodeLoggedFalse: auditJson.includes('"sourceCodeLogged":false'),
        localStorageSourceKeys,
      };
    })()`);

    assert.equal(report.updatedArtifactKind, 'applet', 'Workspace artifact update returns applet kind.');
    assert.equal(report.artifactReadbackKind, 'applet', 'Workspace artifact content read uses applet kind.');
    assert.equal(report.artifactReadbackAppId, report.appId, 'Workspace artifact content read returns app manifest appId.');
    assert.equal(report.artifactReadbackHasSource, true, 'Workspace artifact content read returns generated source.');
    assert.match(report.visibleActionText, /Install\/Open Applet|Launch Applet/, 'File Explorer row exposes applet open/install action.');
    assert.equal(report.rightClickReport.contextTarget, 'workspace-file', 'Right-click uses shared shell context menu target.');
    assert.equal(report.rightClickReport.objectKind, 'workspace-applet-artifact', 'Right-click menu carries applet artifact object kind.');
    assert.equal(report.rightClickReport.objectOwner, 'workspace-files', 'Right-click menu carries File Explorer object owner.');
    assert.equal(report.rightClickReport.objectSource, 'workspace-file-object', 'Right-click menu carries workspace file object source.');
    assert.equal(report.rightClickReport.sourceAppId, 'workspace-files', 'Right-click menu carries source app id.');
    assert.equal(report.rightClickReport.targetPath, report.artifactPath, 'Right-click menu carries workspace artifact path identity.');
    assert.equal(report.rightClickReport.actionIds.includes('install-open-workspace-applet-artifact'), true, 'Right-click menu includes applet install/open action.');
    assert.equal(report.rightClickReport.installActionCapabilities.includes('workspace-file:read'), true, 'Install action requires workspace file read capability.');
    assert.equal(report.rightClickReport.installActionCapabilities.includes('app-manifest:create'), true, 'Install action requires manifest create capability before install.');
    assert.equal(report.rightClickReport.installActionCapabilities.includes('app-permission:grant'), true, 'Install action requires permission grant capability.');
    assert.equal(report.rightClickReport.installActionSource, 'workspace-file-object', 'Install action source is workspace file object.');
    assert.equal(report.rightClickReport.disabledReasons.some((reason) => reason.includes('Open With handlers')), true, 'Shared menu exposes plain-language disabled reason.');
    assert.equal(report.keyboardReport.contextTarget, 'workspace-file', 'Shift+F10 uses shared shell context menu target.');
    assert.equal(report.keyboardReport.objectKind, 'workspace-applet-artifact', 'Keyboard menu carries applet artifact object kind.');
    assert.equal(report.keyboardReport.targetPath, report.artifactPath, 'Keyboard menu carries workspace artifact path identity.');
    assert.equal(report.manifestSourceCodeLength, 0, 'Registry manifest does not persist generated sourceCode.');
    assert.equal(report.manifestPackageMetadata.artifactBacked, true, 'Registry manifest marks artifact-backed install.');
    assert.equal(report.manifestPackageMetadata.artifactPath, report.artifactPath, 'Registry manifest stores artifact identity.');
    assert.equal(report.manifestPackageMetadata.artifactContentRoute, 'workspaceArtifactContent', 'Registry manifest stores artifact content route.');
    assert.equal(report.manifestPackageMetadata.sourcePersistence, 'workspaceArtifactContent', 'Registry manifest uses workspace artifact source persistence.');
    assert.equal(report.permissions.some((permission) => permission.capability === 'host:read' && permission.granted), true, 'App permission lifecycle grants host:read.');
    assert.equal(report.permissions.some((permission) => permission.capability === 'context-menu:contribute' && permission.granted), true, 'App permission lifecycle grants context-menu contribution.');
    assert.equal(report.runtimeSrcdocHasArtifactSource, true, 'Generated runtime loads source from workspace artifact content.');
    assert.equal(report.runtimeSrcdocHasFallback, false, 'Generated runtime did not use fallback source.');
    assert.equal(report.runtimeCapabilities.includes('host:read'), true, 'Generated runtime preserves granted capabilities.');
    assert.equal(report.auditHasRawSource, false, 'Audit evidence does not log raw generated source.');
    assert.equal(report.auditSourceCodeLoggedFalse, true, 'Audit metadata records sourceCodeLogged false.');
    assert.deepEqual(report.localStorageSourceKeys, [], 'Generated app source is not persisted through localStorage source keys.');

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
