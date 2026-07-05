#!/usr/bin/env node

const assert = require('node:assert/strict');
const { AgentOperatorService } = require('../dist/src/main/agent-operator-service.js');
const { validateOperatorActionExecuteInput } = require('../dist/src/main/runtime-validation.js');

const host = {
  id: 'operator-host',
  name: 'Operator Host',
  address: '10.0.0.42',
  hostname: 'operator.local',
  port: 22,
  username: 'agent',
  authMode: 'agent',
  keyPath: '',
  credentialRefId: null,
  group: 'ops',
  tags: ['linux'],
  notes: '',
  osHint: 'ubuntu',
  bootstrapStatus: 'ready',
  defaultShell: '/bin/bash',
  defaultWorkingDirectory: '/home/agent',
  capabilities: ['systemctl', 'journalctl'],
  favorite: false,
  lastConnectionStatus: 'success',
  lastCheckedAt: new Date().toISOString(),
  lastError: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createStore(endpoint) {
  const auditEvents = [];
  return {
    auditEvents,
    getHost: (hostId) => (hostId === host.id ? host : null),
    listHosts: () => [host],
    getSettings: () => ({
      theme: 'system',
      defaultWindowBehavior: 'floating',
      sshDefaults: {
        port: 22,
        username: 'agent',
        authMode: 'agent',
        connectTimeoutMs: 10000,
      },
      operator: {
        endpoint: endpoint?.baseUrl ?? '',
        policy: 'manual-approval',
      },
    }),
    listCommandHistory: () => [
      {
        id: 'history-1',
        hostId: host.id,
        sessionId: null,
        command: 'journalctl -p err -n 20',
        exitCode: 0,
        durationMs: 32,
        createdAt: new Date().toISOString(),
      },
    ],
    listAgentEndpoints: () => (endpoint ? [endpoint] : []),
    getCredentialRef: (refId) => (refId === 'credential-ref-1'
      ? {
          id: refId,
          name: 'Operator API key',
          type: 'keychain_ref',
          referenceValue: 'operator-key',
          metadata: { secretStorage: 'safeStorage' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null),
    logAuditEvent: (event) => {
      auditEvents.push(event);
      return {
        id: `audit-${auditEvents.length}`,
        createdAt: new Date().toISOString(),
        ...event,
      };
    },
  };
}

function assertOperatorGeneratedAuditIsSanitized(event, options) {
  const metadata = event.metadata;
  assert.equal(event.type, 'agent.proposals.generated');
  assert.equal(metadata.secretsLogged, false);
  assert.equal(metadata.requestLogged, false);
  assert.equal(metadata.operatorRequestLogged, false);
  assert.equal(metadata.proposedCommandsLogged, false);
  assert.equal(metadata.providerPayloadLogged, false);
  assert.equal(metadata.proposalCount, options.proposalCount);
  assert.equal(metadata.commandCount, options.commandCount);
  assert.equal(metadata.warningCount, options.warningCount);
  assert.equal(Object.hasOwn(metadata, 'commands'), false);
  assert.equal(Object.hasOwn(metadata, 'warnings'), false);
  assert.equal(Object.hasOwn(metadata.contextSummary, 'request'), false);
  assert.equal(Object.hasOwn(metadata.contextSummary, 'selectedHost'), false);

  const serializedEvent = JSON.stringify(event);
  assert.equal(serializedEvent.includes(options.request), false);
  for (const command of options.commands) {
    assert.equal(serializedEvent.includes(command), false);
  }
  for (const warning of options.warnings) {
    assert.equal(serializedEvent.includes(warning), false);
  }
  for (const forbiddenFragment of options.forbiddenFragments ?? []) {
    assert.equal(serializedEvent.includes(forbiddenFragment), false);
  }
}

function assertOperatorExecutionAuditIsSanitized(event, options) {
  const metadata = event.metadata;
  assert.equal(event.type, options.eventType);
  assert.equal(metadata.structuredActionExecution, true);
  assert.equal(metadata.requiresApproval, true);
  assert.equal(metadata.approved, true);
  assert.equal(metadata.commandLogged, false);
  assert.equal(metadata.terminalInputLogged, false);
  assert.equal(metadata.commandOutputLogged, false);
  assert.equal(metadata.proposedCommandsLogged, false);
  assert.equal(metadata.providerPayloadLogged, false);
  assert.equal(metadata.secretsLogged, false);
  assert.equal(Object.hasOwn(metadata, 'command'), false);
  assert.equal(Object.hasOwn(metadata, 'commands'), false);
  assert.equal(Object.hasOwn(metadata, 'terminalInput'), false);
  assert.equal(Object.hasOwn(metadata, 'stdout'), false);
  assert.equal(Object.hasOwn(metadata, 'stderr'), false);

  const serializedEvent = JSON.stringify(event);
  for (const forbiddenFragment of options.forbiddenFragments) {
    assert.equal(serializedEvent.includes(forbiddenFragment), false);
  }
}

async function main() {
  const fallbackStore = createStore(null);
  const fallbackService = new AgentOperatorService({
    store: fallbackStore,
    secretVault: {
      retrieveForMain: () => null,
    },
    audit: (event) => fallbackStore.logAuditEvent(event),
  });

  const fallback = await fallbackService.propose({
    hostId: host.id,
    request: 'secret operator request from lead smoke',
  });
  assert.equal(fallback.mode, 'fallback');
  assert.equal(fallback.proposals.length >= 4, true);
  assert.equal(fallback.proposals.every((proposal) => proposal.source === 'fallback'), true);
  assert.equal(fallback.context.untrustedHostOutput.length, 1);
  assertOperatorGeneratedAuditIsSanitized(fallbackStore.auditEvents[0], {
    request: 'secret operator request from lead smoke',
    proposalCount: fallback.proposals.length,
    commandCount: fallback.proposals.length,
    warningCount: fallback.warnings.length,
    commands: fallback.proposals.map((proposal) => proposal.command),
    warnings: fallback.warnings,
    forbiddenFragments: ['fixture-marker', 'journalctl -p err -n 20', '10.0.0.42', 'Operator Host'],
  });

  const endpoint = {
    id: 'endpoint-1',
    name: 'OpenAI Compatible',
    provider: 'openai-compatible',
    baseUrl: 'https://operator.invalid/v1',
    credentialRefId: 'credential-ref-1',
    model: 'test-model',
    contextLimit: 12000,
    toolUse: true,
    streaming: false,
    policy: 'safe',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const providerStore = createStore(endpoint);
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://operator.invalid/v1/chat/completions');
    assert.equal(init.headers.Authorization, ['Bearer', 'fixture-marker'].join(' '));
    const body = JSON.parse(init.body);
    assert.equal(body.model, endpoint.model);
    assert.equal(body.stream, false);
    assert.equal(body.messages[1].content.includes('untrustedHostOutput'), true);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                proposals: [
                  {
                    title: 'provider-payload-title-marker',
                    command: 'provider-secret-command-marker',
                    rationale: 'provider-payload-rationale-marker',
                    risk: 'low',
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
  };

  try {
    const providerService = new AgentOperatorService({
      store: providerStore,
      secretVault: {
        retrieveForMain: (key) => {
          assert.equal(key, 'operator-key');
          return 'fixture-marker';
        },
      },
      audit: (event) => providerStore.logAuditEvent(event),
    });
    const provider = await providerService.propose({
      hostId: host.id,
      request: 'secret provider operator request from lead smoke',
    });
    assert.equal(provider.mode, 'provider');
    assert.equal(provider.endpointId, endpoint.id);
    assert.equal(provider.proposals[0].source, 'provider');
    assert.equal(provider.proposals[0].command, 'provider-secret-command-marker');
    assert.equal(providerStore.auditEvents[0].metadata.endpointModel, endpoint.model);
    assertOperatorGeneratedAuditIsSanitized(providerStore.auditEvents[0], {
      request: 'secret provider operator request from lead smoke',
      proposalCount: provider.proposals.length,
      commandCount: provider.proposals.length,
      warningCount: provider.warnings.length,
      commands: provider.proposals.map((proposal) => proposal.command),
      warnings: provider.warnings,
      forbiddenFragments: [
        'fixture-marker',
        'provider-payload-title-marker',
        'provider-payload-rationale-marker',
        'journalctl -p err -n 20',
        '10.0.0.42',
        'Operator Host',
      ],
    });
  } finally {
    global.fetch = originalFetch;
  }

  const executionStore = createStore(null);
  const executionService = new AgentOperatorService({
    store: executionStore,
    secretVault: {
      retrieveForMain: () => null,
    },
    audit: (event) => executionStore.logAuditEvent(event),
  });
  const secretCommand = 'echo operator-execution-secret-command-marker';
  const approvedProposal = {
    id: 'proposal-execution-marker',
    title: 'Approved diagnostic',
    command: secretCommand,
    rationale: 'Exercise the approved action execution contract.',
    risk: 'low',
    status: 'approved',
    message: 'Approved by smoke.',
    source: 'fallback',
  };

  assert.throws(
    () => validateOperatorActionExecuteInput({
      hostId: host.id,
      proposal: { ...approvedProposal, status: 'pending' },
      action: { kind: 'ssh-command', command: secretCommand },
      approved: true,
    }),
    /proposal status must be approved/i,
  );
  assert.throws(
    () => validateOperatorActionExecuteInput({
      hostId: host.id,
      proposal: approvedProposal,
      action: { kind: 'ssh-command', command: 'echo mismatched-command-marker' },
      approved: true,
    }),
    /must match the approved proposal command/i,
  );
  assert.throws(
    () => validateOperatorActionExecuteInput({
      hostId: host.id,
      proposal: approvedProposal,
      action: { kind: 'ssh-command', command: secretCommand },
      approved: false,
    }),
    /requires approved to be true/i,
  );

  let terminalWriteInput = '';
  const executionInput = validateOperatorActionExecuteInput({
    hostId: host.id,
    proposal: approvedProposal,
    action: { kind: 'ssh-command', command: secretCommand },
    approved: true,
  });
  const executionResult = await executionService.executeApprovedAction(executionInput, {
    start: (hostId) => ({
      sessionId: 'operator-terminal-session',
      status: 'started',
      message: 'Terminal session started by smoke runtime.',
      hostId,
    }),
    write: (sessionId, input) => {
      assert.equal(sessionId, 'operator-terminal-session');
      terminalWriteInput = input;
      return {
        sessionId,
        success: true,
        message: 'Input written to terminal session.',
      };
    },
  });

  assert.equal(terminalWriteInput, `${secretCommand}\n`);
  assert.equal(executionResult.status, 'dispatched');
  assert.equal(executionResult.terminalSessionId, 'operator-terminal-session');
  assert.equal(JSON.stringify(executionResult).includes(secretCommand), false);
  assertOperatorExecutionAuditIsSanitized(executionStore.auditEvents[0], {
    eventType: 'agent.action.execution_succeeded',
    forbiddenFragments: [
      secretCommand,
      'operator-execution-secret-command-marker',
      'mismatched-command-marker',
    ],
  });

  console.log('agent operator smoke: provider invocation, fallback, context, approval execution, and audit sanitization passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
