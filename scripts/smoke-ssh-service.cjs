#!/usr/bin/env node

const assert = require('node:assert/strict');
const {
  SshService,
  buildSystemSshCommand,
  buildSystemSshShellCommand,
} = require('../dist/src/main/ssh-service.js');

const host = {
  id: 'ssh-smoke-host',
  name: 'SSH Smoke Host',
  address: '127.0.0.1',
  hostname: '127.0.0.1',
  port: 22,
  username: 'agent',
  authMode: 'agent',
  credentialRefId: null,
  tags: [],
  osHint: 'unknown',
  bootstrapStatus: 'unknown',
  defaultShell: '',
  defaultWorkingDirectory: '',
  capabilities: [],
  notes: '',
  lastConnectionStatus: 'untested',
  lastCheckedAt: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const keyHost = {
  ...host,
  id: 'ssh-smoke-key-host',
  authMode: 'key',
  keyPath: '/tmp/switchboardos-smoke-key',
};

class FakeSshProvider {
  name = 'fake-ssh';

  buildShellCommand(fakeHost) {
    return {
      command: 'ssh',
      args: ['-p', String(fakeHost.port), fakeHost.address || fakeHost.hostname],
      env: {},
    };
  }

  async exec(input) {
    const now = new Date().toISOString();
    if (input.command.includes('fail')) {
      return {
        hostId: input.host.id,
        command: input.command,
        stdout: '',
        stderr: 'fake failure\n',
        exitCode: 42,
        durationMs: 3,
        startedAt: now,
        completedAt: now,
        status: 'failed',
        error: 'fake failure',
      };
    }

    const stdout = input.command.includes('ls -la')
      ? '-rw-r--r-- 1 agent agent 12 Jan 01 00:00 file.txt\n'
      : input.command.includes('host metrics')
        ? 'os=Ubuntu 24.04 (Linux 6.8 x86_64 GNU/Linux)\nuptime=up 3 hours\nmemory=512/2048 MB used\ndisk=4G used of 20G (20%)\n'
        : 'ok\n';

    return {
      hostId: input.host.id,
      command: input.command,
      stdout,
      stderr: '',
      exitCode: 0,
      durationMs: 2,
      startedAt: now,
      completedAt: now,
      status: 'success',
      error: null,
    };
  }
}

const auditEvents = [];
const commandHistory = [];
const service = new SshService(
  (hostId) => (hostId === host.id ? host : null),
  (event) => auditEvents.push(event),
  (entry) => commandHistory.push(entry),
  new FakeSshProvider(),
);

async function main() {
  const keyCommand = buildSystemSshCommand(keyHost);
  assert.ok(keyCommand.args.includes('-i'), 'key auth includes key path flag');
  assert.ok(keyCommand.args.includes('/tmp/switchboardos-smoke-key'), 'key auth includes key path reference');
  assert.ok(keyCommand.args.includes('IdentitiesOnly=yes'), 'key auth constrains identities');

  const agentCommand = buildSystemSshCommand(host);
  assert.equal(agentCommand.args.includes('-i'), false, 'agent auth does not include key path flag');
  const shellCommand = buildSystemSshShellCommand(host);
  assert.equal(shellCommand.args.includes('-tt'), true, 'terminal shell command requests remote tty');

  const success = await service.exec({ hostId: host.id, command: 'echo ok' });
  assert.equal(success.status, 'success');
  assert.equal(success.hostId, host.id);
  assert.equal(success.command, 'echo ok');
  assert.equal(success.stdout, 'ok\n');
  assert.equal(success.stderr, '');
  assert.equal(success.exitCode, 0);
  assert.equal(success.error, null);
  assert.ok(success.durationMs >= 0);

  const failure = await service.exec({ hostId: host.id, command: 'fail now' });
  assert.equal(failure.status, 'failed');
  assert.equal(failure.exitCode, 42);
  assert.equal(failure.error, 'fake failure');

  const missing = await service.exec({ hostId: 'missing-host', command: 'echo nope' });
  assert.equal(missing.status, 'failed');
  assert.equal(missing.error, 'Host record was not found.');

  const files = await service.listFiles({ hostId: host.id, path: '/tmp', limit: 5 });
  assert.equal(files.status, 'success');
  assert.equal(files.kind, 'files');
  assert.equal(files.rows.length, 1);
  assert.equal(files.rows[0].name, 'file.txt');
  assert.equal(commandHistory.length, 1);
  assert.equal(commandHistory[0].hostId, host.id);
  assert.ok(commandHistory[0].command.includes('ls -la'));

  const metrics = await service.readMetrics({ hostId: host.id });
  assert.equal(metrics.status, 'success');
  assert.equal(metrics.kind, 'metrics');
  assert.equal(metrics.rows[0].os.includes('Ubuntu'), true);
  assert.equal(metrics.rows[0].uptime, 'up 3 hours');
  assert.equal(metrics.rows[0].memory, '512/2048 MB used');
  assert.equal(metrics.rows[0].disk, '4G used of 20G (20%)');

  assert.ok(auditEvents.some((event) => event.type === 'ssh.exec_succeeded'));
  assert.ok(auditEvents.some((event) => event.type === 'ssh.exec_failed'));
  assert.ok(auditEvents.some((event) => event.type === 'host.files.inspected'));
  assert.ok(auditEvents.some((event) => event.type === 'host.metrics.inspected'));
  assert.ok(auditEvents.every((event) => event.metadata?.secretsLogged === false));

  console.log('ssh service smoke: structured exec success/failure, command builder, operation routing, and audit passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
