import type {
  BootstrapGenerateInput,
  BootstrapPresetId,
  HostOperationInput,
  HostOperationKind,
  MvpSettings,
  MvpSettingsUpdate,
  OperatorProposeInput,
  SshFileListInput,
  SshFileStatInput,
  SshFileTransferInput,
  SshExecInput,
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
const OPERATOR_POLICIES: readonly MvpSettings['operator']['policy'][] = ['manual-approval', 'disabled'];

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

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RuntimeValidationError(`${label} must be a boolean.`);
  }
  return value;
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
