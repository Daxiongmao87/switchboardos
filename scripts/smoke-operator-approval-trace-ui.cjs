#!/usr/bin/env node
// Rendered Electron smoke for Operator approval status and per-proposal audit trace.

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
const port = 11400 + Math.floor(Math.random() * 400);
const cdpCommandTimeoutMs = 180000;
const configDir = mkdtempSync(join(tmpdir(), 'switchboardos-operator-trace-'));
const screenshotPath = join(tmpdir(), 'switchboardos-operator-trace-smoke.png');
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
      && window.sb.app
      && window.sb.window
      && window.sb.host
      && window.sb.settings
      && window.sb.agent
      && window.sb.agent.propose
      && window.sb.agent.executeAction
      && window.sb.audit
    )`);
    if (ready) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Switchboard API did not expose Operator dependencies.\n${electronOutput}`);
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
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError : ''));
      };
      const click = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const byTestId = (testId) => document.querySelector('[data-testid="' + String(testId).replace(/"/g, '\\\\"') + '"]');
      const text = (testId) => byTestId(testId)?.textContent?.trim() || '';
      const textIncludes = (testId, expected) => text(testId).includes(expected);
      const openOperatorWindow = () => {
        const existing = document.querySelector('.desktop-window[data-app-id="agents"]');
        if (existing) {
          return existing;
        }
        window.postMessage({ type: 'sb:navigate', route: '/agents' }, '*');
        return null;
      };
      const localStorageOperatorKeys = () => Object.keys(localStorage).filter((key) =>
        /operator.*(proposal|action|source)|(?:proposal|action|source).*operator|agentOperator.*source/i.test(key),
      );

      await waitFor(() => document.querySelector('[data-testid="desktop-shell"]'), 'desktop shell');
      const originalSettings = await window.sb.settings.get();
      const host = await window.sb.host.create({
        name: 'Operator Trace Smoke Host',
        address: '127.0.0.1',
        hostname: '127.0.0.1',
        port: 1,
        username: 'agent',
        authMode: 'agent',
        tags: ['operator-trace-smoke'],
        osHint: 'linux',
        bootstrapStatus: 'not_started',
        defaultShell: '/bin/sh',
        defaultWorkingDirectory: '~',
        capabilities: ['ssh'],
        notes: 'Operator trace rendered smoke target.',
      });

      try {
        await window.sb.settings.update({
          operator: {
            ...originalSettings.operator,
            policy: 'manual-approval',
          },
        });
        const operatorWindow = await waitFor(
          openOperatorWindow,
          'Operator shell window',
        );
        const refreshButton = await waitFor(
          () => [...operatorWindow.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Refresh') || null,
          'Operator refresh button',
        );
        const generateButton = await waitFor(() => byTestId('operator-generate-proposals'), 'generate proposals button');
        click(generateButton);
        await waitFor(
          () => operatorWindow.querySelectorAll('[data-proposal-id]').length >= 2,
          'at least two generated Operator proposal cards',
        );
        const proposalCards = [...operatorWindow.querySelectorAll('[data-proposal-id]')];
        const rejectedProposalId = proposalCards[0].getAttribute('data-proposal-id') || '';
        const proposalId = proposalCards[1].getAttribute('data-proposal-id') || '';
        const approveTestId = 'operator-proposal-approve-' + proposalId;
        const rejectedApproveTestId = 'operator-proposal-approve-' + rejectedProposalId;
        const executeActionCalls = [];
        window.addEventListener('sb:operator-execute-action-call', (event) => {
          executeActionCalls.push(event.detail);
        });
        await window.sb.settings.update({
          operator: {
            ...originalSettings.operator,
            policy: 'disabled',
          },
        });
        click(refreshButton);
        const disabledText = await waitFor(
          () => textIncludes('operator-proposal-disabled-reasons-' + proposalId, 'Operator execution is disabled by local policy.')
            ? text('operator-proposal-disabled-reasons-' + proposalId)
            : '',
          'policy disabled reason',
        );
        const disabledApproveState = byTestId(approveTestId)?.disabled === true;
        click(byTestId('operator-proposal-inspect-' + rejectedProposalId));
        const rejectedInspectDetails = await waitFor(
          () => byTestId('operator-proposal-inspect-details-' + rejectedProposalId),
          'proposal inspect details',
        );
        const inspectBeforeReject = {
          target: text('operator-proposal-inspect-target-' + rejectedProposalId),
          riskSource: text('operator-proposal-inspect-risk-source-' + rejectedProposalId),
          actionKind: text('operator-proposal-inspect-action-kind-' + rejectedProposalId),
          capability: text('operator-proposal-inspect-capability-' + rejectedProposalId),
          route: text('operator-proposal-inspect-route-' + rejectedProposalId),
          rationale: text('operator-proposal-inspect-rationale-' + rejectedProposalId),
          expectedEffect: text('operator-proposal-inspect-expected-effect-' + rejectedProposalId),
          approvalRequirement: text('operator-proposal-inspect-approval-requirement-' + rejectedProposalId),
          disabledReasons: text('operator-proposal-inspect-disabled-reasons-' + rejectedProposalId),
          commandPreview: text('operator-proposal-inspect-command-preview-' + rejectedProposalId),
          approvalTrace: text('operator-proposal-inspect-approval-trace-' + rejectedProposalId),
          auditTrace: text('operator-proposal-inspect-audit-trace-' + rejectedProposalId),
          sanitizerProof: text('operator-proposal-inspect-sanitizer-proof-' + rejectedProposalId),
          rawJsonVisible: rejectedInspectDetails.textContent.includes('{"') || rejectedInspectDetails.textContent.includes('"metadata"'),
        };
        click(byTestId('operator-proposal-reject-' + rejectedProposalId));
        await waitFor(
          () => text('operator-proposal-review-status-' + rejectedProposalId).includes('rejected'),
          'proposal rejected status',
        );
        const rejectState = {
          status: text('operator-proposal-review-status-' + rejectedProposalId),
          approvalStatus: text('operator-proposal-approval-status-' + rejectedProposalId),
          auditStatus: text('operator-proposal-audit-status-' + rejectedProposalId),
          disabledReasons: text('operator-proposal-disabled-reasons-' + rejectedProposalId),
          approveDisabled: byTestId(rejectedApproveTestId)?.disabled === true,
          executeCallsAfterReject: executeActionCalls.length,
        };

        const metadataBeforeApproval = {
          target: text('operator-proposal-target-' + proposalId),
          actionKind: text('operator-proposal-action-kind-' + proposalId),
          capability: text('operator-proposal-capability-' + proposalId),
          route: text('operator-proposal-route-' + proposalId),
          approvalRequirement: text('operator-proposal-approval-requirement-' + proposalId),
          expectedEffect: text('operator-proposal-expected-effect-' + proposalId),
          approvalStatus: text('operator-proposal-approval-status-' + proposalId),
          backendStatus: text('operator-proposal-backend-status-' + proposalId),
        };

        click(byTestId('operator-proposal-inspect-' + proposalId));
        await waitFor(() => byTestId('operator-proposal-inspect-details-' + proposalId), 'editable proposal inspect details');
        click(byTestId('operator-proposal-edit-' + proposalId));
        const firstEditInput = await waitFor(() => byTestId('operator-proposal-edit-command-' + proposalId), 'first edit command input');
        firstEditInput.value = 'echo canceled-operator-edit';
        firstEditInput.dispatchEvent(new Event('input', { bubbles: true }));
        click(byTestId('operator-proposal-cancel-edit-' + proposalId));
        await waitFor(
          () => !byTestId('operator-proposal-edit-form-' + proposalId),
          'edit form hidden after cancel',
        );
        const canceledEditPreview = text('operator-proposal-command-preview-' + proposalId);
        click(byTestId('operator-proposal-edit-' + proposalId));
        const editInput = await waitFor(() => byTestId('operator-proposal-edit-command-' + proposalId), 'edit command input');
        editInput.value = 'printf switchboardos-operator-edited';
        editInput.dispatchEvent(new Event('input', { bubbles: true }));
        click(byTestId('operator-proposal-save-edit-' + proposalId));
        await waitFor(
          () => text('operator-proposal-edited-state-' + proposalId).includes('Edited before approval'),
          'edited state visible',
        );
        const editState = {
          canceledPreview: canceledEditPreview,
          editedPreview: text('operator-proposal-command-preview-' + proposalId),
          originalCommand: text('operator-proposal-original-command-' + proposalId),
          status: text('operator-proposal-review-status-' + proposalId),
          expectedEffect: text('operator-proposal-expected-effect-' + proposalId),
          inspectExpectedEffect: text('operator-proposal-inspect-expected-effect-' + proposalId),
          inspectCommandPreview: text('operator-proposal-inspect-command-preview-' + proposalId),
          approvalRequirement: text('operator-proposal-inspect-approval-requirement-' + proposalId),
          backendStatusAfterEdit: text('operator-proposal-backend-status-' + proposalId),
          executeCallsAfterEdit: executeActionCalls.length,
        };

        await window.sb.settings.update({
          operator: {
            ...originalSettings.operator,
            policy: 'manual-approval',
          },
        });
        click(refreshButton);
        await waitFor(
          () => text('operator-proposal-disabled-reasons-' + proposalId).includes('Operator execution is disabled by local policy.') === false,
          'policy disabled reason cleared',
        );
        await waitFor(() => byTestId(approveTestId)?.disabled === false, 'approve button enabled');
        click(byTestId(approveTestId));
        await waitFor(
          () => text('operator-proposal-backend-status-' + proposalId) !== 'Not dispatched',
          'backend status returned on proposal card',
        );
        await waitFor(
          () => text('operator-proposal-audit-status-' + proposalId).includes('Correlated'),
          'correlated audit status on proposal card',
        );

        const trace = {
          approvalStatus: text('operator-proposal-approval-status-' + proposalId),
          backendStatus: text('operator-proposal-backend-status-' + proposalId),
          backendMessage: text('operator-proposal-backend-message-' + proposalId),
          terminalSession: text('operator-proposal-terminal-session-' + proposalId),
          terminalStart: text('operator-proposal-terminal-start-' + proposalId),
          terminalWrite: text('operator-proposal-terminal-write-' + proposalId),
          auditStatus: text('operator-proposal-audit-status-' + proposalId),
          auditEvent: text('operator-proposal-audit-event-' + proposalId),
          auditSanitization: text('operator-proposal-audit-sanitization-' + proposalId),
        };
        const audit = await window.sb.audit.list();
        const rejectedExecutionAudit = audit.find((event) =>
          (event.type === 'agent.action.execution_succeeded' || event.type === 'agent.action.execution_failed')
          && event.metadata?.proposalId === rejectedProposalId
          && event.metadata?.hostId === host.id,
        );
        const executionAudit = audit.find((event) =>
          (event.type === 'agent.action.execution_succeeded' || event.type === 'agent.action.execution_failed')
          && event.metadata?.proposalId === proposalId
          && event.metadata?.hostId === host.id,
        );
        const auditJson = JSON.stringify(executionAudit || {});

        return {
          hostId: host.id,
          rejectedProposalId,
          proposalId,
          inspectBeforeReject,
          rejectState,
          disabledText,
          disabledApproveState,
          metadataBeforeApproval,
          editState,
          trace,
          audit: executionAudit ? {
            id: executionAudit.id,
            type: executionAudit.type,
            message: executionAudit.message,
            proposalId: executionAudit.metadata?.proposalId,
            hostId: executionAudit.metadata?.hostId,
            actionKind: executionAudit.metadata?.actionKind,
            executionStatus: executionAudit.metadata?.executionStatus,
            commandLogged: executionAudit.metadata?.commandLogged,
            terminalInputLogged: executionAudit.metadata?.terminalInputLogged,
            commandOutputLogged: executionAudit.metadata?.commandOutputLogged,
            terminalOutputLogged: executionAudit.metadata?.terminalOutputLogged,
            providerPayloadLogged: executionAudit.metadata?.providerPayloadLogged,
            secretsLogged: executionAudit.metadata?.secretsLogged,
            structuredActionExecution: executionAudit.metadata?.structuredActionExecution,
          } : null,
          rejectedExecutionAuditPresent: Boolean(rejectedExecutionAudit),
          executeActionCalls,
          auditHasApprovedCommandOutput: auditJson.includes('uname -a\\n')
            || auditJson.includes('systemctl --failed')
            || auditJson.includes('switchboardos-operator-edited'),
          localStorageOperatorKeys: localStorageOperatorKeys(),
        };
      } finally {
        await window.sb.settings.update({ operator: originalSettings.operator });
      }
    })()`);

    assert.equal(report.disabledText.includes('Operator execution is disabled by local policy.'), true, 'Policy-disabled state shows proposal disabled reason.');
    assert.equal(report.disabledApproveState, true, 'Policy-disabled proposal cannot be approved from the card.');
    assert.equal(report.inspectBeforeReject.target.includes('Operator Trace Smoke Host'), true, 'Inspect details show target host.');
    assert.match(report.inspectBeforeReject.riskSource, /low|medium|high/, 'Inspect details show risk and source.');
    assert.equal(report.inspectBeforeReject.actionKind, 'ssh-command', 'Inspect details show action kind.');
    assert.equal(report.inspectBeforeReject.capability, 'agent:execute-action', 'Inspect details show required capability.');
    assert.match(report.inspectBeforeReject.route, /agent:execute-action|\/api\/agent\/execute-action/, 'Inspect details show route.');
    assert.equal(report.inspectBeforeReject.rationale.length > 0, true, 'Inspect details show rationale.');
    assert.equal(report.inspectBeforeReject.expectedEffect.includes('backend terminal execution'), true, 'Inspect details show expected effect.');
    assert.equal(report.inspectBeforeReject.approvalRequirement, 'Explicit approval required', 'Inspect details show approval requirement.');
    assert.equal(report.inspectBeforeReject.disabledReasons.includes('Operator execution is disabled by local policy.'), true, 'Inspect details show disabled reason.');
    assert.equal(report.inspectBeforeReject.commandPreview.length > 0, true, 'Inspect details show command preview.');
    assert.equal(report.inspectBeforeReject.approvalTrace, 'Awaiting approval', 'Inspect details show approval trace.');
    assert.equal(report.inspectBeforeReject.auditTrace.includes('Not dispatched'), true, 'Inspect details show audit trace without dispatch.');
    assert.equal(report.inspectBeforeReject.sanitizerProof.includes('No correlated audit event yet'), true, 'Inspect details show sanitizer proof state.');
    assert.equal(report.inspectBeforeReject.rawJsonVisible, false, 'Inspect details do not render raw audit JSON.');
    assert.equal(report.rejectState.status.includes('rejected'), true, 'Rejected proposal shows rejected status and reason.');
    assert.equal(report.rejectState.approvalStatus, 'Rejected', 'Rejected proposal trace shows rejected approval status.');
    assert.equal(report.rejectState.auditStatus.includes('no backend execution request'), true, 'Rejected proposal audit trace states no execution request.');
    assert.equal(report.rejectState.disabledReasons.includes('rejected by the user'), true, 'Rejected proposal disables approval with a reason.');
    assert.equal(report.rejectState.approveDisabled, true, 'Rejected proposal approve button is disabled.');
    assert.equal(report.rejectState.executeCallsAfterReject, 0, 'Reject does not call typed executeAction.');
    assert.equal(report.metadataBeforeApproval.target.includes('Operator Trace Smoke Host'), true, 'Proposal card shows target host before approval.');
    assert.equal(report.metadataBeforeApproval.actionKind, 'ssh-command', 'Proposal card shows action kind.');
    assert.equal(report.metadataBeforeApproval.capability, 'agent:execute-action', 'Proposal card shows required capability.');
    assert.match(report.metadataBeforeApproval.route, /agent:execute-action|\/api\/agent\/execute-action/, 'Proposal card shows execution route.');
    assert.equal(report.metadataBeforeApproval.approvalRequirement, 'Explicit approval required', 'Proposal card keeps explicit approval requirement while policy-disabled.');
    assert.equal(report.metadataBeforeApproval.expectedEffect.includes('backend terminal execution'), true, 'Proposal card shows expected effect.');
    assert.equal(report.metadataBeforeApproval.approvalStatus, 'Awaiting approval', 'Proposal starts in awaiting approval status.');
    assert.equal(report.metadataBeforeApproval.backendStatus, 'Not dispatched', 'Proposal starts with no backend dispatch.');
    assert.notEqual(report.editState.canceledPreview, 'echo canceled-operator-edit', 'Cancel edit restores the active command preview.');
    assert.equal(report.editState.editedPreview, 'printf switchboardos-operator-edited', 'Saved edit updates command preview.');
    assert.notEqual(report.editState.originalCommand, report.editState.editedPreview, 'Edit surface keeps original command visible.');
    assert.equal(report.editState.status.includes('edited command saved'), true, 'Saved edit is visible as pending approval.');
    assert.equal(report.editState.expectedEffect.includes('approved edited ssh-command'), true, 'Saved edit updates card expected effect.');
    assert.equal(report.editState.inspectExpectedEffect.includes('approved edited ssh-command'), true, 'Saved edit updates inspect expected effect.');
    assert.equal(report.editState.inspectCommandPreview, 'printf switchboardos-operator-edited', 'Inspect command preview uses saved edited command.');
    assert.equal(report.editState.approvalRequirement, 'Explicit approval required', 'Edit retains explicit approval requirement while policy-disabled.');
    assert.equal(report.editState.backendStatusAfterEdit, 'Not dispatched', 'Saving an edit does not dispatch before approval.');
    assert.equal(report.editState.executeCallsAfterEdit, 0, 'Saving an edit does not call typed executeAction.');
    assert.match(report.trace.approvalStatus, /Dispatched|Failed/, 'Proposal card surfaces final approval status.');
    assert.match(report.trace.backendStatus, /dispatched|failed|unsupported/, 'Proposal card surfaces backend execution status.');
    assert.equal(report.trace.backendMessage.length > 0, true, 'Proposal card surfaces backend message.');
    assert.notEqual(report.trace.terminalStart, '', 'Proposal card surfaces terminal start state.');
    assert.match(report.trace.terminalWrite, /accepted|not accepted/, 'Proposal card surfaces terminal write state.');
    assert.equal(report.trace.auditStatus.includes('Correlated'), true, 'Proposal card correlates audit event.');
    assert.match(report.trace.auditEvent, /agent\.action\.execution_(succeeded|failed)/, 'Proposal card names execution audit event.');
    assert.equal(report.trace.auditSanitization.includes('commandLogged=false'), true, 'Proposal card surfaces sanitized audit flags.');
    assert.ok(report.audit, 'Execution audit event exists for proposal and host.');
    assert.equal(report.audit.proposalId, report.proposalId, 'Execution audit metadata includes proposalId.');
    assert.equal(report.audit.hostId, report.hostId, 'Execution audit metadata includes hostId.');
    assert.equal(report.audit.actionKind, 'ssh-command', 'Execution audit metadata includes action kind.');
    assert.equal(report.audit.commandLogged, false, 'Execution audit does not log raw command text.');
    assert.equal(report.audit.terminalInputLogged, false, 'Execution audit does not log terminal input.');
    assert.equal(report.audit.commandOutputLogged, false, 'Execution audit does not log command output.');
    assert.equal(report.audit.providerPayloadLogged, false, 'Execution audit does not log provider payload.');
    assert.equal(report.audit.secretsLogged, false, 'Execution audit does not log secrets.');
    assert.equal(report.audit.structuredActionExecution, true, 'Execution audit marks structured action execution.');
    assert.equal(report.rejectedExecutionAuditPresent, false, 'Rejected proposal does not create an execution audit.');
    assert.equal(report.executeActionCalls.length, 1, 'Only edited approval calls typed executeAction.');
    assert.equal(report.executeActionCalls[0].proposalId, report.proposalId, 'executeAction is called for the edited proposal.');
    assert.equal(report.executeActionCalls[0].proposalCommand, 'printf switchboardos-operator-edited', 'executeAction receives edited approved proposal command.');
    assert.equal(report.executeActionCalls[0].actionKind, 'ssh-command', 'executeAction receives typed action kind.');
    assert.equal(report.executeActionCalls[0].actionCommand, 'printf switchboardos-operator-edited', 'executeAction receives edited command descriptor.');
    assert.equal(report.executeActionCalls[0].approved, true, 'executeAction keeps explicit user approval.');
    assert.equal(report.auditHasApprovedCommandOutput, false, 'Execution audit does not expose terminal input/output content.');
    assert.deepEqual(report.localStorageOperatorKeys, [], 'Operator proposal/action source is not persisted in localStorage.');

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
