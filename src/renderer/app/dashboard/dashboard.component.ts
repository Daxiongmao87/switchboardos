import { Component, OnInit } from '@angular/core';
import type { AuditEvent, HostRecord } from '../../../shared/mvp-models';
import type { AppInfo } from '../switchboard-api';
import { getSwitchboardApi } from '../switchboard-api';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Local inventory and audit status from the MVP store.</p>
        </div>
        <button type="button" class="secondary-action" (click)="loadDashboard()" [disabled]="isLoading">
          Refresh
        </button>
      </header>

      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="status-grid" aria-label="Local status">
        <article class="metric-card">
          <span class="metric-label">App status</span>
          <strong>{{ isLoading ? 'Loading' : 'Ready' }}</strong>
          <span class="metric-note">
            Local-first renderer{{ appInfo ? ' on ' + appInfo.platform : '' }}.
          </span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Known hosts</span>
          <strong>{{ hosts.length }}</strong>
          <span class="metric-note">Profiles stored in the local MVP JSON store.</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Tested / stubbed</span>
          <strong>{{ testedHostCount }} / {{ stubbedHostCount }}</strong>
          <span class="metric-note">Connection tests are deterministic MVP stubs.</span>
        </article>
        <article class="metric-card">
          <span class="metric-label">Audit events</span>
          <strong>{{ auditEvents.length }}</strong>
          <span class="metric-note">Local activity log only; no remote execution.</span>
        </article>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <h2>Recent activity</h2>
          <span>{{ recentAuditEvents.length }} shown</span>
        </div>

        <div *ngIf="isLoading" class="empty-state">
          <strong>Loading activity</strong>
          <p>Reading the local audit log.</p>
        </div>

        <div *ngIf="!isLoading && recentAuditEvents.length === 0" class="empty-state">
          <strong>No activity recorded</strong>
          <p>Host and terminal workspace actions will appear here after they are recorded.</p>
        </div>

        <div *ngIf="!isLoading && recentAuditEvents.length > 0" class="activity-list">
          <article *ngFor="let event of recentAuditEvents; trackBy: trackAuditEvent" class="activity-row">
            <div>
              <strong>{{ event.message || event.type }}</strong>
              <p>{{ event.entityType }}{{ event.entityId ? ' · ' + event.entityId : '' }}</p>
            </div>
            <time>{{ formatDate(event.createdAt) }}</time>
          </article>
        </div>
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
    .panel-heading {
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
    .panel-heading span,
    .metric-note,
    .metric-label {
      color: #94a3b8;
      font-size: 12px;
    }

    .status-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .metric-card,
    .panel {
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
    }

    .metric-card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 112px;
      padding: 14px;
    }

    .metric-card strong {
      font-size: 24px;
      line-height: 1;
    }

    .panel {
      padding: 16px;
    }

    .empty-state {
      margin-top: 14px;
      border: 1px dashed #334155;
      border-radius: 6px;
      padding: 18px;
      background: #111827;
    }

    .empty-state strong {
      display: block;
      margin-bottom: 6px;
    }

    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }

    .activity-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #111827;
      padding: 12px;
    }

    .activity-row strong {
      display: block;
      color: #f8fafc;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .activity-row time {
      color: #94a3b8;
      font-size: 12px;
      white-space: nowrap;
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

    @media (max-width: 900px) {
      .status-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .page-header,
      .activity-row {
        flex-direction: column;
      }

      .status-grid {
        grid-template-columns: 1fr;
      }
    }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  hosts: HostRecord[] = [];
  auditEvents: AuditEvent[] = [];
  appInfo: AppInfo | null = null;
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    void this.loadDashboard();
  }

  get testedHostCount(): number {
    return this.hosts.filter((host) => host.lastConnectionStatus !== 'untested').length;
  }

  get stubbedHostCount(): number {
    return this.hosts.filter((host) => host.lastConnectionStatus === 'stubbed').length;
  }

  get recentAuditEvents(): AuditEvent[] {
    return [...this.auditEvents]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 8);
  }

  async loadDashboard(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable. Run the app through Electron to read local status.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [hosts, auditEvents, appInfo] = await Promise.all([
        api.host.list(),
        api.audit.list(),
        api.app.getInfo().catch(() => null),
      ]);
      this.hosts = hosts;
      this.auditEvents = auditEvents;
      this.appInfo = appInfo;
    } catch {
      this.errorMessage = 'Unable to load dashboard data from the local MVP store.';
    } finally {
      this.isLoading = false;
    }
  }

  trackAuditEvent(_index: number, event: AuditEvent): string {
    return event.id;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }
}
