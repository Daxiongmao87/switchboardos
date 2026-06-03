import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type {
  AgentEndpoint,
  CreateAgentEndpointInput,
  HostAuthMode,
  MvpSettings,
  MvpSettingsUpdate,
  UpdateAgentEndpointInput,
} from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

interface SettingsFormModel {
  theme: MvpSettings['theme'];
  defaultWindowBehavior: MvpSettings['defaultWindowBehavior'];
  desktopWallpaper: MvpSettings['desktopWallpaper'];
  desktopWallpaperLayout: MvpSettings['desktopWallpaperLayout'];
  sshPort: number;
  sshUsername: string;
  sshAuthMode: HostAuthMode;
  sshConnectTimeoutMs: number;
  operatorEndpoint: string;
  operatorPolicy: MvpSettings['operator']['policy'];
}

interface EndpointFormModel {
  name: string;
  provider: string;
  baseUrl: string;
  credentialRefId: string;
  model: string;
  contextLimit: number;
  toolUse: boolean;
  streaming: boolean;
  policy: AgentEndpoint['policy'];
  enabled: boolean;
}

function createDefaultForm(): SettingsFormModel {
  return {
    theme: 'dark',
    defaultWindowBehavior: 'floating',
    desktopWallpaper: 'default',
    desktopWallpaperLayout: 'fill',
    sshPort: 22,
    sshUsername: '',
    sshAuthMode: 'placeholder',
    sshConnectTimeoutMs: 10000,
    operatorEndpoint: '',
    operatorPolicy: 'manual-approval',
  };
}

function createDefaultEndpointForm(): EndpointFormModel {
  return {
    name: 'OpenAI-compatible Operator',
    provider: 'openai-compatible',
    baseUrl: '',
    credentialRefId: '',
    model: '',
    contextLimit: 8192,
    toolUse: true,
    streaming: false,
    policy: 'safe',
    enabled: true,
  };
}

@Component({
  selector: 'sb-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Settings</h1>
          <p>Local-first MVP defaults persisted through the renderer preload API.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">Local settings</span>
          <button type="button" class="secondary-action" (click)="loadSettings()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p *ngIf="savedMessage" class="notice">{{ savedMessage }}</p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <form class="settings-form" (ngSubmit)="saveSettings()">
        <fieldset [disabled]="isLoading || isSaving">
          <section class="settings-grid">
            <article class="panel">
              <div class="panel-heading">
                <h2>Appearance</h2>
                <span>Renderer preference</span>
              </div>
              <div class="field-grid">
                <label>
                  Theme
                  <select name="theme" [(ngModel)]="form.theme" (ngModelChange)="clearMessages()">
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </label>
                <label>
                  Window behavior
                  <select
                    name="defaultWindowBehavior"
                    [(ngModel)]="form.defaultWindowBehavior"
                    (ngModelChange)="clearMessages()"
                  >
                    <option value="floating">Floating</option>
                    <option value="tile-right">Tile right</option>
                    <option value="tile-bottom">Tile bottom</option>
                  </select>
                </label>
                <label class="wide-field">
                  Desktop wallpaper
                  <select
                    name="desktopWallpaper"
                    [(ngModel)]="form.desktopWallpaper"
                    (ngModelChange)="clearMessages()"
                  >
                    <option value="default">Default wallpaper</option>
                    <option value="grid">Grid</option>
                    <option value="topology">Topology</option>
                    <option value="plain">Plain</option>
                  </select>
                </label>
                <label class="wide-field">
                  Wallpaper layout
                  <select
                    name="desktopWallpaperLayout"
                    [(ngModel)]="form.desktopWallpaperLayout"
                    (ngModelChange)="clearMessages()"
                  >
                    <option value="stretch">Stretch</option>
                    <option value="fit">Fit</option>
                    <option value="fill">Fill</option>
                    <option value="fit-tile">Fit with tile</option>
                    <option value="tile-original">Tile with original size</option>
                    <option value="center">Center</option>
                  </select>
                </label>
              </div>
            </article>

            <article class="panel">
              <div class="panel-heading">
                <h2>SSH defaults</h2>
                <span>Placeholders only</span>
              </div>
              <p class="panel-note">
                These values seed local host profiles. No SSH connection or secret storage is performed here.
              </p>
              <div class="field-grid">
                <label>
                  Port
                  <input
                    name="sshPort"
                    type="number"
                    min="1"
                    max="65535"
                    required
                    [(ngModel)]="form.sshPort"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Username
                  <input
                    name="sshUsername"
                    type="text"
                    autocomplete="username"
                    [(ngModel)]="form.sshUsername"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Auth mode
                  <select name="sshAuthMode" [(ngModel)]="form.sshAuthMode" (ngModelChange)="clearMessages()">
                    <option *ngFor="let mode of authModes" [ngValue]="mode.value">
                      {{ mode.label }}
                    </option>
                  </select>
                </label>
                <label>
                  Timeout (ms)
                  <input
                    name="sshConnectTimeoutMs"
                    type="number"
                    min="1"
                    required
                    [(ngModel)]="form.sshConnectTimeoutMs"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
              </div>
            </article>

            <article class="panel operator-panel">
              <div class="panel-heading">
                <h2>Operator policy</h2>
                <span>Approval gate</span>
              </div>
              <p class="panel-note">
                Operator actions require explicit approval before dispatch. Disabled blocks privileged Operator execution while leaving settings recoverable.
              </p>
              <div class="field-grid">
                <label class="wide-field">
                  Legacy endpoint note
                  <input
                    name="operatorEndpoint"
                    type="url"
                    placeholder="http://localhost:..."
                    [(ngModel)]="form.operatorEndpoint"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Policy
                  <select
                    name="operatorPolicy"
                    [(ngModel)]="form.operatorPolicy"
                    (ngModelChange)="clearMessages()"
                  >
                    <option value="manual-approval">Manual approval</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
          </article>

            <article class="panel endpoint-panel">
              <div class="panel-heading">
                <h2>Agent endpoints</h2>
                <span>{{ endpoints.length }} configured</span>
              </div>
              <p class="panel-note">
                Provider records store model/runtime settings locally. API key material is written only through the secret vault and referenced by ID.
              </p>

              <div class="endpoint-toolbar">
                <label>
                  Endpoint record
                  <select
                    name="selectedEndpointId"
                    [(ngModel)]="selectedEndpointId"
                    (ngModelChange)="selectEndpoint($event)"
                  >
                    <option value="new">New endpoint</option>
                    <option *ngFor="let endpoint of endpoints; trackBy: trackEndpoint" [value]="endpoint.id">
                      {{ endpoint.name }} - {{ endpoint.model || 'no model' }}
                    </option>
                  </select>
                </label>
                <button type="button" class="secondary-action" (click)="resetEndpointForm()">New</button>
                <button
                  type="button"
                  class="danger-action"
                  (click)="deleteEndpoint()"
                  [disabled]="selectedEndpointId === 'new' || isSavingEndpoint"
                >
                  Delete
                </button>
              </div>

              <div class="field-grid">
                <label>
                  Name
                  <input
                    name="endpointName"
                    type="text"
                    required
                    [(ngModel)]="endpointForm.name"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Provider
                  <select
                    name="endpointProvider"
                    [(ngModel)]="endpointForm.provider"
                    (ngModelChange)="clearMessages()"
                  >
                    <option *ngFor="let provider of providerOptions" [value]="provider.value">{{ provider.label }}</option>
                  </select>
                </label>
                <label class="wide-field">
                  Base URL
                  <input
                    name="endpointBaseUrl"
                    type="url"
                    placeholder="https://api.openai.com/v1"
                    [(ngModel)]="endpointForm.baseUrl"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Model
                  <input
                    name="endpointModel"
                    type="text"
                    placeholder="gpt-4.1-mini"
                    [(ngModel)]="endpointForm.model"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Context limit
                  <input
                    name="endpointContextLimit"
                    type="number"
                    min="1024"
                    max="1000000"
                    [(ngModel)]="endpointForm.contextLimit"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label class="wide-field">
                  API key reference
                  <input
                    name="endpointCredentialRefId"
                    type="text"
                    placeholder="operator-openai-api-key"
                    [(ngModel)]="endpointForm.credentialRefId"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label class="wide-field">
                  Store or rotate API key
                  <input
                    name="endpointSecretValue"
                    type="password"
                    autocomplete="new-password"
                    placeholder="Stored only in encrypted secret vault when available"
                    [(ngModel)]="endpointSecretValue"
                    (ngModelChange)="clearMessages()"
                  />
                </label>
                <label>
                  Default policy
                  <select
                    name="endpointPolicy"
                    [(ngModel)]="endpointForm.policy"
                    (ngModelChange)="clearMessages()"
                  >
                    <option *ngFor="let policy of endpointPolicyOptions" [value]="policy.value">{{ policy.label }}</option>
                  </select>
                </label>
                <label class="checkbox-field">
                  <input name="endpointToolUse" type="checkbox" [(ngModel)]="endpointForm.toolUse" />
                  Tool use capable
                </label>
                <label class="checkbox-field">
                  <input name="endpointStreaming" type="checkbox" [(ngModel)]="endpointForm.streaming" />
                  Streaming capable
                </label>
                <label class="checkbox-field">
                  <input name="endpointEnabled" type="checkbox" [(ngModel)]="endpointForm.enabled" />
                  Enabled
                </label>
              </div>

              <div class="form-actions endpoint-actions">
                <button
                  type="button"
                  class="primary-action"
                  (click)="saveEndpoint()"
                  [disabled]="!endpointFormIsValid || isSavingEndpoint"
                >
                  {{ isSavingEndpoint ? 'Saving endpoint' : endpointSaveLabel }}
                </button>
                <span *ngIf="endpointMessage" class="muted">{{ endpointMessage }}</span>
              </div>
            </article>
          </section>
        </fieldset>

        <div class="form-actions">
          <button type="submit" class="primary-action" [disabled]="!formIsValid || isLoading || isSaving">
            {{ isSaving ? 'Saving' : 'Save settings' }}
          </button>
          <span *ngIf="isLoading" class="muted">Loading local settings.</span>
        </div>
      </form>
    </div>
  `,
  styles: [
    `
    .page {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      color: var(--color-text-primary);
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
    label,
    .muted,
    .panel-heading span {
      color: var(--color-text-secondary);
      font-size: 12px;
    }

    .header-actions,
    .form-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .status-pill {
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      background: var(--color-surface);
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      white-space: nowrap;
    }

    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      min-width: 0;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .panel {
      padding: 16px;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 6px;
    }

    .operator-panel,
    .endpoint-panel {
      grid-column: 1 / -1;
    }

    .panel-note {
      margin-top: 10px;
      line-height: 1.45;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    .endpoint-toolbar {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 14px;
    }

    .endpoint-toolbar label {
      min-width: min(100%, 320px);
      flex: 1;
    }

    .wide-field {
      grid-column: 1 / -1;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .checkbox-field {
      min-height: 34px;
      justify-content: end;
      flex-direction: row;
      align-items: center;
      color: var(--color-text-secondary);
    }

    .checkbox-field input {
      width: auto;
      min-height: auto;
    }

    input,
    select {
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-bg-primary);
      color: var(--color-text-secondary);
      padding: 8px;
      font: inherit;
      font-size: 12px;
      min-width: 0;
    }

    .primary-action,
    .secondary-action,
    .danger-action {
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
      padding: 7px 10px;
      min-height: 32px;
      font-size: 12px;
      cursor: pointer;
    }

    .primary-action {
      border-color: var(--color-accent);
      background: var(--color-accent);
      color: var(--color-text-primary);
    }

    .danger-action {
      border-color: #7f1d1d;
      background: #451a1a;
      color: #fecaca;
    }

    button:disabled,
    fieldset:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }

    .notice {
      border: 1px solid var(--color-accent);
      border-radius: 6px;
      background: var(--color-surface);
      color: var(--color-text-secondary);
      padding: 10px 12px;
    }

    .notice.error {
      border-color: #991b1b;
      background: #2f1212;
      color: #fecaca;
    }

    @media (max-width: 900px) {
      .settings-grid,
      .field-grid {
        grid-template-columns: 1fr;
      }

      .operator-panel,
      .endpoint-panel,
      .wide-field {
        grid-column: auto;
      }
    }

    @media (max-width: 640px) {
      .page-header {
        flex-direction: column;
      }

      .header-actions,
      .form-actions {
        align-items: stretch;
        flex-direction: column;
      }
    }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  form: SettingsFormModel = createDefaultForm();
  endpointForm: EndpointFormModel = createDefaultEndpointForm();
  endpoints: AgentEndpoint[] = [];
  selectedEndpointId = 'new';
  endpointSecretValue = '';
  endpointMessage = '';
  isLoading = false;
  isSaving = false;
  isSavingEndpoint = false;
  savedMessage = '';
  errorMessage = '';

  readonly authModes: Array<{ value: HostAuthMode; label: string }> = [
    { value: 'placeholder', label: 'Placeholder' },
    { value: 'key', label: 'SSH key' },
    { value: 'agent', label: 'Agent' },
    { value: 'password', label: 'Password' },
  ];
  readonly providerOptions = [
    { value: 'openai-compatible', label: 'OpenAI-compatible' },
    { value: 'anthropic-compatible', label: 'Anthropic-compatible' },
    { value: 'local-compatible', label: 'Local compatible' },
    { value: 'custom', label: 'Custom' },
  ];
  readonly endpointPolicyOptions: Array<{ value: AgentEndpoint['policy']; label: string }> = [
    { value: 'safe', label: 'Safe' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'permissive', label: 'Permissive' },
    { value: 'full-trust', label: 'Full Trust' },
  ];

  ngOnInit(): void {
    void this.loadSettings();
  }

  get formIsValid(): boolean {
    const port = Number(this.form.sshPort);
    const timeout = Number(this.form.sshConnectTimeoutMs);
    return Number.isInteger(port)
      && port >= 1
      && port <= 65535
      && Number.isInteger(timeout)
      && timeout > 0;
  }

  get endpointFormIsValid(): boolean {
    const contextLimit = Number(this.endpointForm.contextLimit);
    return Boolean(this.endpointForm.name.trim())
      && Boolean(this.endpointForm.provider.trim())
      && Boolean(this.endpointForm.baseUrl.trim())
      && Boolean(this.endpointForm.model.trim())
      && Number.isInteger(contextLimit)
      && contextLimit >= 1024;
  }

  get endpointSaveLabel(): string {
    return this.selectedEndpointId === 'new' ? 'Create endpoint' : 'Update endpoint';
  }

  async loadSettings(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Settings API is unavailable. Run the app through Electron to persist local defaults.';
      return;
    }

    this.isLoading = true;
    this.savedMessage = '';
    this.errorMessage = '';
    try {
      const [settings, endpoints] = await Promise.all([
        api.settings.get(),
        api.agentEndpoint.list(),
      ]);
      this.form = this.toForm(settings);
      this.endpoints = endpoints;
      this.syncEndpointFormAfterLoad();
      this.applyTheme(settings.theme);
    } catch {
      this.errorMessage = 'Unable to load MVP settings from the local store.';
    } finally {
      this.isLoading = false;
    }
  }

  async saveSettings(): Promise<void> {
    if (!this.formIsValid || this.isSaving) {
      return;
    }

    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Settings API is unavailable. Run the app through Electron to persist local defaults.';
      return;
    }

    this.isSaving = true;
    this.savedMessage = '';
    this.errorMessage = '';
    try {
      const settings = await api.settings.update(this.toUpdate());
      this.form = this.toForm(settings);
      this.applyTheme(settings.theme);
      window.postMessage(
        {
          type: 'sb:settings-saved',
          theme: settings.theme,
          desktopWallpaper: settings.desktopWallpaper,
          desktopWallpaperLayout: settings.desktopWallpaperLayout,
        },
        '*',
      );
      this.savedMessage = 'Saved local MVP settings.';
    } catch {
      this.errorMessage = 'Unable to save MVP settings to the local store.';
    } finally {
      this.isSaving = false;
    }
  }

  clearMessages(): void {
    this.savedMessage = '';
    this.errorMessage = '';
    this.endpointMessage = '';
  }

  selectEndpoint(endpointId: string): void {
    this.selectedEndpointId = endpointId || 'new';
    const endpoint = this.endpoints.find((candidate) => candidate.id === this.selectedEndpointId);
    this.endpointSecretValue = '';
    this.endpointForm = endpoint ? this.endpointToForm(endpoint) : createDefaultEndpointForm();
    this.clearMessages();
  }

  resetEndpointForm(): void {
    this.selectedEndpointId = 'new';
    this.endpointForm = createDefaultEndpointForm();
    this.endpointSecretValue = '';
    this.clearMessages();
  }

  async saveEndpoint(): Promise<void> {
    if (!this.endpointFormIsValid || this.isSavingEndpoint) {
      return;
    }

    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Settings API is unavailable. Run the app through Electron to persist local endpoints.';
      return;
    }

    this.isSavingEndpoint = true;
    this.clearMessages();
    try {
      const payload = await this.endpointPayload(api);
      const creating = this.selectedEndpointId === 'new';
      const saved = creating
        ? await api.agentEndpoint.create(payload as CreateAgentEndpointInput)
        : await api.agentEndpoint.update(this.selectedEndpointId, payload as UpdateAgentEndpointInput);
      if (!saved) {
        throw new Error('Endpoint record was not found.');
      }
      this.endpoints = await api.agentEndpoint.list();
      this.selectedEndpointId = saved.id;
      this.endpointForm = this.endpointToForm(saved);
      this.endpointSecretValue = '';
      this.endpointMessage = creating ? 'Endpoint created.' : 'Endpoint saved.';
      this.savedMessage = 'Saved local agent endpoint configuration.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to save agent endpoint.';
    } finally {
      this.isSavingEndpoint = false;
    }
  }

  async deleteEndpoint(): Promise<void> {
    if (this.selectedEndpointId === 'new' || this.isSavingEndpoint) {
      return;
    }

    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Settings API is unavailable. Run the app through Electron to delete local endpoints.';
      return;
    }

    this.isSavingEndpoint = true;
    this.clearMessages();
    try {
      const removed = await api.agentEndpoint.remove(this.selectedEndpointId);
      if (!removed) {
        throw new Error('Endpoint record was not found.');
      }
      this.endpoints = await api.agentEndpoint.list();
      this.resetEndpointForm();
      this.endpointMessage = 'Endpoint deleted.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to delete agent endpoint.';
    } finally {
      this.isSavingEndpoint = false;
    }
  }

  trackEndpoint(_index: number, endpoint: AgentEndpoint): string {
    return endpoint.id;
  }

  private toForm(settings: MvpSettings): SettingsFormModel {
    return {
      theme: settings.theme,
      defaultWindowBehavior: settings.defaultWindowBehavior,
      desktopWallpaper: settings.desktopWallpaper,
      desktopWallpaperLayout: settings.desktopWallpaperLayout,
      sshPort: settings.sshDefaults.port,
      sshUsername: settings.sshDefaults.username,
      sshAuthMode: settings.sshDefaults.authMode,
      sshConnectTimeoutMs: settings.sshDefaults.connectTimeoutMs,
      operatorEndpoint: settings.operator.endpoint,
      operatorPolicy: settings.operator.policy,
    };
  }

  private toUpdate(): MvpSettingsUpdate {
    return {
      theme: this.form.theme,
      defaultWindowBehavior: this.form.defaultWindowBehavior,
      desktopWallpaper: this.form.desktopWallpaper,
      desktopWallpaperLayout: this.form.desktopWallpaperLayout,
      sshDefaults: {
        port: Number(this.form.sshPort),
        username: this.form.sshUsername.trim(),
        authMode: this.form.sshAuthMode,
        connectTimeoutMs: Number(this.form.sshConnectTimeoutMs),
      },
      operator: {
        endpoint: this.form.operatorEndpoint.trim(),
        policy: this.form.operatorPolicy,
      },
    };
  }

  private applyTheme(theme: MvpSettings['theme']): void {
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
    const useLight = theme === 'light' || (theme === 'system' && prefersLight);
    document.body.classList.toggle('light', useLight);
  }

  private syncEndpointFormAfterLoad(): void {
    const selected = this.endpoints.find((endpoint) => endpoint.id === this.selectedEndpointId)
      ?? this.endpoints.find((endpoint) => endpoint.enabled)
      ?? this.endpoints[0]
      ?? null;
    if (selected) {
      this.selectedEndpointId = selected.id;
      this.endpointForm = this.endpointToForm(selected);
      this.endpointSecretValue = '';
      return;
    }
    this.resetEndpointForm();
  }

  private endpointToForm(endpoint: AgentEndpoint): EndpointFormModel {
    return {
      name: endpoint.name,
      provider: endpoint.provider,
      baseUrl: endpoint.baseUrl,
      credentialRefId: endpoint.credentialRefId ?? '',
      model: endpoint.model,
      contextLimit: endpoint.contextLimit,
      toolUse: endpoint.toolUse,
      streaming: endpoint.streaming,
      policy: endpoint.policy,
      enabled: endpoint.enabled,
    };
  }

  private async endpointPayload(api: NonNullable<ReturnType<typeof getSwitchboardApi>>): Promise<CreateAgentEndpointInput | UpdateAgentEndpointInput> {
    let credentialRefId = this.endpointForm.credentialRefId.trim() || null;
    const secret = this.endpointSecretValue.trim();
    if (secret) {
      const secretKey = credentialRefId || this.defaultEndpointSecretKey();
      const stored = await api.secret.store(secretKey, secret);
      if (!stored) {
        throw new Error('Encrypted secret storage is unavailable; API key material was not stored.');
      }
      credentialRefId = secretKey;
    }

    return {
      name: this.endpointForm.name.trim(),
      provider: this.endpointForm.provider.trim(),
      baseUrl: this.endpointForm.baseUrl.trim(),
      credentialRefId,
      model: this.endpointForm.model.trim(),
      contextLimit: Number(this.endpointForm.contextLimit),
      toolUse: Boolean(this.endpointForm.toolUse),
      streaming: Boolean(this.endpointForm.streaming),
      policy: this.endpointForm.policy,
      enabled: Boolean(this.endpointForm.enabled),
    };
  }

  private defaultEndpointSecretKey(): string {
    const slug = `${this.endpointForm.provider}-${this.endpointForm.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'operator-endpoint';
    return `agent-endpoint:${slug}:api-key`;
  }
}
