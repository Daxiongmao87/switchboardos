#!/usr/bin/env node
// Rendered Electron smoke for File Explorer .sbscriptlet.json artifact run actions.

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
const port = 11000 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-file-explorer-scriptlet-'));
const screenshotPath = join(tmpdir(), 'switchboardos-file-explorer-scriptlet-smoke.png');
const electronUserDataDir = join(configDir, 'electron-user-data');
const rawScriptMarker = 'SCRIPTLET_RAW_MARKER_SHOULD_NOT_BE_AUDITED';
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
      && window.sb.settings
      && window.sb.audit
    )`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose File Explorer scriptlet dependencies.\n${electronOutput}`);
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
      const rawScriptMarker = ${JSON.stringify(rawScriptMarker)};
      const scriptletHostId = 'missing-host-scriptlet-smoke';
      const scriptletManifest = {
        schemaVersion: 1,
        kind: 'scriptlet',
        name: 'File Explorer Scriptlet Smoke',
        description: 'Scriptlet artifact run from File Explorer.',
        hostId: scriptletHostId,
        capabilities: ['ssh:exec'],
        command: 'printf ' + JSON.stringify(rawScriptMarker),
        source: {
          language: 'shell',
          code: 'printf ' + JSON.stringify(rawScriptMarker),
        },
        provenance: {
          generatedBy: 'file-explorer-scriptlet-smoke',
          sourceLogged: false,
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
      const newScriptletButton = await waitFor(
        () => [...fileWindow.querySelectorAll('button')]
          .find((button) => textIncludes(button, 'New Scriptlet')) || null,
        'New Scriptlet button',
      );
      click(newScriptletButton);
      const artifactEntry = await waitFor(async () => {
        const entries = await window.sb.workspaceFile.list('');
        return entries.find((entry) => entry.kind === 'scriptlet' && entry.path?.endsWith('.sbscriptlet.json')) || null;
      }, 'created workspace scriptlet artifact');
      const updatedArtifact = await window.sb.workspaceArtifactContent.update(
        artifactEntry.path,
        JSON.stringify(scriptletManifest, null, 2),
      );
      const artifactReadback = await window.sb.workspaceArtifactContent.get(artifactEntry.path);
      const artifactRow = await waitFor(
        () => [...fileWindow.querySelectorAll('.workspace-file-item')]
          .find((row) => row.getAttribute('data-workspace-artifact-path') === artifactEntry.path) || null,
        'workspace scriptlet row in File Explorer',
      );
      const visibleActionText = artifactRow.querySelector('[data-testid="workspace-artifact-open-action"]')?.textContent?.trim() || '';

      artifactRow.focus();
      rightClick(artifactRow);
      const rightClickMenu = await waitFor(
        () => document.querySelector('[data-testid="context-menu"][data-context-target="workspace-file"]'),
        'right-click shared workspace scriptlet context menu',
      );
      const deleteAction = menuButton('delete-workspace-artifact');
      const rightClickReport = {
        contextTarget: rightClickMenu.getAttribute('data-context-target') || '',
        objectKind: rightClickMenu.getAttribute('data-shell-object-kind') || '',
        objectOwner: rightClickMenu.getAttribute('data-shell-object-owner') || '',
        objectSource: rightClickMenu.getAttribute('data-shell-object-source') || '',
        sourceAppId: rightClickMenu.getAttribute('data-shell-object-source-app-id') || '',
        targetPath: rightClickMenu.getAttribute('data-target-path') || '',
        actionIds: [...rightClickMenu.querySelectorAll('[data-action-id]')].map((item) => item.getAttribute('data-action-id') || ''),
        runActionCapabilities: menuButton('run-workspace-scriptlet-artifact')?.getAttribute('data-required-capabilities') || '',
        runActionSource: menuButton('run-workspace-scriptlet-artifact')?.getAttribute('data-action-source') || '',
        runShortcut: menuButton('run-workspace-scriptlet-artifact')?.querySelector('.context-menu-shortcut')?.textContent?.trim() || '',
        deleteDanger: deleteAction?.classList.contains('is-danger') || false,
        disabledReasons: [...rightClickMenu.querySelectorAll('[data-disabled-reason]')]
          .map((item) => item.getAttribute('data-disabled-reason') || '')
          .filter(Boolean),
      };
      keydown(document.activeElement || rightClickMenu, 'Escape');
      await waitFor(
        () => !document.querySelector('[data-testid="context-menu"]') && document.activeElement === artifactRow,
        'Escape returns focus to workspace scriptlet row',
      );

      keydown(artifactRow, 'F10', { shiftKey: true });
      const keyboardMenu = await waitFor(
        () => document.querySelector('[data-testid="context-menu"][data-context-target="workspace-file"]'),
        'keyboard shared workspace scriptlet context menu',
      );
      const keyboardReport = {
        contextTarget: keyboardMenu.getAttribute('data-context-target') || '',
        objectKind: keyboardMenu.getAttribute('data-shell-object-kind') || '',
        targetPath: keyboardMenu.getAttribute('data-target-path') || '',
      };
      click(menuButton('run-workspace-scriptlet-artifact'));
      await waitFor(
        async () => {
          const audit = await window.sb.audit.list();
          return audit.some((event) => event.type === 'workspace_scriptlet.run_completed'
            && event.metadata?.kind === 'scriptlet');
        },
        'workspace scriptlet run audit',
        60000,
      );
      await waitFor(
        () => document.body.textContent.includes('Host record was not found.'),
        'visible scriptlet backend failure state',
      );

      const directResult = await window.sb.workspaceScriptlet.run({ path: artifactEntry.path });

      const badScriptlet = await window.sb.workspaceFile.createFile('scriptlet', '');
      await window.sb.workspaceArtifactContent.update(badScriptlet.path, JSON.stringify({
        schemaVersion: 1,
        kind: 'scriptlet',
        name: 'Missing Capability Scriptlet',
        hostId: scriptletHostId,
        capabilities: [],
        command: 'printf denied',
      }, null, 2));
      let missingCapabilityDenied = '';
      try {
        await window.sb.workspaceScriptlet.run({ path: badScriptlet.path });
      } catch (error) {
        missingCapabilityDenied = error instanceof Error ? error.message : String(error);
      }

      const note = await window.sb.workspaceFile.createFile('note', '');
      let noteDenied = '';
      try {
        await window.sb.workspaceScriptlet.run({ path: note.path });
      } catch (error) {
        noteDenied = error instanceof Error ? error.message : String(error);
      }

      const applet = await window.sb.workspaceFile.createFile('applet', '');
      let appletDenied = '';
      try {
        await window.sb.workspaceScriptlet.run({ path: applet.path });
      } catch (error) {
        appletDenied = error instanceof Error ? error.message : String(error);
      }

      let pathMismatchDenied = '';
      try {
        await window.sb.workspaceScriptlet.run({ path: './' + artifactEntry.path });
      } catch (error) {
        pathMismatchDenied = error instanceof Error ? error.message : String(error);
      }

      const settings = await window.sb.settings.get();
      await window.sb.settings.update({
        operator: {
          ...settings.operator,
          policy: 'disabled',
        },
      });
      let policyDenied = '';
      try {
        await window.sb.workspaceScriptlet.run({ path: artifactEntry.path });
      } catch (error) {
        policyDenied = error instanceof Error ? error.message : String(error);
      } finally {
        await window.sb.settings.update({ operator: settings.operator });
      }

      const audit = await window.sb.audit.list();
      const relevantAudit = audit.filter((event) =>
        event.type === 'workspace_scriptlet.run_completed'
        || event.type === 'ssh.exec_failed'
        || event.type === 'ssh.exec_route_completed'
        || event.type === 'workspace_artifact_content.read'
        || event.type === 'policy.denied',
      );
      const runAudit = relevantAudit.filter((event) => event.type === 'workspace_scriptlet.run_completed');
      const auditJson = JSON.stringify(relevantAudit);
      const runAuditJson = JSON.stringify(runAudit);
      const localStorageSourceKeys = Object.keys(localStorage).filter((key) =>
        /scriptlet.*source|source.*scriptlet|workspaceScriptlet|workspace-scriptlet|workspaceArtifactContent|workspace-artifact-content/i.test(key),
      );

      return {
        artifactPath: artifactEntry.path,
        updatedArtifactKind: updatedArtifact.kind,
        artifactReadbackKind: artifactReadback.kind,
        artifactReadbackHasRawScript: JSON.stringify(artifactReadback.manifest || {}).includes(rawScriptMarker),
        visibleActionText,
        rightClickReport,
        keyboardReport,
        directResult: {
          path: directResult.path,
          name: directResult.name,
          hostId: directResult.hostId,
          command: directResult.command,
          status: directResult.status,
          error: directResult.error,
          sourceLogged: directResult.sourceLogged,
          scriptLogged: directResult.scriptLogged,
          commandTextLogged: directResult.commandTextLogged,
          commandOutputLogged: directResult.commandOutputLogged,
          capabilities: directResult.capabilities,
        },
        missingCapabilityDenied,
        noteDenied,
        appletDenied,
        pathMismatchDenied,
        policyDenied,
        runAuditCount: runAudit.length,
        policyDeniedAuditCount: relevantAudit.filter((event) => event.type === 'policy.denied').length,
        auditHasRawScript: auditJson.includes(rawScriptMarker) || auditJson.includes('printf denied'),
        auditHasRawPath: runAuditJson.includes(artifactEntry.path),
        auditHasSanitizedRun: runAudit.some((event) => event.type === 'workspace_scriptlet.run_completed'
          && event.metadata?.scriptLogged === false
          && event.metadata?.commandTextLogged === false
          && event.metadata?.commandOutputLogged === false
          && typeof event.metadata?.pathHash === 'string'),
        localStorageSourceKeys,
      };
    })()`);

    assert.equal(report.updatedArtifactKind, 'scriptlet', 'Workspace artifact update returns scriptlet kind.');
    assert.equal(report.artifactReadbackKind, 'scriptlet', 'Workspace artifact content read returns scriptlet kind.');
    assert.equal(report.artifactReadbackHasRawScript, true, 'Workspace artifact content owns scriptlet source.');
    assert.equal(report.visibleActionText, 'Run Scriptlet', 'File Explorer row exposes Run Scriptlet action.');
    assert.equal(report.rightClickReport.contextTarget, 'workspace-file', 'Right-click uses shared shell context menu target.');
    assert.equal(report.rightClickReport.objectKind, 'workspace-scriptlet-artifact', 'Right-click menu carries scriptlet artifact object kind.');
    assert.equal(report.rightClickReport.objectOwner, 'workspace-files', 'Right-click menu carries File Explorer object owner.');
    assert.equal(report.rightClickReport.objectSource, 'workspace-file-object', 'Right-click menu carries workspace file object source.');
    assert.equal(report.rightClickReport.sourceAppId, 'workspace-files', 'Right-click menu carries source app id.');
    assert.equal(report.rightClickReport.targetPath, report.artifactPath, 'Right-click menu carries workspace artifact path identity.');
    assert.equal(report.rightClickReport.actionIds.includes('run-workspace-scriptlet-artifact'), true, 'Right-click menu includes scriptlet run action.');
    assert.equal(report.rightClickReport.runActionCapabilities.includes('workspace-file:read'), true, 'Run action requires workspace file read capability.');
    assert.equal(report.rightClickReport.runActionCapabilities.includes('ssh:exec'), true, 'Run action requires SSH exec capability.');
    assert.equal(report.rightClickReport.runActionSource, 'workspace-file-object', 'Run action source is workspace file object.');
    assert.equal(report.rightClickReport.runShortcut, 'Enter', 'Run action advertises Enter shortcut.');
    assert.equal(report.rightClickReport.deleteDanger, true, 'Delete action keeps destructive styling.');
    assert.equal(report.rightClickReport.disabledReasons.some((reason) => reason.includes('Open With handlers')), true, 'Shared menu exposes plain-language disabled reason.');
    assert.equal(report.keyboardReport.contextTarget, 'workspace-file', 'Shift+F10 uses shared shell context menu target.');
    assert.equal(report.keyboardReport.objectKind, 'workspace-scriptlet-artifact', 'Keyboard menu carries scriptlet artifact object kind.');
    assert.equal(report.keyboardReport.targetPath, report.artifactPath, 'Keyboard menu carries workspace artifact path identity.');
    assert.equal(report.directResult.path, report.artifactPath, 'Direct typed run result returns artifact path.');
    assert.equal(report.directResult.hostId, 'missing-host-scriptlet-smoke', 'Run result uses manifest hostId.');
    assert.equal(report.directResult.command.includes('workspace-scriptlet:'), true, 'Run result returns safe scriptlet command label.');
    assert.equal(report.directResult.command.includes(rawScriptMarker), false, 'Run result command does not expose raw script.');
    assert.equal(report.directResult.status, 'failed', 'Missing host returns backend-mediated failed run result.');
    assert.equal(report.directResult.error, 'Host record was not found.', 'Missing host failure came from backend SSH service.');
    assert.equal(report.directResult.sourceLogged, false, 'Run result marks sourceLogged false.');
    assert.equal(report.directResult.scriptLogged, false, 'Run result marks scriptLogged false.');
    assert.equal(report.directResult.commandTextLogged, false, 'Run result marks command text unlogged.');
    assert.equal(report.directResult.commandOutputLogged, false, 'Run result marks command output unlogged.');
    assert.equal(report.directResult.capabilities.includes('ssh:exec'), true, 'Run result carries declared capability.');
    assert.match(report.missingCapabilityDenied, /ssh:exec capability/, 'Missing declared capability is denied with plain-language error.');
    assert.match(report.noteDenied, /only supports applet and scriptlet|available only/i, 'Notes are denied by scriptlet run route.');
    assert.match(report.appletDenied, /available only/i, 'Applets are denied by scriptlet run route.');
    assert.match(report.pathMismatchDenied, /path must match/i, 'Path mismatch is denied by scriptlet run route.');
    assert.match(report.policyDenied, /Policy denied|policy mode disabled/i, 'Policy denial is surfaced as a plain-language error.');
    assert.equal(report.runAuditCount >= 2, true, 'Run route writes sanitized audit for UI and direct runs.');
    assert.equal(report.policyDeniedAuditCount >= 1, true, 'Policy denial writes audit evidence.');
    assert.equal(report.auditHasRawScript, false, 'Audit evidence does not log raw script/source content.');
    assert.equal(report.auditHasRawPath, false, 'Audit evidence does not log raw workspace artifact path.');
    assert.equal(report.auditHasSanitizedRun, true, 'Scriptlet run audit contains sanitized metadata and path hash.');
    assert.deepEqual(report.localStorageSourceKeys, [], 'Scriptlet source is not persisted through localStorage source keys.');

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
