import { Component, OnInit } from '@angular/core';
import type { AuditEvent, HostRecord } from '../../../shared/mvp-models';
import {
  BUILTIN_APP_MANIFESTS,
  EXAMPLE_HOST_MAP_APP,
  type SwitchboardAppContext,
  type SwitchboardAppManifest,
  type SwitchboardAppPanelMode,
} from '../app-sdk';
import { getSwitchboardApi } from '../switchboard-api';

interface AppPanel {
  id: string;
  manifest: SwitchboardAppManifest;
  mode: SwitchboardAppPanelMode;
}

@Component({
  selector: 'app-apps',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Apps</h1>
          <p>Local App SDK registry with one graphical example app and basic panel tiling.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">Local SDK</span>
          <button type="button" class="secondary-action" (click)="loadContext()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p class="notice">
        MVP apps run inside the local renderer and read only the typed SwitchboardOS context exposed here.
      </p>
      <p *ngIf="statusMessage" class="notice success">{{ statusMessage }}</p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="sdk-grid">
        <article class="panel">
          <h2>SDK surface</h2>
          <dl>
            <div>
              <dt>Manifests</dt>
              <dd>{{ manifests.length }}</dd>
            </div>
            <div>
              <dt>Context</dt>
              <dd>{{ context.hosts.length }} hosts, {{ context.auditEvents.length }} audit events</dd>
            </div>
            <div>
              <dt>Panel modes</dt>
              <dd>floating, tile-right, tile-bottom</dd>
            </div>
          </dl>
        </article>

        <article class="panel registry-panel">
          <div class="panel-heading">
            <h2>App registry</h2>
            <span>{{ panels.length }} open</span>
          </div>

          <div class="app-card" *ngFor="let manifest of manifests; trackBy: trackManifest">
            <div>
              <h3>{{ manifest.name }}</h3>
              <p>{{ manifest.description }}</p>
              <span>{{ manifest.category }} - v{{ manifest.version }}</span>
            </div>
            <button type="button" class="primary-action" (click)="launchApp(manifest)">
              Launch
            </button>
          </div>
        </article>
      </section>

      <section class="workspace" [class.has-panels]="panels.length > 0">
        <div *ngIf="panels.length === 0" class="empty-state">
          <strong>No app panels open</strong>
          <p>Launch the Host Status Map example to inspect the SDK workspace.</p>
        </div>

        <article
          *ngFor="let panel of panels; trackBy: trackPanel"
          class="app-window"
          [class.tile-right]="panel.mode === 'tile-right'"
          [class.tile-bottom]="panel.mode === 'tile-bottom'"
          [class.floating]="panel.mode === 'floating'"
        >
          <header class="window-header">
            <div>
              <h2>{{ panel.manifest.name }}</h2>
              <p>{{ panel.manifest.id }}</p>
            </div>
            <div class="window-actions">
              <button type="button" class="icon-action" title="Float panel" (click)="setPanelMode(panel, 'floating')">F</button>
              <button type="button" class="icon-action" title="Tile right" (click)="setPanelMode(panel, 'tile-right')">R</button>
              <button type="button" class="icon-action" title="Tile bottom" (click)="setPanelMode(panel, 'tile-bottom')">B</button>
              <button type="button" class="icon-action danger" title="Close panel" (click)="closePanel(panel)">X</button>
            </div>
          </header>

          <section class="host-map" *ngIf="panel.manifest.id === exampleAppId">
            <div class="map-summary">
              <div>
                <strong>{{ context.hosts.length }}</strong>
                <span>Hosts</span>
              </div>
              <div>
                <strong>{{ successfulHosts }}</strong>
                <span>Reachable</span>
              </div>
              <div>
                <strong>{{ failedHosts }}</strong>
                <span>Failed</span>
              </div>
            </div>

            <div class="status-bars" *ngIf="context.hosts.length > 0">
              <div class="status-row" *ngFor="let host of context.hosts; trackBy: trackHost">
                <span>{{ host.name }}</span>
                <div class="bar-track">
                  <div class="bar-fill" [class.success]="host.lastConnectionStatus === 'success'" [class.failed]="host.lastConnectionStatus === 'failed'" [style.width.%]="statusWidth(host)"></div>
                </div>
                <em>{{ host.lastConnectionStatus }}</em>
              </div>
            </div>

            <div class="empty-state compact" *ngIf="context.hosts.length === 0">
              <strong>No host data</strong>
              <p>Add hosts to populate the example graphical app.</p>
            </div>

            <ol class="activity-list" *ngIf="context.auditEvents.length > 0">
              <li *ngFor="let event of context.auditEvents.slice(0, 4); trackBy: trackAudit">
                <span>{{ event.message }}</span>
                <time>{{ formatDate(event.createdAt) }}</time>
              </li>
            </ol>
          </section>
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
    .window-header,
    .window-actions {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
    }

    .header-actions,
    .window-actions {
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
    dt,
    time,
    .panel-heading span,
    .app-card span,
    .window-header p,
    .map-summary span,
    .status-row em {
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

    .sdk-grid {
      display: grid;
      grid-template-columns: minmax(240px, 0.8fr) minmax(360px, 1.2fr);
      gap: 12px;
      align-items: start;
    }

    .panel,
    .app-window,
    .empty-state {
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

    .registry-panel,
    .workspace,
    .host-map,
    .activity-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .app-card {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      border: 1px solid #334155;
      border-radius: 6px;
      background: #111827;
      padding: 12px;
    }

    .workspace {
      position: relative;
      min-height: 520px;
      border: 1px dashed #334155;
      border-radius: 6px;
      padding: 12px;
      background: #101318;
    }

    .workspace.has-panels {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 36%);
      grid-auto-rows: minmax(220px, auto);
      align-items: start;
    }

    .app-window.floating {
      max-width: 720px;
      box-shadow: 0 16px 40px rgb(0 0 0 / 24%);
    }

    .app-window.tile-right {
      grid-column: 2;
      min-height: 496px;
    }

    .app-window.tile-bottom {
      grid-column: 1 / -1;
    }

    .primary-action,
    .secondary-action,
    .icon-action {
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e5e7eb;
      min-height: 32px;
      font-size: 12px;
      cursor: pointer;
    }

    .primary-action {
      background: #1d4ed8;
      border-color: #2563eb;
      padding: 8px 11px;
    }

    .secondary-action {
      background: #1f2937;
      padding: 7px 10px;
    }

    .icon-action {
      width: 30px;
      background: #1f2937;
      font-weight: 700;
    }

    .icon-action.danger {
      border-color: #7f1d1d;
      background: #2f1212;
    }

    .empty-state {
      border-style: dashed;
    }

    .empty-state strong {
      display: block;
      margin-bottom: 6px;
    }

    .empty-state.compact {
      padding: 12px;
    }

    .map-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .map-summary div {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #111827;
      padding: 12px;
    }

    .map-summary strong {
      display: block;
      font-size: 24px;
      line-height: 1;
      margin-bottom: 6px;
    }

    .status-bars {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .status-row {
      display: grid;
      grid-template-columns: minmax(110px, 160px) minmax(120px, 1fr) minmax(70px, auto);
      gap: 10px;
      align-items: center;
      font-size: 12px;
    }

    .bar-track {
      overflow: hidden;
      height: 12px;
      border-radius: 999px;
      background: #0b0f14;
      border: 1px solid #2d3440;
    }

    .bar-fill {
      height: 100%;
      min-width: 8px;
      background: #64748b;
    }

    .bar-fill.success {
      background: #22c55e;
    }

    .bar-fill.failed {
      background: #ef4444;
    }

    .activity-list {
      padding: 0;
      margin: 0;
      list-style: none;
    }

    .activity-list li {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 10px;
      border-bottom: 1px solid #2d3440;
      font-size: 12px;
    }

    @media (max-width: 1100px) {
      .sdk-grid,
      .workspace.has-panels {
        grid-template-columns: 1fr;
      }

      .app-window.tile-right,
      .app-window.tile-bottom {
        grid-column: 1;
      }
    }

    @media (max-width: 640px) {
      .page-header,
      .header-actions,
      .app-card,
      .window-header,
      .window-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .map-summary,
      .status-row {
        grid-template-columns: 1fr;
      }
    }
    `,
  ],
})
export class AppsComponent implements OnInit {
  readonly manifests = BUILTIN_APP_MANIFESTS;
  readonly exampleAppId = EXAMPLE_HOST_MAP_APP.id;
  context: SwitchboardAppContext = {
    hosts: [],
    auditEvents: [],
    settings: null,
    generatedAt: new Date().toISOString(),
  };
  panels: AppPanel[] = [];
  isLoading = false;
  errorMessage = '';
  statusMessage = '';

  ngOnInit(): void {
    void this.loadContext();
  }

  get successfulHosts(): number {
    return this.context.hosts.filter((host) => host.lastConnectionStatus === 'success').length;
  }

  get failedHosts(): number {
    return this.context.hosts.filter((host) => host.lastConnectionStatus === 'failed').length;
  }

  async loadContext(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable. Run the app through Electron to load SDK context.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const [hosts, auditEvents, settings] = await Promise.all([
        api.host.list(),
        api.audit.list(),
        api.settings.get(),
      ]);
      this.context = {
        hosts,
        auditEvents,
        settings,
        generatedAt: new Date().toISOString(),
      };
      this.statusMessage = 'SDK context refreshed from local state.';
    } catch {
      this.errorMessage = 'Unable to load local SDK context.';
    } finally {
      this.isLoading = false;
    }
  }

  launchApp(manifest: SwitchboardAppManifest): void {
    const panel: AppPanel = {
      id: `${manifest.id}:${Date.now()}`,
      manifest,
      mode: manifest.defaultPanelMode,
    };
    this.panels = [...this.panels, panel];
    this.statusMessage = `${manifest.name} launched in the local workspace.`;
  }

  closePanel(panel: AppPanel): void {
    this.panels = this.panels.filter((item) => item.id !== panel.id);
  }

  setPanelMode(panel: AppPanel, mode: SwitchboardAppPanelMode): void {
    panel.mode = mode;
    this.panels = [...this.panels];
  }

  statusWidth(host: HostRecord): number {
    if (host.lastConnectionStatus === 'success') {
      return 100;
    }
    if (host.lastConnectionStatus === 'failed') {
      return 64;
    }
    if (host.lastConnectionStatus === 'stubbed') {
      return 42;
    }
    return 24;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  trackManifest(_index: number, manifest: SwitchboardAppManifest): string {
    return manifest.id;
  }

  trackPanel(_index: number, panel: AppPanel): string {
    return panel.id;
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  trackAudit(_index: number, event: AuditEvent): string {
    return event.id;
  }
}
