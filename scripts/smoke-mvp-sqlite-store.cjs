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
    for (const table of ['audit_events', 'hosts', 'meta', 'settings', 'host_groups', 'host_tags', 'host_tag_assignments', 'credential_refs', 'app_manifests', 'app_permissions', 'agent_endpoints', 'bootstrap_presets', 'bootstrap_runs', 'command_history', 'workspace_profiles', 'workspace_state']) {
      assert(`schema has ${table}`, rows.includes(table), JSON.stringify(rows));
    }
    const hostColumns = db.pragma('table_info(hosts)').map((row) => row.name);
    assert('hosts schema has key_path', hostColumns.includes('key_path'), JSON.stringify(hostColumns));
    for (const column of ['credential_ref_id', 'os_hint', 'bootstrap_status', 'default_shell', 'default_working_directory', 'capabilities_json']) {
      assert(`hosts schema has ${column}`, hostColumns.includes(column), JSON.stringify(hostColumns));
    }
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
      credentialRefId: 'cred-smoke-1',
      tags: ['local', 'smoke'],
      group: 'smoke-group',
      favorite: true,
      osHint: 'ubuntu',
      bootstrapStatus: 'ready',
      defaultShell: '/bin/bash',
      defaultWorkingDirectory: '/srv/app',
      capabilities: ['ssh', 'systemctl', 'journalctl'],
      notes: 'created by smoke',
    });

    assert('host id assigned', typeof host.id === 'string' && host.id.length > 0);
    assertEqual('created host listed', store.listHosts().length, 1);
    assertEqual('created host auth mode', store.getHost(host.id).authMode, 'key');
    assertEqual('created host key path reference', store.getHost(host.id).keyPath, '/tmp/switchboardos-smoke-key');
    assertEqual('created host credential reference', store.getHost(host.id).credentialRefId, 'cred-smoke-1');
    assertEqual('created host group', store.getHost(host.id).group, 'smoke-group');
    assertEqual('created host os hint', store.getHost(host.id).osHint, 'ubuntu');
    assertEqual('created host bootstrap status', store.getHost(host.id).bootstrapStatus, 'ready');
    assertEqual('created host default shell', store.getHost(host.id).defaultShell, '/bin/bash');
    assertEqual('created host working directory', store.getHost(host.id).defaultWorkingDirectory, '/srv/app');
    assertEqual('created host capabilities', store.getHost(host.id).capabilities.join(','), 'ssh,systemctl,journalctl');

    const updated = store.updateHost(host.id, {
      name: 'Local updated',
      tags: ['updated'],
      bootstrapStatus: 'pending',
      capabilities: ['ssh'],
      notes: 'updated by smoke',
    });
    assertEqual('updated host returned', updated && updated.name, 'Local updated');
    assertEqual('updated host tags persisted in memory', store.getHost(host.id).tags.join(','), 'updated');
    assertEqual('updated host preserves key path reference', store.getHost(host.id).keyPath, '/tmp/switchboardos-smoke-key');
    assertEqual('updated host preserves credential reference', store.getHost(host.id).credentialRefId, 'cred-smoke-1');
    assertEqual('updated host bootstrap status', store.getHost(host.id).bootstrapStatus, 'pending');
    assertEqual('updated host capabilities', store.getHost(host.id).capabilities.join(','), 'ssh');

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
      assertEqual('reopened host credential reference persisted', reopened.getHost(host.id).credentialRefId, 'cred-smoke-1');
      assertEqual('reopened host os hint persisted', reopened.getHost(host.id).osHint, 'ubuntu');
      assertEqual('reopened host bootstrap status persisted', reopened.getHost(host.id).bootstrapStatus, 'pending');
      assertEqual('reopened host capabilities persisted', reopened.getHost(host.id).capabilities.join(','), 'ssh');
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

async function caseStaleDbMigration() {
  console.log('case: stale DB schema migration');
  await withTempDir(async (dir) => {
    const dbPath = join(dir, 'switchboardos-mvp.sqlite');
    const db = new Database(dbPath);
    try {
      // Simulate an old schema missing tags, key_path, and notes
      db.exec(`
        CREATE TABLE hosts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'Untitled host',
          address TEXT NOT NULL DEFAULT '',
          hostname TEXT NOT NULL DEFAULT '',
          port INTEGER NOT NULL DEFAULT 22,
          username TEXT NOT NULL DEFAULT '',
          auth_mode TEXT NOT NULL DEFAULT 'placeholder',
          last_connection_status TEXT NOT NULL DEFAULT 'untested',
          last_checked_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          theme TEXT NOT NULL DEFAULT 'dark',
          default_window_behavior TEXT NOT NULL DEFAULT 'floating',
          ssh_defaults TEXT NOT NULL DEFAULT '{}',
          operator TEXT NOT NULL DEFAULT '{}'
        );
        CREATE TABLE audit_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          message TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO hosts (id, name, address, port, username, auth_mode, created_at, updated_at)
          VALUES ('old-host-1', 'Old Host', '192.0.2.1', 22, 'root', 'fixture-auth-placeholder', '2023-01-01T00:00:00Z', '2023-01-01T00:00:00Z');
      `);
    } finally {
      db.close();
    }

    const store = new MvpSqliteStore(() => dir, async (input) => ({
      success: false,
      addressTried: input.address,
      portTried: input.port,
      latencyMs: 0,
      protocolDetected: 'unknown',
      errorCode: 'ESTALE',
      errorMessage: 'stale probe',
    }));

    try {
      assertEqual('stale db host count', store.listHosts().length, 1);
      const oldHost = store.getHost('old-host-1');
      assertEqual('stale db old host name', oldHost.name, 'Old Host');
      assertEqual('stale db old host tags default', JSON.stringify(oldHost.tags), '[]');
      assertEqual('stale db old host keyPath default', oldHost.keyPath, undefined);
      assertEqual('stale db old host credentialRefId default', oldHost.credentialRefId, null);
      assertEqual('stale db old host os hint default', oldHost.osHint, 'unknown');
      assertEqual('stale db old host bootstrap status default', oldHost.bootstrapStatus, 'unknown');
      assertEqual('stale db old host default shell default', oldHost.defaultShell, '');
      assertEqual('stale db old host working directory default', oldHost.defaultWorkingDirectory, '');
      assertEqual('stale db old host capabilities default', JSON.stringify(oldHost.capabilities), '[]');
      assertEqual('stale db old host notes default', oldHost.notes, '');

      const newHost = store.createHost({
        name: 'New After Migrate',
        address: '10.0.0.1',
        tags: ['migrated'],
        osHint: 'debian',
        bootstrapStatus: 'not_started',
        defaultShell: '/bin/sh',
        defaultWorkingDirectory: '/opt',
        capabilities: ['ssh'],
        notes: 'should work',
      });
      assert('stale db new host created', newHost.id && newHost.name === 'New After Migrate');
      assertEqual('stale db new host tags', newHost.tags.join(','), 'migrated');
      assertEqual('stale db new host os hint', newHost.osHint, 'debian');
      assertEqual('stale db new host capabilities', newHost.capabilities.join(','), 'ssh');
      assertEqual('stale db new host notes', newHost.notes, 'should work');
    } finally {
      store.close();
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
      credentialRefId: 'json-credential-ref',
      tags: ['json'],
      group: 'json-group',
      favorite: true,
      osHint: 'debian',
      bootstrapStatus: 'ready',
      defaultShell: '/bin/zsh',
      defaultWorkingDirectory: '/home/json-user',
      capabilities: ['ssh', 'journalctl'],
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
      assertEqual('migrated host credential ref preserved', store.getHost(migratedHost.id).credentialRefId, 'json-credential-ref');
      assertEqual('migrated host group preserved', store.getHost(migratedHost.id).group, 'json-group');
      assertEqual('migrated host os hint preserved', store.getHost(migratedHost.id).osHint, 'debian');
      assertEqual('migrated host bootstrap status preserved', store.getHost(migratedHost.id).bootstrapStatus, 'ready');
      assertEqual('migrated host default shell preserved', store.getHost(migratedHost.id).defaultShell, '/bin/zsh');
      assertEqual('migrated host capabilities preserved', store.getHost(migratedHost.id).capabilities.join(','), 'ssh,journalctl');
      assertEqual('migrated settings preserved', store.getSettings().sshDefaults.username, 'json-default');
      assertEqual('migrated audit count', store.listAuditEvents().length, 1);
      assert('json file not deleted', existsSync(jsonPath));
    } finally {
      store.close();
    }
  });
}

async function caseWorkspaceProfiles() {
  console.log('case: workspace profiles CRUD, active profile, persistence');
  await withTempDir(async (dir) => {
    const store = new MvpSqliteStore(() => dir);

    assertEqual('no profiles initially', store.listWorkspaceProfiles().length, 0);
    assertEqual('no active profile initially', store.getActiveWorkspaceProfileId(), null);

    const defaultProfile1 = store.createWorkspaceProfile({
      name: 'Default workspace',
      layout: { desktopShortcutIds: ['hosts'], windows: [] },
    });
    const defaultProfile2 = store.createWorkspaceProfile({
      name: 'Default workspace',
      layout: { desktopShortcutIds: ['terminal'], windows: [] },
    });
    assertEqual('default profile deduped id', defaultProfile2.profileId, defaultProfile1.profileId);
    assertEqual(
      'default profile deduped count',
      store.listWorkspaceProfiles().filter((profile) => profile.name === 'Default workspace').length,
      1,
    );
    assert('default profile cleanup delete', store.deleteWorkspaceProfile(defaultProfile1.profileId));
    assertEqual('no profiles after default dedupe cleanup', store.listWorkspaceProfiles().length, 0);

    const profile1 = store.createWorkspaceProfile({
      name: 'Dev workspace',
      layout: {
        desktopShortcutIds: ['hosts', 'terminal'],
        windows: [
          {
            windowId: 'win-1',
            appId: 'hosts',
            hostId: null,
            title: 'Hosts',
            bounds: { x: 10, y: 20, width: 300, height: 400 },
            state: 'floating',
            tilePosition: null,
            zIndex: 1,
          },
        ],
      },
    });

    assert('profile1 id assigned', typeof profile1.profileId === 'string' && profile1.profileId.length > 0);
    assertEqual('profile1 name', profile1.name, 'Dev workspace');
    assertEqual('profile1 shortcuts', JSON.stringify(profile1.layout.desktopShortcutIds), '["hosts","terminal"]');
    assertEqual('profile1 windows count', profile1.layout.windows.length, 1);
    assertEqual('listed after create', store.listWorkspaceProfiles().length, 1);

    store.setActiveWorkspaceProfileId(profile1.profileId);
    assertEqual('active profile id', store.getActiveWorkspaceProfileId(), profile1.profileId);

    const profile2 = store.createWorkspaceProfile({
      name: 'Ops workspace',
      layout: { desktopShortcutIds: ['audit'], windows: [] },
    });

    assertEqual('listed after second create', store.listWorkspaceProfiles().length, 2);

    const updated = store.updateWorkspaceProfile(profile1.profileId, {
      name: 'Dev workspace updated',
      layout: {
        desktopShortcutIds: ['hosts', 'terminal', 'settings'],
        windows: [
          {
            windowId: 'win-2',
            appId: 'settings',
            hostId: null,
            title: 'Settings',
            bounds: { x: 0, y: 0, width: 200, height: 200 },
            state: 'tiled',
            tilePosition: 'right',
            zIndex: 2,
          },
        ],
      },
    });

    assertEqual('updated name', updated && updated.name, 'Dev workspace updated');
    assertEqual('updated shortcuts', updated && JSON.stringify(updated.layout.desktopShortcutIds), '["hosts","terminal","settings"]');

    const fetched = store.getWorkspaceProfile(profile1.profileId);
    assertEqual('fetched name', fetched && fetched.name, 'Dev workspace updated');

    const deleted = store.deleteWorkspaceProfile(profile2.profileId);
    assert('delete success', deleted);
    assertEqual('listed after delete', store.listWorkspaceProfiles().length, 1);

    store.close();

    // Reopen and verify persistence
    const reopened = new MvpSqliteStore(() => dir);
    assertEqual('reopened profile count', reopened.listWorkspaceProfiles().length, 1);
    assertEqual('reopened active profile', reopened.getActiveWorkspaceProfileId(), profile1.profileId);
    const reopenedProfile = reopened.getWorkspaceProfile(profile1.profileId);
    assertEqual('reopened profile name', reopenedProfile && reopenedProfile.name, 'Dev workspace updated');
    assertEqual('reopened layout shortcuts', reopenedProfile && JSON.stringify(reopenedProfile.layout.desktopShortcutIds), '["hosts","terminal","settings"]');
    reopened.close();
  });
}

async function caseNewEntityTables() {
  console.log('case: new entity tables (host groups, tags, credential refs, app manifests, agent endpoints, bootstrap runs, command history)');
  await withTempDir(async (dir) => {
    const store = new MvpSqliteStore(() => dir);

    // ---- Host Groups ----
    const group1 = store.createHostGroup({ name: 'Production', color: '#ff0000' });
    assert('host group created', group1.id && group1.name === 'Production');
    assertEqual('host group color', store.getHostGroup(group1.id).color, '#ff0000');
    assertEqual('list host groups', store.listHostGroups().length, 1);

    const groupUpdated = store.updateHostGroup(group1.id, { name: 'Prod' });
    assertEqual('host group updated name', groupUpdated.name, 'Prod');

    // ---- Host Tags ----
    const tag1 = store.createHostTag({ name: 'web', color: '#00ff00' });
    assert('host tag created', tag1.id && tag1.name === 'web');
    assertEqual('list host tags', store.listHostTags().length, 1);

    const tagUpdated = store.updateHostTag(tag1.id, { color: '#00aa00' });
    assertEqual('host tag updated color', tagUpdated.color, '#00aa00');

    // ---- Credential Refs ----
    const cred1 = store.createCredentialRef({ name: 'prod-key', type: 'file_path', referenceValue: '~/.ssh/prod' });
    assert('credential ref created', cred1.id && cred1.name === 'prod-key');
    assertEqual('credential ref type', store.getCredentialRef(cred1.id).type, 'file_path');
    assertEqual('list credential refs', store.listCredentialRefs().length, 1);

    const credUpdated = store.updateCredentialRef(cred1.id, { referenceValue: '~/.ssh/prod2' });
    assertEqual('credential ref updated', credUpdated.referenceValue, '~/.ssh/prod2');

    // ---- App Manifests ----
    const app1 = store.createAppManifest({ appId: 'app-1', name: 'My App', version: '1.0.0', entrypoint: 'index.js' });
    assert('app manifest created', app1.id && app1.appId === 'app-1');
    assertEqual('app manifest name', store.getAppManifest(app1.id).name, 'My App');
    assertEqual('list app manifests', store.listAppManifests().length, 1);

    // ---- App Permissions ----
    const perm1 = store.createAppPermission({ appId: 'app-1', capability: 'network', granted: true });
    assert('app permission created', perm1.id && perm1.capability === 'network');
    assertEqual('app permission granted', store.getAppPermission(perm1.id).granted, true);
    assertEqual('list app permissions', store.listAppPermissions('app-1').length, 1);

    // ---- Agent Endpoints ----
    const ep1 = store.createAgentEndpoint({ name: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com', model: 'gpt-4' });
    assert('agent endpoint created', ep1.id && ep1.name === 'OpenAI');
    assertEqual('agent endpoint provider', store.getAgentEndpoint(ep1.id).provider, 'openai');
    assertEqual('list agent endpoints', store.listAgentEndpoints().length, 1);

    const epUpdated = store.updateAgentEndpoint(ep1.id, { model: 'gpt-4o' });
    assertEqual('agent endpoint updated model', epUpdated.model, 'gpt-4o');

    // ---- Bootstrap Presets ----
    const preset1 = store.createBootstrapPreset({ presetId: 'preset-1', name: 'Docker Setup', description: 'Install Docker', scriptTemplate: 'apt install docker' });
    assert('bootstrap preset created', preset1.id && preset1.presetId === 'preset-1');
    assertEqual('list bootstrap presets', store.listBootstrapPresets().length, 1);

    // ---- Bootstrap Runs ----
    const run1 = store.createBootstrapRun({ presetId: 'preset-1', hostId: null, scriptOutput: '', status: 'pending' });
    assert('bootstrap run created', run1.id && run1.status === 'pending');
    assertEqual('list bootstrap runs', store.listBootstrapRuns().length, 1);

    const runUpdated = store.updateBootstrapRun(run1.id, { status: 'success', scriptOutput: 'done' });
    assertEqual('bootstrap run updated status', runUpdated.status, 'success');

    // ---- Command History ----
    const entry1 = store.createCommandHistoryEntry({ command: 'ls -la', hostId: 'host-1', sessionId: 'sess-1', exitCode: 0, durationMs: 150 });
    assert('command history entry created', entry1.id && entry1.command === 'ls -la');
    assertEqual('command history exit code', store.getCommandHistoryEntry(entry1.id).exitCode, 0);
    assertEqual('list command history', store.listCommandHistory().length, 1);

    // ---- Host helpers ----
    const host = store.createHost({ name: 'Test', address: '10.0.0.1', tags: ['web'] });
    const hostWithGroup = store.assignHostToGroup(host.id, 'Prod');
    assertEqual('host assigned to group', hostWithGroup.group, 'Prod');

    const hostFav = store.setHostFavorite(host.id, true);
    assertEqual('host favorited', hostFav.favorite, true);

    const dup = store.duplicateHost(host.id);
    assert('host duplicated', dup.id !== host.id && dup.name.includes('copy'));
    assertEqual('host duplicated count', store.listHosts().length, 2);

    // ---- Persistence ----
    store.close();
    const reopened = new MvpSqliteStore(() => dir);
    assertEqual('reopened host groups', reopened.listHostGroups().length, 1);
    assertEqual('reopened host tags', reopened.listHostTags().length, 1);
    assertEqual('reopened credential refs', reopened.listCredentialRefs().length, 1);
    assertEqual('reopened app manifests', reopened.listAppManifests().length, 1);
    assertEqual('reopened app permissions', reopened.listAppPermissions().length, 1);
    assertEqual('reopened agent endpoints', reopened.listAgentEndpoints().length, 1);
    assertEqual('reopened bootstrap presets', reopened.listBootstrapPresets().length, 1);
    assertEqual('reopened bootstrap runs', reopened.listBootstrapRuns().length, 1);
    assertEqual('reopened command history', reopened.listCommandHistory().length, 1);
    assertEqual('reopened host group name', reopened.getHostGroup(group1.id).name, 'Prod');
    assertEqual('reopened host favorite', reopened.getHost(host.id).favorite, true);
    assertEqual('reopened host group assignment', reopened.getHost(host.id).group, 'Prod');
    reopened.close();

    // ---- Deletion ----
    const delStore = new MvpSqliteStore(() => dir);
    assert('delete host group', delStore.deleteHostGroup(group1.id));
    assertEqual('host group deleted', delStore.listHostGroups().length, 0);
    assert('delete host tag', delStore.deleteHostTag(tag1.id));
    assertEqual('host tag deleted', delStore.listHostTags().length, 0);
    assert('delete credential ref', delStore.deleteCredentialRef(cred1.id));
    assertEqual('credential ref deleted', delStore.listCredentialRefs().length, 0);
    assert('delete app permission', delStore.deleteAppPermission(perm1.id));
    assertEqual('app permission deleted', delStore.listAppPermissions().length, 0);
    assert('delete app manifest', delStore.deleteAppManifest(app1.id));
    assertEqual('app manifest deleted', delStore.listAppManifests().length, 0);
    assert('delete agent endpoint', delStore.deleteAgentEndpoint(ep1.id));
    assertEqual('agent endpoint deleted', delStore.listAgentEndpoints().length, 0);
    assert('delete bootstrap run', delStore.deleteBootstrapRun(run1.id));
    assertEqual('bootstrap run deleted', delStore.listBootstrapRuns().length, 0);
    assert('delete bootstrap preset', delStore.deleteBootstrapPreset(preset1.id));
    assertEqual('bootstrap preset deleted', delStore.listBootstrapPresets().length, 0);
    assert('delete command history entry', delStore.deleteCommandHistoryEntry(entry1.id));
    assertEqual('command history deleted', delStore.listCommandHistory().length, 0);
    delStore.close();
  });
}

async function main() {
  await caseCrudPersistenceAndFailureProbe();
  await caseStaleDbMigration();
  await caseJsonMigration();
  await caseWorkspaceProfiles();
  await caseNewEntityTables();

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
