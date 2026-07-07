#!/usr/bin/env node

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { get } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

if (typeof WebSocket !== 'function') {
  console.error('This smoke requires Node with global WebSocket support. Use the repo Node 24 runtime.');
  process.exit(2);
}

const repoRoot = join(__dirname, '..');
const electronBin = join(repoRoot, 'node_modules', '.bin', 'electron');
const hostOperationsSource = readFileSync(join(repoRoot, 'src/renderer/app/host-operations/host-operations.component.ts'), 'utf8');
const appComponentSource = readFileSync(join(repoRoot, 'src/renderer/app/app.component.ts'), 'utf8');
const port = 9800 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-ssh-file-browser-ui-'));
const electronUserDataDir = join(configDir, 'electron-user-data');
const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const uploadSourcePath = join(tmpdir(), `switchboardos-file-browser-upload-source-${runId}.txt`);
const downloadTargetPath = join(tmpdir(), `switchboardos-file-browser-download-${runId}.json`);
const remoteUploadDir = `/tmp/switchboardos-file-browser-upload-dir-${runId}`;
const remoteUploadPath = `${remoteUploadDir}/target.txt`;
const remoteMovedPath = `${remoteUploadDir}/renamed-target.txt`;

assert.equal(hostOperationsSource.includes('openShellFileContextMenu'), false, 'File Browser-specific shell menu callback is removed');
assert.equal(hostOperationsSource.includes('SshFileObjectContextMenuRequest'), false, 'File Browser-specific context menu request type is removed');
assert.equal(hostOperationsSource.includes('openAppletElementContextMenu'), true, 'File Browser uses generic applet element context menu input');
assert.equal(appComponentSource.includes('openAppletElementContextMenu'), true, 'Shell exposes generic applet element context menu dispatcher');

writeFileSync(uploadSourcePath, `SwitchboardOS SSH file browser upload smoke ${runId}\n`, 'utf8');

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
  rmSync(configDir, { recursive: true, force: true });
  rmSync(uploadSourcePath, { force: true });
  rmSync(downloadTargetPath, { force: true });
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
      await sleep(250);
    }
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

async function browserSmoke(params) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (predicate, label, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    let snapshot = null;
    while (Date.now() < deadline) {
      const value = await predicate();
      if (value) {
        return value;
      }
      snapshot = {
        bodyText: (document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 700),
        windows: [...document.querySelectorAll('.desktop-window')].map((windowElement) => ({
          appId: windowElement.getAttribute('data-app-id') || '',
          title: (windowElement.querySelector('.window-title')?.textContent || '').trim(),
        })),
        fileBrowserRuntime: (() => {
          const runtime = document.querySelector('[data-testid="host-operation-runtime"][data-operation-kind="files"]');
          const panel = runtime?.querySelector('[data-testid="ssh-file-actions"]');
          return runtime ? {
            providerRoute: runtime.getAttribute('data-provider-route') || '',
            selectedHostId: runtime.getAttribute('data-selected-host-id') || '',
            rowCount: runtime.getAttribute('data-row-count') || '',
            selectedPath: panel?.getAttribute('data-selected-path') || '',
            actionState: panel?.getAttribute('data-file-action-state') || '',
            statRoute: panel?.getAttribute('data-stat-provider-route') || '',
            statStatus: panel?.getAttribute('data-stat-status') || '',
            downloadRoute: panel?.getAttribute('data-download-provider-route') || '',
            downloadStatus: panel?.getAttribute('data-download-status') || '',
            uploadRoute: panel?.getAttribute('data-upload-provider-route') || '',
            uploadStatus: panel?.getAttribute('data-upload-status') || '',
            deleteRoute: panel?.getAttribute('data-delete-provider-route') || '',
            deleteStatus: panel?.getAttribute('data-delete-status') || '',
            moveRoute: panel?.getAttribute('data-move-provider-route') || '',
            moveStatus: panel?.getAttribute('data-move-status') || '',
            moveTargetPath: panel?.getAttribute('data-move-target-path') || '',
            moveResultMoved: panel?.getAttribute('data-move-result-moved') || '',
            deleteConfirmation: panel?.getAttribute('data-delete-confirmation') || '',
            deleteResultDeleted: panel?.getAttribute('data-delete-result-deleted') || '',
            transferDirection: panel?.getAttribute('data-transfer-direction') || '',
            transferStatus: panel?.getAttribute('data-transfer-status') || '',
            actionText: (panel?.textContent || '').replace(/\s+/g, ' ').slice(0, 400),
          } : null;
        })(),
      };
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(snapshot)}`);
  };
  const textIncludes = (element, text) => (element.textContent || '').includes(text);
  const click = (element) => {
    if (!element) {
      throw new Error('Missing clickable element');
    }
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + Math.min(24, Math.max(4, rect.width / 2));
    const clientY = rect.top + Math.min(18, Math.max(4, rect.height / 2));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX, clientY }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX, clientY }));
    element.click();
  };
  const rightClick = (element) => {
    if (!element) {
      throw new Error('Missing context target');
    }
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + Math.min(24, Math.max(4, rect.width / 2));
    const clientY = rect.top + Math.min(24, Math.max(4, rect.height / 2));
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX, clientY }));
  };
  const keydown = (element, key, options = {}) => {
    if (!element) {
      throw new Error(`Missing key target for ${key}`);
    }
    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      ...options,
    }));
  };
  const buttonByText = (root, text) => [...(root?.querySelectorAll('button') || [])]
    .find((button) => textIncludes(button, text));
  const clickMenuItem = (text) => click([...document.querySelectorAll('[data-testid="context-menu"] button')]
    .find((button) => textIncludes(button, text)));
  const clickFileMenuItem = (text) => click([...document.querySelectorAll('[data-testid="context-menu"][data-context-target="ssh-file-object"] button')]
    .find((button) => textIncludes(button, text)));
  const setInputValue = (input, value) => {
    if (!input) {
      throw new Error(`Missing input for value ${value}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const waitForEnabledButtonByText = (root, text, label) => waitFor(() => {
    const button = buttonByText(root, text);
    return button && !button.disabled ? button : null;
  }, label);
  const waitForHostRow = async (hostLauncherPanel, hostName) => waitFor(() => {
    const rows = [...hostLauncherPanel.querySelectorAll('.host-row')];
    return rows.find((row) => textIncludes(row, hostName));
  }, `host launcher row ${hostName}`, 30000);
  const runFileList = async (runtime, remotePath) => {
    const pathInput = runtime.querySelector('input[name="operationPath"]');
    const limitInput = runtime.querySelector('input[name="operationLimit"]');
    setInputValue(pathInput, remotePath);
    setInputValue(limitInput, '120');
    const runButton = await waitForEnabledButtonByText(runtime, 'Run read-only inspection', 'file browser run button');
    click(runButton);
    await waitFor(() => runtime.getAttribute('data-provider-route') === 'ssh-file:list'
      && Number(runtime.getAttribute('data-row-count') || '0') > 0, `ssh-file:list result for ${remotePath}`, 45000);
  };

  await waitFor(() => document.querySelector('[data-testid="desktop-shell"]'), 'desktop shell');

  const api = window.sb;
  if (!api?.host || !api?.sshFile) {
    throw new Error('Switchboard API host and sshFile surfaces are required for the file browser smoke.');
  }

  const host = await api.host.create({
    name: params.hostName,
    address: '127.0.0.1',
    hostname: '127.0.0.1',
    port: 22,
    username: params.username,
    authMode: 'agent',
    tags: ['smoke', 'ssh-file-browser'],
    group: 'Smoke',
    osHint: 'linux',
    bootstrapStatus: 'not_started',
    defaultShell: '/bin/sh',
    defaultWorkingDirectory: params.remoteListPath,
    capabilities: ['ssh'],
    notes: 'Created by smoke-ssh-file-browser-ui to verify File Browser transfer routes.',
  });

  try {
    const quotedUploadDir = `'${params.remoteUploadDir.replace(/'/g, `'\\''`)}'`;
    const mkdirResult = await api.ssh.exec({
      hostId: host.id,
      command: `mkdir -p ${quotedUploadDir}`,
    });
    if (mkdirResult.status !== 'success') {
      throw new Error(`Unable to create remote upload directory: ${mkdirResult.error || mkdirResult.stderr}`);
    }

    click(document.querySelector('[data-testid="app-launcher-button"]'));
    const launcher = await waitFor(() => document.querySelector('[data-testid="app-launcher"]'), 'start menu');
    click(buttonByText(launcher, 'Host launcher'));
    const hostLauncherPanel = await waitFor(() => document.querySelector('[data-testid="host-launcher"]'), 'host launcher panel');
    const refreshButton = await waitForEnabledButtonByText(hostLauncherPanel, 'Refresh', 'host launcher refresh button');
    click(refreshButton);
    const hostRow = await waitForHostRow(hostLauncherPanel, params.hostName);
    rightClick(hostRow);
    await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="host"]'), 'host context menu');
    clickMenuItem('Open File Explorer');

    const fileWindow = await waitFor(
      () => [...document.querySelectorAll('.desktop-window[data-app-id="file-browser"]')]
        .find((candidate) => textIncludes(candidate, params.hostName)),
      'host-scoped File Browser window',
      30000,
    );
    const runtime = await waitFor(
      () => fileWindow.querySelector('[data-testid="host-operation-runtime"][data-operation-kind="files"]'),
      'File Browser runtime',
      30000,
    );

    await runFileList(runtime, params.remoteListPath);
    const initialActionPanel = await waitFor(() => runtime.querySelector('[data-testid="ssh-file-actions"]'), 'initial SSH file actions panel');
    const initialDisabledReasonText = initialActionPanel.querySelector('[data-testid="ssh-file-disabled-reasons"]')?.textContent || '';
    const rowCountBeforeDelete = Number(runtime.getAttribute('data-row-count') || '0');
    const packageRow = await waitFor(
      () => [...runtime.querySelectorAll('tr[data-remote-path]')]
        .find((row) => row.getAttribute('data-remote-path') === params.remotePackagePath),
      'package.json row',
      30000,
    );

    const actionPanel = await waitFor(() => runtime.querySelector('[data-testid="ssh-file-actions"]'), 'SSH file actions panel');
    const rowsBeforeKeyboard = [...runtime.querySelectorAll('tr[data-remote-path]')];
    const packageIndex = rowsBeforeKeyboard.indexOf(packageRow);
    if (packageIndex === -1) {
      throw new Error('package.json row was not part of the keyboard row set.');
    }
    packageRow.focus();
    const keyboardFocusPath = document.activeElement?.getAttribute('data-remote-path') || '';
    let keyboardNavigatedPath = '';
    let keyboardReturnedPath = '';
    if (rowsBeforeKeyboard.length > 1) {
      const direction = packageIndex < rowsBeforeKeyboard.length - 1 ? 1 : -1;
      const forwardKey = direction === 1 ? 'ArrowDown' : 'ArrowUp';
      const backKey = direction === 1 ? 'ArrowUp' : 'ArrowDown';
      const expectedRow = rowsBeforeKeyboard[packageIndex + direction];
      const expectedPath = expectedRow.getAttribute('data-remote-path') || '';
      keydown(packageRow, forwardKey);
      await waitFor(() => actionPanel.getAttribute('data-selected-path') === expectedPath
        && document.activeElement?.getAttribute('data-remote-path') === expectedPath, 'keyboard row navigation selected adjacent row');
      keyboardNavigatedPath = actionPanel.getAttribute('data-selected-path') || '';
      keydown(document.activeElement, backKey);
      await waitFor(() => actionPanel.getAttribute('data-selected-path') === params.remotePackagePath
        && document.activeElement?.getAttribute('data-remote-path') === params.remotePackagePath, 'keyboard row navigation returned to package row');
      keyboardReturnedPath = actionPanel.getAttribute('data-selected-path') || '';
    } else {
      keydown(packageRow, ' ');
      await waitFor(() => actionPanel.getAttribute('data-selected-path') === params.remotePackagePath, 'keyboard space selected package row');
      keyboardReturnedPath = actionPanel.getAttribute('data-selected-path') || '';
    }
    await waitFor(() => actionPanel.getAttribute('data-selected-path') === params.remotePackagePath, 'selected package.json path');

    const selectedDisabledReasonText = actionPanel.querySelector('[data-testid="ssh-file-disabled-reasons"]')?.textContent || '';
    keydown(packageRow, 'F10', { shiftKey: true });
    const statContextMenu = await waitFor(
      () => document.querySelector('[data-testid="context-menu"][data-context-target="ssh-file-object"]'),
      'keyboard-opened shared SSH file row context menu',
    );
    await waitFor(() => document.activeElement?.getAttribute('data-action-id') === 'stat', 'shared SSH file row context menu focuses stat action');
    const localMenuPresentAfterKeyboard = Boolean(document.querySelector('[data-testid="ssh-file-row-context-menu"]'));
    const statContextMenuReport = {
      sharedContextMenu: statContextMenu.getAttribute('data-testid') || '',
      contextTarget: statContextMenu.getAttribute('data-context-target') || '',
      targetPath: statContextMenu.getAttribute('data-target-path') || '',
      shellObjectKind: statContextMenu.getAttribute('data-shell-object-kind') || '',
      shellObjectOwner: statContextMenu.getAttribute('data-shell-object-owner') || '',
      shellObjectSource: statContextMenu.getAttribute('data-shell-object-source') || '',
      shellObjectTargetScope: statContextMenu.getAttribute('data-shell-object-target-scope') || '',
      shellObjectSourceAppId: statContextMenu.getAttribute('data-shell-object-source-app-id') || '',
      shellObjectWindowId: statContextMenu.getAttribute('data-shell-object-window-id') || '',
      contributionSurface: statContextMenu.getAttribute('data-context-contribution-surface') || '',
      shellObjectActionIds: statContextMenu.getAttribute('data-shell-object-action-ids') || '',
      shellObjectCapabilities: statContextMenu.getAttribute('data-shell-object-capabilities') || '',
      actionIds: [...statContextMenu.querySelectorAll('button')].map((button) => button.getAttribute('data-action-id') || ''),
      statActionSource: statContextMenu.querySelector('[data-action-id="stat"]')?.getAttribute('data-action-source') || '',
      statSourceWindowId: statContextMenu.querySelector('[data-action-id="stat"]')?.getAttribute('data-source-window-id') || '',
      targetScope: statContextMenu.querySelector('[data-action-id="stat"]')?.getAttribute('data-target-scope') || '',
      statRequiredCapabilities: statContextMenu.querySelector('[data-action-id="stat"]')?.getAttribute('data-required-capabilities') || '',
      statShortcut: statContextMenu.querySelector('[data-action-id="stat"]')?.getAttribute('data-shortcut') || '',
      focusedActionId: document.activeElement?.getAttribute('data-action-id') || '',
      localMenuPresent: localMenuPresentAfterKeyboard,
      disabledReasons: [...statContextMenu.querySelectorAll('button[disabled]')]
        .map((button) => button.getAttribute('data-disabled-reason') || '')
        .filter(Boolean),
    };
    keydown(document.activeElement, 'Escape');
    await waitFor(() => !document.querySelector('[data-testid="context-menu"]')
      && document.activeElement?.getAttribute('data-remote-path') === params.remotePackagePath, 'shared context menu Escape returns focus to row');
    const escapeFocusPath = document.activeElement?.getAttribute('data-remote-path') || '';
    keydown(document.activeElement, 'F10', { shiftKey: true });
    await waitFor(
      () => document.querySelector('[data-testid="context-menu"][data-context-target="ssh-file-object"]'),
      'keyboard-reopened shared SSH file row context menu',
    );
    clickFileMenuItem('Get info');
    await waitFor(() => actionPanel.getAttribute('data-stat-provider-route') === 'ssh-file:stat'
      && actionPanel.getAttribute('data-stat-status') === 'success', 'ssh-file:stat success', 45000);

    const packageRowForDeleteKey = [...runtime.querySelectorAll('tr[data-remote-path]')]
      .find((row) => row.getAttribute('data-remote-path') === params.remotePackagePath);
    packageRowForDeleteKey.focus();
    keydown(packageRowForDeleteKey, 'Delete');
    await waitFor(() => actionPanel.getAttribute('data-delete-confirmation') === 'pending'
      && (actionPanel.textContent || '').includes('Permanent delete pending for file'), 'keyboard Delete opens explicit delete confirmation');
    const keyboardDeleteConfirmation = {
      pending: actionPanel.getAttribute('data-delete-confirmation') || '',
      message: actionPanel.querySelector('[data-testid="ssh-file-action-message"]')?.textContent || '',
    };

    setInputValue(actionPanel.querySelector('[data-testid="ssh-file-download-local-path"]'), params.downloadTargetPath);
    click(actionPanel.querySelector('[data-testid="ssh-file-download-action"]'));
    await waitFor(() => actionPanel.getAttribute('data-download-provider-route') === 'ssh-file:download'
      && actionPanel.getAttribute('data-download-status') === 'success'
      && actionPanel.getAttribute('data-transfer-direction') === 'download', 'ssh-file:download success', 45000);

    setInputValue(actionPanel.querySelector('[data-testid="ssh-file-upload-local-path"]'), params.uploadSourcePath);
    setInputValue(actionPanel.querySelector('[data-testid="ssh-file-upload-remote-path"]'), params.remoteUploadPath);
    click(actionPanel.querySelector('[data-testid="ssh-file-upload-action"]'));
    await waitFor(() => actionPanel.getAttribute('data-upload-provider-route') === 'ssh-file:upload'
      && actionPanel.getAttribute('data-upload-status') === 'success'
      && actionPanel.getAttribute('data-transfer-direction') === 'upload', 'ssh-file:upload success', 45000);

    const transferStatusBeforeRelist = {
      statRoute: actionPanel.getAttribute('data-stat-provider-route') || '',
      statStatus: actionPanel.getAttribute('data-stat-status') || '',
      downloadRoute: actionPanel.getAttribute('data-download-provider-route') || '',
      downloadStatus: actionPanel.getAttribute('data-download-status') || '',
      uploadRoute: actionPanel.getAttribute('data-upload-provider-route') || '',
      uploadStatus: actionPanel.getAttribute('data-upload-status') || '',
      transferDirection: actionPanel.getAttribute('data-transfer-direction') || '',
      transferStatus: actionPanel.getAttribute('data-transfer-status') || '',
    };

    const uploadedStat = await api.sshFile.stat({
      hostId: host.id,
      path: params.remoteUploadPath,
    });
    const selectedPathBeforeMove = actionPanel.getAttribute('data-selected-path') || '';

    await runFileList(runtime, params.remoteUploadDir);
    const uploadedRow = await waitFor(
      () => [...runtime.querySelectorAll('tr[data-remote-path]')]
        .find((row) => row.getAttribute('data-remote-path') === params.remoteUploadPath),
      'uploaded file row for move',
      30000,
    );
    click(uploadedRow);
    const movePanel = await waitFor(() => runtime.querySelector('[data-testid="ssh-file-actions"]'), 'SSH file move action panel');
    await waitFor(() => movePanel.getAttribute('data-selected-path') === params.remoteUploadPath, 'uploaded file selected for move');
    setInputValue(movePanel.querySelector('[data-testid="ssh-file-move-target-path"]'), params.remoteMovedPath);
    rightClick(uploadedRow);
    const moveContextMenu = await waitFor(
      () => document.querySelector('[data-testid="context-menu"][data-context-target="ssh-file-object"]'),
      'right-click shared SSH file row context menu for move',
    );
    const localMenuPresentAfterRightClick = Boolean(document.querySelector('[data-testid="ssh-file-row-context-menu"]'));
    const moveContextMenuReport = {
      sharedContextMenu: moveContextMenu.getAttribute('data-testid') || '',
      contextTarget: moveContextMenu.getAttribute('data-context-target') || '',
      targetPath: moveContextMenu.getAttribute('data-target-path') || '',
      contributionSurface: moveContextMenu.getAttribute('data-context-contribution-surface') || '',
      moveActionSource: moveContextMenu.querySelector('[data-action-id="move"]')?.getAttribute('data-action-source') || '',
      moveSourceWindowId: moveContextMenu.querySelector('[data-action-id="move"]')?.getAttribute('data-source-window-id') || '',
      moveRequiredCapabilities: moveContextMenu.querySelector('[data-action-id="move"]')?.getAttribute('data-required-capabilities') || '',
      moveTargetScope: moveContextMenu.querySelector('[data-action-id="move"]')?.getAttribute('data-target-scope') || '',
      deleteDestructive: moveContextMenu.querySelector('[data-action-id="delete"]')?.classList.contains('is-danger') || false,
      localMenuPresent: localMenuPresentAfterRightClick,
    };
    clickFileMenuItem('Rename / Move');
    await waitFor(() => movePanel.getAttribute('data-move-provider-route') === 'ssh-file:move'
      && movePanel.getAttribute('data-move-status') === 'success'
      && movePanel.getAttribute('data-move-result-moved') === 'true'
      && movePanel.getAttribute('data-selected-path') === params.remoteMovedPath, 'ssh-file:move success', 45000);
    const moveStatusBeforeDelete = {
      selectedPathAfterMove: movePanel.getAttribute('data-selected-path') || '',
      moveRoute: movePanel.getAttribute('data-move-provider-route') || '',
      moveStatus: movePanel.getAttribute('data-move-status') || '',
      moveResultMoved: movePanel.getAttribute('data-move-result-moved') || '',
      moveTargetPath: movePanel.getAttribute('data-move-target-path') || '',
    };

    const sourceAfterMoveStat = await api.sshFile.stat({
      hostId: host.id,
      path: params.remoteUploadPath,
    });
    const targetAfterMoveStat = await api.sshFile.stat({
      hostId: host.id,
      path: params.remoteMovedPath,
    });
    const moveAuditEvents = await waitFor(async () => {
      const events = await api.audit.list();
      const routeAudit = events.find((event) => event.type === 'ssh_file.move_route_completed'
        && event.metadata?.contractId === 'ipc:ssh-file:move');
      const serviceAudit = events.find((event) => event.type === 'ssh.file_move_succeeded'
        && event.entityId === host.id);
      return routeAudit && serviceAudit ? events : null;
    }, 'move route and service audit records', 30000);
    const moveRouteAudit = moveAuditEvents.find((event) => event.type === 'ssh_file.move_route_completed'
      && event.metadata?.contractId === 'ipc:ssh-file:move');
    const moveServiceAudit = moveAuditEvents.find((event) => event.type === 'ssh.file_move_succeeded'
      && event.entityId === host.id);
    const moveAuditJson = JSON.stringify([moveRouteAudit, moveServiceAudit]);

    const deletePanel = await waitFor(() => runtime.querySelector('[data-testid="ssh-file-actions"]'), 'SSH file delete action panel');
    await waitFor(() => deletePanel.getAttribute('data-selected-path') === params.remoteMovedPath, 'moved file selected for delete');
    click(deletePanel.querySelector('[data-testid="ssh-file-delete-action"]'));
    await waitFor(() => deletePanel.getAttribute('data-delete-confirmation') === 'pending'
      && (deletePanel.textContent || '').includes('Permanent delete pending'), 'delete confirmation pending', 30000);
    click(deletePanel.querySelector('[data-testid="ssh-file-delete-action"]'));
    await waitFor(() => deletePanel.getAttribute('data-delete-provider-route') === 'ssh-file:delete'
      && deletePanel.getAttribute('data-delete-status') === 'success'
      && deletePanel.getAttribute('data-delete-result-deleted') === 'true', 'ssh-file:delete success', 45000);

    const deletedStat = await api.sshFile.stat({
      hostId: host.id,
      path: params.remoteMovedPath,
    });
    const auditEvents = await waitFor(async () => {
      const events = await api.audit.list();
      const routeAudit = events.find((event) => event.type === 'ssh_file.delete_route_completed'
        && event.metadata?.contractId === 'ipc:ssh-file:delete');
      const serviceAudit = events.find((event) => event.type === 'ssh.file_delete_succeeded'
        && event.entityId === host.id);
      return routeAudit && serviceAudit ? events : null;
    }, 'delete route and service audit records', 30000);
    const deleteRouteAudit = auditEvents.find((event) => event.type === 'ssh_file.delete_route_completed'
      && event.metadata?.contractId === 'ipc:ssh-file:delete');
    const deleteServiceAudit = auditEvents.find((event) => event.type === 'ssh.file_delete_succeeded'
      && event.entityId === host.id);
    const deleteAuditJson = JSON.stringify([deleteRouteAudit, deleteServiceAudit]);

    return {
      hostId: host.id,
      providerRoute: runtime.getAttribute('data-provider-route') || '',
      selectedPath: selectedPathBeforeMove,
      selectedPathAfterMove: moveStatusBeforeDelete.selectedPathAfterMove,
      selectedPathAfterDelete: deletePanel.getAttribute('data-selected-path') || '',
      statRoute: transferStatusBeforeRelist.statRoute,
      statStatus: transferStatusBeforeRelist.statStatus,
      downloadRoute: transferStatusBeforeRelist.downloadRoute,
      uploadRoute: transferStatusBeforeRelist.uploadRoute,
      moveRoute: moveStatusBeforeDelete.moveRoute,
      moveStatus: moveStatusBeforeDelete.moveStatus,
      moveResultMoved: moveStatusBeforeDelete.moveResultMoved,
      moveTargetPath: moveStatusBeforeDelete.moveTargetPath,
      deleteRoute: deletePanel.getAttribute('data-delete-provider-route') || '',
      deleteStatus: deletePanel.getAttribute('data-delete-status') || '',
      deleteResultDeleted: deletePanel.getAttribute('data-delete-result-deleted') || '',
      uploadedStatStatus: uploadedStat.status,
      uploadedStatPath: uploadedStat.entry?.path || '',
      sourceAfterMoveStatStatus: sourceAfterMoveStat.status,
      sourceAfterMoveEntryFound: Boolean(sourceAfterMoveStat.entry),
      targetAfterMoveStatStatus: targetAfterMoveStat.status,
      targetAfterMoveStatPath: targetAfterMoveStat.entry?.path || '',
      deletedStatStatus: deletedStat.status,
      deletedStatEntryFound: Boolean(deletedStat.entry),
      moveRouteAuditPresent: Boolean(moveRouteAudit),
      moveServiceAuditPresent: Boolean(moveServiceAudit),
      moveAuditSourcePathLogged: moveRouteAudit?.metadata?.sourcePathLogged,
      moveAuditTargetPathLogged: moveRouteAudit?.metadata?.targetPathLogged,
      moveAuditSourcePathHashType: typeof moveRouteAudit?.metadata?.sourcePathHash,
      moveAuditTargetPathHashType: typeof moveRouteAudit?.metadata?.targetPathHash,
      moveAuditIncludesSourcePath: moveAuditJson.includes(params.remoteUploadPath),
      moveAuditIncludesTargetPath: moveAuditJson.includes(params.remoteMovedPath),
      deleteRouteAuditPresent: Boolean(deleteRouteAudit),
      deleteServiceAuditPresent: Boolean(deleteServiceAudit),
      deleteAuditRemotePathLogged: deleteRouteAudit?.metadata?.remotePathLogged,
      deleteAuditPathHashType: typeof deleteRouteAudit?.metadata?.pathHash,
      deleteAuditIncludesRemotePath: deleteAuditJson.includes(params.remoteMovedPath),
      transferStatusBeforeRelist,
      actionText: deletePanel.textContent || '',
      initialDisabledReasonText,
      selectedDisabledReasonText,
      keyboardFocusPath,
      keyboardNavigatedPath,
      keyboardReturnedPath,
      statContextMenuReport,
      escapeFocusPath,
      keyboardDeleteConfirmation,
      moveContextMenuReport,
      rowCount: rowCountBeforeDelete,
      fileWindowTitle: fileWindow.querySelector('.window-title')?.textContent?.trim() || '',
    };
  } finally {
    await api.sshFile.delete({ hostId: host.id, path: params.remoteUploadDir, recursive: true }).catch(() => null);
    await api.host.remove(host.id).catch(() => false);
  }
}

async function main() {
  const page = await waitForRendererPage();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const report = await cdp.evaluate(`(${browserSmoke.toString()})(${JSON.stringify({
      hostName: `Smoke SSH File Browser Host ${runId}`,
      username: process.env.USER || 'agent',
      remoteListPath: repoRoot,
      remotePackagePath: join(repoRoot, 'package.json'),
      uploadSourcePath,
      downloadTargetPath,
      remoteUploadPath,
      remoteMovedPath,
      remoteUploadDir,
    })})`);

    assert.equal(report.providerRoute, 'ssh-file:list', 'File Browser uses ssh-file:list route marker');
    assert.equal(report.selectedPath, join(repoRoot, 'package.json'), 'selected remote package row remains selected after transfer actions');
    assert.equal(report.initialDisabledReasonText.includes('Select a remote file or folder first'), true, 'File Browser shows visible disabled reasons before row selection');
    assert.equal(report.selectedDisabledReasonText.includes('Enter folder is available after selecting a folder'), true, 'File Browser shows file-specific disabled reason for folder-only action');
    assert.equal(report.keyboardFocusPath, join(repoRoot, 'package.json'), 'File Browser row accepts keyboard focus');
    assert.equal(report.keyboardReturnedPath, join(repoRoot, 'package.json'), 'File Browser keyboard path returns selection to package row');
    assert.equal(Boolean(report.keyboardNavigatedPath) || report.keyboardReturnedPath === join(repoRoot, 'package.json'), true, 'File Browser keyboard navigation path selected a row');
    assert.equal(report.statContextMenuReport.sharedContextMenu, 'context-menu', 'File Browser keyboard context menu uses shared shell context menu');
    assert.equal(report.statContextMenuReport.contextTarget, 'ssh-file-object', 'File Browser keyboard context menu declares SSH file object target');
    assert.equal(report.statContextMenuReport.targetPath, join(repoRoot, 'package.json'), 'File Browser keyboard context menu targets selected file object');
    assert.equal(report.statContextMenuReport.shellObjectKind, 'ssh-file-object', 'File Browser shared context menu declares file object kind');
    assert.equal(report.statContextMenuReport.shellObjectOwner, 'file-browser', 'File Browser shared context menu declares object owner');
    assert.equal(report.statContextMenuReport.shellObjectSource, 'ssh-file-provider', 'File Browser shared context menu declares provider source');
    assert.equal(report.statContextMenuReport.shellObjectTargetScope, 'ssh-file-row', 'File Browser shared context menu declares row target scope');
    assert.equal(report.statContextMenuReport.shellObjectSourceAppId, 'file-browser', 'File Browser shared context menu declares source app id');
    assert.equal(report.statContextMenuReport.contributionSurface, 'applet-element', 'File Browser shared context menu uses generic applet element contribution surface');
    assert.equal(report.statContextMenuReport.shellObjectWindowId.startsWith('window-'), true, 'File Browser shared context menu declares source shell window id');
    assert.equal(report.statContextMenuReport.shellObjectActionIds.includes('stat'), true, 'File Browser shared context menu object action ids include stat');
    assert.equal(report.statContextMenuReport.shellObjectCapabilities.includes('host:file:read'), true, 'File Browser shared context menu object capabilities include read');
    assert.equal(report.statContextMenuReport.actionIds.includes('stat'), true, 'File Browser context menu exposes stat object action');
    assert.equal(report.statContextMenuReport.statActionSource, 'ssh-file-provider', 'File Browser stat context action declares provider source');
    assert.equal(report.statContextMenuReport.statSourceWindowId, report.statContextMenuReport.shellObjectWindowId, 'File Browser stat context action declares source window id');
    assert.equal(report.statContextMenuReport.targetScope, 'ssh-file-row', 'File Browser stat context action declares row target scope');
    assert.equal(report.statContextMenuReport.statRequiredCapabilities, 'host:file:read', 'File Browser stat context action declares read capability');
    assert.equal(report.statContextMenuReport.statShortcut, 'Ctrl+I', 'File Browser stat context action declares shortcut');
    assert.equal(report.statContextMenuReport.focusedActionId, 'stat', 'File Browser shared context menu focuses first enabled row action');
    assert.equal(report.statContextMenuReport.localMenuPresent, false, 'File Browser keyboard context menu did not render the component-local menu');
    assert.equal(report.statContextMenuReport.disabledReasons.includes('Enter folder is available after selecting a folder.'), true, 'File Browser shared context menu exposes disabled reason');
    assert.equal(report.escapeFocusPath, join(repoRoot, 'package.json'), 'File Browser shared context menu Escape returns focus to row');
    assert.equal(report.keyboardDeleteConfirmation.pending, 'pending', 'File Browser keyboard Delete opens explicit delete confirmation');
    assert.equal(report.keyboardDeleteConfirmation.message.includes('Permanent delete pending for file'), true, 'File Browser keyboard Delete confirmation is visible');
    assert.equal(report.statRoute, 'ssh-file:stat', 'File Browser stat action used ssh-file:stat route');
    assert.equal(report.statStatus, 'success', 'File Browser stat action succeeded');
    assert.equal(report.downloadRoute, 'ssh-file:download', 'File Browser download action used ssh-file:download route');
    assert.equal(report.uploadRoute, 'ssh-file:upload', 'File Browser upload action used ssh-file:upload route');
    assert.equal(report.moveContextMenuReport.sharedContextMenu, 'context-menu', 'File Browser right-click context menu uses shared shell context menu');
    assert.equal(report.moveContextMenuReport.contextTarget, 'ssh-file-object', 'File Browser right-click context menu declares SSH file object target');
    assert.equal(report.moveContextMenuReport.targetPath, remoteUploadPath, 'File Browser move context menu targets uploaded file object');
    assert.equal(report.moveContextMenuReport.contributionSurface, 'applet-element', 'File Browser move context menu uses generic applet element contribution surface');
    assert.equal(report.moveContextMenuReport.moveActionSource, 'ssh-file-provider', 'File Browser move context action declares provider source');
    assert.equal(report.moveContextMenuReport.moveSourceWindowId.startsWith('window-'), true, 'File Browser move context action declares source window id');
    assert.equal(report.moveContextMenuReport.moveRequiredCapabilities, 'host:file:write', 'File Browser move context action declares write capability');
    assert.equal(report.moveContextMenuReport.moveTargetScope, 'ssh-file-row', 'File Browser move context action declares row target scope');
    assert.equal(report.moveContextMenuReport.deleteDestructive, true, 'File Browser shared context menu preserves destructive styling');
    assert.equal(report.moveContextMenuReport.localMenuPresent, false, 'File Browser right-click context menu did not render the component-local menu');
    assert.equal(report.moveRoute, 'ssh-file:move', 'File Browser move action used ssh-file:move route');
    assert.equal(report.moveStatus, 'success', 'File Browser move action succeeded');
    assert.equal(report.moveResultMoved, 'true', 'File Browser move result reports moved');
    assert.equal(report.moveTargetPath, remoteMovedPath, 'File Browser move target path is retained for retry/recovery context');
    assert.equal(report.deleteRoute, 'ssh-file:delete', 'File Browser delete action used ssh-file:delete route');
    assert.equal(report.deleteStatus, 'success', 'File Browser delete action succeeded');
    assert.equal(report.deleteResultDeleted, 'true', 'File Browser delete result reports deleted');
    assert.equal(report.transferStatusBeforeRelist.downloadStatus, 'success', 'File Browser download action succeeded');
    assert.equal(report.transferStatusBeforeRelist.uploadStatus, 'success', 'File Browser upload action succeeded');
    assert.equal(report.transferStatusBeforeRelist.transferDirection, 'upload', 'last File Browser transfer direction is upload');
    assert.equal(report.transferStatusBeforeRelist.transferStatus, 'success', 'last File Browser transfer status is success');
    assert.equal(report.uploadedStatStatus, 'success', 'uploaded file exists after File Browser upload');
    assert.equal(report.uploadedStatPath, remoteUploadPath, 'uploaded file stat returns the uploaded remote path');
    assert.equal(report.selectedPathAfterMove, remoteMovedPath, 'File Browser selects moved target object after move');
    assert.equal(report.sourceAfterMoveStatStatus, 'failed', 'source path stat fails after File Browser move');
    assert.equal(report.sourceAfterMoveEntryFound, false, 'source path has no stat entry after File Browser move');
    assert.equal(report.targetAfterMoveStatStatus, 'success', 'target path stat succeeds after File Browser move');
    assert.equal(report.targetAfterMoveStatPath, remoteMovedPath, 'target path stat returns moved remote path');
    assert.equal(report.deletedStatStatus, 'failed', 'deleted file stat fails after File Browser delete');
    assert.equal(report.deletedStatEntryFound, false, 'deleted file stat has no entry');
    assert.equal(report.selectedPathAfterDelete, '', 'File Browser clears selected object after delete');
    assert.equal(report.actionText.includes('Deleted'), true, 'File Browser shows object-local delete status');
    assert.equal(report.moveRouteAuditPresent, true, 'move route audit is present');
    assert.equal(report.moveServiceAuditPresent, true, 'move service audit is present');
    assert.equal(report.moveAuditSourcePathLogged, false, 'move route audit marks source path as not logged');
    assert.equal(report.moveAuditTargetPathLogged, false, 'move route audit marks target path as not logged');
    assert.equal(report.moveAuditSourcePathHashType, 'string', 'move route audit records a source path hash');
    assert.equal(report.moveAuditTargetPathHashType, 'string', 'move route audit records a target path hash');
    assert.equal(report.moveAuditIncludesSourcePath, false, 'move audit does not include the source path');
    assert.equal(report.moveAuditIncludesTargetPath, false, 'move audit does not include the target path');
    assert.equal(report.deleteRouteAuditPresent, true, 'delete route audit is present');
    assert.equal(report.deleteServiceAuditPresent, true, 'delete service audit is present');
    assert.equal(report.deleteAuditRemotePathLogged, false, 'delete route audit marks remote path as not logged');
    assert.equal(report.deleteAuditPathHashType, 'string', 'delete route audit records a path hash');
    assert.equal(report.deleteAuditIncludesRemotePath, false, 'delete audit does not include the remote target path');
    assert.ok(report.rowCount > 0, 'File Browser listing has visible rows');
    assert.equal(existsSync(downloadTargetPath), true, 'download target exists on local filesystem after backend download');
    assert.equal(readFileSync(downloadTargetPath, 'utf8').includes('"scripts"'), true, 'download target contains package.json content');

    console.log(JSON.stringify({
      status: 'ssh file browser UI smoke passed',
      report,
      downloadTargetPath,
      uploadSourcePath,
      remoteUploadPath,
      remoteMovedPath,
      remoteUploadDir,
    }, null, 2));
  } finally {
    cdp.close();
    cleanup();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  console.error(electronOutput);
  process.exit(1);
});
