#!/usr/bin/env node

const assert = require('node:assert/strict');
const { AgentOperatorService } = require('../dist/src/main/agent-operator-service.js');

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
    request: 'Find safe diagnostics.',
  });
  assert.equal(fallback.mode, 'fallback');
  assert.equal(fallback.proposals.length >= 4, true);
  assert.equal(fallback.proposals.every((proposal) => proposal.source === 'fallback'), true);
  assert.equal(fallback.context.untrustedHostOutput.length, 1);
  assert.equal(fallbackStore.auditEvents[0].metadata.secretsLogged, false);

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
                    title: 'Provider uptime',
                    command: 'uptime',
                    rationale: 'Read load average.',
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
      request: 'Use provider.',
    });
    assert.equal(provider.mode, 'provider');
    assert.equal(provider.endpointId, endpoint.id);
    assert.equal(provider.proposals[0].source, 'provider');
    assert.equal(provider.proposals[0].command, 'uptime');
    assert.equal(providerStore.auditEvents[0].metadata.endpointModel, endpoint.model);
    assert.equal(providerStore.auditEvents[0].metadata.secretsLogged, false);
  } finally {
    global.fetch = originalFetch;
  }

  console.log('agent operator smoke: provider invocation, fallback, context, untrusted output, and audit passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
