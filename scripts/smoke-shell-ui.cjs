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
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-shell-ui-'));
const screenshotPath = join(tmpdir(), 'switchboardos-shell-ui-smoke.png');
const electron = spawn(electronBin, ['.', '--no-sandbox', `--remote-debugging-port=${port}`], {
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
  const deadline = Date.now() + 20000;
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
        pending.reject(new Error(message.error.message));
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
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, 10000);
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
  const clickMenuItem = (text) => click([...document.querySelectorAll('[data-testid="context-menu"] button')]
    .find((button) => textIncludes(button, text)));
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
    removeButtons: document.querySelectorAll('.desktop-shortcut-remove').length,
  };

  keydown('k', { ctrlKey: true });
  const commandPalette = await waitFor(() => document.querySelector('[data-testid="command-palette"]'), 'command palette');
  const commandPaletteLabels = [...commandPalette.querySelectorAll('.palette-result span')]
    .map((node) => (node.textContent || '').trim());
  const commandPaletteText = commandPalette.textContent || '';
  keydown('Escape');
  await waitFor(() => !document.querySelector('[data-testid="command-palette"]'), 'command palette closed');

  click(document.querySelector('[data-testid="app-launcher-button"]'));
  const launcherForHostPanel = await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu for host launcher');
  click(buttonByText(launcherForHostPanel, 'Host launcher'));
  const hostLauncherPanel = await waitFor(() => document.querySelector('[data-testid="host-launcher"]'), 'host launcher panel');
  click(buttonByText(hostLauncherPanel, 'Refresh'));
  const hostContextRow = await waitFor(
    () => [...document.querySelectorAll('[data-testid="host-launcher"] .host-row')]
      .find((row) => textIncludes(row, 'Smoke Context Host')),
    'seeded host launcher row',
  );
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

  const fileExplorerIcon = [...document.querySelectorAll('.desktop-icon-frame')]
    .find((frame) => textIncludes(frame, 'File Explorer'));
  const recycleBinIcon = [...document.querySelectorAll('.desktop-icon-frame')]
    .find((frame) => textIncludes(frame, 'Recycle Bin'));
  rightClick(fileExplorerIcon);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="desktop-icon"]'), 'icon context menu');
  const iconMenu = menuLabels();
  click([...document.querySelectorAll('[data-testid="context-menu"] button')].find((button) => textIncludes(button, 'Open')));
  const fileWindow = await waitFor(
    () => document.querySelector('.desktop-window[data-app-id="workspace-files"]'),
    'workspace file explorer window',
  );
  const openWindowTitlebarText = fileWindow.querySelector('.window-chrome .window-title-group')?.textContent || '';
  const openWindowLegacyControlText = [...fileWindow.querySelectorAll('.window-chrome .window-controls .window-btn')]
    .map((button) => (button.textContent || '').trim())
    .filter((label) => forbiddenWindowControlText.includes(label));
  await waitFor(() => fileWindow.querySelector('[data-testid="workspace-file-list"]'), 'workspace file list');
  const workspaceFileText = fileWindow.textContent || '';
  const newFolderRow = await waitFor(
    () => [...fileWindow.querySelectorAll('.workspace-file-item')]
      .find((row) => textIncludes(row, 'New Folder')),
    'created New Folder row in File Explorer',
  );
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
  const windowMenuAffordances = menuAffordances();
  click(document.body);

  const fileExplorerTaskbarItem = await waitFor(
    () => [...document.querySelectorAll('.taskbar-window')]
      .find((button) => textIncludes(button, 'File Explorer')),
    'File Explorer taskbar item',
  );
  rightClick(fileExplorerTaskbarItem);
  await waitFor(
    () => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar-window"]'),
    'taskbar app item context menu',
  );
  const taskbarWindowMenu = menuLabels();
  click(document.body);

  rightClick(document.querySelector('[data-testid="taskbar"]'));
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar"]'), 'taskbar context menu');
  const taskbarMenu = menuLabels();
  click(document.body);

  rightClick(document.querySelector('[data-testid="taskbar-tray"]'));
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="tray-status"]'), 'tray status context menu');
  const trayStatusMenu = menuLabels();
  click(document.body);

  click(document.querySelector('[data-testid="app-launcher-button"]'));
  const launcher = await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu');
  const launcherText = launcher.textContent || '';
  const launcherVisual = launcherChromeState(launcher);
  const hostsLauncherRow = [...document.querySelectorAll('.launcher-row')].find((row) => textIncludes(row, 'Hosts'));
  rightClick(hostsLauncherRow);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="launcher-row"]'), 'launcher row menu');
  const launcherRowMenu = menuLabels();
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
  clickMenuItem('Pin to Desktop');
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'Hosts pin menu closed');
  await waitFor(() => desktopIconLabels().includes('Hosts'), 'Hosts pinned desktop icon');

  rightClick(hostsTaskbarItem);
  await waitFor(
    () => document.querySelector('[data-testid="context-menu"][data-context-target="taskbar-window"]'),
    'Hosts taskbar unpin menu',
  );
  const hostsTaskbarUnpinMenu = menuLabels();
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

  const toastForContext = await waitFor(() => document.querySelector('.toast:not(.error)') || document.querySelector('.toast'), 'toast after opening windows');
  rightClick(toastForContext);
  await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="notification"]'), 'notification context menu');
  const notificationMenu = menuLabels();
  clickMenuItem('Dismiss Notification');
  await waitFor(() => !document.querySelector('[data-testid="context-menu"]'), 'notification context menu closed');
  await waitFor(
    () => document.querySelectorAll('.toast:not(.error)').length === 0,
    'ordinary toasts auto-dismiss',
    6000,
  );

  return {
    initial,
    menus: {
      desktopMenu,
      iconMenu,
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
      windowMenu: windowMenuAffordances,
      terminalMenu: terminalMenuAffordances,
    },
    commandPalette: {
      opened: Boolean(commandPalette),
      rowLabels: commandPaletteLabels,
      text: commandPaletteText,
    },
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
    return Boolean(row?.isSystemApplet) && Array.isArray(row?.capabilities) && row.capabilities.length > 0;
  });
  const terminalActionMenuItem = (label) => report.menus.terminalContextMenuItems
    .find((item) => item.text.includes(label));
  const terminalBridgeActionsReady = ['Copy', 'Paste', 'Clear'].every((label) => {
    const item = terminalActionMenuItem(label);
    return Boolean(item) && !item.disabled && !item.text.includes('Requires the terminal applet action bridge');
  });

  const checks = [
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
    report.menus.desktopMenu.some((label) => label.includes('New Folder')),
    report.menus.desktopMenu.some((label) => label.includes('Change Wallpaper')),
    report.menuAffordances.desktopMenu.iconCount >= 6,
    report.menuAffordances.desktopMenu.separatorCount >= 2,
    report.menuAffordances.desktopMenu.shortcutLabels.includes('Ctrl+Shift+N'),
    report.menuAffordances.desktopMenu.shortcutLabels.includes('Ctrl+V'),
    report.menuAffordances.desktopMenu.shortcutLabels.includes('Meta+E'),
    report.menuAffordances.desktopMenu.shortcutLabels.includes('F5'),
    report.menus.iconMenu.some((label) => label.includes('Open')),
    report.menus.iconMenu.some((label) => label.includes('Properties')),
    report.menus.windowMenu.some((label) => label.includes('Close Window')),
    report.menus.windowMenu.some((label) => label.includes('Tile Left')),
    report.menus.windowMenu.some((label) => label.includes('Fullscreen')),
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
    report.menus.hostsTaskbarPinMenu.some((label) => label.includes('Pin to Desktop')),
    report.menus.hostsTaskbarPinMenu.every((label) => !label.includes('Unpin from Desktop')),
    report.menus.hostsTaskbarUnpinMenu.some((label) => label.includes('Unpin from Desktop')),
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
    report.menus.taskbarMenu.some((label) => label.includes('Show Desktop')),
    report.menus.trayStatusMenu.some((label) => label.includes('Status Details')),
    report.menus.trayStatusMenu.some((label) => label.includes('Notification Settings')),
    report.menus.trayStatusMenu.some((label) => label.includes('Panel Settings')),
    report.menus.trayStatusMenu.some((label) => label.includes('Refresh Status')),
    report.menus.launcherRowMenu.some((label) => label.includes('Pin to Desktop')),
    report.windows.fileExplorerOpen,
    report.windows.trashOpen,
    report.windows.workspaceFileText.includes('SwitchboardOS Workspace'),
    report.windows.workspaceFileText.includes('New Folder'),
    report.windows.workspaceNavigatedPath.includes('/New Folder'),
    report.windows.workspaceBreadcrumbText.includes('New Folder'),
    report.launcher.open,
    report.launcher.rowCount === 6,
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

  if (checks.some((check) => !check)) {
    console.log(JSON.stringify({ report, screenshotPath }, null, 2));
    throw new Error('Desktop shell UI smoke assertions failed.');
  }

  console.log(JSON.stringify({ report, screenshotPath }, null, 2));
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
