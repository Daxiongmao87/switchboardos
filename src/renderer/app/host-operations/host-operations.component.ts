import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import type {
  HostOperationInput,
  HostOperationKind,
  HostOperationResult,
  HostRecord,
} from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

const MODE_COPY: Record<HostOperationKind, { title: string; noun: string; defaultPath: string; icon: string }> = {
  files: { title: 'File Browser', noun: 'file listing', defaultPath: '.', icon: 'FB' },
  processes: { title: 'Process Viewer', noun: 'process list', defaultPath: '', icon: 'PV' },
  services: { title: 'Service Manager', noun: 'service list', defaultPath: '', icon: 'SM' },
  logs: { title: 'Log Viewer', noun: 'log lines', defaultPath: '', icon: 'LV' },
  metrics: { title: 'Host Metrics', noun: 'OS, uptime, memory, and disk snapshot', defaultPath: '', icon: 'MT' },
};

@Component({
  selector: 'app-host-operations',
  standalone: false,
  template: `
    <section
      class="operation-app"
      data-testid="host-operation-runtime"
      [attr.data-operation-kind]="mode"
      [attr.data-host-context-id]="hostContextId || null"
      [attr.data-selected-host-id]="selectedHostId || null"
      [attr.data-row-count]="result?.rows?.length || 0"
      [attr.data-semantic-state]="semanticSummary"
    >
      <header class="operation-header">
        <div>
          <span class="operation-icon">{{ copy.icon }}</span>
          <h1>{{ copy.title }}</h1>
          <p>Read-only host inspection through backend-owned ssh BatchMode. No browser-side command execution or secrets.</p>
        </div>
        <button type="button" class="secondary-action" (click)="loadHosts()" [disabled]="isLoading">
          Refresh hosts
        </button>
      </header>

      <section class="operation-controls">
        <label>
          Host
          <select
            name="operationHost"
            [(ngModel)]="selectedHostId"
            [disabled]="hostContextLocked"
          >
            <option value="">Select host</option>
            <option *ngFor="let host of hosts; trackBy: trackHost" [value]="host.id">
              {{ host.name }} - {{ host.address || host.hostname }}:{{ host.port }}
            </option>
          </select>
        </label>

        <label *ngIf="mode === 'files'">
          Path/reference
          <input name="operationPath" [(ngModel)]="path" placeholder="." />
        </label>

        <label>
          Limit
          <input name="operationLimit" type="number" min="1" max="250" [(ngModel)]="limit" />
        </label>

        <button type="button" class="primary-action" (click)="runOperation()" [disabled]="isRunning || !selectedHostId">
          {{ isRunning ? 'Running...' : 'Run read-only inspection' }}
        </button>
      </section>

      <p *ngIf="hostContextLocked" class="context-note">
        Host context is locked by the shell window: {{ hostContextTitle || selectedHost?.name || hostContextId }}.
      </p>
      <p *ngIf="statusMessage" class="status-message">{{ statusMessage }}</p>
      <p *ngIf="errorMessage" class="error-message">{{ errorMessage }}</p>

      <section class="operation-result" *ngIf="result; else emptyState">
        <header>
          <div>
            <h2>{{ result.summary }}</h2>
            <span>{{ result.command }}</span>
          </div>
          <span class="status-chip">exit {{ result.exitCode === null ? 'unknown' : result.exitCode }}</span>
        </header>

        <div class="table-scroll" *ngIf="rowKeys.length > 0">
          <table>
            <thead>
              <tr>
                <th *ngFor="let key of rowKeys">{{ key }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of result.rows; trackBy: trackRow">
                <td *ngFor="let key of rowKeys">{{ row[key] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <details>
          <summary>Raw stdout/stderr</summary>
          <pre>{{ result.stdout || '(no stdout)' }}</pre>
          <pre *ngIf="result.stderr">{{ result.stderr }}</pre>
        </details>
      </section>

      <ng-template #emptyState>
        <section class="operation-empty">
          <h2>{{ copy.title }}</h2>
          <p>Select a host and run a read-only {{ copy.noun }}. The command is executed only by the main-process backend using the existing SSH credential reference strategy.</p>
        </section>
      </ng-template>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .operation-app {
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      gap: 12px;
      height: 100%;
      min-height: 0;
      padding: 16px;
      background: #151922;
      color: #eef3fb;
    }

    .operation-header,
    .operation-controls,
    .operation-result header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .operation-header h1,
    .operation-result h2,
    .operation-empty h2 {
      margin: 0;
      font-size: 18px;
    }

    .operation-header p,
    .operation-result span,
    .operation-empty p,
    .context-note,
    .status-message {
      margin: 4px 0 0;
      color: #9eaabd;
      font-size: 12px;
      line-height: 1.45;
    }

    .operation-icon,
    .status-chip {
      display: inline-grid;
      place-items: center;
      min-width: 34px;
      height: 24px;
      border: 1px solid #3a4355;
      border-radius: 6px;
      background: #202737;
      color: #eaf0fb;
      font-size: 12px;
      font-weight: 700;
    }

    .operation-controls {
      flex-wrap: wrap;
      padding: 10px;
      border: 1px solid #2c3546;
      border-radius: 8px;
      background: #111723;
    }

    label {
      display: grid;
      gap: 4px;
      min-width: 160px;
      color: #b8c3d5;
      font-size: 12px;
    }

    input,
    select {
      min-height: 34px;
      border: 1px solid #364155;
      border-radius: 6px;
      padding: 0 10px;
      background: #0c111a;
      color: #eef3fb;
      font: inherit;
    }

    button {
      border: 1px solid #42506a;
      border-radius: 6px;
      padding: 8px 12px;
      background: #20283a;
      color: #eef3fb;
      font: inherit;
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .primary-action {
      border-color: #5f86ff;
      background: #315fd1;
    }

    .operation-result {
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-height: 0;
      border: 1px solid #2c3546;
      border-radius: 8px;
      background: #0f141f;
      overflow: hidden;
    }

    .operation-result header {
      padding: 12px;
      border-bottom: 1px solid #2c3546;
    }

    .table-scroll {
      min-height: 0;
      overflow: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th,
    td {
      border-bottom: 1px solid #202838;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }

    th {
      position: sticky;
      top: 0;
      background: #161d2a;
      color: #b8c3d5;
    }

    details {
      border-top: 1px solid #2c3546;
      padding: 10px 12px;
    }

    pre {
      max-height: 160px;
      margin: 8px 0 0;
      overflow: auto;
      color: #d5deec;
      white-space: pre-wrap;
    }

    .operation-empty {
      border: 1px dashed #344052;
      border-radius: 8px;
      padding: 18px;
      background: #101722;
    }

    .error-message {
      margin: 0;
      color: #ffb8b8;
    }
  `],
})
export class HostOperationsComponent implements OnInit, OnChanges {
  @Input() mode: HostOperationKind = 'files';
  @Input() hostContextId: string | null = null;
  @Input() hostContextTitle = '';
  @Input() hostContextLocked = false;

  hosts: HostRecord[] = [];
  selectedHostId = '';
  path = '.';
  limit = 80;
  result: HostOperationResult | null = null;
  isLoading = false;
  isRunning = false;
  statusMessage = '';
  errorMessage = '';

  get copy() {
    return MODE_COPY[this.mode];
  }

  get selectedHost(): HostRecord | null {
    return this.hosts.find((host) => host.id === this.selectedHostId) ?? null;
  }

  get rowKeys(): string[] {
    return this.result?.rows[0] ? Object.keys(this.result.rows[0]) : [];
  }

  get semanticSummary(): string {
    const host = this.selectedHost;
    return `${this.mode}:${host?.id ?? 'unscoped'}:${this.result?.rows.length ?? 0}`;
  }

  ngOnInit(): void {
    this.applyHostContext();
    void this.loadHosts();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.applyHostContext();
  }

  async loadHosts(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable.';
      return;
    }

    this.isLoading = true;
    try {
      this.hosts = await api.host.list();
      this.applyHostContext();
    } catch (error) {
      this.errorMessage = this.errorText(error, 'Unable to load hosts.');
    } finally {
      this.isLoading = false;
    }
  }

  async runOperation(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api || !this.selectedHostId) {
      this.errorMessage = 'Select a host before running an inspection.';
      return;
    }

    const input: HostOperationInput = {
      hostId: this.selectedHostId,
      kind: this.mode,
      limit: this.limit,
    };
    if (this.mode === 'files') {
      input.path = this.path || '.';
    }

    this.isRunning = true;
    this.errorMessage = '';
    this.statusMessage = `Running read-only ${this.mode} inspection through backend ssh.`;
    try {
      this.result = await api.hostOperations.run(input);
      this.statusMessage = this.result.summary;
    } catch (error) {
      this.errorMessage = this.errorText(error, `Unable to run ${this.mode} inspection.`);
    } finally {
      this.isRunning = false;
    }
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  trackRow(index: number): number {
    return index;
  }

  private applyHostContext(): void {
    if (this.hostContextId) {
      this.selectedHostId = this.hostContextId;
    }
    if (this.mode === 'files' && !this.path) {
      this.path = this.copy.defaultPath;
    }
  }

  private errorText(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
