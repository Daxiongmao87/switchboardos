import { Component, OnInit } from '@angular/core';

interface AppInfo {
  version: string;
  platform: string;
}

interface ShellApi {
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
}

function getSwitchboardApi(): ShellApi | undefined {
  return (window as unknown as { sb?: ShellApi }).sb;
}

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  title = 'SwitchboardOS';
  appInfo: AppInfo | null = null;

  readonly navItems = [
    { label: 'Dashboard', path: '/dashboard', detail: 'Overview' },
    { label: 'Hosts', path: '/hosts', detail: 'Inventory' },
    { label: 'Terminal', path: '/terminal', detail: 'Session stub' },
    { label: 'Agents', path: '/agents', detail: 'Operator policy' },
    { label: 'Settings', path: '/settings', detail: 'Defaults' },
  ];

  ngOnInit(): void {
    const api = getSwitchboardApi();
    if (!api) {
      return;
    }

    void api.app.getInfo()
      .then((info) => {
        this.appInfo = info;
      })
      .catch(() => {
        this.appInfo = null;
      });
  }

  minimize(): void {
    void getSwitchboardApi()?.window.minimize();
  }

  maximize(): void {
    void getSwitchboardApi()?.window.maximize();
  }

  close(): void {
    void getSwitchboardApi()?.window.close();
  }
}
