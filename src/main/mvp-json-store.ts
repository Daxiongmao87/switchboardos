import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
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

const STORE_FILE_NAME = 'switchboardos-mvp.json';

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
    ? value as HostAuthMode
    : fallback;
}

function connectionStatusValue(value: unknown, fallback: HostConnectionStatus): HostConnectionStatus {
  return typeof value === 'string' && CONNECTION_STATUSES.includes(value as HostConnectionStatus)
    ? value as HostConnectionStatus
    : fallback;
}

function windowBehaviorValue(value: unknown, fallback: MvpSettings['defaultWindowBehavior']): MvpSettings['defaultWindowBehavior'] {
  return value === 'floating' || value === 'tile-right' || value === 'tile-bottom'
    ? value
    : fallback;
}

function themeValue(value: unknown, fallback: MvpSettings['theme']): MvpSettings['theme'] {
  return value === 'system' || value === 'dark' || value === 'light'
    ? value
    : fallback;
}

function operatorPolicyValue(value: unknown, fallback: MvpSettings['operator']['policy']): MvpSettings['operator']['policy'] {
  return value === 'manual-approval' || value === 'disabled'
    ? value
    : fallback;
}

function normalizeSettings(value: unknown): MvpSettings {
  if (!isRecord(value)) {
    return clone(DEFAULT_SETTINGS);
  }

  const sshDefaults = isRecord(value.sshDefaults) ? value.sshDefaults : {};
  const operator = isRecord(value.operator) ? value.operator : {};

  return {
    theme: themeValue(value.theme, DEFAULT_SETTINGS.theme),
    defaultWindowBehavior: windowBehaviorValue(
      value.defaultWindowBehavior,
      DEFAULT_SETTINGS.defaultWindowBehavior
    ),
    sshDefaults: {
      port: numberValue(sshDefaults.port, DEFAULT_SETTINGS.sshDefaults.port),
      username: stringValue(sshDefaults.username, DEFAULT_SETTINGS.sshDefaults.username),
      authMode: authModeValue(sshDefaults.authMode, DEFAULT_SETTINGS.sshDefaults.authMode),
      connectTimeoutMs: numberValue(
        sshDefaults.connectTimeoutMs,
        DEFAULT_SETTINGS.sshDefaults.connectTimeoutMs
      ),
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

  const metadata = metadataValue(value.metadata);
  if (metadata) {
    event.metadata = metadata;
  }

  return event;
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
      ? value.auditEvents
          .map(normalizeAuditEvent)
          .filter((event): event is AuditEvent => event !== null)
      : [],
    settings: normalizeSettings(value.settings),
  };
}

export class MvpJsonStore {
  private state: MvpStoreState | null = null;

  constructor(
    private readonly getUserDataPath: () => string,
    private readonly probe: HostProbe = probeHost,
  ) {}

  listHosts(): HostRecord[] {
    return clone(this.loadState().hosts);
  }

  getHost(hostId: string): HostRecord | null {
    return clone(this.loadState().hosts.find((host) => host.id === hostId) ?? null);
  }

  createHost(input: CreateHostInput = {}): HostRecord {
    const state = this.loadState();
    const now = new Date().toISOString();
    const address = stringValue(input.address, stringValue(input.hostname, ''));
    const host: HostRecord = {
      id: randomUUID(),
      name: stringValue(input.name, address || 'Untitled host'),
      address,
      hostname: stringValue(input.hostname, address),
      port: numberValue(input.port, state.settings.sshDefaults.port),
      username: stringValue(input.username, state.settings.sshDefaults.username),
      authMode: authModeValue(input.authMode, state.settings.sshDefaults.authMode),
      tags: stringArrayValue(input.tags),
      notes: stringValue(input.notes, ''),
      lastConnectionStatus: 'untested',
      lastCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    state.hosts.push(host);
    this.writeState(state);
    return clone(host);
  }

  updateHost(hostId: string, input: UpdateHostInput = {}): HostRecord | null {
    const state = this.loadState();
    const hostIndex = state.hosts.findIndex((host) => host.id === hostId);
    if (hostIndex === -1) {
      return null;
    }

    const current = state.hosts[hostIndex];
    const address = stringValue(input.address, stringValue(input.hostname, current.address));
    const updated: HostRecord = {
      ...current,
      name: stringValue(input.name, current.name),
      address,
      hostname: stringValue(input.hostname, address),
      port: numberValue(input.port, current.port),
      username: stringValue(input.username, current.username),
      authMode: authModeValue(input.authMode, current.authMode),
      tags: input.tags === undefined ? current.tags : stringArrayValue(input.tags),
      notes: stringValue(input.notes, current.notes),
      updatedAt: new Date().toISOString(),
    };

    state.hosts[hostIndex] = updated;
    this.writeState(state);
    return clone(updated);
  }

  deleteHost(hostId: string): boolean {
    const state = this.loadState();
    const nextHosts = state.hosts.filter((host) => host.id !== hostId);
    if (nextHosts.length === state.hosts.length) {
      return false;
    }

    state.hosts = nextHosts;
    this.writeState(state);
    return true;
  }

  async testConnection(hostId: string): Promise<ConnectionTestResult> {
    const stateBefore = this.loadState();
    const hostBefore = stateBefore.hosts.find((host) => host.id === hostId) ?? null;

    if (!hostBefore) {
      const checkedAt = new Date().toISOString();
      const result: ConnectionTestResult = {
        hostId,
        status: 'not_found',
        success: false,
        message: 'Host record was not found. Reachability check was not attempted.',
        checkedAt,
      };
      const state = this.loadState();
      state.auditEvents.push(this.createAuditEvent({
        type: 'host.connection_test',
        entityType: 'host',
        entityId: hostId,
        message: result.message,
        metadata: { status: result.status, success: result.success },
      }, checkedAt));
      this.writeState(state);
      return result;
    }

    const probeAddress = hostBefore.address || hostBefore.hostname;
    const probePort = hostBefore.port;
    const timeoutMs = stateBefore.settings.sshDefaults.connectTimeoutMs;

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

    const state = this.loadState();
    const hostIndex = state.hosts.findIndex((host) => host.id === hostId);
    if (hostIndex !== -1) {
      state.hosts[hostIndex] = {
        ...state.hosts[hostIndex],
        lastConnectionStatus: probeOutcome.success ? 'success' : 'failed',
        lastCheckedAt: checkedAt,
        updatedAt: checkedAt,
      };
    }

    state.auditEvents.push(this.createAuditEvent({
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
    }, checkedAt));
    this.writeState(state);
    return result;
  }

  getSettings(): MvpSettings {
    return clone(this.loadState().settings);
  }

  updateSettings(update: MvpSettingsUpdate = {}): MvpSettings {
    const state = this.loadState();
    state.settings = normalizeSettings({
      ...state.settings,
      ...update,
      sshDefaults: {
        ...state.settings.sshDefaults,
        ...(update.sshDefaults ?? {}),
      },
      operator: {
        ...state.settings.operator,
        ...(update.operator ?? {}),
      },
    });
    this.writeState(state);
    return clone(state.settings);
  }

  listAuditEvents(): AuditEvent[] {
    return clone(this.loadState().auditEvents);
  }

  logAuditEvent(input: CreateAuditEventInput = {
    type: 'audit.event',
    entityType: 'system',
    message: '',
  }): AuditEvent {
    const state = this.loadState();
    const event = this.createAuditEvent(input, new Date().toISOString());
    state.auditEvents.push(event);
    this.writeState(state);
    return clone(event);
  }

  private createAuditEvent(input: CreateAuditEventInput, createdAt: string): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      type: stringValue(input.type, 'audit.event'),
      entityType: stringValue(input.entityType, 'system'),
      entityId: input.entityId ?? null,
      message: stringValue(input.message, ''),
      createdAt,
    };

    const metadata = metadataValue(input.metadata);
    if (metadata) {
      event.metadata = metadata;
    }

    return event;
  }

  private loadState(): MvpStoreState {
    if (this.state) {
      return this.state;
    }

    const filePath = this.getStoreFilePath();
    mkdirSync(dirname(filePath), { recursive: true });

    if (!existsSync(filePath)) {
      this.state = defaultState();
      this.writeState(this.state);
      return this.state;
    }

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
      this.state = normalizeState(parsed);
      this.writeState(this.state);
      return this.state;
    } catch {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      renameSync(filePath, corruptPath);
      this.state = defaultState();
      this.writeState(this.state);
      return this.state;
    }
  }

  private writeState(state: MvpStoreState): void {
    const filePath = this.getStoreFilePath();
    mkdirSync(dirname(filePath), { recursive: true });

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
    this.state = state;
  }

  private getStoreFilePath(): string {
    return join(this.getUserDataPath(), STORE_FILE_NAME);
  }
}
