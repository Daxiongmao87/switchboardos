import { Component, OnInit } from '@angular/core';
import type { AuditEvent, HostRecord, MvpSettings } from '../../../shared/mvp-models';
import {
  EXAMPLE_HOST_MAP_APP,
  SWITCHBOARD_STANDARD_UI_PRIMITIVES,
  type SwitchboardAgentReadableState,
  type SwitchboardAppContext,
  type SwitchboardStatusBarItem,
  type SwitchboardStatusBarPrimitive,
  type SwitchboardTabItem,
  type SwitchboardTabPrimitive,
  type SwitchboardToolbarAction,
  type SwitchboardToolbarPrimitive,
} from '../app-sdk';
import { getSwitchboardApi } from '../switchboard-api';

interface HostMapNode {
  host: HostRecord;
  x: number;
  y: number;
  radius: number;
}

type HostMapTabId = 'overview' | 'activity';

@Component({
  selector: 'app-example-host-map',
  standalone: false,
  template: `
    <div
      class="page"
      data-testid="example-graphical-app"
      [attr.data-app-id]="manifest.appId"
      [attr.data-semantic-kind]="semanticState.summary"
      [attr.data-host-count]="context.hosts.length"
      [attr.data-action-count]="semanticState.availableActions.length"
    >
      <header class="page-header">
        <div>
          <h1>{{ manifest.name }}</h1>
          <p>{{ manifest.description }}</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">{{ manifest.category }} SDK app</span>
        </div>
      </header>

      <p class="notice">
        This is a graphical custom-app example running inside the trusted MVP App SDK surface. It reads host/audit context through typed SwitchboardOS APIs and exposes semantic state for the shell inspector.
      </p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <div
        class="sdk-toolbar"
        role="toolbar"
        [attr.aria-label]="toolbarPrimitive.semanticRole"
        [attr.data-testid]="toolbarPrimitive.dataTestId"
      >
        <button
          *ngFor="let action of toolbarPrimitive.actions; trackBy: trackToolbarAction"
          type="button"
          class="secondary-action toolbar-action"
          [disabled]="isToolbarActionDisabled(action)"
          [title]="action.description || action.label"
          (click)="runToolbarAction(action.id)"
        >
          {{ action.label }}
        </button>
      </div>

      <nav
        class="sdk-tab-strip"
        role="tablist"
        [attr.aria-label]="tabPrimitive.semanticRole"
        [attr.data-testid]="tabPrimitive.dataTestId"
      >
        <button
          *ngFor="let tab of tabPrimitive.tabs; trackBy: trackTab"
          type="button"
          role="tab"
          class="sdk-tab"
          [class.active]="tab.active"
          [disabled]="tab.disabled"
          [attr.aria-selected]="tab.active"
          (click)="setActiveTab(tab.id)"
        >
          <span>{{ tab.label }}</span>
          <span *ngIf="tab.badge" class="tab-badge">{{ tab.badge }}</span>
        </button>
      </nav>

      <section class="map-shell">
        <article class="graph-surface" aria-label="Host topology map">
          <svg viewBox="0 0 720 360" role="img" aria-label="Host status topology">
            <defs>
              <linearGradient id="host-map-link" x1="0" x2="1">
                <stop offset="0%" stop-color="#58b88f" stop-opacity="0.65" />
                <stop offset="100%" stop-color="#7aa2ff" stop-opacity="0.65" />
              </linearGradient>
            </defs>

            <line
              *ngFor="let node of nodes; trackBy: trackNode"
              x1="360"
              y1="180"
              [attr.x2]="node.x"
              [attr.y2]="node.y"
              class="map-link"
            ></line>
            <circle class="core-node" cx="360" cy="180" r="44"></circle>
            <text class="core-label" x="360" y="174" text-anchor="middle">SwitchboardOS</text>
            <text class="core-subtitle" x="360" y="194" text-anchor="middle">local runtime</text>

            <g
              *ngFor="let node of nodes; trackBy: trackNode"
              class="host-node"
              [attr.data-host-id]="node.host.id"
            >
              <circle
                [attr.cx]="node.x"
                [attr.cy]="node.y"
                [attr.r]="node.radius"
                [class.success]="node.host.lastConnectionStatus === 'success'"
                [class.failed]="node.host.lastConnectionStatus === 'failed'"
                [class.stubbed]="node.host.lastConnectionStatus === 'stubbed'"
              ></circle>
              <text [attr.x]="node.x" [attr.y]="node.y - 4" text-anchor="middle">{{ node.host.name }}</text>
              <text [attr.x]="node.x" [attr.y]="node.y + 14" text-anchor="middle">{{ node.host.lastConnectionStatus }}</text>
            </g>

            <g *ngIf="nodes.length === 0">
              <rect x="236" y="132" width="248" height="96" rx="7" class="empty-map"></rect>
              <text x="360" y="174" text-anchor="middle" class="empty-title">No host profiles</text>
              <text x="360" y="198" text-anchor="middle" class="empty-subtitle">Open Hosts to add inventory.</text>
            </g>
          </svg>
        </article>

        <aside class="inspector">
          <h2>Semantic state</h2>
          <dl>
            <div>
              <dt>Hosts</dt>
              <dd>{{ context.hosts.length }}</dd>
            </div>
            <div>
              <dt>Reachable</dt>
              <dd>{{ successfulHosts }}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{{ failedHosts }}</dd>
            </div>
            <div>
              <dt>Actions</dt>
              <dd>{{ actionLabels }}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <footer
        class="sdk-status-bar"
        [attr.aria-label]="statusBarPrimitive.semanticRole"
        [attr.data-testid]="statusBarPrimitive.dataTestId"
      >
        <div
          *ngFor="let item of statusBarPrimitive.items; trackBy: trackStatusItem"
          class="status-bar-item"
          [attr.data-tone]="item.tone || 'neutral'"
        >
          <span class="status-label">{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </footer>

      <section class="activity-strip" aria-label="Recent host activity">
        <article *ngFor="let event of recentAudit; trackBy: trackAudit">
          <strong>{{ event.type }}</strong>
          <span>{{ event.message }}</span>
          <time>{{ formatDate(event.createdAt) }}</time>
        </article>
        <article *ngIf="recentAudit.length === 0">
          <strong>No recent activity</strong>
          <span>Audit events will appear here as host and agent actions run.</span>
          <time>local only</time>
        </article>
      </section>
    </div>
  `,
  styles: [
    `
    .page {
      min-height: 100%;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      color: #e5e7eb;
    }

    .page-header,
    .header-actions,
    .map-shell,
    .activity-strip article {
      display: flex;
      gap: 12px;
      justify-content: space-between;
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
      font-size: 14px;
    }

    p,
    dt,
    time,
    .activity-strip span {
      color: #94a3b8;
      font-size: 12px;
    }

    .status-pill,
    .secondary-action,
    .sdk-tab {
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e5e7eb;
      min-height: 30px;
      font-size: 12px;
    }

    .status-pill {
      border-color: #166534;
      color: #bbf7d0;
      background: #102418;
      padding: 6px 9px;
      white-space: nowrap;
    }

    .secondary-action {
      background: #1f2937;
      padding: 6px 10px;
      cursor: pointer;
    }

    .secondary-action:disabled,
    .sdk-tab:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .sdk-toolbar,
    .sdk-tab-strip,
    .sdk-status-bar {
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #111827;
    }

    .sdk-toolbar,
    .sdk-tab-strip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
    }

    .sdk-toolbar {
      justify-content: flex-start;
    }

    .toolbar-action {
      min-width: 112px;
    }

    .sdk-tab-strip {
      padding: 4px;
    }

    .sdk-tab {
      min-height: 32px;
      background: transparent;
      padding: 6px 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .sdk-tab.active {
      background: #1f2937;
      border-color: #58b88f;
      color: #bbf7d0;
    }

    .tab-badge {
      border-radius: 999px;
      background: #263241;
      color: #bfdbfe;
      font-size: 11px;
      min-width: 20px;
      padding: 1px 6px;
      text-align: center;
    }

    .sdk-status-bar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 9px 10px;
    }

    .status-bar-item {
      min-width: 0;
      border-left: 2px solid #334155;
      padding-left: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .status-bar-item[data-tone="success"] {
      border-left-color: #22c55e;
    }

    .status-bar-item[data-tone="danger"] {
      border-left-color: #ef4444;
    }

    .status-bar-item[data-tone="info"] {
      border-left-color: #7aa2ff;
    }

    .status-label {
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
    }

    .status-bar-item strong {
      color: #f8fafc;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .notice,
    .graph-surface,
    .inspector,
    .activity-strip article {
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #151a22;
    }

    .notice {
      padding: 10px 12px;
      color: #bfdbfe;
      background: #111c33;
      border-color: #1d4ed8;
    }

    .notice.error {
      color: #fecaca;
      background: #2f1212;
      border-color: #991b1b;
    }

    .map-shell {
      align-items: stretch;
      min-height: 390px;
    }

    .graph-surface {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      background:
        linear-gradient(180deg, rgba(88, 184, 143, 0.08), rgba(122, 162, 255, 0.05)),
        #101318;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 360px;
    }

    .map-link {
      stroke: url(#host-map-link);
      stroke-width: 2;
    }

    .core-node,
    .empty-map {
      fill: #111827;
      stroke: #58b88f;
      stroke-width: 2;
    }

    .host-node circle {
      fill: #334155;
      stroke: #94a3b8;
      stroke-width: 2;
    }

    .host-node circle.success {
      fill: #14532d;
      stroke: #22c55e;
    }

    .host-node circle.failed {
      fill: #4c1717;
      stroke: #ef4444;
    }

    .host-node circle.stubbed {
      fill: #422006;
      stroke: #f59e0b;
    }

    text {
      fill: #e5e7eb;
      font-size: 12px;
      font-weight: 700;
      pointer-events: none;
    }

    .core-subtitle,
    .empty-subtitle,
    .host-node text:last-child {
      fill: #94a3b8;
      font-size: 11px;
      font-weight: 500;
    }

    .inspector {
      width: 250px;
      padding: 14px;
    }

    dl {
      margin: 12px 0 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    dd {
      margin: 3px 0 0;
      color: #f8fafc;
      overflow-wrap: anywhere;
    }

    .activity-strip {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .activity-strip article {
      padding: 10px;
      flex-direction: column;
      align-items: stretch;
      min-width: 0;
    }

    @media (max-width: 840px) {
      .page-header,
      .map-shell,
      .sdk-toolbar,
      .sdk-tab-strip {
        flex-direction: column;
      }

      .sdk-toolbar,
      .sdk-tab-strip {
        align-items: stretch;
      }

      .sdk-status-bar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .inspector {
        width: auto;
      }

      .activity-strip {
        grid-template-columns: 1fr;
      }
    }
    `,
  ],
})
export class ExampleHostMapComponent implements OnInit {
  readonly manifest = EXAMPLE_HOST_MAP_APP;
  activeTabId: HostMapTabId = 'overview';
  context: SwitchboardAppContext = {
    hosts: [],
    auditEvents: [],
    settings: null,
    generatedAt: new Date().toISOString(),
  };
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    void this.loadContext();
  }

  get nodes(): HostMapNode[] {
    const hosts = this.context.hosts.slice(0, 10);
    const centerX = 360;
    const centerY = 180;
    const radiusX = 250;
    const radiusY = 128;
    return hosts.map((host, index) => {
      const angle = hosts.length === 1 ? -Math.PI / 2 : (Math.PI * 2 * index) / hosts.length - Math.PI / 2;
      return {
        host,
        x: Math.round(centerX + Math.cos(angle) * radiusX),
        y: Math.round(centerY + Math.sin(angle) * radiusY),
        radius: 34,
      };
    });
  }

  get successfulHosts(): number {
    return this.context.hosts.filter((host) => host.lastConnectionStatus === 'success').length;
  }

  get failedHosts(): number {
    return this.context.hosts.filter((host) => host.lastConnectionStatus === 'failed').length;
  }

  get recentAudit(): AuditEvent[] {
    return this.context.auditEvents.slice(0, 4);
  }

  get tabPrimitive(): SwitchboardTabPrimitive {
    const base = this.standardUiPrimitive('tab-strip') as SwitchboardTabPrimitive;
    return {
      ...base,
      tabs: [
        {
          id: 'overview',
          label: 'Overview',
          active: this.activeTabId === 'overview',
        },
        {
          id: 'activity',
          label: 'Activity',
          active: this.activeTabId === 'activity',
          badge: String(this.recentAudit.length),
        },
      ],
    };
  }

  get toolbarPrimitive(): SwitchboardToolbarPrimitive {
    const base = this.standardUiPrimitive('toolbar') as SwitchboardToolbarPrimitive;
    return {
      ...base,
      actions: this.manifest.actionRegistry.map((action) => ({
        id: action.id,
        label: action.label,
        description: action.description,
        capability: action.capability,
      })),
    };
  }

  get statusBarPrimitive(): SwitchboardStatusBarPrimitive {
    const base = this.standardUiPrimitive('status-bar') as SwitchboardStatusBarPrimitive;
    return {
      ...base,
      items: [
        {
          id: 'hosts',
          label: 'Hosts',
          value: String(this.context.hosts.length),
          tone: 'info',
        },
        {
          id: 'reachable',
          label: 'Reachable',
          value: String(this.successfulHosts),
          tone: this.successfulHosts > 0 ? 'success' : 'neutral',
        },
        {
          id: 'failed',
          label: 'Failed',
          value: String(this.failedHosts),
          tone: this.failedHosts > 0 ? 'danger' : 'neutral',
        },
        {
          id: 'generated',
          label: 'Generated',
          value: this.formatDate(this.context.generatedAt),
          tone: 'neutral',
        },
      ],
    };
  }

  get semanticState(): SwitchboardAgentReadableState {
    return {
      appId: this.manifest.appId,
      summary: 'graphical-host-status-map',
      entities: this.context.hosts.map((host) => ({
        id: host.id,
        type: 'host',
        name: host.name,
        status: host.lastConnectionStatus,
        address: host.address || host.hostname,
      })),
      observations: [
        {
          kind: 'host-count',
          total: this.context.hosts.length,
          success: this.successfulHosts,
          failed: this.failedHosts,
        },
      ],
      availableActions: this.manifest.actionRegistry,
      riskHints: ['read-only graphical app', 'no command execution'],
    };
  }

  get actionLabels(): string {
    return this.semanticState.availableActions.map((action) => action.label).join(', ');
  }

  setActiveTab(tabId: string): void {
    if (tabId === 'overview' || tabId === 'activity') {
      this.activeTabId = tabId;
    }
  }

  isToolbarActionDisabled(action: SwitchboardToolbarAction): boolean {
    if (action.id === 'refresh-context') {
      return this.isLoading;
    }
    if (action.id === 'open-hosts') {
      return typeof getSwitchboardApi()?.window.navigate !== 'function';
    }
    return Boolean(action.disabled);
  }

  runToolbarAction(actionId: string): void {
    if (actionId === 'refresh-context') {
      void this.loadContext();
      return;
    }

    if (actionId === 'open-hosts') {
      getSwitchboardApi()?.window.navigate('/hosts');
    }
  }

  async loadContext(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable. Run through the Electron or hosted backend.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [hosts, auditEvents, settings] = await Promise.all([
        api.host.list(),
        api.audit.list(),
        api.settings.get(),
      ]);
      this.context = {
        hosts,
        auditEvents,
        settings: settings as MvpSettings,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      this.errorMessage = 'Unable to load graphical app context.';
    } finally {
      this.isLoading = false;
    }
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  trackNode(_index: number, node: HostMapNode): string {
    return node.host.id;
  }

  trackTab(_index: number, tab: SwitchboardTabItem): string {
    return tab.id;
  }

  trackToolbarAction(_index: number, action: SwitchboardToolbarAction): string {
    return action.id;
  }

  trackStatusItem(_index: number, item: SwitchboardStatusBarItem): string {
    return item.id;
  }

  trackAudit(_index: number, event: AuditEvent): string {
    return event.id;
  }

  private standardUiPrimitive(kind: 'tab-strip' | 'toolbar' | 'status-bar') {
    return SWITCHBOARD_STANDARD_UI_PRIMITIVES.find((primitive) => primitive.kind === kind);
  }
}
