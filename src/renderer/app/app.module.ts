import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { AppStudioComponent } from './app-studio/app-studio.component';
import { AgentsComponent } from './agents/agents.component';
import { AppsComponent } from './apps/apps.component';
import { AuditComponent } from './audit/audit.component';
import { BootstrapComponent } from './bootstrap/bootstrap.component';
import { CommandHistoryComponent } from './command-history/command-history.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ExampleHostMapComponent } from './example-host-map/example-host-map.component';
import { GeneratedAppRuntimeComponent } from './generated-app-runtime/generated-app-runtime.component';
import { HostDetailComponent } from './host-detail/host-detail.component';
import { HostOperationsComponent } from './host-operations/host-operations.component';
import { HostsComponent, FavoriteOnlyPipe } from './hosts/hosts.component';
import { SettingsComponent } from './settings/settings.component';
import { TerminalComponent } from './terminal/terminal.component';

@NgModule({
  declarations: [
    AppComponent,
    AppStudioComponent,
    AgentsComponent,
    AppsComponent,
    AuditComponent,
    BootstrapComponent,
    CommandHistoryComponent,
    ExampleHostMapComponent,
    GeneratedAppRuntimeComponent,
    HostDetailComponent,
    HostOperationsComponent,
    TerminalComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    DashboardComponent,
    HostsComponent,
    FavoriteOnlyPipe,
    SettingsComponent,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
