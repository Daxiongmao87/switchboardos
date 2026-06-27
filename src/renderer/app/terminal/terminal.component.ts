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
  HostRecord,
  ShellWindowSemanticState,
  TerminalExitEvent,
  TerminalOutputEvent,
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

interface TerminalShellCommandEventDetail {
  windowId?: string;
  action?: TerminalShellCommand;
}

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
      [attr.data-terminal-event-count]="consumedTerminalEventCount"
      [attr.data-terminal-last-event-session-id]="lastTerminalEventSessionId || null"
      [attr.data-terminal-last-event-kind]="lastTerminalEventKind || null"
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
              <dt>Reachability</dt>
              <dd>{{ selectedHost ? statusLabel(selectedHost.lastConnectionStatus) : 'No connection' }}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>{{ selectedLastCheckedLabel }}</dd>
            </div>
            <div>
              <dt>Resize</dt>
              <dd>Recorded only; SSH pipe backend cannot propagate terminal size.</dd>
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
    if (!detail || detail.windowId !== this.shellWindowId || !this.isTerminalShellCommand(detail.action)) {
      return;
    }

    void this.runShellCommand(detail.action);
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
    this.xterm?.clear();
    this.appendSystemOutput(`Starting session for ${host.name}...\n`);

    try {
      const result = await api.terminal.start(host.id);
      if (result.status === 'failed' || !result.sessionId) {
        this.activeSessionId = null;
        this.pendingStartEvents = [];
        this.sessionStatus = 'Failed';
        this.appendSystemOutput(`${result.message}\n`);
        this.errorMessage = result.message;
        this.emitSemanticState();
        return;
      }

      this.activeSessionId = result.sessionId;
      this.sessionStatus = 'Starting';
      this.emitSemanticState();
      this.replayPendingStartEvents(result.sessionId);
      this.appendSystemOutput(`${result.message}\n`);
      this.xterm?.focus();
      await this.syncBackendResize();
    } catch {
      this.activeSessionId = null;
      this.pendingStartEvents = [];
      this.sessionStatus = 'Failed';
      this.errorMessage = 'Unable to start terminal session.';
      this.appendSystemOutput('Unable to start terminal session.\n');
      this.emitSemanticState();
    } finally {
      this.pendingStartHostId = null;
      this.pendingStartEvents = [];
      this.isStarting = false;
    }
  }

  async stopSession(): Promise<void> {
    const api = getSwitchboardApi();
    const sessionId = this.activeSessionId;
    if (!api || !sessionId) {
      return;
    }

    this.isStopping = true;
    this.appendSystemOutput('Stopping session...\n');
    try {
      const result = await api.terminal.stop(sessionId);
      if (!result.success) {
        this.errorMessage = result.message;
      }
      this.appendSystemOutput(`${result.message}\n`);
    } catch {
      this.errorMessage = 'Unable to stop terminal session.';
      this.appendSystemOutput('Unable to stop terminal session.\n');
      this.isStopping = false;
    }
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
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
    switch (action) {
      case 'copy':
        await this.copySelectionToClipboard();
        return;
      case 'paste':
        await this.pasteClipboardToSession();
        return;
      case 'clear':
        this.clearTerminalView();
        return;
    }
  }

  private isTerminalShellCommand(action: unknown): action is TerminalShellCommand {
    return action === 'copy' || action === 'paste' || action === 'clear';
  }

  private async copySelectionToClipboard(): Promise<void> {
    const selection = this.xterm?.getSelection() ?? '';
    if (!selection) {
      this.appendSystemOutput('No terminal selection to copy.\n');
      return;
    }
    if (!navigator.clipboard?.writeText) {
      this.appendSystemOutput('Clipboard write is unavailable in this renderer.\n');
      return;
    }

    try {
      await navigator.clipboard.writeText(selection);
      this.appendSystemOutput('Copied terminal selection.\n');
    } catch {
      this.appendSystemOutput('Unable to copy terminal selection to clipboard.\n');
    }
  }

  private async pasteClipboardToSession(): Promise<void> {
    if (!this.activeSessionId) {
      this.appendSystemOutput('Start a session before pasting clipboard text.\n');
      return;
    }
    if (!navigator.clipboard?.readText) {
      this.appendSystemOutput('Clipboard read is unavailable in this renderer.\n');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        this.appendSystemOutput('Clipboard is empty.\n');
        return;
      }
      await this.writeTerminalData(text);
      this.xterm?.focus();
    } catch {
      this.appendSystemOutput('Unable to paste clipboard text into terminal session.\n');
    }
  }

  private clearTerminalView(): void {
    if (!this.xterm) {
      return;
    }

    this.xterm.clear();
    this.xterm.focus();
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

    this.recordConsumedTerminalEvent('output', event.sessionId);
    this.writeOutput(event);
  }

  private handleStatusEvent(event: TerminalStatusEvent): void {
    if (!this.isCurrentSession(event.sessionId)) {
      this.bufferPendingStartEvent({ kind: 'status', event });
      return;
    }

    this.recordConsumedTerminalEvent('status', event.sessionId);
    this.sessionStatus = event.status;
    this.appendSystemOutput(`${event.message}\n`);
    this.emitSemanticState();
  }

  private handleExitEvent(event: TerminalExitEvent): void {
    if (!this.isCurrentSession(event.sessionId)) {
      this.bufferPendingStartEvent({ kind: 'exit', event });
      return;
    }

    this.recordConsumedTerminalEvent('exit', event.sessionId);
    this.sessionStatus = event.status;
    this.appendSystemOutput(`${event.message}\n`);
    this.activeSessionId = null;
    this.isStopping = false;
    this.emitSemanticState();
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

  private recordConsumedTerminalEvent(kind: PendingTerminalEvent['kind'], sessionId: string): void {
    this.consumedTerminalEventCount += 1;
    this.lastTerminalEventKind = kind;
    this.lastTerminalEventSessionId = sessionId;
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

  private async syncBackendResize(): Promise<void> {
    const api = getSwitchboardApi();
    const sessionId = this.activeSessionId;
    const terminal = this.xterm;
    if (!api || !sessionId || !terminal) {
      return;
    }

    await api.terminal.resize(sessionId, terminal.cols, terminal.rows).catch(() => undefined);
  }

  private emitSemanticState(): void {
    if (!this.shellWindowId) {
      return;
    }

    const host = this.selectedHost;
    const semanticState: ShellWindowSemanticState = {
      kind: 'terminal',
      status: this.activeSessionId ? this.sessionStatus : 'idle',
      summary: host
        ? `Terminal ${this.activeSessionId ? 'attached' : 'ready'} for ${host.name}.`
        : 'Terminal idle with no selected host.',
      metadata: {
        windowId: this.shellWindowId,
        hostId: host?.id ?? null,
        hostName: host?.name ?? null,
        selectedHostId: this.selectedHostId || null,
        hostContextLocked: this.hostContextLocked,
        activeSessionId: this.activeSessionId,
        terminalSize: this.terminalSizeLabel,
        consumedTerminalEventCount: this.consumedTerminalEventCount,
        lastEventSessionId: this.lastTerminalEventSessionId || null,
        lastEventKind: this.lastTerminalEventKind || null,
        xterm: true,
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
