import { Component, OnInit } from '@angular/core';
import type {
  AgentEndpoint,
  AuditEvent,
  HostRecord,
  MvpSettings,
  OperatorActionExecuteInput,
  OperatorActionExecuteResult,
  OperatorProposal,
  OperatorProposeResult,
} from '../../../shared/mvp-models';
import { getSwitchboardApi, type AppInfo } from '../switchboard-api';

type DiagnosticProposal = OperatorProposal;
type OperatorProposalApprovalStatus =
  | 'Awaiting approval'
  | 'Rejected'
  | 'Approved by user'
  | 'Dispatching approved action'
  | 'Dispatched'
  | 'Failed';

interface OperatorProposalReviewState {
  inspected: boolean;
  editing: boolean;
  draftCommand: string;
  savedCommand: string | null;
  rejected: boolean;
  rejectionReason: string;
}

interface OperatorProposalTrace {
  proposalId: string;
  targetHostId: string | null;
  routeId: string;
  requiredCapabilities: string[];
  actionKind: 'ssh-command';
  approvalRequired: true;
  approved: boolean;
  approvalStatus: OperatorProposalApprovalStatus;
  expectedEffect: string;
  disabledReasons: string[];
  result: OperatorActionExecuteResult | null;
  auditStatus: string;
  auditEventId: string;
  auditEventType: string;
  auditCreatedAt: string;
  auditMessage: string;
  auditSanitized: boolean | null;
  auditMetadata: Record<string, unknown> | null;
}

@Component({
  selector: 'app-agents',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Agents</h1>
          <p>Provider-backed Operator proposals with explicit approval before structured backend execution.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill" [class.is-disabled]="executionDisabled">{{ policyLabel }}</span>
          <button type="button" class="secondary-action" (click)="loadState()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p class="notice">
        The Operator builds a structured context, uses a configured provider when available, and falls back to local read-only diagnostics without exposing secrets.
      </p>
      <p *ngIf="statusMessage" class="notice success">{{ statusMessage }}</p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="summary-grid">
        <article class="panel">
          <h2>Operator state</h2>
          <dl>
            <div>
              <dt>Endpoint</dt>
              <dd>{{ endpointLabel }}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{{ endpointModelLabel }}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>{{ endpointContextLabel }}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{{ policyLabel }}</dd>
            </div>
            <div>
              <dt>Known hosts</dt>
              <dd>{{ hosts.length }}</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <h2>Agent-readable state</h2>
          <dl>
            <div>
              <dt>Selected host</dt>
              <dd>{{ selectedHost ? selectedHost.name : 'None selected' }}</dd>
            </div>
            <div>
              <dt>Last connection</dt>
              <dd>{{ selectedHost?.lastConnectionStatus || 'Unavailable' }}</dd>
            </div>
            <div>
              <dt>Recent audit events</dt>
              <dd>{{ auditEvents.length }}</dd>
            </div>
            <div>
              <dt>Host output trust</dt>
              <dd>Untrusted and isolated</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <h2>Dispatch state</h2>
          <dl>
            <div>
              <dt>Terminal session</dt>
              <dd>{{ terminalSessionId || 'Not started' }}</dd>
            </div>
            <div>
              <dt>Execution mode</dt>
              <dd>{{ executionDisabled ? 'Disabled by policy' : 'Manual approval only' }}</dd>
            </div>
            <div>
              <dt>Proposal source</dt>
              <dd>{{ operatorModeLabel }}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section class="workflow-grid">
        <article class="panel control-panel">
          <div class="panel-heading">
            <h2>Target host</h2>
            <span>{{ hosts.length }} available</span>
          </div>

          <div *ngIf="isLoading" class="empty-state">
            <strong>Loading local state</strong>
            <p>Reading hosts, Operator settings, and recent audit events.</p>
          </div>

          <div *ngIf="!isLoading && hosts.length === 0" class="empty-state">
            <strong>No hosts yet</strong>
            <p>Add a host before generating diagnostic proposals.</p>
          </div>

          <form *ngIf="hosts.length > 0" class="target-form" (ngSubmit)="generateProposals()" data-testid="operator-target-form">
            <label>
              Host profile
              <select name="hostId" [(ngModel)]="selectedHostId" data-testid="operator-target-host-select">
                <option *ngFor="let host of hosts; trackBy: trackHost" [ngValue]="host.id">
                  {{ host.name }} - {{ host.address || host.hostname }}
                </option>
              </select>
            </label>

            <div class="selected-host" *ngIf="selectedHost">
              <dl>
                <div>
                  <dt>Address</dt>
                  <dd>{{ selectedHost.address || selectedHost.hostname }}</dd>
                </div>
                <div>
                  <dt>User</dt>
                  <dd>{{ selectedHost.username || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Auth</dt>
                  <dd>{{ selectedHost.authMode }}</dd>
                </div>
              </dl>
            </div>

            <button type="submit" class="primary-action" [disabled]="isProposing || !selectedHost" data-testid="operator-generate-proposals">
              {{ isProposing ? 'Generating' : 'Generate proposals' }}
            </button>
          </form>
        </article>

        <article class="panel proposal-panel">
          <div class="panel-heading">
            <h2>Proposed commands</h2>
            <span>{{ proposals.length }} pending review</span>
          </div>

          <ul *ngIf="operatorWarnings.length > 0" class="warning-list">
            <li *ngFor="let warning of operatorWarnings">{{ warning }}</li>
          </ul>

          <div *ngIf="proposals.length === 0" class="empty-state">
            <strong>No proposals generated</strong>
            <p>Select a host and generate local diagnostic proposals.</p>
          </div>

          <div *ngIf="proposals.length > 0" class="proposal-list" data-testid="operator-proposal-list">
            <section
              *ngFor="let proposal of proposals; trackBy: trackProposal"
              class="proposal-item"
              [attr.data-testid]="'operator-proposal-' + proposal.id"
              [attr.data-proposal-id]="proposal.id"
              [attr.data-action-kind]="proposalActionKind(proposal)"
              [attr.data-required-capabilities]="proposalRequiredCapabilities(proposal).join(',')"
              [attr.data-route-id]="operatorExecutionRouteId()"
            >
              <div class="proposal-header">
                <div>
                  <h3>{{ proposal.title }}</h3>
                  <p>{{ proposal.rationale }}</p>
                </div>
                <span class="risk" [class.medium]="proposal.risk === 'medium'" [class.high]="proposal.risk === 'high'">
                  {{ proposal.risk }} / {{ proposal.source }}
                </span>
              </div>

              <div class="proposal-review-actions">
                <button
                  type="button"
                  class="secondary-action compact-action"
                  (click)="toggleInspect(proposal)"
                  [attr.aria-expanded]="proposalReviewState(proposal).inspected"
                  [attr.data-testid]="'operator-proposal-inspect-' + proposal.id"
                >
                  {{ proposalReviewState(proposal).inspected ? 'Hide inspect' : 'Inspect' }}
                </button>
                <button
                  type="button"
                  class="secondary-action compact-action"
                  (click)="beginProposalEdit(proposal)"
                  [disabled]="!canEditProposal(proposal)"
                  [attr.data-testid]="'operator-proposal-edit-' + proposal.id"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="secondary-action compact-action danger-action"
                  (click)="rejectProposal(proposal)"
                  [disabled]="!canRejectProposal(proposal)"
                  [attr.data-testid]="'operator-proposal-reject-' + proposal.id"
                >
                  Reject
                </button>
              </div>

              <section class="proposal-command">
                <div class="command-label">
                  <span>Command preview</span>
                  <span *ngIf="proposalWasEdited(proposal)" [attr.data-testid]="'operator-proposal-edited-state-' + proposal.id">
                    Edited before approval
                  </span>
                </div>
                <code [attr.data-testid]="'operator-proposal-command-preview-' + proposal.id">{{ effectiveProposalCommand(proposal) }}</code>
                <p *ngIf="proposalWasEdited(proposal)" class="edit-comparison">
                  <strong>Original:</strong>
                  <code [attr.data-testid]="'operator-proposal-original-command-' + proposal.id">{{ proposal.command }}</code>
                </p>
              </section>

              <section
                *ngIf="proposalReviewState(proposal).editing"
                class="proposal-edit"
                [attr.data-testid]="'operator-proposal-edit-form-' + proposal.id"
              >
                <label>
                  Edited command
                  <textarea
                    rows="3"
                    [ngModel]="proposalReviewState(proposal).draftCommand"
                    (ngModelChange)="updateProposalDraft(proposal, $event)"
                    [attr.data-testid]="'operator-proposal-edit-command-' + proposal.id"
                  ></textarea>
                </label>
                <div class="proposal-review-actions">
                  <button
                    type="button"
                    class="primary-action compact-action"
                    (click)="saveProposalEdit(proposal)"
                    [attr.data-testid]="'operator-proposal-save-edit-' + proposal.id"
                  >
                    Save edit
                  </button>
                  <button
                    type="button"
                    class="secondary-action compact-action"
                    (click)="cancelProposalEdit(proposal)"
                    [attr.data-testid]="'operator-proposal-cancel-edit-' + proposal.id"
                  >
                    Cancel edit
                  </button>
                </div>
              </section>

              <dl class="proposal-metadata" [attr.data-testid]="'operator-proposal-metadata-' + proposal.id">
                <div>
                  <dt>Target host</dt>
                  <dd [attr.data-testid]="'operator-proposal-target-' + proposal.id">{{ proposalTargetLabel(proposal) }}</dd>
                </div>
                <div>
                  <dt>Action kind</dt>
                  <dd [attr.data-testid]="'operator-proposal-action-kind-' + proposal.id">{{ proposalActionKind(proposal) }}</dd>
                </div>
                <div>
                  <dt>Required capability</dt>
                  <dd [attr.data-testid]="'operator-proposal-capability-' + proposal.id">{{ proposalRequiredCapabilities(proposal).join(', ') }}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd [attr.data-testid]="'operator-proposal-route-' + proposal.id">{{ operatorExecutionRouteId() }}</dd>
                </div>
                  <div>
                    <dt>Approval</dt>
                    <dd [attr.data-testid]="'operator-proposal-approval-requirement-' + proposal.id">
                      Explicit approval required
                    </dd>
                  </div>
                <div>
                  <dt>Expected effect</dt>
                  <dd [attr.data-testid]="'operator-proposal-expected-effect-' + proposal.id">{{ proposalExpectedEffect(proposal) }}</dd>
                </div>
              </dl>

              <section
                *ngIf="proposalReviewState(proposal).inspected"
                class="proposal-inspect"
                [attr.data-testid]="'operator-proposal-inspect-details-' + proposal.id"
              >
                <div class="trace-heading">
                  <h4>Proposal inspection</h4>
                  <span [attr.data-testid]="'operator-proposal-inspect-status-' + proposal.id">
                    {{ proposalReviewStatusLabel(proposal) }}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Target host</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-target-' + proposal.id">{{ proposalTargetLabel(proposal) }}</dd>
                  </div>
                  <div>
                    <dt>Risk and source</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-risk-source-' + proposal.id">{{ proposal.risk }} / {{ proposal.source }}</dd>
                  </div>
                  <div>
                    <dt>Action kind</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-action-kind-' + proposal.id">{{ proposalActionKind(proposal) }}</dd>
                  </div>
                  <div>
                    <dt>Required capability</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-capability-' + proposal.id">{{ proposalRequiredCapabilities(proposal).join(', ') }}</dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-route-' + proposal.id">{{ operatorExecutionRouteId() }}</dd>
                  </div>
                  <div>
                    <dt>Rationale</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-rationale-' + proposal.id">{{ proposal.rationale }}</dd>
                  </div>
                  <div>
                    <dt>Expected effect</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-expected-effect-' + proposal.id">{{ proposalExpectedEffect(proposal) }}</dd>
                  </div>
                  <div>
                    <dt>Approval requirement</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-approval-requirement-' + proposal.id">
                      Explicit approval required
                    </dd>
                  </div>
                  <div>
                    <dt>Disabled reasons</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-disabled-reasons-' + proposal.id">
                      {{ proposalInspectDisabledReasons(proposal) }}
                    </dd>
                  </div>
                  <div>
                    <dt>Command preview</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-command-preview-' + proposal.id">{{ effectiveProposalCommand(proposal) }}</dd>
                  </div>
                  <div>
                    <dt>Approval trace</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-approval-trace-' + proposal.id">
                      {{ proposalTrace(proposal).approvalStatus }}
                    </dd>
                  </div>
                  <div>
                    <dt>Audit trace</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-audit-trace-' + proposal.id">{{ proposalTrace(proposal).auditStatus }}</dd>
                  </div>
                  <div>
                    <dt>Sanitizer proof</dt>
                    <dd [attr.data-testid]="'operator-proposal-inspect-sanitizer-proof-' + proposal.id">
                      {{ auditSanitizationLabel(proposalTrace(proposal)) }}
                    </dd>
                  </div>
                </dl>
              </section>

              <ul
                *ngIf="dispatchDisabledReasons(proposal).length > 0"
                class="proposal-disabled-reasons"
                [attr.data-testid]="'operator-proposal-disabled-reasons-' + proposal.id"
              >
                <li *ngFor="let reason of dispatchDisabledReasons(proposal)" [attr.data-disabled-reason]="reason">{{ reason }}</li>
              </ul>

              <section class="proposal-trace" [attr.data-testid]="'operator-proposal-trace-' + proposal.id">
                <div class="trace-heading">
                  <h4>Approval and audit trace</h4>
                  <button
                    type="button"
                    class="secondary-action compact-action"
                    (click)="reloadProposalAudit(proposal)"
                    [disabled]="isLoading"
                    [attr.data-testid]="'operator-proposal-reload-audit-' + proposal.id"
                  >
                    Reload trace
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Approval status</dt>
                    <dd [attr.data-testid]="'operator-proposal-approval-status-' + proposal.id">{{ proposalTrace(proposal).approvalStatus }}</dd>
                  </div>
                  <div>
                    <dt>Backend status</dt>
                    <dd [attr.data-testid]="'operator-proposal-backend-status-' + proposal.id">
                      {{ proposalTrace(proposal).result?.status || 'Not dispatched' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Backend message</dt>
                    <dd [attr.data-testid]="'operator-proposal-backend-message-' + proposal.id">
                      {{ proposalTrace(proposal).result?.message || proposal.message || 'No backend message yet.' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Terminal session</dt>
                    <dd [attr.data-testid]="'operator-proposal-terminal-session-' + proposal.id">
                      {{ proposalTrace(proposal).result?.terminalSessionId || 'Not started' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Terminal start</dt>
                    <dd [attr.data-testid]="'operator-proposal-terminal-start-' + proposal.id">
                      {{ proposalTrace(proposal).result?.terminalStartStatus || 'Not started' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Terminal write</dt>
                    <dd [attr.data-testid]="'operator-proposal-terminal-write-' + proposal.id">
                      {{ terminalWriteLabel(proposalTrace(proposal)) }}
                    </dd>
                  </div>
                  <div>
                    <dt>Audit status</dt>
                    <dd [attr.data-testid]="'operator-proposal-audit-status-' + proposal.id">{{ proposalTrace(proposal).auditStatus }}</dd>
                  </div>
                  <div>
                    <dt>Audit event</dt>
                    <dd [attr.data-testid]="'operator-proposal-audit-event-' + proposal.id">
                      {{ proposalTrace(proposal).auditEventType || 'Not correlated' }}
                    </dd>
                  </div>
                  <div>
                    <dt>Audit sanitization</dt>
                    <dd [attr.data-testid]="'operator-proposal-audit-sanitization-' + proposal.id">
                      {{ auditSanitizationLabel(proposalTrace(proposal)) }}
                    </dd>
                  </div>
                </dl>
              </section>

              <div class="proposal-footer">
                <span class="proposal-status" [attr.data-testid]="'operator-proposal-review-status-' + proposal.id">
                  {{ proposalReviewStatusLabel(proposal) }}
                </span>
                <button
                  type="button"
                  class="primary-action"
                  (click)="approveAndDispatch(proposal)"
                  [disabled]="!canDispatch(proposal)"
                  [attr.data-testid]="'operator-proposal-approve-' + proposal.id"
                >
                  {{ dispatchingProposalId === proposal.id ? 'Dispatching' : (proposalWasEdited(proposal) ? 'Approve edited action' : 'Approve and dispatch') }}
                </button>
              </div>
            </section>
          </div>
        </article>

        <article class="panel audit-panel">
          <div class="panel-heading">
            <h2>Recent local audit</h2>
            <span>{{ auditEvents.length }} loaded</span>
          </div>

          <div *ngIf="auditEvents.length === 0" class="empty-state">
            <strong>No recent audit events</strong>
            <p>Proposal generation and approved executions will appear here.</p>
          </div>

          <ol *ngIf="auditEvents.length > 0" class="audit-list">
            <li *ngFor="let event of auditEvents.slice(0, 6); trackBy: trackAudit">
              <span>{{ event.message }}</span>
              <time>{{ formatDate(event.createdAt) }}</time>
            </li>
          </ol>
        </article>
      </section>
    </div>
  `,
  styles: [
    `
    .page {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      color: #e5e7eb;
    }

    .page-header,
    .header-actions,
    .panel-heading,
    .proposal-header,
    .proposal-footer,
    .trace-heading,
    .proposal-review-actions,
    .command-label {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
    }

    .header-actions,
    .proposal-footer,
    .trace-heading,
    .proposal-review-actions,
    .command-label {
      align-items: center;
      flex-wrap: wrap;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 22px;
    }

    h2 {
      font-size: 15px;
    }

    h3 {
      font-size: 13px;
    }

    h4 {
      margin: 0;
      font-size: 12px;
      color: #f8fafc;
    }

    p,
    label,
    dt,
    time,
    .panel-heading span,
    .proposal-status,
    .proposal-disabled-reasons {
      color: #94a3b8;
      font-size: 12px;
    }

    textarea {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #101318;
      color: #cbd5e1;
      font: inherit;
      font-size: 12px;
      min-height: 76px;
      padding: 8px;
      resize: vertical;
    }

    .status-pill {
      border: 1px solid #166534;
      color: #bbf7d0;
      background: #102418;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      white-space: nowrap;
    }

    .status-pill.is-disabled {
      border-color: #854d0e;
      color: #fde68a;
      background: #422006;
    }

    .notice {
      border: 1px solid #1d4ed8;
      border-radius: 6px;
      background: #111c33;
      color: #bfdbfe;
      padding: 10px 12px;
      font-size: 12px;
    }

    .notice.success {
      border-color: #166534;
      background: #102418;
      color: #bbf7d0;
    }

    .notice.error {
      border-color: #991b1b;
      background: #2f1212;
      color: #fecaca;
    }

    .summary-grid,
    .workflow-grid {
      display: grid;
      gap: 12px;
      align-items: start;
    }

    .summary-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .workflow-grid {
      grid-template-columns: minmax(240px, 0.85fr) minmax(360px, 1.5fr) minmax(260px, 0.9fr);
    }

    .panel {
      min-width: 0;
      padding: 16px;
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
    }

    dl {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 12px 0 0;
    }

    dd {
      margin: 2px 0 0;
      color: #f8fafc;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .target-form,
    .proposal-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    select {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #101318;
      color: #cbd5e1;
      font: inherit;
      font-size: 12px;
      min-height: 34px;
      padding: 8px;
      min-width: 0;
    }

    .selected-host,
    .proposal-item,
    .empty-state,
    .proposal-edit,
    .proposal-inspect,
    .proposal-trace {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #111827;
      padding: 12px;
    }

    .proposal-metadata {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
      margin: 10px 0;
      padding: 10px;
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #101318;
    }

    .proposal-metadata div,
    .proposal-trace dl div {
      min-width: 0;
    }

    .proposal-disabled-reasons {
      margin: 10px 0;
      padding: 9px 12px 9px 28px;
      border: 1px solid #854d0e;
      border-radius: 6px;
      background: rgba(133, 77, 14, 0.12);
      color: #fde68a;
    }

    .proposal-trace {
      margin-top: 10px;
      background: #0f172a;
    }

    .proposal-inspect,
    .proposal-edit,
    .proposal-command {
      margin-top: 10px;
    }

    .proposal-inspect {
      background: #101827;
    }

    .proposal-inspect dl,
    .proposal-trace dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
    }

    .proposal-review-actions {
      justify-content: flex-start;
      margin-top: 10px;
    }

    .compact-action {
      min-height: 28px;
      padding: 5px 9px;
    }

    .danger-action {
      border-color: #7f1d1d;
      color: #fecaca;
    }

    .empty-state {
      border-style: dashed;
      margin-top: 12px;
    }

    .empty-state strong {
      display: block;
      margin-bottom: 6px;
    }

    code {
      display: block;
      margin: 10px 0;
      padding: 10px;
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #0b0f14;
      color: #bfdbfe;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre;
    }

    .edit-comparison {
      display: grid;
      gap: 6px;
      margin-top: 8px;
    }

    .edit-comparison code {
      margin: 0;
      color: #cbd5e1;
    }

    .risk {
      border: 1px solid #166534;
      color: #bbf7d0;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      text-transform: uppercase;
    }

    .risk.medium {
      border-color: #854d0e;
      color: #fde68a;
    }

    .risk.high {
      border-color: #991b1b;
      color: #fecaca;
    }

    .warning-list {
      margin: 0 0 12px;
      padding: 10px 12px 10px 28px;
      border: 1px solid #854d0e;
      border-radius: 6px;
      color: #fde68a;
      background: rgba(133, 77, 14, 0.12);
      font-size: 12px;
    }

    .primary-action,
    .secondary-action {
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e5e7eb;
      padding: 8px 11px;
      min-height: 34px;
      font-size: 12px;
      cursor: pointer;
    }

    .primary-action {
      background: #1d4ed8;
      border-color: #2563eb;
    }

    .secondary-action {
      background: #1f2937;
    }

    .primary-action:disabled,
    .secondary-action:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .audit-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0;
      margin: 12px 0 0;
      list-style: none;
    }

    .audit-list li {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 10px;
      border-bottom: 1px solid #2d3440;
      font-size: 12px;
    }

    @media (max-width: 1180px) {
      .summary-grid,
      .workflow-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .page-header,
      .header-actions,
      .proposal-header,
      .proposal-footer,
      .trace-heading {
        flex-direction: column;
        align-items: stretch;
      }

      .proposal-metadata,
      .proposal-inspect dl,
      .proposal-trace dl {
        grid-template-columns: 1fr;
      }
    }
    `,
  ],
})
export class AgentsComponent implements OnInit {
  settings: MvpSettings | null = null;
  appInfo: AppInfo | null = null;
  hosts: HostRecord[] = [];
  auditEvents: AuditEvent[] = [];
  endpoints: AgentEndpoint[] = [];
  selectedHostId = '';
  proposals: DiagnosticProposal[] = [];
  proposalTraces: Record<string, OperatorProposalTrace> = {};
  proposalReviewStates: Record<string, OperatorProposalReviewState> = {};
  operatorResult: OperatorProposeResult | null = null;
  operatorWarnings: string[] = [];
  terminalSessionId: string | null = null;
  terminalHostId: string | null = null;
  isLoading = false;
  isProposing = false;
  dispatchingProposalId: string | null = null;
  errorMessage = '';
  statusMessage = '';

  ngOnInit(): void {
    void this.loadState();
  }

  get selectedHost(): HostRecord | null {
    return this.hosts.find((host) => host.id === this.selectedHostId) ?? null;
  }

  get endpointLabel(): string {
    const endpoint = this.activeEndpoint;
    if (endpoint) {
      return `${endpoint.name} (${endpoint.provider})`;
    }
    return this.settings?.operator.endpoint.trim() || 'Not configured';
  }

  get endpointModelLabel(): string {
    return this.activeEndpoint?.model || 'Not configured';
  }

  get endpointContextLabel(): string {
    const endpoint = this.activeEndpoint;
    if (!endpoint) {
      return 'Fallback context only';
    }
    return `${endpoint.contextLimit} tokens, tools ${endpoint.toolUse ? 'on' : 'off'}, streaming ${endpoint.streaming ? 'on' : 'off'}`;
  }

  get operatorModeLabel(): string {
    if (!this.operatorResult) {
      return 'Not generated';
    }
    return this.operatorResult.mode === 'provider' ? 'Provider-backed' : 'Local fallback';
  }

  get activeEndpoint(): AgentEndpoint | null {
    return this.endpoints.find((endpoint) => endpoint.enabled) ?? null;
  }

  get executionDisabled(): boolean {
    return this.settings?.operator.policy === 'disabled';
  }

  get policyLabel(): string {
    if (!this.settings) {
      return 'Loading policy';
    }
    return this.executionDisabled ? 'Execution disabled' : 'Manual approval required';
  }

  async loadState(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable. Run the app through Electron to use Operator proposals.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const [hosts, settings, appInfo] = await Promise.all([
        api.host.list(),
        api.settings.get(),
        api.app.getInfo().catch(() => null),
      ]);
      const [auditEvents, endpoints] = await Promise.all([
        api.audit.list().catch(() => this.auditEvents),
        api.agentEndpoint.list().catch(() => this.endpoints),
      ]);
      this.hosts = hosts;
      this.settings = settings;
      this.auditEvents = auditEvents;
      this.endpoints = endpoints;
      this.appInfo = appInfo;
      if (!this.selectedHostId || !this.hosts.some((host) => host.id === this.selectedHostId)) {
        this.selectedHostId = this.hosts[0]?.id ?? '';
      }
      this.syncProposalTraces();
    } catch {
      this.errorMessage = 'Unable to load local Operator state.';
    } finally {
      this.isLoading = false;
    }
  }

  async generateProposals(): Promise<void> {
    const api = getSwitchboardApi();
    const host = this.selectedHost;
    if (!api || !host) {
      this.errorMessage = 'Select a host before generating diagnostic proposals.';
      return;
    }

    this.isProposing = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      if (api.agent?.propose) {
        this.operatorResult = await api.agent.propose({
          hostId: host.id,
          request: 'Generate safe diagnostic proposals for this host.',
        });
        this.proposals = this.operatorResult.proposals;
        this.operatorWarnings = this.operatorResult.warnings;
        this.initializeProposalTraces();
        this.statusMessage = this.operatorResult.mode === 'provider'
          ? 'Provider-backed proposals generated. Review each command before approval.'
          : 'Local fallback proposals generated. Review each command before approval.';
      } else {
        this.operatorResult = null;
        this.operatorWarnings = ['Operator provider service unavailable; using local fallback proposals.'];
        this.proposals = this.buildDiagnosticProposals(host);
        this.initializeProposalTraces();
        await api.audit.log({
          type: 'agent.proposals.generated',
          entityType: 'host',
          entityId: host.id,
          message: `Generated ${this.proposals.length} local Operator fallback proposals.`,
          metadata: {
            workflow: 'local-fallback-operator',
            mode: 'fallback',
            hostId: host.id,
            proposalCount: this.proposals.length,
            commandCount: this.proposals.filter((proposal) => proposal.command.trim()).length,
            warningCount: this.operatorWarnings.length,
            requiresApproval: true,
            approved: false,
            requestLogged: false,
            operatorRequestLogged: false,
            proposedCommandsLogged: false,
            providerPayloadLogged: false,
            secretsLogged: false,
          },
        });
        this.statusMessage = 'Local fallback proposals generated. Review each command before approval.';
      }
      await this.refreshAuditEvents(api);
      this.syncProposalTraces();
    } catch {
      this.errorMessage = 'Unable to generate local Operator proposals.';
    } finally {
      this.isProposing = false;
    }
  }

  canDispatch(proposal: DiagnosticProposal): boolean {
    return this.dispatchDisabledReasons(proposal).length === 0;
  }

  async approveAndDispatch(proposal: DiagnosticProposal): Promise<void> {
    const api = getSwitchboardApi();
    const host = this.selectedHost;
    const disabledReasons = this.dispatchDisabledReasons(proposal);
    if (!api || !host || !api.agent?.executeAction || disabledReasons.length > 0) {
      const message = disabledReasons[0] || 'Select a host before approving a command.';
      this.errorMessage = message;
      proposal.message = message;
      this.updateProposalTrace(proposal, {
        approvalStatus: 'Failed',
        disabledReasons: disabledReasons.length > 0 ? disabledReasons : [message],
        auditStatus: 'Not dispatched.',
      });
      return;
    }

    this.dispatchingProposalId = proposal.id;
    this.errorMessage = '';
    this.statusMessage = '';
    proposal.status = 'approved';
    proposal.message = 'Approved by user.';
    this.updateProposalTrace(proposal, {
      approved: true,
      approvalStatus: 'Dispatching approved action',
      disabledReasons: [],
      auditStatus: 'Awaiting backend audit event.',
    });

    try {
      const approvedCommand = this.effectiveProposalCommand(proposal);
      const input: OperatorActionExecuteInput = {
        hostId: host.id,
        proposal: {
          ...proposal,
          command: approvedCommand,
          status: 'approved',
          message: proposal.message,
        },
        action: {
          kind: 'ssh-command',
          command: approvedCommand,
        },
        approved: true,
      };
      this.emitOperatorExecuteActionCall(input);
      const result = await api.agent.executeAction(input);
      if (result.terminalSessionId) {
        this.terminalSessionId = result.terminalSessionId;
        this.terminalHostId = host.id;
      }
      proposal.message = result.message;
      proposal.status = result.status === 'dispatched' ? 'dispatched' : 'failed';
      this.updateProposalTrace(proposal, {
        result,
        approvalStatus: result.status === 'dispatched' ? 'Dispatched' : 'Failed',
        auditStatus: 'Reloading correlated audit event.',
      });
      await this.refreshAuditEvents(api).catch(() => undefined);
      this.syncProposalTraces();
      if (result.status === 'dispatched') {
        this.statusMessage = `Approved action dispatched to ${host.name}.`;
      } else {
        this.errorMessage = result.message;
      }
    } catch (error) {
      proposal.status = 'failed';
      proposal.message = error instanceof Error ? error.message : 'Dispatch failed.';
      this.errorMessage = proposal.message;
      this.updateProposalTrace(proposal, {
        approvalStatus: 'Failed',
        auditStatus: 'Backend rejected the approved action before a dispatch result was returned.',
      });
      await this.refreshAuditEvents(api).catch(() => undefined);
      this.syncProposalTraces();
    } finally {
      this.dispatchingProposalId = null;
      this.syncProposalTraces();
    }
  }

  async reloadProposalAudit(proposal: DiagnosticProposal): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.updateProposalTrace(proposal, {
        auditStatus: 'Switchboard API is unavailable; audit trace cannot be reloaded.',
      });
      return;
    }
    await this.refreshAuditEvents(api);
    this.syncProposalTraces();
  }

  private emitOperatorExecuteActionCall(input: OperatorActionExecuteInput): void {
    window.dispatchEvent(new CustomEvent('sb:operator-execute-action-call', {
      detail: {
        hostId: input.hostId,
        proposalId: input.proposal.id,
        proposalCommand: input.proposal.command,
        actionKind: input.action.kind,
        actionCommand: input.action.command,
        approved: input.approved,
      },
    }));
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  operatorExecutionRouteId(): string {
    return this.appInfo?.hosted ? 'hosted:POST:/api/agent/execute-action' : 'ipc:agent:execute-action';
  }

  proposalActionKind(_proposal: DiagnosticProposal): 'ssh-command' {
    return 'ssh-command';
  }

  proposalRequiredCapabilities(_proposal: DiagnosticProposal): string[] {
    return ['agent:execute-action'];
  }

  proposalTargetLabel(_proposal: DiagnosticProposal): string {
    const host = this.selectedHost;
    if (!host) {
      return 'No target host selected';
    }
    const address = host.address || host.hostname || host.id;
    return `${host.name} (${address})`;
  }

  proposalExpectedEffect(proposal: DiagnosticProposal): string {
    const editLabel = this.proposalWasEdited(proposal) ? 'edited ' : '';
    return `Runs the approved ${editLabel}${this.proposalActionKind(proposal)} through backend terminal execution for ${this.proposalTargetLabel(proposal)}.`;
  }

  dispatchDisabledReasons(proposal: DiagnosticProposal): string[] {
    const reasons: string[] = [];
    const reviewState = this.proposalReviewState(proposal);
    const api = getSwitchboardApi();
    if (!api) {
      reasons.push('Switchboard API is unavailable. Run the app through Electron or hosted SwitchboardOS.');
    }
    if (!this.selectedHost) {
      reasons.push('Select a target host before approval.');
    }
    if (this.executionDisabled) {
      reasons.push('Operator execution is disabled by local policy.');
    }
    if (api && !api.agent?.executeAction) {
      reasons.push('Structured Operator action execution API is unavailable.');
    }
    if (reviewState.rejected) {
      reasons.push('This proposal was rejected by the user.');
    }
    if (reviewState.editing) {
      reasons.push('Save or cancel the command edit before approval.');
    }
    if (!this.effectiveProposalCommand(proposal).trim()) {
      reasons.push('Command preview is empty.');
    }
    if (this.dispatchingProposalId === proposal.id) {
      reasons.push('This proposal is dispatching.');
    } else if (this.dispatchingProposalId) {
      reasons.push('Another Operator proposal is dispatching.');
    }
    if (proposal.status === 'dispatched') {
      reasons.push('This proposal was already dispatched.');
    }
    return reasons;
  }

  proposalReviewState(proposal: DiagnosticProposal): OperatorProposalReviewState {
    const existing = this.proposalReviewStates[proposal.id];
    if (existing) {
      return existing;
    }
    const created: OperatorProposalReviewState = {
      inspected: false,
      editing: false,
      draftCommand: proposal.command,
      savedCommand: null,
      rejected: false,
      rejectionReason: '',
    };
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: created,
    };
    return created;
  }

  effectiveProposalCommand(proposal: DiagnosticProposal): string {
    const savedCommand = this.proposalReviewState(proposal).savedCommand;
    return savedCommand ?? proposal.command;
  }

  proposalWasEdited(proposal: DiagnosticProposal): boolean {
    return this.proposalReviewState(proposal).savedCommand !== null;
  }

  toggleInspect(proposal: DiagnosticProposal): void {
    const state = this.proposalReviewState(proposal);
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: {
        ...state,
        inspected: !state.inspected,
      },
    };
  }

  canEditProposal(proposal: DiagnosticProposal): boolean {
    const state = this.proposalReviewState(proposal);
    return !state.rejected
      && !state.editing
      && !this.dispatchingProposalId
      && proposal.status !== 'approved'
      && proposal.status !== 'dispatched';
  }

  beginProposalEdit(proposal: DiagnosticProposal): void {
    if (!this.canEditProposal(proposal)) {
      return;
    }
    const state = this.proposalReviewState(proposal);
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: {
        ...state,
        inspected: true,
        editing: true,
        draftCommand: this.effectiveProposalCommand(proposal),
      },
    };
    this.updateProposalTrace(proposal, {
      expectedEffect: this.proposalExpectedEffect(proposal),
      auditStatus: 'Command edit is local and requires explicit approval before backend execution.',
    });
  }

  updateProposalDraft(proposal: DiagnosticProposal, value: string): void {
    const state = this.proposalReviewState(proposal);
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: {
        ...state,
        draftCommand: value,
      },
    };
  }

  saveProposalEdit(proposal: DiagnosticProposal): void {
    const state = this.proposalReviewState(proposal);
    const command = state.draftCommand.trim();
    if (!command) {
      this.errorMessage = 'Edited Operator command cannot be empty.';
      this.updateProposalTrace(proposal, {
        disabledReasons: ['Command preview is empty.'],
        auditStatus: 'Command edit was not saved because the command preview is empty.',
      });
      return;
    }
    const savedCommand = command === proposal.command ? null : command;
    this.errorMessage = '';
    this.statusMessage = savedCommand
      ? 'Edited command saved. Explicit approval is still required before dispatch.'
      : 'Command edit matches the original proposal. Explicit approval is still required before dispatch.';
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: {
        ...state,
        editing: false,
        inspected: true,
        draftCommand: command,
        savedCommand,
      },
    };
    proposal.message = savedCommand ? 'Edited command saved; approval required.' : '';
    this.updateProposalTrace(proposal, {
      approvalStatus: 'Awaiting approval',
      expectedEffect: this.proposalExpectedEffect(proposal),
      auditStatus: 'Edited command saved locally; no backend execution has occurred.',
      disabledReasons: this.dispatchDisabledReasons(proposal),
    });
    this.syncProposalTraces();
  }

  cancelProposalEdit(proposal: DiagnosticProposal): void {
    const state = this.proposalReviewState(proposal);
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: {
        ...state,
        editing: false,
        draftCommand: this.effectiveProposalCommand(proposal),
      },
    };
    this.statusMessage = 'Command edit canceled. Original approval requirement is unchanged.';
    this.updateProposalTrace(proposal, {
      disabledReasons: this.dispatchDisabledReasons(proposal),
      auditStatus: 'Command edit canceled; no backend execution has occurred.',
    });
    this.syncProposalTraces();
  }

  canRejectProposal(proposal: DiagnosticProposal): boolean {
    const state = this.proposalReviewState(proposal);
    return !state.rejected
      && !this.dispatchingProposalId
      && proposal.status !== 'approved'
      && proposal.status !== 'dispatched';
  }

  rejectProposal(proposal: DiagnosticProposal): void {
    if (!this.canRejectProposal(proposal)) {
      return;
    }
    const state = this.proposalReviewState(proposal);
    const rejectionReason = 'Rejected by user before approval.';
    this.proposalReviewStates = {
      ...this.proposalReviewStates,
      [proposal.id]: {
        ...state,
        inspected: true,
        editing: false,
        rejected: true,
        rejectionReason,
      },
    };
    proposal.message = rejectionReason;
    this.errorMessage = '';
    this.statusMessage = rejectionReason;
    this.updateProposalTrace(proposal, {
      approved: false,
      approvalStatus: 'Rejected',
      disabledReasons: ['This proposal was rejected by the user.'],
      auditStatus: 'Rejected locally; no backend execution request was sent.',
      result: null,
    });
    this.syncProposalTraces();
  }

  proposalReviewStatusLabel(proposal: DiagnosticProposal): string {
    const state = this.proposalReviewState(proposal);
    if (state.rejected) {
      return `rejected: ${state.rejectionReason}`;
    }
    if (state.editing) {
      return 'editing: save or cancel before approval';
    }
    if (this.proposalWasEdited(proposal) && proposal.status === 'pending') {
      return 'pending approval: edited command saved';
    }
    return `${proposal.status}${proposal.message ? ': ' + proposal.message : ''}`;
  }

  proposalInspectDisabledReasons(proposal: DiagnosticProposal): string {
    const reasons = this.dispatchDisabledReasons(proposal);
    return reasons.length > 0 ? reasons.join(' ') : 'None';
  }

  proposalTrace(proposal: DiagnosticProposal): OperatorProposalTrace {
    if (!this.proposalTraces[proposal.id]) {
      this.proposalTraces[proposal.id] = this.createProposalTrace(proposal);
    }
    return this.proposalTraces[proposal.id];
  }

  terminalWriteLabel(trace: OperatorProposalTrace): string {
    if (!trace.result) {
      return 'Not attempted';
    }
    return trace.result.terminalWriteAccepted ? 'accepted' : 'not accepted';
  }

  auditSanitizationLabel(trace: OperatorProposalTrace): string {
    if (trace.auditSanitized === null) {
      return 'No correlated audit event yet.';
    }
    if (trace.auditSanitized) {
      return 'Sanitized: commandLogged=false, terminalInputLogged=false, commandOutputLogged=false, providerPayloadLogged=false, secretsLogged=false';
    }
    return 'Audit event is missing sanitizer proof flags.';
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  trackProposal(_index: number, proposal: DiagnosticProposal): string {
    return proposal.id;
  }

  trackAudit(_index: number, event: AuditEvent): string {
    return event.id;
  }

  private buildDiagnosticProposals(host: HostRecord): DiagnosticProposal[] {
    const systemdCommand = 'systemctl --failed --no-pager';
    return [
      {
        id: `${host.id}:kernel`,
        title: 'Identify kernel and platform',
        command: 'uname -a',
        rationale: 'Shows the remote OS/kernel baseline before deeper diagnostics.',
        risk: 'low',
        status: 'pending',
        message: '',
        source: 'fallback',
      },
      {
        id: `${host.id}:uptime`,
        title: 'Check uptime and load',
        command: 'uptime',
        rationale: 'Surfaces current load average and restart recency.',
        risk: 'low',
        status: 'pending',
        message: '',
        source: 'fallback',
      },
      {
        id: `${host.id}:disk`,
        title: 'Review disk pressure',
        command: 'df -h',
        rationale: 'Finds full filesystems that can break services or package operations.',
        risk: 'low',
        status: 'pending',
        message: '',
        source: 'fallback',
      },
      {
        id: `${host.id}:memory`,
        title: 'Review memory pressure',
        command: 'free -m',
        rationale: 'Shows available memory and swap in a compact format.',
        risk: 'low',
        status: 'pending',
        message: '',
        source: 'fallback',
      },
      {
        id: `${host.id}:services`,
        title: 'List failed systemd units',
        command: systemdCommand,
        rationale: 'Reads failed unit state on systemd hosts; the command is inspectable before approval.',
        risk: 'medium',
        status: 'pending',
        message: '',
        source: 'fallback',
      },
    ];
  }

  private async refreshAuditEvents(api: NonNullable<ReturnType<typeof getSwitchboardApi>>): Promise<void> {
    this.auditEvents = await api.audit.list();
  }

  private initializeProposalTraces(): void {
    this.initializeProposalReviewStates();
    const nextTraces: Record<string, OperatorProposalTrace> = {};
    for (const proposal of this.proposals) {
      nextTraces[proposal.id] = this.createProposalTrace(proposal);
    }
    this.proposalTraces = nextTraces;
    this.syncProposalTraces();
  }

  private initializeProposalReviewStates(): void {
    const nextStates: Record<string, OperatorProposalReviewState> = {};
    for (const proposal of this.proposals) {
      nextStates[proposal.id] = {
        inspected: false,
        editing: false,
        draftCommand: proposal.command,
        savedCommand: null,
        rejected: false,
        rejectionReason: '',
      };
    }
    this.proposalReviewStates = nextStates;
  }

  private createProposalTrace(proposal: DiagnosticProposal): OperatorProposalTrace {
    return {
      proposalId: proposal.id,
      targetHostId: this.selectedHost?.id ?? null,
      routeId: this.operatorExecutionRouteId(),
      requiredCapabilities: this.proposalRequiredCapabilities(proposal),
      actionKind: this.proposalActionKind(proposal),
      approvalRequired: true,
      approved: proposal.status === 'approved' || proposal.status === 'dispatched',
      approvalStatus: this.approvalStatusForProposal(proposal),
      expectedEffect: this.proposalExpectedEffect(proposal),
      disabledReasons: this.dispatchDisabledReasons(proposal),
      result: null,
      auditStatus: proposal.status === 'pending' ? 'Not dispatched.' : 'Awaiting correlated audit event.',
      auditEventId: '',
      auditEventType: '',
      auditCreatedAt: '',
      auditMessage: '',
      auditSanitized: null,
      auditMetadata: null,
    };
  }

  private updateProposalTrace(proposal: DiagnosticProposal, updates: Partial<OperatorProposalTrace>): void {
    const current = this.proposalTrace(proposal);
    this.proposalTraces = {
      ...this.proposalTraces,
      [proposal.id]: {
        ...current,
        ...updates,
      },
    };
  }

  private syncProposalTraces(): void {
    const nextTraces: Record<string, OperatorProposalTrace> = {};
    for (const proposal of this.proposals) {
      const existing = this.proposalTraces[proposal.id] ?? this.createProposalTrace(proposal);
      const auditEvent = this.findProposalAuditEvent(proposal);
      const auditMetadata = auditEvent?.metadata ?? null;
      const result = existing.result;
      const auditSanitized = auditMetadata ? this.isExecutionAuditSanitized(auditMetadata) : null;
      nextTraces[proposal.id] = {
        ...existing,
        proposalId: proposal.id,
        targetHostId: this.selectedHost?.id ?? null,
        routeId: this.operatorExecutionRouteId(),
        requiredCapabilities: this.proposalRequiredCapabilities(proposal),
        actionKind: this.proposalActionKind(proposal),
        approvalRequired: true,
        approved: !this.proposalReviewState(proposal).rejected
          && (existing.approved || proposal.status === 'approved' || proposal.status === 'dispatched'),
        approvalStatus: this.dispatchingProposalId === proposal.id
          ? 'Dispatching approved action'
          : this.approvalStatusForProposal(proposal),
        expectedEffect: this.proposalExpectedEffect(proposal),
        disabledReasons: this.dispatchDisabledReasons(proposal),
        result,
        auditStatus: auditEvent
          ? (auditSanitized ? 'Correlated sanitized audit event found.' : 'Correlated audit event found without sanitizer proof flags.')
          : (result ? 'Execution result returned; audit event not loaded yet.' : existing.auditStatus),
        auditEventId: auditEvent?.id ?? '',
        auditEventType: auditEvent?.type ?? '',
        auditCreatedAt: auditEvent?.createdAt ?? '',
        auditMessage: auditEvent?.message ?? '',
        auditSanitized,
        auditMetadata,
      };
    }
    this.proposalTraces = nextTraces;
  }

  private approvalStatusForProposal(proposal: DiagnosticProposal): OperatorProposalApprovalStatus {
    if (this.proposalReviewState(proposal).rejected) {
      return 'Rejected';
    }
    if (proposal.status === 'dispatched') {
      return 'Dispatched';
    }
    if (proposal.status === 'failed') {
      return 'Failed';
    }
    if (proposal.status === 'approved') {
      return 'Approved by user';
    }
    return 'Awaiting approval';
  }

  private findProposalAuditEvent(proposal: DiagnosticProposal): AuditEvent | null {
    const hostId = this.selectedHost?.id ?? null;
    return this.auditEvents.find((event) => {
      const metadata = event.metadata ?? {};
      const eventProposalId = metadata['proposalId'];
      const eventHostId = metadata['hostId'];
      return (event.type === 'agent.action.execution_succeeded' || event.type === 'agent.action.execution_failed')
        && eventProposalId === proposal.id
        && (!hostId || eventHostId === hostId);
    }) ?? null;
  }

  private isExecutionAuditSanitized(metadata: Record<string, unknown>): boolean {
    return metadata['commandLogged'] === false
      && metadata['terminalInputLogged'] === false
      && metadata['commandOutputLogged'] === false
      && metadata['providerPayloadLogged'] === false
      && metadata['secretsLogged'] === false;
  }
}
