#!/usr/bin/env node
// Rendered Electron smoke for generated-app SDK context menu contributions.

const assert = require('assert/strict');
const { spawn } = require('child_process');
const { readFileSync, mkdtempSync, rmSync, writeFileSync } = require('fs');
const { get } = require('http');
const { tmpdir } = require('os');
const { join } = require('path');

if (typeof WebSocket !== 'function') {
  console.error('This smoke requires Node with global WebSocket support. Use the repo Node 24 runtime.');
  process.exit(2);
}

const repoRoot = join(__dirname, '..');
const appComponentSource = readFileSync(join(repoRoot, 'src/renderer/app/app.component.ts'), 'utf8');
const generatedRuntimeSource = readFileSync(join(repoRoot, 'src/renderer/app/generated-app-runtime/generated-app-runtime.component.ts'), 'utf8');
const fileBrowserSmokeSource = readFileSync(join(repoRoot, 'scripts/smoke-ssh-file-browser-ui.cjs'), 'utf8');

assert.equal(appComponentSource.includes('openAppletElementContextMenu'), true, 'Shell exposes generic applet element context menu dispatcher.');
assert.equal(generatedRuntimeSource.includes('contextMenu: Object.freeze'), true, 'Generated app SDK bootstrap exposes contextMenu APIs.');
assert.equal(generatedRuntimeSource.includes('contextMenu:register'), true, 'Generated app SDK routes context menu registration through postMessage.');
assert.equal(generatedRuntimeSource.includes('contextMenu:open'), true, 'Generated app SDK routes context menu invocation through postMessage.');
assert.equal(fileBrowserSmokeSource.includes('data-context-target="ssh-file-object"'), true, 'File Browser shared context-menu smoke remains present.');

const electronBin = join(repoRoot, 'node_modules', '.bin', 'electron');
const port = 9800 + Math.floor(Math.random() * 300);
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-generated-menu-'));
const screenshotPath = join(tmpdir(), 'switchboardos-generated-menu-smoke.png');
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

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  electron.kill('SIGTERM');
  rmSync(configDir, { recursive: true, force: true });
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
      clearTimeout(pending.timeoutId);
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
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`${pending.method} closed before response`));
      this.pending.delete(id);
    }
    this.ws?.close();
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 180000);
      this.pending.set(id, { method, resolve, reject, timeoutId });
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

async function dispatchMouse(cdp, type, x, y, button, buttons) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button,
    buttons,
    clickCount: 1,
  });
}

async function clickAt(cdp, x, y, button = 'left') {
  const buttons = button === 'right' ? 2 : 1;
  await dispatchMouse(cdp, 'mouseMoved', x, y, 'none', 0);
  await dispatchMouse(cdp, 'mousePressed', x, y, button, buttons);
  await dispatchMouse(cdp, 'mouseReleased', x, y, button, 0);
}

async function key(cdp, keyValue, options = {}) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: keyValue,
    code: options.code || keyValue,
    windowsVirtualKeyCode: options.windowsVirtualKeyCode || 0,
    nativeVirtualKeyCode: options.windowsVirtualKeyCode || 0,
    modifiers: options.modifiers || 0,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyValue,
    code: options.code || keyValue,
    windowsVirtualKeyCode: options.windowsVirtualKeyCode || 0,
    nativeVirtualKeyCode: options.windowsVirtualKeyCode || 0,
    modifiers: options.modifiers || 0,
  });
}

function setupGeneratedAppContextMenuSmoke() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, label, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    let latest = null;
    while (Date.now() < deadline) {
      latest = predicate();
      if (latest && !latest.__pending) {
        return latest;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(latest)}`);
  };
  return (async () => {
    const api = window.sb;
    if (!api?.appManifest || !api.appPermission) {
      throw new Error('Generated app manifest and permission APIs are required.');
    }
    await waitFor(() => document.querySelector('[data-testid="desktop-shell"]'), 'desktop shell');
    await sleep(800);
    const appId = `smoke-generated-context-menu-${Date.now()}`;
    const semanticEvents = [];
    const handleSemantic = (event) => {
      if (event.detail?.semanticState?.metadata?.appId === appId) {
        semanticEvents.push(event.detail);
      }
    };
    window.addEventListener('switchboard-generated-app-semantic', handleSemantic);
    window.__generatedContextMenuSmoke = {
      appId,
      semanticEvents,
      manifestId: null,
      permissionId: null,
      cleanup: async () => {
        window.removeEventListener('switchboard-generated-app-semantic', handleSemantic);
        if (window.__generatedContextMenuSmoke.permissionId) {
          await api.appPermission.remove(window.__generatedContextMenuSmoke.permissionId).catch(() => false);
        }
        if (window.__generatedContextMenuSmoke.manifestId) {
          await api.appManifest.remove(window.__generatedContextMenuSmoke.manifestId).catch(() => false);
        }
      },
    };

    const sourceCode = `
      (async () => {
        const root = document.getElementById('app-root');
        root.innerHTML = '';
        const target = document.createElement('button');
        target.id = 'owned-context-target';
        target.type = 'button';
        target.textContent = 'Generated owned element';
        target.style.cssText = 'margin: 24px; width: 280px; height: 96px; border-radius: 6px; border: 1px solid #5b7aa8; background: #18263a; color: #e8eef8; font: 600 15px system-ui;';
        const status = document.createElement('p');
        status.id = 'generated-context-status';
        status.textContent = 'Registering generated app context menu.';
        status.style.cssText = 'margin: 0 24px; color: #c9d7ec; font: 13px system-ui;';
        root.append(target, status);
        const setStatus = (value) => {
          status.textContent = value;
          SwitchboardOS.agent.setState({
            status: value,
            summary: value,
            metadata: {
              appId: SwitchboardOS.window.appId,
              windowId: SwitchboardOS.window.id,
              targetId: 'owned-context-target',
              source: 'generated-app-sdk'
            }
          });
        };
        try {
          await SwitchboardOS.contextMenu.register({
            targetId: 'owned-context-target',
            label: 'Generated owned element',
            object: {
              id: 'generated-object:owned-context-target',
              kind: 'generated-app-element',
              label: 'Generated owned element',
              requiredCapabilities: ['context-menu:contribute']
            },
            actions: [
              {
                id: 'inspect-generated-element',
                label: 'Inspect generated element',
                icon: 'I',
                shortcut: 'Ctrl+I',
                detail: 'Runs inside the generated app iframe through the SDK callback.',
                requiredCapabilities: ['context-menu:contribute'],
                handler: async () => {
                  setStatus('context-action-handled');
                  return { handled: true };
                }
              },
              {
                id: 'denied-generated-action',
                label: 'Denied generated action',
                icon: 'D',
                shortcut: 'Ctrl+D',
                detail: 'Requires a capability this generated app was not granted.',
                disabledReason: 'Requires context-menu:missing approval.',
                requiredCapabilities: ['context-menu:missing'],
                destructive: true,
                handler: async () => {
                  setStatus('denied-action-ran');
                }
              }
            ]
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setStatus('context-menu-registration-error: ' + message);
          return;
        }
        const openMenu = (event) => {
          if (event) event.preventDefault();
          const rect = target.getBoundingClientRect();
          SwitchboardOS.contextMenu.open({
            targetId: 'owned-context-target',
            label: 'Generated owned element',
            x: event && Number.isFinite(event.clientX) ? event.clientX : rect.left + 12,
            y: event && Number.isFinite(event.clientY) ? event.clientY : rect.top + 12,
            targetRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
          }).then(() => setStatus('context-menu-opened')).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setStatus('context-menu-denied: ' + message);
          });
        };
        target.addEventListener('contextmenu', openMenu);
        target.addEventListener('keydown', (event) => {
          if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            openMenu(event);
          }
        });
        target.focus();
        setStatus('context-menu-registered');
      })();
    `;

    const manifest = await api.appManifest.create({
      appId,
      name: 'Smoke Generated Context Menu',
      version: '1.0.0',
      entrypoint: 'generated://smoke-generated-context-menu',
      description: 'Smoke generated app for SDK element context menu contribution contract.',
      author: 'SwitchboardOS Smoke',
      icon: 'CM',
      category: 'smoke',
      capabilities: ['context-menu:contribute'],
      sourceCode,
      packageMetadata: {
        smoke: 'generated-app-context-menu-sdk',
      },
      enabled: true,
      installedAt: new Date().toISOString(),
    });
    window.__generatedContextMenuSmoke.manifestId = manifest.id;
    const permission = await api.appPermission.create({
      appId,
      capability: 'context-menu:contribute',
      granted: true,
    });
    window.__generatedContextMenuSmoke.permissionId = permission.id;

    window.postMessage({ type: 'sb:app-open', appId }, '*');
    const windowElement = await waitFor(
      () => document.querySelector(`.desktop-window[data-app-id="${appId}"]`),
      'generated context menu app window',
    );
    const runtime = await waitFor(
      () => {
        const candidate = windowElement.querySelector('[data-testid="generated-app-runtime"]');
        const status = candidate?.getAttribute('data-semantic-status') || '';
        if (status.startsWith('context-menu')) {
          return candidate;
        }
        return candidate ? {
          __pending: true,
          status,
          statusText: candidate.querySelector('[data-testid="generated-app-runtime-status"]')?.textContent?.trim() || '',
          capabilities: candidate.getAttribute('data-granted-capabilities') || '',
          deniedCount: candidate.getAttribute('data-denied-count') || '',
          srcdocHasContextMenuApi: (candidate.querySelector('iframe')?.getAttribute('srcdoc') || '').includes('contextMenu: Object.freeze'),
          srcdocHasSmokeSource: (candidate.querySelector('iframe')?.getAttribute('srcdoc') || '').includes('owned-context-target'),
        } : null;
      },
      'generated context menu SDK registration state',
    );
    const iframe = await waitFor(() => runtime.querySelector('iframe'), 'generated context menu iframe');
    return {
      appId,
      windowId: runtime.getAttribute('data-window-id') || '',
      runtimeStatus: runtime.getAttribute('data-semantic-status') || '',
      runtimeStatusText: runtime.querySelector('[data-testid="generated-app-runtime-status"]')?.textContent?.trim() || '',
      srcdocHasContextMenuApi: (iframe.getAttribute('srcdoc') || '').includes('SwitchboardOS.contextMenu.register'),
      iframeRect: (() => {
        const rect = iframe.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      })(),
    };
  })();
}

function readGeneratedMenuReport() {
  const menu = document.querySelector('[data-testid="context-menu"]');
  const actionButton = (actionId) => menu?.querySelector(`[data-action-id="${actionId}"]`);
  const disabledReasons = [...(menu?.querySelectorAll('button[disabled]') || [])]
    .map((button) => button.getAttribute('data-disabled-reason') || button.textContent || '')
    .filter(Boolean);
  return {
    present: Boolean(menu),
    sharedContextMenu: menu?.getAttribute('data-testid') || '',
    contextTarget: menu?.getAttribute('data-context-target') || '',
    contributionSurface: menu?.getAttribute('data-context-contribution-surface') || '',
    objectId: menu?.getAttribute('data-shell-object-id') || '',
    objectKind: menu?.getAttribute('data-shell-object-kind') || '',
    objectOwner: menu?.getAttribute('data-shell-object-owner') || '',
    objectSource: menu?.getAttribute('data-shell-object-source') || '',
    objectTargetScope: menu?.getAttribute('data-shell-object-target-scope') || '',
    objectSourceAppId: menu?.getAttribute('data-shell-object-source-app-id') || '',
    objectWindowId: menu?.getAttribute('data-shell-object-window-id') || '',
    objectCapabilities: (menu?.getAttribute('data-shell-object-capabilities') || '').split(',').filter(Boolean),
    objectActionIds: (menu?.getAttribute('data-shell-object-action-ids') || '').split(',').filter(Boolean),
    labels: [...(menu?.querySelectorAll('button') || [])].map((button) => button.textContent?.trim() || ''),
    inspectActionSource: actionButton('inspect-generated-element')?.getAttribute('data-action-source') || '',
    inspectSourceAppId: actionButton('inspect-generated-element')?.getAttribute('data-source-app-id') || '',
    inspectSourceWindowId: actionButton('inspect-generated-element')?.getAttribute('data-source-window-id') || '',
    inspectTargetScope: actionButton('inspect-generated-element')?.getAttribute('data-target-scope') || '',
    inspectRequiredCapabilities: actionButton('inspect-generated-element')?.getAttribute('data-required-capabilities') || '',
    inspectShortcut: actionButton('inspect-generated-element')?.getAttribute('data-shortcut') || '',
    focusedActionId: document.activeElement?.getAttribute('data-action-id') || '',
    deniedDisabled: actionButton('denied-generated-action')?.disabled || false,
    deniedReason: actionButton('denied-generated-action')?.getAttribute('data-disabled-reason') || '',
    deniedDestructive: actionButton('denied-generated-action')?.classList.contains('is-danger') || false,
    disabledReasons,
    localDuplicateMenuPresent: Boolean(document.querySelector('[data-testid="generated-app-context-menu"]')),
  };
}

function readGeneratedStatusReport(appId) {
  const runtime = document.querySelector(`.desktop-window[data-app-id="${appId}"] [data-testid="generated-app-runtime"]`);
  const events = window.__generatedContextMenuSmoke?.semanticEvents || [];
  return {
    runtimeStatus: runtime?.getAttribute('data-semantic-status') || '',
    runtimeStatusText: runtime?.querySelector('[data-testid="generated-app-runtime-status"]')?.textContent?.trim() || '',
    semanticStatuses: events.map((entry) => entry.semanticState?.status).filter(Boolean),
    handledSemanticSeen: events.some((entry) => entry.semanticState?.status === 'context-action-handled'),
  };
}

async function main() {
  const page = await waitForRendererPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');

  try {
    const setup = await cdp.evaluate(`(${setupGeneratedAppContextMenuSmoke.toString()})()`);
    assert.equal(setup.srcdocHasContextMenuApi, true, 'Generated app iframe source includes context menu SDK call.');
    assert.equal(setup.windowId.startsWith('window-'), true, 'Generated app shell window id is available.');
    assert.equal(setup.runtimeStatus, 'context-menu-registered', `Generated app context menu SDK registration failed: ${setup.runtimeStatusText}`);

    const targetX = Math.round(setup.iframeRect.left + 164);
    const targetY = Math.round(setup.iframeRect.top + 78);
    await clickAt(cdp, targetX, targetY, 'left');
    await sleep(250);
    await clickAt(cdp, targetX, targetY, 'right');
    await cdp.evaluate(`(async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (document.querySelector('[data-testid="context-menu"][data-context-target="generated-app-element"]')) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for generated app right-click context menu.');
    })()`);
    const rightClickMenu = await cdp.evaluate(`(${readGeneratedMenuReport.toString()})()`);

    await cdp.evaluate(`(() => {
      const button = document.querySelector('[data-testid="context-menu"] [data-action-id="inspect-generated-element"]');
      if (!button) throw new Error('Missing generated app inspect context menu action.');
      button.click();
      return true;
    })()`);
    const handledStatus = await cdp.evaluate(`(async () => {
      const readStatus = ${readGeneratedStatusReport.toString()};
      const appId = ${JSON.stringify(setup.appId)};
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const status = readStatus(appId);
        if (status.handledSemanticSeen || status.runtimeStatus === 'context-menu-action-complete') return status;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for generated app context menu action callback.');
    })()`);

    await clickAt(cdp, targetX, targetY, 'left');
    await key(cdp, 'F10', { code: 'F10', windowsVirtualKeyCode: 121, modifiers: 8 });
    await cdp.evaluate(`(async () => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (document.querySelector('[data-testid="context-menu"][data-context-target="generated-app-element"]')) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timed out waiting for generated app keyboard context menu.');
    })()`);
    const keyboardMenu = await cdp.evaluate(`(${readGeneratedMenuReport.toString()})()`);

    await key(cdp, 'Escape', { code: 'Escape', windowsVirtualKeyCode: 27 });
    const escapeReport = await cdp.evaluate(`(async () => {
      const appId = ${JSON.stringify(setup.appId)};
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const menuGone = !document.querySelector('[data-testid="context-menu"]');
        const windowElement = document.querySelector(\`.desktop-window[data-app-id="\${appId}"]\`);
        const iframe = windowElement?.querySelector('iframe');
        if (menuGone && document.activeElement === iframe) {
          return { menuGone, iframeFocused: true };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const windowElement = document.querySelector(\`.desktop-window[data-app-id="\${appId}"]\`);
      return {
        menuGone: !document.querySelector('[data-testid="context-menu"]'),
        iframeFocused: document.activeElement === windowElement?.querySelector('iframe'),
        activeTag: document.activeElement?.tagName || '',
      };
    })()`);

    const expectedMenuShape = (report, invocationName) => {
      assert.equal(report.present, true, `${invocationName} generated app shared context menu rendered.`);
      assert.equal(report.sharedContextMenu, 'context-menu', `${invocationName} uses the shared shell context menu.`);
      assert.equal(report.contextTarget, 'generated-app-element', `${invocationName} declares generated app element target.`);
      assert.equal(report.contributionSurface, 'generated-app-sdk', `${invocationName} declares generated app SDK contribution surface.`);
      assert.equal(report.objectKind, 'generated-app-element', `${invocationName} declares generated app object kind.`);
      assert.equal(report.objectOwner, setup.appId, `${invocationName} object owner is the generated app id.`);
      assert.equal(report.objectSource, 'generated-app-sdk', `${invocationName} object source is the SDK bridge.`);
      assert.equal(report.objectTargetScope, 'generated-app-element', `${invocationName} object target scope is generated app element.`);
      assert.equal(report.objectSourceAppId, setup.appId, `${invocationName} object source app id is present.`);
      assert.equal(report.objectWindowId, setup.windowId, `${invocationName} object window id is present.`);
      assert.equal(report.objectCapabilities.includes('context-menu:contribute'), true, `${invocationName} object capabilities include context-menu contribution.`);
      assert.equal(report.objectActionIds.includes('inspect-generated-element'), true, `${invocationName} object action ids include inspect.`);
      assert.equal(report.objectActionIds.includes('denied-generated-action'), true, `${invocationName} object action ids include denied action.`);
      assert.equal(report.inspectActionSource, 'generated-app-sdk', `${invocationName} inspect action source is generated-app-sdk.`);
      assert.equal(report.inspectSourceAppId, setup.appId, `${invocationName} inspect action source app id is present.`);
      assert.equal(report.inspectSourceWindowId, setup.windowId, `${invocationName} inspect action source window id is present.`);
      assert.equal(report.inspectTargetScope, 'generated-app-element', `${invocationName} inspect action target scope is generated app element.`);
      assert.equal(report.inspectRequiredCapabilities, 'context-menu:contribute', `${invocationName} inspect action declares required capability.`);
      assert.equal(report.inspectShortcut, 'Ctrl+I', `${invocationName} inspect action declares shortcut.`);
      assert.equal(report.deniedDisabled, true, `${invocationName} missing capability action is disabled.`);
      assert.equal(report.deniedReason.includes('context-menu:missing'), true, `${invocationName} disabled reason names missing capability.`);
      assert.equal(report.deniedDestructive, true, `${invocationName} destructive styling is preserved.`);
      assert.equal(report.localDuplicateMenuPresent, false, `${invocationName} did not render a generated-app local duplicate menu.`);
    };

    expectedMenuShape(rightClickMenu, 'right-click');
    expectedMenuShape(keyboardMenu, 'keyboard');
    assert.equal(rightClickMenu.focusedActionId, 'inspect-generated-element', 'Right-click menu focuses first enabled generated app action.');
    assert.equal(keyboardMenu.focusedActionId, 'inspect-generated-element', 'Keyboard menu focuses first enabled generated app action.');
    assert.equal(handledStatus.handledSemanticSeen, true, 'Generated app SDK action callback reported object-local handled status.');
    assert.equal(escapeReport.menuGone, true, 'Escape closes generated app shared context menu.');
    assert.equal(escapeReport.iframeFocused, true, 'Escape returns focus to generated app iframe.');

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(JSON.stringify({
      ok: true,
      appId: setup.appId,
      windowId: setup.windowId,
      rightClickMenu,
      keyboardMenu,
      handledStatus,
      escapeReport,
      screenshotPath,
    }, null, 2));
  } finally {
    cdp.close();
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  console.error(electronOutput);
  process.exit(1);
});
