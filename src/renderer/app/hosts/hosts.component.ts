import { Component, OnInit } from '@angular/core';
import type {
  ConnectionTestResult,
  CreateHostInput,
  HostAuthMode,
  HostRecord,
  UpdateHostInput,
} from '../../../shared/mvp-models';

type FormMode = 'create' | 'edit';

interface HostFormModel {
  name: string;
  address: string;
  hostname: string;
  port: number;
  username: string;
  authMode: HostAuthMode;
  tags: string;
  notes: string;
}

interface SwitchboardHostApi {
  host: {
    list: () => Promise<HostRecord[]>;
    create: (data: CreateHostInput) => Promise<HostRecord>;
    update: (id: string, data: UpdateHostInput) => Promise<HostRecord | null>;
    remove: (id: string) => Promise<boolean>;
    testConnection: (id: string) => Promise<ConnectionTestResult>;
  };
}

function getSwitchboardApi(): SwitchboardHostApi | undefined {
  return (window as unknown as { sb?: SwitchboardHostApi }).sb;
}

function createEmptyForm(): HostFormModel {
  return {
    name: '',
    address: '',
    hostname: '',
    port: 22,
    username: '',
    authMode: 'placeholder',
    tags: '',
    notes: '',
  };
}

@Component({
  selector: 'app-hosts',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Hosts</h1>
          <p>Local SSH profile inventory backed by the MVP store.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="secondary-action" (click)="loadHosts()" [disabled]="isLoading">
            Refresh
          </button>
          <button type="button" class="primary-action" (click)="beginCreate()">
            Add host
          </button>
        </div>
      </header>

      <p *ngIf="statusMessage" class="notice">{{ statusMessage }}</p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="layout">
        <article class="panel inventory-panel">
          <div class="panel-heading">
            <h2>Host inventory</h2>
            <span>{{ filteredHosts.length }} of {{ hosts.length }} records</span>
          </div>

          <div class="toolbar">
            <label class="search-field">
              <span>Search</span>
              <input
                name="searchText"
                type="search"
                placeholder="Name, host, user, or tag"
                [(ngModel)]="searchText"
              />
            </label>
          </div>

          <div *ngIf="isLoading" class="empty-state">
            <strong>Loading hosts</strong>
            <p>Reading the local inventory store.</p>
          </div>

          <div *ngIf="!isLoading && filteredHosts.length === 0" class="empty-state">
            <strong>No hosts yet</strong>
            <p *ngIf="hosts.length === 0">Add a host profile to start building the local inventory.</p>
            <p *ngIf="hosts.length > 0">No host profiles match the current search.</p>
          </div>

          <div *ngIf="!isLoading && filteredHosts.length > 0" class="host-list" aria-label="Host inventory">
            <article
              *ngFor="let host of filteredHosts; trackBy: trackHost"
              class="host-row"
              [class.is-selected]="host.id === editingHostId"
            >
              <div class="host-main">
                <div class="host-title-line">
                  <h3>{{ host.name }}</h3>
                  <span class="status-chip" [ngClass]="statusClass(host.lastConnectionStatus)">
                    {{ statusLabel(host.lastConnectionStatus) }}
                  </span>
                </div>
                <div class="host-meta">
                  <span>{{ host.address || host.hostname }}</span>
                  <span>{{ host.username || 'No user' }}</span>
                  <span>Port {{ host.port }}</span>
                  <span>{{ authLabel(host.authMode) }}</span>
                </div>
                <div *ngIf="host.tags.length > 0" class="tag-list" aria-label="Host tags">
                  <span *ngFor="let tag of host.tags">{{ tag }}</span>
                </div>
                <p *ngIf="host.notes" class="host-notes">{{ host.notes }}</p>
                <p *ngIf="host.lastCheckedAt" class="host-checked">
                  Last checked {{ formatDate(host.lastCheckedAt) }}
                </p>
              </div>

              <div class="host-actions" aria-label="Host actions">
                <button
                  type="button"
                  class="secondary-action"
                  (click)="testConnection(host)"
                  [disabled]="isTestingHostId === host.id"
                >
                  Test
                </button>
                <button type="button" class="secondary-action" (click)="beginEdit(host)">
                  Edit
                </button>
                <button type="button" class="danger-action" (click)="deleteHost(host)">
                  Delete
                </button>
              </div>
            </article>
          </div>
        </article>

        <aside class="panel form-panel">
          <div class="panel-heading">
            <h2>{{ formMode === 'edit' ? 'Edit host' : 'Add host' }}</h2>
            <span>{{ formMode === 'edit' ? 'Existing profile' : 'New profile' }}</span>
          </div>

          <form class="host-form" (ngSubmit)="saveHost()">
            <label>
              Display name
              <input
                name="name"
                type="text"
                autocomplete="off"
                required
                [(ngModel)]="form.name"
              />
            </label>
            <label>
              Hostname or IP
              <input
                name="address"
                type="text"
                autocomplete="off"
                required
                [(ngModel)]="form.address"
              />
            </label>
            <label>
              SSH hostname override
              <input
                name="hostname"
                type="text"
                autocomplete="off"
                placeholder="Optional"
                [(ngModel)]="form.hostname"
              />
            </label>
            <div class="field-row">
              <label>
                Port
                <input
                  name="port"
                  type="number"
                  min="1"
                  max="65535"
                  required
                  [(ngModel)]="form.port"
                />
              </label>
              <label>
                Auth
                <select name="authMode" [(ngModel)]="form.authMode">
                  <option *ngFor="let mode of authModes" [ngValue]="mode.value">
                    {{ mode.label }}
                  </option>
                </select>
              </label>
            </div>
            <label>
              Username
              <input
                name="username"
                type="text"
                autocomplete="username"
                [(ngModel)]="form.username"
              />
            </label>
            <label>
              Tags
              <input
                name="tags"
                type="text"
                autocomplete="off"
                placeholder="production, database"
                [(ngModel)]="form.tags"
              />
            </label>
            <label>
              Notes
              <textarea
                name="notes"
                rows="4"
                [(ngModel)]="form.notes"
              ></textarea>
            </label>

            <div class="form-actions">
              <button
                type="submit"
                class="primary-action"
                [disabled]="!formIsValid || isSaving"
              >
                {{ formMode === 'edit' ? 'Save changes' : 'Save host' }}
              </button>
              <button type="button" class="secondary-action" (click)="beginCreate()">
                Clear
              </button>
            </div>
          </form>
        </aside>
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
    label,
    .host-meta,
    .host-checked {
      color: #94a3b8;
      font-size: 12px;
    }

    h3 {
      margin: 0;
      color: #f8fafc;
      font-size: 14px;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 12px;
      align-items: flex-start;
    }

    .panel {
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
      padding: 16px;
    }

    .inventory-panel {
      min-height: 420px;
    }

    .header-actions,
    .form-actions,
    .host-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .toolbar {
      margin-top: 14px;
    }

    .search-field {
      max-width: 420px;
    }

    .host-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }

    .host-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #111827;
      padding: 14px;
    }

    .host-row.is-selected {
      border-color: #38bdf8;
      background: #122033;
    }

    .host-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .host-title-line,
    .host-meta,
    .tag-list {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .host-meta span {
      overflow-wrap: anywhere;
    }

    .host-notes {
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .tag-list span,
    .status-chip {
      border: 1px solid #334155;
      border-radius: 999px;
      background: #1f2937;
      color: #cbd5e1;
      padding: 3px 8px;
      font-size: 11px;
      line-height: 1.2;
      white-space: nowrap;
    }

    .status-chip.status-untested {
      border-color: #334155;
      color: #cbd5e1;
    }

    .status-chip.status-stubbed {
      border-color: #92400e;
      background: #271607;
      color: #fcd34d;
    }

    .status-chip.status-success {
      border-color: #166534;
      background: #052e16;
      color: #bbf7d0;
    }

    .status-chip.status-failed {
      border-color: #991b1b;
      background: #2f1212;
      color: #fecaca;
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

    .primary-action,
    .secondary-action,
    .danger-action {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #1f2937;
      color: #e5e7eb;
      padding: 7px 10px;
      font-size: 12px;
      min-height: 32px;
      cursor: pointer;
    }

    .primary-action {
      border-color: #2563eb;
      background: #1d4ed8;
      color: #eff6ff;
    }

    .danger-action {
      border-color: #7f1d1d;
      background: #2f1212;
      color: #fecaca;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .host-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 14px;
    }

    .field-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    input,
    select,
    textarea {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #101318;
      color: #cbd5e1;
      padding: 8px;
      font: inherit;
      font-size: 12px;
      min-width: 0;
    }

    textarea {
      resize: vertical;
      min-height: 92px;
    }

    @media (max-width: 1000px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .page-header {
        flex-direction: column;
      }

      .host-row {
        display: flex;
        flex-direction: column;
      }

      .host-actions,
      .header-actions {
        width: 100%;
      }

      .host-actions button,
      .header-actions button,
      .form-actions button {
        flex: 1;
      }
    }
    `,
  ],
})
export class HostsComponent implements OnInit {
  hosts: HostRecord[] = [];
  searchText = '';
  formMode: FormMode = 'create';
  form: HostFormModel = createEmptyForm();
  editingHostId: string | null = null;
  isLoading = false;
  isSaving = false;
  isTestingHostId: string | null = null;
  statusMessage = '';
  errorMessage = '';

  readonly authModes: Array<{ value: HostAuthMode; label: string }> = [
    { value: 'placeholder', label: 'Placeholder' },
    { value: 'password', label: 'Password' },
    { value: 'key', label: 'SSH key' },
    { value: 'agent', label: 'Agent' },
  ];

  ngOnInit(): void {
    void this.loadHosts();
  }

  get filteredHosts(): HostRecord[] {
    const search = this.searchText.trim().toLowerCase();
    if (!search) {
      return this.hosts;
    }

    return this.hosts.filter((host) => {
      const fields = [
        host.name,
        host.address,
        host.hostname,
        host.username,
        host.authMode,
        host.notes,
        ...host.tags,
      ];
      return fields.some((field) => field.toLowerCase().includes(search));
    });
  }

  get formIsValid(): boolean {
    const port = Number(this.form.port);
    return Boolean(this.form.name.trim())
      && Boolean(this.form.address.trim())
      && Number.isInteger(port)
      && port >= 1
      && port <= 65535;
  }

  async loadHosts(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Host API is unavailable. Run the app through Electron to manage local profiles.';
      this.hosts = [];
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.hosts = await api.host.list();
    } catch {
      this.errorMessage = 'Unable to load hosts from the local store.';
    } finally {
      this.isLoading = false;
    }
  }

  beginCreate(): void {
    this.formMode = 'create';
    this.editingHostId = null;
    this.form = createEmptyForm();
    this.errorMessage = '';
    this.statusMessage = '';
  }

  beginEdit(host: HostRecord): void {
    this.formMode = 'edit';
    this.editingHostId = host.id;
    this.form = {
      name: host.name,
      address: host.address || host.hostname,
      hostname: host.hostname === host.address ? '' : host.hostname,
      port: host.port,
      username: host.username,
      authMode: host.authMode,
      tags: host.tags.join(', '),
      notes: host.notes,
    };
    this.errorMessage = '';
    this.statusMessage = '';
  }

  async saveHost(): Promise<void> {
    if (!this.formIsValid || this.isSaving) {
      return;
    }

    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Host API is unavailable. Run the app through Electron to manage local profiles.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const input = this.buildHostInput();
      if (this.formMode === 'edit' && this.editingHostId) {
        const updated = await api.host.update(this.editingHostId, input);
        if (!updated) {
          this.errorMessage = 'The host no longer exists in the local store.';
          return;
        }
        this.statusMessage = `Saved ${updated.name}.`;
      } else {
        const created = await api.host.create(input);
        this.formMode = 'create';
        this.editingHostId = null;
        this.form = createEmptyForm();
        this.statusMessage = `Added ${created.name}.`;
      }
      await this.loadHosts();
    } catch {
      this.errorMessage = 'Unable to save the host profile.';
    } finally {
      this.isSaving = false;
    }
  }

  async deleteHost(host: HostRecord): Promise<void> {
    const confirmed = window.confirm(`Delete ${host.name}? This removes the local host profile.`);
    if (!confirmed) {
      return;
    }

    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Host API is unavailable. Run the app through Electron to manage local profiles.';
      return;
    }

    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const removed = await api.host.remove(host.id);
      if (!removed) {
        this.errorMessage = 'The host was already removed.';
        return;
      }
      if (this.editingHostId === host.id) {
        this.beginCreate();
      }
      this.statusMessage = `Deleted ${host.name}.`;
      await this.loadHosts();
    } catch {
      this.errorMessage = 'Unable to delete the host profile.';
    }
  }

  async testConnection(host: HostRecord): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Host API is unavailable. Run the app through Electron to manage local profiles.';
      return;
    }

    this.isTestingHostId = host.id;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const result = await api.host.testConnection(host.id);
      this.statusMessage = result.message;
      await this.loadHosts();
    } catch {
      this.errorMessage = 'Unable to run the connection reachability check.';
    } finally {
      this.isTestingHostId = null;
    }
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  statusLabel(status: HostRecord['lastConnectionStatus']): string {
    switch (status) {
      case 'stubbed':
        return 'Stubbed (legacy)';
      case 'success':
        return 'Reachable';
      case 'failed':
        return 'Failed';
      default:
        return 'Untested';
    }
  }

  statusClass(status: HostRecord['lastConnectionStatus']): string {
    return `status-${status}`;
  }

  authLabel(mode: HostAuthMode): string {
    return this.authModes.find((item) => item.value === mode)?.label ?? mode;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  private buildHostInput(): CreateHostInput {
    const address = this.form.address.trim();
    const hostname = this.form.hostname.trim() || address;
    return {
      name: this.form.name.trim(),
      address,
      hostname,
      port: Number(this.form.port),
      username: this.form.username.trim(),
      authMode: this.form.authMode,
      tags: this.parseTags(this.form.tags),
      notes: this.form.notes.trim(),
    };
  }

  private parseTags(value: string): string[] {
    return Array.from(new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    ));
  }
}
