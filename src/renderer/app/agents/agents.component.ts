import { Component, OnInit } from '@angular/core';
import type { AgentEndpoint, AuditEvent, HostRecord, MvpSettings, OperatorProposal, OperatorProposeResult } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

type DiagnosticProposal = OperatorProposal;

@Component({
  selector: 'app-agents',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Agents</h1>
          <p>Provider-backed Operator proposals with explicit approval before SSH command dispatch.</p>
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

          <form *ngIf="hosts.length > 0" class="target-form" (ngSubmit)="generateProposals()">
            <label>
              Host profile
              <select name="hostId" [(ngModel)]="selectedHostId">
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

            <button type="submit" class="primary-action" [disabled]="isProposing || !selectedHost">
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

          <div *ngIf="proposals.length > 0" class="proposal-list">
            <section *ngFor="let proposal of proposals; trackBy: trackProposal" class="proposal-item">
              <div class="proposal-header">
                <div>
                  <h3>{{ proposal.title }}</h3>
                  <p>{{ proposal.rationale }}</p>
                </div>
                <span class="risk" [class.medium]="proposal.risk === 'medium'" [class.high]="proposal.risk === 'high'">
                  {{ proposal.risk }} / {{ proposal.source }}
                </span>
              </div>

              <code>{{ proposal.command }}</code>

              <div class="proposal-footer">
                <span class="proposal-status">{{ proposal.status }}{{ proposal.message ? ': ' + proposal.message : '' }}</span>
                <button
                  type="button"
                  class="primary-action"
                  (click)="approveAndDispatch(proposal)"
                  [disabled]="!canDispatch(proposal)"
                >
                  {{ dispatchingProposalId === proposal.id ? 'Dispatching' : 'Approve and dispatch' }}
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
            <p>Proposal generation and approved dispatches will appear here.</p>
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
    .proposal-footer {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
    }

    .header-actions,
    .proposal-footer {
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

    p,
    label,
    dt,
    time,
    .panel-heading span,
    .proposal-status {
      color: #94a3b8;
      font-size: 12px;
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
    .empty-state {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #111827;
      padding: 12px;
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
      .proposal-footer {
        flex-direction: column;
        align-items: stretch;
      }
    }
    `,
  ],
})
export class AgentsComponent implements OnInit {
  settings: MvpSettings | null = null;
  hosts: HostRecord[] = [];
  auditEvents: AuditEvent[] = [];
  endpoints: AgentEndpoint[] = [];
  selectedHostId = '';
  proposals: DiagnosticProposal[] = [];
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
      const [hosts, settings, auditEvents, endpoints] = await Promise.all([
        api.host.list(),
        api.settings.get(),
        api.audit.list(),
        api.agentEndpoint.list(),
      ]);
      this.hosts = hosts;
      this.settings = settings;
      this.auditEvents = auditEvents;
      this.endpoints = endpoints;
      if (!this.selectedHostId || !this.hosts.some((host) => host.id === this.selectedHostId)) {
        this.selectedHostId = this.hosts[0]?.id ?? '';
      }
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
        this.statusMessage = this.operatorResult.mode === 'provider'
          ? 'Provider-backed proposals generated. Review each command before approval.'
          : 'Local fallback proposals generated. Review each command before approval.';
      } else {
        this.operatorResult = null;
        this.operatorWarnings = ['Operator provider service unavailable; using local fallback proposals.'];
        this.proposals = this.buildDiagnosticProposals(host);
        await api.audit.log({
          type: 'agent.proposals.generated',
          entityType: 'host',
          entityId: host.id,
          message: `Generated ${this.proposals.length} local Operator fallback proposals for ${host.name}.`,
          metadata: {
            workflow: 'local-fallback-operator',
            hostId: host.id,
            requiresApproval: true,
            approved: false,
            commands: this.proposals.map((proposal) => proposal.command),
            secretsLogged: false,
          },
        });
        this.statusMessage = 'Local fallback proposals generated. Review each command before approval.';
      }
      await this.refreshAuditEvents(api);
    } catch {
      this.errorMessage = 'Unable to generate local Operator proposals.';
    } finally {
      this.isProposing = false;
    }
  }

  canDispatch(proposal: DiagnosticProposal): boolean {
    return Boolean(
      this.selectedHost &&
      !this.executionDisabled &&
      !this.dispatchingProposalId &&
      proposal.status !== 'dispatched',
    );
  }

  async approveAndDispatch(proposal: DiagnosticProposal): Promise<void> {
    const api = getSwitchboardApi();
    const host = this.selectedHost;
    if (!api || !host) {
      this.errorMessage = 'Select a host before approving a command.';
      return;
    }
    if (this.executionDisabled) {
      this.errorMessage = 'Operator execution is disabled by local policy.';
      return;
    }

    this.dispatchingProposalId = proposal.id;
    this.errorMessage = '';
    this.statusMessage = '';
    proposal.status = 'approved';
    proposal.message = 'Approved by user.';

    try {
      const sessionId = await this.ensureTerminalSession(api, host);
      const writeResult = await api.terminal.write(sessionId, `${proposal.command}\n`);
      if (!writeResult.success) {
        throw new Error(writeResult.message);
      }
      proposal.status = 'dispatched';
      proposal.message = 'Command sent to approved SSH terminal session.';
      await api.audit.log({
        type: 'agent.command.dispatched',
        entityType: 'host',
        entityId: host.id,
        message: `Approved and dispatched local Operator command for ${host.name}: ${proposal.command}`,
        metadata: {
          workflow: proposal.source === 'provider' ? 'provider-backed-operator' : 'local-fallback-operator',
          hostId: host.id,
          terminalSessionId: sessionId,
          command: proposal.command,
          proposalSource: proposal.source,
          requiresApproval: true,
          approved: true,
          autonomous: false,
          untrustedHostOutputSeparated: true,
          secretsLogged: false,
        },
      });
      this.statusMessage = `Approved command dispatched to ${host.name}.`;
      await this.refreshAuditEvents(api);
    } catch (error) {
      proposal.status = 'failed';
      proposal.message = error instanceof Error ? error.message : 'Dispatch failed.';
      this.errorMessage = proposal.message;
    } finally {
      this.dispatchingProposalId = null;
    }
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
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

  private async ensureTerminalSession(api: NonNullable<ReturnType<typeof getSwitchboardApi>>, host: HostRecord): Promise<string> {
    if (this.terminalSessionId && this.terminalHostId === host.id) {
      return this.terminalSessionId;
    }

    const startResult = await api.terminal.start(host.id);
    if (startResult.status !== 'started' || !startResult.sessionId) {
      throw new Error(startResult.message);
    }

    this.terminalSessionId = startResult.sessionId;
    this.terminalHostId = host.id;
    return startResult.sessionId;
  }

  private async refreshAuditEvents(api: NonNullable<ReturnType<typeof getSwitchboardApi>>): Promise<void> {
    this.auditEvents = await api.audit.list();
  }
}
