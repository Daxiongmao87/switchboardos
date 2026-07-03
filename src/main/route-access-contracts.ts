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
  entityIdSource: 'none' | 'context-host-id' | 'result-host-id' | 'input-host-id' | 'result-first-id';
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
      sessionId: params.context.sessionId ?? null,
    };
    decision = params.policyService.assertAllowed(params.contract.capability, policyContext);
  }

  const result = await Promise.resolve(params.execute());

  if (params.contract.successAudit.required) {
    const entityId = resolveAuditEntityId(
      params.contract.successAudit.entityIdSource,
      params.context,
      params.input,
      result,
    );

    const metadata: Record<string, unknown> = {
      ...params.contract.successAudit.metadata,
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
