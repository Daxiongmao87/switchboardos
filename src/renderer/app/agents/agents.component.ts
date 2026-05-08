import { Component, OnInit } from '@angular/core';
import type { MvpSettings } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

@Component({
  selector: 'app-agents',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Agents</h1>
          <p>Read-only Operator configuration and MVP execution state.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">No action execution</span>
          <button type="button" class="secondary-action" (click)="loadSettings()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="grid">
        <article class="panel">
          <h2>Operator endpoint</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{{ endpointConfigured ? 'Configured locally' : 'Not configured' }}</dd>
            </div>
            <div>
              <dt>Endpoint URL</dt>
              <dd>{{ endpointLabel }}</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <h2>Policy</h2>
          <dl>
            <div>
              <dt>Execution</dt>
              <dd>{{ policyLabel }}</dd>
            </div>
            <div>
              <dt>Action state</dt>
              <dd>Read-only panel; no agent actions execute</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <h2>Status</h2>
          <div class="empty-state">
            <strong>No agent runs</strong>
            <p *ngIf="isLoading">Loading local Operator settings.</p>
            <p *ngIf="!isLoading">
              Agent invocation remains intentionally disabled in the MVP shell.
            </p>
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
      margin-bottom: 12px;
    }

    p,
    dt {
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
      border: 1px solid #854d0e;
      color: #fde68a;
      background: #422006;
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      white-space: nowrap;
    }

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

    .secondary-action:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .panel {
      min-height: 168px;
      padding: 16px;
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
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

    .empty-state {
      border: 1px dashed #334155;
      border-radius: 6px;
      padding: 14px;
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

    @media (max-width: 1000px) {
      .grid {
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
export class AgentsComponent implements OnInit {
  settings: MvpSettings | null = null;
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    void this.loadSettings();
  }

  get endpointConfigured(): boolean {
    return Boolean(this.settings?.operator.endpoint.trim());
  }

  get endpointLabel(): string {
    return this.settings?.operator.endpoint.trim() || 'Not configured';
  }

  get policyLabel(): string {
    if (!this.settings) {
      return 'Loading policy';
    }
    return this.settings.operator.policy === 'disabled'
      ? 'Disabled'
      : 'Manual approval required';
  }

  async loadSettings(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Settings API is unavailable. Run the app through Electron to read Operator policy.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.settings = await api.settings.get();
    } catch {
      this.errorMessage = 'Unable to load Operator settings from the local MVP store.';
    } finally {
      this.isLoading = false;
    }
  }
}
