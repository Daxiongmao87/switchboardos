import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { AgentsComponent } from './agents/agents.component';
import { AuditComponent } from './audit/audit.component';
import { BootstrapComponent } from './bootstrap/bootstrap.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { HostDetailComponent } from './host-detail/host-detail.component';
import { HostsComponent } from './hosts/hosts.component';
import { SettingsComponent } from './settings/settings.component';
import { TerminalComponent } from './terminal/terminal.component';

const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'hosts', component: HostsComponent },
  { path: 'hosts/:hostId', component: HostDetailComponent },
  { path: 'terminal', component: TerminalComponent },
  { path: 'bootstrap', component: BootstrapComponent },
  { path: 'agents', component: AgentsComponent },
  { path: 'audit', component: AuditComponent },
  { path: 'settings', component: SettingsComponent },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];

@NgModule({
  declarations: [
    AppComponent,
    AgentsComponent,
    AuditComponent,
    BootstrapComponent,
    DashboardComponent,
    HostDetailComponent,
    HostsComponent,
    TerminalComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    SettingsComponent,
    RouterModule.forRoot(routes, { useHash: true }),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
