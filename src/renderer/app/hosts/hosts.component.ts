import { Component, OnInit, Pipe, PipeTransform, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormsModule, ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { HostRecord, HostAuthMode, HostBootstrapStatus, CreateHostInput, UpdateHostInput } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';
import {
  MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';

type HostFormGroup = FormGroup<{
  id: FormControl<string>;
  name: FormControl<string>;
  address: FormControl<string>;
  port: FormControl<number>;
  username: FormControl<string>;
  authMode: FormControl<HostAuthMode>;
  keyPath: FormControl<string>;
  credentialRefId: FormControl<string>;
  tags: FormControl<string>;
  group: FormControl<string>;
  osHint: FormControl<string>;
  bootstrapStatus: FormControl<HostBootstrapStatus>;
  defaultShell: FormControl<string>;
  defaultWorkingDirectory: FormControl<string>;
  capabilities: FormControl<string>;
  notes: FormControl<string>;
}>;

@Component({
  selector: 'app-hosts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatTableModule,
    MatCardModule,
    MatCheckboxModule,
    MatSelectModule,
    MatSnackBarModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    MatTabsModule,
    MatProgressBarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="sidenav.toggle()">
        <mat-icon>menu</mat-icon>
      </button>
      <span>Host Inventory</span>
      <span class="spacer"></span>
      <button mat-icon-button [matMenuTriggerFor]="filterMenu" matTooltip="Filter/Group">
        <mat-icon>filter_list</mat-icon>
      </button>
      <button mat-icon-button (click)="importHosts()" matTooltip="Import hosts">
        <mat-icon>file_download</mat-icon>
      </button>
      <button mat-icon-button (click)="exportHosts()" matTooltip="Export hosts">
        <mat-icon>file_upload</mat-icon>
      </button>
      <button mat-raised-button color="accent" (click)="openAddDialog()">
        <mat-icon>add</mat-icon> Add Host
      </button>
    </mat-toolbar>
    <mat-menu #filterMenu="matMenu">
      <button mat-menu-item (click)="groupFilter = ''; applyFilters()">
        <mat-icon>clear</mat-icon>
        Clear group filter
      </button>
    </mat-menu>

    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav #sidenav mode="side" opened class="sidenav">
        <mat-tab-group [(selectedIndex)]="sidebarTab" (selectedTabChange)="onSidebarTabChange()">
          <mat-tab label="All Hosts">
            <mat-list>
              <mat-list-item *ngFor="let host of filteredHosts">
                <mat-icon matListIcon>desktop_windows</mat-icon>
                <div matListItemTitle>{{ host.name }}</div>
                <div matListItemLine>{{ host.address }}:{{ host.port }}</div>
              </mat-list-item>
            </mat-list>
          </mat-tab>
          <mat-tab label="Favorites">
            <mat-list>
              <mat-list-item *ngFor="let host of favoriteFilteredHosts">
                <mat-icon matListIcon>star</mat-icon>
                <div matListItemTitle>{{ host.name }}</div>
                <div matListItemLine>{{ host.address }}</div>
              </mat-list-item>
            </mat-list>
          </mat-tab>
          <mat-tab label="Groups">
            <mat-list>
              <mat-list-item *ngFor="let g of hostGroups" (click)="groupFilter = g" [class.selected]="groupFilter === g" style="cursor:pointer">
                <mat-icon matListIcon>folder</mat-icon>
                <div matListItemTitle>{{ g || 'Ungrouped' }}</div>
                <div matListItemLine>{{ getHostCountForGroup(g) }} hosts</div>
              </mat-list-item>
            </mat-list>
          </mat-tab>
        </mat-tab-group>
      </mat-sidenav>
      <mat-sidenav-content>
        <div class="content">
          <mat-card class="table-card">
            <mat-card-header>
              <mat-card-title>Host Inventory</mat-card-title>
              <mat-card-subtitle>
                Search: <input matInput placeholder="Filter by name, address, tag, group..." [(ngModel)]="searchFilter" style="width:250px;margin-left:8px" />
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <table mat-table [dataSource]="filteredHosts" class="full-width-table">
                <!-- Name Column -->
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let h">
                    <strong>{{ h.name }}</strong>
                    <button mat-icon-button [matMenuTriggerFor]="hostMenu" *ngIf="h.id" style="margin-left:4px" (click)="$event.stopPropagation()">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    <mat-menu #hostMenu="matMenu">
                      <button mat-menu-item (click)="openEditDialog(h)"><mat-icon>edit</mat-icon>Edit</button>
                      <button mat-menu-item (click)="duplicateHost(h.id)"><mat-icon>content_copy</mat-icon>Duplicate</button>
                      <button mat-menu-item (click)="toggleFavorite(h.id)"><mat-icon>star</mat-icon>{{ h.favorite ? 'Unfavorite' : 'Favorite' }}</button>
                      <button mat-menu-item (click)="quickAction(h, 'dashboard')"><mat-icon>dashboard</mat-icon>Dashboard</button>
                      <button mat-menu-item (click)="quickAction(h, 'terminal')"><mat-icon>terminal</mat-icon>Terminal</button>
                      <button mat-menu-item (click)="quickAction(h, 'file')"><mat-icon>folder</mat-icon>File Manager</button>
                      <button mat-menu-item (click)="quickAction(h, 'log')"><mat-icon>assignment</mat-icon>Logs</button>
                      <button mat-menu-item (click)="quickAction(h, 'service')"><mat-icon>settings_applications</mat-icon>Services</button>
                      <button mat-menu-item (click)="quickAction(h, 'process')"><mat-icon>settings</mat-icon>Processes</button>
                      <button mat-menu-item (click)="testConnection(h.id)" [disabled]="testingHostId === h.id"><mat-icon>wifi_protected_setup</mat-icon>Test Connection</button>
                      <button mat-menu-item (click)="deleteHost(h.id)" style="color:red"><mat-icon>delete</mat-icon>Delete</button>
                    </mat-menu>
                  </td>
                </ng-container>

                <!-- Address Column -->
                <ng-container matColumnDef="address">
                  <th mat-header-cell *matHeaderCellDef>Address</th>
                  <td mat-cell *matCellDef="let h">{{ h.address }}:{{ h.port }}</td>
                </ng-container>

                <!-- Auth Mode Column -->
                <ng-container matColumnDef="authMode">
                  <th mat-header-cell *matHeaderCellDef>Auth</th>
                  <td mat-cell *matCellDef="let h">{{ credentialSummary(h) }}</td>
                </ng-container>

                <!-- Profile Column -->
                <ng-container matColumnDef="profile">
                  <th mat-header-cell *matHeaderCellDef>Profile</th>
                  <td mat-cell *matCellDef="let h">
                    <div class="profile-cell">
                      <span>OS: {{ statusText(h.osHint) }}</span>
                      <span>Bootstrap: {{ h.bootstrapStatus || 'unknown' }}</span>
                      <span>Capabilities: {{ capabilitiesText(h) }}</span>
                    </div>
                  </td>
                </ng-container>

                <!-- Tags Column -->
                <ng-container matColumnDef="tags">
                  <th mat-header-cell *matHeaderCellDef>Tags</th>
                  <td mat-cell *matCellDef="let h">
                    <mat-chip *ngFor="let tag of h.tags">{{ tag }}</mat-chip>
                  </td>
                </ng-container>

                <!-- Group Column -->
                <ng-container matColumnDef="group">
                  <th mat-header-cell *matHeaderCellDef>Group</th>
                  <td mat-cell *matCellDef="let h">
                    <mat-chip *ngIf="h.group">{{ h.group }}</mat-chip>
                  </td>
                </ng-container>

                <!-- Favorite Column -->
                <ng-container matColumnDef="favorite">
                  <th mat-header-cell *matHeaderCellDef>Fav</th>
                  <td mat-cell *matCellDef="let h">
                    <button mat-icon-button (click)="toggleFavorite(h.id)" style="color:{{ h.favorite ? 'gold' : '' }}">
                      <mat-icon>{{ h.favorite ? 'star' : 'star_border' }}</mat-icon>
                    </button>
                  </td>
                </ng-container>

                <!-- Status Column -->
                <ng-container matColumnDef="lastConnectionStatus">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let h">{{ h.lastConnectionStatus }}</td>
                </ng-container>

                <!-- Actions Column -->
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let h" (click)="$event.stopPropagation()">
                    <button mat-button color="primary" (click)="quickAction(h, 'dashboard')" style="font-size:12px;padding:0 6px;">
                      <mat-icon>dashboard</mat-icon> Dashboard
                    </button>
                    <button mat-button color="accent" (click)="quickAction(h, 'terminal')" style="font-size:12px;padding:0 6px;margin-left:4px;">
                      <mat-icon>terminal</mat-icon> Terminal
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns" class="host-row-header"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;" (click)="openEditDialog(row)" class="host-row" style="cursor:pointer"></tr>
              </table>
            </mat-card-content>
          </mat-card>
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>

    <!-- Add/Edit Dialog -->
    <ng-template #hostDialog>
      <div [formGroup]="hostForm" style="padding: 20px; width: 400px;">
        <h3 mat-dialog-title>{{ editingHost ? 'Edit Host' : 'Add Host' }}</h3>
        <mat-dialog-content>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Host Name</mat-label>
            <input matInput formControlName="name" placeholder="Production Server 1" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Address</mat-label>
            <input matInput formControlName="address" placeholder="192.168.1.100" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Port</mat-label>
            <input matInput formControlName="port" type="number" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Username</mat-label>
            <input matInput formControlName="username" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Auth Mode</mat-label>
            <mat-select formControlName="authMode">
              <mat-option value="placeholder">Placeholder</mat-option>
              <mat-option value="agent">SSH Agent</mat-option>
              <mat-option value="password">Password</mat-option>
              <mat-option value="key">SSH Key</mat-option>
            </mat-select>
          </mat-form-field>
          <p class="field-note" *ngIf="hostForm.get('authMode')?.value === 'password'">
            Password mode is a profile label only. The MVP terminal does not store or use passwords.
          </p>
          <mat-form-field appearance="outline" style="width:100%" *ngIf="hostForm.get('authMode')?.value === 'key'">
            <mat-label>SSH key path/reference</mat-label>
            <input matInput formControlName="keyPath" placeholder="~/.ssh/id_rsa" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Credential reference ID</mat-label>
            <input matInput formControlName="credentialRefId" placeholder="Optional non-secret credential reference" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Tags (comma-separated)</mat-label>
            <input matInput formControlName="tags" placeholder="production, web" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Group</mat-label>
            <input matInput formControlName="group" placeholder="production, staging, etc." />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>OS hint</mat-label>
            <input matInput formControlName="osHint" placeholder="ubuntu, debian, rhel, unknown" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Bootstrap status</mat-label>
            <mat-select formControlName="bootstrapStatus">
              <mat-option value="unknown">Unknown</mat-option>
              <mat-option value="not_started">Not started</mat-option>
              <mat-option value="pending">Pending</mat-option>
              <mat-option value="ready">Ready</mat-option>
              <mat-option value="failed">Failed</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Default shell</mat-label>
            <input matInput formControlName="defaultShell" placeholder="/bin/bash or unknown" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Default working directory</mat-label>
            <input matInput formControlName="defaultWorkingDirectory" placeholder="~/work or unknown" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Known capabilities (comma-separated)</mat-label>
            <input matInput formControlName="capabilities" placeholder="ssh, systemctl, journalctl" />
          </mat-form-field>
          <mat-form-field appearance="outline" style="width:100%">
            <mat-label>Notes</mat-label>
            <textarea matInput formControlName="notes" rows="2"></textarea>
          </mat-form-field>
        </mat-dialog-content>
        <mat-dialog-actions>
          <button mat-button (click)="closeDialog()">Cancel</button>
          <button mat-raised-button color="primary" (click)="saveHost()" [disabled]="!hostForm.valid">Save</button>
        </mat-dialog-actions>
      </div>
    </ng-template>
  `,
  styles: [`
    .spacer { flex: 1 1 auto; }
    .sidenav-container { height: calc(100vh - 64px); }
    .sidenav { width: 250px; }
    .content { padding: 16px; height: 100%; overflow: auto; }
    .table-card { margin-bottom: 16px; }
    .full-width-table { width: 100%; }
    .profile-cell { display: grid; gap: 2px; font-size: 12px; line-height: 1.25; }
    .field-note { margin: 0 0 12px; color: #666; font-size: 12px; }
    mat-chip { margin: 2px; }
    mat-list-item.selected { background-color: rgba(0,0,0,0.08); }
  `],
})
export class HostsComponent implements OnInit {
  @ViewChild('hostDialog') private hostDialog!: TemplateRef<unknown>;

  hosts: HostRecord[] = [];
  displayedColumns: string[] = ['name', 'address', 'authMode', 'profile', 'tags', 'group', 'favorite', 'lastConnectionStatus', 'actions'];
  filteredHosts: HostRecord[] = [];
  searchFilter: string = '';
  groupFilter: string = '';
  sidebarTab: number = 0;
  testingHostId: string | null = null;
  hostForm: HostFormGroup;
  editingHost: HostRecord | null = null;

  // --- Group management ---
  get hostGroups(): string[] {
    return [...new Set(this.hosts.filter(h => h.group).map(h => h.group!))];
  }

  getHostCountForGroup(group: string): number {
    return this.hosts.filter(h => h.group === group).length;
  }

  get favoriteFilteredHosts(): HostRecord[] {
    return this.filteredHosts.filter(h => h.favorite);
  }

  statusText(value: string | null | undefined): string {
    return value?.trim() || 'unknown';
  }

  capabilitiesText(host: HostRecord): string {
    return host.capabilities.length > 0 ? host.capabilities.join(', ') : 'unknown';
  }

  credentialSummary(host: HostRecord): string {
    if (host.credentialRefId) {
      return `${host.authMode} / ref ${host.credentialRefId}`;
    }
    if (host.keyPath) {
      return `${host.authMode} / key path`;
    }
    return host.authMode;
  }

  applyFilters(): void {
    let list = [...this.hosts];
    // Search filter
    if (this.searchFilter) {
      const q = this.searchFilter.toLowerCase();
      list = list.filter(h =>
        h.name.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.tags.some(t => t.toLowerCase().includes(q)) ||
        (h.group && h.group.toLowerCase().includes(q))
      );
    }
    // Group filter
    if (this.groupFilter) {
      list = list.filter(h => h.group === this.groupFilter);
    }
    this.filteredHosts = list;
  }

  onSidebarTabChange(): void {
    // Could filter by favorites tab
  }

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    const required = (control: AbstractControl) => Validators.required(control);
    this.hostForm = new FormGroup({
      id: new FormControl('', { nonNullable: true }),
      name: new FormControl('', { nonNullable: true, validators: required }),
      address: new FormControl('', { nonNullable: true, validators: required }),
      port: new FormControl(22, { nonNullable: true }),
      username: new FormControl('', { nonNullable: true }),
      authMode: new FormControl('password' as HostAuthMode, { nonNullable: true }),
      keyPath: new FormControl('', { nonNullable: true }),
      credentialRefId: new FormControl('', { nonNullable: true }),
      tags: new FormControl('', { nonNullable: true }),
      group: new FormControl('', { nonNullable: true }),
      osHint: new FormControl('unknown', { nonNullable: true }),
      bootstrapStatus: new FormControl('unknown' as HostBootstrapStatus, { nonNullable: true }),
      defaultShell: new FormControl('', { nonNullable: true }),
      defaultWorkingDirectory: new FormControl('', { nonNullable: true }),
      capabilities: new FormControl('', { nonNullable: true }),
      notes: new FormControl('', { nonNullable: true }),
    });
  }

  ngOnInit(): void {
    void this.loadHosts();
  }

  async loadHosts(): Promise<void> {
    const sb = getSwitchboardApi();
    if (!sb) {
      this.hosts = [];
      this.filteredHosts = [];
      return;
    }

    this.hosts = await sb.host.list();
    this.applyFilters();
  }

  // --- Group methods ---
  async setGroup(hostId: string, groupName: string): Promise<void> {
    await getSwitchboardApi()?.host.updateGroup(hostId, groupName);
    await this.loadHosts();
    this.snackBar.open(`Group set to "${groupName}"`, 'OK', { duration: 2000 });
  }

  // --- Favorite methods ---
  async toggleFavorite(hostId: string): Promise<void> {
    const host = this.hosts.find(h => h.id === hostId);
    if (!host) return;
    await getSwitchboardApi()?.host.setFavorite(hostId, !host.favorite);
    await this.loadHosts();
  }

  // --- Duplicate ---
  async duplicateHost(hostId: string): Promise<void> {
    const dup = await getSwitchboardApi()?.host.duplicate(hostId);
    if (dup) {
      await this.loadHosts();
      this.snackBar.open(`Host duplicated as "${dup.name}"`, 'OK', { duration: 3000 });
    }
  }

  // --- Import / Export ---
  async importHosts(): Promise<void> {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.click();
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
          const hosts: HostRecord[] = JSON.parse(text);
          const imported = await getSwitchboardApi()?.host.import(hosts) ?? [];
          await this.loadHosts();
          this.snackBar.open(`Imported ${imported.length} hosts`, 'OK', { duration: 3000 });
        } catch {
          this.snackBar.open('Failed to parse JSON', 'Error', { duration: 3000 });
        }
      };
    } catch {
      this.snackBar.open('Import failed', 'Error', { duration: 3000 });
    }
  }

  async exportHosts(): Promise<void> {
    const data = JSON.stringify(this.hosts, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hosts-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.snackBar.open('Hosts exported', 'OK', { duration: 2000 });
  }

  // --- Quick Actions ---
  quickAction(host: HostRecord, action: string): void {
    // Navigate to the appropriate app with the host selected
    switch (action) {
      case 'dashboard':
        getSwitchboardApi()?.window.navigate(`/dashboard?hostId=${host.id}`);
        break;
      case 'terminal':
        getSwitchboardApi()?.window.navigate(`/terminal?hostId=${host.id}`);
        break;
      case 'file':
        getSwitchboardApi()?.window.navigate(`/file-manager?hostId=${host.id}`);
        break;
      case 'log':
        getSwitchboardApi()?.window.navigate(`/logs?hostId=${host.id}`);
        break;
      case 'service':
        getSwitchboardApi()?.window.navigate(`/services?hostId=${host.id}`);
        break;
      case 'process':
        getSwitchboardApi()?.window.navigate(`/processes?hostId=${host.id}`);
        break;
    }
  }

  // --- CRUD ---
  async testConnection(hostId: string): Promise<void> {
    const sb = getSwitchboardApi();
    if (!sb) {
      this.snackBar.open('Switchboard API is unavailable', 'OK', { duration: 2000 });
      return;
    }

    this.testingHostId = hostId;
    try {
      const result = await sb.host.testConnection(hostId);
      this.snackBar.open(
        `Connection ${result.success ? 'succeeded' : 'failed'} (${result.latencyMs}ms)`,
        'OK',
        { duration: 3000 },
      );
      await this.loadHosts();
    } finally {
      this.testingHostId = null;
    }
  }

  async deleteHost(hostId: string): Promise<void> {
    const sb = getSwitchboardApi();
    if (!sb) {
      this.snackBar.open('Switchboard API is unavailable', 'OK', { duration: 2000 });
      return;
    }

    if (confirm('Delete this host?')) {
      await sb.host.remove(hostId);
      await this.loadHosts();
      this.snackBar.open('Host deleted', 'OK', { duration: 2000 });
    }
  }

  openAddDialog(): void {
    this.editingHost = null;
    this.hostForm.reset({
      id: '',
      name: '',
      address: '',
      port: 22,
      username: '',
      authMode: 'password',
      keyPath: '',
      credentialRefId: '',
      tags: '',
      group: '',
      osHint: 'unknown',
      bootstrapStatus: 'unknown',
      defaultShell: '',
      defaultWorkingDirectory: '',
      capabilities: '',
      notes: '',
    });
    this.dialog.open(this.hostDialog, { width: '500px' });
  }

  openEditDialog(host: HostRecord): void {
    this.editingHost = host;
    this.hostForm.patchValue({
      id: host.id,
      name: host.name,
      address: host.address,
      port: host.port,
      username: host.username,
      authMode: host.authMode,
      keyPath: host.keyPath ?? '',
      credentialRefId: host.credentialRefId ?? '',
      tags: host.tags.join(', '),
      group: host.group || '',
      osHint: host.osHint || 'unknown',
      bootstrapStatus: host.bootstrapStatus || 'unknown',
      defaultShell: host.defaultShell || '',
      defaultWorkingDirectory: host.defaultWorkingDirectory || '',
      capabilities: host.capabilities.join(', '),
      notes: host.notes,
    });
    this.dialog.open(this.hostDialog, { width: '500px' });
  }

  closeDialog(): void {
    this.dialog.closeAll();
  }

  async saveHost(): Promise<void> {
    const sb = getSwitchboardApi();
    if (!sb) {
      this.snackBar.open('Switchboard API is unavailable', 'OK', { duration: 2000 });
      return;
    }

    if (!this.hostForm.valid) return;
    const val = this.hostForm.getRawValue();
    const payload: CreateHostInput = {
      name: val.name.trim(),
      address: val.address.trim(),
      hostname: val.address.trim(),
      port: Number.isFinite(val.port) ? val.port : 22,
      username: val.username.trim(),
      authMode: val.authMode,
      keyPath: val.keyPath.trim() || undefined,
      credentialRefId: val.credentialRefId.trim() || null,
      tags: val.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      group: val.group.trim() || undefined,
      osHint: val.osHint.trim() || 'unknown',
      bootstrapStatus: val.bootstrapStatus,
      defaultShell: val.defaultShell.trim(),
      defaultWorkingDirectory: val.defaultWorkingDirectory.trim(),
      capabilities: val.capabilities.split(',').map((capability: string) => capability.trim()).filter(Boolean),
      notes: val.notes.trim(),
    };

    if (this.editingHost) {
      await sb.host.update(this.editingHost.id, payload as UpdateHostInput);
    } else {
      await sb.host.create(payload);
    }
    this.dialog.closeAll();
    await this.loadHosts();
  }
}

@Pipe({
  name: 'favoriteOnly',
  standalone: true,
})
export class FavoriteOnlyPipe implements PipeTransform {
  transform(hosts: HostRecord[]): HostRecord[] {
    return hosts.filter(h => h.favorite);
  }
}
