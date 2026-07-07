#!/usr/bin/env node
// Rendered Electron smoke for App Studio workspace artifact-backed generated app installs.

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
const port = 9600 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-app-studio-artifact-'));
const screenshotPath = join(tmpdir(), 'switchboardos-app-studio-artifact-smoke.png');
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

async function waitForAppStudioApi(cdp) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`Boolean(
      window.sb
      && window.sb.appManifest
      && window.sb.appPermission
      && window.sb.workspaceFile
      && window.sb.workspaceArtifactContent
      && window.sb.audit
    )`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose App Studio artifact install dependencies.\n${electronOutput}`);
}

async function main() {
  const page = await waitForRendererPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');

  try {
    await waitForAppStudioApi(cdp);
    const report = await cdp.evaluate(`(async () => {
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

      await waitFor(
        () => document.querySelector('[data-testid="desktop-shell"]'),
        'desktop shell',
      );
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      const palette = await waitFor(
        () => document.querySelector('[data-testid="command-palette"]'),
        'command palette',
      );
      const paletteInput = await waitFor(
        () => palette.querySelector('input[name="paletteQuery"]'),
        'command palette search input',
      );
      paletteInput.value = 'App Studio';
      paletteInput.dispatchEvent(new Event('input', { bubbles: true }));
      const appStudioResult = await waitFor(
        () => [...palette.querySelectorAll('.palette-result')]
          .find((button) => button.textContent && button.textContent.includes('App Studio')) || null,
        'App Studio command palette result',
      );
      appStudioResult.click();
      const studioWindow = await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="app-studio"]'),
        'App Studio shell window',
      );
      const studio = await waitFor(
        () => studioWindow.querySelector('[data-testid="app-studio-runtime"]'),
        'App Studio runtime surface',
      );
      await waitFor(
        () => studio.getAttribute('data-monaco-loaded') === 'true',
        'App Studio Monaco review readiness',
        60000,
      );
      const installButton = await waitFor(
        () => {
          const button = studio.querySelector('[data-testid="app-studio-install-button"]');
          return button && !button.disabled ? button : null;
        },
        'enabled App Studio install button',
      );
      installButton.click();

      try {
        await waitFor(
          () => studio.getAttribute('data-install-status') === 'installed',
          'App Studio installed status',
          60000,
        );
      } catch (error) {
        throw new Error((error instanceof Error ? error.message : String(error)) + ': ' + JSON.stringify({
          installStatus: studio.getAttribute('data-install-status'),
          installedAppId: studio.getAttribute('data-installed-app-id'),
          monacoLoaded: studio.getAttribute('data-monaco-loaded'),
          text: studio.textContent,
        }));
      }
      const appId = studio.getAttribute('data-installed-app-id');
      if (!appId) {
        throw new Error('App Studio did not expose installed app id.');
      }

      const api = window.sb;
      const manifest = await waitFor(async () => {
        const manifests = await api.appManifest.list();
        return manifests.find((candidate) => candidate.appId === appId) || null;
      }, 'generated app manifest row');

      const artifactPath = manifest.packageMetadata?.artifactPath || '';
      const artifact = artifactPath ? await api.workspaceArtifactContent.get(artifactPath) : null;
      const artifactManifest = artifact?.manifest || {};
      const generatedWindow = await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="' + appId + '"]'),
        'installed generated app shell window',
        60000,
      );
      const runtime = await waitFor(
        () => generatedWindow.querySelector('[data-testid="generated-app-runtime"]'),
        'installed generated app runtime',
      );
      await waitFor(
        () => {
          const srcdoc = runtime.querySelector('iframe')?.getAttribute('srcdoc') || '';
          const status = runtime.getAttribute('data-semantic-status') || '';
          return srcdoc.includes('Generated Host Health') && status !== 'loading';
        },
        'artifact-backed generated runtime source',
        60000,
      );
      const runtimeSrcdoc = runtime.querySelector('iframe')?.getAttribute('srcdoc') || '';

      window.postMessage({ type: 'sb:app-open', appId: 'apps' }, '*');
      const appsWindow = await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="apps"]'),
        'App Manager shell window',
      );
      const artifactStatus = await waitFor(
        () => appsWindow.querySelector('[data-testid="app-artifact-status-' + appId + '"]')?.textContent?.trim(),
        'App Manager artifact status',
      );

      const audit = await api.audit.list();
      const auditJson = JSON.stringify(audit.filter((event) =>
        event.entityId === appId || event.metadata?.appId === appId || event.metadata?.artifactPath === artifactPath,
      ));
      const localStorageSourceKeys = Object.keys(localStorage).filter((key) =>
        /generated.*source|source.*generated|appStudio.*source|workspaceArtifactContent|workspace-artifact-content/i.test(key),
      );

      return {
        appId,
        installStatus: studio.getAttribute('data-install-status'),
        installStatusText: studio.textContent,
        manifestId: manifest.id,
        manifestSourceCodeLength: manifest.sourceCode.length,
        manifestPackageMetadata: manifest.packageMetadata,
        artifactPath,
        artifactKind: artifact?.kind || null,
        artifactContentType: artifact?.contentType || null,
        artifactCapabilities: artifact?.capabilities || [],
        artifactManifestKind: artifactManifest.kind || null,
        artifactManifestAppId: artifactManifest.appId || null,
        artifactHasSourceCode: typeof artifactManifest.sourceCode === 'string' && artifactManifest.sourceCode.includes('Generated Host Health'),
        runtimeStatus: runtime.getAttribute('data-semantic-status') || '',
        runtimeCapabilities: runtime.getAttribute('data-granted-capabilities') || '',
        runtimeSrcdocHasAppStudioSource: runtimeSrcdoc.includes('Generated Host Health'),
        runtimeSrcdocHasFallback: runtimeSrcdoc.includes('Generated app fallback'),
        appManagerArtifactStatus: artifactStatus,
        auditHasRawSource: auditJson.includes('Generated Host Health') || auditJson.includes('SwitchboardOS.host.listHosts'),
        auditSourceCodeLoggedFalse: auditJson.includes('"sourceCodeLogged":false'),
        localStorageSourceKeys,
      };
    })()`);

    assert.equal(report.installStatus, 'installed', 'App Studio reports installed status.');
    assert.equal(report.manifestSourceCodeLength, 0, 'Generated app manifest does not persist sourceCode as the content store.');
    assert.equal(report.manifestPackageMetadata.artifactBacked, true, 'Manifest metadata marks artifact-backed install.');
    assert.equal(report.manifestPackageMetadata.artifactContentRoute, 'workspaceArtifactContent', 'Manifest metadata names workspaceArtifactContent route.');
    assert.equal(report.manifestPackageMetadata.sourcePersistence, 'workspaceArtifactContent', 'Manifest metadata names artifact source persistence.');
    assert.equal(typeof report.artifactPath, 'string', 'Manifest metadata contains artifact path.');
    assert.equal(report.artifactPath.endsWith('.sbapplet.json'), true, 'Artifact path is an applet manifest file.');
    assert.equal(report.artifactKind, 'applet', 'Workspace artifact content route returns applet kind.');
    assert.equal(report.artifactContentType, 'application/json', 'Workspace artifact content route returns JSON content type.');
    assert.equal(report.artifactManifestKind, 'applet', 'Workspace artifact manifest declares applet kind.');
    assert.equal(report.artifactManifestAppId, report.appId, 'Workspace artifact manifest owns generated app id.');
    assert.equal(report.artifactHasSourceCode, true, 'Workspace artifact content stores generated app source.');
    assert.equal(report.runtimeSrcdocHasAppStudioSource, true, 'Generated runtime loads App Studio source from artifact content.');
    assert.equal(report.runtimeSrcdocHasFallback, false, 'Generated runtime did not use fallback source.');
    assert.equal(report.runtimeCapabilities.includes('host:read'), true, 'Generated runtime preserves approved capabilities.');
    assert.equal(report.appManagerArtifactStatus.includes(report.artifactPath), true, 'App Manager exposes artifact-backed status.');
    assert.equal(report.auditHasRawSource, false, 'Audit evidence does not log raw generated source.');
    assert.equal(report.auditSourceCodeLoggedFalse, true, 'Audit metadata preserves sourceCodeLogged false.');
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
