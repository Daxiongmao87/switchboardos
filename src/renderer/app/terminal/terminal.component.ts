import { Component, OnInit } from '@angular/core';
import type { HostRecord } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

@Component({
  selector: 'app-terminal',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Terminal</h1>
          <p>Host-scoped terminal workspace with command execution disabled.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">Non-executing MVP stub</span>
          <button type="button" class="secondary-action" (click)="loadHosts()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>
      <p *ngIf="auditMessage" class="notice">{{ auditMessage }}</p>

      <section class="terminal-layout">
        <aside class="panel context-panel">
          <div class="panel-heading">
            <h2>Selected host</h2>
            <span>{{ hosts.length }} available</span>
          </div>

          <label class="host-select">
            Host
            <select
              name="selectedHostId"
              [(ngModel)]="selectedHostId"
              (ngModelChange)="selectHost($event)"
              [disabled]="isLoading || hosts.length === 0"
            >
              <option value="">No host selected</option>
              <option *ngFor="let host of hosts; trackBy: trackHost" [value]="host.id">
                {{ host.name }}
              </option>
            </select>
          </label>

          <dl>
            <div>
              <dt>Name</dt>
              <dd>{{ selectedHost?.name || 'None selected' }}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{{ selectedHostAddress }}</dd>
            </div>
            <div>
              <dt>SSH defaults</dt>
              <dd>{{ selectedHost ? selectedHost.username || 'No user' : 'No user' }} · port {{ selectedHost?.port || 22 }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{{ selectedHost ? statusLabel(selectedHost.lastConnectionStatus) : 'No connection' }}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{{ selectedLastCheckedLabel }}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>Disabled local workspace</dd>
            </div>
          </dl>
        </aside>

        <article class="panel terminal-panel">
          <div class="terminal-output" aria-label="Terminal output placeholder">
            <div class="line muted">$ switchboard terminal --mvp-stub</div>
            <div class="line" *ngIf="selectedHost">
              Selected host: {{ selectedHost.name }} ({{ selectedHostAddress }})
            </div>
            <div class="line" *ngIf="!selectedHost">No host is selected.</div>
            <div class="line">Command input is disabled. No commands execute from this view.</div>
            <div class="line">No SSH connection is attempted by the MVP terminal workspace.</div>
            <div class="line muted">Opening or selecting a host records a local audit event only.</div>
          </div>
          <div class="terminal-input-row">
            <span class="prompt">$</span>
            <input value="command input disabled - no execution" disabled />
          </div>
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
      min-height: 100%;
      color: #e5e7eb;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }

    h1,
    h2,
    p {
      margin: 0;
    }

    h1 {
      font-size: 22px;
    }

    h2 {
      font-size: 15px;
    }

    p,
    dt,
    .muted,
    label,
    .panel-heading span {
      color: #94a3b8;
      font-size: 12px;
    }

    .header-actions,
    .panel-heading {
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }

    .header-actions {
      flex-wrap: wrap;
    }

    .status-pill {
      border: 1px solid #854d0e;
      color: #fde68a;
      background: #422006;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      white-space: nowrap;
    }

    .terminal-layout {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 12px;
      min-height: 460px;
      flex: 1;
    }

    .panel {
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
      padding: 16px;
    }

    .host-select {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin: 14px 0;
    }

    dl {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
    }

    dd {
      margin: 2px 0 0;
      color: #f8fafc;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .terminal-panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: 0;
      overflow: hidden;
      background: #090b10;
    }

    .terminal-output {
      flex: 1;
      min-height: 0;
      padding: 14px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #d1d5db;
      overflow: auto;
    }

    .terminal-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      border-top: 1px solid #2d3440;
      padding: 10px 12px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
    }

    .prompt {
      color: #22c55e;
    }

    input {
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      color: #94a3b8;
      font: inherit;
      outline: none;
    }

    select {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #101318;
      color: #cbd5e1;
      padding: 8px;
      font: inherit;
      font-size: 12px;
      min-width: 0;
    }

    .secondary-action {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1f2937;
      color: #e5e7eb;
      padding: 7px 10px;
      min-height: 32px;
      font-size: 12px;
      cursor: pointer;
    }

    .secondary-action:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .notice {
      border: 1px solid #1d4ed8;
      border-radius: 6px;
      background: #111c33;
      color: #bfdbfe;
      padding: 10px 12px;
    }

    .notice.error {
      border-color: #991b1b;
      background: #2f1212;
      color: #fecaca;
    }

    @media (max-width: 1000px) {
      .terminal-layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .page-header,
      .header-actions {
        flex-direction: column;
        align-items: stretch;
      }
    }
    `,
  ],
})
export class TerminalComponent implements OnInit {
  hosts: HostRecord[] = [];
  selectedHostId = '';
  isLoading = false;
  errorMessage = '';
  auditMessage = '';
  private lastLoggedHostId: string | null | undefined;

  ngOnInit(): void {
    void this.loadHosts();
    void this.logTerminalOpened(null);
  }

  get selectedHost(): HostRecord | null {
    return this.hosts.find((host) => host.id === this.selectedHostId) ?? null;
  }

  get selectedHostAddress(): string {
    const host = this.selectedHost;
    return host ? host.address || host.hostname : 'None';
  }

  get selectedLastCheckedLabel(): string {
    const lastCheckedAt = this.selectedHost?.lastCheckedAt;
    return lastCheckedAt ? this.formatDate(lastCheckedAt) : 'Never';
  }

  async loadHosts(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Host API is unavailable. Run the app through Electron to select local profiles.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.hosts = await api.host.list();
      if (this.selectedHostId && !this.hosts.some((host) => host.id === this.selectedHostId)) {
        this.selectedHostId = '';
      }
    } catch {
      this.errorMessage = 'Unable to load hosts from the local MVP store.';
    } finally {
      this.isLoading = false;
    }
  }

  selectHost(hostId: string): void {
    this.selectedHostId = hostId;
    const host = this.selectedHost;
    void this.logTerminalOpened(host);
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  statusLabel(status: HostRecord['lastConnectionStatus']): string {
    switch (status) {
      case 'stubbed':
        return 'Stubbed MVP test';
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      default:
        return 'Untested';
    }
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private async logTerminalOpened(host: HostRecord | null): Promise<void> {
    const hostId = host?.id ?? null;
    if (this.lastLoggedHostId === hostId) {
      return;
    }

    const api = getSwitchboardApi();
    if (!api) {
      this.auditMessage = 'Audit logging is unavailable outside Electron.';
      return;
    }

    this.lastLoggedHostId = hostId;
    try {
      await api.audit.log({
        type: 'terminal.workspace_opened',
        entityType: host ? 'host' : 'terminal',
        entityId: hostId,
        message: host
          ? `Terminal workspace opened for ${host.name}. No command execution was enabled.`
          : 'Terminal workspace opened with no host selected. No command execution was enabled.',
        metadata: {
          executionEnabled: false,
          sshAttempted: false,
          mvpStub: true,
        },
      });
      this.auditMessage = host
        ? `Recorded local audit event for ${host.name}.`
        : 'Recorded local audit event for terminal workspace open.';
    } catch {
      this.auditMessage = 'Unable to record the terminal workspace audit event.';
    }
  }
}
