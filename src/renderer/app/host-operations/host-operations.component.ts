import { Component, HostListener, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import type {
  HostOperationInput,
  HostOperationKind,
  HostOperationResult,
  HostRecord,
  SshFileDeleteResult,
  SshFileEntry,
  SshFileListResult,
  SshFileMoveResult,
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

type FileObjectActionId = 'enter-folder' | 'stat' | 'move' | 'delete' | 'download' | 'upload';

interface FileObjectAction {
  id: FileObjectActionId;
  label: string;
  icon: string;
  shortcut: string;
  destructive?: boolean;
  disabledReason: string;
}

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
                role="row"
                [attr.tabindex]="mode === 'files' ? 0 : null"
                [class.selectable-row]="mode === 'files'"
                [class.is-selected]="mode === 'files' && row['path'] === selectedFilePath"
                [attr.data-remote-path]="mode === 'files' ? row['path'] : null"
                [attr.data-object-kind]="mode === 'files' ? 'ssh-file-object' : null"
                [attr.data-object-owner]="mode === 'files' ? 'file-browser' : null"
                [attr.data-object-source]="mode === 'files' ? 'ssh-file-provider' : null"
                [attr.data-action-ids]="mode === 'files' ? rowFileActionIds(row) : null"
                [attr.data-selected]="mode === 'files' && row['path'] === selectedFilePath ? 'true' : null"
                [attr.aria-selected]="mode === 'files' && row['path'] === selectedFilePath ? 'true' : null"
                [attr.aria-label]="mode === 'files' ? fileRowLabel(row) : null"
                (click)="mode === 'files' ? selectFileRow(row) : null"
                (keydown)="mode === 'files' ? handleFileRowKeydown($event, row) : null"
                (contextmenu)="mode === 'files' ? openFileRowContextMenu($event, row) : null"
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
          [attr.data-delete-provider-route]="fileDeleteResult ? 'ssh-file:delete' : ''"
          [attr.data-delete-status]="fileDeleteResult?.status || ''"
          [attr.data-delete-confirmation]="deleteConfirmationPending ? 'pending' : ''"
          [attr.data-delete-result-deleted]="fileDeleteResult?.deleted === true ? 'true' : ''"
          [attr.data-move-provider-route]="fileMoveResult ? 'ssh-file:move' : ''"
          [attr.data-move-status]="fileMoveResult?.status || ''"
          [attr.data-move-result-moved]="fileMoveResult?.moved === true ? 'true' : ''"
          [attr.data-move-target-path]="moveTargetPath"
          [attr.data-transfer-direction]="lastTransferDirection"
          [attr.data-transfer-status]="lastTransferStatus"
          [attr.data-object-kind]="selectedFileEntry ? 'ssh-file-object' : 'ssh-file-provider-root'"
          [attr.data-object-owner]="'file-browser'"
          [attr.data-object-source]="'ssh-file-provider'"
          [attr.data-object-action-ids]="fileObjectActionIds"
        >
          <header>
            <div>
              <h3>Selected remote object</h3>
              <p data-testid="ssh-file-selected-path">{{ selectedFilePath || 'Select a row to inspect or transfer.' }}</p>
              <p *ngIf="selectedFileEntry" class="file-object-kind" data-testid="ssh-file-selected-kind">
                {{ selectedFileEntry.type === 'directory' ? 'Folder' : 'File' }} action target.
              </p>
            </div>
            <button
              type="button"
              class="secondary-action"
              data-testid="ssh-file-enter-folder-action"
              data-action-id="enter-folder"
              data-action-source="ssh-file-provider"
              [attr.title]="enterFolderDisabledReason || 'Enter selected folder'"
              (click)="enterSelectedFolder()"
              [disabled]="!!enterFolderDisabledReason"
            >
              Enter folder
            </button>
            <button
              type="button"
              class="secondary-action"
              data-testid="ssh-file-stat-action"
              data-action-id="stat"
              data-action-source="ssh-file-provider"
              [attr.title]="statDisabledReason || 'Get info for selected remote object'"
              (click)="statSelectedFile()"
              [disabled]="!!statDisabledReason"
            >
              Get info
            </button>
            <button
              type="button"
              class="danger-action"
              data-testid="ssh-file-delete-action"
              data-action-id="delete"
              data-action-source="ssh-file-provider"
              [attr.title]="deleteDisabledReason || 'Delete selected remote object'"
              (click)="deleteSelectedFile()"
              [disabled]="!!deleteDisabledReason"
            >
              {{ deleteConfirmationPending ? 'Confirm permanent delete' : 'Delete' }}
            </button>
          </header>

          <div class="file-move-row">
            <label>
              Rename or move target
              <input
                name="sshFileMoveTargetPath"
                data-testid="ssh-file-move-target-path"
                [(ngModel)]="moveTargetPath"
                placeholder="/tmp/renamed-file.txt"
              />
            </label>
            <button
              type="button"
              data-testid="ssh-file-move-action"
              data-action-id="move"
              data-action-source="ssh-file-provider"
              [attr.title]="moveDisabledReason || 'Rename or move selected remote object'"
              (click)="moveSelectedFile()"
              [disabled]="!!moveDisabledReason"
            >
              Rename / Move
            </button>
          </div>

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
              data-action-id="download"
              data-action-source="ssh-file-provider"
              [attr.title]="downloadDisabledReason || 'Download selected remote file'"
              (click)="downloadSelectedFile()"
              [disabled]="!!downloadDisabledReason"
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
              data-action-id="upload"
              data-action-source="ssh-file-provider"
              [attr.title]="uploadDisabledReason || 'Upload into the selected folder or current folder'"
              (click)="uploadFile()"
              [disabled]="!!uploadDisabledReason"
            >
              Upload into folder
            </button>
          </div>

          <div
            *ngIf="disabledActionReasons.length > 0"
            class="file-action-disabled-reasons"
            data-testid="ssh-file-disabled-reasons"
          >
            <p *ngFor="let reason of disabledActionReasons">{{ reason }}</p>
          </div>

          <p *ngIf="fileActionMessage" class="status-message" data-testid="ssh-file-action-message">
            {{ fileActionMessage }}
          </p>
          <p *ngIf="fileActionError" class="error-message" data-testid="ssh-file-action-error">
            {{ fileActionError }}
          </p>
        </section>

        <nav
          *ngIf="fileContextMenuOpen"
          class="file-object-context-menu"
          data-testid="ssh-file-row-context-menu"
          data-context-target="ssh-file-object"
          data-object-kind="ssh-file-object"
          data-object-owner="file-browser"
          data-object-source="ssh-file-provider"
          [attr.data-target-path]="selectedFilePath"
          [style.left.px]="fileContextMenuX"
          [style.top.px]="fileContextMenuY"
          role="menu"
          (keydown)="handleFileContextMenuKeydown($event)"
        >
          <header>
            <strong>{{ selectedFileEntry?.name || 'Remote object' }}</strong>
            <span>{{ selectedFileEntry?.type || 'unknown' }}</span>
          </header>
          <button
            *ngFor="let action of fileObjectActions; trackBy: trackFileAction"
            type="button"
            role="menuitem"
            [class.danger-action]="action.destructive"
            [disabled]="!!action.disabledReason"
            [attr.data-action-id]="action.id"
            [attr.data-action-source]="'ssh-file-provider'"
            [attr.data-target-scope]="'ssh-file-row'"
            [attr.data-source-app-id]="'file-browser'"
            [attr.data-required-capabilities]="action.id === 'download' || action.id === 'stat' || action.id === 'enter-folder' ? 'host:file:read' : 'host:file:write'"
            [attr.data-shortcut]="action.shortcut"
            [attr.data-disabled-reason]="action.disabledReason || null"
            [attr.data-testid]="'ssh-file-context-menu-action-' + action.id"
            (click)="runFileObjectAction(action)"
          >
            <span class="file-menu-icon">{{ action.icon }}</span>
            <span>
              <strong>{{ action.label }}</strong>
              <small *ngIf="action.disabledReason">{{ action.disabledReason }}</small>
            </span>
            <kbd>{{ action.shortcut }}</kbd>
          </button>
        </nav>

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

    .danger-action {
      border-color: #b94a55;
      background: #5c1f2a;
      color: #ffd9de;
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

    .selectable-row:focus-visible {
      outline: 2px solid #7aa2ff;
      outline-offset: -2px;
      background: #203050;
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
    .file-move-row,
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

    .file-actions .file-object-kind {
      color: #cbd6e7;
    }

    .file-action-disabled-reasons {
      display: grid;
      gap: 4px;
      border: 1px solid #344052;
      border-radius: 6px;
      padding: 8px 10px;
      background: #0d1420;
    }

    .file-action-disabled-reasons p {
      margin: 0;
      color: #cbd6e7;
    }

    .file-object-context-menu {
      position: fixed;
      z-index: 10000;
      display: grid;
      min-width: 260px;
      max-width: min(360px, calc(100vw - 24px));
      border: 1px solid #3d4960;
      border-radius: 8px;
      padding: 6px;
      background: #101723;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
      color: #eef3fb;
    }

    .file-object-context-menu header {
      display: grid;
      gap: 2px;
      padding: 7px 8px 8px;
      border-bottom: 1px solid #2a3445;
      color: #dce6f5;
    }

    .file-object-context-menu header span {
      color: #9eaabd;
      font-size: 11px;
      text-transform: uppercase;
    }

    .file-object-context-menu button {
      display: grid;
      grid-template-columns: 22px 1fr auto;
      align-items: center;
      gap: 8px;
      border: 0;
      padding: 8px;
      background: transparent;
      text-align: left;
    }

    .file-object-context-menu button:hover:not(:disabled),
    .file-object-context-menu button:focus-visible {
      background: #1b2638;
      outline: none;
    }

    .file-object-context-menu button.danger-action {
      color: #ffd9de;
    }

    .file-object-context-menu small,
    .file-object-context-menu kbd {
      color: #9eaabd;
      font-size: 11px;
    }

    .file-object-context-menu button span:nth-child(2) {
      display: grid;
      gap: 2px;
    }

    .file-menu-icon {
      color: #9db7ff;
      font-weight: 700;
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
  fileDeleteResult: SshFileDeleteResult | null = null;
  fileMoveResult: SshFileMoveResult | null = null;
  fileActionMessage = '';
  fileActionError = '';
  isFileActionRunning = false;
  pendingDeletePath = '';
  moveTargetPath = '';
  downloadLocalPath = '/tmp/switchboardos-file-browser-download';
  uploadLocalPath = '';
  uploadRemotePath = '/tmp/switchboardos-file-browser-upload';
  lastTransferDirection = '';
  fileContextMenuOpen = false;
  fileContextMenuX = 0;
  fileContextMenuY = 0;

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

  get deleteConfirmationPending(): boolean {
    return Boolean(this.selectedFilePath && this.pendingDeletePath === this.selectedFilePath);
  }

  get selectedFileIsDirectory(): boolean {
    return this.selectedFileEntry?.type === 'directory';
  }

  get selectedFileIsFile(): boolean {
    return this.selectedFileEntry?.type === 'file';
  }

  get selectedObjectRequiredReason(): string {
    if (!this.selectedHostId) {
      return 'Select a host before using remote file actions.';
    }
    if (!this.selectedFilePath) {
      return 'Select a remote file or folder first.';
    }
    if (this.isFileActionRunning) {
      return 'Wait for the current file action to finish.';
    }
    return '';
  }

  get enterFolderDisabledReason(): string {
    const required = this.selectedObjectRequiredReason;
    if (required) {
      return required;
    }
    return this.selectedFileIsDirectory ? '' : 'Enter folder is available after selecting a folder.';
  }

  get statDisabledReason(): string {
    return this.selectedObjectRequiredReason;
  }

  get deleteDisabledReason(): string {
    return this.selectedObjectRequiredReason;
  }

  get moveDisabledReason(): string {
    const required = this.selectedObjectRequiredReason;
    if (required) {
      return required;
    }
    const targetPath = this.moveTargetPath.trim();
    if (!targetPath) {
      return 'Provide a rename or move target path.';
    }
    if (targetPath === this.selectedFilePath) {
      return 'Move target must be different from the selected path.';
    }
    return '';
  }

  get downloadDisabledReason(): string {
    const required = this.selectedObjectRequiredReason;
    if (required) {
      return required;
    }
    if (!this.selectedFileIsFile) {
      return 'Download is available for files; folder download is not supported by this SSH file provider.';
    }
    if (!this.downloadLocalPath.trim()) {
      return 'Provide a local download target path.';
    }
    return '';
  }

  get uploadDisabledReason(): string {
    if (!this.selectedHostId) {
      return 'Select a host before uploading into a remote folder.';
    }
    if (this.isFileActionRunning) {
      return 'Wait for the current file action to finish.';
    }
    if (!this.uploadLocalPath.trim()) {
      return 'Provide a local upload source path.';
    }
    if (!this.uploadRemotePath.trim()) {
      return 'Provide a remote upload destination inside the selected or current folder.';
    }
    return '';
  }

  get fileObjectActions(): FileObjectAction[] {
    return [
      {
        id: 'enter-folder',
        label: 'Enter folder',
        icon: 'Go',
        shortcut: 'Enter',
        disabledReason: this.enterFolderDisabledReason,
      },
      {
        id: 'stat',
        label: 'Get info',
        icon: 'i',
        shortcut: 'Ctrl+I',
        disabledReason: this.statDisabledReason,
      },
      {
        id: 'move',
        label: 'Rename / Move',
        icon: 'F2',
        shortcut: 'F2',
        disabledReason: this.moveDisabledReason,
      },
      {
        id: 'download',
        label: 'Download file',
        icon: 'Down',
        shortcut: 'Ctrl+D',
        disabledReason: this.downloadDisabledReason,
      },
      {
        id: 'upload',
        label: 'Upload into folder',
        icon: 'Up',
        shortcut: 'Ctrl+U',
        disabledReason: this.uploadDisabledReason,
      },
      {
        id: 'delete',
        label: this.deleteConfirmationPending ? 'Confirm permanent delete' : 'Delete',
        icon: 'Del',
        shortcut: 'Delete',
        destructive: true,
        disabledReason: this.deleteDisabledReason,
      },
    ];
  }

  get fileObjectActionIds(): string {
    return this.fileObjectActions.map((action) => action.id).join(',');
  }

  get disabledActionReasons(): string[] {
    const seen = new Set<string>();
    return this.fileObjectActions
      .filter((action) => action.disabledReason)
      .map((action) => `${action.label}: ${action.disabledReason}`)
      .filter((reason) => {
        if (seen.has(reason)) {
          return false;
        }
        seen.add(reason);
        return true;
      });
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

  trackFileAction(_index: number, action: FileObjectAction): string {
    return action.id;
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
    const rawType = this.rowText(row, 'type');
    const type = this.normalizedFileType(rawType);
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
    this.fileDeleteResult = null;
    this.fileMoveResult = null;
    this.pendingDeletePath = '';
    this.fileActionMessage = '';
    this.fileActionError = '';
    this.lastTransferDirection = '';
    this.downloadLocalPath = `/tmp/switchboardos-file-browser-${this.safeFileName(name)}`;
    this.moveTargetPath = remotePath;
    this.uploadRemotePath = this.defaultUploadRemotePathForSelection(remotePath, type);
    this.closeFileContextMenu();
  }

  async statSelectedFile(): Promise<void> {
    const api = getSwitchboardApi();
    const disabledReason = this.statDisabledReason;
    if (!api || disabledReason) {
      this.fileActionError = disabledReason || 'Switchboard API is unavailable.';
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
    const disabledReason = this.downloadDisabledReason;
    if (!api || disabledReason) {
      this.fileActionError = disabledReason || 'Switchboard API is unavailable.';
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
    const disabledReason = this.uploadDisabledReason;
    const localPath = this.uploadLocalPath.trim();
    const remotePath = this.uploadRemotePath.trim();
    if (!api || disabledReason) {
      this.fileActionError = disabledReason || 'Switchboard API is unavailable.';
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

  async deleteSelectedFile(): Promise<void> {
    const api = getSwitchboardApi();
    const disabledReason = this.deleteDisabledReason;
    if (!api || disabledReason) {
      this.fileActionError = disabledReason || 'Switchboard API is unavailable.';
      return;
    }

    const targetPath = this.selectedFilePath;
    const recursive = this.selectedFileEntry?.type === 'directory';
    if (this.pendingDeletePath !== targetPath) {
      this.fileDeleteResult = null;
      this.pendingDeletePath = targetPath;
      this.fileActionError = '';
      this.fileActionMessage = recursive
        ? `Permanent delete pending for folder ${targetPath}. Confirm permanent delete to remove this folder and its contents. This cannot be undone in SwitchboardOS.`
        : `Permanent delete pending for file ${targetPath}. Confirm permanent delete to remove it. This cannot be undone in SwitchboardOS.`;
      return;
    }

    this.isFileActionRunning = true;
    this.fileActionError = '';
    this.fileActionMessage = `Deleting ${targetPath} through the SSH file provider.`;
    try {
      this.fileDeleteResult = await api.sshFile.delete({
        hostId: this.selectedHostId,
        path: targetPath,
        recursive,
      });
      if (this.fileDeleteResult.status === 'success') {
        await this.refreshFileListAfterMutation(targetPath);
        this.fileActionMessage = `Deleted ${targetPath}. The file list was refreshed.`;
      } else {
        this.fileActionMessage = `Delete failed for ${targetPath}. The object is still selected for retry.`;
      }
    } catch (error) {
      this.fileActionError = this.errorText(error, 'Unable to delete remote file.');
    } finally {
      this.pendingDeletePath = '';
      this.isFileActionRunning = false;
    }
  }

  async moveSelectedFile(): Promise<void> {
    const api = getSwitchboardApi();
    const sourcePath = this.selectedFilePath;
    const targetPath = this.moveTargetPath.trim();
    const disabledReason = this.moveDisabledReason;
    if (!api || disabledReason) {
      this.fileActionError = disabledReason || 'Switchboard API is unavailable.';
      return;
    }

    this.isFileActionRunning = true;
    this.fileActionError = '';
    this.fileActionMessage = `Moving ${sourcePath} through the SSH file provider. Existing target paths are not overwritten.`;
    try {
      this.fileMoveResult = await api.sshFile.move({
        hostId: this.selectedHostId,
        sourcePath,
        targetPath,
      });
      if (this.fileMoveResult.status === 'success') {
        const moveResult = this.fileMoveResult;
        this.path = this.parentRemotePath(targetPath);
        await this.refreshFileListAfterMove(targetPath);
        this.fileMoveResult = moveResult;
        this.moveTargetPath = targetPath;
        this.fileActionMessage = `Moved ${sourcePath} to ${targetPath}. The file list was refreshed.`;
      } else {
        this.fileActionMessage = `Move failed for ${sourcePath}. Check the target path and retry.`;
      }
    } catch (error) {
      this.fileActionError = this.errorText(error, 'Unable to move remote file.');
    } finally {
      this.isFileActionRunning = false;
    }
  }

  async enterSelectedFolder(): Promise<void> {
    const disabledReason = this.enterFolderDisabledReason;
    if (disabledReason) {
      this.fileActionError = disabledReason;
      return;
    }

    const folderPath = this.selectedFilePath;
    this.path = folderPath;
    this.fileActionMessage = `Opening folder ${folderPath}.`;
    this.fileActionError = '';
    await this.runOperation();
  }

  async runFileObjectAction(action: FileObjectAction): Promise<void> {
    if (action.disabledReason) {
      this.fileActionError = action.disabledReason;
      return;
    }
    this.closeFileContextMenu();
    switch (action.id) {
      case 'enter-folder':
        await this.enterSelectedFolder();
        break;
      case 'stat':
        await this.statSelectedFile();
        break;
      case 'move':
        await this.moveSelectedFile();
        break;
      case 'delete':
        await this.deleteSelectedFile();
        break;
      case 'download':
        await this.downloadSelectedFile();
        break;
      case 'upload':
        await this.uploadFile();
        break;
    }
  }

  handleFileRowKeydown(event: KeyboardEvent, row: Record<string, string | number | boolean | null>): void {
    if (this.mode !== 'files') {
      return;
    }
    const path = this.rowText(row, 'path');
    if (path && path !== this.selectedFilePath) {
      this.selectFileRow(row);
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectAdjacentFileRow(row, event.key === 'ArrowDown' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void (this.selectedFileIsDirectory ? this.enterSelectedFolder() : this.statSelectedFile());
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.selectFileRow(row);
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      this.focusMoveTargetInput();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      void this.deleteSelectedFile();
      return;
    }

    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      this.openFileRowContextMenu(event, row);
      return;
    }

    if ((event.key === 'i' || event.key === 'I') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.statSelectedFile();
      return;
    }

    if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.downloadSelectedFile();
      return;
    }
  }

  openFileRowContextMenu(event: MouseEvent | KeyboardEvent, row: Record<string, string | number | boolean | null>): void {
    event.preventDefault();
    event.stopPropagation();
    const path = this.rowText(row, 'path');
    if (path !== this.selectedFilePath) {
      this.selectFileRow(row);
    }
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const rect = target?.getBoundingClientRect();
    const mouseEvent = event instanceof MouseEvent ? event : null;
    const x = mouseEvent && mouseEvent.clientX > 0 ? mouseEvent.clientX : (rect?.left ?? 24) + 24;
    const y = mouseEvent && mouseEvent.clientY > 0 ? mouseEvent.clientY : (rect?.top ?? 24) + 24;
    this.fileContextMenuX = Math.max(8, Math.min(x, window.innerWidth - 280));
    this.fileContextMenuY = Math.max(8, Math.min(y, window.innerHeight - 320));
    this.fileContextMenuOpen = true;
    setTimeout(() => {
      const firstEnabled = document.querySelector<HTMLElement>(
        '[data-testid="ssh-file-row-context-menu"] button:not(:disabled)',
      );
      firstEnabled?.focus();
    }, 0);
  }

  handleFileContextMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeFileContextMenu();
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.fileContextMenuOpen) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-testid="ssh-file-row-context-menu"]')) {
      return;
    }
    this.closeFileContextMenu();
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
    this.fileDeleteResult = null;
    this.fileMoveResult = null;
    this.fileActionMessage = '';
    this.fileActionError = '';
    this.pendingDeletePath = '';
    this.lastTransferDirection = '';
  }

  private clearFileSelection(): void {
    this.selectedFileEntry = null;
    this.downloadLocalPath = '/tmp/switchboardos-file-browser-download';
    this.uploadRemotePath = this.joinRemotePath(this.path || '.', 'switchboardos-upload.txt');
    this.moveTargetPath = '';
    this.pendingDeletePath = '';
    this.closeFileContextMenu();
  }

  private async refreshFileListAfterMutation(deletedPath: string): Promise<void> {
    const api = getSwitchboardApi();
    if (!api || !this.selectedHostId) {
      return;
    }
    const fileResult = await api.sshFile.list({
      hostId: this.selectedHostId,
      path: this.path || '.',
      limit: this.limit,
    });
    this.result = this.mapSshFileListResult(fileResult);
    this.statusMessage = this.result.summary;
    if (this.selectedFilePath === deletedPath) {
      this.clearFileSelection();
    }
  }

  private async refreshFileListAfterMove(targetPath: string): Promise<void> {
    const api = getSwitchboardApi();
    if (!api || !this.selectedHostId) {
      return;
    }
    const fileResult = await api.sshFile.list({
      hostId: this.selectedHostId,
      path: this.path || '.',
      limit: this.limit,
    });
    this.result = this.mapSshFileListResult(fileResult);
    this.statusMessage = this.result.summary;
    const movedRow = this.result.rows.find((row) => this.rowText(row, 'path') === targetPath);
    if (movedRow) {
      this.selectFileRow(movedRow);
    } else {
      this.clearFileSelection();
    }
    this.moveTargetPath = targetPath;
  }

  private rowText(row: Record<string, string | number | boolean | null>, key: string): string {
    const value = row[key];
    return value === null || value === undefined ? '' : String(value);
  }

  private rowNumber(row: Record<string, string | number | boolean | null>, key: string): number | null {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  }

  rowFileActionIds(row: Record<string, string | number | boolean | null>): string {
    const type = this.normalizedFileType(this.rowText(row, 'type'));
    const ids: FileObjectActionId[] = ['stat', 'move', 'delete', 'upload'];
    if (type === 'directory') {
      ids.unshift('enter-folder');
    }
    if (type === 'file') {
      ids.push('download');
    }
    return ids.join(',');
  }

  fileRowLabel(row: Record<string, string | number | boolean | null>): string {
    const name = this.rowText(row, 'name') || this.fileNameFromPath(this.rowText(row, 'path'));
    const type = this.normalizedFileType(this.rowText(row, 'type'));
    return `${type === 'directory' ? 'Folder' : 'File'} ${name}. Press Enter to ${type === 'directory' ? 'enter folder' : 'get info'}, Shift F10 for actions.`;
  }

  private normalizedFileType(value: string): SshFileEntry['type'] {
    if (value === 'file' || value === 'directory' || value === 'symlink' || value === 'other' || value === 'unknown') {
      return value;
    }
    return 'unknown';
  }

  private fileNameFromPath(remotePath: string): string {
    return remotePath.split('/').filter(Boolean).pop() || 'remote-file';
  }

  private parentRemotePath(remotePath: string): string {
    const trimmed = remotePath.trim();
    if (!trimmed || trimmed === '/') {
      return '.';
    }
    const normalized = trimmed.replace(/\/+$/, '');
    const index = normalized.lastIndexOf('/');
    if (index <= 0) {
      return '.';
    }
    return normalized.slice(0, index);
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

  private defaultUploadRemotePathForSelection(remotePath: string, type: SshFileEntry['type']): string {
    const uploadName = 'switchboardos-upload.txt';
    if (type === 'directory') {
      return this.joinRemotePath(remotePath, uploadName);
    }
    return this.joinRemotePath(this.parentRemotePath(remotePath), uploadName);
  }

  private selectAdjacentFileRow(
    currentRow: Record<string, string | number | boolean | null>,
    delta: 1 | -1,
  ): void {
    const rows = this.result?.rows ?? [];
    if (rows.length === 0) {
      return;
    }
    const currentPath = this.rowText(currentRow, 'path');
    const currentIndex = rows.findIndex((row) => this.rowText(row, 'path') === currentPath);
    const nextIndex = Math.max(0, Math.min(rows.length - 1, (currentIndex === -1 ? 0 : currentIndex) + delta));
    const nextRow = rows[nextIndex];
    this.selectFileRow(nextRow);
    this.focusFileRow(this.selectedFilePath);
  }

  private focusFileRow(path: string): void {
    setTimeout(() => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('tr[data-remote-path]'));
      rows.find((row) => row.getAttribute('data-remote-path') === path)?.focus();
    }, 0);
  }

  private focusMoveTargetInput(): void {
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-testid="ssh-file-move-target-path"]')?.focus();
    }, 0);
  }

  private closeFileContextMenu(): void {
    this.fileContextMenuOpen = false;
  }
}
