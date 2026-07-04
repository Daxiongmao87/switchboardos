import type { CreateAuditEventInput } from '../shared/mvp-models';
import type { PolicyService, PolicyContext, PolicyDecision } from './policy-service';
import type { PolicyCapability } from './policy-service';

export type HostRouteTransport = 'ipc' | 'hosted';
export type RouteHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | string;

export interface RouteAccessEndpoint {
  channel?: string;
  method?: RouteHttpMethod;
  path?: string;
}

export interface RouteAccessCallerIdentity {
  caller: 'ipc' | 'hosted';
  sessionRequired: boolean;
  appIdentityRequired: boolean;
}

export interface RouteAccessDenialAudit {
  source: 'policy.denied' | string;
  eventType: string;
}

export interface RouteAccessSuccessAudit {
  required: boolean;
  eventType: string;
  entityType: string;
  entityIdSource:
    | 'none'
    | 'context-host-id'
    | 'context-entity-id'
    | 'result-host-id'
    | 'result-profile-id'
    | 'result-id'
    | 'input-host-id'
    | 'result-first-id';
  message: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface RouteAccessParity {
  kind: 'paired' | 'exception';
  peerRouteId?: string;
  reason?: string;
}

export interface RouteAccessContract {
  id: string;
  transport: HostRouteTransport;
  route: RouteAccessEndpoint;
  requestValidator: string;
  identity: RouteAccessCallerIdentity;
  capability: PolicyCapability;
  policyDecisionRequired: boolean;
  denialAudit: RouteAccessDenialAudit;
  successAudit: RouteAccessSuccessAudit;
  parity: RouteAccessParity;
  mutatesState: boolean;
}

export interface RouteAccessExecutionContext {
  caller: 'ipc' | 'hosted';
  route: string;
  action: string;
  hostId?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  sessionId?: string | null;
  appId?: string | null;
}

export interface RouteAccessExecutionParams<TResult> {
  contract: RouteAccessContract;
  policyService: PolicyService;
  logAuditEvent: (event: CreateAuditEventInput) => void;
  context: RouteAccessExecutionContext;
  input?: unknown;
  execute: () => Promise<TResult> | TResult;
  shouldAuditSuccess?: (result: TResult) => boolean;
  successAuditMetadata?: (result: TResult) => Record<string, unknown>;
}

export const HOST_ROUTE_CONTRACTS: readonly RouteAccessContract[] = [
  {
    id: 'ipc:host:create',
    transport: 'ipc',
    route: {
      channel: 'host:create',
    },
    requestValidator: 'validateHostCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.created',
      entityType: 'host',
      entityIdSource: 'result-host-id',
      message: 'Host record created.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/hosts',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:update',
    transport: 'ipc',
    route: {
      channel: 'host:update',
    },
    requestValidator: 'validateHostUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.updated',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host record updated.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/hosts/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:delete',
    transport: 'ipc',
    route: {
      channel: 'host:delete',
    },
    requestValidator: 'validateHostIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.deleted',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host deleted.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/hosts/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:test-connection',
    transport: 'ipc',
    route: {
      channel: 'host:test-connection',
    },
    requestValidator: 'validateHostIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:test-connection',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.connection_test',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host connection test completed.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/hosts/:id/test',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:updateGroup',
    transport: 'ipc',
    route: {
      channel: 'host:updateGroup',
    },
    requestValidator: 'validateHostGroupNameInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:updateGroup',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.updated',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host group updated.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:setFavorite',
    transport: 'ipc',
    route: {
      channel: 'host:setFavorite',
    },
    requestValidator: 'validateHostFavoriteInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:setFavorite',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.updated',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host favorite flag updated.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:duplicate',
    transport: 'ipc',
    route: {
      channel: 'host:duplicate',
    },
    requestValidator: 'validateHostIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:duplicate',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.duplicated',
      entityType: 'host',
      entityIdSource: 'result-host-id',
      message: 'Host duplicated.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host:import',
    transport: 'ipc',
    route: {
      channel: 'host:import',
    },
    requestValidator: 'validateHostImportInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:import',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.imported',
      entityType: 'host',
      entityIdSource: 'result-first-id',
      message: 'Host import completed.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-group:list',
    transport: 'ipc',
    route: {
      channel: 'host-group:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-group:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'host_group.listed',
      entityType: 'host_group',
      entityIdSource: 'none',
      message: 'Host groups listed.',
      metadata: {
        actionClass: 'host-group-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:host-group:get',
    transport: 'ipc',
    route: {
      channel: 'host-group:get',
    },
    requestValidator: 'validateHostGroupIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-group:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'host_group.read',
      entityType: 'host_group',
      entityIdSource: 'context-entity-id',
      message: 'Host group read.',
      metadata: {
        actionClass: 'host-group-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:host-group:create',
    transport: 'ipc',
    route: {
      channel: 'host-group:create',
    },
    requestValidator: 'validateHostGroupCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-group:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host_group.created',
      entityType: 'host_group',
      entityIdSource: 'result-id',
      message: 'Host group created.',
      metadata: {
        actionClass: 'host-group-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-group:update',
    transport: 'ipc',
    route: {
      channel: 'host-group:update',
    },
    requestValidator: 'validateHostGroupUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-group:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host_group.updated',
      entityType: 'host_group',
      entityIdSource: 'context-entity-id',
      message: 'Host group updated.',
      metadata: {
        actionClass: 'host-group-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-group:delete',
    transport: 'ipc',
    route: {
      channel: 'host-group:delete',
    },
    requestValidator: 'validateHostGroupIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-group:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host_group.deleted',
      entityType: 'host_group',
      entityIdSource: 'context-entity-id',
      message: 'Host group deleted.',
      metadata: {
        actionClass: 'host-group-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-tag:list',
    transport: 'ipc',
    route: {
      channel: 'host-tag:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-tag:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'host_tag.listed',
      entityType: 'host_tag',
      entityIdSource: 'none',
      message: 'Host tags listed.',
      metadata: {
        actionClass: 'host-tag-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:host-tag:get',
    transport: 'ipc',
    route: {
      channel: 'host-tag:get',
    },
    requestValidator: 'validateHostTagIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-tag:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'host_tag.read',
      entityType: 'host_tag',
      entityIdSource: 'context-entity-id',
      message: 'Host tag read.',
      metadata: {
        actionClass: 'host-tag-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:host-tag:create',
    transport: 'ipc',
    route: {
      channel: 'host-tag:create',
    },
    requestValidator: 'validateHostTagCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-tag:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host_tag.created',
      entityType: 'host_tag',
      entityIdSource: 'result-id',
      message: 'Host tag created.',
      metadata: {
        actionClass: 'host-tag-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-tag:update',
    transport: 'ipc',
    route: {
      channel: 'host-tag:update',
    },
    requestValidator: 'validateHostTagUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-tag:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host_tag.updated',
      entityType: 'host_tag',
      entityIdSource: 'context-entity-id',
      message: 'Host tag updated.',
      metadata: {
        actionClass: 'host-tag-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-tag:delete',
    transport: 'ipc',
    route: {
      channel: 'host-tag:delete',
    },
    requestValidator: 'validateHostTagIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-tag:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host_tag.deleted',
      entityType: 'host_tag',
      entityIdSource: 'context-entity-id',
      message: 'Host tag deleted.',
      metadata: {
        actionClass: 'host-tag-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted equivalent in current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:host-operation:run',
    transport: 'ipc',
    route: {
      channel: 'host-operation:run',
    },
    requestValidator: 'validateHostOperationInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host-operation:run',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.operation_run',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'Host operation executed.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/host-operations/run',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:list',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:list',
    },
    requestValidator: 'validateWorkspaceFileListInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_file.listed',
      entityType: 'workspace_file',
      entityIdSource: 'context-entity-id',
      message: 'Workspace files listed.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/workspace-files',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:workspace-file:create-folder',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:create-folder',
    },
    requestValidator: 'validateWorkspaceFileTargetPathInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.created',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace folder created.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/folder',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:create-file',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:create-file',
    },
    requestValidator: 'validateWorkspaceFileCreateFileInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.created',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file created.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/file',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:rename',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:rename',
    },
    requestValidator: 'validateWorkspaceFileRenameInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.renamed',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file renamed.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/workspace-files',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:duplicate',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:duplicate',
    },
    requestValidator: 'validateWorkspaceFilePathInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.duplicated',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file duplicated.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/duplicate',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:copy',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:copy',
    },
    requestValidator: 'validateWorkspaceFileCopyMoveInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.copied',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file copied.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/copy',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:move',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:move',
    },
    requestValidator: 'validateWorkspaceFileCopyMoveInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.moved',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file moved.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/move',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:delete-permanent',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:delete-permanent',
    },
    requestValidator: 'validateWorkspaceFilePathInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.deleted',
      entityType: 'workspace_file',
      entityIdSource: 'context-entity-id',
      message: 'Workspace file permanently deleted.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/workspace-files',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:list-trash',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:list-trash',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_trash.listed',
      entityType: 'workspace_trash',
      entityIdSource: 'none',
      message: 'Workspace trash listed.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/workspace-files/trash',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:workspace-file:move-to-trash',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:move-to-trash',
    },
    requestValidator: 'validateWorkspaceFilePathInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.trashed',
      entityType: 'workspace_trash',
      entityIdSource: 'result-id',
      message: 'Workspace file moved to trash.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/trash',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:restore-trash',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:restore-trash',
    },
    requestValidator: 'validateWorkspaceTrashIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_trash.restored',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace trash item restored.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-files/trash/restore',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:delete-trash-permanent',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:delete-trash-permanent',
    },
    requestValidator: 'validateWorkspaceTrashIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_trash.deleted',
      entityType: 'workspace_trash',
      entityIdSource: 'context-entity-id',
      message: 'Workspace trash item permanently deleted.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/workspace-files/trash/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-file:empty-trash',
    transport: 'ipc',
    route: {
      channel: 'workspace-file:empty-trash',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_trash.emptied',
      entityType: 'workspace_trash',
      entityIdSource: 'none',
      message: 'Workspace trash emptied.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/workspace-files/trash',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace:list-profiles',
    transport: 'ipc',
    route: {
      channel: 'workspace:list-profiles',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_profile.listed',
      entityType: 'workspace_profile',
      entityIdSource: 'none',
      message: 'Workspace profiles listed.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/workspace/profiles',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:workspace:get-profile',
    transport: 'ipc',
    route: {
      channel: 'workspace:get-profile',
    },
    requestValidator: 'validateWorkspaceProfileIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_profile.read',
      entityType: 'workspace_profile',
      entityIdSource: 'context-entity-id',
      message: 'Workspace profile read.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/workspace/profiles/:id',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:workspace:create-profile',
    transport: 'ipc',
    route: {
      channel: 'workspace:create-profile',
    },
    requestValidator: 'validateWorkspaceProfileCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.created',
      entityType: 'workspace_profile',
      entityIdSource: 'result-profile-id',
      message: 'Workspace profile created.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace/profiles',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace:update-profile',
    transport: 'ipc',
    route: {
      channel: 'workspace:update-profile',
    },
    requestValidator: 'validateWorkspaceProfileUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.updated',
      entityType: 'workspace_profile',
      entityIdSource: 'context-entity-id',
      message: 'Workspace profile updated.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/workspace/profiles/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace:delete-profile',
    transport: 'ipc',
    route: {
      channel: 'workspace:delete-profile',
    },
    requestValidator: 'validateWorkspaceProfileIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.deleted',
      entityType: 'workspace_profile',
      entityIdSource: 'context-entity-id',
      message: 'Workspace profile deleted.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/workspace/profiles/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace:get-active-profile-id',
    transport: 'ipc',
    route: {
      channel: 'workspace:get-active-profile-id',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_profile.active_read',
      entityType: 'workspace_state',
      entityIdSource: 'none',
      message: 'Active workspace profile read.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/workspace/active-profile-id',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:workspace:set-active-profile-id',
    transport: 'ipc',
    route: {
      channel: 'workspace:set-active-profile-id',
    },
    requestValidator: 'validateWorkspaceProfileIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.active_set',
      entityType: 'workspace_state',
      entityIdSource: 'context-entity-id',
      message: 'Active workspace profile set.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PUT:/api/workspace/active-profile-id',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/workspace/profiles',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/workspace/profiles',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_profile.listed',
      entityType: 'workspace_profile',
      entityIdSource: 'none',
      message: 'Workspace profiles listed.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:list-profiles',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/workspace/profiles',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace/profiles',
    },
    requestValidator: 'validateWorkspaceProfileCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.created',
      entityType: 'workspace_profile',
      entityIdSource: 'result-profile-id',
      message: 'Workspace profile created.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:create-profile',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/workspace/profiles/:id',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/workspace/profiles/:id',
    },
    requestValidator: 'validateWorkspaceProfileIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_profile.read',
      entityType: 'workspace_profile',
      entityIdSource: 'context-entity-id',
      message: 'Workspace profile read.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:get-profile',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PATCH:/api/workspace/profiles/:id',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/workspace/profiles/:id',
    },
    requestValidator: 'validateWorkspaceProfileUpdateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.updated',
      entityType: 'workspace_profile',
      entityIdSource: 'context-entity-id',
      message: 'Workspace profile updated.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:update-profile',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/workspace/profiles/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/workspace/profiles/:id',
    },
    requestValidator: 'validateWorkspaceProfileIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.deleted',
      entityType: 'workspace_profile',
      entityIdSource: 'context-entity-id',
      message: 'Workspace profile deleted.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:delete-profile',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/workspace/active-profile-id',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/workspace/active-profile-id',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_profile.active_read',
      entityType: 'workspace_state',
      entityIdSource: 'none',
      message: 'Active workspace profile read.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:get-active-profile-id',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PUT:/api/workspace/active-profile-id',
    transport: 'hosted',
    route: {
      method: 'PUT',
      path: '/api/workspace/active-profile-id',
    },
    requestValidator: 'validateWorkspaceActiveProfileInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.active_set',
      entityType: 'workspace_state',
      entityIdSource: 'context-entity-id',
      message: 'Active workspace profile set.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:set-active-profile-id',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace/active-profile-id',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace/active-profile-id',
    },
    requestValidator: 'validateWorkspaceActiveProfileInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-profile:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_profile.active_set',
      entityType: 'workspace_state',
      entityIdSource: 'context-entity-id',
      message: 'Active workspace profile set.',
      metadata: {
        actionClass: 'workspace-profile-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace:set-active-profile-id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:credential-ref:list',
    transport: 'ipc',
    route: {
      channel: 'credential-ref:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'credential-ref:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'credential_ref.listed',
      entityType: 'credential_ref',
      entityIdSource: 'none',
      message: 'Credential references listed.',
      metadata: {
        actionClass: 'credential-ref-route',
        mutatingOperation: false,
        storesSecretMaterial: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted credential reference API is present in the current route set.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:credential-ref:get',
    transport: 'ipc',
    route: {
      channel: 'credential-ref:get',
    },
    requestValidator: 'validateCredentialRefIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'credential-ref:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'credential_ref.read',
      entityType: 'credential_ref',
      entityIdSource: 'context-entity-id',
      message: 'Credential reference read.',
      metadata: {
        actionClass: 'credential-ref-route',
        mutatingOperation: false,
        storesSecretMaterial: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted credential reference API is present in the current route set.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:credential-ref:create',
    transport: 'ipc',
    route: {
      channel: 'credential-ref:create',
    },
    requestValidator: 'validateCredentialRefCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'credential-ref:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'credential_ref.created',
      entityType: 'credential_ref',
      entityIdSource: 'result-id',
      message: 'Credential reference created.',
      metadata: {
        actionClass: 'credential-ref-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted credential reference API is present in the current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:credential-ref:update',
    transport: 'ipc',
    route: {
      channel: 'credential-ref:update',
    },
    requestValidator: 'validateCredentialRefUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'credential-ref:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'credential_ref.updated',
      entityType: 'credential_ref',
      entityIdSource: 'context-entity-id',
      message: 'Credential reference updated.',
      metadata: {
        actionClass: 'credential-ref-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted credential reference API is present in the current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:credential-ref:delete',
    transport: 'ipc',
    route: {
      channel: 'credential-ref:delete',
    },
    requestValidator: 'validateCredentialRefIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'credential-ref:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'credential_ref.deleted',
      entityType: 'credential_ref',
      entityIdSource: 'context-entity-id',
      message: 'Credential reference deleted.',
      metadata: {
        actionClass: 'credential-ref-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'No hosted credential reference API is present in the current route set.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:secret:store',
    transport: 'ipc',
    route: {
      channel: 'secret:store',
    },
    requestValidator: 'validateSecretStoreInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'secret:store',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'secret.stored',
      entityType: 'secret',
      entityIdSource: 'context-entity-id',
      message: 'Secret material stored with secure local storage; SQLite stores reference metadata only.',
      metadata: {
        actionClass: 'secret-route',
        mutatingOperation: true,
        rawSecretInSqlite: false,
        secretMaterialLogged: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'Hosted browser secret storage is stubbed in the current route set and does not call a backend API.',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:secret:retrieve',
    transport: 'ipc',
    route: {
      channel: 'secret:retrieve',
    },
    requestValidator: 'validateSecretKeyInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'secret:retrieve',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'secret.retrieve_checked',
      entityType: 'secret',
      entityIdSource: 'context-entity-id',
      message: 'Renderer secret retrieval request checked without returning plaintext.',
      metadata: {
        actionClass: 'secret-route',
        mutatingOperation: false,
        plaintextReturned: false,
        secretMaterialLogged: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'Hosted browser secret retrieval is stubbed in the current route set and does not call a backend API.',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:secret:delete',
    transport: 'ipc',
    route: {
      channel: 'secret:delete',
    },
    requestValidator: 'validateSecretKeyInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'secret:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'secret.deleted',
      entityType: 'secret',
      entityIdSource: 'context-entity-id',
      message: 'Secret material deleted from secure local storage.',
      metadata: {
        actionClass: 'secret-route',
        mutatingOperation: true,
        secretMaterialLogged: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'Hosted browser secret deletion is stubbed in the current route set and does not call a backend API.',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/hosts',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/hosts',
    },
    requestValidator: 'validateHostCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.created',
      entityType: 'host',
      entityIdSource: 'result-host-id',
      message: 'Host record created.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:host:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:PATCH:/api/hosts/:id',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/hosts/:id',
    },
    requestValidator: 'validateHostUpdateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.updated',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host record updated.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:host:update',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/hosts/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/hosts/:id',
    },
    requestValidator: 'validateHostIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.deleted',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host deleted.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:host:delete',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/hosts/:id/test',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/hosts/:id/test',
    },
    requestValidator: 'validateHostIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:test-connection',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.connection_test',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Host connection test completed.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:host:test-connection',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/host-operations/run',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/host-operations/run',
    },
    requestValidator: 'validateHostOperationInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host-operation:run',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'host.operation_run',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'Host operation executed.',
      metadata: {
        actionClass: 'host-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:host-operation:run',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/workspace-files',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/workspace-files',
    },
    requestValidator: 'validateWorkspaceFileListInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_file.listed',
      entityType: 'workspace_file',
      entityIdSource: 'context-entity-id',
      message: 'Workspace files listed.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/workspace-files/folder',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/folder',
    },
    requestValidator: 'validateWorkspaceFileTargetPathInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.created',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace folder created.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:create-folder',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace-files/file',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/file',
    },
    requestValidator: 'validateWorkspaceFileCreateFileInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.created',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file created.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:create-file',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:PATCH:/api/workspace-files',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/workspace-files',
    },
    requestValidator: 'validateWorkspaceFileRenameInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.renamed',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file renamed.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:rename',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace-files/duplicate',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/duplicate',
    },
    requestValidator: 'validateWorkspaceFilePathInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.duplicated',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file duplicated.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:duplicate',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace-files/copy',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/copy',
    },
    requestValidator: 'validateWorkspaceFileCopyMoveInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.copied',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file copied.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:copy',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace-files/move',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/move',
    },
    requestValidator: 'validateWorkspaceFileCopyMoveInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.moved',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace file moved.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:move',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/workspace-files',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/workspace-files',
    },
    requestValidator: 'validateWorkspaceFilePathInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.deleted',
      entityType: 'workspace_file',
      entityIdSource: 'context-entity-id',
      message: 'Workspace file permanently deleted.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:delete-permanent',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/workspace-files/trash',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/workspace-files/trash',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'workspace_trash.listed',
      entityType: 'workspace_trash',
      entityIdSource: 'none',
      message: 'Workspace trash listed.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:list-trash',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/workspace-files/trash',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/trash',
    },
    requestValidator: 'validateWorkspaceFilePathInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_file.trashed',
      entityType: 'workspace_trash',
      entityIdSource: 'result-id',
      message: 'Workspace file moved to trash.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:move-to-trash',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace-files/trash/restore',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-files/trash/restore',
    },
    requestValidator: 'validateWorkspaceTrashIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_trash.restored',
      entityType: 'workspace_file',
      entityIdSource: 'result-id',
      message: 'Workspace trash item restored.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:restore-trash',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/workspace-files/trash/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/workspace-files/trash/:id',
    },
    requestValidator: 'validateWorkspaceTrashIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_trash.deleted',
      entityType: 'workspace_trash',
      entityIdSource: 'context-entity-id',
      message: 'Workspace trash item permanently deleted.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:delete-trash-permanent',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/workspace-files/trash',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/workspace-files/trash',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'workspace-file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'workspace_trash.emptied',
      entityType: 'workspace_trash',
      entityIdSource: 'none',
      message: 'Workspace trash emptied.',
      metadata: {
        actionClass: 'workspace-file-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-file:empty-trash',
    },
    mutatesState: true,
  },
] as const;

export const HOST_ROUTE_CONTRACT_IDS = HOST_ROUTE_CONTRACTS.map((contract) => contract.id);

export function getHostRouteContract(contractId: string): RouteAccessContract | undefined {
  return HOST_ROUTE_CONTRACTS.find((contract) => contract.id === contractId);
}

export async function runHostRouteContract<TResult>(
  params: RouteAccessExecutionParams<TResult>,
): Promise<TResult> {
  let decision: PolicyDecision | null = null;
  if (params.contract.policyDecisionRequired) {
    const policyContext: PolicyContext = {
      caller: params.context.caller,
      route: params.context.route,
      action: params.context.action,
      hostId: params.context.hostId ?? null,
      entityId: params.context.entityId ?? null,
      entityType: params.context.entityType ?? null,
      sessionId: params.context.sessionId ?? null,
    };
    decision = params.policyService.assertAllowed(params.contract.capability, policyContext);
  }

  const result = await Promise.resolve(params.execute());

  const shouldAuditSuccess = params.shouldAuditSuccess ? params.shouldAuditSuccess(result) : true;
  if (params.contract.successAudit.required && shouldAuditSuccess) {
    const entityId = resolveAuditEntityId(
      params.contract.successAudit.entityIdSource,
      params.context,
      params.input,
      result,
    );

    const metadata: Record<string, unknown> = {
      ...params.contract.successAudit.metadata,
      ...(params.successAuditMetadata ? params.successAuditMetadata(result) : {}),
      caller: params.contract.identity.caller,
      route: params.context.route,
      action: params.context.action,
      contractId: params.contract.id,
      transport: params.contract.transport,
      policyCapability: params.contract.capability,
      mutatesState: params.contract.mutatesState,
      policyDecision: decision ? 'allowed' : 'skipped',
      policyMode: decision ? decision.mode : null,
      routePolicyRequired: params.contract.policyDecisionRequired,
    };

    if (params.context.hostId) {
      metadata.hostId = params.context.hostId;
    }
    if (params.context.entityId) {
      metadata.entityId = params.context.entityId;
    }
    if (params.context.entityType) {
      metadata.entityType = params.context.entityType;
    }
    if (params.context.appId) {
      metadata.appId = params.context.appId;
    }

    params.logAuditEvent({
      type: params.contract.successAudit.eventType,
      entityType: params.contract.successAudit.entityType,
      entityId,
      message: params.contract.successAudit.message,
      metadata,
    });
  }

  return result;
}

function resolveAuditEntityId(
  source: RouteAccessSuccessAudit['entityIdSource'],
  context: RouteAccessExecutionContext,
  input: unknown,
  result: unknown,
): string | null {
  if (source === 'none') {
    return null;
  }
  if (source === 'context-host-id') {
    return sanitizeId(context.hostId);
  }
  if (source === 'context-entity-id') {
    return sanitizeId(context.entityId);
  }
  if (source === 'input-host-id') {
    if (!isRecord(input)) {
      return null;
    }
    return sanitizeId(requireHostIdField(input.hostId));
  }
  if (source === 'result-host-id') {
    if (!isRecord(result)) {
      return null;
    }
    return sanitizeId(requireHostIdField(result.hostId));
  }
  if (source === 'result-profile-id') {
    if (!isRecord(result)) {
      return null;
    }
    return sanitizeId(requireHostIdField(result.profileId));
  }
  if (source === 'result-id') {
    if (!isRecord(result)) {
      return null;
    }
    return sanitizeId(requireHostIdField(result.id));
  }
  if (source === 'result-first-id' && Array.isArray(result) && result.length > 0) {
    const first = result[0];
    return typeof first === 'string' ? sanitizeId(first) : null;
  }

  return null;
}

function requireHostIdField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.trim();
  return sanitized ? sanitized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
