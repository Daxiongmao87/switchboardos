import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type {
  AuditEvent,
  ConnectionTestResult,
  CreateAuditEventInput,
  CreateHostInput,
  HostAuthMode,
  HostConnectionStatus,
  HostRecord,
  MvpSettings,
  MvpSettingsUpdate,
  MvpStoreState,
  UpdateHostInput,
} from '../shared/mvp-models';
import { probeHost, type ProbeInput, type ProbeResult } from './host-connection-tester';

export type HostProbe = (input: ProbeInput) => Promise<ProbeResult>;

const DB_FILE_NAME = 'switchboardos-mvp.sqlite';
const JSON_FILE_NAME = 'switchboardos-mvp.json';

const AUTH_MODES: readonly HostAuthMode[] = ['placeholder', 'password', 'key', 'agent'];
const CONNECTION_STATUSES: readonly HostConnectionStatus[] = ['untested', 'stubbed', 'success', 'failed'];

const DEFAULT_SETTINGS: MvpSettings = {
  theme: 'dark',
  defaultWindowBehavior: 'floating',
  sshDefaults: {
    port: 22,
    username: '',
    authMode: 'placeholder',
    connectTimeoutMs: 10000,
  },
  operator: {
    endpoint: '',
    policy: 'manual-approval',
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultState(): MvpStoreState {
  return {
    schemaVersion: 1,
    hosts: [],
    auditEvents: [],
    settings: clone(DEFAULT_SETTINGS),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStringValue(value: unknown, fallback: string | null): string | null {
  return typeof value === 'string' || value === null ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function metadataValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function authModeValue(value: unknown, fallback: HostAuthMode): HostAuthMode {
  return typeof value === 'string' && AUTH_MODES.includes(value as HostAuthMode)
    ? (value as HostAuthMode)
    : fallback;
}

function connectionStatusValue(value: unknown, fallback: HostConnectionStatus): HostConnectionStatus {
  return typeof value === 'string' && CONNECTION_STATUSES.includes(value as HostConnectionStatus)
    ? (value as HostConnectionStatus)
    : fallback;
}

function windowBehaviorValue(
  value: unknown,
  fallback: MvpSettings['defaultWindowBehavior'],
): MvpSettings['defaultWindowBehavior'] {
  return value === 'floating' || value === 'tile-right' || value === 'tile-bottom' ? value : fallback;
}

function themeValue(value: unknown, fallback: MvpSettings['theme']): MvpSettings['theme'] {
  return value === 'system' || value === 'dark' || value === 'light' ? value : fallback;
}

function operatorPolicyValue(
  value: unknown,
  fallback: MvpSettings['operator']['policy'],
): MvpSettings['operator']['policy'] {
  return value === 'manual-approval' || value === 'disabled' ? value : fallback;
}

function normalizeSettings(value: unknown): MvpSettings {
  if (!isRecord(value)) {
    return clone(DEFAULT_SETTINGS);
  }

  const sshDefaults = isRecord(value.sshDefaults) ? value.sshDefaults : {};
  const operator = isRecord(value.operator) ? value.operator : {};

  return {
    theme: themeValue(value.theme, DEFAULT_SETTINGS.theme),
    defaultWindowBehavior: windowBehaviorValue(value.defaultWindowBehavior, DEFAULT_SETTINGS.defaultWindowBehavior),
    sshDefaults: {
      port: numberValue(sshDefaults.port, DEFAULT_SETTINGS.sshDefaults.port),
      username: stringValue(sshDefaults.username, DEFAULT_SETTINGS.sshDefaults.username),
      authMode: authModeValue(sshDefaults.authMode, DEFAULT_SETTINGS.sshDefaults.authMode),
      connectTimeoutMs: numberValue(sshDefaults.connectTimeoutMs, DEFAULT_SETTINGS.sshDefaults.connectTimeoutMs),
    },
    operator: {
      endpoint: stringValue(operator.endpoint, DEFAULT_SETTINGS.operator.endpoint),
      policy: operatorPolicyValue(operator.policy, DEFAULT_SETTINGS.operator.policy),
    },
  };
}

function normalizeHost(value: unknown): HostRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value.id, '');
  if (!id) {
    return null;
  }

  const address = stringValue(value.address, stringValue(value.hostname, ''));

  return {
    id,
    name: stringValue(value.name, 'Untitled host'),
    address,
    hostname: stringValue(value.hostname, address),
    port: numberValue(value.port, DEFAULT_SETTINGS.sshDefaults.port),
    username: stringValue(value.username, DEFAULT_SETTINGS.sshDefaults.username),
    authMode: authModeValue(value.authMode, DEFAULT_SETTINGS.sshDefaults.authMode),
    tags: stringArrayValue(value.tags),
    notes: stringValue(value.notes, ''),
    lastConnectionStatus: connectionStatusValue(value.lastConnectionStatus, 'untested'),
    lastCheckedAt: nullableStringValue(value.lastCheckedAt, null),
    createdAt: stringValue(value.createdAt, new Date(0).toISOString()),
    updatedAt: stringValue(value.updatedAt, new Date(0).toISOString()),
  };
}

function normalizeAuditEvent(value: unknown): AuditEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringValue(value.id, '');
  if (!id) {
    return null;
  }

  const event: AuditEvent = {
    id,
    type: stringValue(value.type, 'unknown'),
    entityType: stringValue(value.entityType, 'system'),
    entityId: nullableStringValue(value.entityId, null),
    message: stringValue(value.message, ''),
    createdAt: stringValue(value.createdAt, new Date(0).toISOString()),
  };

  const meta = metadataValue(value.metadata);
  if (meta) {
    event.metadata = meta;
  }

  return event;
}

function normalizeState(value: unknown): MvpStoreState {
  if (!isRecord(value)) {
    return defaultState();
  }

  return {
    schemaVersion: 1,
    hosts: Array.isArray(value.hosts)
      ? value.hosts.map(normalizeHost).filter((host): host is HostRecord => host !== null)
      : [],
    auditEvents: Array.isArray(value.auditEvents)
      ? value.auditEvents.map(normalizeAuditEvent).filter((event): event is AuditEvent => event !== null)
      : [],
    settings: normalizeSettings(value.settings),
  };
}

function buildConnectionTestMessage(probe: ProbeResult): string {
  const target = `${probe.addressTried || '<no address>'}:${probe.portTried}`;
  if (probe.success) {
    const latency = `${probe.latencyMs} ms`;
    if (probe.protocolDetected === 'ssh' && probe.banner) {
      return `TCP reachable at ${target} in ${latency}. SSH banner: ${probe.banner}. Credential auth was not attempted.`;
    }
    if (probe.banner) {
      return `TCP reachable at ${target} in ${latency}. Service banner: ${probe.banner}. Credential auth was not attempted.`;
    }
    return `TCP reachable at ${target} in ${latency}. No banner received within window. Credential auth was not attempted.`;
  }
  const reason = probe.errorMessage || probe.errorCode || 'Connection failed.';
  return `TCP reachability check to ${target} failed: ${reason}`;
}

function rowToHost(row: Record<string, unknown>): HostRecord {
  return {
    id: stringValue(row.id, ''),
    name: stringValue(row.name, 'Untitled host'),
    address: stringValue(row.address, ''),
    hostname: stringValue(row.hostname, ''),
    port: numberValue(row.port, 22),
    username: stringValue(row.username, ''),
    authMode: authModeValue(row.auth_mode, 'placeholder'),
    tags: stringArrayValue(JSON.parse(stringValue(row.tags, '[]'))),
    notes: stringValue(row.notes, ''),
    lastConnectionStatus: connectionStatusValue(row.last_connection_status, 'untested'),
    lastCheckedAt: nullableStringValue(row.last_checked_at, null),
    createdAt: stringValue(row.created_at, new Date(0).toISOString()),
    updatedAt: stringValue(row.updated_at, new Date(0).toISOString()),
  };
}

function rowToAuditEvent(row: Record<string, unknown>): AuditEvent {
  const event: AuditEvent = {
    id: stringValue(row.id, ''),
    type: stringValue(row.type, 'unknown'),
    entityType: stringValue(row.entity_type, 'system'),
    entityId: nullableStringValue(row.entity_id, null),
    message: stringValue(row.message, ''),
    createdAt: stringValue(row.created_at, new Date(0).toISOString()),
  };
  const metaRaw = stringValue(row.metadata, '{}');
  try {
    const parsed = JSON.parse(metaRaw) as unknown;
    const meta = metadataValue(parsed);
    if (meta) {
      event.metadata = meta;
    }
  } catch {
    // ignore malformed metadata
  }
  return event;
}

function rowToSettings(row: Record<string, unknown>): MvpSettings {
  const sshDefaultsRaw = stringValue(row.ssh_defaults, '{}');
  const operatorRaw = stringValue(row.operator, '{}');
  let sshDefaults: Record<string, unknown> = {};
  let operator: Record<string, unknown> = {};
  try {
    sshDefaults = isRecord(JSON.parse(sshDefaultsRaw)) ? (JSON.parse(sshDefaultsRaw) as Record<string, unknown>) : {};
  } catch {
    // ignore
  }
  try {
    operator = isRecord(JSON.parse(operatorRaw)) ? (JSON.parse(operatorRaw) as Record<string, unknown>) : {};
  } catch {
    // ignore
  }

  return normalizeSettings({
    theme: stringValue(row.theme, 'dark'),
    defaultWindowBehavior: stringValue(row.default_window_behavior, 'floating'),
    sshDefaults,
    operator,
  });
}

export class MvpSqliteStore {
  private db: Database.Database | null = null;

  constructor(
    private readonly getUserDataPath: () => string,
    private readonly probe: HostProbe = probeHost,
  ) {}

  listHosts(): HostRecord[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM hosts ORDER BY created_at ASC').all() as Record<string, unknown>[];
    return rows.map(rowToHost).map(clone);
  }

  getHost(hostId: string): HostRecord | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM hosts WHERE id = ?').get(hostId) as Record<string, unknown> | undefined;
    return row ? clone(rowToHost(row)) : null;
  }

  createHost(input: CreateHostInput = {}): HostRecord {
    this.ensureDb();
    const now = new Date().toISOString();
    const address = stringValue(input.address, stringValue(input.hostname, ''));
    const host: HostRecord = {
      id: randomUUID(),
      name: stringValue(input.name, address || 'Untitled host'),
      address,
      hostname: stringValue(input.hostname, address),
      port: numberValue(input.port, this.getSettings().sshDefaults.port),
      username: stringValue(input.username, this.getSettings().sshDefaults.username),
      authMode: authModeValue(input.authMode, this.getSettings().sshDefaults.authMode),
      tags: stringArrayValue(input.tags),
      notes: stringValue(input.notes, ''),
      lastConnectionStatus: 'untested',
      lastCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.db!
      .prepare(
        `INSERT INTO hosts (id, name, address, hostname, port, username, auth_mode, tags, notes, last_connection_status, last_checked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        host.id,
        host.name,
        host.address,
        host.hostname,
        host.port,
        host.username,
        host.authMode,
        JSON.stringify(host.tags),
        host.notes,
        host.lastConnectionStatus,
        host.lastCheckedAt,
        host.createdAt,
        host.updatedAt,
      );

    return clone(host);
  }

  updateHost(hostId: string, input: UpdateHostInput = {}): HostRecord | null {
    this.ensureDb();
    const existing = this.getHost(hostId);
    if (!existing) {
      return null;
    }

    const address = stringValue(input.address, stringValue(input.hostname, existing.address));
    const updated: HostRecord = {
      ...existing,
      name: stringValue(input.name, existing.name),
      address,
      hostname: stringValue(input.hostname, address),
      port: numberValue(input.port, existing.port),
      username: stringValue(input.username, existing.username),
      authMode: authModeValue(input.authMode, existing.authMode),
      tags: input.tags === undefined ? existing.tags : stringArrayValue(input.tags),
      notes: stringValue(input.notes, existing.notes),
      updatedAt: new Date().toISOString(),
    };

    this.db!
      .prepare(
        `UPDATE hosts SET
          name = ?,
          address = ?,
          hostname = ?,
          port = ?,
          username = ?,
          auth_mode = ?,
          tags = ?,
          notes = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.address,
        updated.hostname,
        updated.port,
        updated.username,
        updated.authMode,
        JSON.stringify(updated.tags),
        updated.notes,
        updated.updatedAt,
        updated.id,
      );

    return clone(updated);
  }

  deleteHost(hostId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM hosts WHERE id = ?').run(hostId);
    return result.changes > 0;
  }

  async testConnection(hostId: string): Promise<ConnectionTestResult> {
    this.ensureDb();
    const hostBefore = this.getHost(hostId);

    if (!hostBefore) {
      const checkedAt = new Date().toISOString();
      const result: ConnectionTestResult = {
        hostId,
        status: 'not_found',
        success: false,
        message: 'Host record was not found. Reachability check was not attempted.',
        checkedAt,
      };
      this.logAuditEvent({
        type: 'host.connection_test',
        entityType: 'host',
        entityId: hostId,
        message: result.message,
        metadata: { status: result.status, success: result.success },
      });
      return result;
    }

    const probeAddress = hostBefore.address || hostBefore.hostname;
    const probePort = hostBefore.port;
    const timeoutMs = this.getSettings().sshDefaults.connectTimeoutMs;

    const probeOutcome = await this.probe({
      address: probeAddress,
      port: probePort,
      timeoutMs,
    });

    const checkedAt = new Date().toISOString();
    const status: ConnectionTestResult['status'] = probeOutcome.success ? 'success' : 'failed';
    const message = buildConnectionTestMessage(probeOutcome);

    const result: ConnectionTestResult = {
      hostId,
      status,
      success: probeOutcome.success,
      message,
      checkedAt,
      address: probeOutcome.addressTried,
      port: probeOutcome.portTried,
      latencyMs: probeOutcome.latencyMs,
      protocolDetected: probeOutcome.protocolDetected,
    };
    if (probeOutcome.banner) {
      result.banner = probeOutcome.banner;
    }
    if (probeOutcome.errorCode) {
      result.errorCode = probeOutcome.errorCode;
    }

    this.db!
      .prepare(
        `UPDATE hosts SET last_connection_status = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(probeOutcome.success ? 'success' : 'failed', checkedAt, checkedAt, hostId);

    this.logAuditEvent({
      type: 'host.connection_test',
      entityType: 'host',
      entityId: hostId,
      message,
      metadata: {
        status,
        success: probeOutcome.success,
        address: probeOutcome.addressTried,
        port: probeOutcome.portTried,
        latencyMs: probeOutcome.latencyMs,
        protocolDetected: probeOutcome.protocolDetected,
        banner: probeOutcome.banner ?? null,
        errorCode: probeOutcome.errorCode ?? null,
      },
    });

    return result;
  }

  getSettings(): MvpSettings {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown> | undefined;
    return row ? clone(rowToSettings(row)) : clone(DEFAULT_SETTINGS);
  }

  updateSettings(update: MvpSettingsUpdate = {}): MvpSettings {
    this.ensureDb();
    const current = this.getSettings();
    const next = normalizeSettings({
      ...current,
      ...update,
      sshDefaults: {
        ...current.sshDefaults,
        ...(update.sshDefaults ?? {}),
      },
      operator: {
        ...current.operator,
        ...(update.operator ?? {}),
      },
    });

    this.db!
      .prepare(
        `INSERT INTO settings (id, theme, default_window_behavior, ssh_defaults, operator)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           theme = excluded.theme,
           default_window_behavior = excluded.default_window_behavior,
           ssh_defaults = excluded.ssh_defaults,
           operator = excluded.operator`,
      )
      .run(next.theme, next.defaultWindowBehavior, JSON.stringify(next.sshDefaults), JSON.stringify(next.operator));

    return clone(next);
  }

  listAuditEvents(): AuditEvent[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM audit_events ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map(rowToAuditEvent).map(clone);
  }

  logAuditEvent(
    input: CreateAuditEventInput = {
      type: 'audit.event',
      entityType: 'system',
      message: '',
    },
  ): AuditEvent {
    this.ensureDb();
    const event = this.buildAuditEvent(input, new Date().toISOString());

    this.db!
      .prepare(
        `INSERT INTO audit_events (id, type, entity_type, entity_id, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(event.id, event.type, event.entityType, event.entityId, event.message, JSON.stringify(event.metadata ?? null), event.createdAt);

    return clone(event);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private buildAuditEvent(input: CreateAuditEventInput, createdAt: string): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      type: stringValue(input.type, 'audit.event'),
      entityType: stringValue(input.entityType, 'system'),
      entityId: input.entityId ?? null,
      message: stringValue(input.message, ''),
      createdAt,
    };

    const meta = metadataValue(input.metadata);
    if (meta) {
      event.metadata = meta;
    }

    return event;
  }

  private ensureDb(): void {
    if (this.db) {
      return;
    }

    const dbPath = join(this.getUserDataPath(), DB_FILE_NAME);
    mkdirSync(dirname(dbPath), { recursive: true });

    const isNew = !existsSync(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.runMigrations();

    if (isNew) {
      this.seedDefaults();
      this.maybeMigrateFromJson();
    }
  }

  private runMigrations(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hosts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Untitled host',
        address TEXT NOT NULL DEFAULT '',
        hostname TEXT NOT NULL DEFAULT '',
        port INTEGER NOT NULL DEFAULT 22,
        username TEXT NOT NULL DEFAULT '',
        auth_mode TEXT NOT NULL DEFAULT 'placeholder',
        tags TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        last_connection_status TEXT NOT NULL DEFAULT 'untested',
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL DEFAULT 'dark',
        default_window_behavior TEXT NOT NULL DEFAULT 'floating',
        ssh_defaults TEXT NOT NULL DEFAULT '{}',
        operator TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
    `);
    this.db!
      .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run('schema_version', '1');
  }

  private seedDefaults(): void {
    const defaults = clone(DEFAULT_SETTINGS);
    this.db!
      .prepare(
        `INSERT INTO settings (id, theme, default_window_behavior, ssh_defaults, operator)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(defaults.theme, defaults.defaultWindowBehavior, JSON.stringify(defaults.sshDefaults), JSON.stringify(defaults.operator));
  }

  private maybeMigrateFromJson(): void {
    const jsonPath = join(this.getUserDataPath(), JSON_FILE_NAME);
    if (!existsSync(jsonPath)) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as unknown;
    } catch {
      return;
    }

    const state = normalizeState(parsed);

    const insertHost = this.db!.prepare(
      `INSERT INTO hosts (id, name, address, hostname, port, username, auth_mode, tags, notes, last_connection_status, last_checked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );

    const insertAudit = this.db!.prepare(
      `INSERT INTO audit_events (id, type, entity_type, entity_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );

    const insertSettings = this.db!.prepare(
      `INSERT INTO settings (id, theme, default_window_behavior, ssh_defaults, operator)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         theme = excluded.theme,
         default_window_behavior = excluded.default_window_behavior,
         ssh_defaults = excluded.ssh_defaults,
         operator = excluded.operator`,
    );

    const migrate = this.db!.transaction(() => {
      for (const host of state.hosts) {
        insertHost.run(
          host.id,
          host.name,
          host.address,
          host.hostname,
          host.port,
          host.username,
          host.authMode,
          JSON.stringify(host.tags),
          host.notes,
          host.lastConnectionStatus,
          host.lastCheckedAt,
          host.createdAt,
          host.updatedAt,
        );
      }

      for (const event of state.auditEvents) {
        insertAudit.run(
          event.id,
          event.type,
          event.entityType,
          event.entityId,
          event.message,
          JSON.stringify(event.metadata ?? null),
          event.createdAt,
        );
      }

      insertSettings.run(
        state.settings.theme,
        state.settings.defaultWindowBehavior,
        JSON.stringify(state.settings.sshDefaults),
        JSON.stringify(state.settings.operator),
      );
    });

    migrate();
  }
}
