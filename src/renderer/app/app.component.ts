import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <div class="app-shell">
      <div class="desktop-area" id="desktop">
        <!-- Desktop background / wallpaper layer -->
        <div class="wallpaper"></div>
        <!-- Desktop icons will appear here -->
        <div class="desktop-icons" id="desktop-icons"></div>
      </div>
      <div class="taskbar" id="taskbar">
        <!-- Taskbar / dock stub -->
        <div class="taskbar-left"></div>
        <div class="taskbar-center">
          <div class="app-launcher-button" id="app-launcher" title="Launch Apps">
            🚀
          </div>
        </div>
        <div class="taskbar-right">
          <div class="command-palette-button" id="command-palette" title="Command Palette">
            ⌘K
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .app-shell {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .desktop-area {
        width: 100%;
        height: calc(100vh - 48px);
        position: relative;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      }
      .wallpaper {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
      }
      .desktop-icons {
        position: absolute;
        top: 16px;
        left: 16px;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .taskbar {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 48px;
        background: #1e1e2e;
        border-top: 1px solid #313244;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        z-index: 9999;
      }
      .taskbar-center {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .app-launcher-button {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: #313244;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 18px;
        border: 1px solid #45475a;
      }
      .app-launcher-button:hover {
        background: #45475a;
      }
      .command-palette-button {
        padding: 6px 12px;
        background: #313244;
        border: 1px solid #45475a;
        border-radius: 6px;
        color: #cdd6f4;
        font-size: 12px;
        cursor: pointer;
        font-family: monospace;
      }
      .command-palette-button:hover {
        background: #45475a;
      }
    `,
  ],
})
export class AppComponent {}
