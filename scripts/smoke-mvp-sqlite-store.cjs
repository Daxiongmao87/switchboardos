#!/usr/bin/env node
// Focused smoke test for the MVP SQLite store.
// Expects `npm run build` to have emitted dist/src/main/mvp-sqlite-store.js.

const Database = require('better-sqlite3');
const { mkdtempSync, rmSync, writeFileSync, existsSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const { MvpSqliteStore } = require('../dist/src/main/mvp-sqlite-store.js');

let failures = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ok  - ${label}`);
  } else {
    failures++;
    console.log(`  FAIL- ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

function assertEqual(label, actual, expected) {
  assert(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'switchboardos-sqlite-smoke-'));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      rmSync(dir, { recursive: true, force: true });
    });
}

function assertSchemaTables(dir) {
  const db = new Database(join(dir, 'switchboardos-mvp.sqlite'), { readonly: true });
  try {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    for (const table of ['audit_events', 'hosts', 'meta', 'settings']) {
      assert(`schema has ${table}`, rows.includes(table), JSON.stringify(rows));
    }
    const hostColumns = db.pragma('table_info(hosts)').map((row) => row.name);
    assert('hosts schema has key_path', hostColumns.includes('key_path'), JSON.stringify(hostColumns));
  } finally {
    db.close();
  }
}

async function caseCrudPersistenceAndFailureProbe() {
  console.log('case: CRUD, settings, audit, failure probe, reopen persistence');
  await withTempDir(async (dir) => {
    const probe = async (input) => ({
      success: false,
      addressTried: input.address,
      portTried: input.port,
      latencyMs: 7,
      protocolDetected: 'unknown',
      errorCode: 'ECONNREFUSED',
      errorMessage: 'connect ECONNREFUSED',
    });

    const store = new MvpSqliteStore(() => dir, probe);
    const host = store.createHost({
      name: 'Local test',
      address: '127.0.0.1',
      hostname: '127.0.0.1',
      port: 2222,
      username: 'agent',
      authMode: 'key',
      keyPath: '/tmp/switchboardos-smoke-key',
      tags: ['local', 'smoke'],
      notes: 'created by smoke',
    });

    assert('host id assigned', typeof host.id === 'string' && host.id.length > 0);
    assertEqual('created host listed', store.listHosts().length, 1);
    assertEqual('created host auth mode', store.getHost(host.id).authMode, 'key');
    assertEqual('created host key path reference', store.getHost(host.id).keyPath, '/tmp/switchboardos-smoke-key');

    const updated = store.updateHost(host.id, {
      name: 'Local updated',
      tags: ['updated'],
      notes: 'updated by smoke',
    });
    assertEqual('updated host returned', updated && updated.name, 'Local updated');
    assertEqual('updated host tags persisted in memory', store.getHost(host.id).tags.join(','), 'updated');
    assertEqual('updated host preserves key path reference', store.getHost(host.id).keyPath, '/tmp/switchboardos-smoke-key');

    const settings = store.updateSettings({
      theme: 'light',
      sshDefaults: { username: 'default-user', connectTimeoutMs: 1234 },
      operator: { endpoint: 'http://operator.invalid', policy: 'disabled' },
    });
    assertEqual('settings theme updated', settings.theme, 'light');
    assertEqual('settings ssh username updated', settings.sshDefaults.username, 'default-user');
    assertEqual('settings operator policy updated', settings.operator.policy, 'disabled');

    const manualEvent = store.logAuditEvent({
      type: 'smoke.manual',
      entityType: 'host',
      entityId: host.id,
      message: 'manual smoke event',
      metadata: { nested: { ok: true }, list: ['a', 'b'] },
    });
    assert('audit event id assigned', manualEvent.id.length > 0);

    const result = await store.testConnection(host.id);
    assertEqual('connection test failed through injected probe', result.status, 'failed');
    assertEqual('connection test error code kept', result.errorCode, 'ECONNREFUSED');
    assertEqual('host failure status updated', store.getHost(host.id).lastConnectionStatus, 'failed');
    assert('connection audit written', store.listAuditEvents().some((event) => event.type === 'host.connection_test'));

    store.close();
    assertSchemaTables(dir);

    const reopened = new MvpSqliteStore(() => dir, probe);
    try {
      assertEqual('reopened host count persisted', reopened.listHosts().length, 1);
      assertEqual('reopened host name persisted', reopened.getHost(host.id).name, 'Local updated');
      assertEqual('reopened settings persisted', reopened.getSettings().theme, 'light');
      assert(
        'reopened audit metadata persisted',
        reopened.listAuditEvents().some((event) => event.metadata && event.metadata.nested),
      );
    } finally {
      reopened.close();
    }
  });
}

async function caseJsonMigration() {
  console.log('case: best-effort JSON migration');
  await withTempDir(async (dir) => {
    const jsonPath = join(dir, 'switchboardos-mvp.json');
    const migratedHost = {
      id: 'json-host-1',
      name: 'JSON host',
      address: '192.0.2.10',
      hostname: 'json.example',
      port: 2200,
      username: 'json-user',
      authMode: 'key',
      keyPath: '~/.ssh/json_id_ed25519',
      tags: ['json'],
      notes: 'from json',
      lastConnectionStatus: 'success',
      lastCheckedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const migratedAudit = {
      id: 'json-audit-1',
      type: 'json.migrated',
      entityType: 'host',
      entityId: migratedHost.id,
      message: 'migrated audit',
      createdAt: '2026-01-01T00:01:00.000Z',
      metadata: { source: 'json' },
    };
    writeFileSync(
      jsonPath,
      `${JSON.stringify({
        schemaVersion: 1,
        hosts: [migratedHost],
        auditEvents: [migratedAudit],
        settings: {
          theme: 'system',
          defaultWindowBehavior: 'tile-right',
          sshDefaults: {
            port: 2222,
            username: 'json-default',
            authMode: 'agent',
            connectTimeoutMs: 4321,
          },
          operator: {
            endpoint: 'http://json.operator.invalid',
            policy: 'disabled',
          },
        },
      })}\n`,
      'utf8',
    );

    const store = new MvpSqliteStore(() => dir, async (input) => ({
      success: false,
      addressTried: input.address,
      portTried: input.port,
      latencyMs: 0,
      protocolDetected: 'unknown',
      errorCode: 'ESMOKE',
      errorMessage: 'smoke probe',
    }));

    try {
      assertEqual('migrated host count', store.listHosts().length, 1);
      assertEqual('migrated host preserved', store.getHost(migratedHost.id).name, 'JSON host');
      assertEqual('migrated host key path preserved', store.getHost(migratedHost.id).keyPath, '~/.ssh/json_id_ed25519');
      assertEqual('migrated settings preserved', store.getSettings().sshDefaults.username, 'json-default');
      assertEqual('migrated audit count', store.listAuditEvents().length, 1);
      assert('json file not deleted', existsSync(jsonPath));
    } finally {
      store.close();
    }
  });
}

async function main() {
  await caseCrudPersistenceAndFailureProbe();
  await caseJsonMigration();

  if (failures > 0) {
    console.error(`\n${failures} smoke assertion(s) failed.`);
    process.exit(1);
  }

  console.log('\nAll SQLite store smoke assertions passed.');
}

main().catch((err) => {
  console.error('SQLite store smoke runner crashed:', err);
  process.exit(2);
});
