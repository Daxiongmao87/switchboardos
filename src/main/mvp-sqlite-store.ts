import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type {
  AgentEndpoint,
  AppManifest,
  AppPermission,
  AuditEvent,
  BootstrapPresetRecord,
  BootstrapRun,
  CommandHistoryEntry,
  ConnectionTestResult,
  CreateAgentEndpointInput,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateAuditEventInput,
  CreateBootstrapPresetInput,
  CreateBootstrapRunInput,
  CreateCommandHistoryInput,
  CreateCredentialRefInput,
  CreateHostGroupInput,
  CreateHostInput,
  CreateHostTagInput,
  CreateWorkspaceProfileInput,
  CredentialRef,
  HostAuthMode,
  HostBootstrapStatus,
  HostConnectionStatus,
  HostGroup,
  HostRecord,
  HostTag,
  MvpSettings,
  MvpSettingsUpdate,
  MvpStoreState,
  UpdateAgentEndpointInput,
  UpdateAppManifestInput,
  UpdateBootstrapPresetInput,
  UpdateBootstrapRunInput,
  UpdateCredentialRefInput,
  UpdateHostGroupInput,
  UpdateHostInput,
  UpdateHostTagInput,
  UpdateWorkspaceProfileInput,
  WorkspaceProfile,
  WorkspaceLayoutSnapshot,
} from '../shared/mvp-models';
import { probeHost, type ProbeInput, type ProbeResult } from './host-connection-tester';

export type HostProbe = (input: ProbeInput) => Promise<ProbeResult>;

const DB_FILE_NAME = 'switchboardos-mvp.sqlite';
const JSON_FILE_NAME = 'switchboardos-mvp.json';

const AUTH_MODES: readonly HostAuthMode[] = ['placeholder', 'password', 'key', 'agent'];
const CONNECTION_STATUSES: readonly HostConnectionStatus[] = ['untested', 'stubbed', 'success', 'failed'];
const BOOTSTRAP_STATUSES: readonly HostBootstrapStatus[] = ['unknown', 'not_started', 'pending', 'ready', 'failed'];

const DEFAULT_SETTINGS: MvpSettings = {
  theme: 'dark',
  defaultWindowBehavior: 'floating',
  desktopWallpaper: 'default',
  desktopWallpaperLayout: 'fill',
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
  return typeof value === 'string' ? value : value === null ? null : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveIntegerValue(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1 ? true : value === 0 ? false : fallback;
  }
  return fallback;
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

function bootstrapStatusValue(value: unknown, fallback: HostBootstrapStatus): HostBootstrapStatus {
  return typeof value === 'string' && BOOTSTRAP_STATUSES.includes(value as HostBootstrapStatus)
    ? (value as HostBootstrapStatus)
    : fallback;
}

function windowBehaviorValue(
  value: unknown,
  fallback: MvpSettings['defaultWindowBehavior'],
): MvpSettings['defaultWindowBehavior'] {
  return value === 'floating' || value === 'tile-right' || value === 'tile-bottom' ? value : fallback;
}

const DESKTOP_WALLPAPER_MODES: readonly MvpSettings['desktopWallpaper'][] = ['default', 'grid', 'topology', 'plain'];
const DESKTOP_WALLPAPER_LAYOUT_MODES: readonly MvpSettings['desktopWallpaperLayout'][] = ['fill', 'fit', 'stretch', 'fit-tile', 'tile-original', 'center'];

function desktopWallpaperValue(
  value: unknown,
  fallback: MvpSettings['desktopWallpaper'],
): MvpSettings['desktopWallpaper'] {
  return DESKTOP_WALLPAPER_MODES.includes(value as MvpSettings['desktopWallpaper'])
    ? (value as MvpSettings['desktopWallpaper'])
    : fallback;
}

function desktopWallpaperLayoutValue(
  value: unknown,
  fallback: MvpSettings['desktopWallpaperLayout'],
): MvpSettings['desktopWallpaperLayout'] {
  return DESKTOP_WALLPAPER_LAYOUT_MODES.includes(value as MvpSettings['desktopWallpaperLayout'])
    ? (value as MvpSettings['desktopWallpaperLayout'])
    : fallback;
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
    desktopWallpaper: desktopWallpaperValue(value.desktopWallpaper, DEFAULT_SETTINGS.desktopWallpaper),
    desktopWallpaperLayout: desktopWallpaperLayoutValue(
      value.desktopWallpaperLayout,
      DEFAULT_SETTINGS.desktopWallpaperLayout,
    ),
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
    keyPath: stringValue(value.keyPath, '') || undefined,
    credentialRefId: nullableStringValue(value.credentialRefId, null),
    tags: stringArrayValue(value.tags),
    group: stringValue(value.group, '') || undefined,
    favorite: booleanValue(value.favorite, false),
    osHint: stringValue(value.osHint, 'unknown') || 'unknown',
    bootstrapStatus: bootstrapStatusValue(value.bootstrapStatus, 'unknown'),
    defaultShell: stringValue(value.defaultShell, ''),
    defaultWorkingDirectory: stringValue(value.defaultWorkingDirectory, ''),
    capabilities: stringArrayValue(value.capabilities),
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
    keyPath: stringValue(row.key_path, '') || undefined,
    credentialRefId: nullableStringValue(row.credential_ref_id, null),
    tags: stringArrayValue(JSON.parse(stringValue(row.tags, '[]'))),
    group: stringValue(row.group_name, '') || undefined,
    favorite: row.favorite ? true : false,
    osHint: stringValue(row.os_hint, 'unknown') || 'unknown',
    bootstrapStatus: bootstrapStatusValue(row.bootstrap_status, 'unknown'),
    defaultShell: stringValue(row.default_shell, ''),
    defaultWorkingDirectory: stringValue(row.default_working_directory, ''),
    capabilities: stringArrayValue(JSON.parse(stringValue(row.capabilities_json, '[]'))),
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
    desktopWallpaper: stringValue(row.desktop_wallpaper, 'default'),
    desktopWallpaperLayout: stringValue(row.desktop_wallpaper_layout, 'fill'),
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
      keyPath: stringValue(input.keyPath, '').trim() || undefined,
      credentialRefId: input.credentialRefId !== undefined ? (input.credentialRefId ?? null) : null,
      tags: stringArrayValue(input.tags),
      group: stringValue(input.group, ''),
      favorite: booleanValue(input.favorite, false),
      osHint: stringValue(input.osHint, 'unknown').trim() || 'unknown',
      bootstrapStatus: bootstrapStatusValue(input.bootstrapStatus, 'unknown'),
      defaultShell: stringValue(input.defaultShell, '').trim(),
      defaultWorkingDirectory: stringValue(input.defaultWorkingDirectory, '').trim(),
      capabilities: stringArrayValue(input.capabilities),
      notes: stringValue(input.notes, ''),
      lastConnectionStatus: 'untested',
      lastCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.db!
      .prepare(
        `INSERT INTO hosts (id, name, address, hostname, port, username, auth_mode, key_path, credential_ref_id, tags, group_name, favorite, os_hint, bootstrap_status, default_shell, default_working_directory, capabilities_json, notes, last_connection_status, last_checked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        host.id,
        host.name,
        host.address,
        host.hostname,
        host.port,
        host.username,
        host.authMode,
        host.keyPath ?? '',
        host.credentialRefId,
        JSON.stringify(host.tags),
        host.group || '',
        host.favorite ? 1 : 0,
        host.osHint,
        host.bootstrapStatus,
        host.defaultShell,
        host.defaultWorkingDirectory,
        JSON.stringify(host.capabilities),
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
      keyPath: input.keyPath === undefined
        ? existing.keyPath
        : stringValue(input.keyPath, '').trim() || undefined,
      credentialRefId: input.credentialRefId === undefined ? existing.credentialRefId : input.credentialRefId ?? null,
      tags: input.tags === undefined ? existing.tags : stringArrayValue(input.tags),
      group: input.group === undefined ? existing.group : stringValue(input.group, ''),
      favorite: input.favorite === undefined ? existing.favorite : booleanValue(input.favorite, existing.favorite ?? false),
      osHint: input.osHint === undefined ? existing.osHint : stringValue(input.osHint, 'unknown').trim() || 'unknown',
      bootstrapStatus: input.bootstrapStatus === undefined ? existing.bootstrapStatus : bootstrapStatusValue(input.bootstrapStatus, existing.bootstrapStatus),
      defaultShell: input.defaultShell === undefined ? existing.defaultShell : stringValue(input.defaultShell, '').trim(),
      defaultWorkingDirectory: input.defaultWorkingDirectory === undefined ? existing.defaultWorkingDirectory : stringValue(input.defaultWorkingDirectory, '').trim(),
      capabilities: input.capabilities === undefined ? existing.capabilities : stringArrayValue(input.capabilities),
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
          key_path = ?,
          credential_ref_id = ?,
          tags = ?,
          group_name = ?,
          favorite = ?,
          os_hint = ?,
          bootstrap_status = ?,
          default_shell = ?,
          default_working_directory = ?,
          capabilities_json = ?,
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
        updated.keyPath ?? '',
        updated.credentialRefId,
        JSON.stringify(updated.tags),
        updated.group || '',
        updated.favorite ? 1 : 0,
        updated.osHint,
        updated.bootstrapStatus,
        updated.defaultShell,
        updated.defaultWorkingDirectory,
        JSON.stringify(updated.capabilities),
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

  assignHostToGroup(hostId: string, groupName: string): HostRecord | null {
    this.ensureDb();
    const existing = this.getHost(hostId);
    if (!existing) return null;
    return this.updateHost(hostId, { group: groupName });
  }

  setHostFavorite(hostId: string, favorite: boolean): HostRecord | null {
    this.ensureDb();
    const existing = this.getHost(hostId);
    if (!existing) return null;
    return this.updateHost(hostId, { favorite });
  }

  duplicateHost(sourceId: string): HostRecord | null {
    this.ensureDb();
    const source = this.getHost(sourceId);
    if (!source) return null;
    const now = new Date().toISOString();
    const duplicate: HostRecord = {
      ...source,
      id: randomUUID(),
      name: `${source.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    this.createHost(duplicate);
    return duplicate;
  }

  importHosts(hosts: HostRecord[]): string[] {
    this.ensureDb();
    const ids: string[] = [];
    for (const h of hosts) {
      const existing = this.getHost(h.id);
      if (!existing) {
        this.createHost(h);
        ids.push(h.id);
      }
    }
    return ids;
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
        `INSERT INTO settings (id, theme, default_window_behavior, desktop_wallpaper, desktop_wallpaper_layout, ssh_defaults, operator)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           theme = excluded.theme,
           default_window_behavior = excluded.default_window_behavior,
           desktop_wallpaper = excluded.desktop_wallpaper,
           desktop_wallpaper_layout = excluded.desktop_wallpaper_layout,
           ssh_defaults = excluded.ssh_defaults,
           operator = excluded.operator`,
      )
      .run(
        next.theme,
        next.defaultWindowBehavior,
        next.desktopWallpaper,
        next.desktopWallpaperLayout,
        JSON.stringify(next.sshDefaults),
        JSON.stringify(next.operator),
      );

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

  // ============================================================
  // Workspace Profiles
  // ============================================================

  listWorkspaceProfiles(): WorkspaceProfile[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM workspace_profiles ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkspaceProfile(row)).map(clone);
  }

  getWorkspaceProfile(profileId: string): WorkspaceProfile | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM workspace_profiles WHERE profile_id = ?').get(profileId) as Record<string, unknown> | undefined;
    return row ? clone(this.rowToWorkspaceProfile(row)) : null;
  }

  createWorkspaceProfile(input: CreateWorkspaceProfileInput = { name: 'New workspace', layout: { desktopShortcutIds: [], windows: [] } }): WorkspaceProfile {
    this.ensureDb();
    const now = new Date().toISOString();
    const name = stringValue(input.name, 'New workspace').trim() || 'New workspace';

    if (name === 'Default workspace') {
      const existing = this.db!
        .prepare('SELECT * FROM workspace_profiles WHERE name = ? ORDER BY updated_at ASC LIMIT 1')
        .get(name) as Record<string, unknown> | undefined;
      if (existing) {
        return clone(this.rowToWorkspaceProfile(existing));
      }
    }

    const profile: WorkspaceProfile = {
      profileId: `profile-${randomUUID()}`,
      name,
      updatedAt: now,
      layout: this.normalizeWorkspaceLayout(input.layout),
    };

    this.db!
      .prepare(
        `INSERT INTO workspace_profiles (profile_id, name, layout_json, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(profile.profileId, profile.name, JSON.stringify(profile.layout), profile.updatedAt);

    return clone(profile);
  }

  updateWorkspaceProfile(profileId: string, input: UpdateWorkspaceProfileInput = {}): WorkspaceProfile | null {
    this.ensureDb();
    const existing = this.getWorkspaceProfile(profileId);
    if (!existing) {
      return null;
    }

    const updated: WorkspaceProfile = {
      ...existing,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() || existing.name : existing.name,
      layout: input.layout !== undefined ? this.normalizeWorkspaceLayout(input.layout) : existing.layout,
      updatedAt: new Date().toISOString(),
    };

    this.db!
      .prepare(
        `UPDATE workspace_profiles SET
          name = ?,
          layout_json = ?,
          updated_at = ?
         WHERE profile_id = ?`,
      )
      .run(updated.name, JSON.stringify(updated.layout), updated.updatedAt, updated.profileId);

    return clone(updated);
  }

  deleteWorkspaceProfile(profileId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM workspace_profiles WHERE profile_id = ?').run(profileId);
    return result.changes > 0;
  }

  getActiveWorkspaceProfileId(): string | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT active_profile_id FROM workspace_state WHERE id = 1').get() as Record<string, unknown> | undefined;
    return row ? (stringValue(row.active_profile_id, '') || null) : null;
  }

  setActiveWorkspaceProfileId(profileId: string): void {
    this.ensureDb();
    this.db!
      .prepare(
        `INSERT INTO workspace_state (id, active_profile_id) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET active_profile_id = excluded.active_profile_id`,
      )
      .run(profileId);
  }

  // ============================================================
  // Host Groups
  // ============================================================

  listHostGroups(): HostGroup[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM host_groups ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToHostGroup(row));
  }

  getHostGroup(groupId: string): HostGroup | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM host_groups WHERE id = ?').get(groupId) as Record<string, unknown> | undefined;
    return row ? this.rowToHostGroup(row) : null;
  }

  createHostGroup(input: CreateHostGroupInput = { name: '', color: '' }): HostGroup {
    this.ensureDb();
    const now = new Date().toISOString();
    const group: HostGroup = {
      id: randomUUID(),
      name: stringValue(input.name, '').trim(),
      color: stringValue(input.color, ''),
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare('INSERT INTO host_groups (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(group.id, group.name, group.color, group.createdAt, group.updatedAt);
    return clone(group);
  }

  updateHostGroup(groupId: string, input: UpdateHostGroupInput = {}): HostGroup | null {
    this.ensureDb();
    const existing = this.getHostGroup(groupId);
    if (!existing) return null;
    const updated: HostGroup = {
      ...existing,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() : existing.name,
      color: input.color !== undefined ? stringValue(input.color, existing.color) : existing.color,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare('UPDATE host_groups SET name = ?, color = ?, updated_at = ? WHERE id = ?')
      .run(updated.name, updated.color, updated.updatedAt, updated.id);
    return clone(updated);
  }

  deleteHostGroup(groupId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM host_groups WHERE id = ?').run(groupId);
    return result.changes > 0;
  }

  // ============================================================
  // Host Tags
  // ============================================================

  listHostTags(): HostTag[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM host_tags ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToHostTag(row));
  }

  getHostTag(tagId: string): HostTag | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM host_tags WHERE id = ?').get(tagId) as Record<string, unknown> | undefined;
    return row ? this.rowToHostTag(row) : null;
  }

  createHostTag(input: CreateHostTagInput = { name: '', color: '' }): HostTag {
    this.ensureDb();
    const now = new Date().toISOString();
    const tag: HostTag = {
      id: randomUUID(),
      name: stringValue(input.name, '').trim(),
      color: stringValue(input.color, ''),
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare('INSERT INTO host_tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt);
    return clone(tag);
  }

  updateHostTag(tagId: string, input: UpdateHostTagInput = {}): HostTag | null {
    this.ensureDb();
    const existing = this.getHostTag(tagId);
    if (!existing) return null;
    const updated: HostTag = {
      ...existing,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() : existing.name,
      color: input.color !== undefined ? stringValue(input.color, existing.color) : existing.color,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare('UPDATE host_tags SET name = ?, color = ?, updated_at = ? WHERE id = ?')
      .run(updated.name, updated.color, updated.updatedAt, updated.id);
    return clone(updated);
  }

  deleteHostTag(tagId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM host_tags WHERE id = ?').run(tagId);
    return result.changes > 0;
  }

  // ============================================================
  // Credential References
  // Reference-only. Secrets must never be stored here.
  // ============================================================

  listCredentialRefs(): CredentialRef[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM credential_refs ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToCredentialRef(row));
  }

  getCredentialRef(refId: string): CredentialRef | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM credential_refs WHERE id = ?').get(refId) as Record<string, unknown> | undefined;
    return row ? this.rowToCredentialRef(row) : null;
  }

  createCredentialRef(input: CreateCredentialRefInput = { name: '', type: 'file_path', referenceValue: '' }): CredentialRef {
    this.ensureDb();
    const now = new Date().toISOString();
    const ref: CredentialRef = {
      id: randomUUID(),
      name: stringValue(input.name, '').trim(),
      type: this.normalizeCredentialType(input.type),
      referenceValue: stringValue(input.referenceValue, ''),
      metadata: metadataValue(input.metadata) ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare('INSERT INTO credential_refs (id, name, type, reference_value, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(ref.id, ref.name, ref.type, ref.referenceValue, JSON.stringify(ref.metadata), ref.createdAt, ref.updatedAt);
    return clone(ref);
  }

  updateCredentialRef(refId: string, input: UpdateCredentialRefInput = {}): CredentialRef | null {
    this.ensureDb();
    const existing = this.getCredentialRef(refId);
    if (!existing) return null;
    const updated: CredentialRef = {
      ...existing,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() : existing.name,
      type: input.type !== undefined ? this.normalizeCredentialType(input.type) : existing.type,
      referenceValue: input.referenceValue !== undefined ? stringValue(input.referenceValue, existing.referenceValue) : existing.referenceValue,
      metadata: input.metadata !== undefined ? (metadataValue(input.metadata) ?? {}) : existing.metadata,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare('UPDATE credential_refs SET name = ?, type = ?, reference_value = ?, metadata = ?, updated_at = ? WHERE id = ?')
      .run(updated.name, updated.type, updated.referenceValue, JSON.stringify(updated.metadata), updated.updatedAt, updated.id);
    return clone(updated);
  }

  deleteCredentialRef(refId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM credential_refs WHERE id = ?').run(refId);
    return result.changes > 0;
  }

  // ============================================================
  // App Manifests
  // ============================================================

  listAppManifests(): AppManifest[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM app_manifests ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToAppManifest(row));
  }

  getAppManifest(manifestId: string): AppManifest | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM app_manifests WHERE id = ?').get(manifestId) as Record<string, unknown> | undefined;
    return row ? this.rowToAppManifest(row) : null;
  }

  createAppManifest(input: CreateAppManifestInput = { appId: '', name: '', version: '', entrypoint: '' }): AppManifest {
    this.ensureDb();
    const now = new Date().toISOString();
    const manifest: AppManifest = {
      id: randomUUID(),
      appId: stringValue(input.appId, '').trim(),
      name: stringValue(input.name, '').trim(),
      description: stringValue(input.description, '').trim(),
      version: stringValue(input.version, '').trim(),
      author: stringValue(input.author, 'Local operator').trim(),
      entrypoint: stringValue(input.entrypoint, '').trim(),
      icon: stringValue(input.icon, 'GA').trim(),
      category: stringValue(input.category, 'generated').trim(),
      capabilities: stringArrayValue(input.capabilities),
      sourceCode: stringValue(input.sourceCode, ''),
      packageMetadata: metadataValue(input.packageMetadata) ?? {},
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
      installedAt: nullableStringValue(input.installedAt, now),
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare(`INSERT INTO app_manifests
        (id, app_id, name, description, version, author, entrypoint, icon, category, capabilities_json, source_code, package_metadata, enabled, installed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        manifest.id,
        manifest.appId,
        manifest.name,
        manifest.description,
        manifest.version,
        manifest.author,
        manifest.entrypoint,
        manifest.icon,
        manifest.category,
        JSON.stringify(manifest.capabilities),
        manifest.sourceCode,
        JSON.stringify(manifest.packageMetadata),
        manifest.enabled ? 1 : 0,
        manifest.installedAt,
        manifest.createdAt,
        manifest.updatedAt,
      );
    return clone(manifest);
  }

  updateAppManifest(manifestId: string, input: UpdateAppManifestInput = {}): AppManifest | null {
    this.ensureDb();
    const existing = this.getAppManifest(manifestId);
    if (!existing) return null;
    const updated: AppManifest = {
      ...existing,
      appId: input.appId !== undefined ? stringValue(input.appId, existing.appId).trim() : existing.appId,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() : existing.name,
      description: input.description !== undefined ? stringValue(input.description, existing.description).trim() : existing.description,
      version: input.version !== undefined ? stringValue(input.version, existing.version).trim() : existing.version,
      author: input.author !== undefined ? stringValue(input.author, existing.author).trim() : existing.author,
      entrypoint: input.entrypoint !== undefined ? stringValue(input.entrypoint, existing.entrypoint).trim() : existing.entrypoint,
      icon: input.icon !== undefined ? stringValue(input.icon, existing.icon).trim() : existing.icon,
      category: input.category !== undefined ? stringValue(input.category, existing.category).trim() : existing.category,
      capabilities: input.capabilities !== undefined ? stringArrayValue(input.capabilities) : existing.capabilities,
      sourceCode: input.sourceCode !== undefined ? stringValue(input.sourceCode, existing.sourceCode) : existing.sourceCode,
      packageMetadata: input.packageMetadata !== undefined ? (metadataValue(input.packageMetadata) ?? {}) : existing.packageMetadata,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled,
      installedAt: input.installedAt !== undefined ? nullableStringValue(input.installedAt, existing.installedAt) : existing.installedAt,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare(`UPDATE app_manifests
        SET app_id = ?, name = ?, description = ?, version = ?, author = ?, entrypoint = ?, icon = ?, category = ?, capabilities_json = ?, source_code = ?, package_metadata = ?, enabled = ?, installed_at = ?, updated_at = ?
        WHERE id = ?`)
      .run(
        updated.appId,
        updated.name,
        updated.description,
        updated.version,
        updated.author,
        updated.entrypoint,
        updated.icon,
        updated.category,
        JSON.stringify(updated.capabilities),
        updated.sourceCode,
        JSON.stringify(updated.packageMetadata),
        updated.enabled ? 1 : 0,
        updated.installedAt,
        updated.updatedAt,
        updated.id,
      );
    return clone(updated);
  }

  deleteAppManifest(manifestId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM app_manifests WHERE id = ?').run(manifestId);
    return result.changes > 0;
  }

  // ============================================================
  // App Permissions
  // ============================================================

  listAppPermissions(appId?: string): AppPermission[] {
    this.ensureDb();
    if (appId) {
      const rows = this.db!.prepare('SELECT * FROM app_permissions WHERE app_id = ? ORDER BY capability ASC').all(appId) as Record<string, unknown>[];
      return rows.map((row) => this.rowToAppPermission(row));
    }
    const rows = this.db!.prepare('SELECT * FROM app_permissions ORDER BY app_id ASC, capability ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToAppPermission(row));
  }

  getAppPermission(permissionId: string): AppPermission | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM app_permissions WHERE id = ?').get(permissionId) as Record<string, unknown> | undefined;
    return row ? this.rowToAppPermission(row) : null;
  }

  createAppPermission(input: CreateAppPermissionInput = { appId: '', capability: '', granted: false }): AppPermission {
    this.ensureDb();
    const now = new Date().toISOString();
    const perm: AppPermission = {
      id: randomUUID(),
      appId: stringValue(input.appId, '').trim(),
      capability: stringValue(input.capability, '').trim(),
      granted: input.granted !== undefined ? Boolean(input.granted) : false,
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare('INSERT INTO app_permissions (id, app_id, capability, granted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(perm.id, perm.appId, perm.capability, perm.granted ? 1 : 0, perm.createdAt, perm.updatedAt);
    return clone(perm);
  }

  deleteAppPermission(permissionId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM app_permissions WHERE id = ?').run(permissionId);
    return result.changes > 0;
  }

  // ============================================================
  // Agent Endpoints
  // API key is never stored here; use credential_ref_id only.
  // ============================================================

  listAgentEndpoints(): AgentEndpoint[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM agent_endpoints ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToAgentEndpoint(row));
  }

  getAgentEndpoint(endpointId: string): AgentEndpoint | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM agent_endpoints WHERE id = ?').get(endpointId) as Record<string, unknown> | undefined;
    return row ? this.rowToAgentEndpoint(row) : null;
  }

  createAgentEndpoint(input: CreateAgentEndpointInput = { name: '', provider: '', baseUrl: '', model: '' }): AgentEndpoint {
    this.ensureDb();
    const now = new Date().toISOString();
    const endpoint: AgentEndpoint = {
      id: randomUUID(),
      name: stringValue(input.name, '').trim(),
      provider: stringValue(input.provider, '').trim(),
      baseUrl: stringValue(input.baseUrl, '').trim(),
      credentialRefId: input.credentialRefId !== undefined ? (input.credentialRefId ?? null) : null,
      model: stringValue(input.model, '').trim(),
      contextLimit: positiveIntegerValue(input.contextLimit, 8192),
      toolUse: input.toolUse !== undefined ? Boolean(input.toolUse) : true,
      streaming: input.streaming !== undefined ? Boolean(input.streaming) : false,
      policy: this.normalizeAgentPolicy(input.policy),
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare(`INSERT INTO agent_endpoints
        (id, name, provider, base_url, credential_ref_id, model, context_limit, tool_use, streaming, policy, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        endpoint.id,
        endpoint.name,
        endpoint.provider,
        endpoint.baseUrl,
        endpoint.credentialRefId,
        endpoint.model,
        endpoint.contextLimit,
        endpoint.toolUse ? 1 : 0,
        endpoint.streaming ? 1 : 0,
        endpoint.policy,
        endpoint.enabled ? 1 : 0,
        endpoint.createdAt,
        endpoint.updatedAt,
      );
    return clone(endpoint);
  }

  updateAgentEndpoint(endpointId: string, input: UpdateAgentEndpointInput = {}): AgentEndpoint | null {
    this.ensureDb();
    const existing = this.getAgentEndpoint(endpointId);
    if (!existing) return null;
    const updated: AgentEndpoint = {
      ...existing,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() : existing.name,
      provider: input.provider !== undefined ? stringValue(input.provider, existing.provider).trim() : existing.provider,
      baseUrl: input.baseUrl !== undefined ? stringValue(input.baseUrl, existing.baseUrl).trim() : existing.baseUrl,
      credentialRefId: input.credentialRefId !== undefined ? (input.credentialRefId ?? null) : existing.credentialRefId,
      model: input.model !== undefined ? stringValue(input.model, existing.model).trim() : existing.model,
      contextLimit: input.contextLimit !== undefined ? positiveIntegerValue(input.contextLimit, existing.contextLimit) : existing.contextLimit,
      toolUse: input.toolUse !== undefined ? Boolean(input.toolUse) : existing.toolUse,
      streaming: input.streaming !== undefined ? Boolean(input.streaming) : existing.streaming,
      policy: input.policy !== undefined ? this.normalizeAgentPolicy(input.policy) : existing.policy,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare(`UPDATE agent_endpoints
        SET name = ?, provider = ?, base_url = ?, credential_ref_id = ?, model = ?,
            context_limit = ?, tool_use = ?, streaming = ?, policy = ?, enabled = ?, updated_at = ?
        WHERE id = ?`)
      .run(
        updated.name,
        updated.provider,
        updated.baseUrl,
        updated.credentialRefId,
        updated.model,
        updated.contextLimit,
        updated.toolUse ? 1 : 0,
        updated.streaming ? 1 : 0,
        updated.policy,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        updated.id,
      );
    return clone(updated);
  }

  deleteAgentEndpoint(endpointId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM agent_endpoints WHERE id = ?').run(endpointId);
    return result.changes > 0;
  }

  // ============================================================
  // Bootstrap Presets
  // ============================================================

  listBootstrapPresets(): BootstrapPresetRecord[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM bootstrap_presets ORDER BY name ASC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToBootstrapPreset(row));
  }

  getBootstrapPreset(presetId: string): BootstrapPresetRecord | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM bootstrap_presets WHERE id = ?').get(presetId) as Record<string, unknown> | undefined;
    return row ? this.rowToBootstrapPreset(row) : null;
  }

  createBootstrapPreset(input: CreateBootstrapPresetInput = { presetId: '', name: '', description: '', scriptTemplate: '' }): BootstrapPresetRecord {
    this.ensureDb();
    const now = new Date().toISOString();
    const preset: BootstrapPresetRecord = {
      id: randomUUID(),
      presetId: stringValue(input.presetId, '').trim(),
      name: stringValue(input.name, '').trim(),
      description: stringValue(input.description, ''),
      scriptTemplate: stringValue(input.scriptTemplate, ''),
      variables: stringArrayValue(input.variables),
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare('INSERT INTO bootstrap_presets (id, preset_id, name, description, script_template, variables_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(preset.id, preset.presetId, preset.name, preset.description, preset.scriptTemplate, JSON.stringify(preset.variables), preset.enabled ? 1 : 0, preset.createdAt, preset.updatedAt);
    return clone(preset);
  }

  updateBootstrapPreset(presetId: string, input: UpdateBootstrapPresetInput = {}): BootstrapPresetRecord | null {
    this.ensureDb();
    const existing = this.getBootstrapPreset(presetId);
    if (!existing) return null;
    const updated: BootstrapPresetRecord = {
      ...existing,
      presetId: input.presetId !== undefined ? stringValue(input.presetId, existing.presetId).trim() : existing.presetId,
      name: input.name !== undefined ? stringValue(input.name, existing.name).trim() : existing.name,
      description: input.description !== undefined ? stringValue(input.description, existing.description) : existing.description,
      scriptTemplate: input.scriptTemplate !== undefined ? stringValue(input.scriptTemplate, existing.scriptTemplate) : existing.scriptTemplate,
      variables: input.variables !== undefined ? stringArrayValue(input.variables) : existing.variables,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare('UPDATE bootstrap_presets SET preset_id = ?, name = ?, description = ?, script_template = ?, variables_json = ?, enabled = ?, updated_at = ? WHERE id = ?')
      .run(updated.presetId, updated.name, updated.description, updated.scriptTemplate, JSON.stringify(updated.variables), updated.enabled ? 1 : 0, updated.updatedAt, updated.id);
    return clone(updated);
  }

  deleteBootstrapPreset(presetId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM bootstrap_presets WHERE id = ?').run(presetId);
    return result.changes > 0;
  }

  // ============================================================
  // Bootstrap Runs
  // ============================================================

  listBootstrapRuns(): BootstrapRun[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM bootstrap_runs ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map((row) => this.rowToBootstrapRun(row));
  }

  getBootstrapRun(runId: string): BootstrapRun | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM bootstrap_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined;
    return row ? this.rowToBootstrapRun(row) : null;
  }

  createBootstrapRun(input: CreateBootstrapRunInput = { presetId: '', hostId: null, scriptOutput: '', status: 'pending' }): BootstrapRun {
    this.ensureDb();
    const now = new Date().toISOString();
    const run: BootstrapRun = {
      id: randomUUID(),
      presetId: stringValue(input.presetId, '').trim(),
      hostId: input.hostId !== undefined ? (input.hostId ?? null) : null,
      scriptOutput: stringValue(input.scriptOutput, ''),
      status: this.normalizeBootstrapStatus(input.status),
      createdAt: now,
      updatedAt: now,
    };
    this.db!
      .prepare('INSERT INTO bootstrap_runs (id, preset_id, host_id, script_output, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(run.id, run.presetId, run.hostId, run.scriptOutput, run.status, run.createdAt, run.updatedAt);
    return clone(run);
  }

  updateBootstrapRun(runId: string, input: UpdateBootstrapRunInput = {}): BootstrapRun | null {
    this.ensureDb();
    const existing = this.getBootstrapRun(runId);
    if (!existing) return null;
    const updated: BootstrapRun = {
      ...existing,
      scriptOutput: input.scriptOutput !== undefined ? stringValue(input.scriptOutput, existing.scriptOutput) : existing.scriptOutput,
      status: input.status !== undefined ? this.normalizeBootstrapStatus(input.status) : existing.status,
      updatedAt: new Date().toISOString(),
    };
    this.db!
      .prepare('UPDATE bootstrap_runs SET script_output = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(updated.scriptOutput, updated.status, updated.updatedAt, updated.id);
    return clone(updated);
  }

  deleteBootstrapRun(runId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM bootstrap_runs WHERE id = ?').run(runId);
    return result.changes > 0;
  }

  // ============================================================
  // Command History Metadata
  // ============================================================

  listCommandHistory(limit = 100): CommandHistoryEntry[] {
    this.ensureDb();
    const rows = this.db!.prepare('SELECT * FROM command_history ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToCommandHistory(row));
  }

  getCommandHistoryEntry(entryId: string): CommandHistoryEntry | null {
    this.ensureDb();
    const row = this.db!.prepare('SELECT * FROM command_history WHERE id = ?').get(entryId) as Record<string, unknown> | undefined;
    return row ? this.rowToCommandHistory(row) : null;
  }

  createCommandHistoryEntry(input: CreateCommandHistoryInput = { command: '' }): CommandHistoryEntry {
    this.ensureDb();
    const now = new Date().toISOString();
    const entry: CommandHistoryEntry = {
      id: randomUUID(),
      hostId: input.hostId !== undefined ? (input.hostId ?? null) : null,
      sessionId: input.sessionId !== undefined ? (input.sessionId ?? null) : null,
      command: stringValue(input.command, ''),
      exitCode: input.exitCode !== undefined ? (input.exitCode ?? null) : null,
      durationMs: input.durationMs !== undefined ? (input.durationMs ?? null) : null,
      createdAt: now,
    };
    this.db!
      .prepare('INSERT INTO command_history (id, host_id, session_id, command, exit_code, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(entry.id, entry.hostId, entry.sessionId, entry.command, entry.exitCode, entry.durationMs, entry.createdAt);
    return clone(entry);
  }

  deleteCommandHistoryEntry(entryId: string): boolean {
    this.ensureDb();
    const result = this.db!.prepare('DELETE FROM command_history WHERE id = ?').run(entryId);
    return result.changes > 0;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ============================================================
  // Row mappers
  // ============================================================

  private rowToHostGroup(row: Record<string, unknown>): HostGroup {
    return {
      id: stringValue(row.id, ''),
      name: stringValue(row.name, ''),
      color: stringValue(row.color, ''),
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private rowToHostTag(row: Record<string, unknown>): HostTag {
    return {
      id: stringValue(row.id, ''),
      name: stringValue(row.name, ''),
      color: stringValue(row.color, ''),
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private rowToCredentialRef(row: Record<string, unknown>): CredentialRef {
    return {
      id: stringValue(row.id, ''),
      name: stringValue(row.name, ''),
      type: this.normalizeCredentialType(stringValue(row.type, '')),
      referenceValue: stringValue(row.reference_value, ''),
      metadata: metadataValue(JSON.parse(stringValue(row.metadata, '{}'))) ?? {},
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private normalizeCredentialType(value: unknown): CredentialRef['type'] {
    const valid: CredentialRef['type'][] = ['keychain_ref', 'file_path', 'ssh_agent', 'env_var'];
    return typeof value === 'string' && valid.includes(value as CredentialRef['type'])
      ? (value as CredentialRef['type'])
      : 'file_path';
  }

  private rowToAppManifest(row: Record<string, unknown>): AppManifest {
    return {
      id: stringValue(row.id, ''),
      appId: stringValue(row.app_id, ''),
      name: stringValue(row.name, ''),
      description: stringValue(row.description, ''),
      version: stringValue(row.version, ''),
      author: stringValue(row.author, 'Local operator'),
      entrypoint: stringValue(row.entrypoint, ''),
      icon: stringValue(row.icon, 'GA'),
      category: stringValue(row.category, 'generated'),
      capabilities: stringArrayValue(JSON.parse(stringValue(row.capabilities_json, '[]'))),
      sourceCode: stringValue(row.source_code, ''),
      packageMetadata: metadataValue(JSON.parse(stringValue(row.package_metadata, '{}'))) ?? {},
      enabled: Number(row.enabled) === 1,
      installedAt: nullableStringValue(row.installed_at, null),
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private rowToAppPermission(row: Record<string, unknown>): AppPermission {
    return {
      id: stringValue(row.id, ''),
      appId: stringValue(row.app_id, ''),
      capability: stringValue(row.capability, ''),
      granted: Number(row.granted) === 1,
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private rowToAgentEndpoint(row: Record<string, unknown>): AgentEndpoint {
    return {
      id: stringValue(row.id, ''),
      name: stringValue(row.name, ''),
      provider: stringValue(row.provider, ''),
      baseUrl: stringValue(row.base_url, ''),
      credentialRefId: nullableStringValue(row.credential_ref_id, null),
      model: stringValue(row.model, ''),
      contextLimit: positiveIntegerValue(row.context_limit, 8192),
      toolUse: booleanValue(row.tool_use, true),
      streaming: booleanValue(row.streaming, false),
      policy: this.normalizeAgentPolicy(stringValue(row.policy, '')),
      enabled: Number(row.enabled) === 1,
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private normalizeAgentPolicy(value: unknown): AgentEndpoint['policy'] {
    const valid: AgentEndpoint['policy'][] = ['safe', 'balanced', 'permissive', 'full-trust'];
    return typeof value === 'string' && valid.includes(value as AgentEndpoint['policy'])
      ? (value as AgentEndpoint['policy'])
      : 'safe';
  }

  private rowToBootstrapPreset(row: Record<string, unknown>): BootstrapPresetRecord {
    return {
      id: stringValue(row.id, ''),
      presetId: stringValue(row.preset_id, ''),
      name: stringValue(row.name, ''),
      description: stringValue(row.description, ''),
      scriptTemplate: stringValue(row.script_template, ''),
      variables: stringArrayValue(JSON.parse(stringValue(row.variables_json, '[]'))),
      enabled: Number(row.enabled) === 1,
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private rowToBootstrapRun(row: Record<string, unknown>): BootstrapRun {
    return {
      id: stringValue(row.id, ''),
      presetId: stringValue(row.preset_id, ''),
      hostId: nullableStringValue(row.host_id, null),
      scriptOutput: stringValue(row.script_output, ''),
      status: this.normalizeBootstrapStatus(stringValue(row.status, '')),
      createdAt: stringValue(row.created_at, ''),
      updatedAt: stringValue(row.updated_at, ''),
    };
  }

  private normalizeBootstrapStatus(value: unknown): BootstrapRun['status'] {
    const valid: BootstrapRun['status'][] = ['pending', 'running', 'success', 'failed', 'cancelled'];
    return typeof value === 'string' && valid.includes(value as BootstrapRun['status'])
      ? (value as BootstrapRun['status'])
      : 'pending';
  }

  private rowToCommandHistory(row: Record<string, unknown>): CommandHistoryEntry {
    return {
      id: stringValue(row.id, ''),
      hostId: nullableStringValue(row.host_id, null),
      sessionId: nullableStringValue(row.session_id, null),
      command: stringValue(row.command, ''),
      exitCode: typeof row.exit_code === 'number' ? row.exit_code : null,
      durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
      createdAt: stringValue(row.created_at, ''),
    };
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
        key_path TEXT NOT NULL DEFAULT '',
        credential_ref_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        group_name TEXT DEFAULT '',
        favorite INTEGER NOT NULL DEFAULT 0,
        os_hint TEXT NOT NULL DEFAULT 'unknown',
        bootstrap_status TEXT NOT NULL DEFAULT 'unknown',
        default_shell TEXT NOT NULL DEFAULT '',
        default_working_directory TEXT NOT NULL DEFAULT '',
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        last_connection_status TEXT NOT NULL DEFAULT 'untested',
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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

      CREATE TABLE IF NOT EXISTS host_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS host_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS host_tag_assignments (
        host_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (host_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS credential_refs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'file_path',
        reference_value TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_manifests (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        entrypoint TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'GA',
        category TEXT NOT NULL DEFAULT 'generated',
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        source_code TEXT NOT NULL DEFAULT '',
        package_metadata TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_permissions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        granted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(app_id, capability)
      );

      CREATE TABLE IF NOT EXISTS agent_endpoints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        credential_ref_id TEXT,
        model TEXT NOT NULL DEFAULT '',
        context_limit INTEGER NOT NULL DEFAULT 8192,
        tool_use INTEGER NOT NULL DEFAULT 1,
        streaming INTEGER NOT NULL DEFAULT 0,
        policy TEXT NOT NULL DEFAULT 'safe',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bootstrap_presets (
        id TEXT PRIMARY KEY,
        preset_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        script_template TEXT NOT NULL DEFAULT '',
        variables_json TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bootstrap_runs (
        id TEXT PRIMARY KEY,
        preset_id TEXT NOT NULL,
        host_id TEXT,
        script_output TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS command_history (
        id TEXT PRIMARY KEY,
        host_id TEXT,
        session_id TEXT,
        command TEXT NOT NULL DEFAULT '',
        exit_code INTEGER,
        duration_ms INTEGER,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureSettingsTable();
    this.ensureWorkspaceTables();

    this.ensureHostColumns();
    this.ensureAppManifestColumns();
    this.ensureAgentEndpointColumns();
    this.ensureAuditColumns();

    this.db!
      .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run('schema_version', '4');
  }

  private ensureSettingsTable(): void {
    const createSettingsTable = `
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL DEFAULT 'dark',
        default_window_behavior TEXT NOT NULL DEFAULT 'floating',
        desktop_wallpaper TEXT NOT NULL DEFAULT 'default',
        desktop_wallpaper_layout TEXT NOT NULL DEFAULT 'fill',
        ssh_defaults TEXT NOT NULL DEFAULT '{}',
        operator TEXT NOT NULL DEFAULT '{}'
      )
    `;

    if (!this.tableExists('settings')) {
      this.db!.exec(createSettingsTable);
      return;
    }

    if (!this.columnExists('settings', 'id')) {
      const legacyRow = this.db!.prepare('SELECT * FROM settings LIMIT 1').get() as Record<string, unknown> | undefined;
      const legacySettings = legacyRow ? rowToSettings(legacyRow) : clone(DEFAULT_SETTINGS);
      this.db!.exec('DROP TABLE IF EXISTS settings_legacy_pre_id');
      this.db!.exec('ALTER TABLE settings RENAME TO settings_legacy_pre_id');
      this.db!.exec(createSettingsTable);
      this.db!
        .prepare(
          `INSERT INTO settings (id, theme, default_window_behavior, desktop_wallpaper, desktop_wallpaper_layout, ssh_defaults, operator)
           VALUES (1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          legacySettings.theme,
          legacySettings.defaultWindowBehavior,
          legacySettings.desktopWallpaper,
          legacySettings.desktopWallpaperLayout,
          JSON.stringify(legacySettings.sshDefaults),
          JSON.stringify(legacySettings.operator),
        );
      return;
    }

    this.db!.exec(createSettingsTable);
    if (!this.columnExists('settings', 'desktop_wallpaper')) {
      this.db!.exec('ALTER TABLE settings ADD COLUMN desktop_wallpaper TEXT NOT NULL DEFAULT \'default\'');
    }
    if (!this.columnExists('settings', 'desktop_wallpaper_layout')) {
      this.db!.exec('ALTER TABLE settings ADD COLUMN desktop_wallpaper_layout TEXT NOT NULL DEFAULT \'fill\'');
    }
  }

  private rowToWorkspaceProfile(row: Record<string, unknown>): WorkspaceProfile {
    return {
      profileId: stringValue(row.profile_id, ''),
      name: stringValue(row.name, 'Untitled workspace'),
      updatedAt: stringValue(row.updated_at, new Date(0).toISOString()),
      layout: this.normalizeWorkspaceLayout(row.layout_json),
    };
  }

  private normalizeWorkspaceLayout(value: unknown): WorkspaceLayoutSnapshot {
    const empty: WorkspaceLayoutSnapshot = { desktopShortcutIds: [], windows: [] };
    if (!isRecord(value)) {
      try {
        const parsed = JSON.parse(stringValue(value, '{}')) as unknown;
        if (!isRecord(parsed)) {
          return empty;
        }
        value = parsed;
      } catch {
        return empty;
      }
    }

    const record = value as Record<string, unknown>;
    const desktopShortcutIds = Array.isArray(record.desktopShortcutIds)
      ? record.desktopShortcutIds.filter((item): item is string => typeof item === 'string')
      : [];
    const windows = Array.isArray(record.windows)
      ? record.windows.filter((win): win is WorkspaceLayoutSnapshot['windows'][number] => {
        return (
          isRecord(win) &&
          typeof win.windowId === 'string' &&
          typeof win.appId === 'string' &&
          isRecord(win.bounds) &&
          Number.isFinite(win.bounds.x) &&
          Number.isFinite(win.bounds.y) &&
          Number.isFinite(win.bounds.width) &&
          Number.isFinite(win.bounds.height)
        );
      })
      : [];

    return { desktopShortcutIds, windows };
  }

  private ensureWorkspaceTables(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS workspace_profiles (
        profile_id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Untitled workspace',
        layout_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspace_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        active_profile_id TEXT
      );
    `);
  }

  private ensureHostColumns(): void {
    const hostColumnDefs: Array<{ name: string; def: string }> = [
      { name: 'name', def: "TEXT NOT NULL DEFAULT 'Untitled host'" },
      { name: 'address', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'hostname', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'port', def: 'INTEGER NOT NULL DEFAULT 22' },
      { name: 'username', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'auth_mode', def: "TEXT NOT NULL DEFAULT 'placeholder'" },
      { name: 'key_path', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'credential_ref_id', def: 'TEXT' },
      { name: 'tags', def: "TEXT NOT NULL DEFAULT '[]'" },
      { name: 'group_name', def: "TEXT DEFAULT ''" },
      { name: 'favorite', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'os_hint', def: "TEXT NOT NULL DEFAULT 'unknown'" },
      { name: 'bootstrap_status', def: "TEXT NOT NULL DEFAULT 'unknown'" },
      { name: 'default_shell', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'default_working_directory', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'capabilities_json', def: "TEXT NOT NULL DEFAULT '[]'" },
      { name: 'notes', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'last_connection_status', def: "TEXT NOT NULL DEFAULT 'untested'" },
      { name: 'last_checked_at', def: 'TEXT' },
      { name: 'created_at', def: 'TEXT NOT NULL' },
      { name: 'updated_at', def: 'TEXT NOT NULL' },
    ];

    for (const col of hostColumnDefs) {
      if (!this.columnExists('hosts', col.name)) {
        this.db!.exec(`ALTER TABLE hosts ADD COLUMN ${col.name} ${col.def}`);
      }
    }
  }

  private ensureAppManifestColumns(): void {
    const appManifestColumnDefs: Array<{ name: string; def: string }> = [
      { name: 'description', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'author', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'icon', def: "TEXT NOT NULL DEFAULT 'GA'" },
      { name: 'category', def: "TEXT NOT NULL DEFAULT 'generated'" },
      { name: 'source_code', def: "TEXT NOT NULL DEFAULT ''" },
      { name: 'package_metadata', def: "TEXT NOT NULL DEFAULT '{}'" },
      { name: 'installed_at', def: 'TEXT' },
    ];

    for (const col of appManifestColumnDefs) {
      if (!this.columnExists('app_manifests', col.name)) {
        this.db!.exec(`ALTER TABLE app_manifests ADD COLUMN ${col.name} ${col.def}`);
      }
    }
  }

  private ensureAgentEndpointColumns(): void {
    const agentEndpointColumnDefs: Array<{ name: string; def: string }> = [
      { name: 'context_limit', def: 'INTEGER NOT NULL DEFAULT 8192' },
      { name: 'tool_use', def: 'INTEGER NOT NULL DEFAULT 1' },
      { name: 'streaming', def: 'INTEGER NOT NULL DEFAULT 0' },
    ];

    for (const col of agentEndpointColumnDefs) {
      if (!this.columnExists('agent_endpoints', col.name)) {
        this.db!.exec(`ALTER TABLE agent_endpoints ADD COLUMN ${col.name} ${col.def}`);
      }
    }
  }

  private ensureAuditColumns(): void {
    if (!this.columnExists('audit_events', 'metadata')) {
      this.db!.exec('ALTER TABLE audit_events ADD COLUMN metadata TEXT');
    }
  }

  private seedDefaults(): void {
    const defaults = clone(DEFAULT_SETTINGS);
    this.db!
      .prepare(
        `INSERT INTO settings (id, theme, default_window_behavior, desktop_wallpaper, desktop_wallpaper_layout, ssh_defaults, operator)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(
        defaults.theme,
        defaults.defaultWindowBehavior,
        defaults.desktopWallpaper,
        defaults.desktopWallpaperLayout,
        JSON.stringify(defaults.sshDefaults),
        JSON.stringify(defaults.operator),
      );
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
      `INSERT INTO hosts (id, name, address, hostname, port, username, auth_mode, key_path, credential_ref_id, tags, group_name, favorite, os_hint, bootstrap_status, default_shell, default_working_directory, capabilities_json, notes, last_connection_status, last_checked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );

    const insertAudit = this.db!.prepare(
      `INSERT INTO audit_events (id, type, entity_type, entity_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    );

    const insertSettings = this.db!.prepare(
      `INSERT INTO settings (id, theme, default_window_behavior, desktop_wallpaper, desktop_wallpaper_layout, ssh_defaults, operator)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         theme = excluded.theme,
         default_window_behavior = excluded.default_window_behavior,
         desktop_wallpaper = excluded.desktop_wallpaper,
         desktop_wallpaper_layout = excluded.desktop_wallpaper_layout,
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
          host.keyPath ?? '',
          host.credentialRefId,
          JSON.stringify(host.tags),
          host.group || '',
          host.favorite ? 1 : 0,
          host.osHint,
          host.bootstrapStatus,
          host.defaultShell,
          host.defaultWorkingDirectory,
          JSON.stringify(host.capabilities),
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
        state.settings.desktopWallpaper,
        state.settings.desktopWallpaperLayout,
        JSON.stringify(state.settings.sshDefaults),
        JSON.stringify(state.settings.operator),
      );
    });

    migrate();
  }

  private columnExists(tableName: string, columnName: string): boolean {
    const rows = this.db!.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
  }

  private tableExists(tableName: string): boolean {
    const row = this.db!
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName);
    return Boolean(row);
  }
}
