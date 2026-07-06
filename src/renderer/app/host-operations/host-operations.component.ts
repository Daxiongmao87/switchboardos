import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import type {
  HostOperationInput,
  HostOperationKind,
  HostOperationResult,
  HostRecord,
  SshFileEntry,
  SshFileListResult,
  SshFileStatResult,
  SshFileTransferResult,
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
      [attr.data-provider-route]="mode === 'files' && result ? 'ssh-file:list' : 'host-operation:run'"
      [attr.data-host-context-id]="hostContextId || null"
      [attr.data-selected-host-id]="selectedHostId || null"
      [attr.data-row-count]="result?.rows?.length || 0"
      [attr.data-semantic-state]="semanticSummary"
    >
      <header class="operation-header">
        <div>
          <span class="operation-icon">{{ copy.icon }}</span>
          <h1>{{ copy.title }}</h1>
          <p>{{ mode === 'files'
            ? 'Backend-owned SSH file provider routes. No browser-side filesystem access, command construction, or secrets.'
            : 'Read-only host inspection through backend-owned ssh BatchMode. No browser-side command execution or secrets.' }}</p>
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
              <tr
                *ngFor="let row of result.rows; trackBy: trackRow"
                [class.selectable-row]="mode === 'files'"
                [class.is-selected]="mode === 'files' && row['path'] === selectedFilePath"
                [attr.data-remote-path]="mode === 'files' ? row['path'] : null"
                [attr.data-selected]="mode === 'files' && row['path'] === selectedFilePath ? 'true' : null"
                (click)="mode === 'files' ? selectFileRow(row) : null"
              >
                <td *ngFor="let key of rowKeys">{{ row[key] }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section
          *ngIf="mode === 'files'"
          class="file-actions"
          data-testid="ssh-file-actions"
          [attr.data-selected-path]="selectedFilePath"
          [attr.data-file-action-state]="fileActionState"
          [attr.data-stat-provider-route]="fileStatResult ? 'ssh-file:stat' : ''"
          [attr.data-stat-status]="fileStatResult?.status || ''"
          [attr.data-download-provider-route]="fileDownloadResult ? 'ssh-file:download' : ''"
          [attr.data-download-status]="fileDownloadResult?.status || ''"
          [attr.data-upload-provider-route]="fileUploadResult ? 'ssh-file:upload' : ''"
          [attr.data-upload-status]="fileUploadResult?.status || ''"
          [attr.data-transfer-direction]="lastTransferDirection"
          [attr.data-transfer-status]="lastTransferStatus"
        >
          <header>
            <div>
              <h3>Selected remote object</h3>
              <p data-testid="ssh-file-selected-path">{{ selectedFilePath || 'Select a row to inspect or transfer.' }}</p>
            </div>
            <button
              type="button"
              class="secondary-action"
              data-testid="ssh-file-stat-action"
              (click)="statSelectedFile()"
              [disabled]="isFileActionRunning || !selectedFilePath || !selectedHostId"
            >
              Get info
            </button>
          </header>

          <div class="file-transfer-grid">
            <label>
              Download target
              <input
                name="sshFileDownloadLocalPath"
                data-testid="ssh-file-download-local-path"
                [(ngModel)]="downloadLocalPath"
                placeholder="/tmp/switchboardos-download"
              />
            </label>
            <button
              type="button"
              data-testid="ssh-file-download-action"
              (click)="downloadSelectedFile()"
              [disabled]="isFileActionRunning || !selectedFilePath || !downloadLocalPath || !selectedHostId"
            >
              Download
            </button>
            <label>
              Upload source
              <input
                name="sshFileUploadLocalPath"
                data-testid="ssh-file-upload-local-path"
                [(ngModel)]="uploadLocalPath"
                placeholder="/tmp/local-file.txt"
              />
            </label>
            <label>
              Upload destination
              <input
                name="sshFileUploadRemotePath"
                data-testid="ssh-file-upload-remote-path"
                [(ngModel)]="uploadRemotePath"
                placeholder="/tmp/remote-file.txt"
              />
            </label>
            <button
              type="button"
              data-testid="ssh-file-upload-action"
              (click)="uploadFile()"
              [disabled]="isFileActionRunning || !uploadLocalPath || !uploadRemotePath || !selectedHostId"
            >
              Upload
            </button>
          </div>

          <p *ngIf="fileActionMessage" class="status-message" data-testid="ssh-file-action-message">
            {{ fileActionMessage }}
          </p>
          <p *ngIf="fileActionError" class="error-message" data-testid="ssh-file-action-error">
            {{ fileActionError }}
          </p>
        </section>

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
      grid-template-rows: auto 1fr auto auto;
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

    .selectable-row {
      cursor: pointer;
    }

    .selectable-row:hover,
    .selectable-row.is-selected {
      background: #18243a;
    }

    .file-actions {
      display: grid;
      gap: 10px;
      border-top: 1px solid #2c3546;
      padding: 12px;
      background: #111827;
    }

    .file-actions header,
    .file-transfer-grid {
      display: flex;
      align-items: end;
      gap: 10px;
      flex-wrap: wrap;
    }

    .file-actions h3 {
      margin: 0;
      font-size: 13px;
    }

    .file-actions p {
      margin: 4px 0 0;
      color: #9eaabd;
      font-size: 12px;
      line-height: 1.45;
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
  selectedFileEntry: SshFileEntry | null = null;
  fileStatResult: SshFileStatResult | null = null;
  fileDownloadResult: SshFileTransferResult | null = null;
  fileUploadResult: SshFileTransferResult | null = null;
  fileActionMessage = '';
  fileActionError = '';
  isFileActionRunning = false;
  downloadLocalPath = '/tmp/switchboardos-file-browser-download';
  uploadLocalPath = '';
  uploadRemotePath = '/tmp/switchboardos-file-browser-upload';
  lastTransferDirection = '';

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

  get selectedFilePath(): string {
    return this.selectedFileEntry?.path ?? '';
  }

  get fileActionState(): string {
    if (this.isFileActionRunning) {
      return 'running';
    }
    if (this.fileActionError) {
      return 'error';
    }
    if (this.fileActionMessage) {
      return 'ready';
    }
    return 'idle';
  }

  get lastTransferStatus(): string {
    return this.fileUploadResult?.status || this.fileDownloadResult?.status || '';
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
    this.resetFileActionState();
    try {
      if (this.mode === 'files') {
        const fileResult = await api.sshFile.list({
          hostId: input.hostId,
          path: input.path,
          limit: input.limit,
        });
        this.result = this.mapSshFileListResult(fileResult);
        this.clearFileSelection();
      } else {
        this.result = await api.hostOperations.run(input);
      }
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

  selectFileRow(row: Record<string, string | number | boolean | null>): void {
    if (this.mode !== 'files') {
      return;
    }
    const remotePath = this.rowText(row, 'path');
    if (!remotePath) {
      return;
    }
    const name = this.rowText(row, 'name') || this.fileNameFromPath(remotePath);
    const type = this.rowText(row, 'type') === 'directory' ? 'directory' : 'file';
    this.selectedFileEntry = {
      name,
      path: remotePath,
      type,
      size: this.rowNumber(row, 'size'),
      modified: this.rowText(row, 'modified'),
      permissions: this.rowText(row, 'permissions'),
      owner: this.rowText(row, 'owner'),
      group: this.rowText(row, 'group'),
    };
    this.fileStatResult = null;
    this.fileDownloadResult = null;
    this.fileUploadResult = null;
    this.fileActionMessage = '';
    this.fileActionError = '';
    this.lastTransferDirection = '';
    this.downloadLocalPath = `/tmp/switchboardos-file-browser-${this.safeFileName(name)}`;
    this.uploadRemotePath = type === 'directory'
      ? this.joinRemotePath(remotePath, 'switchboardos-upload.txt')
      : remotePath;
  }

  async statSelectedFile(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api || !this.selectedHostId || !this.selectedFilePath) {
      this.fileActionError = 'Select a remote file before requesting file info.';
      return;
    }

    this.isFileActionRunning = true;
    this.fileActionError = '';
    this.fileActionMessage = '';
    try {
      this.fileStatResult = await api.sshFile.stat({
        hostId: this.selectedHostId,
        path: this.selectedFilePath,
      });
      this.fileActionMessage = this.fileStatResult.status === 'success'
        ? `File info loaded for ${this.selectedFilePath}.`
        : `File info failed for ${this.selectedFilePath}.`;
    } catch (error) {
      this.fileActionError = this.errorText(error, 'Unable to load remote file info.');
    } finally {
      this.isFileActionRunning = false;
    }
  }

  async downloadSelectedFile(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api || !this.selectedHostId || !this.selectedFilePath || !this.downloadLocalPath.trim()) {
      this.fileActionError = 'Select a remote file and provide a local download target.';
      return;
    }

    this.isFileActionRunning = true;
    this.fileActionError = '';
    this.fileActionMessage = '';
    try {
      this.fileDownloadResult = await api.sshFile.download({
        hostId: this.selectedHostId,
        remotePath: this.selectedFilePath,
        localPath: this.downloadLocalPath.trim(),
      });
      this.lastTransferDirection = 'download';
      this.fileActionMessage = this.fileDownloadResult.status === 'success'
        ? `Downloaded ${this.selectedFilePath}.`
        : `Download failed for ${this.selectedFilePath}.`;
    } catch (error) {
      this.fileActionError = this.errorText(error, 'Unable to download remote file.');
    } finally {
      this.isFileActionRunning = false;
    }
  }

  async uploadFile(): Promise<void> {
    const api = getSwitchboardApi();
    const localPath = this.uploadLocalPath.trim();
    const remotePath = this.uploadRemotePath.trim();
    if (!api || !this.selectedHostId || !localPath || !remotePath) {
      this.fileActionError = 'Provide a local upload source and remote destination.';
      return;
    }

    this.isFileActionRunning = true;
    this.fileActionError = '';
    this.fileActionMessage = '';
    try {
      this.fileUploadResult = await api.sshFile.upload({
        hostId: this.selectedHostId,
        localPath,
        remotePath,
      });
      this.lastTransferDirection = 'upload';
      this.fileActionMessage = this.fileUploadResult.status === 'success'
        ? `Uploaded ${remotePath}.`
        : `Upload failed for ${remotePath}.`;
    } catch (error) {
      this.fileActionError = this.errorText(error, 'Unable to upload remote file.');
    } finally {
      this.isFileActionRunning = false;
    }
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

  private mapSshFileListResult(result: SshFileListResult): HostOperationResult {
    return {
      hostId: result.hostId,
      kind: 'files',
      command: 'ssh-file:list',
      stdout: '',
      stderr: result.error ?? '',
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.status,
      error: result.error,
      summary: result.status === 'success'
        ? `${result.entries.length} file provider row(s) returned.`
        : `file provider listing failed: ${result.error ?? `exit code ${result.exitCode ?? 'unknown'}`}.`,
      rows: result.entries.map((entry) => this.mapSshFileEntry(entry)),
    };
  }

  private mapSshFileEntry(entry: SshFileEntry): Record<string, string | number | boolean | null> {
    return {
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      modified: entry.modified,
      permissions: entry.permissions,
      owner: entry.owner,
      group: entry.group,
    };
  }

  private resetFileActionState(): void {
    this.fileStatResult = null;
    this.fileDownloadResult = null;
    this.fileUploadResult = null;
    this.fileActionMessage = '';
    this.fileActionError = '';
    this.lastTransferDirection = '';
  }

  private clearFileSelection(): void {
    this.selectedFileEntry = null;
    this.downloadLocalPath = '/tmp/switchboardos-file-browser-download';
    this.uploadRemotePath = this.joinRemotePath(this.path || '.', 'switchboardos-upload.txt');
  }

  private rowText(row: Record<string, string | number | boolean | null>, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  private rowNumber(row: Record<string, string | number | boolean | null>, key: string): number | null {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  }

  private fileNameFromPath(remotePath: string): string {
    return remotePath.split('/').filter(Boolean).pop() || 'remote-file';
  }

  private safeFileName(name: string): string {
    return name.replace(/[^A-Za-z0-9._-]/g, '_') || 'remote-file';
  }

  private joinRemotePath(basePath: string, childPath: string): string {
    const base = basePath.trim() || '.';
    if (base === '/') {
      return `/${childPath}`;
    }
    return `${base.replace(/\/+$/, '')}/${childPath}`;
  }
}
