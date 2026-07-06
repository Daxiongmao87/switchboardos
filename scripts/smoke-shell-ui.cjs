#!/usr/bin/env node
// Electron renderer smoke for the SwitchboardOS OS-like desktop shell.

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
const port = 9400 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-shell-ui-'));
const screenshotPath = join(tmpdir(), 'switchboardos-shell-ui-smoke.png');
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

function cleanup() {
  electron.kill('SIGTERM');
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

async function runLegacyDefaultDesktopMigrationSmoke(cdp) {
  const desktopShortcutsKey = 'switchboardos.desktopShortcuts.v2';
  const desktopIconPositionsKey = 'switchboardos.desktopIconPositions.v1';
  const legacyDefaultShortcutObjects = [
    'hosts',
    'terminal',
    'file-browser',
    'process-viewer',
    'service-manager',
    'log-viewer',
    'command-history',
    'app-studio',
    'bootstrap',
    'agents',
    'apps',
    'host-map',
    'audit',
    'settings',
  ].map((appId) => ({
    id: `shortcut-${appId}`,
    appId,
    shellOwned: true,
  }));
  const explicitUserPin = {
    id: 'shortcut-bootstrap-explicit-pin-smoke',
    appId: 'bootstrap',
    shellOwned: false,
    label: 'Bootstrap Pin',
  };

  await cdp.evaluate(`(() => {
    localStorage.setItem(${JSON.stringify(desktopShortcutsKey)}, ${JSON.stringify(JSON.stringify([
    ...legacyDefaultShortcutObjects,
    explicitUserPin,
  ]))});
    localStorage.setItem(${JSON.stringify(desktopIconPositionsKey)}, ${JSON.stringify(JSON.stringify({
    'shortcut-hosts': { x: 24, y: 24 },
    'shortcut-terminal': { x: 24, y: 132 },
    'shortcut-bootstrap-explicit-pin-smoke': { x: 24, y: 240 },
  }))});
    return true;
  })()`);
  await reloadRendererPage(cdp);

  const report = await cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (predicate, label, timeout = 10000) => {
      const deadline = Date.now() + timeout;
      let latestValue = null;
      while (Date.now() < deadline) {
        const value = predicate();
        latestValue = value;
        if (value) return value;
        await sleep(100);
      }
      throw new Error('Timed out waiting for ' + label + ': ' + JSON.stringify({
        latestValue,
        labels: labels(),
        bodyText: (document.body.textContent || '').slice(0, 500),
        storedShortcuts: localStorage.getItem(${JSON.stringify(desktopShortcutsKey)}),
      }));
    };
    const labels = () => [...document.querySelectorAll('.desktop-icon-label')]
      .map((node) => node.textContent.trim())
      .filter(Boolean);
    const forbiddenLegacyLabels = [
      'Hosts',
      'Terminal',
      'File Browser',
      'Process Viewer',
      'Service Manager',
      'Log Viewer',
      'Command History',
      'App Studio',
      'Operator',
      'App Manager',
      'Host Map',
      'Audit',
      'Settings',
    ];

    await waitFor(() => document.querySelector('[data-testid="desktop-shell"]'), 'desktop shell after legacy shortcut reload');
    const iconLabels = await waitFor(() => {
      const current = labels();
      return current.includes('File Explorer') && current.includes('Recycle Bin') && current.includes('Bootstrap Pin')
        ? current
        : null;
    }, 'sanitized legacy default desktop shortcuts');
    const sortedLabels = [...iconLabels].sort();
    const storedShortcuts = JSON.parse(localStorage.getItem(${JSON.stringify(desktopShortcutsKey)}) || '[]')
      .map((shortcut) => ({
        id: shortcut.id,
        appId: shortcut.appId,
        shellOwned: shortcut.shellOwned,
        label: shortcut.label || null,
      }));
    const storedShortcutLabels = storedShortcuts
      .map((shortcut) => shortcut.label || (shortcut.appId === 'workspace-files'
        ? 'File Explorer'
        : shortcut.appId === 'trash'
          ? 'Recycle Bin'
          : shortcut.appId === 'bootstrap'
            ? 'Bootstrap Pin'
            : shortcut.appId))
      .sort();
    return {
      iconLabels,
      sortedLabels,
      expectedLabels: ['Bootstrap Pin', 'File Explorer', 'Recycle Bin'],
      legacyClutterRemoved: !iconLabels.some((label) => forbiddenLegacyLabels.includes(label)),
      explicitUserPinPreserved: iconLabels.includes('Bootstrap Pin'),
      defaultIconsPresent: iconLabels.includes('File Explorer') && iconLabels.includes('Recycle Bin'),
      storedShortcuts,
      storedShortcutLabels,
      storedLegacyClutterRemoved: !storedShortcutLabels.some((label) => forbiddenLegacyLabels.includes(label)),
      storedSanitizedShortcutSet: JSON.stringify(storedShortcutLabels) === JSON.stringify(['Bootstrap Pin', 'File Explorer', 'Recycle Bin']),
    };
  })()`);

  await cdp.evaluate(`(async () => {
    const defaultDesktopShortcuts = [
      { id: 'shortcut-workspace-files', appId: 'workspace-files', shellOwned: true },
      { id: 'shortcut-trash', appId: 'trash', shellOwned: true },
    ];
    localStorage.setItem(${JSON.stringify(desktopShortcutsKey)}, JSON.stringify(defaultDesktopShortcuts));
    localStorage.removeItem(${JSON.stringify(desktopIconPositionsKey)});
    const workspaceApi = window.sb && window.sb.workspace;
    const activeProfileId = workspaceApi && workspaceApi.getActiveProfileId
      ? await workspaceApi.getActiveProfileId()
      : null;
    if (activeProfileId && workspaceApi && workspaceApi.updateProfile) {
      await workspaceApi.updateProfile(activeProfileId, {
        layout: {
          desktopShortcutIds: defaultDesktopShortcuts,
          windows: [],
        },
      });
    }
    return true;
  })()`);
  await reloadRendererPage(cdp);
  await cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const labels = [...document.querySelectorAll('.desktop-icon-label')]
        .map((node) => node.textContent.trim())
        .filter(Boolean);
      if (labels.length === 2 && labels.includes('File Explorer') && labels.includes('Recycle Bin')) {
        return true;
      }
      await sleep(100);
    }
    throw new Error('Timed out waiting for clean default desktop after legacy migration smoke reset.');
  })()`);

  return report;
}

async function reloadRendererPage(cdp) {
  try {
    await cdp.send('Page.reload', { ignoreCache: true });
  } catch (error) {
    if (!isNavigationTransientError(error)) {
      throw error;
    }
  }
  await sleep(1500);
  await waitForRendererContext(cdp);
  await sleep(500);
}

function isNavigationTransientError(error) {
  const message = String(error?.message || error);
  return message.includes('Execution context was destroyed')
    || message.includes('Cannot find context with specified id')
    || message.includes('Inspected target navigated or closed')
    || message.includes('Cannot access detached Frame');
}

async function waitForRendererContext(cdp) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const readyState = await cdp.evaluate('document.readyState');
      if (readyState === 'interactive' || readyState === 'complete') {
        return;
      }
    } catch (error) {
      if (!isNavigationTransientError(error)) {
        throw error;
      }
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for renderer context after reload.');
}

async function browserSmoke() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, label, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const textIncludes = (element, text) => (element.textContent || '').includes(text);
  const click = (element) => {
    if (!element) throw new Error('Missing clickable element');
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + Math.min(20, Math.max(2, rect.width / 2));
    const clientY = rect.top + Math.min(16, Math.max(2, rect.height / 2));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX, clientY }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX, clientY }));
    element.click();
  };
  const rightClick = (element) => {
    if (!element) throw new Error('Missing context target');
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + Math.min(24, Math.max(4, rect.width / 2));
    const clientY = rect.top + Math.min(24, Math.max(4, rect.height / 2));
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX, clientY }));
  };
  const keydown = (key, options = {}) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options }));
  };
  const menuLabels = () => [...document.querySelectorAll('[data-testid="context-menu"] button, [data-testid="context-menu"] .context-menu-item')]
    .map((item) => (item.textContent || '').trim());
  const menuAffordances = () => ({
    iconCount: document.querySelectorAll('[data-testid="context-menu"] [data-menu-icon]').length,
    separatorCount: document.querySelectorAll('[data-testid="context-menu"] .has-separator').length,
    shortcutLabels: [...document.querySelectorAll('[data-testid="context-menu"] .context-menu-shortcut')]
      .map((item) => (item.textContent || '').trim()),
  });
  const menuButtonStates = () => [...document.querySelectorAll('[data-testid="context-menu"] button')]
    .map((button) => ({
      text: (button.textContent || '').trim(),
      disabled: button.disabled,
    }));
  const menuContributionMetadata = () => [...document.querySelectorAll('[data-testid="context-menu"] button, [data-testid="context-menu"] .context-menu-item')]
    .map((item) => ({
      text: (item.textContent || '').trim(),
      source: item.getAttribute('data-menu-source') || '',
      sourceAppId: item.getAttribute('data-menu-source-app-id') || '',
      targetScope: item.getAttribute('data-menu-target-scope') || '',
      actionId: item.getAttribute('data-menu-action-id') || '',
      requiredCapabilities: (item.getAttribute('data-menu-required-capabilities') || '')
        .split(',')
        .map((capability) => capability.trim())
        .filter(Boolean),
      disabled: item instanceof HTMLButtonElement ? item.disabled : false,
    }));
  const shellObjectMetadata = (element) => {
    if (!element) {
      return null;
    }
    return {
      objectId: element.getAttribute('data-shell-object-id') || '',
      objectKind: element.getAttribute('data-shell-object-kind') || '',
      owner: element.getAttribute('data-shell-object-owner') || '',
      source: element.getAttribute('data-shell-object-source') || '',
      targetScope: element.getAttribute('data-shell-object-target-scope') || '',
      sourceAppId: element.getAttribute('data-shell-object-source-app-id') || '',
      windowId: element.getAttribute('data-shell-object-window-id') || '',
      notificationKind: element.getAttribute('data-shell-object-notification-kind') || element.getAttribute('data-notification-kind') || '',
      actionIds: (element.getAttribute('data-shell-object-action-ids') || '')
        .split(',')
        .map((actionId) => actionId.trim())
        .filter(Boolean),
      capabilities: (element.getAttribute('data-shell-object-capabilities') || '')
        .split(',')
        .map((capability) => capability.trim())
        .filter(Boolean),
    };
  };
  const contextShellObjectMetadata = () => shellObjectMetadata(document.querySelector('[data-testid="context-menu"]'));
  const paletteResultMetadata = () => [...document.querySelectorAll('[data-testid="command-palette"] .palette-result')]
    .map((item) => ({
      text: (item.textContent || '').trim(),
      source: item.getAttribute('data-palette-source') || '',
      sourceAppId: item.getAttribute('data-palette-source-app-id') || '',
      targetScope: item.getAttribute('data-palette-target-scope') || '',
      actionId: item.getAttribute('data-palette-action-id') || '',
      shortcut: item.getAttribute('data-palette-shortcut') || '',
      isSystemApplet: item.getAttribute('data-palette-system-applet') || '',
      launcherCategory: item.getAttribute('data-palette-launcher-category') || '',
      defaultLauncherRow: item.getAttribute('data-palette-default-launcher-row') || '',
      requiredCapabilities: (item.getAttribute('data-palette-required-capabilities') || '')
        .split(',')
        .map((capability) => capability.trim())
        .filter(Boolean),
      capabilities: (item.getAttribute('data-palette-capabilities') || '')
        .split(',')
        .map((capability) => capability.trim())
        .filter(Boolean),
    }));
  const clickMenuItem = (text) => click([...document.querySelectorAll('[data-testid="context-menu"] button')]
    .find((button) => textIncludes(button, text)));
  const setInputValue = (input, value) => {
    if (!input) {
      throw new Error(`Unable to set missing input to ${value}.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const withPrompt = (value, action) => {
    const originalPrompt = window.prompt;
    Object.defineProperty(window, 'prompt', {
      configurable: true,
      writable: true,
      value: () => value,
    });
    try {
      action();
    } finally {
      Object.defineProperty(window, 'prompt', {
        configurable: true,
        writable: true,
        value: originalPrompt,
      });
    }
  };
  const waitForEnabledButtonByText = (root, text, label) => waitFor(() => {
    const button = [...(root?.querySelectorAll('button') || [])].find((candidate) => textIncludes(candidate, text));
    if (!button || button.disabled) {
      return null;
    }
    return button;
  }, label);
  const waitForSeededHostRow = async (hostLauncherPanel, hostName, timeout = 20000) => {
    const started = Date.now();
    let snapshot = { hostLauncherText: '', visibleRows: [] };
    while (Date.now() - started < timeout) {
      const rows = [...hostLauncherPanel.querySelectorAll('.host-row')];
      const visibleRows = rows.map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
      snapshot = {
        hostLauncherText: (hostLauncherPanel.textContent || '').replace(/\s+/g, ' ').trim(),
        visibleRows,
      };
      const found = rows.find((row) => textIncludes(row, hostName));
      if (found) {
        return found;
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for seeded host launcher row "${hostName}". ` +
      `Visible rows: ${JSON.stringify(snapshot.visibleRows)}. ` +
      `Host launcher text: ${snapshot.hostLauncherText}.`);
  };
  const desktopIconFrames = (label) => [...document.querySelectorAll('.desktop-icon-frame')]
    .filter((frame) => textIncludes(frame, label));
  const waitForRequiredDesktopIcons = async () => {
    const started = Date.now();
    let snapshot = null;
    while (Date.now() - started < 15000) {
      const fileExplorerIcons = desktopIconFrames('File Explorer');
      const recycleBinIcons = desktopIconFrames('Recycle Bin');
      const allIcons = [...document.querySelectorAll('.desktop-icon-label')].map((node) => node.textContent?.trim()).filter(Boolean);
      snapshot = {
        allIconCount: document.querySelectorAll('.desktop-icon-frame').length,
        labels: allIcons,
        fileExplorerIconsLength: fileExplorerIcons.length,
        recycleBinIconsLength: recycleBinIcons.length,
      };
      if (fileExplorerIcons.length > 0 && recycleBinIcons.length > 0) {
        return { fileExplorerIcons, recycleBinIcons };
      }
      await sleep(100);
    }
    throw new Error(`Timed out waiting for default File Explorer and Recycle Bin desktop icons: ${JSON.stringify(snapshot)}`);
  };
  const desktopIconLabels = () => [...document.querySelectorAll('.desktop-icon-label')]
    .map((node) => node.textContent.trim());
  const buttonByText = (root, text) => [...root.querySelectorAll('button')]
    .find((button) => textIncludes(button, text));
  const forbiddenWindowStateWords = ['floating', 'tiled', 'maximized', 'fullscreen'];
  const forbiddenWindowControlText = ['-', '[]', 'x', 'L', 'R', 'T', 'B', '1', '2', '3', '4', 'F'];
  const isTransparentBackgroundColor = (color) => {
    const normalized = (color || '').replace(/\s+/g, '').toLowerCase();
    return normalized === 'transparent'
      || normalized === 'rgba(0,0,0,0)'
      || normalized === 'rgba(255,255,255,0)'
      || normalized === 'rgb(0,0,0,0)';
  };
  const hasNoVisibleBorder = (element) => {
    const styles = getComputedStyle(element);
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    return sides.every((side) => {
      const width = parseFloat(styles[`border${side}Width`]);
      if (!Number.isFinite(width) || width === 0) {
        return true;
      }
      return isTransparentBackgroundColor(styles[`border${side}Color`]);
    });
  };
  const hasNoWebButtonChrome = (element) => {
    if (!element) {
      return false;
    }
    const styles = getComputedStyle(element);
    const hasVisibleOutline =
      styles.outlineStyle !== 'none'
      && parseFloat(styles.outlineWidth || '0') > 0
      && !isTransparentBackgroundColor(styles.outlineColor);
    return (
      isTransparentBackgroundColor(styles.backgroundColor)
      && hasNoVisibleBorder(element)
      && !hasVisibleOutline
    );
  };
  const normalizeColor = (color) => (color || '').replace(/\s+/g, '').toLowerCase();
  const iconChromeState = (element) => {
    if (!element) {
      return null;
    }
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor,
      borderWidth: parseFloat(styles.borderTopWidth || '0'),
    };
  };
  const iconChromeIsQuiet = (state) => {
    if (!state) {
      return false;
    }
    return isTransparentBackgroundColor(state.backgroundColor)
      && isTransparentBackgroundColor(state.borderColor);
  };
  const iconChromeMatches = (first, second) => {
    if (!first || !second) {
      return false;
    }
    return normalizeColor(first.backgroundColor) === normalizeColor(second.backgroundColor)
      && normalizeColor(first.borderColor) === normalizeColor(second.borderColor);
  };
  const launcherRowCapabilities = (row) => {
    const raw = row.getAttribute('data-app-capabilities') || '';
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  };
  const launcherChromeState = (launcherPanel) => {
    if (!launcherPanel) {
      return {
        rowCount: 0,
        rowLabels: [],
        launcherRowMetadata: [],
        iconCount: 0,
        miniButtonCount: 0,
        pinButtonCount: 0,
        rowsAtRestNoChrome: false,
        launchIconsQuiet: false,
        launchFirstIconIsQuiet: false,
        launchFirstIconMatchesFileExplorerChrome: false,
        miniButtonsAtRestNoChrome: false,
        pinButtonsAtRestNoChrome: false,
      };
    }

    const launcherRows = [...launcherPanel.querySelectorAll('.launcher-row')];
    const launcherIcons = [...launcherPanel.querySelectorAll('.launcher-icon')];
    const miniButtons = [...launcherPanel.querySelectorAll('.launcher-panel .mini-button')];
    const pinButtons = [...launcherPanel.querySelectorAll('.launcher-panel .pin-button')];
    const firstLauncherChrome = iconChromeState(launcherIcons[0]);
    const fileExplorerIconChrome = iconChromeState([...document.querySelectorAll('.desktop-icon-frame')]
      .find((frame) => textIncludes(frame, 'File Explorer'))
      ?.querySelector('.desktop-icon-glyph'));
    const launcherRowMetadata = launcherRows.map((row) => ({
      label: row.querySelector('.launcher-text span')?.textContent?.trim() || '',
      isSystemApplet: row.getAttribute('data-system-applet') === 'true',
      launcherCategory: row.getAttribute('data-launcher-category') || '',
      defaultLauncherRow: row.getAttribute('data-default-launcher-row') === 'true',
      capabilities: launcherRowCapabilities(row),
    }));

    return {
      rowCount: launcherRows.length,
      rowLabels: launcherRows.map((row) => row.querySelector('.launcher-text span')?.textContent?.trim() || ''),
      launcherRowMetadata,
      iconCount: launcherIcons.length,
      miniButtonCount: miniButtons.length,
      pinButtonCount: pinButtons.length,
      rowsAtRestNoChrome: launcherRows.every((row) => isTransparentBackgroundColor(getComputedStyle(row).backgroundColor) && hasNoVisibleBorder(row)),
      launchIconsQuiet: launcherIcons.every((icon) => iconChromeIsQuiet(iconChromeState(icon))),
      miniButtonsAtRestNoChrome: miniButtons.every((button) => hasNoWebButtonChrome(button)),
      pinButtonsAtRestNoChrome: pinButtons.every((button) => hasNoWebButtonChrome(button)),
      launchFirstIconIsQuiet: iconChromeIsQuiet(firstLauncherChrome),
      launchFirstIconMatchesFileExplorerChrome: iconChromeMatches(firstLauncherChrome, fileExplorerIconChrome),
    };
  };
  const desktopIconChrome = (iconLabel) => {
    const iconFrame = [...document.querySelectorAll('.desktop-icon-frame')]
      .find((frame) => textIncludes(frame, iconLabel));
    return iconChromeState(iconFrame?.querySelector('.desktop-icon-glyph'));
  };
  const hasRuntimeStateText = (text) => {
    const lowercase = (text || '').toLowerCase();
    return forbiddenWindowStateWords.some((state) => lowercase.includes(state));
  };

  const shell = await waitFor(() => document.querySelector('[data-testid="desktop-shell"]'), 'desktop shell');
  await sleep(800);
  const seededHost = await window.sb.host.create({
    name: 'Smoke Context Host',
    address: '127.0.0.1',
    hostname: '127.0.0.1',
    port: 22,
    username: 'smoke',
    authMode: 'agent',
    tags: ['smoke'],
    group: 'Smoke',
    osHint: 'linux',
    bootstrapStatus: 'not_started',
    defaultShell: '/bin/sh',
    defaultWorkingDirectory: '/tmp',
    capabilities: ['ssh'],
    notes: 'Created by the shell UI smoke test to verify host context menus.',
  });

  const iconLabels = desktopIconLabels();
  const desktop = document.querySelector('.desktop-surface');
  const firstRunPanel = document.querySelector('[data-testid="first-run-panel"]');
  const taskbarPanelObject = shellObjectMetadata(document.querySelector('[data-testid="taskbar"]'));
  const trayStatusObject = shellObjectMetadata(document.querySelector('[data-testid="taskbar-tray"]'));
  const desktopStyles = desktop ? getComputedStyle(desktop) : null;
  const fileExplorerIconChrome = desktopIconChrome('File Explorer');
  const initial = {
    desktopShell: Boolean(shell),
    wallpaperMode: shell.getAttribute('data-desktop-wallpaper'),
    wallpaperLayout: shell.getAttribute('data-desktop-wallpaper-layout'),
    wallpaperApplied: getComputedStyle(desktop).backgroundImage.includes('default-wallpaper.png'),
    wallpaperComputed: {
      backgroundSize: desktopStyles?.backgroundSize || '',
      backgroundRepeat: desktopStyles?.backgroundRepeat || '',
    },
    windowCount: document.querySelectorAll('.desktop-window').length,
    hostLauncherOpen: Boolean(document.querySelector('[data-testid="host-launcher"]')),
    inspectorOpen: Boolean(document.querySelector('[data-testid="semantic-inspector"]')),
    workspacePlaque: Boolean(document.querySelector('.workspace-plaque')),
    firstRunOpen: Boolean(firstRunPanel),
    firstRunPanelText: (firstRunPanel?.textContent || ''),
    firstRunPanelAppletMetadata: firstRunPanel ? {
      appId: firstRunPanel.getAttribute('data-app-id') || '',
      isSystemApplet: firstRunPanel.getAttribute('data-system-applet') === 'true',
      sdkContract: firstRunPanel.getAttribute('data-app-sdk-contract') || '',
      appletLanguage: firstRunPanel.getAttribute('data-app-applet-language') || '',
      presentationMode: firstRunPanel.getAttribute('data-app-presentation-mode') || '',
      capabilities: (firstRunPanel.getAttribute('data-app-capabilities') || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    } : null,
    firstRunQuickActions: [...(document.querySelectorAll('[data-testid="first-run-panel"] .first-run-actions button') || [])]
      .map((button) => (button.textContent || '').trim()),
    titlebarButtons: document.querySelectorAll('.window-btn').length,
    titlebarTileControls: [...document.querySelectorAll('.window-btn')]
      .map((button) => (button.textContent || '').trim())
      .filter((label) => forbiddenWindowControlText.includes(label)),
    taskbarCommandButtons: document.querySelectorAll('.taskbar-command').length,
    startButtonText: document.querySelector('[data-testid="app-launcher-button"]')?.textContent?.trim() || '',
    iconLabels,
    fileExplorerIconChrome,
    fileExplorerIconChromeIsQuiet: iconChromeIsQuiet(fileExplorerIconChrome),
    hasDuplicateShortcutUnavailableText: (document.body.textContent || '').includes('Duplicate Shortcut is unavailable: shortcut IDs are unique.'),
    removeButtons: document.querySelectorAll('.desktop-shortcut-remove').length,
  };

  keydown('k', { ctrlKey: true });
  const commandPalette = await waitFor(() => document.querySelector('[data-testid="command-palette"]'), 'command palette');
  const commandPaletteLabels = [...commandPalette.querySelectorAll('.palette-result span')]
    .map((node) => (node.textContent || '').trim());
  const commandPaletteMetadata = paletteResultMetadata();
  const commandPaletteText = commandPalette.textContent || '';
  keydown('Escape');
  await waitFor(() => !document.querySelector('[data-testid="command-palette"]'), 'command palette closed');

  click(document.querySelector('[data-testid="app-launcher-button"]'));
  const launcherForHostPanel = await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu for host launcher');
  click(buttonByText(launcherForHostPanel, 'Host launcher'));
  const hostLauncherPanel = await waitFor(() => document.querySelector('[data-testid="host-launcher"]'), 'host launcher panel');
  const hostLauncherRefreshButton = await waitForEnabledButtonByText(hostLauncherPanel, 'Refresh', 'enabled Host launcher Refresh button');
  click(hostLauncherRefreshButton);
  const hostContextRow = await waitForSeededHostRow(hostLauncherPanel, 'Smoke Context Host', 20000);
  rightClick(hostContextRow);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="host"]'), 'host context menu');
  const hostContextMenu = menuLabels();
  clickMenuItem('Open Terminal');
  const hostTerminalWindow = await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="host-terminal"]'),
    'host terminal window',
  );
  const hostTerminalContextTarget = await waitFor(
    () => hostTerminalWindow.querySelector('.host-terminal-window'),
    'host terminal content',
  );
  rightClick(hostTerminalContextTarget);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="terminal"]'), 'terminal context menu');
  const terminalContextMenu = menuLabels();
  const terminalContextMenuItems = menuButtonStates();
  const terminalMenuAffordances = menuAffordances();
  click(document.body);
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'terminal context menu closed');
  click(document.querySelector('[data-testid="app-launcher-button"]'));
  const launcherForHostPanelClose = await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu for host launcher close');
  click(buttonByText(launcherForHostPanelClose, 'Host launcher'));
  await waitFor(() => !document.querySelector('[data-testid="host-launcher"]'), 'host launcher closed');

  rightClick(desktop);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop"]'), 'desktop context menu');
  const desktopMenu = menuLabels();
  const desktopMenuAffordances = menuAffordances();
  click([...document.querySelectorAll('[data-testid="context-menu"] button')].find((button) => textIncludes(button, 'New Folder')));
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'desktop menu closed after new folder');

  const { fileExplorerIcons, recycleBinIcons } = await waitForRequiredDesktopIcons();
  const fileExplorerIconsBefore = fileExplorerIcons;
  if (fileExplorerIconsBefore.length === 0) {
    throw new Error('No File Explorer icon found for duplicate shortcut smoke path.');
  }
  const recycleBinIcon = recycleBinIcons[0];
  const duplicateTargetSet = new Set(fileExplorerIconsBefore);
  rightClick(fileExplorerIconsBefore[0]);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop-icon"]'), 'icon context menu');
  const iconMenu = menuLabels();
  const iconMenuContributionMetadata = menuContributionMetadata();
  const iconMenuAffordances = menuAffordances();
  const iconMenuButtonStates = menuButtonStates();
  clickMenuItem('Duplicate Shortcut');
  const fileExplorerIconsAfterDuplicate = await waitFor(
    () => {
      const labels = desktopIconFrames('File Explorer');
      return labels.length >= 2 ? labels : null;
    },
    'icon duplication through context menu',
  );
  const duplicateShortcutIcon = fileExplorerIconsAfterDuplicate.find((icon) => !duplicateTargetSet.has(icon));
  if (!duplicateShortcutIcon) {
    throw new Error('Duplicate Shortcut did not create a distinct desktop icon entry.');
  }

  rightClick(duplicateShortcutIcon);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop-icon"]'), 'duplicate shortcut context menu');
  const duplicateShortcutContextButtonStates = menuButtonStates();
  clickMenuItem('Remove Shortcut');
  await waitFor(
    () => {
      const labels = desktopIconLabels().sort();
      const expected = ['File Explorer', 'Recycle Bin'].sort();
      return labels.length === expected.length && labels[0] === expected[0] && labels[1] === expected[1]
        ? labels
        : null;
    },
    'icon list after removing duplicate',
  );
  const desktopIconLabelsAfterDuplicateRemoval = desktopIconLabels();

  const remainingFileExplorerIcon = desktopIconFrames('File Explorer')[0];
  if (!remainingFileExplorerIcon) {
    throw new Error('Missing File Explorer icon after duplicate removal path.');
  }
  rightClick(remainingFileExplorerIcon);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop-icon"]'), 'icon context menu after cleanup');
  const iconMenuAfterCleanup = menuLabels();
  const renameTarget = 'File Explorer (Personal)';
  withPrompt(renameTarget, () => clickMenuItem('Rename'));
  await waitFor(() => desktopIconLabels().includes(renameTarget), 'desktop icon label updated after rename');
  const desktopIconLabelsAfterRename = desktopIconLabels();

  const renamedFileExplorerIcon = desktopIconFrames(renameTarget)[0];
  if (!renamedFileExplorerIcon) {
    throw new Error('Missing renamed File Explorer desktop icon for rename revert path.');
  }

  rightClick(renamedFileExplorerIcon);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop-icon"]'), 'icon context menu after rename');
  withPrompt('File Explorer', () => clickMenuItem('Rename'));
  await waitFor(
    () => {
      const labels = desktopIconLabels();
      const expected = ['File Explorer', 'Recycle Bin'].sort();
      return labels.length === expected.length && labels[0] === expected[0] && labels[1] === expected[1]
        ? labels
        : null;
    },
    'desktop icon label restored after rename round-trip',
  );
  const desktopIconLabelsAfterRenameRollback = desktopIconLabels();
  const stableFileExplorerIcon = [...desktopIconFrames('File Explorer')].find(Boolean);
  if (!stableFileExplorerIcon) {
    throw new Error('Missing File Explorer icon after rename rollback.');
  }

  rightClick(stableFileExplorerIcon);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop-icon"]'), 'icon context menu for File Explorer open');
  clickMenuItem('Open');
  let fileWindow = await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="workspace-files"]'),
    'workspace file explorer window',
  );
  const openWindowTitlebarText = fileWindow.querySelector('.window-chrome .window-title-group')?.textContent || '';
  const openWindowLegacyControlText = [...fileWindow.querySelectorAll('.window-chrome .window-controls .window-btn')]
    .map((button) => (button.textContent || '').trim())
    .filter((label) => forbiddenWindowControlText.includes(label));
  keydown('k', { ctrlKey: true });
  const focusedWindowCommandPalette = await waitFor(
    () => document.querySelector('[data-testid="command-palette"]'),
    'focused window command palette',
  );
  const focusedWindowPaletteInput = focusedWindowCommandPalette.querySelector('input[name="paletteQuery"]');
  setInputValue(focusedWindowPaletteInput, 'Refresh workspace context');
  const focusedWindowPaletteActionMetadata = await waitFor(() => {
    const rows = paletteResultMetadata();
    return rows.some((row) => row.text.includes('Refresh workspace context')) ? rows : null;
  }, 'focused window palette action metadata');
  setInputValue(focusedWindowPaletteInput, 'Minimize window');
  const focusedWindowKeyboardActionMetadata = await waitFor(() => {
    const rows = paletteResultMetadata();
    return rows.some((row) => row.text.includes('Minimize window')) ? rows : null;
  }, 'focused window keyboard action palette metadata');
  keydown('Escape');
  await waitFor(() => !document.querySelector('[data-testid="command-palette"]'), 'focused window command palette closed');

  const keyboardShortcutReport = {
    metaMMinimized: false,
    metaUpMaximized: false,
    f11FullscreenClass: false,
    altShiftLeftTiled: false,
  };
  keydown('m', { metaKey: true });
  await waitFor(() => {
    const taskbarItem = [...document.querySelectorAll('.taskbar-window')]
      .find((button) => textIncludes(button, 'File Explorer'));
    return taskbarItem?.classList.contains('is-minimized') ? taskbarItem : null;
  }, 'Meta+M minimized File Explorer');
  keyboardShortcutReport.metaMMinimized = true;
  const minimizedFileExplorerTaskbarItem = [...document.querySelectorAll('.taskbar-window')]
    .find((button) => textIncludes(button, 'File Explorer'));
  click(minimizedFileExplorerTaskbarItem);
  fileWindow = await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="workspace-files"]'),
    'File Explorer restored after Meta+M',
  );
  keydown('ArrowUp', { metaKey: true });
  await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="workspace-files"].is-maximized'),
    'Meta+Up maximized File Explorer',
  );
  keyboardShortcutReport.metaUpMaximized = true;
  keydown('ArrowUp', { metaKey: true });
  await waitFor(
    () => {
      const windowElement = document.querySelector('.desktop-window[data-app-id="workspace-files"]');
      return windowElement && !windowElement.classList.contains('is-maximized') ? windowElement : null;
    },
    'Meta+Up restored File Explorer',
  );
  keydown('F11');
  await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="workspace-files"].is-maximized'),
    'F11 fullscreen class applied to File Explorer',
  );
  keyboardShortcutReport.f11FullscreenClass = true;
  keydown('F11');
  await waitFor(
    () => {
      const windowElement = document.querySelector('.desktop-window[data-app-id="workspace-files"]');
      return windowElement && !windowElement.classList.contains('is-maximized') ? windowElement : null;
    },
    'F11 restored File Explorer',
  );
  keydown('ArrowLeft', { altKey: true, shiftKey: true });
  await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="workspace-files"].is-tiled'),
    'Alt+Shift+Left tiled File Explorer',
  );
  keyboardShortcutReport.altShiftLeftTiled = true;

  await waitFor(() => fileWindow.querySelector('[data-testid="workspace-file-list"]'), 'workspace file list');
  const workspaceFileText = fileWindow.textContent || '';
  const newFolderRow = await waitFor(
    () => [...fileWindow.querySelectorAll('.workspace-file-item')]
      .find((row) => textIncludes(row, 'New Folder')),
    'created New Folder row in File Explorer',
  );
  rightClick(newFolderRow);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="workspace-file"]'), 'workspace file context menu');
  const workspaceFileMenu = menuLabels();
  const workspaceFileMenuAffordances = menuAffordances();
  click(document.body);
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'workspace file context menu closed');
  newFolderRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 }));
  const workspaceNavigatedPath = await waitFor(
    () => {
      const text = fileWindow.querySelector('[data-testid="workspace-current-path"]')?.textContent?.trim() || '';
      return text.includes('/New Folder') ? text : '';
    },
    'File Explorer navigated into New Folder',
  );
  const workspaceBreadcrumbText = fileWindow.querySelector('[data-testid="workspace-breadcrumbs"]')?.textContent || '';

  rightClick(fileWindow.querySelector('.window-chrome'));
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="window"]'), 'window context menu');
  const windowMenu = menuLabels();
  const windowMenuContributionMetadata = menuContributionMetadata();
  const windowMenuAffordances = menuAffordances();
  click(document.body);

  const fileExplorerTaskbarItem = await waitFor(
    () => [...document.querySelectorAll('.taskbar-window')]
      .find((button) => textIncludes(button, 'File Explorer')),
    'File Explorer taskbar item',
  );
  const fileExplorerTaskbarObject = shellObjectMetadata(fileExplorerTaskbarItem);
  rightClick(fileExplorerTaskbarItem);
  await waitFor(
    () => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar-window"]'),
    'taskbar app item context menu',
  );
  const taskbarWindowMenu = menuLabels();
  const taskbarWindowContributionMetadata = menuContributionMetadata();
  const taskbarWindowContextObject = contextShellObjectMetadata();
  click(document.body);

  rightClick(document.querySelector('[data-testid="taskbar"]'));
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar"]'), 'taskbar context menu');
  const taskbarMenu = menuLabels();
  const taskbarMenuContributionMetadata = menuContributionMetadata();
  const taskbarContextObject = contextShellObjectMetadata();
  click(document.body);

  rightClick(document.querySelector('[data-testid="taskbar-tray"]'));
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="tray-status"]'), 'tray status context menu');
  const trayStatusMenu = menuLabels();
  const trayStatusContributionMetadata = menuContributionMetadata();
  const trayStatusContextObject = contextShellObjectMetadata();
  click(document.body);

  click(document.querySelector('[data-testid="app-launcher-button"]'));
  const launcher = await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu');
  const launcherText = launcher.textContent || '';
  const launcherVisual = launcherChromeState(launcher);
  const hostsLauncherRow = [...document.querySelectorAll('.launcher-row')].find((row) => textIncludes(row, 'Hosts'));
  rightClick(hostsLauncherRow);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="launcher-row"]'), 'launcher row menu');
  const launcherRowMenu = menuLabels();
  const launcherRowContributionMetadata = menuContributionMetadata();
  click(document.body);
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'launcher row menu closed');

  if (!document.querySelector('[data-testid="app-launcher"]')) {
    click(document.querySelector('[data-testid="app-launcher-button"]'));
    await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu reopened for Hosts');
  }
  const liveHostsLauncherRow = await waitFor(
    () => [...document.querySelectorAll('.launcher-row')].find((row) => textIncludes(row, 'Hosts')),
    'live Hosts launcher row',
  );
  click(liveHostsLauncherRow.querySelector('.launcher-open-button'));
  const hostsWindow = await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="hosts"]'),
    'Hosts window',
  );
  const hostsTaskbarItem = await waitFor(
    () => [...document.querySelectorAll('.taskbar-window')]
      .find((button) => textIncludes(button, 'Hosts')),
    'Hosts taskbar item',
  );
  rightClick(hostsTaskbarItem);
  await waitFor(
    () => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar-window"]'),
    'Hosts taskbar pin menu',
  );
  const hostsTaskbarPinMenu = menuLabels();
  const hostsTaskbarPinContributionMetadata = menuContributionMetadata();
  clickMenuItem('Pin to Desktop');
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'Hosts pin menu closed');
  await waitFor(() => desktopIconLabels().includes('Hosts'), 'Hosts pinned desktop icon');

  rightClick(hostsTaskbarItem);
  await waitFor(
    () => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar-window"]'),
    'Hosts taskbar unpin menu',
  );
  const hostsTaskbarUnpinMenu = menuLabels();
  const hostsTaskbarUnpinContributionMetadata = menuContributionMetadata();
  clickMenuItem('Unpin from Desktop');
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'Hosts unpin menu closed');
  await waitFor(() => !desktopIconLabels().includes('Hosts'), 'Hosts unpinned desktop icon');
  const desktopIconLabelsAfterPinCycle = desktopIconLabels();

  click(recycleBinIcon.querySelector('.desktop-icon'));
  recycleBinIcon.querySelector('.desktop-icon').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 }));
  await waitFor(() => document.querySelector('.desktop-window[data-app-id="trash"]'), 'trash window');

  // Recycle Bin smoke: delete New Folder from File Explorer, verify in trash, restore, verify back
  const trashResult = await (async () => {
    // Navigate back to root in File Explorer
    const rootBtn = fileWindow.querySelector('.workspace-file-navigation .mini-button');
    if (rootBtn) {
      rootBtn.click();
      await waitFor(
        () => {
          const path = fileWindow.querySelector('[data-testid="workspace-current-path"]')?.textContent?.trim() || '';
          return !path.includes('/New Folder');
        },
        'File Explorer navigated back to root',
      );
    }

    // Find New Folder row in File Explorer and delete it
    const folderToDelete = [...fileWindow.querySelectorAll('.workspace-file-item')]
      .find((row) => textIncludes(row, 'New Folder'));
    if (!folderToDelete) {
      return { error: 'New Folder not found in File Explorer for trash test' };
    }

    // Override window.confirm to auto-accept the "Move to Recycle Bin" prompt
    const origConfirm = window.confirm;
    Object.defineProperty(window, 'confirm', {
      get: () => () => true,
      configurable: true,
    });

    // Click the "Move to Recycle Bin" button on the row
    const deleteBtn = folderToDelete.querySelector('.workspace-file-danger');
    if (deleteBtn) {
      deleteBtn.click();
      await sleep(500);
    }

    // Restore original confirm
    Object.defineProperty(window, 'confirm', {
      get: () => origConfirm,
      configurable: true,
    });

    // Verify New Folder disappeared from File Explorer
    const folderGone = ![...fileWindow.querySelectorAll('.workspace-file-item')]
      .some((row) => textIncludes(row, 'New Folder'));
    if (!folderGone) {
      return { error: 'New Folder still visible in File Explorer after delete', folderGone };
    }

    // Navigate to root to refresh the view
    const rootBtn2 = fileWindow.querySelector('.workspace-file-navigation .mini-button');
    if (rootBtn2) {
      rootBtn2.click();
      await sleep(300);
    }

    // Open Recycle Bin window - find existing trash window or open new
    let trashWindow = document.querySelector('.desktop-window[data-app-id="trash"]');
    if (!trashWindow) {
      const trashIconFrame = [...document.querySelectorAll('.desktop-icon-frame')]
        .find((frame) => textIncludes(frame, 'Recycle Bin'));
      if (trashIconFrame) {
        trashIconFrame.querySelector('.desktop-icon').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 }));
        trashWindow = await waitFor(
          () => document.querySelector('.desktop-window[data-app-id="trash"]'),
          'trash window opened',
        );
      }
    }
    if (!trashWindow) {
      return { error: 'Could not open trash window' };
    }

    // Verify trash-item containing New Folder appears
    const trashItem = await waitFor(
      () => [...trashWindow.querySelectorAll('[data-testid="trash-item"]')]
        .find((item) => textIncludes(item, 'New Folder')),
      'trash item containing New Folder',
      5000,
    );
    if (!trashItem) {
      return { error: 'New Folder not found in Recycle Bin trash items', trashItem };
    }

    // Click restore button
    const restoreBtn = trashItem.querySelector('[data-testid="trash-restore"]');
    if (restoreBtn) {
      restoreBtn.click();
      await sleep(500);
    }

    // Verify trash empty state or New Folder gone from trash
    const trashItemGone = ![...trashWindow.querySelectorAll('[data-testid="trash-item"]')]
      .some((item) => textIncludes(item, 'New Folder'));
    const trashEmptyVisible = Boolean(trashWindow.querySelector('[data-testid="trash-empty"]'));

    // Refresh File Explorer to see restored item
    // Navigate back to root
    const rootBtn3 = fileWindow.querySelector('.workspace-file-navigation .mini-button');
    if (rootBtn3) {
      rootBtn3.click();
      await sleep(300);
    }

    // Check New Folder is back in File Explorer
    const folderRestored = await waitFor(
      () => {
        const rows = [...fileWindow.querySelectorAll('.workspace-file-item')];
        return rows.find((row) => textIncludes(row, 'New Folder'));
      },
      'New Folder restored to File Explorer',
      5000,
    );

    return {
      folderMovedToTrash: true,
      trashItemFound: true,
      trashItemGone,
      trashEmptyVisible,
      folderRestored: Boolean(folderRestored),
    };
  })();

  const toastForContext = await waitFor(
    () => document.querySelector('.toast[data-notification-kind="toast"]'),
    'toast after opening windows',
  );
  const notificationToastObject = shellObjectMetadata(toastForContext);
  rightClick(toastForContext);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="notification"]'), 'notification context menu');
  const notificationMenu = menuLabels();
  const notificationContributionMetadata = menuContributionMetadata();
  const notificationContextObject = contextShellObjectMetadata();
  clickMenuItem('Dismiss Notification');
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'notification context menu closed');
  await waitFor(
    () => document.querySelectorAll('.toast[data-notification-kind="toast"]').length === 0,
    'toast notification dismissed',
    6000,
  );

  const generatedPaletteCapability = await (async () => {
    const api = window.sb?.appManifest;
    if (!api) {
      return { available: false, error: 'app manifest API unavailable' };
    }

    let manifest = null;
    const appId = `smoke-palette-capability-${Date.now()}`;
    try {
      manifest = await api.create({
        appId,
        name: 'Smoke Palette Capability',
        version: '1.0.0',
        entrypoint: 'generated://smoke-palette-capability',
        description: 'Smoke generated app for command palette capability filtering.',
        author: 'SwitchboardOS Smoke',
        icon: 'SP',
        category: 'smoke',
        capabilities: ['palette:allowed'],
        sourceCode: "document.getElementById('app-root').textContent = 'Smoke palette capability app';",
        packageMetadata: {
          actionRegistry: [
            {
              id: 'allowed-smoke-palette-action',
              label: 'Allowed smoke palette action',
              description: 'Allowed action declared with a manifest capability.',
              capability: 'palette:allowed',
              shortcut: 'Ctrl+Alt+A',
            },
            {
              id: 'blocked-smoke-palette-action',
              label: 'Blocked smoke palette action',
              description: 'Blocked action declares a capability absent from the manifest.',
              capability: 'palette:missing',
              shortcut: 'Ctrl+Alt+B',
            },
          ],
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      });

      window.postMessage({ type: 'sb:app-open', appId }, '*');
      const generatedWindow = await waitFor(
        () => document.querySelector(`.desktop-window[data-app-id="${appId}"]`),
        'generated palette smoke app window',
        20000,
      );
      await waitFor(
        () => generatedWindow.querySelector('[data-testid="generated-app-runtime"][data-semantic-status="ready"]'),
        'generated palette smoke runtime ready',
        20000,
      );

      keydown('k', { ctrlKey: true });
      const generatedPalette = await waitFor(
        () => document.querySelector('[data-testid="command-palette"]'),
        'generated app command palette',
      );
      setInputValue(generatedPalette.querySelector('input[name="paletteQuery"]'), 'smoke palette action');
      const metadata = await waitFor(() => {
        const rows = paletteResultMetadata();
        return rows.some((row) => row.text.includes('Allowed smoke palette action')) ? rows : null;
      }, 'generated app palette capability rows');
      const allowedAction = metadata.find((row) => row.text.includes('Allowed smoke palette action')) || null;
      const blockedActionVisible = metadata.some((row) => row.text.includes('Blocked smoke palette action'));
      keydown('Escape');
      await waitFor(() => !document.querySelector('[data-testid="command-palette"]'), 'generated app command palette closed');
      keydown('F4', { altKey: true });
      await waitFor(
        () => !document.querySelector(`.desktop-window[data-app-id="${appId}"]`),
        'Alt+F4 closed generated palette smoke app',
      );

      return {
        available: true,
        appId,
        allowedActionVisible: Boolean(allowedAction),
        blockedActionVisible,
        altF4Closed: true,
        allowedActionMetadata: allowedAction,
      };
    } finally {
      if (manifest) {
        await api.remove(manifest.id).catch(() => false);
      }
    }
  })();

  const generatedScopedStorage = await (async () => {
    const api = window.sb;
    if (!api?.appManifest || !api.appPermission || !api.appStorage || !api.audit) {
      return { available: false, error: 'generated app storage APIs unavailable' };
    }

    const semanticEvents = [];
    const handleSemantic = (event) => {
      semanticEvents.push(event.detail);
    };
    window.addEventListener('switchboard-generated-app-semantic', handleSemantic);

    let allowedManifest = null;
    let deniedManifest = null;
    let allowedPermission = null;
    const allowedAppId = `smoke-storage-allowed-${Date.now()}`;
    const deniedAppId = `smoke-storage-denied-${Date.now()}`;
    const storageKey = 'scoped-storage-smoke';
    const storageValue = 'storage-smoke-value-from-sdk';

    const runtimeStorageDiagnostics = (appId) => {
      const runtime = document.querySelector(`.desktop-window[data-app-id="${appId}"] [data-testid="generated-app-runtime"]`);
      const srcdoc = runtime?.querySelector('iframe')?.getAttribute('srcdoc') || '';
      return {
        runtimePresent: Boolean(runtime),
        runtimeStatus: runtime?.getAttribute('data-semantic-status') || null,
        runtimeAppId: runtime?.getAttribute('data-app-id') || null,
        runtimeWindowIdPresent: Boolean(runtime?.getAttribute('data-window-id')),
        runtimeCapabilities: runtime?.getAttribute('data-granted-capabilities') || null,
        srcdocHasSdkBootstrap: srcdoc.includes('switchboard-sdk-request'),
        srcdocHasStorageCall: srcdoc.includes('SwitchboardOS.storage.set'),
        semanticStatuses: semanticEvents
          .filter((entry) => entry?.semanticState?.metadata?.appId === appId)
          .map((entry) => entry.semanticState.status),
      };
    };

    const waitForGeneratedStorageState = async (appId) => {
      try {
        return await waitFor(() => {
          return semanticEvents.find((entry) => {
            const state = entry?.semanticState;
            return state?.metadata?.appId === appId && typeof state.status === 'string' && state.status.startsWith('storage-');
          }) || null;
        }, `generated storage state ${appId}`, 20000);
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify(runtimeStorageDiagnostics(appId))}`);
      }
    };

    try {
      allowedManifest = await api.appManifest.create({
        appId: allowedAppId,
        name: 'Smoke Storage Allowed',
        version: '1.0.0',
        entrypoint: 'generated://smoke-storage-allowed',
        description: 'Smoke generated app for scoped storage backend contract.',
        author: 'SwitchboardOS Smoke',
        icon: 'SA',
        category: 'smoke',
        capabilities: ['storage:scoped'],
        sourceCode: `
          (async () => {
            try {
              await SwitchboardOS.storage.set(${JSON.stringify(storageKey)}, ${JSON.stringify(storageValue)});
              const storedValue = await SwitchboardOS.storage.get(${JSON.stringify(storageKey)});
              SwitchboardOS.agent.setState({
                status: storedValue === ${JSON.stringify(storageValue)} ? 'storage-ok' : 'storage-mismatch',
                summary: 'Scoped storage smoke completed through SwitchboardOS.storage.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  storageSet: true,
                  storageGetMatches: storedValue === ${JSON.stringify(storageValue)},
                  storageValueLogged: false
                }
              });
            } catch (error) {
              SwitchboardOS.agent.setState({
                status: 'storage-error',
                summary: 'Scoped storage smoke failed.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  error: error instanceof Error ? error.message : String(error),
                  storageValueLogged: false
                }
              });
            }
          })();
        `,
        packageMetadata: {
          smoke: 'generated-app-scoped-storage',
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      });
      const allowedManifestReadback = await api.appManifest.get(allowedManifest.id);
      if (!allowedManifestReadback?.sourceCode.includes('SwitchboardOS.storage.set')) {
        throw new Error('Generated scoped storage manifest source did not persist for allowed app.');
      }
      allowedPermission = await api.appPermission.create({
        appId: allowedAppId,
        capability: 'storage:scoped',
        granted: true,
      });

      window.postMessage({ type: 'sb:app-open', appId: allowedAppId }, '*');
      const allowedWindow = await waitFor(
        () => document.querySelector(`.desktop-window[data-app-id="${allowedAppId}"]`),
        'generated scoped storage allowed window',
        20000,
      );
      const allowedRuntime = await waitFor(
        () => allowedWindow.querySelector('[data-testid="generated-app-runtime"]'),
        `generated scoped storage allowed runtime mounted ${JSON.stringify(runtimeStorageDiagnostics(allowedAppId))}`,
        20000,
      );
      await waitFor(
        () => (allowedRuntime.querySelector('iframe')?.getAttribute('srcdoc') || '').includes('SwitchboardOS.storage.set'),
        `generated scoped storage allowed iframe source installed ${JSON.stringify(runtimeStorageDiagnostics(allowedAppId))}`,
        20000,
      );
      const allowedState = await waitForGeneratedStorageState(allowedAppId);
      const backendRead = await api.appStorage.get(allowedAppId, storageKey);
      const auditAfterAllowed = await api.audit.list();
      const allowedAuditJson = JSON.stringify(auditAfterAllowed.filter((event) => event.entityId === `${allowedAppId}:${event.metadata?.keyHash}` || event.metadata?.appId === allowedAppId));

      keydown('F4', { altKey: true });
      await waitFor(
        () => !document.querySelector(`.desktop-window[data-app-id="${allowedAppId}"]`),
        'Alt+F4 closed generated scoped storage allowed app',
      );

      deniedManifest = await api.appManifest.create({
        appId: deniedAppId,
        name: 'Smoke Storage Denied',
        version: '1.0.0',
        entrypoint: 'generated://smoke-storage-denied',
        description: 'Smoke generated app without scoped storage permission.',
        author: 'SwitchboardOS Smoke',
        icon: 'SD',
        category: 'smoke',
        capabilities: [],
        sourceCode: `
          (async () => {
            try {
              await SwitchboardOS.storage.set(${JSON.stringify(storageKey)}, ${JSON.stringify(storageValue)});
              SwitchboardOS.agent.setState({
                status: 'storage-denial-missed',
                summary: 'Scoped storage unexpectedly succeeded.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  denied: false,
                  storageValueLogged: false
                }
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              SwitchboardOS.agent.setState({
                status: 'storage-denied',
                summary: 'Scoped storage denied without permission.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  denied: true,
                  mentionsCapability: message.includes('storage:scoped'),
                  storageValueLogged: false
                }
              });
            }
          })();
        `,
        packageMetadata: {
          smoke: 'generated-app-scoped-storage-denied',
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      });
      const deniedManifestReadback = await api.appManifest.get(deniedManifest.id);
      if (!deniedManifestReadback?.sourceCode.includes('SwitchboardOS.storage.set')) {
        throw new Error('Generated scoped storage manifest source did not persist for denied app.');
      }

      window.postMessage({ type: 'sb:app-open', appId: deniedAppId }, '*');
      const deniedWindow = await waitFor(
        () => document.querySelector(`.desktop-window[data-app-id="${deniedAppId}"]`),
        'generated scoped storage denied window',
        20000,
      );
      const deniedRuntime = await waitFor(
        () => deniedWindow.querySelector('[data-testid="generated-app-runtime"]'),
        `generated scoped storage denied runtime mounted ${JSON.stringify(runtimeStorageDiagnostics(deniedAppId))}`,
        20000,
      );
      await waitFor(
        () => (deniedRuntime.querySelector('iframe')?.getAttribute('srcdoc') || '').includes('SwitchboardOS.storage.set'),
        `generated scoped storage denied iframe source installed ${JSON.stringify(runtimeStorageDiagnostics(deniedAppId))}`,
        20000,
      );
      const deniedState = await waitForGeneratedStorageState(deniedAppId);
      const deniedBackendRead = await api.appStorage.get(deniedAppId, storageKey).then(
        () => ({ denied: false, error: '' }),
        (error) => ({ denied: true, error: error instanceof Error ? error.message : String(error) }),
      );
      const auditAfterDenied = await api.audit.list();
      const deniedAuditEvents = auditAfterDenied.filter((event) => event.entityId === deniedAppId || event.metadata?.appId === deniedAppId);
      const deniedAuditJson = JSON.stringify(deniedAuditEvents);
      const generatedLocalStorageKeys = Object.keys(window.localStorage)
        .filter((key) => key.startsWith('switchboardos.generated-app.'));

      keydown('F4', { altKey: true });
      await waitFor(
        () => !document.querySelector(`.desktop-window[data-app-id="${deniedAppId}"]`),
        'Alt+F4 closed generated scoped storage denied app',
      );

      return {
        available: true,
        allowedAppId,
        deniedAppId,
        allowedStateStatus: allowedState.semanticState.status,
        allowedStateStorageMatches: allowedState.semanticState.metadata.storageGetMatches === true,
        backendFound: backendRead.found,
        backendValueMatches: backendRead.value === storageValue,
        allowedAuditHasUpdate: auditAfterAllowed.some((event) => event.type === 'app_storage.updated' && event.metadata?.appId === allowedAppId),
        allowedAuditHasRead: auditAfterAllowed.some((event) => event.type === 'app_storage.read' && event.metadata?.appId === allowedAppId),
        allowedAuditOmitsValue: !allowedAuditJson.includes(storageValue),
        deniedStateStatus: deniedState.semanticState.status,
        deniedStateMentionsCapability: deniedState.semanticState.metadata.mentionsCapability === true,
        deniedBackendReadDenied: deniedBackendRead.denied,
        deniedAuditHasBackendDenial: deniedAuditEvents.some((event) => event.type === 'app_storage.denied' && event.metadata?.capability === 'storage:scoped'),
        deniedAuditHasSdkDenial: deniedAuditEvents.some((event) => event.type === 'app.sdk_capability_denied'),
        deniedAuditOmitsValue: !deniedAuditJson.includes(storageValue),
        noGeneratedLocalStorageKeys: generatedLocalStorageKeys.length === 0,
        generatedLocalStorageKeys,
      };
    } finally {
      window.removeEventListener('switchboard-generated-app-semantic', handleSemantic);
      if (allowedManifest) {
        await api.appStorage.remove(allowedAppId, storageKey).catch(() => ({ deleted: false }));
      }
      if (allowedPermission) {
        await api.appPermission.remove(allowedPermission.id).catch(() => false);
      }
      if (allowedManifest) {
        await api.appManifest.remove(allowedManifest.id).catch(() => false);
      }
      if (deniedManifest) {
        await api.appManifest.remove(deniedManifest.id).catch(() => false);
      }
    }
  })();

  const generatedWindowSdk = await (async () => {
    const api = window.sb;
    if (!api?.appManifest || !api.audit) {
      return { available: false, error: 'generated app manifest/audit APIs unavailable' };
    }

    const semanticEvents = [];
    const handleSemantic = (event) => {
      semanticEvents.push(event.detail);
    };
    window.addEventListener('switchboard-generated-app-semantic', handleSemantic);

    let manifest = null;
    const appId = `smoke-window-sdk-${Date.now()}`;
    const expectedTitle = 'SDK Window Contract';
    const expectedBadge = 'SDK';
    const expectedStatus = 'runtime-ready';

    const runtimeDiagnostics = () => {
      const windowElement = document.querySelector(`.desktop-window[data-app-id="${appId}"]`);
      const runtime = windowElement?.querySelector('[data-testid="generated-app-runtime"]');
      const srcdoc = runtime?.querySelector('iframe')?.getAttribute('srcdoc') || '';
      return {
        windowPresent: Boolean(windowElement),
        windowId: windowElement?.getAttribute('data-window-id') || null,
        titleText: windowElement?.querySelector('.window-title')?.textContent?.trim() || null,
        windowBadge: windowElement?.getAttribute('data-window-sdk-badge') || null,
        windowStatus: windowElement?.getAttribute('data-window-sdk-status') || null,
        windowPreferredSize: windowElement?.getAttribute('data-window-sdk-preferred-size') || null,
        taskbarBadge: windowElement
          ? document.querySelector(`.taskbar-window[data-shell-object-window-id="${windowElement.getAttribute('data-window-id')}"]`)?.getAttribute('data-window-sdk-badge') || null
          : null,
        srcdocHasWindowSetTitle: srcdoc.includes('SwitchboardOS.window.setTitle'),
        semanticStatuses: semanticEvents
          .filter((entry) => entry?.semanticState?.metadata?.appId === appId)
          .map((entry) => entry.semanticState.status),
      };
    };

    try {
      manifest = await api.appManifest.create({
        appId,
        name: 'Smoke Window SDK',
        version: '1.0.0',
        entrypoint: 'generated://smoke-window-sdk',
        description: 'Smoke generated app for shell-owned window SDK contract.',
        author: 'SwitchboardOS Smoke',
        icon: 'SW',
        category: 'smoke',
        capabilities: [],
        sourceCode: `
          (async () => {
            try {
              const initialInfo = await SwitchboardOS.window.getInfo();
              const titleInfo = await SwitchboardOS.window.setTitle(${JSON.stringify(expectedTitle)});
              const badgeInfo = await SwitchboardOS.window.setBadge(${JSON.stringify(expectedBadge)});
              const statusInfo = await SwitchboardOS.window.setStatus(${JSON.stringify(expectedStatus)});
              const sizeInfo = await SwitchboardOS.window.setPreferredSize({
                minWidth: 480,
                minHeight: 320,
                maxWidth: 900,
                maxHeight: 700
              });
              let malformedDenied = false;
              let malformedMessage = '';
              try {
                await SwitchboardOS.window.setPreferredSize({ minWidth: 1200, maxWidth: 400 });
              } catch (error) {
                malformedDenied = true;
                malformedMessage = error instanceof Error ? error.message : String(error);
              }
              SwitchboardOS.agent.setState({
                status: malformedDenied ? 'window-sdk-ok' : 'window-sdk-denial-missed',
                summary: 'Window SDK smoke completed through shell-owned window object.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  windowId: SwitchboardOS.window.id,
                  initialWindowMatches: initialInfo.windowId === SwitchboardOS.window.id,
                  titleApplied: titleInfo.title === ${JSON.stringify(expectedTitle)},
                  badgeApplied: badgeInfo.badge === ${JSON.stringify(expectedBadge)},
                  statusApplied: statusInfo.status === ${JSON.stringify(expectedStatus)},
                  preferredSizeApplied: sizeInfo.preferredSize && sizeInfo.preferredSize.minWidth === 480,
                  malformedDenied,
                  malformedMentionsSize: malformedMessage.includes('minWidth') || malformedMessage.includes('preferred size')
                }
              });
            } catch (error) {
              SwitchboardOS.agent.setState({
                status: 'window-sdk-error',
                summary: 'Window SDK smoke failed.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  error: error instanceof Error ? error.message : String(error)
                }
              });
            }
          })();
        `,
        packageMetadata: {
          smoke: 'generated-app-window-sdk',
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      });

      window.postMessage({ type: 'sb:app-open', appId }, '*');
      const windowElement = await waitFor(
        () => document.querySelector(`.desktop-window[data-app-id="${appId}"]`),
        `generated window SDK shell window ${JSON.stringify(runtimeDiagnostics())}`,
        20000,
      );
      await waitFor(
        () => windowElement.querySelector('[data-testid="generated-app-runtime"]'),
        `generated window SDK runtime mounted ${JSON.stringify(runtimeDiagnostics())}`,
        20000,
      );
      await waitFor(
        () => runtimeDiagnostics().srcdocHasWindowSetTitle,
        `generated window SDK iframe source installed ${JSON.stringify(runtimeDiagnostics())}`,
        20000,
      );
      const sdkState = await waitFor(() => {
        return semanticEvents.find((entry) => {
          const state = entry?.semanticState;
          return state?.metadata?.appId === appId && typeof state.status === 'string' && state.status.startsWith('window-sdk');
        }) || null;
      }, `generated window SDK semantic state ${JSON.stringify(runtimeDiagnostics())}`, 20000);

      await waitFor(
        () => runtimeDiagnostics().windowBadge === expectedBadge
          && runtimeDiagnostics().windowStatus === expectedStatus
          && runtimeDiagnostics().titleText === expectedTitle
          && (runtimeDiagnostics().windowPreferredSize || '').includes('"minWidth":480'),
        `generated window SDK shell metadata reflected ${JSON.stringify(runtimeDiagnostics())}`,
        20000,
      );

      const diagnostics = runtimeDiagnostics();
      const taskbarButton = document.querySelector(`.taskbar-window[data-shell-object-window-id="${diagnostics.windowId}"]`);
      const auditEvents = await api.audit.list();
      const appAuditEvents = auditEvents.filter((event) => event.entityId === appId || event.metadata?.appId === appId);
      const auditJson = JSON.stringify(appAuditEvents);

      keydown('F4', { altKey: true });
      await waitFor(
        () => !document.querySelector(`.desktop-window[data-app-id="${appId}"]`),
        'Alt+F4 closed generated window SDK app',
      );

      return {
        available: true,
        appId,
        windowId: diagnostics.windowId,
        titleText: diagnostics.titleText,
        windowBadge: diagnostics.windowBadge,
        windowStatus: diagnostics.windowStatus,
        windowPreferredSize: diagnostics.windowPreferredSize,
        taskbarBadge: taskbarButton?.getAttribute('data-window-sdk-badge') || null,
        taskbarStatus: taskbarButton?.getAttribute('data-window-sdk-status') || null,
        taskbarPreferredSize: taskbarButton?.getAttribute('data-window-sdk-preferred-size') || null,
        stateStatus: sdkState.semanticState.status,
        initialWindowMatches: sdkState.semanticState.metadata.initialWindowMatches === true,
        titleApplied: sdkState.semanticState.metadata.titleApplied === true,
        badgeApplied: sdkState.semanticState.metadata.badgeApplied === true,
        statusApplied: sdkState.semanticState.metadata.statusApplied === true,
        preferredSizeApplied: sdkState.semanticState.metadata.preferredSizeApplied === true,
        malformedDenied: sdkState.semanticState.metadata.malformedDenied === true,
        malformedMentionsSize: sdkState.semanticState.metadata.malformedMentionsSize === true,
        auditHasSdkDenial: appAuditEvents.some((event) => event.type === 'app.sdk_capability_denied' && event.metadata?.method === 'window:setPreferredSize'),
        auditSanitized: !auditJson.includes('SwitchboardOS.window.setTitle')
          && auditJson.includes('"sourceCodeLogged":false')
          && auditJson.includes('"secretsLogged":false'),
      };
    } finally {
      window.removeEventListener('switchboard-generated-app-semantic', handleSemantic);
      if (manifest) {
        await api.appManifest.remove(manifest.id).catch(() => false);
      }
    }
  })();

  const generatedHostSdk = await (async () => {
    const api = window.sb;
    if (!api?.appManifest || !api.appPermission || !api.audit || !api.appHost) {
      return { available: false, error: 'generated app host SDK APIs unavailable' };
    }

    const semanticEvents = [];
    const handleSemantic = (event) => {
      semanticEvents.push(event.detail);
    };
    window.addEventListener('switchboard-generated-app-semantic', handleSemantic);

    let allowedManifest = null;
    let deniedManifest = null;
    const allowedPermissions = [];
    const allowedAppId = `smoke-host-sdk-allowed-${Date.now()}`;
    const deniedAppId = `smoke-host-sdk-denied-${Date.now()}`;
    const targetHostId = seededHost.id;

    const runtimeDiagnostics = (appId) => {
      const windowElement = document.querySelector(`.desktop-window[data-app-id="${appId}"]`);
      const runtime = windowElement?.querySelector('[data-testid="generated-app-runtime"]');
      const srcdoc = runtime?.querySelector('iframe')?.getAttribute('srcdoc') || '';
      return {
        windowPresent: Boolean(windowElement),
        runtimePresent: Boolean(runtime),
        runtimeStatus: runtime?.getAttribute('data-semantic-status') || null,
        runtimeCapabilities: runtime?.getAttribute('data-granted-capabilities') || null,
        srcdocHasHostSdk: srcdoc.includes('SwitchboardOS.host.listHosts'),
        semanticStatuses: semanticEvents
          .filter((entry) => entry?.semanticState?.metadata?.appId === appId)
          .map((entry) => entry.semanticState.status),
      };
    };

    const waitForHostSdkState = async (appId) => {
      try {
        return await waitFor(() => {
          return semanticEvents.find((entry) => {
            const state = entry?.semanticState;
            return state?.metadata?.appId === appId && typeof state.status === 'string' && state.status.startsWith('host-sdk');
          }) || null;
        }, `generated host SDK state ${appId}`, 30000);
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify(runtimeDiagnostics(appId))}`);
      }
    };

    try {
      allowedManifest = await api.appManifest.create({
        appId: allowedAppId,
        name: 'Smoke Host SDK Allowed',
        version: '1.0.0',
        entrypoint: 'generated://smoke-host-sdk-allowed',
        description: 'Smoke generated app for backend-owned host SDK contract.',
        author: 'SwitchboardOS Smoke',
        icon: 'HA',
        category: 'smoke',
        capabilities: ['host:read', 'host:actions'],
        sourceCode: `
          (async () => {
            const targetHostId = ${JSON.stringify(targetHostId)};
            const sensitiveKeys = ['username', 'authMode', 'keyPath', 'credentialRefId', 'notes', 'defaultShell', 'defaultWorkingDirectory'];
            try {
              const listResult = await SwitchboardOS.host.listHosts();
              const getResult = await SwitchboardOS.host.getHost(targetHostId);
              const statusResult = await SwitchboardOS.host.getHostStatus(targetHostId);
              const capabilitiesResult = await SwitchboardOS.host.getCapabilities(targetHostId);
              const testResult = await SwitchboardOS.host.testConnection(targetHostId);
              const host = getResult && getResult.host;
              const sensitiveLeaked = Boolean(host && sensitiveKeys.some((key) => Object.prototype.hasOwnProperty.call(host, key)));
              const foundInList = Array.isArray(listResult.hosts) && listResult.hosts.some((candidate) => candidate.id === targetHostId);
              SwitchboardOS.agent.setState({
                status: foundInList && getResult.found && statusResult.found && capabilitiesResult.found && testResult.hostId === targetHostId && !sensitiveLeaked
                  ? 'host-sdk-ok'
                  : 'host-sdk-mismatch',
                summary: 'Host SDK smoke completed through backend-owned appHost contract.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  targetHostId,
                  hostCount: listResult.hostCount,
                  foundInList,
                  getFound: getResult.found,
                  statusFound: statusResult.found,
                  capabilitiesFound: capabilitiesResult.found,
                  testStatus: testResult.status,
                  testHostMatches: testResult.hostId === targetHostId,
                  sensitiveLeaked
                }
              });
            } catch (error) {
              SwitchboardOS.agent.setState({
                status: 'host-sdk-error',
                summary: 'Host SDK smoke failed.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  error: error instanceof Error ? error.message : String(error),
                  targetHostId
                }
              });
            }
          })();
        `,
        packageMetadata: {
          smoke: 'generated-app-host-sdk',
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      });

      allowedPermissions.push(await api.appPermission.create({
        appId: allowedAppId,
        capability: 'host:read',
        granted: true,
      }));
      allowedPermissions.push(await api.appPermission.create({
        appId: allowedAppId,
        capability: 'host:actions',
        granted: true,
      }));

      window.postMessage({ type: 'sb:app-open', appId: allowedAppId }, '*');
      const allowedWindow = await waitFor(
        () => document.querySelector(`.desktop-window[data-app-id="${allowedAppId}"]`),
        `generated host SDK allowed window ${JSON.stringify(runtimeDiagnostics(allowedAppId))}`,
        20000,
      );
      const allowedRuntime = await waitFor(
        () => allowedWindow.querySelector('[data-testid="generated-app-runtime"]'),
        `generated host SDK allowed runtime mounted ${JSON.stringify(runtimeDiagnostics(allowedAppId))}`,
        20000,
      );
      await waitFor(
        () => (allowedRuntime.querySelector('iframe')?.getAttribute('srcdoc') || '').includes('SwitchboardOS.host.listHosts'),
        `generated host SDK allowed iframe source installed ${JSON.stringify(runtimeDiagnostics(allowedAppId))}`,
        20000,
      );
      const allowedState = await waitForHostSdkState(allowedAppId);
      const auditAfterAllowed = await api.audit.list();
      const allowedAuditEvents = auditAfterAllowed.filter((event) => event.metadata?.appId === allowedAppId || event.entityId === allowedAppId);
      const allowedAuditJson = JSON.stringify(allowedAuditEvents);

      keydown('F4', { altKey: true });
      await waitFor(
        () => !document.querySelector(`.desktop-window[data-app-id="${allowedAppId}"]`),
        'Alt+F4 closed generated host SDK allowed app',
      );

      deniedManifest = await api.appManifest.create({
        appId: deniedAppId,
        name: 'Smoke Host SDK Denied',
        version: '1.0.0',
        entrypoint: 'generated://smoke-host-sdk-denied',
        description: 'Smoke generated app without host SDK permission.',
        author: 'SwitchboardOS Smoke',
        icon: 'HD',
        category: 'smoke',
        capabilities: [],
        sourceCode: `
          (async () => {
            try {
              await SwitchboardOS.host.listHosts();
              SwitchboardOS.agent.setState({
                status: 'host-sdk-denial-missed',
                summary: 'Host SDK unexpectedly succeeded without permission.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  denied: false
                }
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              SwitchboardOS.agent.setState({
                status: 'host-sdk-denied',
                summary: 'Host SDK denied without permission.',
                metadata: {
                  appId: SwitchboardOS.window.appId,
                  denied: true,
                  mentionsCapability: message.includes('host:read')
                }
              });
            }
          })();
        `,
        packageMetadata: {
          smoke: 'generated-app-host-sdk-denied',
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      });

      window.postMessage({ type: 'sb:app-open', appId: deniedAppId }, '*');
      const deniedWindow = await waitFor(
        () => document.querySelector(`.desktop-window[data-app-id="${deniedAppId}"]`),
        `generated host SDK denied window ${JSON.stringify(runtimeDiagnostics(deniedAppId))}`,
        20000,
      );
      const deniedRuntime = await waitFor(
        () => deniedWindow.querySelector('[data-testid="generated-app-runtime"]'),
        `generated host SDK denied runtime mounted ${JSON.stringify(runtimeDiagnostics(deniedAppId))}`,
        20000,
      );
      await waitFor(
        () => (deniedRuntime.querySelector('iframe')?.getAttribute('srcdoc') || '').includes('SwitchboardOS.host.listHosts'),
        `generated host SDK denied iframe source installed ${JSON.stringify(runtimeDiagnostics(deniedAppId))}`,
        20000,
      );
      const deniedState = await waitForHostSdkState(deniedAppId);
      const auditAfterDenied = await api.audit.list();
      const deniedAuditEvents = auditAfterDenied.filter((event) => event.metadata?.appId === deniedAppId || event.entityId === deniedAppId);
      const deniedAuditJson = JSON.stringify(deniedAuditEvents);

      keydown('F4', { altKey: true });
      await waitFor(
        () => !document.querySelector(`.desktop-window[data-app-id="${deniedAppId}"]`),
        'Alt+F4 closed generated host SDK denied app',
      );

      return {
        available: true,
        allowedAppId,
        deniedAppId,
        targetHostId,
        allowedStateStatus: allowedState.semanticState.status,
        allowedFoundInList: allowedState.semanticState.metadata.foundInList === true,
        allowedGetFound: allowedState.semanticState.metadata.getFound === true,
        allowedStatusFound: allowedState.semanticState.metadata.statusFound === true,
        allowedCapabilitiesFound: allowedState.semanticState.metadata.capabilitiesFound === true,
        allowedTestHostMatches: allowedState.semanticState.metadata.testHostMatches === true,
        allowedSensitiveLeaked: allowedState.semanticState.metadata.sensitiveLeaked === true,
        allowedAuditHasList: allowedAuditEvents.some((event) => event.type === 'app_host_sdk.listed' && event.metadata?.method === 'host:list'),
        allowedAuditHasRead: allowedAuditEvents.some((event) => event.type === 'app_host_sdk.read' && event.metadata?.method === 'host:get'),
        allowedAuditHasStatus: allowedAuditEvents.some((event) => event.type === 'app_host_sdk.status_read' && event.metadata?.method === 'host:getStatus'),
        allowedAuditHasCapabilities: allowedAuditEvents.some((event) => event.type === 'app_host_sdk.capabilities_read' && event.metadata?.method === 'host:getCapabilities'),
        allowedAuditHasTest: allowedAuditEvents.some((event) => event.type === 'app_host_sdk.connection_tested' && event.metadata?.method === 'host:testConnection'),
        allowedAuditSanitized: !allowedAuditJson.includes('SwitchboardOS.host.')
          && !allowedAuditJson.includes('Created by the shell UI smoke test')
          && allowedAuditJson.includes('"hostCredentialsLogged":false')
          && allowedAuditJson.includes('"sourceCodeLogged":false')
          && allowedAuditJson.includes('"secretsLogged":false'),
        deniedStateStatus: deniedState.semanticState.status,
        deniedStateMentionsCapability: deniedState.semanticState.metadata.mentionsCapability === true,
        deniedAuditHasBackendDenial: deniedAuditEvents.some((event) => event.type === 'app_host_sdk.denied' && event.metadata?.capability === 'host:read'),
        deniedAuditHasSdkDenial: deniedAuditEvents.some((event) => event.type === 'app.sdk_capability_denied' && event.metadata?.method === 'host:list'),
        deniedAuditSanitized: !deniedAuditJson.includes('SwitchboardOS.host.')
          && deniedAuditJson.includes('"hostCredentialsLogged":false')
          && deniedAuditJson.includes('"sourceCodeLogged":false')
          && deniedAuditJson.includes('"secretsLogged":false'),
      };
    } finally {
      window.removeEventListener('switchboard-generated-app-semantic', handleSemantic);
      for (const permission of allowedPermissions) {
        await api.appPermission.remove(permission.id).catch(() => false);
      }
      if (allowedManifest) {
        await api.appManifest.remove(allowedManifest.id).catch(() => false);
      }
      if (deniedManifest) {
        await api.appManifest.remove(deniedManifest.id).catch(() => false);
      }
    }
  })();

  return {
    initial,
    menus: {
      desktopMenu,
      iconMenu,
      iconMenuAfterCleanup,
      iconMenuButtonStates,
      duplicateShortcutContextButtonStates,
      workspaceFileMenu,
      windowMenu,
      taskbarWindowMenu,
      taskbarMenu,
      trayStatusMenu,
      launcherRowMenu,
      hostsTaskbarPinMenu,
      hostsTaskbarUnpinMenu,
      hostContextMenu,
      terminalContextMenu,
      terminalContextMenuItems,
      notificationMenu,
    },
    menuAffordances: {
      desktopMenu: desktopMenuAffordances,
      iconMenu: iconMenuAffordances,
      windowMenu: windowMenuAffordances,
      terminalMenu: terminalMenuAffordances,
      workspaceFileMenu: workspaceFileMenuAffordances,
    },
    menuContributions: {
      iconMenu: iconMenuContributionMetadata,
      windowMenu: windowMenuContributionMetadata,
      taskbarWindowMenu: taskbarWindowContributionMetadata,
      taskbarMenu: taskbarMenuContributionMetadata,
      trayStatusMenu: trayStatusContributionMetadata,
      notificationMenu: notificationContributionMetadata,
      launcherRowMenu: launcherRowContributionMetadata,
      hostsTaskbarPinMenu: hostsTaskbarPinContributionMetadata,
      hostsTaskbarUnpinMenu: hostsTaskbarUnpinContributionMetadata,
    },
    shellObjects: {
      taskbarPanelObject,
      trayStatusObject,
      fileExplorerTaskbarObject,
      taskbarWindowContextObject,
      taskbarContextObject,
      trayStatusContextObject,
      notificationToastObject,
      notificationContextObject,
    },
    commandPalette: {
      opened: Boolean(commandPalette),
      rowLabels: commandPaletteLabels,
      text: commandPaletteText,
      metadata: commandPaletteMetadata,
      focusedWindowActionMetadata: focusedWindowPaletteActionMetadata,
      focusedWindowKeyboardActionMetadata,
    },
    keyboardShortcuts: keyboardShortcutReport,
    generatedPaletteCapability,
    generatedScopedStorage,
    generatedWindowSdk,
    generatedHostSdk,
    windows: {
      fileExplorerOpen: Boolean(fileWindow),
      hostsOpen: Boolean(hostsWindow),
      hostTerminalOpen: Boolean(hostTerminalWindow),
      trashOpen: Boolean(document.querySelector('.desktop-window[data-app-id="trash"]')),
      openWindowTitlebarText,
      openWindowTitlebarContainsLegacyControls: openWindowLegacyControlText.length > 0,
      openWindowTitlebarContainsRuntimeState: hasRuntimeStateText(openWindowTitlebarText),
      workspaceFileText,
      workspaceNavigatedPath,
      workspaceBreadcrumbText,
      fileExplorerIconsAfterDuplicateCount: fileExplorerIconsAfterDuplicate.length,
      desktopIconLabelsAfterDuplicateRemoval,
      desktopIconLabelsAfterRename,
      desktopIconLabelsAfterRenameRollback,
      desktopIconLabelsAfterPinCycle,
    },
    hosts: {
      seededHostId: seededHost.id,
      hostContextRowFound: Boolean(hostContextRow),
    },
    trash: trashResult,
    launcher: {
      open: Boolean(launcher),
      includesHosts: launcherText.includes('Hosts'),
      includesSettings: launcherText.includes('Settings'),
      includesAppManager: launcherText.includes('App Manager'),
      includesRecycleBin: launcherText.includes('Recycle Bin'),
      includesTerminal: launcherText.includes('Terminal'),
      includesFileExplorer: launcherText.includes('File Explorer'),
      rowLabels: launcherVisual.rowLabels,
      rowCount: launcherVisual.rowCount,
      iconCount: launcherVisual.iconCount,
      miniButtonCount: launcherVisual.miniButtonCount,
      pinButtonCount: launcherVisual.pinButtonCount,
      rowsAtRestNoChrome: launcherVisual.rowsAtRestNoChrome,
      launchIconsQuiet: launcherVisual.launchIconsQuiet,
      launchFirstIconIsQuiet: launcherVisual.launchFirstIconIsQuiet,
      launchFirstIconMatchesFileExplorerChrome: launcherVisual.launchFirstIconMatchesFileExplorerChrome,
      miniButtonsAtRestNoChrome: launcherVisual.miniButtonsAtRestNoChrome,
      pinButtonsAtRestNoChrome: launcherVisual.pinButtonsAtRestNoChrome,
      launcherRowMetadata: launcherVisual.launcherRowMetadata,
    },
  };
}

async function main() {
  const page = await waitForRendererPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.bringToFront');

  const legacyDefaultDesktopMigration = await runLegacyDefaultDesktopMigrationSmoke(cdp);
  const report = await cdp.evaluate(`(${browserSmoke.toString()})()`);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

  cdp.close();
  const requiredDefaultLauncherRows = [
    'File Explorer',
    'Recycle Bin',
    'Hosts',
    'Terminal',
    'Settings',
    'App Manager',
  ];
  const systemManifestRowMap = new Map(
    report.launcher.launcherRowMetadata.map((row) => [row.label, row]),
  );
  const defaultLauncherRowsBackedBySystemApplet = requiredDefaultLauncherRows.every((label) => {
    const row = systemManifestRowMap.get(label);
    return Boolean(row?.isSystemApplet)
      && row?.launcherCategory === 'core-launcher-system'
      && row?.defaultLauncherRow
      && Array.isArray(row?.capabilities)
      && row.capabilities.length > 0;
  });
  const terminalActionMenuItem = (label) => report.menus.terminalContextMenuItems
    .find((item) => item.text.includes(label));
  const iconMenuActionItem = (label, items) => items
    .find((item) => item.text.includes(label));
  const contributionMatches = (items, label, expected) => {
    return items
      .filter((item) => item.text.includes(label))
      .some((item) => Object.entries(expected).every(([key, value]) => {
        if (Array.isArray(value)) {
          return Array.isArray(item[key]) && value.every((entry) => item[key].includes(entry));
        }
        return item[key] === value;
      }));
  };
  const shellObjectMatches = (object, expected) => {
    return Boolean(object) && Object.entries(expected).every(([key, value]) => {
      if (Array.isArray(value)) {
        return Array.isArray(object[key]) && value.every((entry) => object[key].includes(entry));
      }
      return object[key] === value;
    });
  };
  const sameShellObject = (first, second) => Boolean(first)
    && Boolean(second)
    && first.objectId === second.objectId
    && first.objectKind === second.objectKind
    && first.owner === second.owner
    && first.source === second.source
    && first.targetScope === second.targetScope;
  const shellOwnedMenuForTarget = (items, targetScope) => items.length > 0
    && items.every((item) => item.source === 'shell'
      && item.targetScope === targetScope
      && Boolean(item.actionId)
      && !item.sourceAppId);
  const labelsHaveNoAppActionLeak = (labels) => labels.every((label) => !label.includes('App Actions')
    && !label.includes('Refresh workspace context'));
  const terminalBridgeActionsReady = ['Copy', 'Paste', 'Clear'].every((label) => {
    const item = terminalActionMenuItem(label);
    return Boolean(item) && !item.disabled && !item.text.includes('Requires the terminal applet action bridge');
  });
  const iconMenuDuplicateActionAvailable = iconMenuActionItem('Duplicate Shortcut', report.menus.iconMenuButtonStates);
  const duplicateShortcutMenuActionRemovable = iconMenuActionItem('Remove Shortcut', report.menus.duplicateShortcutContextButtonStates);
  const initialDesktopIconSetFromReport = [...report.initial.iconLabels].sort();

  const checks = [
    legacyDefaultDesktopMigration.defaultIconsPresent,
    legacyDefaultDesktopMigration.legacyClutterRemoved,
    legacyDefaultDesktopMigration.explicitUserPinPreserved,
    JSON.stringify(legacyDefaultDesktopMigration.sortedLabels) === JSON.stringify(legacyDefaultDesktopMigration.expectedLabels),
    legacyDefaultDesktopMigration.storedLegacyClutterRemoved,
    legacyDefaultDesktopMigration.storedSanitizedShortcutSet,
    report.initial.desktopShell,
    report.initial.wallpaperMode === 'default',
    report.initial.wallpaperApplied,
    report.initial.windowCount === 0,
    !report.initial.hostLauncherOpen,
    !report.initial.inspectorOpen,
    !report.initial.workspacePlaque,
    report.initial.firstRunOpen,
    report.initial.firstRunPanelAppletMetadata?.appId === 'welcome',
    report.initial.firstRunPanelAppletMetadata?.isSystemApplet,
    report.initial.firstRunPanelAppletMetadata?.sdkContract === 'switchboardos-app-sdk-v1',
    report.initial.firstRunPanelAppletMetadata?.appletLanguage === 'typescript',
    report.initial.firstRunPanelAppletMetadata?.presentationMode === 'onboarding-panel',
    report.initial.firstRunPanelAppletMetadata?.capabilities.includes('local:config:read'),
    report.initial.firstRunPanelAppletMetadata?.capabilities.includes('local:config:write'),
    report.initial.firstRunPanelAppletMetadata?.capabilities.includes('context-menu:contribute'),
    report.initial.firstRunPanelText.includes('Start menu'),
    report.initial.firstRunPanelText.includes('right-click'),
    report.initial.firstRunPanelText.includes('File Explorer'),
    report.initial.firstRunPanelText.includes('Recycle Bin'),
    report.initial.firstRunPanelText.includes('Hosts'),
    report.initial.firstRunPanelText.includes('SSH'),
    report.initial.firstRunPanelText.includes('Settings'),
    report.initial.firstRunPanelText.includes('App Manager'),
    report.initial.firstRunPanelText.includes('host operations'),
    report.initial.firstRunQuickActions.includes('Add host'),
    report.initial.firstRunQuickActions.includes('File Explorer'),
    report.initial.firstRunQuickActions.includes('Settings'),
    report.initial.firstRunQuickActions.includes('App Manager'),
    report.initial.firstRunQuickActions.includes('Start menu'),
    !report.initial.firstRunQuickActions.some((label) => label.includes('Operator') || label.includes('Dashboard')),
    report.initial.titlebarTileControls.length === 0,
    report.initial.taskbarCommandButtons === 0,
    report.initial.startButtonText === 'Start',
    report.initial.wallpaperLayout === 'fill',
    report.initial.wallpaperComputed.backgroundSize.includes('cover'),
    report.initial.wallpaperComputed.backgroundRepeat.includes('no-repeat'),
    JSON.stringify(report.initial.iconLabels) === JSON.stringify(['File Explorer', 'Recycle Bin']),
    !report.initial.hasDuplicateShortcutUnavailableText,
    report.initial.fileExplorerIconChromeIsQuiet,
    report.initial.removeButtons === 0,
    report.commandPalette.opened,
    report.commandPalette.rowLabels.includes('File Explorer'),
    report.commandPalette.rowLabels.includes('Recycle Bin'),
    report.commandPalette.rowLabels.includes('Hosts'),
    report.commandPalette.rowLabels.includes('Terminal'),
    report.commandPalette.rowLabels.includes('Bootstrap'),
    report.commandPalette.rowLabels.includes('App Studio'),
    report.commandPalette.rowLabels.includes('Operator') === false,
    report.commandPalette.text.includes('Agent endpoint and approvals') === false,
    contributionMatches(report.commandPalette.metadata, 'File Explorer', {
      source: 'app-manifest',
      sourceAppId: 'workspace-files',
      targetScope: 'command-palette',
      actionId: 'open-app',
      shortcut: 'Meta+E',
      isSystemApplet: 'true',
      launcherCategory: 'core-launcher-system',
      defaultLauncherRow: 'true',
      capabilities: ['files:read', 'storage:scoped', 'local:config:read'],
    }),
    contributionMatches(report.commandPalette.metadata, 'Hosts', {
      source: 'app-manifest',
      sourceAppId: 'hosts',
      targetScope: 'command-palette',
      actionId: 'open-app',
      isSystemApplet: 'true',
      launcherCategory: 'core-launcher-system',
      defaultLauncherRow: 'true',
      capabilities: ['host:read', 'host:actions'],
    }),
    contributionMatches(report.commandPalette.focusedWindowActionMetadata, 'Refresh workspace context', {
      source: 'window-object',
      sourceAppId: 'workspace-files',
      targetScope: 'focused-window',
      actionId: 'refresh-hosts',
    }),
    contributionMatches(report.commandPalette.focusedWindowKeyboardActionMetadata, 'Minimize window', {
      source: 'window-object',
      sourceAppId: 'workspace-files',
      targetScope: 'focused-window',
      actionId: 'minimize-window',
      shortcut: 'Meta+M',
    }),
    report.keyboardShortcuts.metaMMinimized,
    report.keyboardShortcuts.metaUpMaximized,
    report.keyboardShortcuts.f11FullscreenClass,
    report.keyboardShortcuts.altShiftLeftTiled,
    report.generatedPaletteCapability.available,
    report.generatedPaletteCapability.allowedActionVisible,
    !report.generatedPaletteCapability.blockedActionVisible,
    report.generatedPaletteCapability.altF4Closed,
    report.generatedPaletteCapability.allowedActionMetadata?.source === 'window-object',
    report.generatedPaletteCapability.allowedActionMetadata?.sourceAppId === report.generatedPaletteCapability.appId,
    report.generatedPaletteCapability.allowedActionMetadata?.targetScope === 'focused-window',
    report.generatedPaletteCapability.allowedActionMetadata?.actionId === 'allowed-smoke-palette-action',
    report.generatedPaletteCapability.allowedActionMetadata?.shortcut === 'Ctrl+Alt+A',
    report.generatedPaletteCapability.allowedActionMetadata?.requiredCapabilities.includes('palette:allowed'),
    report.generatedPaletteCapability.allowedActionMetadata?.capabilities.includes('palette:allowed'),
    report.generatedScopedStorage.available,
    report.generatedScopedStorage.allowedStateStatus === 'storage-ok',
    report.generatedScopedStorage.allowedStateStorageMatches,
    report.generatedScopedStorage.backendFound,
    report.generatedScopedStorage.backendValueMatches,
    report.generatedScopedStorage.allowedAuditHasUpdate,
    report.generatedScopedStorage.allowedAuditHasRead,
    report.generatedScopedStorage.allowedAuditOmitsValue,
    report.generatedScopedStorage.deniedStateStatus === 'storage-denied',
    report.generatedScopedStorage.deniedStateMentionsCapability,
    report.generatedScopedStorage.deniedBackendReadDenied,
    report.generatedScopedStorage.deniedAuditHasBackendDenial,
    report.generatedScopedStorage.deniedAuditHasSdkDenial,
    report.generatedScopedStorage.deniedAuditOmitsValue,
    report.generatedScopedStorage.noGeneratedLocalStorageKeys,
    report.generatedWindowSdk.available,
    report.generatedWindowSdk.stateStatus === 'window-sdk-ok',
    report.generatedWindowSdk.titleText === 'SDK Window Contract',
    report.generatedWindowSdk.windowBadge === 'SDK',
    report.generatedWindowSdk.windowStatus === 'runtime-ready',
    report.generatedWindowSdk.windowPreferredSize?.includes('"minWidth":480'),
    report.generatedWindowSdk.taskbarBadge === 'SDK',
    report.generatedWindowSdk.taskbarStatus === 'runtime-ready',
    report.generatedWindowSdk.taskbarPreferredSize?.includes('"maxHeight":700'),
    report.generatedWindowSdk.initialWindowMatches,
    report.generatedWindowSdk.titleApplied,
    report.generatedWindowSdk.badgeApplied,
    report.generatedWindowSdk.statusApplied,
    report.generatedWindowSdk.preferredSizeApplied,
    report.generatedWindowSdk.malformedDenied,
    report.generatedWindowSdk.malformedMentionsSize,
    report.generatedWindowSdk.auditHasSdkDenial,
    report.generatedWindowSdk.auditSanitized,
    report.generatedHostSdk.available,
    report.generatedHostSdk.allowedStateStatus === 'host-sdk-ok',
    report.generatedHostSdk.allowedFoundInList,
    report.generatedHostSdk.allowedGetFound,
    report.generatedHostSdk.allowedStatusFound,
    report.generatedHostSdk.allowedCapabilitiesFound,
    report.generatedHostSdk.allowedTestHostMatches,
    !report.generatedHostSdk.allowedSensitiveLeaked,
    report.generatedHostSdk.allowedAuditHasList,
    report.generatedHostSdk.allowedAuditHasRead,
    report.generatedHostSdk.allowedAuditHasStatus,
    report.generatedHostSdk.allowedAuditHasCapabilities,
    report.generatedHostSdk.allowedAuditHasTest,
    report.generatedHostSdk.allowedAuditSanitized,
    report.generatedHostSdk.deniedStateStatus === 'host-sdk-denied',
    report.generatedHostSdk.deniedStateMentionsCapability,
    report.generatedHostSdk.deniedAuditHasBackendDenial,
    report.generatedHostSdk.deniedAuditHasSdkDenial,
    report.generatedHostSdk.deniedAuditSanitized,
    report.menus.desktopMenu.some((label) => label.includes('New Folder')),
    report.menus.desktopMenu.some((label) => label.includes('Change Wallpaper')),
    report.menuAffordances.desktopMenu.iconCount >= 6,
    report.menuAffordances.desktopMenu.separatorCount >= 2,
    report.menuAffordances.desktopMenu.shortcutLabels.includes('Ctrl+Shift+N'),
    report.menuAffordances.desktopMenu.shortcutLabels.includes('Ctrl+V'),
    report.menuAffordances.desktopMenu.shortcutLabels.includes('Meta+E'),
    report.menuAffordances.desktopMenu.shortcutLabels.includes('F5'),
    report.menus.iconMenu.some((label) => label.includes('Open')),
    report.menus.iconMenu.some((label) => label.includes('Rename')),
    report.menus.iconMenu.some((label) => label.includes('Duplicate Shortcut')),
    report.menus.iconMenu.some((label) => label.includes('Remove Shortcut')),
    report.menus.iconMenu.some((label) => label.includes('Properties')),
    contributionMatches(report.menuContributions.iconMenu, 'Open', {
      source: 'app-manifest',
      sourceAppId: 'workspace-files',
      targetScope: 'desktop-icon',
      actionId: 'open-app',
    }),
    contributionMatches(report.menuContributions.iconMenu, 'Properties', {
      source: 'app-manifest',
      sourceAppId: 'workspace-files',
      targetScope: 'desktop-icon',
      actionId: 'properties',
    }),
    !report.menus.iconMenu.some((label) => label.includes('Pin to Desktop')),
    report.windows.desktopIconLabelsAfterRename.includes('File Explorer (Personal)'),
    JSON.stringify(report.windows.desktopIconLabelsAfterRenameRollback.sort()) === JSON.stringify(['File Explorer', 'Recycle Bin']),
    report.menuAffordances.iconMenu.iconCount >= 5,
    report.menuAffordances.iconMenu.separatorCount >= 2,
    report.menuAffordances.iconMenu.shortcutLabels.includes('Enter'),
    report.menuAffordances.iconMenu.shortcutLabels.includes('F2'),
    report.menuAffordances.iconMenu.shortcutLabels.includes('Ctrl+D'),
    report.menuAffordances.iconMenu.shortcutLabels.includes('Delete'),
    report.menuAffordances.iconMenu.shortcutLabels.includes('Alt+Enter'),
    Boolean(iconMenuDuplicateActionAvailable && !iconMenuDuplicateActionAvailable.disabled),
    report.windows.fileExplorerIconsAfterDuplicateCount === 2,
    report.windows.desktopIconLabelsAfterDuplicateRemoval.sort().join() === initialDesktopIconSetFromReport.join(),
    Boolean(duplicateShortcutMenuActionRemovable && !duplicateShortcutMenuActionRemovable.disabled),
    report.menus.workspaceFileMenu.some((label) => label.includes('Open')),
    report.menus.workspaceFileMenu.some((label) => label.includes('New Folder')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Open With')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Rename')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Copy')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Cut')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Paste')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Duplicate')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Move to Recycle Bin')),
    report.menus.workspaceFileMenu.some((label) => label.includes('Properties')),
    report.menuAffordances.workspaceFileMenu.iconCount >= 8,
    report.menuAffordances.workspaceFileMenu.separatorCount === 3,
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Enter'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Ctrl+Shift+N'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('F2'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Ctrl+C'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Ctrl+X'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Ctrl+V'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Ctrl+D'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Delete'),
    report.menuAffordances.workspaceFileMenu.shortcutLabels.includes('Alt+Enter'),
    report.menus.windowMenu.some((label) => label.includes('Close Window')),
    report.menus.windowMenu.some((label) => label.includes('Tile Left')),
    report.menus.windowMenu.some((label) => label.includes('Fullscreen')),
    report.menus.windowMenu.some((label) => label.includes('App Actions')),
    contributionMatches(report.menuContributions.windowMenu, 'Refresh workspace context', {
      source: 'window-object',
      sourceAppId: 'workspace-files',
      targetScope: 'window',
      actionId: 'refresh-hosts',
    }),
    report.menuAffordances.windowMenu.iconCount >= 10,
    report.menuAffordances.windowMenu.separatorCount >= 3,
    report.menuAffordances.windowMenu.shortcutLabels.includes('Meta+M'),
    report.menuAffordances.windowMenu.shortcutLabels.includes('Meta+Up'),
    report.menuAffordances.windowMenu.shortcutLabels.includes('F11'),
    report.menuAffordances.windowMenu.shortcutLabels.includes('Alt+F4'),
    !report.windows.openWindowTitlebarContainsLegacyControls,
    !report.windows.openWindowTitlebarContainsRuntimeState,
    report.menus.taskbarWindowMenu.some((label) => label.includes('Show') || label.includes('Restore')),
    report.menus.taskbarWindowMenu.some((label) => label.includes('New Window')),
    report.menus.taskbarWindowMenu.some((label) => label.includes('Minimize') || label.includes('Restore Window')),
    report.menus.taskbarWindowMenu.some((label) => label.includes('Pin to Desktop') || label.includes('Pinned to Desktop')),
    report.menus.taskbarWindowMenu.some((label) => label.includes('Close Window')),
    contributionMatches(report.menuContributions.taskbarWindowMenu, 'Pinned to Desktop', {
      source: 'app-manifest',
      sourceAppId: 'workspace-files',
      targetScope: 'taskbar-window',
      actionId: 'pinned-default-app',
    }),
    contributionMatches(report.menuContributions.taskbarWindowMenu, 'Refresh workspace context', {
      source: 'window-object',
      sourceAppId: 'workspace-files',
      targetScope: 'taskbar-window',
      actionId: 'refresh-hosts',
    }),
    shellObjectMatches(report.shellObjects.fileExplorerTaskbarObject, {
      objectKind: 'taskbar-window',
      owner: 'shell',
      source: 'window-object',
      targetScope: 'taskbar-window',
      sourceAppId: 'workspace-files',
    }),
    sameShellObject(report.shellObjects.fileExplorerTaskbarObject, report.shellObjects.taskbarWindowContextObject),
    report.shellObjects.fileExplorerTaskbarObject?.objectId.startsWith('shell:taskbar-window:'),
    report.shellObjects.fileExplorerTaskbarObject?.windowId,
    report.shellObjects.fileExplorerTaskbarObject?.actionIds.includes('show-taskbar-window'),
    report.shellObjects.fileExplorerTaskbarObject?.actionIds.includes('new-window'),
    report.shellObjects.fileExplorerTaskbarObject?.actionIds.includes('toggle-minimize-window'),
    report.shellObjects.fileExplorerTaskbarObject?.actionIds.includes('close-window'),
    report.shellObjects.fileExplorerTaskbarObject?.actionIds.includes('refresh-hosts'),
    report.menus.hostsTaskbarPinMenu.some((label) => label.includes('Pin to Desktop')),
    report.menus.hostsTaskbarPinMenu.every((label) => !label.includes('Unpin from Desktop')),
    contributionMatches(report.menuContributions.hostsTaskbarPinMenu, 'Pin to Desktop', {
      source: 'app-manifest',
      sourceAppId: 'hosts',
      targetScope: 'taskbar-window',
      actionId: 'pin-app',
    }),
    report.menus.hostsTaskbarUnpinMenu.some((label) => label.includes('Unpin from Desktop')),
    contributionMatches(report.menuContributions.hostsTaskbarUnpinMenu, 'Unpin from Desktop', {
      source: 'app-manifest',
      sourceAppId: 'hosts',
      targetScope: 'taskbar-window',
      actionId: 'unpin-app',
    }),
    report.windows.hostsOpen,
    JSON.stringify(report.windows.desktopIconLabelsAfterPinCycle) === JSON.stringify(['File Explorer', 'Recycle Bin']),
    report.hosts.seededHostId,
    report.hosts.hostContextRowFound,
    report.menus.hostContextMenu.some((label) => label.includes('Open Dashboard')),
    report.menus.hostContextMenu.some((label) => label.includes('Open Terminal')),
    report.menus.hostContextMenu.some((label) => label.includes('Open File Explorer')),
    report.menus.hostContextMenu.some((label) => label.includes('Run Scriptlet')),
    report.menus.hostContextMenu.some((label) => label.includes('Edit Host')),
    report.menus.hostContextMenu.some((label) => label.includes('Test Connection')),
    report.menus.hostContextMenu.some((label) => label.includes('Properties')),
    report.windows.hostTerminalOpen,
    report.menus.terminalContextMenu.some((label) => label.includes('Copy')),
    report.menus.terminalContextMenu.some((label) => label.includes('Paste')),
    report.menus.terminalContextMenu.some((label) => label.includes('Clear')),
    terminalBridgeActionsReady,
    report.menuAffordances.terminalMenu.iconCount >= 3,
    report.menuAffordances.terminalMenu.separatorCount >= 1,
    report.menuAffordances.terminalMenu.shortcutLabels.includes('Ctrl+Shift+C'),
    report.menuAffordances.terminalMenu.shortcutLabels.includes('Ctrl+Shift+V'),
    report.menuAffordances.terminalMenu.shortcutLabels.includes('Ctrl+L'),
    report.menus.terminalContextMenu.some((label) => label.includes('Split/New Terminal')),
    report.menus.terminalContextMenu.some((label) => label.includes('Open Host Dashboard')),
    report.menus.terminalContextMenu.some((label) => label.includes('Properties')),
    report.menus.notificationMenu.some((label) => label.includes('Dismiss Notification')),
    report.menus.notificationMenu.some((label) => label.includes('Clear All Notifications')),
    report.menus.notificationMenu.some((label) => label.includes('Notification Settings')),
    shellObjectMatches(report.shellObjects.notificationToastObject, {
      objectKind: 'notification',
      owner: 'shell',
      source: 'shell',
      targetScope: 'notification',
      notificationKind: 'toast',
    }),
    report.shellObjects.notificationToastObject?.objectId.startsWith('shell:notification:toast:'),
    report.shellObjects.notificationToastObject?.actionIds.includes('dismiss-notification'),
    report.shellObjects.notificationToastObject?.actionIds.includes('clear-notifications'),
    report.shellObjects.notificationToastObject?.actionIds.includes('open-notification-settings'),
    sameShellObject(report.shellObjects.notificationToastObject, report.shellObjects.notificationContextObject),
    report.shellObjects.notificationContextObject?.notificationKind === 'toast',
    shellOwnedMenuForTarget(report.menuContributions.notificationMenu, 'notification'),
    labelsHaveNoAppActionLeak(report.menus.notificationMenu),
    report.menus.taskbarMenu.some((label) => label.includes('Show Desktop')),
    shellObjectMatches(report.shellObjects.taskbarPanelObject, {
      objectId: 'shell:panel:primary',
      objectKind: 'panel',
      owner: 'shell',
      source: 'shell',
      targetScope: 'taskbar',
    }),
    sameShellObject(report.shellObjects.taskbarPanelObject, report.shellObjects.taskbarContextObject),
    report.shellObjects.taskbarPanelObject?.actionIds.includes('panel-settings'),
    report.shellObjects.taskbarPanelObject?.actionIds.includes('show-desktop'),
    report.shellObjects.taskbarPanelObject?.actionIds.includes('task-manager'),
    shellOwnedMenuForTarget(report.menuContributions.taskbarMenu, 'taskbar'),
    labelsHaveNoAppActionLeak(report.menus.taskbarMenu),
    report.menus.trayStatusMenu.some((label) => label.includes('Status Details')),
    report.menus.trayStatusMenu.some((label) => label.includes('Notification Settings')),
    report.menus.trayStatusMenu.some((label) => label.includes('Panel Settings')),
    report.menus.trayStatusMenu.some((label) => label.includes('Refresh Status')),
    shellObjectMatches(report.shellObjects.trayStatusObject, {
      objectId: 'shell:tray:status',
      objectKind: 'tray-status',
      owner: 'shell',
      source: 'shell',
      targetScope: 'tray-status',
    }),
    sameShellObject(report.shellObjects.trayStatusObject, report.shellObjects.trayStatusContextObject),
    report.shellObjects.trayStatusObject?.actionIds.includes('status-details'),
    report.shellObjects.trayStatusObject?.actionIds.includes('refresh-status'),
    shellOwnedMenuForTarget(report.menuContributions.trayStatusMenu, 'tray-status'),
    labelsHaveNoAppActionLeak(report.menus.trayStatusMenu),
    report.menus.launcherRowMenu.some((label) => label.includes('Pin to Desktop')),
    contributionMatches(report.menuContributions.launcherRowMenu, 'Open', {
      source: 'app-manifest',
      sourceAppId: 'hosts',
      targetScope: 'launcher-row',
      actionId: 'open-app',
    }),
    contributionMatches(report.menuContributions.launcherRowMenu, 'Pin to Desktop', {
      source: 'app-manifest',
      sourceAppId: 'hosts',
      targetScope: 'launcher-row',
      actionId: 'pin-app',
    }),
    contributionMatches(report.menuContributions.launcherRowMenu, 'Properties', {
      source: 'app-manifest',
      sourceAppId: 'hosts',
      targetScope: 'launcher-row',
      actionId: 'properties',
    }),
    !report.menus.launcherRowMenu.some((label) => label.includes('Refresh workspace context')),
    report.windows.fileExplorerOpen,
    report.windows.trashOpen,
    report.windows.workspaceFileText.includes('SwitchboardOS Workspace'),
    report.windows.workspaceFileText.includes('New Folder'),
    report.windows.workspaceNavigatedPath.includes('/New Folder'),
    report.windows.workspaceBreadcrumbText.includes('New Folder'),
    report.launcher.open,
    report.launcher.rowCount === 6,
    JSON.stringify(report.launcher.rowLabels) === JSON.stringify(requiredDefaultLauncherRows),
    report.launcher.iconCount === report.launcher.rowCount,
    report.launcher.pinButtonCount === report.launcher.rowCount,
    report.launcher.miniButtonCount >= 1,
    report.launcher.includesHosts,
    report.launcher.includesSettings,
    report.launcher.includesAppManager,
    report.launcher.includesRecycleBin,
    report.launcher.includesTerminal,
    report.launcher.includesFileExplorer,
    report.launcher.rowLabels.includes('Bootstrap') === false,
    report.launcher.rowLabels.includes('File Browser') === false,
    report.launcher.rowLabels.includes('Process Viewer') === false,
    report.launcher.rowLabels.includes('Service Manager') === false,
    report.launcher.rowLabels.includes('Log Viewer') === false,
    report.launcher.rowLabels.includes('Command History') === false,
    report.launcher.rowLabels.includes('App Studio') === false,
    report.launcher.rowLabels.includes('Operator') === false,
    report.launcher.rowLabels.includes('Host Map') === false,
    report.launcher.rowLabels.includes('Audit') === false,
    report.launcher.rowLabels.includes('Status') === false,
    report.launcher.rowLabels.includes('Host Dashboard') === false,
    report.launcher.rowLabels.includes('Host Terminal') === false,
    report.launcher.launcherRowMetadata.every((row) => row.launcherCategory === 'core-launcher-system'),
    report.launcher.launcherRowMetadata.every((row) => row.defaultLauncherRow),
    report.launcher.rowsAtRestNoChrome,
    report.launcher.launchIconsQuiet,
    report.launcher.launchFirstIconIsQuiet,
    report.launcher.launchFirstIconMatchesFileExplorerChrome,
    report.launcher.miniButtonsAtRestNoChrome,
    report.launcher.pinButtonsAtRestNoChrome,
    defaultLauncherRowsBackedBySystemApplet,
    // Recycle Bin smoke checks
    report.trash?.folderMovedToTrash,
    report.trash?.trashItemFound,
    report.trash?.trashItemGone,
    report.trash?.folderRestored,
  ];

  const failedCheckIndexes = checks
    .map((check, index) => (check ? null : index))
    .filter((index) => index !== null);

  if (failedCheckIndexes.length > 0) {
    console.log(JSON.stringify({ legacyDefaultDesktopMigration, report, screenshotPath, failedCheckIndexes }, null, 2));
    throw new Error('Desktop shell UI smoke assertions failed.');
  }

  console.log(JSON.stringify({ legacyDefaultDesktopMigration, report, screenshotPath }, null, 2));
  cleanup();
  process.exit(0);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  if (electronOutput) {
    console.error('\nElectron output:\n' + electronOutput);
  }
  process.exit(1);
});
