/**
 * SwitchboardOS — Application Root Component
 *
 * Renders the desktop shell: title bar, content area, and taskbar.
 * All IPC communication goes through window.sb (preload).
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

interface AppInfo {
  isPackaged: boolean;
  version: string;
  platform: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

@Component({
  selector: 'sb-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'SwitchboardOS';
  appInfo: AppInfo | null = null;
  private _infoSubscriptions: (() => void)[] = [];

  ngOnInit(): void {
    // Fetch app info from main process via preload
    if (typeof window !== 'undefined' && (window as Window & { sb?: unknown }).sb) {
      this.loadAppInfo();
    }
  }

  ngOnDestroy(): void {
    this._infoSubscriptions.forEach((sub) => sub());
    this._infoSubscriptions = [];
  }

  private loadAppInfo(): void {
    const sb = (window as Window & { sb: { app: { getInfo: () => Promise<AppInfo> } } }).sb;
    sb.app.getInfo().then((info) => {
      this.appInfo = info;
    }).catch((err) => {
      console.error('Failed to load app info:', err);
    });
  }

  // --- Window controls ---
  minimize(): void {
    (window as Window & { sb: { window: { minimize: () => Promise<void> } } }).sb.window.minimize();
  }

  maximize(): void {
    (window as Window & { sb: { window: { maximize: () => Promise<void> } } }).sb.window.maximize();
  }

  close(): void {
    (window as Window & { sb: { window: { close: () => Promise<void> } } }).sb.window.close();
  }
}
