import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { HostRecord } from '../../../shared/mvp-models';
import { AuditEvent } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

interface HostDashboardMetric {
  os: string;
  uptime: string;
  memory: string;
  disk: string;
  collectedAt: string;
  status: string;
  error: string | null;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatListModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="dashboard">
      <div class="header">
        <h2>SwitchboardOS — Host Dashboard</h2>
        <span class="subtitle">Real-time host overview and quick actions</span>
      </div>

      <!-- Host Stats -->
      <div class="stats-row">
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon color="primary">desktop_windows</mat-icon>
            <div class="stat-value">{{ hostStats.totalHosts }}</div>
            <div class="stat-label">Total Hosts</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon color="primary">check_circle</mat-icon>
            <div class="stat-value">{{ hostStats.connectedHosts }}</div>
            <div class="stat-label">Connected</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon color="warn">error</mat-icon>
            <div class="stat-value">{{ hostStats.disconnectedHosts }}</div>
            <div class="stat-label">Disconnected</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon color="accent">star</mat-icon>
            <div class="stat-value">{{ hostStats.favoriteHosts }}</div>
            <div class="stat-label">Favorites</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon color="primary">folder</mat-icon>
            <div class="stat-value">{{ hostStats.groupCount }}</div>
            <div class="stat-label">Groups</div>
          </mat-card-content>
        </mat-card>
        <mat-card class="stat-card">
          <mat-card-content>
            <mat-icon color="primary">assignment</mat-icon>
            <div class="stat-value">{{ auditEvents.length }}</div>
            <div class="stat-label">Audit Events</div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Quick Actions -->
      <mat-card class="actions-card">
        <mat-card-header>
          <mat-card-title>Quick Actions</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="actions-grid">
            <button mat-raised-button color="primary" (click)="navigateTo('hosts')">
              <mat-icon>add_circle</mat-icon>
              Manage Hosts
            </button>
            <button mat-raised-button color="accent" (click)="navigateTo('terminal')">
              <mat-icon>terminal</mat-icon>
              Open Terminal
            </button>
            <button mat-raised-button color="warn" (click)="navigateTo('bootstrap')">
              <mat-icon>build</mat-icon>
              Bootstrap Generator
            </button>
            <button mat-raised-button color="primary" (click)="navigateTo('audit')">
              <mat-icon>history</mat-icon>
              Audit Log
            </button>
            <button mat-raised-button color="accent" (click)="navigateTo('agents')">
              <mat-icon>smart_toy</mat-icon>
              Agent Operator
            </button>
            <button mat-raised-button color="primary" (click)="navigateTo('settings')">
              <mat-icon>settings</mat-icon>
              Settings
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Host Dashboard Status -->
      <mat-card class="host-status-card">
        <mat-card-header>
          <mat-card-title>Host Status</mat-card-title>
          <mat-card-subtitle>Unknown means no probe has succeeded yet; refresh metrics collects OS, uptime, memory, and disk through the SSH backend.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p *ngIf="hosts.length === 0" class="empty-state">No host profiles yet.</p>
          <article *ngFor="let h of hosts" class="host-status-row" [attr.data-host-id]="h.id">
            <header>
              <div>
                <strong>{{ h.name }}</strong>
                <span>{{ h.username || 'unknown-user' }}&#64;{{ h.address || h.hostname }}:{{ h.port }}</span>
              </div>
              <mat-chip>{{ h.lastConnectionStatus }}</mat-chip>
            </header>
            <dl class="status-grid">
              <div>
                <dt>Connection</dt>
                <dd>{{ h.lastConnectionStatus || 'unknown' }}</dd>
              </div>
              <div>
                <dt>Last checked</dt>
                <dd>{{ h.lastCheckedAt || 'unknown' }}</dd>
              </div>
              <div>
                <dt>OS info</dt>
                <dd>{{ metricText(h, 'os') }}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{{ metricText(h, 'uptime') }}</dd>
              </div>
              <div>
                <dt>Memory</dt>
                <dd>{{ metricText(h, 'memory') }}</dd>
              </div>
              <div>
                <dt>Disk</dt>
                <dd>{{ metricText(h, 'disk') }}</dd>
              </div>
              <div>
                <dt>Bootstrap</dt>
                <dd>{{ h.bootstrapStatus || 'unknown' }}</dd>
              </div>
              <div>
                <dt>Credential</dt>
                <dd>{{ credentialSummary(h) }}</dd>
              </div>
              <div>
                <dt>Default shell</dt>
                <dd>{{ h.defaultShell || 'unknown' }}</dd>
              </div>
              <div>
                <dt>Working directory</dt>
                <dd>{{ h.defaultWorkingDirectory || 'unknown' }}</dd>
              </div>
              <div>
                <dt>Capabilities</dt>
                <dd>{{ capabilitiesText(h) }}</dd>
              </div>
            </dl>
            <div class="host-actions">
              <button mat-button color="primary" (click)="navigateTo('dashboard?hostId=' + h.id)">Dashboard</button>
              <button mat-button color="accent" (click)="navigateTo('terminal?hostId=' + h.id)">Terminal</button>
              <button mat-button (click)="navigateTo('file-browser?hostId=' + h.id)">Files</button>
              <button mat-button (click)="navigateTo('logs?hostId=' + h.id)">Logs</button>
              <button mat-button (click)="navigateTo('services?hostId=' + h.id)">Services</button>
              <button mat-button (click)="navigateTo('processes?hostId=' + h.id)">Processes</button>
              <button mat-button (click)="refreshMetrics(h)" [disabled]="metricsLoadingHostId === h.id">
                {{ metricsLoadingHostId === h.id ? 'Refreshing metrics' : 'Refresh metrics' }}
              </button>
            </div>
            <p *ngIf="metricsByHostId[h.id]?.error" class="metric-error">{{ metricsByHostId[h.id]?.error }}</p>
          </article>
        </mat-card-content>
      </mat-card>

      <!-- Host Groups -->
      <mat-card class="groups-card" *ngIf="hostStats.groupCount > 0">
        <mat-card-header>
          <mat-card-title>Host Groups</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="groups-grid">
            <mat-card *ngFor="let g of hostGroups" class="group-card" (click)="navigateTo('hosts')">
              <mat-card-content>
                <mat-icon color="primary">folder</mat-icon>
                <div class="group-name">{{ g }}</div>
                <div class="group-count">{{ getHostCountForGroup(g) }} hosts</div>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Favorites -->
      <mat-card class="favorites-card" *ngIf="hostStats.favoriteHosts > 0">
        <mat-card-header>
          <mat-card-title>Favorited Hosts</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <mat-list>
            <mat-list-item *ngFor="let h of favoriteHosts" (click)="navigateTo('terminal?hostId=' + h.id)" style="cursor:pointer">
              <mat-icon matListIcon>star</mat-icon>
              <div matListItemTitle>{{ h.name }}</div>
              <div matListItemLine>{{ h.address }}:{{ h.port }} — {{ h.lastConnectionStatus }}</div>
              <button mat-icon-button matListItemMeta (click)="$event.stopPropagation(); navigateTo('terminal?hostId=' + h.id)">
                <mat-icon>terminal</mat-icon>
              </button>
            </mat-list-item>
          </mat-list>
        </mat-card-content>
      </mat-card>

      <!-- Recent Audit Events -->
      <mat-card class="events-card">
        <mat-card-header>
          <mat-card-title>Recent Audit Events</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <mat-list>
            <mat-list-item *ngFor="let event of auditEvents.slice(0, 10)">
              <mat-icon matListIcon [style.color]="event.type === 'error' ? 'warn' : 'primary'">{{
                event.type === 'error' ? 'error' : 'info'
              }}</mat-icon>
              <div matListItemTitle>{{ event.message }}</div>
              <div matListItemLine>{{ event.createdAt }}</div>
            </mat-list-item>
          </mat-list>
        </mat-card-content>
      </mat-card>

      <!-- Status Bar -->
      <div class="status-bar">
        <span>SwitchboardOS v{{ version }}</span>
        <span *ngIf="loading">Loading...</span>
      </div>
    </div>
  `,
  styles: [`
    .dashboard { padding: 16px; max-width: 1200px; margin: 0 auto; }
    .header { margin-bottom: 24px; }
    .header h2 { margin: 0 0 4px 0; }
    .subtitle { color: #666; font-size: 14px; }
    .stats-row { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-card { flex: 1; min-width: 140px; text-align: center; }
    .stat-card mat-icon { font-size: 32px; height: 32px; width: 32px; }
    .stat-value { font-size: 32px; font-weight: bold; }
    .stat-label { color: #666; font-size: 14px; }
    .actions-grid { display: flex; gap: 12px; flex-wrap: wrap; }
    .host-status-card { margin-top: 24px; }
    .empty-state { color: #666; }
    .host-status-row { border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .host-status-row header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    .host-status-row header div { display: grid; gap: 2px; }
    .host-status-row header span { color: #666; font-size: 13px; }
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 12px 0; }
    .status-grid div { min-width: 0; }
    .status-grid dt { color: #666; font-size: 12px; }
    .status-grid dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    .host-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .metric-error { color: #b91c1c; margin: 4px 0 0; font-size: 12px; }
    .groups-grid { display: flex; gap: 12px; flex-wrap: wrap; }
    .group-card { flex: 1; min-width: 150px; cursor: pointer; }
    .group-card:hover { background-color: rgba(0,0,0,0.04); }
    .group-name { font-weight: bold; margin-top: 8px; }
    .group-count { color: #666; font-size: 14px; }
    .status-bar { margin-top: 24px; text-align: center; color: #666; font-size: 12px; }
    mat-list-item:hover { background-color: rgba(0,0,0,0.04); }
  `],
})
export class DashboardComponent implements OnInit {
  version = '0.1.0';
  loading = true;
  hosts: HostRecord[] = [];
  auditEvents: AuditEvent[] = [];
  metricsByHostId: Record<string, HostDashboardMetric> = {};
  metricsLoadingHostId: string | null = null;

  get hostStats(): { totalHosts: number; connectedHosts: number; disconnectedHosts: number; favoriteHosts: number; groupCount: number } {
    const connected = this.hosts.filter(h => h.lastConnectionStatus === 'success').length;
    const disconnected = this.hosts.filter(h => h.lastConnectionStatus !== 'success').length;
    const favorites = this.hosts.filter(h => h.favorite).length;
    const groups = new Set(this.hosts.filter(h => h.group).map(h => h.group!)).size;
    return { totalHosts: this.hosts.length, connectedHosts: connected, disconnectedHosts: disconnected, favoriteHosts: favorites, groupCount: groups };
  }

  get hostGroups(): string[] {
    return [...new Set(this.hosts.filter(h => h.group).map(h => h.group!))];
  }

  getHostCountForGroup(group: string): number {
    return this.hosts.filter(h => h.group === group).length;
  }

  get favoriteHosts(): HostRecord[] {
    return this.hosts.filter(h => h.favorite);
  }

  statusText(value: string | null | undefined): string {
    return value?.trim() || 'unknown';
  }

  capabilitiesText(host: HostRecord): string {
    return host.capabilities.length > 0 ? host.capabilities.join(', ') : 'unknown';
  }

  credentialSummary(host: HostRecord): string {
    if (host.credentialRefId) {
      return `credential ref ${host.credentialRefId}`;
    }
    if (host.keyPath) {
      return `key path/reference ${host.keyPath}`;
    }
    if (host.authMode === 'agent') {
      return 'ssh-agent';
    }
    return `${host.authMode} / no stored secret`;
  }

  metricText(host: HostRecord, key: 'os' | 'uptime' | 'memory' | 'disk'): string {
    const metric = this.metricsByHostId[host.id];
    if (!metric) {
      return key === 'os' ? this.statusText(host.osHint) : 'not probed';
    }
    return metric[key] || 'unknown';
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    const sb = getSwitchboardApi();
    if (!sb) {
      this.loading = false;
      return;
    }

    this.loading = true;
    try {
      this.hosts = await sb.host.list();
      this.auditEvents = await sb.audit.list();
    } finally {
      this.loading = false;
    }
  }

  navigateTo(path: string): void {
    getSwitchboardApi()?.window.navigate(`/${path}`);
  }

  async refreshMetrics(host: HostRecord): Promise<void> {
    const sb = getSwitchboardApi();
    if (!sb?.hostOperations) {
      return;
    }

    this.metricsLoadingHostId = host.id;
    try {
      const result = await sb.hostOperations.run({
        hostId: host.id,
        kind: 'metrics',
        limit: 1,
      });
      const row = result.rows[0] ?? {};
      this.metricsByHostId = {
        ...this.metricsByHostId,
        [host.id]: {
          os: String(row['os'] ?? host.osHint ?? 'unknown'),
          uptime: String(row['uptime'] ?? 'unknown'),
          memory: String(row['memory'] ?? 'unknown'),
          disk: String(row['disk'] ?? 'unknown'),
          collectedAt: result.completedAt,
          status: result.status,
          error: result.status === 'success' ? null : result.error ?? result.summary,
        },
      };
    } finally {
      this.metricsLoadingHostId = null;
    }
  }
}
