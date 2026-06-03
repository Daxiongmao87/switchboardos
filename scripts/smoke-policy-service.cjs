#!/usr/bin/env node

const assert = require('node:assert/strict');
const {
  PolicyDeniedError,
  PolicyService,
  normalizePolicyMode,
} = require('../dist/src/main/policy-service.js');
const {
  validateHostOperationInput,
  validateSshExecInput,
} = require('../dist/src/main/runtime-validation.js');

const baseSettings = {
  theme: 'system',
  defaultWindowBehavior: 'floating',
  sshDefaults: {
    port: 22,
    username: '',
    authMode: 'agent',
    connectTimeoutMs: 10000,
  },
  operator: {
    endpoint: '',
    policy: 'manual-approval',
  },
};

let settings = { ...baseSettings, operator: { ...baseSettings.operator } };
const auditEvents = [];
const service = new PolicyService(
  () => settings,
  (event) => auditEvents.push(event),
);

assert.equal(normalizePolicyMode(settings), 'balanced');

const allowedDecision = service.assertAllowed('ssh:exec', {
  caller: 'smoke',
  action: 'ssh:exec',
  hostId: 'policy-host',
});
assert.equal(allowedDecision.allowed, true);
assert.equal(allowedDecision.mode, 'balanced');
assert.equal(auditEvents.length, 0, 'allowed path should not write a denial audit event');

assert.deepEqual(validateSshExecInput({
  hostId: 'policy-host',
  command: 'uptime',
  timeoutMs: 2000,
}), {
  hostId: 'policy-host',
  command: 'uptime',
  timeoutMs: 2000,
});
assert.equal(validateHostOperationInput({
  hostId: 'policy-host',
  kind: 'processes',
  limit: 25,
}).kind, 'processes');

settings = {
  ...settings,
  operator: {
    ...settings.operator,
    policy: 'disabled',
  },
};

assert.equal(normalizePolicyMode(settings), 'disabled');
assert.throws(
  () => service.assertAllowed('ssh:exec', {
    caller: 'smoke',
    action: 'ssh:exec',
    hostId: 'policy-host',
  }),
  PolicyDeniedError,
);
assert.equal(auditEvents.length, 1, 'denied path should write exactly one audit event');
assert.equal(auditEvents[0].type, 'policy.denied');
assert.equal(auditEvents[0].metadata.capability, 'ssh:exec');
assert.equal(auditEvents[0].metadata.mode, 'disabled');
assert.equal(auditEvents[0].metadata.secretsLogged, false);

const settingsDecision = service.assertAllowed('settings:update', {
  caller: 'smoke',
  action: 'settings:update',
});
assert.equal(settingsDecision.allowed, true, 'settings update remains available to recover from disabled policy');

assert.throws(
  () => validateHostOperationInput({ hostId: 'policy-host', kind: 'write-files' }),
  /kind must be one of/,
);

console.log('policy service smoke: allowed path, disabled denial audit, settings recovery, and input validation passed');
