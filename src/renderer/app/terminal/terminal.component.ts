import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Terminal } from '@xterm/xterm';
import type {
  AuditEvent,
  HostRecord,
  ShellWindowSemanticState,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalResizeResult,
  TerminalStatusEvent,
} from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

interface Disposable {
  dispose: () => void;
}

type PendingTerminalEvent =
  | { kind: 'output'; event: TerminalOutputEvent }
  | { kind: 'status'; event: TerminalStatusEvent }
  | { kind: 'exit'; event: TerminalExitEvent };

type TerminalShellCommand = 'copy' | 'paste' | 'clear';
type TerminalSessionAction = TerminalShellCommand | 'disconnect' | 'reconnect' | 'resize' | 'audit';

interface TerminalShellCommandEventDetail {
  windowId?: string;
  action?: TerminalSessionAction;
}

interface TerminalAuditSummary {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  sessionId: string | null;
  hostId: string | null;
  resultStatus: string | null;
  success: string | null;
  size: string | null;
  auditSafe: boolean;
}

interface TerminalActionState {
  id: TerminalSessionAction;
  label: string;
  disabled: boolean;
  disabledReason: string | null;
}

const TERMINAL_SESSION_ACTIONS: TerminalSessionAction[] = [
  'copy',
  'paste',
  'clear',
  'disconnect',
  'reconnect',
  'resize',
  'audit',
];

@Component({
  selector: 'app-terminal',
  standalone: false,
  template: `
    <div
      class="page"
      data-testid="terminal-runtime"
      [attr.data-host-context-id]="hostContextId || null"
      [attr.data-selected-host-id]="selectedHostId || null"
      [attr.data-host-context-locked]="hostContextLocked ? 'true' : 'false'"
      [attr.data-active-session-id]="activeSessionId || null"
      [attr.data-terminal-session-object]="'true'"
      [attr.data-terminal-object-id]="terminalObjectId"
      [attr.data-terminal-ssh-target]="sshTargetLabel"
      [attr.data-terminal-working-directory]="remoteWorkingDirectoryLabel"
      [attr.data-terminal-working-directory-state]="remoteWorkingDirectoryState"
      [attr.data-terminal-connection-state]="connectionStateLabel"
      [attr.data-terminal-lifecycle-state]="sessionLifecycleState"
      [attr.data-terminal-action-ids]="terminalActionIdsLabel"
      [attr.data-terminal-last-action]="lastSessionActionId || null"
      [attr.data-terminal-audit-safe]="'true'"
      [attr.data-terminal-local-storage]="terminalLocalStorageState"
      [attr.data-terminal-event-count]="consumedTerminalEventCount"
      [attr.data-terminal-last-event-session-id]="lastTerminalEventSessionId || null"
      [attr.data-terminal-last-event-kind]="lastTerminalEventKind || null"
      [attr.data-terminal-last-event-at]="lastTerminalEventAt || null"
      [attr.data-terminal-last-event-message]="lastTerminalEventMessage || null"
    >
      <header class="page-header">
        <div>
          <h1>Terminal</h1>
          <p>{{ hostContextLocked ? 'Host-scoped SSH session foundation using local system ssh.' : 'Real SSH session foundation using local system ssh.' }}</p>
        </div>
        <div class="header-actions">
          <span class="status-pill" [class.is-active]="activeSessionId">
            {{ sessionLabel }}
          </span>
          <button type="button" class="secondary-action" (click)="loadHosts()" [disabled]="isLoading || isSessionActive">
            Refresh hosts
          </button>
        </div>
      </header>

      <p class="notice">
        MVP terminal starts <code>ssh</code> with <code>BatchMode=yes</code>. It uses existing local ssh-agent or key files only.
        Password prompts, stored secrets, keychain integration, and hosted terminal mode are not handled here.
      </p>
      <p *ngIf="hostContextLocked" class="notice host-context">
        Host context is locked by the shell window: <strong>{{ hostContextTitle || selectedHost?.name || hostContextId }}</strong>.
        The selector is disabled so session start and input operate against that host only.
      </p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="terminal-layout">
        <aside class="panel context-panel">
          <div class="panel-heading">
            <h2>Session target</h2>
            <span>{{ hosts.length }} hosts</span>
          </div>

          <label class="host-select">
            Host
            <select
              name="selectedHostId"
              data-testid="terminal-host-select"
              [(ngModel)]="selectedHostId"
              (ngModelChange)="selectHost($event)"
              [disabled]="hostContextLocked || isLoading || isSessionActive || hosts.length === 0"
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
              <dt>SSH target</dt>
              <dd>{{ sshTargetLabel }}</dd>
            </div>
            <div>
              <dt>Working directory</dt>
              <dd data-testid="terminal-working-directory" [attr.data-state]="remoteWorkingDirectoryState">
                {{ remoteWorkingDirectoryLabel }}
              </dd>
            </div>
            <div>
              <dt>Default shell</dt>
              <dd data-testid="terminal-default-shell">{{ defaultShellLabel }}</dd>
            </div>
            <div>
              <dt>Reachability</dt>
              <dd data-testid="terminal-reachability">{{ reachabilityLabel }}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{{ selectedLastCheckedLabel }}</dd>
            </div>
            <div>
              <dt>Connection state</dt>
              <dd data-testid="terminal-connection-state">{{ connectionStateLabel }}</dd>
            </div>
            <div>
              <dt>Session lifecycle</dt>
              <dd data-testid="terminal-lifecycle-state">{{ sessionLifecycleLabel }}</dd>
            </div>
            <div>
              <dt>Active session</dt>
              <dd data-testid="terminal-active-session-id">{{ activeSessionDisplayId }}</dd>
            </div>
            <div>
              <dt>Resize</dt>
              <dd data-testid="terminal-size-state">{{ terminalSizeLabel }}. {{ resizeStatusMessage }}</dd>
            </div>
            <div>
              <dt>Last event</dt>
              <dd data-testid="terminal-last-event-state">{{ lastTerminalEventLabel }}</dd>
            </div>
            <div>
              <dt>Recent audit</dt>
              <dd data-testid="terminal-recent-audit-state">{{ recentAuditLabel }}</dd>
            </div>
          </dl>

          <div class="control-stack">
            <button
              type="button"
              class="primary-action"
              data-testid="terminal-start-session"
              (click)="startSession()"
              [disabled]="!selectedHost || isStarting || isSessionActive"
            >
              Start session
            </button>
            <button
              type="button"
              class="danger-action"
              (click)="stopSession()"
              [disabled]="!isSessionActive || isStopping"
            >
              Stop session
            </button>
          </div>

          <section class="session-actions" aria-label="Terminal session actions">
            <div class="panel-heading">
              <h2>Session actions</h2>
              <span data-testid="terminal-action-status">{{ actionStatusMessage }}</span>
            </div>
            <div class="action-grid">
              <button
                type="button"
                data-testid="terminal-action-copy"
                [disabled]="copyActionDisabled"
                [title]="copyDisabledReason || 'Copy selected terminal text.'"
                [attr.data-disabled-reason]="copyDisabledReason || null"
                (click)="runVisibleShellCommand('copy')"
              >
                Copy
              </button>
              <button
                type="button"
                data-testid="terminal-action-paste"
                [disabled]="pasteActionDisabled"
                [title]="pasteDisabledReason || 'Paste clipboard text into the active session.'"
                [attr.data-disabled-reason]="pasteDisabledReason || null"
                (click)="runVisibleShellCommand('paste')"
              >
                Paste
              </button>
              <button
                type="button"
                data-testid="terminal-action-clear"
                [disabled]="clearActionDisabled"
                [title]="clearDisabledReason || 'Clear the visible terminal buffer.'"
                [attr.data-disabled-reason]="clearDisabledReason || null"
                (click)="runVisibleShellCommand('clear')"
              >
                Clear
              </button>
              <button
                type="button"
                class="danger-action"
                data-testid="terminal-action-disconnect"
                [disabled]="disconnectActionDisabled"
                [title]="disconnectDisabledReason || 'Disconnect the active terminal session.'"
                [attr.data-disabled-reason]="disconnectDisabledReason || null"
                (click)="disconnectSession()"
              >
                Disconnect
              </button>
              <button
                type="button"
                data-testid="terminal-action-reconnect"
                [disabled]="reconnectActionDisabled"
                [title]="reconnectDisabledReason || 'Start a new session for the selected host.'"
                [attr.data-disabled-reason]="reconnectDisabledReason || null"
                (click)="reconnectSession()"
              >
                Reconnect
              </button>
              <button
                type="button"
                data-testid="terminal-action-resize"
                [disabled]="resizeActionDisabled"
                [title]="resizeDisabledReason || 'Sync the current xterm size with the terminal session.'"
                [attr.data-disabled-reason]="resizeDisabledReason || null"
                (click)="syncResizeFromAction()"
              >
                Resize
              </button>
              <button
                type="button"
                data-testid="terminal-action-audit"
                [disabled]="auditActionDisabled"
                [title]="auditDisabledReason || 'Refresh sanitized terminal lifecycle audit state.'"
                [attr.data-disabled-reason]="auditDisabledReason || null"
                (click)="refreshTerminalAuditFromAction()"
              >
                Audit
              </button>
            </div>
          </section>

          <section
            class="audit-panel"
            data-testid="terminal-audit-state"
            [attr.data-audit-safe]="'true'"
            [attr.data-audit-last-refreshed-at]="auditLastRefreshedAt || null"
          >
            <div class="panel-heading">
              <h2>Sanitized audit</h2>
              <span>{{ auditStatusMessage }}</span>
            </div>
            <ol class="audit-list" *ngIf="terminalAuditEntries.length > 0; else noTerminalAudit">
              <li
                *ngFor="let event of terminalAuditEntries; trackBy: trackAudit"
                data-testid="terminal-audit-entry"
                [attr.data-audit-type]="event.type"
                [attr.data-audit-session-id]="event.sessionId || null"
                [attr.data-audit-host-id]="event.hostId || null"
                [attr.data-audit-safe]="event.auditSafe ? 'true' : 'false'"
              >
                <strong>{{ event.type }}</strong>
                <span>{{ formatDate(event.createdAt) }}</span>
                <p>{{ event.message }}</p>
                <small>
                  Session {{ event.sessionId || 'unknown' }} | Host {{ event.hostId || 'unknown' }} |
                  Result {{ event.resultStatus || event.success || 'recorded' }} | {{ event.size || 'size n/a' }}
                </small>
              </li>
            </ol>
            <ng-template #noTerminalAudit>
              <p class="empty-state">No terminal lifecycle audit events have been loaded for this session or host.</p>
            </ng-template>
          </section>
        </aside>

        <article class="panel terminal-panel">
          <div class="terminal-toolbar">
            <span>{{ isSessionActive ? 'xterm attached to active ssh process' : 'xterm idle' }}</span>
            <span>{{ terminalSizeLabel }}</span>
          </div>
          <div
            #terminalHost
            class="terminal-host"
            [class.is-disabled]="!isSessionActive"
            aria-label="xterm terminal output and input"
          ></div>
          <div class="terminal-footer">
            <span class="prompt">$</span>
            <span>
              {{ isSessionActive ? 'Keyboard input streams through xterm to system ssh.' : 'Start a session to enable xterm keyboard input.' }}
            </span>
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

    code {
      color: #bfdbfe;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 12px;
    }

    p,
    dt,
    .panel-heading span,
    label {
      color: #94a3b8;
      font-size: 12px;
    }

    .header-actions,
    .panel-heading,
    .terminal-toolbar,
    .terminal-footer {
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

    .status-pill.is-active {
      border-color: #166534;
      color: #bbf7d0;
      background: #052e16;
    }

    .terminal-layout {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      gap: 12px;
      min-height: 500px;
      flex: 1;
    }

    .panel {
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
      padding: 16px;
    }

    .host-select,
    .control-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 14px 0;
    }

    .session-actions,
    .audit-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 16px;
      border-top: 1px solid #2d3440;
      padding-top: 14px;
    }

    .session-actions .panel-heading,
    .audit-panel .panel-heading {
      align-items: flex-start;
    }

    .session-actions .panel-heading span,
    .audit-panel .panel-heading span {
      max-width: 170px;
      text-align: right;
      overflow-wrap: anywhere;
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
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

    .terminal-toolbar,
    .terminal-footer {
      min-height: 38px;
      padding: 8px 12px;
      border-bottom: 1px solid #2d3440;
      color: #94a3b8;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 12px;
    }

    .terminal-footer {
      justify-content: flex-start;
      border-top: 1px solid #2d3440;
      border-bottom: 0;
    }

    .terminal-host {
      flex: 1;
      min-height: 0;
      position: relative;
      overflow: auto;
      background: #090b10;
    }

    .terminal-host.is-disabled {
      cursor: default;
    }

    :host ::ng-deep .terminal-host .xterm {
      height: 100%;
      padding: 12px;
    }

    .prompt {
      color: #22c55e;
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

    button {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1f2937;
      color: #e5e7eb;
      padding: 7px 10px;
      min-height: 32px;
      font-size: 12px;
      cursor: pointer;
    }

    button:disabled,
    select:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .primary-action {
      background: #1d4ed8;
      border-color: #2563eb;
    }

    .danger-action {
      background: #7f1d1d;
      border-color: #991b1b;
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

    .notice.host-context {
      border-color: #166534;
      background: #052e16;
      color: #bbf7d0;
    }

    .audit-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .audit-list li {
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #101318;
      padding: 9px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .audit-list strong,
    .audit-list p,
    .audit-list small,
    .empty-state {
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .audit-list strong {
      color: #e5e7eb;
    }

    .audit-list p {
      color: #cbd5e1;
    }

    .audit-list small,
    .empty-state {
      color: #94a3b8;
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
export class TerminalComponent implements AfterViewInit, OnChanges, OnDestroy, OnInit {
  @Input() shellWindowId: string | null = null;
  @Input() hostContextId: string | null = null;
  @Input() hostContextTitle = '';
  @Input() hostContextLocked = false;

  @ViewChild('terminalHost') private terminalHost?: ElementRef<HTMLDivElement>;

  hosts: HostRecord[] = [];
  selectedHostId = '';
  isLoading = false;
  isStarting = false;
  isStopping = false;
  errorMessage = '';
  activeSessionId: string | null = null;
  sessionStatus = 'Disconnected';
  terminalSizeLabel = '100 x 30';
  consumedTerminalEventCount = 0;
  lastTerminalEventSessionId = '';
  lastTerminalEventKind = '';
  lastTerminalEventAt = '';
  lastTerminalEventMessage = '';
  lastLifecycleSessionId = '';
  lastSessionHostId = '';
  lastSessionActionId: TerminalSessionAction | '' = '';
  actionStatusMessage = 'No terminal action has run.';
  resizeStatusMessage = 'Resize sync is idle.';
  auditStatusMessage = 'Audit state has not been loaded.';
  auditLastRefreshedAt = '';
  terminalAuditEntries: TerminalAuditSummary[] = [];

  private readonly unsubscribeCallbacks: Array<() => void> = [];
  private pendingStartEvents: PendingTerminalEvent[] = [];
  private pendingStartHostId: string | null = null;
  private xterm: Terminal | null = null;
  private xtermDataDisposable: Disposable | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.registerTerminalEvents();
    void this.loadHosts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['hostContextId'] || changes['hostContextLocked']) {
      this.applyHostContextSelection();
    }
  }

  ngAfterViewInit(): void {
    this.createTerminal();
  }

  ngOnDestroy(): void {
    const sessionId = this.activeSessionId;
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks.length = 0;
    this.xtermDataDisposable?.dispose();
    this.xtermDataDisposable = null;
    this.xterm?.dispose();
    this.xterm = null;

    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }

    if (sessionId) {
      const api = getSwitchboardApi();
      void api?.terminal.stop(sessionId);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleTerminalResize();
  }

  @HostListener('window:switchboard-terminal-command', ['$event'])
  handleShellCommand(event: CustomEvent<TerminalShellCommandEventDetail>): void {
    const detail = event.detail;
    if (!detail || detail.windowId !== this.shellWindowId || !this.isTerminalSessionAction(detail.action)) {
      return;
    }

    void this.runSessionAction(detail.action);
  }

  get selectedHost(): HostRecord | null {
    return this.hosts.find((host) => host.id === this.selectedHostId) ?? null;
  }

  get selectedHostAddress(): string {
    const host = this.selectedHost;
    return host ? host.address || host.hostname : 'None';
  }

  get sshTargetLabel(): string {
    const host = this.selectedHost;
    if (!host) {
      return 'No target';
    }

    const userPrefix = host.username ? `${host.username}@` : '';
    return `${userPrefix}${host.address || host.hostname}:${host.port}`;
  }

  get selectedLastCheckedLabel(): string {
    const lastCheckedAt = this.selectedHost?.lastCheckedAt;
    return lastCheckedAt ? this.formatDate(lastCheckedAt) : 'Never';
  }

  get isSessionActive(): boolean {
    return this.activeSessionId !== null;
  }

  get sessionLabel(): string {
    return this.activeSessionId ? this.sessionStatus : 'No active session';
  }

  get terminalObjectId(): string {
    if (this.activeSessionId) {
      return `terminal-session:${this.activeSessionId}`;
    }
    if (this.lastLifecycleSessionId) {
      return `terminal-session:${this.lastLifecycleSessionId}`;
    }
    return `terminal-window:${this.shellWindowId || 'unbound'}`;
  }

  get remoteWorkingDirectoryLabel(): string {
    const workingDirectory = this.selectedHost?.defaultWorkingDirectory?.trim();
    return workingDirectory || 'Unknown: host has no default working directory configured.';
  }

  get remoteWorkingDirectoryState(): 'configured' | 'unknown' {
    return this.selectedHost?.defaultWorkingDirectory?.trim() ? 'configured' : 'unknown';
  }

  get defaultShellLabel(): string {
    return this.selectedHost?.defaultShell?.trim() || 'Unknown';
  }

  get reachabilityLabel(): string {
    return this.selectedHost ? this.statusLabel(this.selectedHost.lastConnectionStatus) : 'No host selected';
  }

  get sessionLifecycleState(): string {
    if (this.isStarting) {
      return 'starting';
    }
    if (this.isStopping) {
      return 'stopping';
    }
    if (this.activeSessionId) {
      return this.normalizedSessionStatus();
    }
    if (this.lastLifecycleSessionId) {
      return this.normalizedSessionStatus() === 'disconnected' ? 'ended' : this.normalizedSessionStatus();
    }
    return 'idle';
  }

  get sessionLifecycleLabel(): string {
    const sessionId = this.activeSessionId || this.lastLifecycleSessionId;
    if (sessionId) {
      return `${this.sessionLifecycleState} (${sessionId})`;
    }
    return 'Idle: no terminal session has been started.';
  }

  get activeSessionDisplayId(): string {
    return this.activeSessionId || this.lastLifecycleSessionId || 'No active session';
  }

  get connectionStateLabel(): string {
    if (!this.selectedHost) {
      return 'No host selected';
    }
    if (this.activeSessionId) {
      return `Session ${this.normalizedSessionStatus()} for ${this.selectedHost.name}`;
    }
    if (this.isStarting) {
      return `Starting session for ${this.selectedHost.name}`;
    }
    if (this.isStopping) {
      return `Stopping session for ${this.selectedHost.name}`;
    }
    return `${this.reachabilityLabel}; no active session`;
  }

  get lastTerminalEventLabel(): string {
    if (!this.lastTerminalEventKind) {
      return 'No terminal events consumed.';
    }

    const timestamp = this.lastTerminalEventAt ? this.formatDate(this.lastTerminalEventAt) : 'time unknown';
    const message = this.lastTerminalEventMessage || 'No event message.';
    return `${this.lastTerminalEventKind} for ${this.lastTerminalEventSessionId || 'unknown session'} at ${timestamp}: ${message}`;
  }

  get recentAuditLabel(): string {
    const event = this.terminalAuditEntries[0];
    if (!event) {
      return this.auditStatusMessage;
    }
    return `${event.type} at ${this.formatDate(event.createdAt)} for ${event.sessionId || event.hostId || 'terminal'}`;
  }

  get terminalActionIdsLabel(): string {
    return TERMINAL_SESSION_ACTIONS.join(',');
  }

  get terminalLocalStorageState(): string {
    return 'none';
  }

  get copyDisabledReason(): string | null {
    return this.xterm ? null : 'Terminal renderer is not ready.';
  }

  get pasteDisabledReason(): string | null {
    if (!this.xterm) {
      return 'Terminal renderer is not ready.';
    }
    if (!this.activeSessionId) {
      return 'Start a terminal session before pasting.';
    }
    if (this.isStopping) {
      return 'Session is stopping.';
    }
    return null;
  }

  get clearDisabledReason(): string | null {
    return this.xterm ? null : 'Terminal renderer is not ready.';
  }

  get disconnectDisabledReason(): string | null {
    if (!this.activeSessionId) {
      return 'No active terminal session to disconnect.';
    }
    if (this.isStopping) {
      return 'Session disconnect is already in progress.';
    }
    return null;
  }

  get reconnectDisabledReason(): string | null {
    if (!this.selectedHost) {
      return 'Select a host before reconnecting.';
    }
    if (this.activeSessionId) {
      return 'Disconnect the active session before reconnecting.';
    }
    if (this.isStarting) {
      return 'Session start is already in progress.';
    }
    return null;
  }

  get resizeDisabledReason(): string | null {
    if (!this.xterm) {
      return 'Terminal renderer is not ready.';
    }
    if (!this.activeSessionId) {
      return 'Start a terminal session before syncing size.';
    }
    if (this.isStopping) {
      return 'Session is stopping.';
    }
    return null;
  }

  get auditDisabledReason(): string | null {
    return getSwitchboardApi()?.audit?.list ? null : 'Audit API is unavailable.';
  }

  get copyActionDisabled(): boolean {
    return this.copyDisabledReason !== null;
  }

  get pasteActionDisabled(): boolean {
    return this.pasteDisabledReason !== null;
  }

  get clearActionDisabled(): boolean {
    return this.clearDisabledReason !== null;
  }

  get disconnectActionDisabled(): boolean {
    return this.disconnectDisabledReason !== null;
  }

  get reconnectActionDisabled(): boolean {
    return this.reconnectDisabledReason !== null;
  }

  get resizeActionDisabled(): boolean {
    return this.resizeDisabledReason !== null;
  }

  get auditActionDisabled(): boolean {
    return this.auditDisabledReason !== null;
  }

  async loadHosts(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Host API is unavailable. Run the app through Electron to start terminal sessions.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.hosts = await api.host.list();
      this.applyHostContextSelection();
      if (!this.hostContextLocked && this.selectedHostId && !this.hosts.some((host) => host.id === this.selectedHostId)) {
        this.selectedHostId = '';
      }
      this.emitSemanticState();
    } catch {
      this.errorMessage = 'Unable to load hosts from the local MVP store.';
    } finally {
      this.isLoading = false;
    }
  }

  selectHost(hostId: string): void {
    if (this.hostContextLocked && this.hostContextId && hostId !== this.hostContextId) {
      this.selectedHostId = this.hostContextId;
      return;
    }

    this.selectedHostId = hostId;
    this.errorMessage = '';
    this.emitSemanticState();
  }

  async runVisibleShellCommand(action: TerminalShellCommand): Promise<void> {
    await this.runSessionAction(action);
  }

  async disconnectSession(): Promise<void> {
    const disabledReason = this.disconnectDisabledReason;
    this.lastSessionActionId = 'disconnect';
    if (disabledReason) {
      this.actionStatusMessage = disabledReason;
      this.emitSemanticState();
      return;
    }

    this.actionStatusMessage = 'Disconnect requested for active terminal session.';
    this.emitSemanticState();
    await this.stopSession();
  }

  async reconnectSession(): Promise<void> {
    const disabledReason = this.reconnectDisabledReason;
    this.lastSessionActionId = 'reconnect';
    if (disabledReason) {
      this.actionStatusMessage = disabledReason;
      this.emitSemanticState();
      return;
    }

    this.actionStatusMessage = `Reconnect requested for ${this.selectedHost?.name ?? 'selected host'}.`;
    this.emitSemanticState();
    await this.startSession();
  }

  async syncResizeFromAction(): Promise<void> {
    const disabledReason = this.resizeDisabledReason;
    this.lastSessionActionId = 'resize';
    if (disabledReason) {
      this.actionStatusMessage = disabledReason;
      this.resizeStatusMessage = disabledReason;
      this.emitSemanticState();
      return;
    }

    this.resizeXtermToContainer();
    const result = await this.syncBackendResize(true);
    if (result?.success) {
      this.actionStatusMessage = `Resize synced to ${result.cols} x ${result.rows}.`;
      this.resizeStatusMessage = result.message;
    } else if (result) {
      this.actionStatusMessage = result.message;
      this.resizeStatusMessage = result.message;
    }
    this.emitSemanticState();
  }

  async refreshTerminalAuditFromAction(): Promise<void> {
    this.lastSessionActionId = 'audit';
    await this.refreshTerminalAudit();
  }

  async startSession(): Promise<void> {
    const api = getSwitchboardApi();
    const host = this.selectedHost;
    if (!api || !host) {
      this.errorMessage = 'Select a host before starting a terminal session.';
      return;
    }

    this.isStarting = true;
    this.pendingStartHostId = host.id;
    this.pendingStartEvents = [];
    this.errorMessage = '';
    this.lastSessionActionId = this.lastSessionActionId === 'reconnect' ? 'reconnect' : '';
    this.actionStatusMessage = `Starting terminal session for ${host.name}.`;
    this.lastSessionHostId = host.id;
    this.xterm?.clear();
    this.appendSystemOutput(`Starting session for ${host.name}...\n`);
    this.emitSemanticState();

    try {
      const result = await api.terminal.start(host.id);
      if (result.status === 'failed' || !result.sessionId) {
        this.activeSessionId = null;
        this.pendingStartEvents = [];
        this.sessionStatus = 'Failed';
        this.lastTerminalEventKind = 'status';
        this.lastTerminalEventAt = new Date().toISOString();
        this.lastTerminalEventMessage = result.message;
        this.actionStatusMessage = result.message;
        this.appendSystemOutput(`${result.message}\n`);
        this.errorMessage = result.message;
        this.emitSemanticState();
        void this.refreshTerminalAudit();
        return;
      }

      this.activeSessionId = result.sessionId;
      this.lastLifecycleSessionId = result.sessionId;
      this.lastSessionHostId = host.id;
      this.sessionStatus = 'Starting';
      this.lastTerminalEventKind = 'status';
      this.lastTerminalEventSessionId = result.sessionId;
      this.lastTerminalEventAt = new Date().toISOString();
      this.lastTerminalEventMessage = result.message;
      this.actionStatusMessage = result.message;
      this.emitSemanticState();
      this.replayPendingStartEvents(result.sessionId);
      this.appendSystemOutput(`${result.message}\n`);
      this.xterm?.focus();
      await this.syncBackendResize();
      void this.refreshTerminalAudit();
    } catch {
      this.activeSessionId = null;
      this.pendingStartEvents = [];
      this.sessionStatus = 'Failed';
      this.errorMessage = 'Unable to start terminal session.';
      this.lastTerminalEventKind = 'status';
      this.lastTerminalEventAt = new Date().toISOString();
      this.lastTerminalEventMessage = this.errorMessage;
      this.actionStatusMessage = this.errorMessage;
      this.appendSystemOutput('Unable to start terminal session.\n');
      this.emitSemanticState();
      void this.refreshTerminalAudit();
    } finally {
      this.pendingStartHostId = null;
      this.pendingStartEvents = [];
      this.isStarting = false;
      this.emitSemanticState();
    }
  }

  async stopSession(): Promise<void> {
    const api = getSwitchboardApi();
    const sessionId = this.activeSessionId;
    if (!api || !sessionId) {
      return;
    }

    this.isStopping = true;
    this.lastLifecycleSessionId = sessionId;
    this.lastSessionActionId = this.lastSessionActionId || 'disconnect';
    this.actionStatusMessage = `Stop requested for terminal session ${sessionId}.`;
    this.appendSystemOutput('Stopping session...\n');
    this.emitSemanticState();
    try {
      const result = await api.terminal.stop(sessionId);
      if (!result.success) {
        this.errorMessage = result.message;
      }
      this.actionStatusMessage = result.message;
      this.appendSystemOutput(`${result.message}\n`);
      void this.refreshTerminalAudit();
    } catch {
      this.errorMessage = 'Unable to stop terminal session.';
      this.actionStatusMessage = this.errorMessage;
      this.appendSystemOutput('Unable to stop terminal session.\n');
      this.isStopping = false;
      this.emitSemanticState();
      void this.refreshTerminalAudit();
    }
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  trackAudit(_index: number, event: TerminalAuditSummary): string {
    return event.id;
  }

  statusLabel(status: HostRecord['lastConnectionStatus']): string {
    switch (status) {
      case 'success':
        return 'Reachable';
      case 'failed':
        return 'Failed';
      case 'stubbed':
        return 'Stubbed legacy check';
      default:
        return 'Untested';
    }
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private createTerminal(): void {
    if (!this.terminalHost || this.xterm) {
      return;
    }

    this.xterm = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1.15,
      scrollback: 5000,
      theme: {
        background: '#090b10',
        foreground: '#d1d5db',
        cursor: '#bfdbfe',
        selectionBackground: '#1d4ed8',
        black: '#111827',
        blue: '#60a5fa',
        cyan: '#67e8f9',
        green: '#22c55e',
        magenta: '#c084fc',
        red: '#f87171',
        white: '#e5e7eb',
        yellow: '#facc15',
      },
    });

    this.xterm.open(this.terminalHost.nativeElement);
    this.xtermDataDisposable = this.xterm.onData((data) => {
      void this.writeTerminalData(data);
    });
    this.resizeXtermToContainer();
    this.appendSystemOutput('Select a host and start a session. Output from system ssh will render here.\n');
  }

  private applyHostContextSelection(): void {
    if (!this.hostContextLocked || !this.hostContextId) {
      return;
    }

    this.selectedHostId = this.hostContextId;
    this.errorMessage = '';
  }

  private async writeTerminalData(data: string): Promise<void> {
    const api = getSwitchboardApi();
    const sessionId = this.activeSessionId;
    if (!api || !sessionId || this.isStopping) {
      return;
    }

    try {
      const input = data.replace(/\r/g, '\n');
      const result = await api.terminal.write(sessionId, input);
      if (!result.success) {
        this.errorMessage = result.message;
        this.appendSystemOutput(`${result.message}\n`);
      }
    } catch {
      this.errorMessage = 'Unable to write input to terminal session.';
      this.appendSystemOutput('Unable to write input to terminal session.\n');
    }
  }

  private async runShellCommand(action: TerminalShellCommand): Promise<void> {
    this.lastSessionActionId = action;
    switch (action) {
      case 'copy':
        await this.copySelectionToClipboard();
        break;
      case 'paste':
        await this.pasteClipboardToSession();
        break;
      case 'clear':
        this.clearTerminalView();
        break;
    }
    this.emitSemanticState();
  }

  private async runSessionAction(action: TerminalSessionAction): Promise<void> {
    switch (action) {
      case 'copy':
      case 'paste':
      case 'clear':
        await this.runShellCommand(action);
        return;
      case 'disconnect':
        await this.disconnectSession();
        return;
      case 'reconnect':
        await this.reconnectSession();
        return;
      case 'resize':
        await this.syncResizeFromAction();
        return;
      case 'audit':
        await this.refreshTerminalAuditFromAction();
        return;
    }
  }

  private isTerminalSessionAction(action: unknown): action is TerminalSessionAction {
    return TERMINAL_SESSION_ACTIONS.includes(action as TerminalSessionAction);
  }

  private async copySelectionToClipboard(): Promise<void> {
    const selection = this.xterm?.getSelection() ?? '';
    if (!selection) {
      this.actionStatusMessage = 'Copy did not run: no terminal selection.';
      this.appendSystemOutput('No terminal selection to copy.\n');
      return;
    }
    if (!navigator.clipboard?.writeText) {
      this.actionStatusMessage = 'Copy unavailable: clipboard write API is unavailable.';
      this.appendSystemOutput('Clipboard write is unavailable in this renderer.\n');
      return;
    }

    try {
      await navigator.clipboard.writeText(selection);
      this.actionStatusMessage = 'Copied selected terminal text.';
      this.appendSystemOutput('Copied terminal selection.\n');
    } catch {
      this.actionStatusMessage = 'Copy failed: clipboard write was rejected.';
      this.appendSystemOutput('Unable to copy terminal selection to clipboard.\n');
    }
  }

  private async pasteClipboardToSession(): Promise<void> {
    if (!this.activeSessionId) {
      this.actionStatusMessage = 'Paste unavailable: start a session first.';
      this.appendSystemOutput('Start a session before pasting clipboard text.\n');
      return;
    }
    if (!navigator.clipboard?.readText) {
      this.actionStatusMessage = 'Paste unavailable: clipboard read API is unavailable.';
      this.appendSystemOutput('Clipboard read is unavailable in this renderer.\n');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        this.actionStatusMessage = 'Paste did not run: clipboard is empty.';
        this.appendSystemOutput('Clipboard is empty.\n');
        return;
      }
      await this.writeTerminalData(text);
      this.actionStatusMessage = 'Pasted clipboard text into the active terminal session.';
      this.xterm?.focus();
    } catch {
      this.actionStatusMessage = 'Paste failed: clipboard read or terminal write was rejected.';
      this.appendSystemOutput('Unable to paste clipboard text into terminal session.\n');
    }
  }

  private clearTerminalView(): void {
    if (!this.xterm) {
      this.actionStatusMessage = 'Clear unavailable: terminal renderer is not ready.';
      return;
    }

    this.xterm.clear();
    this.xterm.focus();
    this.actionStatusMessage = 'Cleared terminal view.';
  }

  private registerTerminalEvents(): void {
    const api = getSwitchboardApi();
    if (!api) {
      return;
    }

    this.unsubscribeCallbacks.push(
      api.terminal.onOutput((event) => this.handleOutputEvent(event)),
      api.terminal.onStatus((event) => this.handleStatusEvent(event)),
      api.terminal.onExit((event) => this.handleExitEvent(event)),
    );
  }

  private handleOutputEvent(event: TerminalOutputEvent): void {
    if (!this.isCurrentSession(event.sessionId)) {
      this.bufferPendingStartEvent({ kind: 'output', event });
      return;
    }

    this.recordConsumedTerminalEvent('output', event.sessionId, event.createdAt, `${event.stream} output event received.`);
    this.writeOutput(event);
  }

  private handleStatusEvent(event: TerminalStatusEvent): void {
    if (!this.isCurrentSession(event.sessionId)) {
      this.bufferPendingStartEvent({ kind: 'status', event });
      return;
    }

    this.recordConsumedTerminalEvent('status', event.sessionId, event.createdAt, event.message);
    this.lastLifecycleSessionId = event.sessionId;
    this.lastSessionHostId = event.hostId;
    this.sessionStatus = event.status;
    this.appendSystemOutput(`${event.message}\n`);
    this.emitSemanticState();
  }

  private handleExitEvent(event: TerminalExitEvent): void {
    if (!this.isCurrentSession(event.sessionId)) {
      this.bufferPendingStartEvent({ kind: 'exit', event });
      return;
    }

    this.recordConsumedTerminalEvent('exit', event.sessionId, event.createdAt, event.message);
    this.sessionStatus = event.status;
    this.appendSystemOutput(`${event.message}\n`);
    this.lastLifecycleSessionId = event.sessionId;
    this.lastSessionHostId = event.hostId;
    this.activeSessionId = null;
    this.isStopping = false;
    this.actionStatusMessage = event.message;
    this.emitSemanticState();
    void this.refreshTerminalAudit();
  }

  private appendSystemOutput(data: string): void {
    if (!this.xterm) {
      return;
    }

    this.xterm.write(`\x1b[36m${this.toTerminalText(data)}\x1b[0m`);
    this.xterm.scrollToBottom();
  }

  private isCurrentSession(sessionId: string): boolean {
    return this.activeSessionId === sessionId;
  }

  private bufferPendingStartEvent(item: PendingTerminalEvent): void {
    if (!this.isStarting || !this.pendingStartHostId || item.event.hostId !== this.pendingStartHostId) {
      return;
    }

    this.pendingStartEvents.push(item);
    if (this.pendingStartEvents.length > 100) {
      this.pendingStartEvents.shift();
    }
  }

  private replayPendingStartEvents(sessionId: string): void {
    const pendingEvents = this.pendingStartEvents.filter((item) => item.event.sessionId === sessionId);
    this.pendingStartEvents = [];

    for (const item of pendingEvents) {
      switch (item.kind) {
        case 'output':
          this.handleOutputEvent(item.event);
          break;
        case 'status':
          this.handleStatusEvent(item.event);
          break;
        case 'exit':
          this.handleExitEvent(item.event);
          break;
      }
    }
  }

  private recordConsumedTerminalEvent(
    kind: PendingTerminalEvent['kind'],
    sessionId: string,
    createdAt: string,
    message: string,
  ): void {
    this.consumedTerminalEventCount += 1;
    this.lastTerminalEventKind = kind;
    this.lastTerminalEventSessionId = sessionId;
    this.lastTerminalEventAt = createdAt;
    this.lastTerminalEventMessage = message;
    this.emitSemanticState();
  }

  private writeOutput(event: TerminalOutputEvent): void {
    if (!this.xterm) {
      return;
    }

    const data = this.toTerminalText(event.data);
    if (event.stream === 'stderr') {
      this.xterm.write(`\x1b[31m${data}\x1b[0m`);
    } else if (event.stream === 'system') {
      this.xterm.write(`\x1b[36m${data}\x1b[0m`);
    } else {
      this.xterm.write(data);
    }
    this.xterm.scrollToBottom();
  }

  private toTerminalText(data: string): string {
    return data.replace(/\r?\n/g, '\r\n');
  }

  private scheduleTerminalResize(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }

    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      this.resizeXtermToContainer();
      void this.syncBackendResize();
    }, 100);
  }

  private resizeXtermToContainer(): void {
    if (!this.xterm || !this.terminalHost) {
      return;
    }

    const element = this.terminalHost.nativeElement;
    const width = element.clientWidth || 850;
    const height = element.clientHeight || 430;
    const cols = Math.max(40, Math.floor((width - 24) / 8.4));
    const rows = Math.max(12, Math.floor((height - 24) / 15.8));

    this.xterm.resize(cols, rows);
    this.terminalSizeLabel = `${cols} x ${rows}`;
    this.emitSemanticState();
  }

  private async syncBackendResize(fromAction = false): Promise<TerminalResizeResult | null> {
    const api = getSwitchboardApi();
    const sessionId = this.activeSessionId;
    const terminal = this.xterm;
    if (!api || !sessionId || !terminal) {
      return null;
    }

    try {
      const result = await api.terminal.resize(sessionId, terminal.cols, terminal.rows);
      this.resizeStatusMessage = result.success
        ? `Backend size ${result.cols} x ${result.rows}.`
        : result.message;
      if (!fromAction) {
        this.emitSemanticState();
      }
      void this.refreshTerminalAudit();
      return result;
    } catch {
      this.resizeStatusMessage = 'Unable to sync terminal size with backend session.';
      if (fromAction) {
        this.actionStatusMessage = this.resizeStatusMessage;
      }
      this.emitSemanticState();
      return null;
    }
  }

  private async refreshTerminalAudit(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api?.audit?.list) {
      this.auditStatusMessage = 'Audit API is unavailable.';
      this.emitSemanticState();
      return;
    }

    try {
      const events = await api.audit.list();
      this.terminalAuditEntries = events
        .filter((event) => this.isTerminalAuditEvent(event))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 6)
        .map((event) => this.toTerminalAuditSummary(event));
      this.auditLastRefreshedAt = new Date().toISOString();
      this.auditStatusMessage = this.terminalAuditEntries.length > 0
        ? `${this.terminalAuditEntries.length} sanitized terminal audit events loaded.`
        : 'No terminal audit events matched this session or host.';
    } catch {
      this.auditStatusMessage = 'Unable to load terminal audit events.';
    }
    this.emitSemanticState();
  }

  private isTerminalAuditEvent(event: AuditEvent): boolean {
    const metadata = event.metadata ?? {};
    const metadataSessionId = this.stringMetadata(metadata['sessionId']);
    const metadataHostId = this.stringMetadata(metadata['hostId']);
    const route = this.stringMetadata(metadata['route']);
    const action = this.stringMetadata(metadata['action']);
    const terminalSessionIds = new Set(
      [this.activeSessionId, this.lastLifecycleSessionId]
        .filter((value): value is string => Boolean(value)),
    );
    const terminalHostIds = new Set(
      [this.selectedHost?.id ?? null, this.lastSessionHostId || null]
        .filter((value): value is string => Boolean(value)),
    );

    return event.type.startsWith('terminal.')
      || event.entityType === 'terminal_session'
      || (metadataSessionId !== null && terminalSessionIds.has(metadataSessionId))
      || (metadataHostId !== null && terminalHostIds.has(metadataHostId) && event.type.includes('terminal'))
      || Boolean(route?.startsWith('terminal:'))
      || Boolean(action?.startsWith('terminal:'));
  }

  private toTerminalAuditSummary(event: AuditEvent): TerminalAuditSummary {
    const metadata = event.metadata ?? {};
    const metadataSessionId = this.stringMetadata(metadata['sessionId']);
    const metadataHostId = this.stringMetadata(metadata['hostId']);
    const cols = this.numberMetadata(metadata['cols']);
    const rows = this.numberMetadata(metadata['rows']);
    const terminalInputLogged = metadata['terminalInputLogged'] === true;
    const terminalOutputLogged = metadata['terminalOutputLogged'] === true;
    const summary: TerminalAuditSummary = {
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt,
      sessionId: metadataSessionId ?? (event.entityType === 'terminal_session' ? event.entityId : null),
      hostId: metadataHostId ?? (event.entityType === 'host' ? event.entityId : null),
      resultStatus: this.stringMetadata(metadata['resultStatus']),
      success: this.stringMetadata(metadata['success']),
      size: cols && rows ? `${cols} x ${rows}` : null,
      auditSafe: !terminalInputLogged && !terminalOutputLogged,
    };

    return summary;
  }

  private terminalActionStates(): TerminalActionState[] {
    return [
      { id: 'copy', label: 'Copy', disabled: this.copyActionDisabled, disabledReason: this.copyDisabledReason },
      { id: 'paste', label: 'Paste', disabled: this.pasteActionDisabled, disabledReason: this.pasteDisabledReason },
      { id: 'clear', label: 'Clear', disabled: this.clearActionDisabled, disabledReason: this.clearDisabledReason },
      {
        id: 'disconnect',
        label: 'Disconnect',
        disabled: this.disconnectActionDisabled,
        disabledReason: this.disconnectDisabledReason,
      },
      {
        id: 'reconnect',
        label: 'Reconnect',
        disabled: this.reconnectActionDisabled,
        disabledReason: this.reconnectDisabledReason,
      },
      { id: 'resize', label: 'Resize', disabled: this.resizeActionDisabled, disabledReason: this.resizeDisabledReason },
      { id: 'audit', label: 'Audit', disabled: this.auditActionDisabled, disabledReason: this.auditDisabledReason },
    ];
  }

  private stringMetadata(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return null;
  }

  private numberMetadata(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private normalizedSessionStatus(): string {
    return this.sessionStatus.trim().toLowerCase().replace(/\s+/g, '-') || 'disconnected';
  }

  private emitSemanticState(): void {
    if (!this.shellWindowId) {
      return;
    }

    const host = this.selectedHost;
    const recentAudit = this.terminalAuditEntries[0] ?? null;
    const semanticState: ShellWindowSemanticState = {
      kind: 'terminal',
      status: this.sessionLifecycleState,
      summary: host
        ? `Terminal ${this.activeSessionId ? 'attached' : 'ready'} for ${host.name} at ${this.sshTargetLabel}.`
        : 'Terminal idle with no selected host.',
      metadata: {
        windowId: this.shellWindowId,
        objectKind: 'terminal-session',
        objectId: this.terminalObjectId,
        objectOwner: 'terminal',
        objectSource: 'terminal-session-object',
        sessionOwned: true,
        hostId: host?.id ?? null,
        hostName: host?.name ?? null,
        hostAddress: host ? host.address || host.hostname : null,
        hostUsername: host?.username || null,
        sshTarget: this.sshTargetLabel,
        remoteWorkingDirectory: this.remoteWorkingDirectoryLabel,
        remoteWorkingDirectoryState: this.remoteWorkingDirectoryState,
        defaultShell: this.defaultShellLabel,
        reachability: this.reachabilityLabel,
        connectionState: this.connectionStateLabel,
        sessionLifecycleState: this.sessionLifecycleState,
        selectedHostId: this.selectedHostId || null,
        hostContextLocked: this.hostContextLocked,
        activeSessionId: this.activeSessionId,
        lastLifecycleSessionId: this.lastLifecycleSessionId || null,
        terminalSize: this.terminalSizeLabel,
        terminalCols: this.xterm?.cols ?? null,
        terminalRows: this.xterm?.rows ?? null,
        consumedTerminalEventCount: this.consumedTerminalEventCount,
        lastEventSessionId: this.lastTerminalEventSessionId || null,
        lastEventKind: this.lastTerminalEventKind || null,
        lastEventAt: this.lastTerminalEventAt || null,
        lastEventMessage: this.lastTerminalEventMessage || null,
        recentTerminalAuditId: recentAudit?.id ?? null,
        recentTerminalAuditType: recentAudit?.type ?? null,
        recentTerminalAuditSessionId: recentAudit?.sessionId ?? null,
        recentTerminalAuditHostId: recentAudit?.hostId ?? null,
        recentTerminalAuditResultStatus: recentAudit?.resultStatus ?? null,
        recentTerminalAuditSuccess: recentAudit?.success ?? null,
        recentTerminalAuditSafe: recentAudit?.auditSafe ?? true,
        actionIds: TERMINAL_SESSION_ACTIONS,
        availableActions: this.terminalActionStates(),
        lastSessionActionId: this.lastSessionActionId || null,
        actionStatusMessage: this.actionStatusMessage,
        resizeStatusMessage: this.resizeStatusMessage,
        auditStatusMessage: this.auditStatusMessage,
        auditLastRefreshedAt: this.auditLastRefreshedAt || null,
        auditSafe: true,
        xterm: true,
        localStorageSessionPersistence: false,
        terminalInputStored: false,
        terminalOutputStored: false,
        secretsStored: false,
      },
    };

    window.dispatchEvent(new CustomEvent('switchboard-terminal-semantic', {
      detail: {
        windowId: this.shellWindowId,
        semanticState,
      },
    }));
  }
}
