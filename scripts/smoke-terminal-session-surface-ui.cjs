#!/usr/bin/env node
// Rendered Electron smoke for the Terminal session object state/action surface.

const assert = require('assert');
const { spawn } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const { get } = require('http');
const { tmpdir } = require('os');
const { join } = require('path');

if (typeof WebSocket !== 'function') {
  console.error('This smoke requires Node with global WebSocket support. Use the repo Node 24 runtime.');
  process.exit(2);
}

const repoRoot = join(__dirname, '..');
const electronBin = join(repoRoot, 'node_modules', '.bin', 'electron');
const port = 11800 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-terminal-session-'));
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
        clearTimeout(pending.timeout);
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

async function waitForShellApi(cdp) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = await cdp.evaluate(`Boolean(
      window.sb
      && window.sb.host
      && window.sb.audit
      && window.sb.terminal
    )`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose terminal dependencies.\n${electronOutput}`);
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
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (predicate, label, timeout = 60000) => {
        const deadline = Date.now() + timeout;
        let lastError = '';
        while (Date.now() < deadline) {
          try {
            const value = await predicate();
            if (value) return value;
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
          }
          await sleep(100);
        }
        throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError : ''));
      };
      const click = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const rightClick = (element) => element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: 120,
        clientY: 120,
      }));
      const byTestId = (testId, root = document) => root.querySelector('[data-testid="' + String(testId).replace(/"/g, '\\\\"') + '"]');
      const text = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim();
      const textIncludes = (node, expected) => text(node).includes(expected);
      const buttonByText = (root, expected) => [...root.querySelectorAll('button')]
        .find((button) => textIncludes(button, expected));
      const waitForEnabledButtonByText = (root, expected, label) => waitFor(() => {
        const button = buttonByText(root, expected);
        if (!button || button.disabled) {
          return null;
        }
        return button;
      }, label);
      const menuLabels = () => [...document.querySelectorAll('[data-testid="context-menu"] button')]
        .map((button) => text(button))
        .filter(Boolean);
      const clickMenuItem = (expected) => {
        const button = [...document.querySelectorAll('[data-testid="context-menu"] button')]
          .find((candidate) => textIncludes(candidate, expected));
        if (!button) {
          throw new Error('Menu item not found: ' + expected + ' in ' + JSON.stringify(menuLabels()));
        }
        click(button);
      };
      const waitForSeededHostRow = async (hostLauncherPanel, hostName, timeout = 20000) => {
        const started = Date.now();
        let snapshot = { hostLauncherText: '', visibleRows: [] };
        while (Date.now() - started < timeout) {
          const rows = [...hostLauncherPanel.querySelectorAll('.host-row')];
          const visibleRows = rows.map((row) => text(row)).filter(Boolean);
          snapshot = {
            hostLauncherText: text(hostLauncherPanel),
            visibleRows,
          };
          const found = rows.find((row) => textIncludes(row, hostName));
          if (found) {
            return found;
          }
          await sleep(100);
        }
        throw new Error('Timed out waiting for host row: ' + JSON.stringify(snapshot));
      };
      const rootState = (root) => ({
        objectId: root.getAttribute('data-terminal-object-id'),
        hostContextId: root.getAttribute('data-host-context-id'),
        selectedHostId: root.getAttribute('data-selected-host-id'),
        activeSessionId: root.getAttribute('data-active-session-id'),
        sshTarget: root.getAttribute('data-terminal-ssh-target'),
        workingDirectory: text(byTestId('terminal-working-directory', root)),
        workingDirectoryState: root.getAttribute('data-terminal-working-directory-state'),
        defaultShell: text(byTestId('terminal-default-shell', root)),
        reachability: text(byTestId('terminal-reachability', root)),
        connectionState: text(byTestId('terminal-connection-state', root)),
        lifecycle: text(byTestId('terminal-lifecycle-state', root)),
        size: text(byTestId('terminal-size-state', root)),
        lastEvent: text(byTestId('terminal-last-event-state', root)),
        recentAudit: text(byTestId('terminal-recent-audit-state', root)),
        actionIds: (root.getAttribute('data-terminal-action-ids') || '').split(',').filter(Boolean),
        lastAction: root.getAttribute('data-terminal-last-action'),
        auditSafe: root.getAttribute('data-terminal-audit-safe'),
        localStorage: root.getAttribute('data-terminal-local-storage'),
      });
      const actionState = (root) => {
        const actionIds = ['copy', 'paste', 'clear', 'disconnect', 'reconnect', 'resize', 'audit'];
        return Object.fromEntries(actionIds.map((id) => {
          const button = byTestId('terminal-action-' + id, root);
          return [id, {
            exists: Boolean(button),
            disabled: Boolean(button?.disabled),
            reason: button?.getAttribute('data-disabled-reason') || '',
            title: button?.getAttribute('title') || '',
          }];
        }));
      };

      window.__terminalSemanticEvents = [];
      window.addEventListener('switchboard-terminal-semantic', (event) => {
        window.__terminalSemanticEvents.push(event.detail?.semanticState || null);
      });

      await waitFor(() => byTestId('desktop-shell'), 'desktop shell');
      await sleep(800);
      const host = await window.sb.host.create({
        name: 'Terminal Object Smoke Host',
        address: '203.0.113.1',
        hostname: '203.0.113.1',
        port: 22,
        username: 'smoke',
        authMode: 'agent',
        tags: ['terminal-session-surface-smoke'],
        group: 'Smoke',
        osHint: 'linux',
        bootstrapStatus: 'not_started',
        defaultShell: '/bin/bash',
        defaultWorkingDirectory: '/srv/terminal-smoke',
        capabilities: ['ssh'],
        notes: 'Terminal session object rendered smoke target.',
      });

      click(byTestId('app-launcher-button'));
      const launcher = await waitFor(() => byTestId('app-launcher'), 'app launcher');
      click(buttonByText(launcher, 'Host launcher'));
      const hostLauncherPanel = await waitFor(() => byTestId('host-launcher'), 'host launcher panel');
      const refreshButton = await waitForEnabledButtonByText(hostLauncherPanel, 'Refresh', 'enabled host launcher refresh');
      click(refreshButton);
      const hostRow = await waitForSeededHostRow(hostLauncherPanel, host.name, 20000);
      rightClick(hostRow);
      await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="host"]'), 'host context menu');
      clickMenuItem('Open Terminal');

      const terminalWindow = await waitFor(
        () => document.querySelector('.desktop-window[data-app-id="host-terminal"]'),
        'host terminal window',
      );
      const terminalContextTarget = await waitFor(
        () => terminalWindow.querySelector('.host-terminal-window'),
        'terminal context target',
      );
      const root = await waitFor(() => byTestId('terminal-runtime', terminalWindow), 'terminal runtime root');
      await waitFor(
        () => {
          const snapshot = rootState(root);
          if (snapshot.selectedHostId === host.id && snapshot.workingDirectory === '/srv/terminal-smoke') {
            return snapshot;
          }
          throw new Error(JSON.stringify(snapshot));
        },
        'selected terminal host state',
      );

      const initialState = rootState(root);
      const initialActions = actionState(root);
      rightClick(terminalContextTarget);
      await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="terminal"]'), 'terminal context menu');
      const contextMenuLabels = menuLabels();
      clickMenuItem('Copy');
      await waitFor(
        () => text(byTestId('terminal-action-status', root)).includes('Copy'),
        'terminal context menu copy dispatch',
      );
      const contextCopyStatus = text(byTestId('terminal-action-status', root));

      rightClick(terminalContextTarget);
      await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="terminal"]'), 'terminal context menu for clear');
      clickMenuItem('Clear');
      await waitFor(
        () => text(byTestId('terminal-action-status', root)).includes('Cleared terminal view.'),
        'terminal context menu clear dispatch',
      );
      const contextClearStatus = text(byTestId('terminal-action-status', root));

      click(byTestId('terminal-action-audit', root));
      await waitFor(
        () => !text(byTestId('terminal-audit-state', root)).includes('Audit state has not been loaded.'),
        'manual audit refresh before session',
      );
      const preStartAuditText = text(byTestId('terminal-audit-state', root));

      click(byTestId('terminal-start-session', root));
      await waitFor(
        () => root.getAttribute('data-active-session-id') || text(byTestId('terminal-lifecycle-state', root)).includes('failed'),
        'terminal session start or failure state',
        15000,
      );
      const afterStartState = rootState(root);
      const afterStartActions = actionState(root);
      const activeSessionId = root.getAttribute('data-active-session-id');

      let resizeStatus = '';
      let afterResizeState = afterStartState;
      if (activeSessionId && !byTestId('terminal-action-resize', root).disabled) {
        click(byTestId('terminal-action-resize', root));
        await waitFor(
          () => /Resize|Backend size|Unable to sync/.test(text(byTestId('terminal-action-status', root)))
            || /Backend size|Unable to sync/.test(text(byTestId('terminal-size-state', root))),
          'resize action status',
        );
        resizeStatus = text(byTestId('terminal-action-status', root)) + ' ' + text(byTestId('terminal-size-state', root));
        afterResizeState = rootState(root);
      }

      let contextPasteStatus = '';
      if (activeSessionId) {
        rightClick(terminalContextTarget);
        await waitFor(() => document.querySelector('[data-testid="context-menu"][data-context-target="terminal"]'), 'terminal context menu for paste');
        clickMenuItem('Paste');
        await waitFor(
          () => /Paste|Clipboard/.test(text(byTestId('terminal-action-status', root))),
          'terminal context menu paste dispatch',
        );
        contextPasteStatus = text(byTestId('terminal-action-status', root));
      }

      click(byTestId('terminal-action-audit', root));
      const auditEntries = await waitFor(
        () => {
          const entries = [...root.querySelectorAll('[data-testid="terminal-audit-entry"]')].map((entry) => ({
            type: entry.getAttribute('data-audit-type') || '',
            sessionId: entry.getAttribute('data-audit-session-id') || '',
            hostId: entry.getAttribute('data-audit-host-id') || '',
            safe: entry.getAttribute('data-audit-safe') || '',
            text: text(entry),
          }));
          return entries.length > 0 ? entries : null;
        },
        'terminal audit entries',
        15000,
      );
      const auditPanelText = text(byTestId('terminal-audit-state', root));

      if (activeSessionId && !byTestId('terminal-action-disconnect', root).disabled) {
        click(byTestId('terminal-action-disconnect', root));
        await waitFor(
          () => text(byTestId('terminal-action-status', root)).includes('stop requested')
            || text(byTestId('terminal-action-status', root)).includes('stopped')
            || text(byTestId('terminal-lifecycle-state', root)).includes('stopping'),
          'disconnect action status',
        );
      }
      const afterDisconnectState = rootState(root);
      const afterDisconnectActions = actionState(root);

      const semanticEvents = window.__terminalSemanticEvents.filter(Boolean);
      const semanticState = semanticEvents[semanticEvents.length - 1] || null;
      const localStorageTerminalKeys = Object.keys(localStorage).filter((key) => /terminal/i.test(key));
      const localStorageSessionValueHits = Object.keys(localStorage).filter((key) => {
        const value = localStorage.getItem(key) || '';
        return activeSessionId ? value.includes(activeSessionId) : false;
      });

      return {
        hostId: host.id,
        initialState,
        initialActions,
        contextMenuLabels,
        contextCopyStatus,
        contextClearStatus,
        contextPasteStatus,
        preStartAuditText,
        afterStartState,
        afterStartActions,
        resizeStatus,
        afterResizeState,
        auditEntries,
        auditPanelText,
        afterDisconnectState,
        afterDisconnectActions,
        semanticState,
        semanticEventsCount: semanticEvents.length,
        localStorageTerminalKeys,
        localStorageSessionValueHits,
      };
    })()`);

    const requiredActions = ['copy', 'paste', 'clear', 'disconnect', 'reconnect', 'resize', 'audit'];
    assert.equal(report.initialState.hostContextId, report.hostId, 'Terminal opens with host context locked to selected host.');
    assert.equal(report.initialState.selectedHostId, report.hostId, 'Terminal selected host matches host action target.');
    assert.equal(report.initialState.sshTarget, 'smoke@203.0.113.1:22', 'Terminal shows SSH target.');
    assert.equal(report.initialState.workingDirectory, '/srv/terminal-smoke', 'Terminal shows configured working directory.');
    assert.equal(report.initialState.workingDirectoryState, 'configured', 'Terminal working directory state is configured.');
    assert.equal(report.initialState.defaultShell, '/bin/bash', 'Terminal shows configured shell.');
    assert.equal(report.initialState.auditSafe, 'true', 'Terminal root marks audit display as sanitized.');
    assert.equal(report.initialState.localStorage, 'none', 'Terminal root declares no localStorage session persistence.');
    assert.deepEqual(report.initialState.actionIds, requiredActions, 'Terminal root exposes expected action IDs.');
    for (const actionId of requiredActions) {
      assert.equal(report.initialActions[actionId].exists, true, `Visible ${actionId} action exists.`);
    }
    assert.equal(report.initialActions.paste.disabled, true, 'Paste is disabled before a session starts.');
    assert.equal(report.initialActions.disconnect.disabled, true, 'Disconnect is disabled before a session starts.');
    assert.equal(report.initialActions.resize.disabled, true, 'Resize is disabled before a session starts.');
    assert.equal(report.initialActions.reconnect.disabled, false, 'Reconnect/start action is enabled for the selected host.');
    assert.equal(report.contextMenuLabels.some((label) => label.includes('Copy')), true, 'Terminal context menu includes Copy.');
    assert.equal(report.contextMenuLabels.some((label) => label.includes('Paste')), true, 'Terminal context menu includes Paste.');
    assert.equal(report.contextMenuLabels.some((label) => label.includes('Clear')), true, 'Terminal context menu includes Clear.');
    assert.equal(report.contextCopyStatus.includes('Copy'), true, 'Context menu Copy dispatches to terminal component action status.');
    assert.equal(report.contextClearStatus.includes('Cleared terminal view.'), true, 'Context menu Clear dispatches to terminal component action status.');
    assert.notEqual(report.afterStartState.activeSessionId || report.afterStartState.lifecycle.includes('failed'), false, 'Start session reaches active or explicit failure state.');
    if (report.afterStartState.activeSessionId) {
      assert.equal(report.contextPasteStatus.length > 0, true, 'Context menu Paste dispatches to terminal component action status.');
      assert.equal(report.afterStartActions.disconnect.disabled, false, 'Disconnect is enabled for an active session.');
      assert.equal(report.afterStartActions.resize.disabled, false, 'Resize is enabled for an active session.');
      assert.equal(report.afterResizeState.size.length > 0, true, 'Resize state remains visible after resize action.');
    }
    assert.equal(report.auditEntries.some((entry) => entry.type.startsWith('terminal.')), true, 'Audit refresh displays terminal lifecycle events.');
    assert.equal(report.auditEntries.every((entry) => entry.safe === 'true'), true, 'Audit entries declare sanitized terminal audit state.');
    assert.equal(report.auditPanelText.includes('MVP terminal uses system ssh'), false, 'Audit panel does not render raw terminal output.');
    assert.equal(report.auditPanelText.includes('Starting ssh session to'), false, 'Audit panel does not render terminal session output text.');
    assert.equal(report.localStorageTerminalKeys.length, 0, 'Terminal session state does not create terminal localStorage keys.');
    assert.equal(report.localStorageSessionValueHits.length, 0, 'Terminal session id is not persisted in localStorage values.');
    assert.equal(report.semanticEventsCount > 0, true, 'Terminal emits semantic state events.');
    assert.equal(report.semanticState.kind, 'terminal', 'Semantic state kind is terminal.');
    assert.equal(report.semanticState.metadata.objectKind, 'terminal-session', 'Semantic metadata identifies terminal session object.');
    assert.equal(report.semanticState.metadata.hostId, report.hostId, 'Semantic metadata includes host id.');
    assert.equal(report.semanticState.metadata.sshTarget, 'smoke@203.0.113.1:22', 'Semantic metadata includes SSH target.');
    assert.equal(report.semanticState.metadata.remoteWorkingDirectory, '/srv/terminal-smoke', 'Semantic metadata includes working directory.');
    assert.deepEqual(report.semanticState.metadata.actionIds, requiredActions, 'Semantic metadata includes expected action IDs.');
    assert.equal(report.semanticState.metadata.auditSafe, true, 'Semantic metadata records audit-safe display.');
    assert.equal(report.semanticState.metadata.terminalInputStored, false, 'Semantic metadata records no terminal input persistence.');
    assert.equal(report.semanticState.metadata.terminalOutputStored, false, 'Semantic metadata records no terminal output persistence.');

    console.log(JSON.stringify({
      ok: true,
      hostId: report.hostId,
      actionIds: report.initialState.actionIds,
      auditTypes: report.auditEntries.map((entry) => entry.type),
      semanticStatus: report.semanticState.status,
    }, null, 2));
  } finally {
    cdp.close();
    await shutdownElectron();
  }
}

main().catch(async (error) => {
  await shutdownElectron();
  console.error(error);
  if (electronOutput) {
    console.error(electronOutput);
  }
  process.exit(1);
});
