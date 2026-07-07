import type {
  AgentEndpoint,
  BootstrapGenerateInput,
  BootstrapPresetId,
  BootstrapRun,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  AppScopedStorageDeleteInput,
  AppScopedStorageGetInput,
  AppScopedStorageSetInput,
  GeneratedAppHostCapabilitiesInput,
  GeneratedAppHostGetInput,
  GeneratedAppHostListInput,
  GeneratedAppHostStatusInput,
  GeneratedAppHostTargetInput,
  GeneratedAppHostTestConnectionInput,
  GeneratedAppHostSdkMethod,
  CreateAgentEndpointInput,
  CreateAuditEventInput,
  CreateBootstrapPresetInput,
  CreateBootstrapRunInput,
  CreateCommandHistoryInput,
  CreateHostGroupInput,
  CreateHostInput,
  CreateHostTagInput,
  CreateCredentialRefInput,
  CredentialType,
  HostOperationInput,
  HostOperationKind,
  HostAuthMode,
  HostBootstrapStatus,
  HostRecord,
  MvpSettings,
  MvpSettingsUpdate,
  OperatorActionExecuteInput,
  OperatorProposeInput,
  OperatorProposalRisk,
  OperatorProposalSource,
  OperatorProposalStatus,
  SshFileDeleteInput,
  SshFileListInput,
  SshFileMoveInput,
  SshFileStatInput,
  SshFileTransferInput,
  SshExecInput,
  UpdateAgentEndpointInput,
  UpdateAppManifestInput,
  UpdateBootstrapPresetInput,
  UpdateBootstrapRunInput,
  UpdateHostGroupInput,
  UpdateHostInput,
  UpdateHostTagInput,
  UpdateCredentialRefInput,
  CreateWorkspaceProfileInput,
  UpdateWorkspaceProfileInput,
  WorkspaceArtifactContentUpdateInput,
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
const BOOTSTRAP_RUN_STATUSES: readonly BootstrapRun['status'][] = [
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
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
const OPERATOR_ACTION_KINDS = ['ssh-command'] as const;
const OPERATOR_PROPOSAL_RISKS: readonly OperatorProposalRisk[] = ['low', 'medium', 'high'];
const OPERATOR_PROPOSAL_SOURCES: readonly OperatorProposalSource[] = ['provider', 'fallback'];
const OPERATOR_PROPOSAL_STATUSES: readonly OperatorProposalStatus[] = ['pending', 'approved', 'dispatched', 'failed'];
const AGENT_ENDPOINT_POLICIES: readonly AgentEndpoint['policy'][] = ['safe', 'balanced', 'permissive', 'full-trust'];
const GENERATED_APP_HOST_SDK_METHODS: readonly GeneratedAppHostSdkMethod[] = [
  'host:list',
  'host:get',
  'host:getStatus',
  'host:getCapabilities',
  'host:testConnection',
];
const WORKSPACE_FILE_KINDS = ['applet', 'scriptlet', 'note'] as const;
const WORKSPACE_ARTIFACT_CONTENT_KINDS = ['applet', 'scriptlet'] as const;
const CREDENTIAL_TYPES: readonly CredentialType[] = ['keychain_ref', 'file_path', 'ssh_agent', 'env_var'];
const MAX_OPERATOR_ACTION_COMMAND_LENGTH = 4000;
const MAX_WORKSPACE_ARTIFACT_CONTENT_LENGTH = 1_000_000;

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

export interface WorkspaceArtifactContentGetInput {
  path: string;
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

export function validateSshFileDeleteInput(value: unknown): SshFileDeleteInput {
  const record = requireRecord(value, 'SSH file delete input');
  const input: SshFileDeleteInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    path: requireNonEmptyString(record.path, 'path'),
  };
  if (record.recursive !== undefined) {
    input.recursive = requireBoolean(record.recursive, 'recursive');
  }
  if (record.timeoutMs !== undefined) {
    input.timeoutMs = requireInteger(record.timeoutMs, 'timeoutMs', 1000, 120000);
  }
  return input;
}

export function validateSshFileMoveInput(value: unknown): SshFileMoveInput {
  const record = requireRecord(value, 'SSH file move input');
  const input: SshFileMoveInput = {
    hostId: requireNonEmptyString(record.hostId, 'hostId'),
    sourcePath: requireNonEmptyString(record.sourcePath, 'sourcePath'),
    targetPath: requireNonEmptyString(record.targetPath, 'targetPath'),
  };
  if (record.overwrite !== undefined) {
    input.overwrite = requireBoolean(record.overwrite, 'overwrite');
  }
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

export function validateOperatorActionExecuteInput(value: unknown): OperatorActionExecuteInput {
  const record = requireRecord(value, 'Operator action execution input');
  const proposalRecord = requireRecord(record.proposal, 'proposal');
  const actionRecord = requireRecord(record.action, 'action');
  const hostId = requireNonEmptyString(record.hostId, 'hostId');
  const approved = requireBoolean(record.approved, 'approved');
  if (!approved) {
    throw new RuntimeValidationError('Operator action execution requires approved to be true.');
  }

  const proposalCommand = requireNonEmptyString(proposalRecord.command, 'proposal.command');
  const actionCommand = requireNonEmptyString(actionRecord.command, 'action.command');
  if (proposalCommand.length > MAX_OPERATOR_ACTION_COMMAND_LENGTH || actionCommand.length > MAX_OPERATOR_ACTION_COMMAND_LENGTH) {
    throw new RuntimeValidationError(`Operator action command must be ${MAX_OPERATOR_ACTION_COMMAND_LENGTH} characters or fewer.`);
  }
  if (proposalCommand !== actionCommand) {
    throw new RuntimeValidationError('Operator action command must match the approved proposal command.');
  }

  const proposalStatus = requireEnum(proposalRecord.status, OPERATOR_PROPOSAL_STATUSES, 'proposal.status');
  if (proposalStatus !== 'approved') {
    throw new RuntimeValidationError('Operator proposal status must be approved before execution.');
  }

  return {
    hostId,
    approved,
    proposal: {
      id: requireNonEmptyString(proposalRecord.id, 'proposal.id'),
      title: requireNonEmptyString(proposalRecord.title, 'proposal.title'),
      command: proposalCommand,
      rationale: requireNonEmptyString(proposalRecord.rationale, 'proposal.rationale'),
      risk: requireEnum(proposalRecord.risk, OPERATOR_PROPOSAL_RISKS, 'proposal.risk'),
      status: proposalStatus,
      message: proposalRecord.message === undefined ? '' : requireString(proposalRecord.message, 'proposal.message'),
      source: requireEnum(proposalRecord.source, OPERATOR_PROPOSAL_SOURCES, 'proposal.source'),
    },
    action: {
      kind: requireEnum(actionRecord.kind, OPERATOR_ACTION_KINDS, 'action.kind'),
      command: actionCommand,
    },
  };
}

export function validateAgentEndpointIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'endpointId');
}

export function validateAgentEndpointCreateInput(value: unknown): CreateAgentEndpointInput {
  const record = requireRecord(value, 'agent endpoint create input');
  const input: CreateAgentEndpointInput = {
    name: '',
    provider: '',
    baseUrl: '',
    model: '',
  };

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.provider !== undefined) {
    input.provider = sanitizeOptionalString(record.provider, 'provider');
  }
  if (record.baseUrl !== undefined) {
    input.baseUrl = sanitizeOptionalString(record.baseUrl, 'baseUrl');
  }
  if (record.model !== undefined) {
    input.model = sanitizeOptionalString(record.model, 'model');
  }
  if (record.credentialRefId !== undefined) {
    input.credentialRefId = normalizeNullableId(record.credentialRefId, 'credentialRefId');
  }
  if (record.contextLimit !== undefined) {
    input.contextLimit = requireInteger(record.contextLimit, 'contextLimit', 1, 10000000);
  }
  if (record.toolUse !== undefined) {
    input.toolUse = requireBoolean(record.toolUse, 'toolUse');
  }
  if (record.streaming !== undefined) {
    input.streaming = requireBoolean(record.streaming, 'streaming');
  }
  if (record.policy !== undefined) {
    input.policy = requireEnum(record.policy, AGENT_ENDPOINT_POLICIES, 'policy');
  }
  if (record.enabled !== undefined) {
    input.enabled = requireBoolean(record.enabled, 'enabled');
  }

  return input;
}

export function validateAgentEndpointUpdateInput(value: unknown): UpdateAgentEndpointInput {
  const record = requireRecord(value, 'agent endpoint update input');
  const input: UpdateAgentEndpointInput = {};

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.provider !== undefined) {
    input.provider = sanitizeOptionalString(record.provider, 'provider');
  }
  if (record.baseUrl !== undefined) {
    input.baseUrl = sanitizeOptionalString(record.baseUrl, 'baseUrl');
  }
  if (record.model !== undefined) {
    input.model = sanitizeOptionalString(record.model, 'model');
  }
  if (record.credentialRefId !== undefined) {
    input.credentialRefId = normalizeNullableId(record.credentialRefId, 'credentialRefId');
  }
  if (record.contextLimit !== undefined) {
    input.contextLimit = requireInteger(record.contextLimit, 'contextLimit', 1, 10000000);
  }
  if (record.toolUse !== undefined) {
    input.toolUse = requireBoolean(record.toolUse, 'toolUse');
  }
  if (record.streaming !== undefined) {
    input.streaming = requireBoolean(record.streaming, 'streaming');
  }
  if (record.policy !== undefined) {
    input.policy = requireEnum(record.policy, AGENT_ENDPOINT_POLICIES, 'policy');
  }
  if (record.enabled !== undefined) {
    input.enabled = requireBoolean(record.enabled, 'enabled');
  }

  return input;
}

export function validateAppManifestIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'manifestId');
}

export function validateAppManifestCreateInput(value: unknown): CreateAppManifestInput {
  const record = requireRecord(value, 'app manifest create input');
  const input: CreateAppManifestInput = {
    appId: requireNonEmptyString(record.appId, 'appId'),
    name: requireNonEmptyString(record.name, 'name'),
    version: requireNonEmptyString(record.version, 'version'),
    entrypoint: requireNonEmptyString(record.entrypoint, 'entrypoint'),
  };

  if (record.description !== undefined) {
    input.description = requireString(record.description, 'description');
  }
  if (record.author !== undefined) {
    input.author = sanitizeOptionalString(record.author, 'author');
  }
  if (record.icon !== undefined) {
    input.icon = sanitizeOptionalString(record.icon, 'icon');
  }
  if (record.category !== undefined) {
    input.category = sanitizeOptionalString(record.category, 'category');
  }
  if (record.capabilities !== undefined) {
    input.capabilities = requireStringList(record.capabilities, 'capabilities');
  }
  if (record.sourceCode !== undefined) {
    input.sourceCode = requireString(record.sourceCode, 'sourceCode');
  }
  if (record.packageMetadata !== undefined) {
    input.packageMetadata = validateMetadataRecord(record.packageMetadata, 'packageMetadata');
  }
  if (record.enabled !== undefined) {
    input.enabled = requireBoolean(record.enabled, 'enabled');
  }
  if (record.installedAt !== undefined) {
    input.installedAt = record.installedAt === null
      ? null
      : requireString(record.installedAt, 'installedAt');
  }

  return input;
}

export function validateAppManifestUpdateInput(value: unknown): UpdateAppManifestInput {
  const record = requireRecord(value, 'app manifest update input');
  const input: UpdateAppManifestInput = {};

  if (record.appId !== undefined) {
    input.appId = requireNonEmptyString(record.appId, 'appId');
  }
  if (record.name !== undefined) {
    input.name = requireNonEmptyString(record.name, 'name');
  }
  if (record.version !== undefined) {
    input.version = requireNonEmptyString(record.version, 'version');
  }
  if (record.entrypoint !== undefined) {
    input.entrypoint = requireNonEmptyString(record.entrypoint, 'entrypoint');
  }
  if (record.description !== undefined) {
    input.description = requireString(record.description, 'description');
  }
  if (record.author !== undefined) {
    input.author = sanitizeOptionalString(record.author, 'author');
  }
  if (record.icon !== undefined) {
    input.icon = sanitizeOptionalString(record.icon, 'icon');
  }
  if (record.category !== undefined) {
    input.category = sanitizeOptionalString(record.category, 'category');
  }
  if (record.capabilities !== undefined) {
    input.capabilities = requireStringList(record.capabilities, 'capabilities');
  }
  if (record.sourceCode !== undefined) {
    input.sourceCode = requireString(record.sourceCode, 'sourceCode');
  }
  if (record.packageMetadata !== undefined) {
    input.packageMetadata = validateMetadataRecord(record.packageMetadata, 'packageMetadata');
  }
  if (record.enabled !== undefined) {
    input.enabled = requireBoolean(record.enabled, 'enabled');
  }
  if (record.installedAt !== undefined) {
    input.installedAt = record.installedAt === null
      ? null
      : requireString(record.installedAt, 'installedAt');
  }

  return input;
}

export function validateAppPermissionListInput(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const appId = requireString(value, 'appId').trim();
  return appId ? appId : undefined;
}

export function validateAppPermissionCreateInput(value: unknown): CreateAppPermissionInput {
  const record = requireRecord(value, 'app permission create input');
  return {
    appId: requireNonEmptyString(record.appId, 'appId'),
    capability: requireNonEmptyString(record.capability, 'capability'),
    granted: requireBoolean(record.granted, 'granted'),
  };
}

export function validateAppPermissionIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'permissionId');
}

export function validateAppScopedStorageGetInput(value: unknown): AppScopedStorageGetInput {
  const record = requireRecord(value, 'app scoped storage get input');
  return {
    appId: validateAppScopedStorageAppId(record.appId),
    key: validateAppScopedStorageKey(record.key),
  };
}

export function validateAppScopedStorageSetInput(value: unknown): AppScopedStorageSetInput {
  const record = requireRecord(value, 'app scoped storage set input');
  const valueText = requireString(record.value, 'value');
  if (valueText.length > 65536) {
    throw new RuntimeValidationError('value must be 65536 characters or fewer.');
  }
  return {
    appId: validateAppScopedStorageAppId(record.appId),
    key: validateAppScopedStorageKey(record.key),
    value: valueText,
  };
}

export function validateAppScopedStorageDeleteInput(value: unknown): AppScopedStorageDeleteInput {
  const record = requireRecord(value, 'app scoped storage delete input');
  return {
    appId: validateAppScopedStorageAppId(record.appId),
    key: validateAppScopedStorageKey(record.key),
  };
}

export function validateGeneratedAppHostListInput(value: unknown): GeneratedAppHostListInput {
  const record = requireRecord(value, 'generated app host list input');
  const method = validateGeneratedAppHostMethod(record.method);
  if (method !== 'host:list') {
    throw new RuntimeValidationError('method must be host:list.');
  }
  return {
    appId: validateGeneratedAppSdkAppId(record.appId),
    windowId: validateGeneratedAppSdkWindowId(record.windowId),
    method,
  };
}

export function validateGeneratedAppHostGetInput(value: unknown): GeneratedAppHostGetInput {
  return validateGeneratedAppHostTargetInput(value, 'host:get', 'generated app host get input');
}

export function validateGeneratedAppHostStatusInput(value: unknown): GeneratedAppHostStatusInput {
  return validateGeneratedAppHostTargetInput(value, 'host:getStatus', 'generated app host status input');
}

export function validateGeneratedAppHostCapabilitiesInput(value: unknown): GeneratedAppHostCapabilitiesInput {
  return validateGeneratedAppHostTargetInput(value, 'host:getCapabilities', 'generated app host capabilities input');
}

export function validateGeneratedAppHostTestConnectionInput(value: unknown): GeneratedAppHostTestConnectionInput {
  return validateGeneratedAppHostTargetInput(value, 'host:testConnection', 'generated app host test input');
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

export function validateCommandHistoryListLimitInput(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireInteger(value, 'limit', 1, 500);
}

export function validateCommandHistoryCreateInput(value: unknown): CreateCommandHistoryInput {
  const record = requireRecord(value, 'command history create input');
  const input: CreateCommandHistoryInput = {
    command: record.command === undefined ? '' : requireString(record.command, 'command'),
  };

  if (record.hostId !== undefined) {
    input.hostId = record.hostId === null ? null : requireNonEmptyString(record.hostId, 'hostId');
  }
  if (record.sessionId !== undefined) {
    input.sessionId = record.sessionId === null ? null : requireNonEmptyString(record.sessionId, 'sessionId');
  }
  if (record.exitCode !== undefined) {
    input.exitCode = record.exitCode === null ? null : requireInteger(record.exitCode, 'exitCode', 0, 255);
  }
  if (record.durationMs !== undefined) {
    input.durationMs = record.durationMs === null ? null : requireInteger(record.durationMs, 'durationMs', 0, 86400000);
  }

  return input;
}

export function validateCommandHistoryEntryIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'entryId');
}

export function validateNoInput(value: unknown): void {
  if (value !== undefined && value !== null) {
    throw new RuntimeValidationError('Route does not accept a request payload.');
  }
}

const CLIENT_AUDIT_RESERVED_METADATA_KEYS = new Set([
  'appId',
  'approvalStatus',
  'backendApproved',
  'backendExecuted',
  'backendVerified',
  'caller',
  'contractId',
  'mutatesState',
  'policyCapability',
  'policyDecision',
  'policyMode',
  'privilegedAction',
  'route',
  'routePolicyRequired',
  'sessionId',
  'transport',
]);

export function validateAuditEventInput(value: unknown): CreateAuditEventInput {
  const record = requireRecord(value, 'audit event input');
  const metadata = record.metadata === undefined
    ? sanitizeClientAuditMetadata({})
    : sanitizeClientAuditMetadata(validateMetadataRecord(record.metadata, 'metadata'));

  return {
    type: requireNonEmptyString(record.type, 'type'),
    entityType: requireNonEmptyString(record.entityType, 'entityType'),
    entityId: record.entityId === undefined || record.entityId === null
      ? null
      : requireString(record.entityId, 'entityId'),
    message: requireString(record.message, 'message'),
    metadata,
  };
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

export function validateWorkspaceArtifactContentGetInput(value: unknown): WorkspaceArtifactContentGetInput {
  const record = requireRecord(value, 'workspace artifact content get input');
  return {
    path: requireNonEmptyString(record.path, 'path'),
  };
}

export function validateWorkspaceArtifactContentUpdateInput(value: unknown): WorkspaceArtifactContentUpdateInput {
  const record = requireRecord(value, 'workspace artifact content update input');
  const content = requireString(record.content, 'content');
  if (content.length > MAX_WORKSPACE_ARTIFACT_CONTENT_LENGTH) {
    throw new RuntimeValidationError(`content must be ${MAX_WORKSPACE_ARTIFACT_CONTENT_LENGTH} characters or fewer.`);
  }
  const parsed = parseWorkspaceArtifactManifest(content);
  const kind = parsed.kind;
  if (!WORKSPACE_ARTIFACT_CONTENT_KINDS.includes(kind as typeof WORKSPACE_ARTIFACT_CONTENT_KINDS[number])) {
    throw new RuntimeValidationError('manifest kind must be applet or scriptlet.');
  }
  if (parsed.capabilities !== undefined) {
    requireStringList(parsed.capabilities, 'manifest.capabilities');
  }
  return {
    path: requireNonEmptyString(record.path, 'path'),
    content,
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

export function validateCredentialRefIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'credentialRefId');
}

export function validateCredentialRefCreateInput(value: unknown): CreateCredentialRefInput {
  const record = requireRecord(value, 'credential reference create input');
  const input: CreateCredentialRefInput = {
    name: '',
    type: 'file_path',
    referenceValue: '',
  };

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.type !== undefined) {
    input.type = requireEnum(record.type, CREDENTIAL_TYPES, 'type');
  }
  if (record.referenceValue !== undefined) {
    input.referenceValue = requireString(record.referenceValue, 'referenceValue');
  }
  if (record.metadata !== undefined) {
    input.metadata = validateMetadataRecord(record.metadata, 'metadata');
  }

  return input;
}

export function validateCredentialRefUpdateInput(value: unknown): UpdateCredentialRefInput {
  const record = requireRecord(value, 'credential reference update input');
  const input: UpdateCredentialRefInput = {};

  if (record.name !== undefined) {
    input.name = sanitizeOptionalString(record.name, 'name');
  }
  if (record.type !== undefined) {
    input.type = requireEnum(record.type, CREDENTIAL_TYPES, 'type');
  }
  if (record.referenceValue !== undefined) {
    input.referenceValue = requireString(record.referenceValue, 'referenceValue');
  }
  if (record.metadata !== undefined) {
    input.metadata = validateMetadataRecord(record.metadata, 'metadata');
  }

  return input;
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

export function validateBootstrapPresetIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'presetId');
}

export function validateBootstrapPresetCreateInput(value: unknown): CreateBootstrapPresetInput {
  const record = requireRecord(value, 'bootstrap preset create input');
  const input: CreateBootstrapPresetInput = {
    presetId: requireNonEmptyString(record.presetId, 'presetId'),
    name: requireNonEmptyString(record.name, 'name'),
    description: requireString(record.description, 'description'),
    scriptTemplate: requireString(record.scriptTemplate, 'scriptTemplate'),
  };
  if (record.variables !== undefined) {
    input.variables = requireStringList(record.variables, 'variables');
  }
  if (record.enabled !== undefined) {
    input.enabled = requireBoolean(record.enabled, 'enabled');
  }
  return input;
}

export function validateBootstrapPresetUpdateInput(value: unknown): UpdateBootstrapPresetInput {
  const record = requireRecord(value, 'bootstrap preset update input');
  const input: UpdateBootstrapPresetInput = {};
  if (record.presetId !== undefined) {
    input.presetId = requireNonEmptyString(record.presetId, 'presetId');
  }
  if (record.name !== undefined) {
    input.name = requireNonEmptyString(record.name, 'name');
  }
  if (record.description !== undefined) {
    input.description = requireString(record.description, 'description');
  }
  if (record.scriptTemplate !== undefined) {
    input.scriptTemplate = requireString(record.scriptTemplate, 'scriptTemplate');
  }
  if (record.variables !== undefined) {
    input.variables = requireStringList(record.variables, 'variables');
  }
  if (record.enabled !== undefined) {
    input.enabled = requireBoolean(record.enabled, 'enabled');
  }
  return input;
}

export function validateBootstrapRunIdInput(value: unknown): string {
  return requireNonEmptyString(value, 'runId');
}

export function validateBootstrapRunCreateInput(value: unknown): CreateBootstrapRunInput {
  const record = requireRecord(value, 'bootstrap run create input');
  return {
    presetId: requireNonEmptyString(record.presetId, 'presetId'),
    hostId: record.hostId === undefined || record.hostId === null
      ? null
      : requireNonEmptyString(record.hostId, 'hostId'),
    scriptOutput: requireString(record.scriptOutput, 'scriptOutput'),
    status: requireEnum(record.status, BOOTSTRAP_RUN_STATUSES, 'status'),
  };
}

export function validateBootstrapRunUpdateInput(value: unknown): UpdateBootstrapRunInput {
  const record = requireRecord(value, 'bootstrap run update input');
  const input: UpdateBootstrapRunInput = {};
  if (record.scriptOutput !== undefined) {
    input.scriptOutput = requireString(record.scriptOutput, 'scriptOutput');
  }
  if (record.status !== undefined) {
    input.status = requireEnum(record.status, BOOTSTRAP_RUN_STATUSES, 'status');
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

function validateAppScopedStorageAppId(value: unknown): string {
  const appId = requireNonEmptyString(value, 'appId');
  if (appId.length > 128) {
    throw new RuntimeValidationError('appId must be 128 characters or fewer.');
  }
  return appId;
}

function validateAppScopedStorageKey(value: unknown): string {
  const key = requireNonEmptyString(value, 'key');
  if (key.length > 256) {
    throw new RuntimeValidationError('key must be 256 characters or fewer.');
  }
  return key;
}

function validateGeneratedAppHostTargetInput<TMethod extends Exclude<GeneratedAppHostSdkMethod, 'host:list'>>(
  value: unknown,
  expectedMethod: TMethod,
  label: string,
): Extract<GeneratedAppHostTargetInput, { method: TMethod }> {
  const record = requireRecord(value, label);
  const method = validateGeneratedAppHostMethod(record.method);
  if (method !== expectedMethod) {
    throw new RuntimeValidationError(`method must be ${expectedMethod}.`);
  }
  return {
    appId: validateGeneratedAppSdkAppId(record.appId),
    windowId: validateGeneratedAppSdkWindowId(record.windowId),
    method,
    hostId: validateHostIdInput(record.hostId),
  } as Extract<GeneratedAppHostTargetInput, { method: TMethod }>;
}

function validateGeneratedAppHostMethod(value: unknown): GeneratedAppHostSdkMethod {
  return requireEnum(value, GENERATED_APP_HOST_SDK_METHODS, 'method');
}

function validateGeneratedAppSdkAppId(value: unknown): string {
  const appId = requireNonEmptyString(value, 'appId');
  if (appId.length > 128) {
    throw new RuntimeValidationError('appId must be 128 characters or fewer.');
  }
  return appId;
}

function validateGeneratedAppSdkWindowId(value: unknown): string {
  const windowId = requireNonEmptyString(value, 'windowId');
  if (windowId.length > 128) {
    throw new RuntimeValidationError('windowId must be 128 characters or fewer.');
  }
  return windowId;
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

function normalizeNullableId(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  const text = requireString(value, label).trim();
  return text ? text : null;
}

function normalizeWorkspaceFileKind(value: unknown): WorkspaceFileKindInput {
  return WORKSPACE_FILE_KINDS.includes(value as WorkspaceFileKindInput)
    ? value as WorkspaceFileKindInput
    : 'note';
}

function parseWorkspaceArtifactManifest(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new RuntimeValidationError('content must be a JSON applet or scriptlet manifest.');
  }
  return requireRecord(parsed, 'manifest');
}

function validateWorkspaceLayoutInput(value: unknown): WorkspaceLayoutSnapshot {
  requireRecord(value, 'layout');
  return value as WorkspaceLayoutSnapshot;
}

function validateMetadataRecord(value: unknown, label: string): Record<string, unknown> {
  return requireRecord(value, label);
}

function sanitizeClientAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  let removedReservedAssertion = false;

  for (const [key, value] of Object.entries(metadata)) {
    if (CLIENT_AUDIT_RESERVED_METADATA_KEYS.has(key)) {
      removedReservedAssertion = true;
      continue;
    }
    sanitized[key] = value;
  }

  return {
    ...sanitized,
    clientOriginated: true,
    backendVerified: false,
    backendApproved: false,
    backendExecuted: false,
    ...(removedReservedAssertion ? { clientAssertionSanitized: true } : {}),
  };
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
