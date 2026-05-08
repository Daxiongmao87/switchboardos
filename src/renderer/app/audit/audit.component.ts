import { Component, OnInit } from '@angular/core';
import type { AuditEvent } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

@Component({
  selector: 'app-audit',
  standalone: false,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Audit log</h1>
          <p>Local-first audit history captured by the MVP store.</p>
        </div>
        <div class="header-actions">
          <span class="status-pill">{{ filteredEvents.length }} of {{ events.length }} events</span>
          <button type="button" class="secondary-action" (click)="loadEvents()" [disabled]="isLoading">
            Refresh
          </button>
        </div>
      </header>

      <p *ngIf="errorMessage" class="notice error">{{ errorMessage }}</p>

      <section class="panel filter-panel">
        <div class="filter-row">
          <label class="filter-field">
            <span>Search</span>
            <input
              name="searchText"
              type="search"
              placeholder="Type, entity, message"
              [(ngModel)]="searchText"
            />
          </label>
          <label class="filter-field">
            <span>Event type</span>
            <select name="typeFilter" [(ngModel)]="typeFilter">
              <option value="">All types</option>
              <option *ngFor="let type of availableTypes" [value]="type">{{ type }}</option>
            </select>
          </label>
          <label class="filter-field">
            <span>Entity</span>
            <select name="entityFilter" [(ngModel)]="entityFilter">
              <option value="">All entities</option>
              <option *ngFor="let entity of availableEntities" [value]="entity">{{ entity }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="panel events-panel">
        <div *ngIf="isLoading" class="empty-state">
          <strong>Loading audit log</strong>
          <p>Reading events from the local store.</p>
        </div>

        <div *ngIf="!isLoading && events.length === 0" class="empty-state">
          <strong>No audit events recorded yet</strong>
          <p>Actions like connection tests and terminal opens append events here.</p>
        </div>

        <div *ngIf="!isLoading && events.length > 0 && filteredEvents.length === 0" class="empty-state">
          <strong>No events match the current filters</strong>
          <p>Adjust search or type/entity filters above.</p>
        </div>

        <ul *ngIf="!isLoading && filteredEvents.length > 0" class="event-list">
          <li *ngFor="let event of filteredEvents; trackBy: trackEvent" class="event-row">
            <header class="event-row-header">
              <span class="event-type">{{ event.type }}</span>
              <span class="event-entity">{{ event.entityType }}<span *ngIf="event.entityId"> · {{ event.entityId }}</span></span>
              <time class="event-time">{{ formatDate(event.createdAt) }}</time>
            </header>
            <p class="event-message">{{ event.message || '(no message)' }}</p>
            <pre *ngIf="event.metadata" class="event-metadata">{{ formatMetadata(event.metadata) }}</pre>
          </li>
        </ul>
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

    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    h1, p {
      margin: 0;
    }

    h1 {
      font-size: 22px;
    }

    p, label, .event-time, .event-entity {
      color: #94a3b8;
      font-size: 12px;
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

    .panel {
      background: #171b23;
      border: 1px solid #2d3440;
      border-radius: 6px;
      padding: 16px;
    }

    .filter-row {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
    }

    .filter-field {
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

    .event-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .event-row {
      border: 1px solid #2d3440;
      border-radius: 6px;
      background: #111827;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .event-row-header {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }

    .event-type {
      color: #f8fafc;
      font-size: 13px;
      font-weight: 600;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
    }

    .event-entity {
      overflow-wrap: anywhere;
    }

    .event-message {
      color: #cbd5e1;
      font-size: 13px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .event-metadata {
      margin: 0;
      padding: 10px 12px;
      background: #0a0f17;
      border: 1px solid #1f2937;
      border-radius: 4px;
      color: #94a3b8;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      font-size: 11px;
      line-height: 1.45;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    @media (max-width: 760px) {
      .filter-row {
        grid-template-columns: 1fr;
      }

      .page-header {
        flex-direction: column;
        align-items: stretch;
      }
    }
    `,
  ],
})
export class AuditComponent implements OnInit {
  events: AuditEvent[] = [];
  searchText = '';
  typeFilter = '';
  entityFilter = '';
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    void this.loadEvents();
  }

  async loadEvents(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Audit API is unavailable. Run the app through Electron to view local events.';
      this.events = [];
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const events = await api.audit.list();
      this.events = events.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      this.errorMessage = 'Unable to load audit events from the local store.';
    } finally {
      this.isLoading = false;
    }
  }

  get availableTypes(): string[] {
    return Array.from(new Set(this.events.map((event) => event.type))).sort();
  }

  get availableEntities(): string[] {
    return Array.from(new Set(this.events.map((event) => event.entityType))).sort();
  }

  get filteredEvents(): AuditEvent[] {
    const search = this.searchText.trim().toLowerCase();
    return this.events.filter((event) => {
      if (this.typeFilter && event.type !== this.typeFilter) {
        return false;
      }
      if (this.entityFilter && event.entityType !== this.entityFilter) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [
        event.type,
        event.entityType,
        event.entityId ?? '',
        event.message,
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }

  trackEvent(_index: number, event: AuditEvent): string {
    return event.id;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  formatMetadata(metadata: Record<string, unknown>): string {
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  }
}
