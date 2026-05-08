import { Component, OnInit } from '@angular/core';
import type {
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPreset,
  BootstrapPresetId,
  HostRecord,
} from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

@Component({
  selector: 'app-bootstrap',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Bootstrap</h1>
          <p>Generate local bootstrap scripts for host setup checks.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">Generate only</span>
          <button type="button" class="secondary-action" (click)="loadData()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p class="notice">
        Script generation does not execute remotely and does not store secrets, passwords, keys, or passphrases.
      </p>
      <p *ngIf="statusMessage" class="notice success">{{ statusMessage }}</p>
      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="layout">
        <article class="panel preset-panel">
          <div class="panel-heading">
            <h2>Preset</h2>
            <span>{{ presets.length }} available</span>
          </div>

          <div *ngIf="isLoading" class="empty-state">
            <strong>Loading presets</strong>
            <p>Reading bootstrap generator options from the main process.</p>
          </div>

          <div *ngIf="!isLoading && presets.length === 0" class="empty-state">
            <strong>No presets available</strong>
            <p>The bootstrap generator did not return any presets.</p>
          </div>

          <div *ngIf="presets.length > 0" class="preset-list" aria-label="Bootstrap presets">
            <button
              *ngFor="let preset of presets; trackBy: trackPreset"
              type="button"
              class="preset-option"
              [class.is-selected]="preset.id === selectedPresetId"
              [attr.aria-pressed]="preset.id === selectedPresetId"
              (click)="selectPreset(preset.id)"
            >
              <span class="preset-name">{{ preset.name }}</span>
              <span class="preset-description">{{ preset.description }}</span>
            </button>
          </div>
        </article>

        <article class="panel controls-panel">
          <div class="panel-heading">
            <h2>Target and options</h2>
            <span>{{ selectedHost ? selectedHost.name : 'No host selected' }}</span>
          </div>

          <form class="generator-form" (ngSubmit)="generateScript()">
            <label>
              Host profile
              <select name="hostId" [(ngModel)]="selectedHostId">
                <option [ngValue]="null">No host profile</option>
                <option *ngFor="let host of hosts; trackBy: trackHost" [ngValue]="host.id">
                  {{ host.name }} - {{ host.address || host.hostname }}
                </option>
              </select>
            </label>

            <div class="selected-host" *ngIf="selectedHost">
              <dl>
                <div>
                  <dt>Address</dt>
                  <dd>{{ selectedHost.address || selectedHost.hostname }}</dd>
                </div>
                <div>
                  <dt>User</dt>
                  <dd>{{ selectedHost.username || 'Not set' }}</dd>
                </div>
                <div>
                  <dt>Port</dt>
                  <dd>{{ selectedHost.port }}</dd>
                </div>
              </dl>
            </div>

            <label class="checkbox-row">
              <input
                name="installPackages"
                type="checkbox"
                [(ngModel)]="installPackages"
              />
              <span>Include package installation commands</span>
            </label>

            <label class="checkbox-row">
              <input
                name="includeDockerCheck"
                type="checkbox"
                [(ngModel)]="includeDockerCheck"
              />
              <span>Include Docker availability check</span>
            </label>

            <button
              type="submit"
              class="primary-action"
              [disabled]="isGenerating || presets.length === 0"
            >
              {{ isGenerating ? 'Generating' : 'Generate script' }}
            </button>
          </form>
        </article>

        <article class="panel output-panel">
          <div class="panel-heading">
            <h2>Generated script</h2>
            <span>{{ generatedResult ? generatedResult.preset.name : 'Not generated' }}</span>
          </div>

          <div *ngIf="!generatedScript" class="empty-state">
            <strong>No script generated</strong>
            <p>Select a preset and generate a script to review it here.</p>
          </div>

          <div *ngIf="generatedScript" class="script-area">
            <div class="script-meta">
              <span>Generated {{ formatDate(generatedResult?.generatedAt) }}</span>
              <span>{{ generatedScriptLineCount }} lines</span>
            </div>
            <textarea
              readonly
              spellcheck="false"
              aria-label="Generated bootstrap script"
              [value]="generatedScript"
            ></textarea>
            <div class="output-actions">
              <button type="button" class="secondary-action" (click)="copyScript()">
                Copy script
              </button>
            </div>
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

    p,
    label,
    dt,
    .preset-description,
    .panel-heading span,
    .script-meta {
      color: #94a3b8;
      font-size: 12px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .status-pill {
      border: 1px solid #334155;
      background: #1f2937;
      color: #cbd5e1;
      border-radius: 999px;
      padding: 4px 10px;
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

    .layout {
      display: grid;
      grid-template-columns: minmax(220px, 0.9fr) minmax(260px, 1fr) minmax(360px, 1.6fr);
      gap: 12px;
      align-items: start;
    }

    .panel {
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
      padding: 16px;
      min-width: 0;
    }

    .panel-heading {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 12px;
    }

    .preset-list,
    .generator-form,
    .script-area {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .preset-option {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #111827;
      color: #e5e7eb;
      padding: 11px 12px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      text-align: left;
      cursor: pointer;
    }

    .preset-option:hover,
    .preset-option.is-selected {
      border-color: #3b82f6;
      background: #1f2937;
    }

    .preset-name {
      color: #f8fafc;
      font-size: 13px;
      font-weight: 600;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    select,
    textarea {
      border: 1px solid #334155;
      border-radius: 6px;
      background: #101318;
      color: #cbd5e1;
      font: inherit;
      font-size: 12px;
      min-width: 0;
    }

    select {
      min-height: 34px;
      padding: 8px;
    }

    textarea {
      min-height: 420px;
      resize: vertical;
      padding: 12px;
      line-height: 1.45;
      white-space: pre;
    }

    .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 8px;
      color: #cbd5e1;
    }

    .checkbox-row input {
      margin: 0;
    }

    .selected-host {
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #111827;
      padding: 12px;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 0;
    }

    dd {
      margin: 3px 0 0;
      color: #f8fafc;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .primary-action,
    .secondary-action {
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e5e7eb;
      padding: 8px 11px;
      min-height: 34px;
      font-size: 12px;
      cursor: pointer;
    }

    .primary-action {
      background: #1d4ed8;
      border-color: #2563eb;
    }

    .secondary-action {
      background: #1f2937;
    }

    .primary-action:disabled,
    .secondary-action:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .empty-state {
      border: 1px dashed #334155;
      border-radius: 6px;
      padding: 18px;
      background: #111827;
    }

    .empty-state strong {
      display: block;
      margin-bottom: 6px;
    }

    .script-meta,
    .output-actions {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    @media (max-width: 1180px) {
      .layout {
        grid-template-columns: 1fr;
      }

      textarea {
        min-height: 320px;
      }
    }

    @media (max-width: 640px) {
      .page-header,
      .header-actions {
        flex-direction: column;
        align-items: stretch;
      }

      dl {
        grid-template-columns: 1fr;
      }
    }
    `,
  ],
})
export class BootstrapComponent implements OnInit {
  presets: BootstrapPreset[] = [];
  hosts: HostRecord[] = [];
  selectedPresetId: BootstrapPresetId = 'debian-ubuntu';
  selectedHostId: string | null = null;
  installPackages = true;
  includeDockerCheck = false;
  generatedResult: BootstrapGenerateResult | null = null;
  isLoading = false;
  isGenerating = false;
  statusMessage = '';
  errorMessage = '';

  ngOnInit(): void {
    void this.loadData();
  }

  get selectedHost(): HostRecord | null {
    if (!this.selectedHostId) {
      return null;
    }
    return this.hosts.find((host) => host.id === this.selectedHostId) ?? null;
  }

  get generatedScript(): string {
    return this.generatedResult?.script ?? '';
  }

  get generatedScriptLineCount(): number {
    return this.generatedScript ? this.generatedScript.trimEnd().split('\n').length : 0;
  }

  async loadData(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.statusMessage = '';
    try {
      const [presets, hosts] = await Promise.all([
        api.bootstrap.presets(),
        api.host.list(),
      ]);
      this.presets = presets;
      this.hosts = hosts;
      if (!this.presets.some((preset) => preset.id === this.selectedPresetId) && this.presets[0]) {
        this.selectedPresetId = this.presets[0].id;
      }
      if (this.selectedHostId && !this.hosts.some((host) => host.id === this.selectedHostId)) {
        this.selectedHostId = null;
      }
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : 'Unable to load bootstrap generator data.';
    } finally {
      this.isLoading = false;
    }
  }

  selectPreset(presetId: BootstrapPresetId): void {
    this.selectedPresetId = presetId;
    this.statusMessage = '';
  }

  async generateScript(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable.';
      return;
    }

    this.isGenerating = true;
    this.errorMessage = '';
    this.statusMessage = '';
    const input: BootstrapGenerateInput = {
      presetId: this.selectedPresetId,
      hostId: this.selectedHostId,
      options: {
        installPackages: this.installPackages,
        includeDockerCheck: this.includeDockerCheck,
      },
    };

    try {
      this.generatedResult = await api.bootstrap.generate(input);
      this.statusMessage = 'Bootstrap script generated locally.';
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : 'Unable to generate bootstrap script.';
    } finally {
      this.isGenerating = false;
    }
  }

  copyScript(): void {
    const script = this.generatedScript;
    if (!script) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(script)
        .then(() => {
          this.statusMessage = 'Bootstrap script copied to clipboard.';
          this.errorMessage = '';
        })
        .catch(() => {
          this.copyWithTextArea(script);
        });
      return;
    }

    this.copyWithTextArea(script);
  }

  formatDate(value: string | undefined): string {
    if (!value) {
      return 'not generated';
    }
    return new Date(value).toLocaleString();
  }

  trackPreset(_index: number, preset: BootstrapPreset): string {
    return preset.id;
  }

  trackHost(_index: number, host: HostRecord): string {
    return host.id;
  }

  private copyWithTextArea(script: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = script;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      const copied = document.execCommand('copy');
      this.statusMessage = copied
        ? 'Bootstrap script copied to clipboard.'
        : 'Clipboard copy was not available.';
      this.errorMessage = copied ? '' : 'Select the script and copy it manually.';
    } finally {
      document.body.removeChild(textArea);
    }
  }
}
