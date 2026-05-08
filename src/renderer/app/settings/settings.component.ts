import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { HostAuthMode, MvpSettings, MvpSettingsUpdate } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

interface SettingsFormModel {
  theme: MvpSettings['theme'];
  defaultWindowBehavior: MvpSettings['defaultWindowBehavior'];
  sshPort: number;
  sshUsername: string;
  sshAuthMode: HostAuthMode;
  sshConnectTimeoutMs: number;
  operatorEndpoint: string;
  operatorPolicy: MvpSettings['operator']['policy'];
}

function createDefaultForm(): SettingsFormModel {
  return {
    theme: 'dark',
    defaultWindowBehavior: 'floating',
    sshPort: 22,
    sshUsername: '',
    sshAuthMode: 'placeholder',
    sshConnectTimeoutMs: 10000,
    operatorEndpoint: '',
    operatorPolicy: 'manual-approval',
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

            <article class="panel">
              <div class="panel-heading">
                <h2>Operator endpoint</h2>
                <span>Read-only execution state</span>
              </div>
              <p class="panel-note">
                The endpoint and policy are local configuration only. Agent actions remain disabled in this MVP shell.
              </p>
              <div class="field-grid">
                <label class="wide-field">
                  Endpoint URL
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
    label,
    .muted,
    .panel-heading span {
      color: #94a3b8;
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
      border: 1px solid #166534;
      color: #bbf7d0;
      background: #052e16;
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
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
    }

    .panel:nth-child(3) {
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

    .wide-field {
      grid-column: 1 / -1;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    input,
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

    .primary-action,
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

    .primary-action {
      border-color: #2563eb;
      background: #1d4ed8;
      color: #eff6ff;
    }

    button:disabled,
    fieldset:disabled {
      cursor: not-allowed;
      opacity: 0.65;
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
      .settings-grid,
      .field-grid {
        grid-template-columns: 1fr;
      }

      .panel:nth-child(3),
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
  isLoading = false;
  isSaving = false;
  savedMessage = '';
  errorMessage = '';

  readonly authModes: Array<{ value: HostAuthMode; label: string }> = [
    { value: 'placeholder', label: 'Placeholder' },
    { value: 'key', label: 'SSH key' },
    { value: 'agent', label: 'Agent' },
    { value: 'password', label: 'Password' },
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
      const settings = await api.settings.get();
      this.form = this.toForm(settings);
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
  }

  private toForm(settings: MvpSettings): SettingsFormModel {
    return {
      theme: settings.theme,
      defaultWindowBehavior: settings.defaultWindowBehavior,
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
}
