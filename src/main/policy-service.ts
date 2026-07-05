import type { CreateAuditEventInput, MvpSettings } from '../shared/mvp-models';

export type PolicyCapability =
  | 'ssh:exec'
  | 'host-operation:run'
  | 'host:create'
  | 'host:update'
  | 'host:delete'
  | 'host:test-connection'
  | 'host:updateGroup'
  | 'host:setFavorite'
  | 'host:duplicate'
  | 'host:import'
  | 'host-group:read'
  | 'host-group:create'
  | 'host-group:update'
  | 'host-group:delete'
  | 'host-tag:read'
  | 'host-tag:create'
  | 'host-tag:update'
  | 'host-tag:delete'
  | 'workspace-file:read'
  | 'workspace-file:write'
  | 'workspace-profile:read'
  | 'workspace-profile:write'
  | 'credential-ref:read'
  | 'credential-ref:create'
  | 'credential-ref:update'
  | 'credential-ref:delete'
  | 'audit:read'
  | 'audit:write'
  | 'terminal:start'
  | 'terminal:write'
  | 'terminal:resize'
  | 'terminal:stop'
  | 'ssh:file:read'
  | 'ssh:file:write'
  | 'secret:store'
  | 'secret:delete'
  | 'secret:retrieve'
  | 'agent-endpoint:read'
  | 'agent-endpoint:create'
  | 'agent-endpoint:update'
  | 'agent-endpoint:delete'
  | 'agent:propose'
  | 'agent:execute-action'
  | 'app-manifest:read'
  | 'app-manifest:create'
  | 'app-manifest:update'
  | 'app-manifest:delete'
  | 'app-permission:read'
  | 'app-permission:grant'
  | 'app-permission:revoke'
  | 'bootstrap:preset:read'
  | 'bootstrap:preset:create'
  | 'bootstrap:preset:update'
  | 'bootstrap:preset:delete'
  | 'bootstrap:run:read'
  | 'bootstrap:run:create'
  | 'bootstrap:run:update'
  | 'bootstrap:run:delete'
  | 'bootstrap:generate'
  | 'command-history:read'
  | 'command-history:create'
  | 'command-history:delete'
  | 'settings:read'
  | 'settings:update';

export type PolicyMode = 'disabled' | 'safe' | 'balanced' | 'permissive' | 'full-trust';

export interface PolicyContext {
  caller: 'ipc' | 'hosted' | 'smoke' | string;
  route?: string;
  action?: string;
  hostId?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  sessionId?: string | null;
}

export interface PolicyDecision {
  allowed: boolean;
  capability: PolicyCapability;
  mode: PolicyMode;
  reason: string;
}

type SettingsResolver = () => MvpSettings;
type AuditLogger = (event: CreateAuditEventInput) => unknown;

const FULL_CAPABILITIES: readonly PolicyCapability[] = [
  'ssh:exec',
  'host-operation:run',
  'host:create',
  'host:update',
  'host:delete',
  'host:test-connection',
  'host:updateGroup',
  'host:setFavorite',
  'host:duplicate',
  'host:import',
  'host-group:read',
  'host-group:create',
  'host-group:update',
  'host-group:delete',
  'host-tag:read',
  'host-tag:create',
  'host-tag:update',
  'host-tag:delete',
  'workspace-file:read',
  'workspace-file:write',
  'workspace-profile:read',
  'workspace-profile:write',
  'credential-ref:read',
  'credential-ref:create',
  'credential-ref:update',
  'credential-ref:delete',
  'audit:read',
  'audit:write',
  'terminal:start',
  'terminal:write',
  'terminal:resize',
  'terminal:stop',
  'ssh:file:read',
  'ssh:file:write',
  'secret:store',
  'secret:delete',
  'secret:retrieve',
  'agent-endpoint:read',
  'agent-endpoint:create',
  'agent-endpoint:update',
  'agent-endpoint:delete',
  'agent:propose',
  'agent:execute-action',
  'app-manifest:read',
  'app-manifest:create',
  'app-manifest:update',
  'app-manifest:delete',
  'app-permission:read',
  'app-permission:grant',
  'app-permission:revoke',
  'bootstrap:preset:read',
  'bootstrap:preset:create',
  'bootstrap:preset:update',
  'bootstrap:preset:delete',
  'bootstrap:run:read',
  'bootstrap:run:create',
  'bootstrap:run:update',
  'bootstrap:run:delete',
  'bootstrap:generate',
  'command-history:read',
  'command-history:create',
  'command-history:delete',
  'settings:read',
  'settings:update',
];

const SAFE_CAPABILITIES: readonly PolicyCapability[] = [
  'agent-endpoint:read',
  'agent:propose',
  'app-manifest:read',
  'app-permission:read',
  'bootstrap:preset:read',
  'bootstrap:run:read',
  'command-history:read',
  'settings:read',
  'ssh:file:read',
  'workspace-file:read',
  'workspace-profile:read',
  'bootstrap:generate',
  'settings:update',
];

const DISABLED_CAPABILITIES: readonly PolicyCapability[] = [
  'settings:read',
  'settings:update',
];

export class PolicyDeniedError extends Error {
  readonly statusCode = 403;

  constructor(readonly decision: PolicyDecision) {
    super(`Policy denied ${decision.capability}: ${decision.reason}`);
    this.name = 'PolicyDeniedError';
  }
}

export class PolicyService {
  constructor(
    private readonly getSettings: SettingsResolver,
    private readonly logAuditEvent: AuditLogger,
  ) {}

  evaluate(capability: PolicyCapability): PolicyDecision {
    const mode = normalizePolicyMode(this.getSettings());
    const allowed = capabilitiesForMode(mode).includes(capability);
    return {
      allowed,
      capability,
      mode,
      reason: allowed
        ? `Policy mode ${mode} allows ${capability}.`
        : `Policy mode ${mode} blocks ${capability}.`,
    };
  }

  assertAllowed(capability: PolicyCapability, context: PolicyContext): PolicyDecision {
    const decision = this.evaluate(capability);
    if (!decision.allowed) {
      this.auditDenied(decision, context);
      throw new PolicyDeniedError(decision);
    }
    return decision;
  }

  private auditDenied(decision: PolicyDecision, context: PolicyContext): void {
    try {
      this.logAuditEvent({
        type: 'policy.denied',
        entityType: 'policy',
        entityId: context.hostId ?? context.entityId ?? null,
        message: `Policy denied privileged capability ${decision.capability}.`,
        metadata: {
          capability: decision.capability,
          mode: decision.mode,
          reason: decision.reason,
          caller: context.caller,
          route: context.route ?? null,
          action: context.action ?? null,
          hostId: context.hostId ?? null,
          entityId: context.entityId ?? null,
          entityType: context.entityType ?? null,
          sessionId: context.sessionId ?? null,
          secretsLogged: false,
        },
      });
    } catch (error) {
      console.error('Unable to write policy denial audit event.', error);
    }
  }
}

export function normalizePolicyMode(settings: MvpSettings): PolicyMode {
  const rawPolicy = String(settings.operator?.policy ?? 'manual-approval').toLowerCase();
  if (rawPolicy === 'disabled') {
    return 'disabled';
  }
  if (rawPolicy === 'safe' || rawPolicy === 'balanced' || rawPolicy === 'permissive' || rawPolicy === 'full-trust') {
    return rawPolicy;
  }
  return 'balanced';
}

function capabilitiesForMode(mode: PolicyMode): readonly PolicyCapability[] {
  if (mode === 'disabled') {
    return DISABLED_CAPABILITIES;
  }
  if (mode === 'safe') {
    return SAFE_CAPABILITIES;
  }
  return FULL_CAPABILITIES;
}
