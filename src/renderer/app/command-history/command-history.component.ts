import { Component, OnInit } from '@angular/core';
import type { CommandHistoryEntry, HostRecord } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

@Component({
  selector: 'app-command-history',
  standalone: false,
  template: `
    <section
      class="history-app"
      data-testid="command-history-runtime"
      [attr.data-entry-count]="entries.length"
    >
      <header class="history-header">
        <div>
          <h1>Command History</h1>
          <p>Local SQLite metadata for terminal and read-only host operations. No command output secrets are stored here.</p>
        </div>
        <button type="button" class="secondary-action" (click)="load()" [disabled]="isLoading">Refresh</button>
      </header>

      <p *ngIf="errorMessage" class="error-message">{{ errorMessage }}</p>
      <p *ngIf="!isLoading && entries.length === 0" class="history-empty">
        No command history has been recorded yet.
      </p>

      <div class="history-table" *ngIf="entries.length > 0">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Host</th>
              <th>Command</th>
              <th>Exit</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let entry of entries; trackBy: trackEntry">
              <td>{{ entry.createdAt }}</td>
              <td>{{ hostName(entry.hostId) }}</td>
              <td><code>{{ entry.command }}</code></td>
              <td>{{ entry.exitCode === null ? 'pending' : entry.exitCode }}</td>
              <td>{{ entry.durationMs === null ? '-' : entry.durationMs + ' ms' }}</td>
              <td>
                <button type="button" class="mini-button" (click)="remove(entry)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .history-app {
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 12px;
      height: 100%;
      min-height: 0;
      padding: 16px;
      background: #151922;
      color: #eef3fb;
    }

    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    h1 {
      margin: 0;
      font-size: 18px;
    }

    p {
      margin: 4px 0 0;
      color: #9eaabd;
      font-size: 12px;
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

    .mini-button {
      padding: 5px 8px;
      font-size: 12px;
    }

    .history-table {
      min-height: 0;
      overflow: auto;
      border: 1px solid #2c3546;
      border-radius: 8px;
      background: #0f141f;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th,
    td {
      border-bottom: 1px solid #202838;
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }

    th {
      position: sticky;
      top: 0;
      background: #161d2a;
      color: #b8c3d5;
    }

    code {
      white-space: pre-wrap;
      color: #d9e4f6;
    }

    .history-empty {
      border: 1px dashed #344052;
      border-radius: 8px;
      padding: 18px;
      background: #101722;
    }

    .error-message {
      color: #ffb8b8;
    }
  `],
})
export class CommandHistoryComponent implements OnInit {
  entries: CommandHistoryEntry[] = [];
  hosts: HostRecord[] = [];
  isLoading = false;
  errorMessage = '';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      this.errorMessage = 'Switchboard API is unavailable.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    try {
      const [entries, hosts] = await Promise.all([
        api.commandHistory.list(100),
        api.host.list(),
      ]);
      this.entries = entries;
      this.hosts = hosts;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to load command history.';
    } finally {
      this.isLoading = false;
    }
  }

  async remove(entry: CommandHistoryEntry): Promise<void> {
    const api = getSwitchboardApi();
    if (!api) {
      return;
    }

    const success = await api.commandHistory.remove(entry.id);
    if (success) {
      this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
    }
  }

  hostName(hostId: string | null): string {
    if (!hostId) {
      return 'local/none';
    }
    return this.hosts.find((host) => host.id === hostId)?.name ?? hostId;
  }

  trackEntry(_index: number, entry: CommandHistoryEntry): string {
    return entry.id;
  }
}
