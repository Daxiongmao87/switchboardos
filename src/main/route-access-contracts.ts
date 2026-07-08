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
    id: 'ipc:ssh:exec',
    transport: 'ipc',
    route: {
      channel: 'ssh:exec',
    },
    requestValidator: 'validateSshExecInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'ssh:exec',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh.exec_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH exec route completed.',
      metadata: {
        actionClass: 'ssh-route',
        mutatingOperation: true,
        remoteCommandExecution: true,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh/exec',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:ssh-file:list',
    transport: 'ipc',
    route: {
      channel: 'ssh-file:list',
    },
    requestValidator: 'validateSshFileListInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.list_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file list route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: false,
        fileContentsLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh-files/list',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:ssh-file:stat',
    transport: 'ipc',
    route: {
      channel: 'ssh-file:stat',
    },
    requestValidator: 'validateSshFileStatInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.stat_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file stat route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: false,
        fileContentsLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh-files/stat',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:ssh-file:download',
    transport: 'ipc',
    route: {
      channel: 'ssh-file:download',
    },
    requestValidator: 'validateSshFileTransferInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.download_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file download route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        transferDirection: 'download',
        fileContentsLogged: false,
        localPathLogged: false,
        remotePathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh-files/download',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:ssh-file:upload',
    transport: 'ipc',
    route: {
      channel: 'ssh-file:upload',
    },
    requestValidator: 'validateSshFileTransferInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.upload_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file upload route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        transferDirection: 'upload',
        fileContentsLogged: false,
        localPathLogged: false,
        remotePathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh-files/upload',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:ssh-file:delete',
    transport: 'ipc',
    route: {
      channel: 'ssh-file:delete',
    },
    requestValidator: 'validateSshFileDeleteInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.delete_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file delete route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        operation: 'delete',
        remotePathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        fileContentsLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh-files/delete',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:ssh-file:move',
    transport: 'ipc',
    route: {
      channel: 'ssh-file:move',
    },
    requestValidator: 'validateSshFileMoveInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'host:file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.move_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file move route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        operation: 'move',
        sourcePathLogged: false,
        targetPathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        fileContentsLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/ssh-files/move',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:terminal:start',
    transport: 'ipc',
    route: {
      channel: 'terminal:start',
    },
    requestValidator: 'validateTerminalStartInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'terminal:start',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_started',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Terminal session start route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
        remoteCommandExecution: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/terminal/start',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:terminal:write',
    transport: 'ipc',
    route: {
      channel: 'terminal:write',
    },
    requestValidator: 'validateTerminalWriteInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'terminal:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_input_written',
      entityType: 'terminal_session',
      entityIdSource: 'context-entity-id',
      message: 'Terminal input route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/terminal/write',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:terminal:resize',
    transport: 'ipc',
    route: {
      channel: 'terminal:resize',
    },
    requestValidator: 'validateTerminalResizeInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'terminal:resize',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_resized',
      entityType: 'terminal_session',
      entityIdSource: 'context-entity-id',
      message: 'Terminal resize route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/terminal/resize',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:terminal:stop',
    transport: 'ipc',
    route: {
      channel: 'terminal:stop',
    },
    requestValidator: 'validateTerminalStopInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'terminal:stop',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_stopped',
      entityType: 'terminal_session',
      entityIdSource: 'context-entity-id',
      message: 'Terminal stop route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/terminal/stop',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:agent-endpoint:list',
    transport: 'ipc',
    route: {
      channel: 'agent-endpoint:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent-endpoint:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'agent_endpoint.listed',
      entityType: 'agent_endpoint',
      entityIdSource: 'none',
      message: 'Agent endpoints listed.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: false,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/agent-endpoints',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:agent-endpoint:get',
    transport: 'ipc',
    route: {
      channel: 'agent-endpoint:get',
    },
    requestValidator: 'validateAgentEndpointIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent-endpoint:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'agent_endpoint.read',
      entityType: 'agent_endpoint',
      entityIdSource: 'context-entity-id',
      message: 'Agent endpoint read.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: false,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/agent-endpoints/:id',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:agent-endpoint:create',
    transport: 'ipc',
    route: {
      channel: 'agent-endpoint:create',
    },
    requestValidator: 'validateAgentEndpointCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent-endpoint:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent_endpoint.created',
      entityType: 'agent_endpoint',
      entityIdSource: 'result-id',
      message: 'Agent endpoint created.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/agent-endpoints',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:agent-endpoint:update',
    transport: 'ipc',
    route: {
      channel: 'agent-endpoint:update',
    },
    requestValidator: 'validateAgentEndpointUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent-endpoint:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent_endpoint.updated',
      entityType: 'agent_endpoint',
      entityIdSource: 'context-entity-id',
      message: 'Agent endpoint updated.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/agent-endpoints/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:agent-endpoint:delete',
    transport: 'ipc',
    route: {
      channel: 'agent-endpoint:delete',
    },
    requestValidator: 'validateAgentEndpointIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent-endpoint:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent_endpoint.deleted',
      entityType: 'agent_endpoint',
      entityIdSource: 'context-entity-id',
      message: 'Agent endpoint deleted.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/agent-endpoints/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:agent:propose',
    transport: 'ipc',
    route: {
      channel: 'agent:propose',
    },
    requestValidator: 'validateOperatorProposeInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent:propose',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent.proposals.route_completed',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Operator proposal route completed.',
      metadata: {
        actionClass: 'agent-operator-route',
        mutatingOperation: true,
        proposalOnly: true,
        structuredActionExecution: false,
        operatorRequestLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/agent/propose',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:agent:execute-action',
    transport: 'ipc',
    route: {
      channel: 'agent:execute-action',
    },
    requestValidator: 'validateOperatorActionExecuteInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'agent:execute-action',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent.action.route_completed',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Operator approved action route completed.',
      metadata: {
        actionClass: 'agent-operator-route',
        mutatingOperation: true,
        proposalOnly: false,
        structuredActionExecution: true,
        requiresApproval: true,
        operatorRequestLogged: false,
        proposedCommandsLogged: false,
        commandLogged: false,
        terminalInputLogged: false,
        commandOutputLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/agent/execute-action',
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
    id: 'ipc:workspace-artifact-content:get',
    transport: 'ipc',
    route: {
      channel: 'workspace-artifact-content:get',
    },
    requestValidator: 'validateWorkspaceArtifactContentGetInput',
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
      required: true,
      eventType: 'workspace_artifact_content.read',
      entityType: 'workspace_artifact',
      entityIdSource: 'context-entity-id',
      message: 'Workspace applet/scriptlet artifact content read.',
      metadata: {
        actionClass: 'workspace-artifact-content-route',
        mutatingOperation: false,
        artifactContentLogged: false,
        manifestLogged: false,
        sourceCodeLogged: false,
        fileContentsLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/workspace-artifacts/content',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:workspace-artifact-content:update',
    transport: 'ipc',
    route: {
      channel: 'workspace-artifact-content:update',
    },
    requestValidator: 'validateWorkspaceArtifactContentUpdateInput',
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
      eventType: 'workspace_artifact_content.updated',
      entityType: 'workspace_artifact',
      entityIdSource: 'context-entity-id',
      message: 'Workspace applet/scriptlet artifact content updated.',
      metadata: {
        actionClass: 'workspace-artifact-content-route',
        mutatingOperation: true,
        artifactContentLogged: false,
        manifestLogged: false,
        sourceCodeLogged: false,
        fileContentsLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PUT:/api/workspace-artifacts/content',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:workspace-scriptlet:run',
    transport: 'ipc',
    route: {
      channel: 'workspace-scriptlet:run',
    },
    requestValidator: 'validateWorkspaceScriptletRunInput',
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
      required: true,
      eventType: 'workspace_scriptlet.run_completed',
      entityType: 'workspace_artifact',
      entityIdSource: 'context-entity-id',
      message: 'Workspace scriptlet artifact run completed.',
      metadata: {
        actionClass: 'workspace-scriptlet-route',
        mutatingOperation: true,
        remoteCommandExecution: true,
        artifactContentLogged: false,
        manifestLogged: false,
        sourceCodeLogged: false,
        scriptLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        fileContentsLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/workspace-scriptlets/run',
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
    id: 'ipc:bootstrap-preset:list',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-preset:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:preset:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_preset.listed',
      entityType: 'bootstrap_preset',
      entityIdSource: 'none',
      message: 'Bootstrap presets listed.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: false,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/bootstrap/persisted-presets',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:bootstrap-preset:get',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-preset:get',
    },
    requestValidator: 'validateBootstrapPresetIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:preset:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_preset.read',
      entityType: 'bootstrap_preset',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap preset read.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: false,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/bootstrap/persisted-presets/:id',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:bootstrap-preset:create',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-preset:create',
    },
    requestValidator: 'validateBootstrapPresetCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:preset:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_preset.created',
      entityType: 'bootstrap_preset',
      entityIdSource: 'result-id',
      message: 'Bootstrap preset created.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: true,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/bootstrap/persisted-presets',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:bootstrap-preset:update',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-preset:update',
    },
    requestValidator: 'validateBootstrapPresetUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:preset:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_preset.updated',
      entityType: 'bootstrap_preset',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap preset updated.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: true,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/bootstrap/persisted-presets/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:bootstrap-preset:delete',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-preset:delete',
    },
    requestValidator: 'validateBootstrapPresetIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:preset:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_preset.deleted',
      entityType: 'bootstrap_preset',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap preset deleted.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/bootstrap/persisted-presets/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:bootstrap-run:list',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-run:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:run:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_run.listed',
      entityType: 'bootstrap_run',
      entityIdSource: 'none',
      message: 'Bootstrap runs listed.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: false,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/bootstrap/runs',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:bootstrap-run:get',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-run:get',
    },
    requestValidator: 'validateBootstrapRunIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:run:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_run.read',
      entityType: 'bootstrap_run',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap run read.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: false,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/bootstrap/runs/:id',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:bootstrap-run:create',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-run:create',
    },
    requestValidator: 'validateBootstrapRunCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:run:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_run.created',
      entityType: 'bootstrap_run',
      entityIdSource: 'result-id',
      message: 'Bootstrap run created.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: true,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/bootstrap/runs',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:bootstrap-run:update',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-run:update',
    },
    requestValidator: 'validateBootstrapRunUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:run:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_run.updated',
      entityType: 'bootstrap_run',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap run updated.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: true,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/bootstrap/runs/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:bootstrap-run:delete',
    transport: 'ipc',
    route: {
      channel: 'bootstrap-run:delete',
    },
    requestValidator: 'validateBootstrapRunIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:run:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_run.deleted',
      entityType: 'bootstrap_run',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap run deleted.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/bootstrap/runs/:id',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/bootstrap/persisted-presets',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/bootstrap/persisted-presets',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:preset:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_preset.listed',
      entityType: 'bootstrap_preset',
      entityIdSource: 'none',
      message: 'Bootstrap presets listed.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: false,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-preset:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:GET:/api/bootstrap/persisted-presets/:id',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/bootstrap/persisted-presets/:id',
    },
    requestValidator: 'validateBootstrapPresetIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:preset:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_preset.read',
      entityType: 'bootstrap_preset',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap preset read.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: false,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-preset:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/bootstrap/persisted-presets',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/bootstrap/persisted-presets',
    },
    requestValidator: 'validateBootstrapPresetCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:preset:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_preset.created',
      entityType: 'bootstrap_preset',
      entityIdSource: 'result-id',
      message: 'Bootstrap preset created.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: true,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-preset:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:PATCH:/api/bootstrap/persisted-presets/:id',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/bootstrap/persisted-presets/:id',
    },
    requestValidator: 'validateBootstrapPresetUpdateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:preset:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_preset.updated',
      entityType: 'bootstrap_preset',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap preset updated.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: true,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-preset:update',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/bootstrap/persisted-presets/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/bootstrap/persisted-presets/:id',
    },
    requestValidator: 'validateBootstrapPresetIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:preset:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_preset.deleted',
      entityType: 'bootstrap_preset',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap preset deleted.',
      metadata: {
        actionClass: 'bootstrap-preset-route',
        mutatingOperation: true,
        scriptTemplateLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-preset:delete',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/bootstrap/runs',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/bootstrap/runs',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:run:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_run.listed',
      entityType: 'bootstrap_run',
      entityIdSource: 'none',
      message: 'Bootstrap runs listed.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: false,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-run:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:GET:/api/bootstrap/runs/:id',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/bootstrap/runs/:id',
    },
    requestValidator: 'validateBootstrapRunIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:run:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap_run.read',
      entityType: 'bootstrap_run',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap run read.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: false,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-run:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/bootstrap/runs',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/bootstrap/runs',
    },
    requestValidator: 'validateBootstrapRunCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:run:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_run.created',
      entityType: 'bootstrap_run',
      entityIdSource: 'result-id',
      message: 'Bootstrap run created.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: true,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-run:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:PATCH:/api/bootstrap/runs/:id',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/bootstrap/runs/:id',
    },
    requestValidator: 'validateBootstrapRunUpdateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:run:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_run.updated',
      entityType: 'bootstrap_run',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap run updated.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: true,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-run:update',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/bootstrap/runs/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/bootstrap/runs/:id',
    },
    requestValidator: 'validateBootstrapRunIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:run:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap_run.deleted',
      entityType: 'bootstrap_run',
      entityIdSource: 'context-entity-id',
      message: 'Bootstrap run deleted.',
      metadata: {
        actionClass: 'bootstrap-run-route',
        mutatingOperation: true,
        scriptOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap-run:delete',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:bootstrap:presets',
    transport: 'ipc',
    route: {
      channel: 'bootstrap:presets',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:preset:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap.presets_listed',
      entityType: 'bootstrap',
      entityIdSource: 'none',
      message: 'Built-in bootstrap presets listed.',
      metadata: {
        actionClass: 'bootstrap-generator-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/bootstrap/presets',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:bootstrap:generate',
    transport: 'ipc',
    route: {
      channel: 'bootstrap:generate',
    },
    requestValidator: 'validateBootstrapGenerateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'bootstrap:generate',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap.generated',
      entityType: 'bootstrap',
      entityIdSource: 'input-host-id',
      message: 'Bootstrap script generated.',
      metadata: {
        actionClass: 'bootstrap-generator-route',
        mutatingOperation: true,
        executesRemotely: false,
        generatedScriptLogged: false,
        hostSecretMaterialLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/bootstrap/generate',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/bootstrap/presets',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/bootstrap/presets',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:preset:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'bootstrap.presets_listed',
      entityType: 'bootstrap',
      entityIdSource: 'none',
      message: 'Built-in bootstrap presets listed.',
      metadata: {
        actionClass: 'bootstrap-generator-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap:presets',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/bootstrap/generate',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/bootstrap/generate',
    },
    requestValidator: 'validateBootstrapGenerateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'bootstrap:generate',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'bootstrap.generated',
      entityType: 'bootstrap',
      entityIdSource: 'input-host-id',
      message: 'Bootstrap script generated.',
      metadata: {
        actionClass: 'bootstrap-generator-route',
        mutatingOperation: true,
        executesRemotely: false,
        generatedScriptLogged: false,
        hostSecretMaterialLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:bootstrap:generate',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:command-history:list',
    transport: 'ipc',
    route: {
      channel: 'command-history:list',
    },
    requestValidator: 'validateCommandHistoryListLimitInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'command-history:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'command_history.listed',
      entityType: 'command_history',
      entityIdSource: 'none',
      message: 'Command history listed.',
      metadata: {
        actionClass: 'command-history-route',
        mutatingOperation: false,
        commandLogged: false,
        commandOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/command-history',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:command-history:create',
    transport: 'ipc',
    route: {
      channel: 'command-history:create',
    },
    requestValidator: 'validateCommandHistoryCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'command-history:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'command_history.created',
      entityType: 'command_history',
      entityIdSource: 'result-id',
      message: 'Command history entry created.',
      metadata: {
        actionClass: 'command-history-route',
        mutatingOperation: true,
        commandLogged: false,
        commandOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/command-history',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:command-history:delete',
    transport: 'ipc',
    route: {
      channel: 'command-history:delete',
    },
    requestValidator: 'validateCommandHistoryEntryIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'command-history:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'command_history.deleted',
      entityType: 'command_history',
      entityIdSource: 'context-entity-id',
      message: 'Command history entry deleted.',
      metadata: {
        actionClass: 'command-history-route',
        mutatingOperation: true,
        commandLogged: false,
        commandOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/command-history/:id',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/command-history',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/command-history',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'command-history:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'command_history.listed',
      entityType: 'command_history',
      entityIdSource: 'none',
      message: 'Command history listed.',
      metadata: {
        actionClass: 'command-history-route',
        mutatingOperation: false,
        commandLogged: false,
        commandOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:command-history:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/command-history',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/command-history',
    },
    requestValidator: 'validateCommandHistoryCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'command-history:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'command_history.created',
      entityType: 'command_history',
      entityIdSource: 'result-id',
      message: 'Command history entry created.',
      metadata: {
        actionClass: 'command-history-route',
        mutatingOperation: true,
        commandLogged: false,
        commandOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:command-history:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/command-history/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/command-history/:id',
    },
    requestValidator: 'validateCommandHistoryEntryIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'command-history:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'command_history.deleted',
      entityType: 'command_history',
      entityIdSource: 'context-entity-id',
      message: 'Command history entry deleted.',
      metadata: {
        actionClass: 'command-history-route',
        mutatingOperation: true,
        commandLogged: false,
        commandOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:command-history:delete',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:settings:get',
    transport: 'ipc',
    route: {
      channel: 'settings:get',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'settings:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'settings.read',
      entityType: 'settings',
      entityIdSource: 'none',
      message: 'Settings read.',
      metadata: {
        actionClass: 'settings-route',
        mutatingOperation: false,
        settingsValuesLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/settings',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:settings:update',
    transport: 'ipc',
    route: {
      channel: 'settings:update',
    },
    requestValidator: 'validateSettingsUpdate',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'settings:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'settings.updated',
      entityType: 'settings',
      entityIdSource: 'none',
      message: 'Settings updated.',
      metadata: {
        actionClass: 'settings-route',
        mutatingOperation: true,
        settingsValuesLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/settings',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/settings',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/settings',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'settings:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'settings.read',
      entityType: 'settings',
      entityIdSource: 'none',
      message: 'Settings read.',
      metadata: {
        actionClass: 'settings-route',
        mutatingOperation: false,
        settingsValuesLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:settings:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PATCH:/api/settings',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/settings',
    },
    requestValidator: 'validateSettingsUpdate',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'settings:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'settings.updated',
      entityType: 'settings',
      entityIdSource: 'none',
      message: 'Settings updated.',
      metadata: {
        actionClass: 'settings-route',
        mutatingOperation: true,
        settingsValuesLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:settings:update',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-manifest:list',
    transport: 'ipc',
    route: {
      channel: 'app-manifest:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-manifest:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'app_manifest.listed',
      entityType: 'app_manifest',
      entityIdSource: 'none',
      message: 'App manifests listed.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/app-manifests',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-manifest:get',
    transport: 'ipc',
    route: {
      channel: 'app-manifest:get',
    },
    requestValidator: 'validateAppManifestIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-manifest:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'app_manifest.read',
      entityType: 'app_manifest',
      entityIdSource: 'context-entity-id',
      message: 'App manifest read.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/app-manifests/:id',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-manifest:create',
    transport: 'ipc',
    route: {
      channel: 'app-manifest:create',
    },
    requestValidator: 'validateAppManifestCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-manifest:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_manifest.created',
      entityType: 'app_manifest',
      entityIdSource: 'result-id',
      message: 'App manifest created.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: true,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-manifests',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-manifest:update',
    transport: 'ipc',
    route: {
      channel: 'app-manifest:update',
    },
    requestValidator: 'validateAppManifestUpdateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-manifest:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_manifest.updated',
      entityType: 'app_manifest',
      entityIdSource: 'context-entity-id',
      message: 'App manifest updated.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: true,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PATCH:/api/app-manifests/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-manifest:delete',
    transport: 'ipc',
    route: {
      channel: 'app-manifest:delete',
    },
    requestValidator: 'validateAppManifestIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-manifest:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_manifest.deleted',
      entityType: 'app_manifest',
      entityIdSource: 'context-entity-id',
      message: 'App manifest deleted.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/app-manifests/:id',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-permission:list',
    transport: 'ipc',
    route: {
      channel: 'app-permission:list',
    },
    requestValidator: 'validateAppPermissionListInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-permission:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'app_permission.listed',
      entityType: 'app_permission',
      entityIdSource: 'none',
      message: 'App permissions listed.',
      metadata: {
        actionClass: 'app-permission-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/app-permissions',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-permission:create',
    transport: 'ipc',
    route: {
      channel: 'app-permission:create',
    },
    requestValidator: 'validateAppPermissionCreateInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-permission:grant',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_permission.granted',
      entityType: 'app_permission',
      entityIdSource: 'result-id',
      message: 'App permission created.',
      metadata: {
        actionClass: 'app-permission-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-permissions',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-permission:delete',
    transport: 'ipc',
    route: {
      channel: 'app-permission:delete',
    },
    requestValidator: 'validateAppPermissionIdInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'app-permission:revoke',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_permission.revoked',
      entityType: 'app_permission',
      entityIdSource: 'context-entity-id',
      message: 'App permission deleted.',
      metadata: {
        actionClass: 'app-permission-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/app-permissions/:id',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/app-manifests',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/app-manifests',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-manifest:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'app_manifest.listed',
      entityType: 'app_manifest',
      entityIdSource: 'none',
      message: 'App manifests listed.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-manifest:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/app-manifests',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-manifests',
    },
    requestValidator: 'validateAppManifestCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-manifest:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_manifest.created',
      entityType: 'app_manifest',
      entityIdSource: 'result-id',
      message: 'App manifest created.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: true,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-manifest:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/app-manifests/:id',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/app-manifests/:id',
    },
    requestValidator: 'validateAppManifestIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-manifest:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'app_manifest.read',
      entityType: 'app_manifest',
      entityIdSource: 'context-entity-id',
      message: 'App manifest read.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-manifest:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PATCH:/api/app-manifests/:id',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/app-manifests/:id',
    },
    requestValidator: 'validateAppManifestUpdateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-manifest:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_manifest.updated',
      entityType: 'app_manifest',
      entityIdSource: 'context-entity-id',
      message: 'App manifest updated.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: true,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-manifest:update',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/app-manifests/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/app-manifests/:id',
    },
    requestValidator: 'validateAppManifestIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-manifest:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_manifest.deleted',
      entityType: 'app_manifest',
      entityIdSource: 'context-entity-id',
      message: 'App manifest deleted.',
      metadata: {
        actionClass: 'app-manifest-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-manifest:delete',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/app-permissions',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/app-permissions',
    },
    requestValidator: 'validateAppPermissionListInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-permission:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'app_permission.listed',
      entityType: 'app_permission',
      entityIdSource: 'none',
      message: 'App permissions listed.',
      metadata: {
        actionClass: 'app-permission-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-permission:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/app-permissions',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-permissions',
    },
    requestValidator: 'validateAppPermissionCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-permission:grant',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_permission.granted',
      entityType: 'app_permission',
      entityIdSource: 'result-id',
      message: 'App permission created.',
      metadata: {
        actionClass: 'app-permission-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-permission:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/app-permissions/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/app-permissions/:id',
    },
    requestValidator: 'validateAppPermissionIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'app-permission:revoke',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_permission.revoked',
      entityType: 'app_permission',
      entityIdSource: 'context-entity-id',
      message: 'App permission deleted.',
      metadata: {
        actionClass: 'app-permission-route',
        mutatingOperation: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-permission:delete',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-storage:get',
    transport: 'ipc',
    route: {
      channel: 'app-storage:get',
    },
    requestValidator: 'validateAppScopedStorageGetInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'storage:scoped',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_storage.read',
      entityType: 'app_scoped_storage',
      entityIdSource: 'context-entity-id',
      message: 'App scoped storage read.',
      metadata: {
        actionClass: 'app-storage-route',
        mutatingOperation: false,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/app-storage/:appId/:key',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-storage:set',
    transport: 'ipc',
    route: {
      channel: 'app-storage:set',
    },
    requestValidator: 'validateAppScopedStorageSetInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'storage:scoped',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_storage.updated',
      entityType: 'app_scoped_storage',
      entityIdSource: 'context-entity-id',
      message: 'App scoped storage updated.',
      metadata: {
        actionClass: 'app-storage-route',
        mutatingOperation: true,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:PUT:/api/app-storage/:appId/:key',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-storage:delete',
    transport: 'ipc',
    route: {
      channel: 'app-storage:delete',
    },
    requestValidator: 'validateAppScopedStorageDeleteInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'storage:scoped',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_storage.deleted',
      entityType: 'app_scoped_storage',
      entityIdSource: 'context-entity-id',
      message: 'App scoped storage deleted.',
      metadata: {
        actionClass: 'app-storage-route',
        mutatingOperation: true,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:DELETE:/api/app-storage/:appId/:key',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/app-storage/:appId/:key',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/app-storage/:appId/:key',
    },
    requestValidator: 'validateAppScopedStorageGetInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'storage:scoped',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_storage.read',
      entityType: 'app_scoped_storage',
      entityIdSource: 'context-entity-id',
      message: 'App scoped storage read.',
      metadata: {
        actionClass: 'app-storage-route',
        mutatingOperation: false,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-storage:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PUT:/api/app-storage/:appId/:key',
    transport: 'hosted',
    route: {
      method: 'PUT',
      path: '/api/app-storage/:appId/:key',
    },
    requestValidator: 'validateAppScopedStorageSetInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'storage:scoped',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_storage.updated',
      entityType: 'app_scoped_storage',
      entityIdSource: 'context-entity-id',
      message: 'App scoped storage updated.',
      metadata: {
        actionClass: 'app-storage-route',
        mutatingOperation: true,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-storage:set',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/app-storage/:appId/:key',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/app-storage/:appId/:key',
    },
    requestValidator: 'validateAppScopedStorageDeleteInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'storage:scoped',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_storage.deleted',
      entityType: 'app_scoped_storage',
      entityIdSource: 'context-entity-id',
      message: 'App scoped storage deleted.',
      metadata: {
        actionClass: 'app-storage-route',
        mutatingOperation: true,
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-storage:delete',
    },
    mutatesState: true,
  },
  {
    id: 'ipc:app-host:list',
    transport: 'ipc',
    route: {
      channel: 'app-host:list',
    },
    requestValidator: 'validateGeneratedAppHostListInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.listed',
      entityType: 'app',
      entityIdSource: 'context-entity-id',
      message: 'Generated app host SDK list completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-host/list',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-host:get',
    transport: 'ipc',
    route: {
      channel: 'app-host:get',
    },
    requestValidator: 'validateGeneratedAppHostGetInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.read',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK read completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-host/get',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-host:get-status',
    transport: 'ipc',
    route: {
      channel: 'app-host:get-status',
    },
    requestValidator: 'validateGeneratedAppHostStatusInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.status_read',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK status read completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-host/status',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-host:get-capabilities',
    transport: 'ipc',
    route: {
      channel: 'app-host:get-capabilities',
    },
    requestValidator: 'validateGeneratedAppHostCapabilitiesInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.capabilities_read',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK capabilities read completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-host/capabilities',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:app-host:test-connection',
    transport: 'ipc',
    route: {
      channel: 'app-host:test-connection',
    },
    requestValidator: 'validateGeneratedAppHostTestConnectionInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: true,
    },
    capability: 'host:actions',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.connection_tested',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK connection test completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: true,
        remoteConnectionProbe: true,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/app-host/test-connection',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/app-host/list',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-host/list',
    },
    requestValidator: 'validateGeneratedAppHostListInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.listed',
      entityType: 'app',
      entityIdSource: 'context-entity-id',
      message: 'Generated app host SDK list completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-host:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/app-host/get',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-host/get',
    },
    requestValidator: 'validateGeneratedAppHostGetInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.read',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK read completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-host:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/app-host/status',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-host/status',
    },
    requestValidator: 'validateGeneratedAppHostStatusInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.status_read',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK status read completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-host:get-status',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/app-host/capabilities',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-host/capabilities',
    },
    requestValidator: 'validateGeneratedAppHostCapabilitiesInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.capabilities_read',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK capabilities read completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: false,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-host:get-capabilities',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/app-host/test-connection',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/app-host/test-connection',
    },
    requestValidator: 'validateGeneratedAppHostTestConnectionInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:actions',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'app_host_sdk.connection_tested',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Generated app host SDK connection test completed.',
      metadata: {
        actionClass: 'app-host-sdk-route',
        mutatingOperation: true,
        remoteConnectionProbe: true,
        hostCredentialsLogged: false,
        hostNotesLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:app-host:test-connection',
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
    id: 'ipc:audit:list',
    transport: 'ipc',
    route: {
      channel: 'audit:list',
    },
    requestValidator: 'validateNoInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'audit:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'audit.listed',
      entityType: 'audit_event',
      entityIdSource: 'none',
      message: 'Audit events listed.',
      metadata: {
        actionClass: 'audit-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:GET:/api/audit',
    },
    mutatesState: false,
  },
  {
    id: 'ipc:audit:log',
    transport: 'ipc',
    route: {
      channel: 'audit:log',
    },
    requestValidator: 'validateAuditEventInput',
    identity: {
      caller: 'ipc',
      sessionRequired: false,
      appIdentityRequired: false,
    },
    capability: 'audit:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'audit.client_logged',
      entityType: 'audit_event',
      entityIdSource: 'result-id',
      message: 'Client-originated audit event written.',
      metadata: {
        actionClass: 'audit-route',
        mutatingOperation: true,
        clientOriginated: true,
        backendVerified: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'hosted:POST:/api/audit',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/audit',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/audit',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'audit:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'audit.listed',
      entityType: 'audit_event',
      entityIdSource: 'none',
      message: 'Audit events listed.',
      metadata: {
        actionClass: 'audit-route',
        mutatingOperation: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:audit:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/audit',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/audit',
    },
    requestValidator: 'validateAuditEventInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'audit:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'audit.client_logged',
      entityType: 'audit_event',
      entityIdSource: 'result-id',
      message: 'Client-originated audit event written.',
      metadata: {
        actionClass: 'audit-route',
        mutatingOperation: true,
        clientOriginated: true,
        backendVerified: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:audit:log',
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
    id: 'hosted:POST:/api/ssh/exec',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh/exec',
    },
    requestValidator: 'validateSshExecInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'ssh:exec',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh.exec_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH exec route completed.',
      metadata: {
        actionClass: 'ssh-route',
        mutatingOperation: true,
        remoteCommandExecution: true,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh:exec',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/ssh-files/list',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh-files/list',
    },
    requestValidator: 'validateSshFileListInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.list_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file list route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: false,
        fileContentsLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh-file:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/ssh-files/stat',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh-files/stat',
    },
    requestValidator: 'validateSshFileStatInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.stat_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file stat route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: false,
        fileContentsLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh-file:stat',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/ssh-files/download',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh-files/download',
    },
    requestValidator: 'validateSshFileTransferInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:file:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.download_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file download route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        transferDirection: 'download',
        fileContentsLogged: false,
        localPathLogged: false,
        remotePathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh-file:download',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/ssh-files/upload',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh-files/upload',
    },
    requestValidator: 'validateSshFileTransferInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.upload_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file upload route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        transferDirection: 'upload',
        fileContentsLogged: false,
        localPathLogged: false,
        remotePathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh-file:upload',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/ssh-files/delete',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh-files/delete',
    },
    requestValidator: 'validateSshFileDeleteInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.delete_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file delete route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        operation: 'delete',
        remotePathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        fileContentsLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh-file:delete',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/ssh-files/move',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/ssh-files/move',
    },
    requestValidator: 'validateSshFileMoveInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'host:file:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'ssh_file.move_route_completed',
      entityType: 'host',
      entityIdSource: 'input-host-id',
      message: 'SSH file move route completed.',
      metadata: {
        actionClass: 'ssh-file-route',
        mutatingOperation: true,
        operation: 'move',
        sourcePathLogged: false,
        targetPathLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        fileContentsLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:ssh-file:move',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/terminal/start',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/terminal/start',
    },
    requestValidator: 'validateTerminalStartInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'terminal:start',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_started',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Terminal session start route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
        remoteCommandExecution: true,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:terminal:start',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/terminal/write',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/terminal/write',
    },
    requestValidator: 'validateTerminalWriteInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'terminal:write',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_input_written',
      entityType: 'terminal_session',
      entityIdSource: 'context-entity-id',
      message: 'Terminal input route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:terminal:write',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/terminal/resize',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/terminal/resize',
    },
    requestValidator: 'validateTerminalResizeInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'terminal:resize',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_resized',
      entityType: 'terminal_session',
      entityIdSource: 'context-entity-id',
      message: 'Terminal resize route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:terminal:resize',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/terminal/stop',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/terminal/stop',
    },
    requestValidator: 'validateTerminalStopInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'terminal:stop',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.route_stopped',
      entityType: 'terminal_session',
      entityIdSource: 'context-entity-id',
      message: 'Terminal stop route completed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: true,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:terminal:stop',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/terminal/events',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/terminal/events',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'terminal:start',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'terminal.events_subscribed',
      entityType: 'terminal_event_stream',
      entityIdSource: 'none',
      message: 'Terminal event stream subscribed.',
      metadata: {
        actionClass: 'terminal-route',
        mutatingOperation: false,
        terminalInputLogged: false,
        terminalOutputLogged: false,
      },
    },
    parity: {
      kind: 'exception',
      reason: 'Hosted uses Server-Sent Events for terminal stream subscription; desktop renderer uses preload event channels instead of an IPC invoke route.',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:GET:/api/agent-endpoints',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/agent-endpoints',
    },
    requestValidator: 'validateHostedNoRequestBody',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent-endpoint:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'agent_endpoint.listed',
      entityType: 'agent_endpoint',
      entityIdSource: 'none',
      message: 'Agent endpoints listed.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: false,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent-endpoint:list',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:POST:/api/agent-endpoints',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/agent-endpoints',
    },
    requestValidator: 'validateAgentEndpointCreateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent-endpoint:create',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent_endpoint.created',
      entityType: 'agent_endpoint',
      entityIdSource: 'result-id',
      message: 'Agent endpoint created.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent-endpoint:create',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:GET:/api/agent-endpoints/:id',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/agent-endpoints/:id',
    },
    requestValidator: 'validateAgentEndpointIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent-endpoint:read',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: false,
      eventType: 'agent_endpoint.read',
      entityType: 'agent_endpoint',
      entityIdSource: 'context-entity-id',
      message: 'Agent endpoint read.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: false,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent-endpoint:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PATCH:/api/agent-endpoints/:id',
    transport: 'hosted',
    route: {
      method: 'PATCH',
      path: '/api/agent-endpoints/:id',
    },
    requestValidator: 'validateAgentEndpointUpdateInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent-endpoint:update',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent_endpoint.updated',
      entityType: 'agent_endpoint',
      entityIdSource: 'context-entity-id',
      message: 'Agent endpoint updated.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent-endpoint:update',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:DELETE:/api/agent-endpoints/:id',
    transport: 'hosted',
    route: {
      method: 'DELETE',
      path: '/api/agent-endpoints/:id',
    },
    requestValidator: 'validateAgentEndpointIdInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent-endpoint:delete',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent_endpoint.deleted',
      entityType: 'agent_endpoint',
      entityIdSource: 'context-entity-id',
      message: 'Agent endpoint deleted.',
      metadata: {
        actionClass: 'agent-endpoint-route',
        mutatingOperation: true,
        storesSecretMaterial: false,
        apiKeyLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent-endpoint:delete',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/agent/propose',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/agent/propose',
    },
    requestValidator: 'validateOperatorProposeInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent:propose',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent.proposals.route_completed',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Operator proposal route completed.',
      metadata: {
        actionClass: 'agent-operator-route',
        mutatingOperation: true,
        proposalOnly: true,
        structuredActionExecution: false,
        operatorRequestLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent:propose',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/agent/execute-action',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/agent/execute-action',
    },
    requestValidator: 'validateOperatorActionExecuteInput',
    identity: {
      caller: 'hosted',
      sessionRequired: true,
      appIdentityRequired: true,
    },
    capability: 'agent:execute-action',
    policyDecisionRequired: true,
    denialAudit: {
      source: 'policy.denied',
      eventType: 'policy.denied',
    },
    successAudit: {
      required: true,
      eventType: 'agent.action.route_completed',
      entityType: 'host',
      entityIdSource: 'context-host-id',
      message: 'Operator approved action route completed.',
      metadata: {
        actionClass: 'agent-operator-route',
        mutatingOperation: true,
        proposalOnly: false,
        structuredActionExecution: true,
        requiresApproval: true,
        operatorRequestLogged: false,
        proposedCommandsLogged: false,
        commandLogged: false,
        terminalInputLogged: false,
        commandOutputLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:agent:execute-action',
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
    id: 'hosted:GET:/api/workspace-artifacts/content',
    transport: 'hosted',
    route: {
      method: 'GET',
      path: '/api/workspace-artifacts/content',
    },
    requestValidator: 'validateWorkspaceArtifactContentGetInput',
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
      required: true,
      eventType: 'workspace_artifact_content.read',
      entityType: 'workspace_artifact',
      entityIdSource: 'context-entity-id',
      message: 'Workspace applet/scriptlet artifact content read.',
      metadata: {
        actionClass: 'workspace-artifact-content-route',
        mutatingOperation: false,
        artifactContentLogged: false,
        manifestLogged: false,
        sourceCodeLogged: false,
        fileContentsLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-artifact-content:get',
    },
    mutatesState: false,
  },
  {
    id: 'hosted:PUT:/api/workspace-artifacts/content',
    transport: 'hosted',
    route: {
      method: 'PUT',
      path: '/api/workspace-artifacts/content',
    },
    requestValidator: 'validateWorkspaceArtifactContentUpdateInput',
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
      eventType: 'workspace_artifact_content.updated',
      entityType: 'workspace_artifact',
      entityIdSource: 'context-entity-id',
      message: 'Workspace applet/scriptlet artifact content updated.',
      metadata: {
        actionClass: 'workspace-artifact-content-route',
        mutatingOperation: true,
        artifactContentLogged: false,
        manifestLogged: false,
        sourceCodeLogged: false,
        fileContentsLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-artifact-content:update',
    },
    mutatesState: true,
  },
  {
    id: 'hosted:POST:/api/workspace-scriptlets/run',
    transport: 'hosted',
    route: {
      method: 'POST',
      path: '/api/workspace-scriptlets/run',
    },
    requestValidator: 'validateWorkspaceScriptletRunInput',
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
      required: true,
      eventType: 'workspace_scriptlet.run_completed',
      entityType: 'workspace_artifact',
      entityIdSource: 'context-entity-id',
      message: 'Workspace scriptlet artifact run completed.',
      metadata: {
        actionClass: 'workspace-scriptlet-route',
        mutatingOperation: true,
        remoteCommandExecution: true,
        artifactContentLogged: false,
        manifestLogged: false,
        sourceCodeLogged: false,
        scriptLogged: false,
        commandTextLogged: false,
        commandOutputLogged: false,
        fileContentsLogged: false,
        providerPayloadLogged: false,
        secretsLogged: false,
      },
    },
    parity: {
      kind: 'paired',
      peerRouteId: 'ipc:workspace-scriptlet:run',
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
      appId: params.context.appId ?? null,
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
