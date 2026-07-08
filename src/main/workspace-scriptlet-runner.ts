import { createHash } from 'crypto';
import type {
  SshExecResult,
  WorkspaceArtifactContentRecord,
  WorkspaceScriptletRunInput,
  WorkspaceScriptletRunResult,
} from '../shared/mvp-models';
import { RuntimeValidationError } from './runtime-validation';

interface PreparedWorkspaceScriptletRun {
  path: string;
  name: string;
  hostId: string;
  commandLabel: string;
  remoteCommand: string;
  capabilities: string[];
  timeoutMs?: number;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function nestedStringField(record: Record<string, unknown>, key: string, nestedKey: string): string {
  const value = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  return stringField(value as Record<string, unknown>, nestedKey);
}

function scriptletDeclaredCapabilities(manifest: Record<string, unknown>): string[] {
  return Array.from(new Set([
    ...stringArrayField(manifest, 'capabilities'),
    ...stringArrayField(manifest, 'requiredCapabilities'),
    ...stringArrayField(manifest, 'requestedCapabilities'),
  ]));
}

function scriptletHostId(manifest: Record<string, unknown>, input: WorkspaceScriptletRunInput): string {
  return input.hostId
    || stringField(manifest, 'hostId')
    || stringField(manifest, 'targetHostId')
    || nestedStringField(manifest, 'host', 'id');
}

function scriptletRemoteCommand(manifest: Record<string, unknown>): string {
  return stringField(manifest, 'command')
    || stringField(manifest, 'script')
    || nestedStringField(manifest, 'source', 'command')
    || nestedStringField(manifest, 'source', 'code');
}

export function workspaceArtifactPathHash(pathValue: string): string {
  return createHash('sha256').update(pathValue).digest('hex').slice(0, 16);
}

export function prepareWorkspaceScriptletRun(
  record: WorkspaceArtifactContentRecord,
  input: WorkspaceScriptletRunInput,
): PreparedWorkspaceScriptletRun {
  if (record.kind !== 'scriptlet') {
    throw new RuntimeValidationError('Workspace scriptlet run is available only for .sbscriptlet.json artifacts.');
  }
  if (record.path !== input.path) {
    throw new RuntimeValidationError('Workspace scriptlet run path must match the artifact content path.');
  }

  const manifest = record.manifest;
  if (manifest.kind !== 'scriptlet') {
    throw new RuntimeValidationError('Workspace scriptlet artifact manifest kind must be scriptlet.');
  }

  const capabilities = scriptletDeclaredCapabilities(manifest);
  if (!capabilities.includes('ssh:exec')) {
    throw new RuntimeValidationError('Workspace scriptlet artifact must declare the ssh:exec capability before it can run.');
  }

  const hostId = scriptletHostId(manifest, input);
  if (!hostId) {
    throw new RuntimeValidationError('Workspace scriptlet artifact must declare a hostId before it can run.');
  }

  const remoteCommand = scriptletRemoteCommand(manifest);
  if (!remoteCommand) {
    throw new RuntimeValidationError('Workspace scriptlet artifact must declare a command or source.code before it can run.');
  }

  const name = stringField(manifest, 'name') || record.name.replace(/\.sbscriptlet\.json$/, '');
  return {
    path: record.path,
    name,
    hostId,
    commandLabel: `workspace-scriptlet:${record.name}`,
    remoteCommand,
    capabilities,
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
  };
}

export function workspaceScriptletRunResult(
  prepared: PreparedWorkspaceScriptletRun,
  execResult: SshExecResult,
): WorkspaceScriptletRunResult {
  return {
    path: prepared.path,
    name: prepared.name,
    hostId: prepared.hostId,
    command: prepared.commandLabel,
    stdout: execResult.stdout,
    stderr: execResult.stderr,
    exitCode: execResult.exitCode,
    durationMs: execResult.durationMs,
    startedAt: execResult.startedAt,
    completedAt: execResult.completedAt,
    status: execResult.status,
    error: execResult.error,
    capabilities: prepared.capabilities,
    artifactKind: 'scriptlet',
    sourceLogged: false,
    scriptLogged: false,
    commandTextLogged: false,
    commandOutputLogged: false,
  };
}

export function workspaceScriptletRunRouteSuccessMetadata(result: WorkspaceScriptletRunResult): Record<string, unknown> {
  return {
    pathHash: workspaceArtifactPathHash(result.path),
    pathLength: result.path.length,
    kind: result.artifactKind,
    hostId: result.hostId,
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    capabilityCount: result.capabilities.length,
    artifactContentLogged: false,
    manifestLogged: false,
    sourceCodeLogged: false,
    scriptLogged: false,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}
