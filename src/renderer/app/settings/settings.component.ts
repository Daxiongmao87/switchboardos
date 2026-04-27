import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsStorageService } from './settings-storage.service';

@Component({
  selector: 'sb-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-container">
      <h2>Settings</h2>

      <section class="settings-section">
        <h3>Appearance</h3>
        <label>
          Theme
          <select [(ngModel)]="theme" (ngModelChange)="onThemeChange($event)">
            <option value="catppuccin-mocha">Catppuccin Mocha (Dark)</option>
            <option value="catppuccin-latte">Catppuccin Latte (Light)</option>
          </select>
        </label>
      </section>

      <section class="settings-section">
        <h3>General</h3>
        <label>
          Language
          <select [(ngModel)]="language" (ngModelChange)="onLanguageChange($event)">
            <option value="en-US">English (US)</option>
            <option value="zh-CN">中文（简体）</option>
          </select>
        </label>
      </section>

      <section class="settings-section">
        <h3>Window Behavior</h3>
        <label>
          Default window behavior
          <select
            [(ngModel)]="defaultWindowBehavior"
            (ngModelChange)="onDefaultWindowBehaviorChange($event)"
          >
            <option value="floating">Floating</option>
            <option value="tile-right">Tile Right</option>
            <option value="tile-bottom">Tile Bottom</option>
          </select>
        </label>
      </section>
    </div>
  `,
  styles: [
    `.settings-container { padding: 2rem; max-width: 500px; }
     .settings-section { margin-bottom: 2rem; }
     .settings-section h3 { margin-bottom: 0.75rem; }
     label { display: flex; flex-direction: column; gap: 0.25rem; }
     select { padding: 0.5rem; border: 1px solid var(--sb-border); border-radius: 4px; background: var(--sb-surface); color: var(--sb-foreground); }`,
  ],
})
export class SettingsComponent implements OnInit {
  theme = '';
  language = '';
  defaultWindowBehavior = 'floating';

  constructor(private settingsStorage: SettingsStorageService) {}

  ngOnInit(): void {
    const prefs = this.settingsStorage.getAllPreferences();
    this.theme = prefs.theme;
    this.language = prefs.language;
    this.defaultWindowBehavior = prefs.defaultWindowBehavior;
  }

  onThemeChange(value: string): void {
    this.settingsStorage.setTheme(value);
  }

  onLanguageChange(value: string): void {
    this.settingsStorage.setLanguage(value);
  }

  onDefaultWindowBehaviorChange(value: string): void {
    this.settingsStorage.setDefaultWindowBehavior(value as 'floating' | 'tile-right' | 'tile-bottom');
  }
}
