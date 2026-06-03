import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import type { AppManifest } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

type StudioDocumentKind = 'manifest' | 'component' | 'bootstrap' | 'script';

interface MonacoStandaloneEditor {
  setValue(value: string): void;
  getValue(): string;
  getModel(): unknown;
  dispose(): void;
}

interface MonacoApi {
  editor: {
    create(element: HTMLElement, options: Record<string, unknown>): MonacoStandaloneEditor;
    setModelLanguage(model: unknown, language: string): void;
  };
}

interface MonacoLoaderRequire {
  config(options: { paths: { vs: string } }): void;
  (dependencies: string[], onLoad: (monaco: MonacoApi) => void, onError?: (error: unknown) => void): void;
}

interface StudioDocument {
  kind: StudioDocumentKind;
  label: string;
  language: string;
  value: string;
}

const STUDIO_DOCUMENTS: StudioDocument[] = [
  {
    kind: 'manifest',
    label: 'Manifest',
    language: 'json',
    value: JSON.stringify({
      appId: 'generated-host-health-demo',
      name: 'Generated Host Health Demo',
      description: 'Sandboxed generated app that renders a graphical host status panel through the SwitchboardOS SDK bridge.',
      version: '0.1.0',
      author: 'SwitchboardOS App Studio',
      entrypoint: 'generated-host-health-demo.js',
      icon: 'GH',
      category: 'visualization',
      requestedCapabilities: ['host:read', 'agent:read-state', 'actions:register', 'notifications:create'],
      approvalRequired: true,
    }, null, 2),
  },
  {
    kind: 'component',
    label: 'Runtime code',
    language: 'javascript',
    value: `(async () => {
  const root = document.getElementById('app-root');
  root.innerHTML = '<section class="generated-card"><h1>Generated Host Health</h1><p data-role="loading">Loading host context through the SwitchboardOS SDK.</p></section>';

  const hosts = await window.SwitchboardOS.host.listHosts();
  const failedHosts = hosts.filter((host) => host.lastConnectionStatus === 'failed').length;
  const reachableHosts = hosts.filter((host) => host.lastConnectionStatus === 'success').length;
  const rows = hosts.map((host, index) => {
    const statusClass = host.lastConnectionStatus === 'success' ? 'ok' : host.lastConnectionStatus === 'failed' ? 'bad' : 'unknown';
    const x = 60 + index * 96;
    return '<g class="node ' + statusClass + '" data-host-id="' + host.id + '"><circle cx="' + x + '" cy="74" r="24"></circle><text x="' + x + '" y="118">' + host.name + '</text></g>';
  }).join('');

  let denialMessage = 'not attempted';
  try {
    if (hosts[0]) {
      await window.SwitchboardOS.host.testConnection(hosts[0].id);
      denialMessage = 'unexpectedly allowed';
    }
  } catch (error) {
    denialMessage = error.message;
  }

  root.innerHTML = \`
    <style>
      body { color: #e8eef8; }
      .generated-card { display: grid; gap: 12px; min-height: 100vh; box-sizing: border-box; padding: 18px; background: linear-gradient(180deg, #111827, #0e141f); }
      h1 { margin: 0; font-size: 20px; }
      p { margin: 0; color: #9fb0c8; }
      .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .stat { border: 1px solid #2b3a50; border-radius: 6px; padding: 10px; background: #151f2e; }
      .stat strong { display: block; font-size: 22px; }
      svg { width: 100%; min-height: 170px; border: 1px solid #2b3a50; border-radius: 6px; background: #0b111b; }
      circle { fill: #526174; stroke: #91a4bd; stroke-width: 2; }
      .ok circle { fill: #14532d; stroke: #22c55e; }
      .bad circle { fill: #7f1d1d; stroke: #ef4444; }
      text { fill: #dce7f7; font: 11px system-ui, sans-serif; text-anchor: middle; }
      .denied { border: 1px solid #7f1d1d; border-radius: 6px; padding: 10px; color: #fecaca; background: #2a1114; }
    </style>
    <section class="generated-card" data-testid="generated-demo-card">
      <h1>Generated Host Health</h1>
      <div class="stats">
        <div class="stat"><strong>\${hosts.length}</strong><span>Hosts</span></div>
        <div class="stat"><strong>\${reachableHosts}</strong><span>Reachable</span></div>
        <div class="stat"><strong>\${failedHosts}</strong><span>Failed</span></div>
      </div>
      <svg viewBox="0 0 620 150" role="img" aria-label="Generated host topology">\${rows || '<text x="80" y="78">No hosts</text>'}</svg>
      <p class="denied" data-testid="generated-denied">Denied host action: \${denialMessage}</p>
    </section>
  \`;

  window.SwitchboardOS.agent.setState({
    status: failedHosts > 0 ? 'attention' : 'ready',
    summary: 'Generated app rendered ' + hosts.length + ' host nodes with sandboxed SDK data.',
    entities: hosts.map((host) => ({ id: host.id, type: 'host', name: host.name, status: host.lastConnectionStatus })),
    observations: [{ type: 'capability-denial', message: denialMessage }],
    availableActions: [{ id: 'refresh-generated-hosts', label: 'Refresh generated hosts', description: 'Reload host context through host:read.' }],
    riskHints: ['generated-app', 'sandboxed-iframe', 'no-node-access'],
    metadata: { hostCount: hosts.length, reachableHosts, failedHosts, denialMessage }
  });
})().catch((error) => {
  document.getElementById('app-root').innerHTML = '<pre data-testid="generated-error">' + error.message + '</pre>';
});
`,
  },
  {
    kind: 'bootstrap',
    label: 'Bootstrap review',
    language: 'shell',
    value: `#!/bin/sh
set -eu

# Review-only bootstrap template. SwitchboardOS does not execute this here.
command -v uname >/dev/null 2>&1
uname -a
`,
  },
  {
    kind: 'script',
    label: 'Script review',
    language: 'shell',
    value: `#!/bin/sh
set -eu

# Read-only diagnostic script candidate.
uptime
df -h
`,
  },
];

@Component({
  selector: 'app-app-studio',
  standalone: false,
  template: `
    <section
      class="studio-app"
      data-testid="app-studio-runtime"
      [attr.data-active-document]="activeDocument.kind"
      [attr.data-monaco-loaded]="monacoLoaded"
      [attr.data-capability-count]="capabilities.length"
      [attr.data-approved]="approved"
      [attr.data-installed-app-id]="installedAppId"
      [attr.data-install-status]="installStatus"
    >
      <header class="studio-header">
        <div>
          <h1>App Studio</h1>
          <p>Monaco-backed review surface for generated manifests, components, bootstrap templates, and scripts.</p>
        </div>
        <button type="button" class="primary-action" data-testid="app-studio-install-button" (click)="approveAndInstall()" [disabled]="isInstalling">
          {{ installedAppId ? 'Installed' : 'Approve and install' }}
        </button>
      </header>

      <section class="studio-grid">
        <aside class="studio-sidebar">
          <h2>Review files</h2>
          <button
            *ngFor="let document of documents"
            type="button"
            class="doc-button"
            [class.is-active]="document.kind === activeDocument.kind"
            (click)="selectDocument(document.kind)"
          >
            <span>{{ document.label }}</span>
            <small>{{ document.language }}</small>
          </button>

          <h2>Capabilities</h2>
          <article *ngFor="let capability of capabilities" class="capability-row">
            <strong>{{ capability }}</strong>
            <span>Declared capability. App Studio persists an approval record before launcher installation.</span>
          </article>
        </aside>

        <main class="editor-column">
          <div class="editor-toolbar">
            <span>{{ activeDocument.label }}</span>
            <span>{{ monacoLoaded ? 'Monaco active' : 'Loading Monaco' }}</span>
          </div>
          <div #editorHost class="monaco-host" data-testid="app-studio-monaco"></div>
          <p *ngIf="statusMessage" class="status-message">{{ statusMessage }}</p>
          <p *ngIf="errorMessage" class="error-message">{{ errorMessage }}</p>
        </main>
      </section>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }

    .studio-app {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 12px;
      height: 100%;
      min-height: 0;
      padding: 16px;
      background: #151922;
      color: #eef3fb;
    }

    .studio-header,
    .editor-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    h1,
    h2 {
      margin: 0;
    }

    h1 {
      font-size: 18px;
    }

    h2 {
      margin-top: 12px;
      font-size: 13px;
      color: #b8c3d5;
    }

    p,
    small,
    .capability-row span {
      margin: 4px 0 0;
      color: #9eaabd;
      font-size: 12px;
      line-height: 1.45;
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

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .primary-action {
      border-color: #5f86ff;
      background: #315fd1;
    }

    .studio-grid {
      display: grid;
      grid-template-columns: 230px minmax(0, 1fr);
      gap: 12px;
      min-height: 0;
    }

    .studio-sidebar,
    .editor-column {
      min-height: 0;
      border: 1px solid #2c3546;
      border-radius: 8px;
      background: #0f141f;
    }

    .studio-sidebar {
      overflow: auto;
      padding: 12px;
    }

    .doc-button,
    .capability-row {
      display: grid;
      gap: 4px;
      width: 100%;
      margin-top: 8px;
      text-align: left;
    }

    .doc-button.is-active {
      border-color: #5f86ff;
      background: #1b2f66;
    }

    .capability-row {
      border: 1px solid #2c3546;
      border-radius: 6px;
      padding: 8px;
      background: #151c2a;
    }

    .editor-column {
      display: grid;
      grid-template-rows: auto 1fr auto;
      overflow: hidden;
    }

    .editor-toolbar {
      min-height: 40px;
      border-bottom: 1px solid #2c3546;
      padding: 0 12px;
      color: #b8c3d5;
      font-size: 12px;
    }

    .monaco-host {
      min-height: 260px;
      min-width: 0;
    }

    .status-message,
    .error-message {
      margin: 0;
      border-top: 1px solid #2c3546;
      padding: 8px 12px;
    }

    .error-message {
      color: #ffb8b8;
    }

    @media (max-width: 760px) {
      .studio-grid {
        grid-template-columns: 1fr;
      }

      .studio-sidebar {
        max-height: 220px;
      }
    }
  `],
})
export class AppStudioComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorHost') private editorHost?: ElementRef<HTMLDivElement>;

  readonly documents = STUDIO_DOCUMENTS.map((document) => ({ ...document }));
  readonly capabilities = ['host:read', 'agent:read-state', 'actions:register', 'notifications:create'];
  activeDocument = this.documents[0];
  monacoLoaded = false;
  approved = false;
  isInstalling = false;
  installedAppId = '';
  installStatus = 'draft';
  statusMessage = '';
  errorMessage = '';

  private monaco: MonacoApi | null = null;
  private editor: MonacoStandaloneEditor | null = null;

  ngAfterViewInit(): void {
    void this.createEditor();
  }

  ngOnDestroy(): void {
    this.editor?.dispose();
    this.editor = null;
  }

  selectDocument(kind: StudioDocumentKind): void {
    this.syncActiveDocumentFromEditor();
    this.activeDocument = this.documents.find((document) => document.kind === kind) ?? this.documents[0];
    if (this.editor) {
      this.editor.setValue(this.activeDocument.value);
      const model = this.editor.getModel();
      if (model) {
        this.monaco?.editor.setModelLanguage(model, this.activeDocument.language);
      }
    }
  }

  async approveAndInstall(): Promise<void> {
    this.syncActiveDocumentFromEditor();
    this.approved = true;
    const api = getSwitchboardApi();
    if (!api?.appManifest || !api.appPermission) {
      this.errorMessage = 'SwitchboardOS app manifest APIs are unavailable.';
      return;
    }

    this.isInstalling = true;
    this.errorMessage = '';
    this.installStatus = 'installing';
    try {
      const manifestDraft = this.parseManifestDraft();
      const sourceCode = this.documents.find((document) => document.kind === 'component')?.value ?? '';
      const existing = (await api.appManifest.list()).find((manifest) => manifest.appId === manifestDraft.appId);
      const input = {
        appId: manifestDraft.appId,
        name: manifestDraft.name,
        description: manifestDraft.description,
        version: manifestDraft.version,
        author: manifestDraft.author,
        entrypoint: manifestDraft.entrypoint,
        icon: manifestDraft.icon,
        category: manifestDraft.category,
        capabilities: manifestDraft.requestedCapabilities,
        sourceCode,
        packageMetadata: {
          isolation: 'sandboxed-iframe-srcdoc',
          sdkBridge: 'postMessage',
          nodeAccess: false,
          generatedBy: 'app-studio-demo',
          actionRegistry: [
            {
              id: 'refresh-generated-hosts',
              label: 'Refresh generated hosts',
              description: 'Generated app can refresh host data through approved host:read SDK calls.',
            },
          ],
        },
        enabled: true,
        installedAt: new Date().toISOString(),
      };
      const installed = existing
        ? await api.appManifest.update(existing.id, input)
        : await api.appManifest.create(input);
      const manifest = installed ?? existing;
      if (!manifest) {
        throw new Error('Generated app manifest was not persisted.');
      }

      const permissions = await api.appPermission.list(manifest.appId);
      for (const capability of manifestDraft.requestedCapabilities) {
        if (!permissions.some((permission) => permission.capability === capability)) {
          await api.appPermission.create({
            appId: manifest.appId,
            capability,
            granted: true,
          });
        }
      }

      await api.audit.log({
        type: 'app_studio.app_installed',
        entityType: 'app',
        entityId: manifest.appId,
        message: 'Generated app approved and installed into the local launcher.',
        metadata: {
          appId: manifest.appId,
          manifestId: manifest.id,
          capabilities: manifestDraft.requestedCapabilities,
          isolation: 'sandboxed-iframe-srcdoc',
          codePersisted: true,
          secretsLogged: false,
        },
      });

      this.installedAppId = manifest.appId;
      this.installStatus = 'installed';
      this.statusMessage = `${manifest.name} installed into the launcher and desktop shortcuts.`;
      window.postMessage({ type: 'sb:app-installed', appId: manifest.appId }, '*');
    } catch (error) {
      this.installStatus = 'failed';
      this.errorMessage = error instanceof Error ? error.message : 'Unable to install generated app.';
    } finally {
      this.isInstalling = false;
    }
  }

  private parseManifestDraft(): {
    appId: string;
    name: string;
    description: string;
    version: string;
    author: string;
    entrypoint: string;
    icon: string;
    category: string;
    requestedCapabilities: string[];
  } {
    const manifestDoc = this.documents.find((document) => document.kind === 'manifest');
    const parsed = JSON.parse(manifestDoc?.value ?? '{}') as Partial<AppManifest> & {
      requestedCapabilities?: string[];
    };
    const appId = stringField(parsed.appId, 'generated-host-health-demo');
    const capabilities = Array.isArray(parsed.requestedCapabilities)
      ? parsed.requestedCapabilities.filter((item): item is string => typeof item === 'string')
      : Array.isArray(parsed.capabilities)
        ? parsed.capabilities.filter((item): item is string => typeof item === 'string')
        : ['host:read'];
    return {
      appId,
      name: stringField(parsed.name, 'Generated Host Health Demo'),
      description: stringField(parsed.description, 'Generated local SwitchboardOS app.'),
      version: stringField(parsed.version, '0.1.0'),
      author: stringField(parsed.author, 'SwitchboardOS App Studio'),
      entrypoint: stringField(parsed.entrypoint, `${appId}.js`),
      icon: stringField(parsed.icon, 'GH'),
      category: stringField(parsed.category, 'visualization'),
      requestedCapabilities: capabilities,
    };
  }

  private syncActiveDocumentFromEditor(): void {
    if (!this.editor) {
      return;
    }
    const active = this.documents.find((document) => document.kind === this.activeDocument.kind);
    if (active) {
      active.value = this.editor.getValue();
    }
  }

  private async createEditor(): Promise<void> {
    if (!this.editorHost) {
      return;
    }

    try {
      const monaco = await this.loadMonaco();
      this.monaco = monaco;
      this.editor = monaco.editor.create(this.editorHost.nativeElement, {
        value: this.activeDocument.value,
        language: this.activeDocument.language,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        tabSize: 2,
      });
      this.monacoLoaded = true;
      this.statusMessage = 'Monaco editor loaded for local App Studio review.';
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to load Monaco editor.';
    }
  }

  private loadMonaco(): Promise<MonacoApi> {
    const target = window as unknown as {
      monaco?: MonacoApi;
      require?: MonacoLoaderRequire;
    };

    if (target.monaco) {
      return Promise.resolve(target.monaco);
    }

    return new Promise((resolve, reject) => {
      const loadEditor = (): void => {
        const loader = target.require;
        if (!loader) {
          reject(new Error('Monaco AMD loader was not installed.'));
          return;
        }

        loader.config({ paths: { vs: 'assets/monaco/vs' } });
        loader(['vs/editor/editor.main'], (monaco) => resolve(monaco), reject);
      };

      if (target.require) {
        loadEditor();
        return;
      }

      const script = document.createElement('script');
      script.src = 'assets/monaco/vs/loader.js';
      script.async = true;
      script.onload = loadEditor;
      script.onerror = () => reject(new Error('Unable to load local Monaco loader asset.'));
      document.head.appendChild(script);
    });
  }
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
