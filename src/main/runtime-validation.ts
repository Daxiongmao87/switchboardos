import type {
  BootstrapGenerateInput,
  BootstrapPresetId,
  CreateHostGroupInput,
  CreateHostInput,
  CreateHostTagInput,
  HostOperationInput,
  HostOperationKind,
  HostAuthMode,
  HostBootstrapStatus,
  HostRecord,
  MvpSettings,
  MvpSettingsUpdate,
  OperatorProposeInput,
  SshFileListInput,
  SshFileStatInput,
  SshFileTransferInput,
  SshExecInput,
  UpdateHostGroupInput,
  UpdateHostInput,
  UpdateHostTagInput,
  CreateWorkspaceProfileInput,
  UpdateWorkspaceProfileInput,
  WorkspaceLayoutSnapshot,
} from '../shared/mvp-models';

export class RuntimeValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RuntimeValidationError';
  }
}

const BOOTSTRAP_PRESETS: readonly BootstrapPresetId[] = [
  'debian-ubuntu',
  'rhel-family',
  'arch-linux',
  'macos',
  'windows-openssh',
  'generic-posix',
];
const HOST_OPERATION_KINDS: readonly HostOperationKind[] = ['files', 'processes', 'services', 'logs', 'metrics'];
const THEMES: readonly MvpSettings['theme'][] = ['system', 'dark', 'light'];
const WINDOW_BEHAVIORS: readonly MvpSettings['defaultWindowBehavior'][] = ['floating', 'tile-right', 'tile-bottom'];
const WALLPAPER_MODES: readonly MvpSettings['desktopWallpaper'][] = ['default', 'grid', 'topology', 'plain'];
const WALLPAPER_LAYOUT_MODES: readonly MvpSettings['desktopWallpaperLayout'][] = [
  'fill',
  'fit',
  'stretch',
  'fit-tile',
  'tile-original',
  'center',
];
const AUTH_MODES: readonly MvpSettings['sshDefaults']['authMode'][] = ['placeholder', 'password', 'key', 'agent'];
const HOST_AUTH_MODES: readonly HostAuthMode[] = ['placeholder', 'password', 'key', 'agent'];
const HOST_BOOTSTRAP_STATUSES: readonly HostBootstrapStatus[] = ['unknown', 'not_started', 'pending', 'ready', 'failed'];
const OPERATOR_POLICIES: readonly MvpSettings['operator']['policy'][] = ['manual-approval', 'disabled'];
const WORKSPACE_FILE_KINDS = ['applet', 'scriptlet', 'note'] as const;

export type WorkspaceFileKindInput = typeof WORKSPACE_FILE_KINDS[number];

export interface WorkspaceFileCreateFileInput {
  kind: WorkspaceFileKindInput;
  targetPath: string;
}

export interface WorkspaceFileRenameInput {
  path: string;
  newName: string;
}

export interface WorkspaceFileCopyMoveInput {
  path: string;
  targetPath: string;
}

export function validateSshExecInput(value: unknown): SshExecInput {
  const record = requireRecord(value, 'SSH exec input');
  const input: SshExecInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    command: requireNonEmptyString(record.command, 'command'),
  };
  if (record.timeoutMs !== undefined) {
    input.timeoutMs = requireInteger(record.timeoutMs, 'timeoutMs', 1000, 120000);
  }
  return input;
}

export function validateSshFileListInput(value: unknown): SshFileListInput {
  const record = requireRecord(value, 'SSH file list input');
  const input: SshFileListInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
  };
  if (record.path !== undefined) {
    input.path = requireString(record.path, 'path');
  }
  if (record.limit !== undefined) {
    input.limit = requireInteger(record.limit, 'limit', 1, 500);
  }
  if (record.timeoutMs !== undefined) {
    input.timeoutMs = requireInteger(record.timeoutMs, 'timeoutMs', 1000, 120000);
  }
  return input;
}

export function validateSshFileStatInput(value: unknown): SshFileStatInput {
  const record = requireRecord(value, 'SSH file stat input');
  const input: SshFileStatInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    path: requireNonEmptyString(record.path, 'path'),
  };
  if (record.timeoutMs !== undefined) {
    input.timeoutMs = requireInteger(record.timeoutMs, 'timeoutMs', 1000, 120000);
  }
  return input;
}

export function validateSshFileTransferInput(value: unknown): SshFileTransferInput {
  const record = requireRecord(value, 'SSH file transfer input');
  const input: SshFileTransferInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    localPath: requireNonEmptyString(record.localPath, 'localPath'),
    remotePath: requireNonEmptyString(record.remotePath, 'remotePath'),
  };
  if (record.timeoutMs !== undefined) {
    input.timeoutMs = requireInteger(record.timeoutMs, 'timeoutMs', 1000, 120000);
  }
  return input;
}

export function validateOperatorProposeInput(value: unknown): OperatorProposeInput {
  const record = requireRecord(value, 'Operator propose input');
  return {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    request: record.request === undefined
      ? 'Generate safe diagnostic proposals for this host.'
      : requireString(record.request, 'request').slice(0, 4000),
  };
}

export function validateHostOperationInput(value: unknown): HostOperationInput {
  const record = requireRecord(value, 'host operation input');
  const kind = requireEnum(record.kind, HOST_OPERATION_KINDS, 'kind');
  const input: HostOperationInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    kind,
  };
  if (record.path !== undefined) {
    input.path = requireString(record.path, 'path');
  }
  if (record.filter !== undefined) {
    input.filter = requireString(record.filter, 'filter');
  }
  if (record.limit !== undefined) {
    input.limit = requireInteger(record.limit, 'limit', 1, 250);
  }
  return input;
}

export function validateNoInput(value: unknown): void {
  if (value !== undefined && value !== null) {
    throw new RuntimeValidationError('Route does not accept a request payload.');
  }
}

export function validateWorkspaceFileListInput(value: unknown): string {
  return optionalString(value, 'path');
}

export function validateWorkspaceFileTargetPathInput(value: unknown): string {
  return optionalString(value, 'targetPath');
}

export function validateWorkspaceFileCreateFileInput(value: unknown): WorkspaceFileCreateFileInput {
  const record = requireRecord(value, 'workspace file create input');
  return {
    kind: normalizeWorkspaceFileKind(record.kind),
    targetPath: optionalString(record.targetPath, 'targetPath'),
  };
}

export function validateWorkspaceFilePathInput(value: unknown): string {
  return requireNonEmptyString(value, 'path');
}

export function validateWorkspaceFileRenameInput(value: unknown): WorkspaceFileRenameInput {
  const record = requireRecord(value, 'workspace file rename input');
  return {
    path: requireNonEmptyString(record.path, 'path'),
    newName: requireString(record.newName, 'newName'),
  };
}

export function validateWorkspaceFileCopyMoveInput(value: unknown): WorkspaceFileCopyMoveInput {
  const record = requireRecord(value, 'workspace file copy/move input');
  return {
    path: requireNonEmptyString(record.path, 'path'),
    targetPath: optionalString(record.targetPath, 'targetPath'),
  };
}

export function validateWorkspaceTrashIdInput(value: unknown): string {
  const id = requireNonEmptyString(value, 'id');
  if (!/^[0-9a-f]{24}$/.test(id)) {
    throw new RuntimeValidationError('id must be a 24-character lowercase hexadecimal trash id.');
  }
  return id;
}

export function validateWorkspaceProfileIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'profileId');
}

export function validateWorkspaceProfileCreateInput(value: unknown): CreateWorkspaceProfileInput {
  const record = requireRecord(value, 'workspace profile create input');
  const input: CreateWorkspaceProfileInput = {
    name: 'New workspace',
    layout: emptyWorkspaceLayout(),
  };

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.layout !== undefined) {
    input.layout = validateWorkspaceLayoutInput(record.layout);
  }

  return input;
}

export function validateWorkspaceProfileUpdateInput(value: unknown): UpdateWorkspaceProfileInput {
  const record = requireRecord(value, 'workspace profile update input');
  const input: UpdateWorkspaceProfileInput = {};

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.layout !== undefined) {
    input.layout = validateWorkspaceLayoutInput(record.layout);
  }

  return input;
}

export function validateWorkspaceActiveProfileInput(value: unknown): string {
  const record = requireRecord(value, 'active workspace profile input');
  return validateWorkspaceProfileIdInput(record.profileId);
}

export function validateHostCreateInput(value: unknown): CreateHostInput {
  const record = requireRecord(value, 'host create input');
  const input: CreateHostInput = {};

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.address !== undefined) {
    input.address = sanitizeOptionalString(record.address, 'address');
  }
  if (record.hostname !== undefined) {
    input.hostname = sanitizeOptionalString(record.hostname, 'hostname');
  }
  if (record.port !== undefined) {
    input.port = requireInteger(record.port, 'port', 1, 65535);
  }
  if (record.username !== undefined) {
    input.username = sanitizeOptionalString(record.username, 'username');
  }
  if (record.authMode !== undefined) {
    input.authMode = requireEnum(
      record.authMode,
      HOST_AUTH_MODES,
      'authMode',
    );
  }
  if (record.keyPath !== undefined) {
    input.keyPath = sanitizeOptionalString(record.keyPath, 'keyPath');
  }
  if (record.credentialRefId !== undefined) {
    input.credentialRefId = record.credentialRefId === null
      ? null
      : sanitizeOptionalString(record.credentialRefId, 'credentialRefId');
  }
  if (record.tags !== undefined) {
    input.tags = requireStringList(record.tags, 'tags');
  }
  if (record.group !== undefined) {
    input.group = sanitizeOptionalString(record.group, 'group');
  }
  if (record.favorite !== undefined) {
    input.favorite = requireBoolean(record.favorite, 'favorite');
  }
  if (record.osHint !== undefined) {
    input.osHint = sanitizeOptionalString(record.osHint, 'osHint');
  }
  if (record.bootstrapStatus !== undefined) {
    input.bootstrapStatus = requireEnum(
      record.bootstrapStatus,
      HOST_BOOTSTRAP_STATUSES,
      'bootstrapStatus',
    );
  }
  if (record.defaultShell !== undefined) {
    input.defaultShell = sanitizeOptionalString(record.defaultShell, 'defaultShell');
  }
  if (record.defaultWorkingDirectory !== undefined) {
    input.defaultWorkingDirectory = sanitizeOptionalString(
      record.defaultWorkingDirectory,
      'defaultWorkingDirectory',
    );
  }
  if (record.capabilities !== undefined) {
    input.capabilities = requireStringList(record.capabilities, 'capabilities');
  }
  if (record.notes !== undefined) {
    input.notes = sanitizeOptionalString(record.notes, 'notes');
  }

  return input;
}

export function validateHostUpdateInput(value: unknown): UpdateHostInput {
  return validateHostCreateInput(value);
}

export function validateHostIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'hostId');
}

export function validateHostImportInput(value: unknown): HostRecord[] {
  const records = requireRecordArray(value, 'host import payload');
  return records.map((record, index) => {
    const hostId = requireNonEmptyString(record.id, `hostRecords[${index}].id`);
    return {
      ...record,
      id: hostId,
    } as unknown as HostRecord;
  });
}

export function validateHostGroupNameInput(value: unknown): string {
  return requireString(value, 'groupName');
}

export function validateHostFavoriteInput(value: unknown): boolean {
  return requireBoolean(value, 'favorite');
}

export function validateHostGroupIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'groupId');
}

export function validateHostGroupCreateInput(value: unknown): CreateHostGroupInput {
  const record = requireRecord(value, 'host group create input');
  return {
    name: sanitizeOptionalString(record.name, 'name'),
    color: requireString(record.color, 'color'),
  };
}

export function validateHostGroupUpdateInput(value: unknown): UpdateHostGroupInput {
  const record = requireRecord(value, 'host group update input');
  const input: UpdateHostGroupInput = {};
  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.color !== undefined) {
    input.color = requireString(record.color, 'color');
  }
  return input;
}

export function validateHostTagIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'tagId');
}

export function validateHostTagCreateInput(value: unknown): CreateHostTagInput {
  const record = requireRecord(value, 'host tag create input');
  return {
    name: sanitizeOptionalString(record.name, 'name'),
    color: requireString(record.color, 'color'),
  };
}

export function validateHostTagUpdateInput(value: unknown): UpdateHostTagInput {
  const record = requireRecord(value, 'host tag update input');
  const input: UpdateHostTagInput = {};
  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.color !== undefined) {
    input.color = requireString(record.color, 'color');
  }
  return input;
}

export function validateBootstrapGenerateInput(value: unknown): BootstrapGenerateInput {
  const record = requireRecord(value, 'bootstrap generate input');
  const input: BootstrapGenerateInput = {
    presetId: requireEnum(record.presetId, BOOTSTRAP_PRESETS, 'presetId'),
  };
  if (record.hostId !== undefined) {
    input.hostId = record.hostId === null ? null : requireNonEmptyString(record.hostId, 'hostId');
  }
  if (record.options !== undefined) {
    const options = requireRecord(record.options, 'options');
    input.options = {};
    if (options.installPackages !== undefined) {
      input.options.installPackages = requireBoolean(options.installPackages, 'installPackages');
    }
    if (options.includeDockerCheck !== undefined) {
      input.options.includeDockerCheck = requireBoolean(options.includeDockerCheck, 'includeDockerCheck');
    }
  }
  return input;
}

export function validateSettingsUpdate(value: unknown): MvpSettingsUpdate {
  const record = requireRecord(value, 'settings update');
  const update: MvpSettingsUpdate = {};
  if (record.theme !== undefined) {
    update.theme = requireEnum(record.theme, THEMES, 'theme');
  }
  if (record.defaultWindowBehavior !== undefined) {
    update.defaultWindowBehavior = requireEnum(record.defaultWindowBehavior, WINDOW_BEHAVIORS, 'defaultWindowBehavior');
  }
  if (record.desktopWallpaper !== undefined) {
    update.desktopWallpaper = requireEnum(record.desktopWallpaper, WALLPAPER_MODES, 'desktopWallpaper');
  }
  if (record.desktopWallpaperLayout !== undefined) {
    update.desktopWallpaperLayout = requireEnum(
      record.desktopWallpaperLayout,
      WALLPAPER_LAYOUT_MODES,
      'desktopWallpaperLayout',
    );
  }
  if (record.sshDefaults !== undefined) {
    const sshDefaults = requireRecord(record.sshDefaults, 'sshDefaults');
    update.sshDefaults = {};
    if (sshDefaults.port !== undefined) {
      update.sshDefaults.port = requireInteger(sshDefaults.port, 'sshDefaults.port', 1, 65535);
    }
    if (sshDefaults.username !== undefined) {
      update.sshDefaults.username = requireString(sshDefaults.username, 'sshDefaults.username');
    }
    if (sshDefaults.authMode !== undefined) {
      update.sshDefaults.authMode = requireEnum(sshDefaults.authMode, AUTH_MODES, 'sshDefaults.authMode');
    }
    if (sshDefaults.connectTimeoutMs !== undefined) {
      update.sshDefaults.connectTimeoutMs = requireInteger(sshDefaults.connectTimeoutMs, 'sshDefaults.connectTimeoutMs', 1000, 120000);
    }
  }
  if (record.operator !== undefined) {
    const operator = requireRecord(record.operator, 'operator');
    update.operator = {};
    if (operator.endpoint !== undefined) {
      update.operator.endpoint = requireString(operator.endpoint, 'operator.endpoint');
    }
    if (operator.policy !== undefined) {
      update.operator.policy = requireEnum(operator.policy, OPERATOR_POLICIES, 'operator.policy');
    }
  }
  return update;
}

export function validateSecretStoreInput(key: unknown, value: unknown): { key: string; value: string } {
  return {
    key: requireNonEmptyString(key, 'key'),
    value: requireString(value, 'value'),
  };
}

export function validateSecretKeyInput(key: unknown): string {
  return requireNonEmptyString(key, 'key');
}

export function validateTerminalStartInput(hostId: unknown): string {
  return requireNonEmptyString(hostId, 'hostId');
}

export function validateTerminalWriteInput(sessionId: unknown, input: unknown): { sessionId: string; input: string } {
  return {
    sessionId: requireNonEmptyString(sessionId, 'sessionId'),
    input: requireString(input, 'input'),
  };
}

export function validateTerminalResizeInput(sessionId: unknown, cols: unknown, rows: unknown): { sessionId: string; cols: number; rows: number } {
  return {
    sessionId: requireNonEmptyString(sessionId, 'sessionId'),
    cols: requireInteger(cols, 'cols', 2, 500),
    rows: requireInteger(rows, 'rows', 2, 500),
  };
}

export function validateTerminalStopInput(sessionId: unknown): string {
  return requireNonEmptyString(sessionId, 'sessionId');
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RuntimeValidationError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const text = requireString(value, label).trim();
  if (!text) {
    throw new RuntimeValidationError(`${label} is required.`);
  }
  return text;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new RuntimeValidationError(`${label} must be a string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) {
    return '';
  }
  return requireString(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RuntimeValidationError(`${label} must be a boolean.`);
  }
  return value;
}

function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new RuntimeValidationError(`${label} must be an array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new RuntimeValidationError(`${label}[${index}] must be a string.`);
    }
    return entry;
  });
}

function sanitizeOptionalString(value: unknown, label: string): string {
  const text = requireString(value, label);
  return text.trim();
}

function normalizeWorkspaceFileKind(value: unknown): WorkspaceFileKindInput {
  return WORKSPACE_FILE_KINDS.includes(value as WorkspaceFileKindInput)
    ? value as WorkspaceFileKindInput
    : 'note';
}

function validateWorkspaceLayoutInput(value: unknown): WorkspaceLayoutSnapshot {
  requireRecord(value, 'layout');
  return value as WorkspaceLayoutSnapshot;
}

function emptyWorkspaceLayout(): WorkspaceLayoutSnapshot {
  return {
    desktopShortcutIds: [],
    windows: [],
  };
}

function requireRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new RuntimeValidationError(`${label} must be an array.`);
  }
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new RuntimeValidationError(`${label}[${index}] must be an object.`);
    }
    return entry as Record<string, unknown>;
  });
}

function requireInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RuntimeValidationError(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new RuntimeValidationError(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}
