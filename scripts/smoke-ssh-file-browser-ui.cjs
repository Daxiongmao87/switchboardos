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
  const buttonByText = (root, text) => [...(root?.querySelectorAll('button') || [])]
    .find((button) => textIncludes(button, text));
  const clickMenuItem = (text) => click([...document.querySelectorAll('[data-testid="context-menu"] button')]
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
    const rowCountBeforeDelete = Number(runtime.getAttribute('data-row-count') || '0');
    const packageRow = await waitFor(
      () => [...runtime.querySelectorAll('tr[data-remote-path]')]
        .find((row) => row.getAttribute('data-remote-path') === params.remotePackagePath),
      'package.json row',
      30000,
    );
    click(packageRow);

    const actionPanel = await waitFor(() => runtime.querySelector('[data-testid="ssh-file-actions"]'), 'SSH file actions panel');
    await waitFor(() => actionPanel.getAttribute('data-selected-path') === params.remotePackagePath, 'selected package.json path');

    click(actionPanel.querySelector('[data-testid="ssh-file-stat-action"]'));
    await waitFor(() => actionPanel.getAttribute('data-stat-provider-route') === 'ssh-file:stat'
      && actionPanel.getAttribute('data-stat-status') === 'success', 'ssh-file:stat success', 45000);

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
    click(movePanel.querySelector('[data-testid="ssh-file-move-action"]'));
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
    assert.equal(report.statRoute, 'ssh-file:stat', 'File Browser stat action used ssh-file:stat route');
    assert.equal(report.statStatus, 'success', 'File Browser stat action succeeded');
    assert.equal(report.downloadRoute, 'ssh-file:download', 'File Browser download action used ssh-file:download route');
    assert.equal(report.uploadRoute, 'ssh-file:upload', 'File Browser upload action used ssh-file:upload route');
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
