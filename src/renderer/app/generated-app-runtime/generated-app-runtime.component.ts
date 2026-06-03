import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import type { AppManifest, HostRecord, ShellWindowSemanticState } from '../../../shared/mvp-models';
import { getSwitchboardApi } from '../switchboard-api';

interface SdkRequestMessage {
  type: 'switchboard-sdk-request';
  appId: string;
  windowId: string;
  requestId: string;
  method: string;
  payload?: unknown;
}

interface SdkStateMessage {
  type: 'switchboard-sdk-state';
  appId: string;
  windowId: string;
  state: {
    summary?: string;
    status?: string;
    entities?: Array<Record<string, unknown>>;
    observations?: Array<Record<string, unknown>>;
    availableActions?: Array<{ id: string; label: string; description: string }>;
    riskHints?: string[];
    metadata?: Record<string, unknown>;
  };
}

type SdkMessage = SdkRequestMessage | SdkStateMessage;

@Component({
  selector: 'app-generated-app-runtime',
  standalone: false,
  template: `
    <section
      class="generated-runtime"
      data-testid="generated-app-runtime"
      [attr.data-app-id]="manifest?.appId"
      [attr.data-window-id]="windowId"
      [attr.data-sandbox]="sandboxLabel"
      [attr.data-node-access]="false"
      [attr.data-granted-capabilities]="grantedCapabilitiesText"
      [attr.data-denied-count]="deniedCount"
      [attr.data-semantic-kind]="semanticState.kind"
      [attr.data-semantic-status]="semanticState.status"
    >
      <header>
        <div>
          <h2>{{ manifest?.name || 'Generated app' }}</h2>
          <span>{{ sandboxLabel }} / Node disabled / SDK bridge scoped by app permissions</span>
        </div>
        <span class="status-pill">{{ permissionStatus }}</span>
      </header>

      <iframe
        #frame
        class="generated-frame"
        title="Generated app sandbox"
        sandbox="allow-scripts"
        [attr.srcdoc]="srcdoc"
      ></iframe>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .generated-runtime {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 10px;
      height: 100%;
      min-height: 0;
      padding: 12px;
      background: #101722;
      color: #e8eef8;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    h2 {
      margin: 0;
      font-size: 15px;
    }

    span {
      color: #9fb0c8;
      font-size: 12px;
    }

    .status-pill {
      border: 1px solid #23553a;
      border-radius: 999px;
      padding: 4px 8px;
      color: #c6f6d5;
      background: #102419;
      white-space: nowrap;
    }

    .generated-frame {
      width: 100%;
      height: 100%;
      min-height: 0;
      border: 1px solid #2b3a50;
      border-radius: 6px;
      background: #0e141f;
    }
  `],
})
export class GeneratedAppRuntimeComponent implements OnInit, OnChanges, OnDestroy {
  @Input() manifest: AppManifest | null = null;
  @Input() windowId = '';
  @Input() hosts: HostRecord[] = [];
  @ViewChild('frame') private frame?: ElementRef<HTMLIFrameElement>;

  readonly sandboxLabel = 'sandboxed-iframe-srcdoc';
  srcdoc = '';
  grantedCapabilities = new Set<string>();
  deniedCount = 0;
  permissionStatus = 'Loading permissions';
  semanticState: ShellWindowSemanticState = {
    kind: 'generated-app',
    status: 'loading',
    summary: 'Generated app runtime loading.',
    metadata: {},
  };

  private readonly messageHandler = (event: MessageEvent<unknown>): void => {
    void this.handleMessage(event);
  };

  ngOnInit(): void {
    window.addEventListener('message', this.messageHandler);
    this.reloadRuntime();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.reloadRuntime();
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageHandler);
  }

  get grantedCapabilitiesText(): string {
    return Array.from(this.grantedCapabilities).sort().join(',');
  }

  private reloadRuntime(): void {
    void this.loadPermissions().finally(() => {
      this.rebuildSrcdoc();
    });
  }

  private async loadPermissions(): Promise<void> {
    const api = getSwitchboardApi();
    if (!api?.appPermission || !this.manifest) {
      this.grantedCapabilities = new Set();
      this.permissionStatus = 'No permission API';
      return;
    }

    try {
      const permissions = await api.appPermission.list(this.manifest.appId);
      this.grantedCapabilities = new Set(
        permissions
          .filter((permission) => permission.granted)
          .map((permission) => permission.capability),
      );
      this.permissionStatus = `${this.grantedCapabilities.size} capabilities approved`;
      this.publishSemanticState({
        kind: 'generated-app',
        status: 'ready',
        summary: `${this.manifest.name} running in sandboxed iframe.`,
        metadata: {
          appId: this.manifest.appId,
          isolation: this.sandboxLabel,
          nodeAccess: false,
          grantedCapabilities: Array.from(this.grantedCapabilities),
          requestedCapabilities: this.manifest.capabilities,
        },
      });
    } catch {
      this.permissionStatus = 'Permission load failed';
    }
  }

  private rebuildSrcdoc(): void {
    if (!this.manifest) {
      this.srcdoc = '<!doctype html><p>No generated app manifest.</p>';
      return;
    }

    const bootstrap = `
      const __appId = ${JSON.stringify(this.manifest.appId)};
      const __windowId = ${JSON.stringify(this.windowId)};
      let __requestOrdinal = 1;
      function __sdkRequest(method, payload) {
        const requestId = 'sdk-' + (__requestOrdinal++);
        parent.postMessage({ type: 'switchboard-sdk-request', appId: __appId, windowId: __windowId, requestId, method, payload }, '*');
        return new Promise((resolve, reject) => {
          const handler = (event) => {
            const data = event.data || {};
            if (data.type !== 'switchboard-sdk-response' || data.requestId !== requestId) return;
            window.removeEventListener('message', handler);
            if (data.ok) resolve(data.result);
            else reject(new Error(data.error || 'SwitchboardOS SDK request denied.'));
          };
          window.addEventListener('message', handler);
        });
      }
      window.SwitchboardOS = Object.freeze({
        window: Object.freeze({ id: __windowId, appId: __appId }),
        host: Object.freeze({
          listHosts: () => __sdkRequest('host:list'),
          testConnection: (hostId) => __sdkRequest('host:testConnection', { hostId }),
        }),
        storage: Object.freeze({
          get: (key) => __sdkRequest('storage:get', { key }),
          set: (key, value) => __sdkRequest('storage:set', { key, value }),
        }),
        agent: Object.freeze({
          setState: (state) => parent.postMessage({ type: 'switchboard-sdk-state', appId: __appId, windowId: __windowId, state }, '*'),
        }),
      });
    `;

    this.srcdoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0e141f; color: #e8eef8; }
    body { margin: 0; min-height: 100vh; background: #0e141f; }
    button { font: inherit; }
  </style>
</head>
<body>
  <main id="app-root"></main>
  <script>${escapeScript(bootstrap)}</script>
  <script>${escapeScript(this.manifest.sourceCode || generatedAppFallbackCode(this.manifest.name))}</script>
</body>
</html>`;
  }

  private async handleMessage(event: MessageEvent<unknown>): Promise<void> {
    if (this.frame?.nativeElement.contentWindow && event.source !== this.frame.nativeElement.contentWindow) {
      return;
    }
    const message = event.data;
    if (!isSdkMessage(message) || message.appId !== this.manifest?.appId || message.windowId !== this.windowId) {
      return;
    }

    if (message.type === 'switchboard-sdk-state') {
      this.publishSemanticState({
        kind: 'generated-app',
        status: message.state.status ?? 'ready',
        summary: message.state.summary ?? `${this.manifest.name} reported semantic state.`,
        metadata: {
          ...(message.state.metadata ?? {}),
          appId: this.manifest.appId,
          entities: message.state.entities ?? [],
          observations: message.state.observations ?? [],
          availableActions: message.state.availableActions ?? [],
          riskHints: message.state.riskHints ?? [],
          isolation: this.sandboxLabel,
          nodeAccess: false,
          deniedCount: this.deniedCount,
        },
      });
      return;
    }

    try {
      const result = await this.executeSdkRequest(message);
      this.postSdkResponse(message.requestId, true, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'SDK request denied.';
      this.deniedCount += 1;
      this.postSdkResponse(message.requestId, false, null, errorMessage);
      await this.auditDenied(message, errorMessage);
    }
  }

  private async executeSdkRequest(message: SdkRequestMessage): Promise<unknown> {
    const api = getSwitchboardApi();
    if (message.method === 'host:list') {
      this.requireCapability('host:read', message.method);
      const hosts = api ? await api.host.list() : this.hosts;
      return hosts.map((host) => ({
        id: host.id,
        name: host.name,
        address: host.address || host.hostname,
        port: host.port,
        lastConnectionStatus: host.lastConnectionStatus,
        osHint: host.osHint,
        bootstrapStatus: host.bootstrapStatus,
        capabilities: host.capabilities,
        tags: host.tags,
      }));
    }

    if (message.method === 'host:testConnection') {
      this.requireCapability('host:actions', message.method);
      const payload = isRecord(message.payload) ? message.payload : {};
      const hostId = typeof payload.hostId === 'string' ? payload.hostId : '';
      if (!api || !hostId) {
        throw new Error('Host action request is missing host context.');
      }
      return api.host.testConnection(hostId);
    }

    if (message.method === 'storage:get') {
      this.requireCapability('storage:scoped', message.method);
      const key = scopedStorageKey(this.manifest!.appId, message.payload);
      return window.localStorage.getItem(key);
    }

    if (message.method === 'storage:set') {
      this.requireCapability('storage:scoped', message.method);
      const payload = isRecord(message.payload) ? message.payload : {};
      const key = scopedStorageKey(this.manifest!.appId, payload);
      window.localStorage.setItem(key, String(payload.value ?? ''));
      return true;
    }

    throw new Error(`Unsupported SwitchboardOS SDK method: ${message.method}`);
  }

  private requireCapability(capability: string, method: string): void {
    if (!this.grantedCapabilities.has(capability)) {
      throw new Error(`Capability denied for ${method}: ${capability}`);
    }
  }

  private postSdkResponse(requestId: string, ok: boolean, result: unknown, error?: string): void {
    this.frame?.nativeElement.contentWindow?.postMessage({
      type: 'switchboard-sdk-response',
      requestId,
      ok,
      result,
      error,
    }, '*');
  }

  private publishSemanticState(state: ShellWindowSemanticState): void {
    this.semanticState = state;
    window.dispatchEvent(new CustomEvent('switchboard-generated-app-semantic', {
      detail: {
        windowId: this.windowId,
        semanticState: state,
        registeredActions: this.manifest?.packageMetadata?.['actionRegistry'] ?? [],
      },
    }));
  }

  private async auditDenied(message: SdkRequestMessage, reason: string): Promise<void> {
    await getSwitchboardApi()?.audit.log({
      type: 'app.sdk_capability_denied',
      entityType: 'app',
      entityId: this.manifest?.appId ?? message.appId,
      message: `Generated app SDK request denied: ${message.method}.`,
      metadata: {
        appId: this.manifest?.appId ?? message.appId,
        method: message.method,
        reason,
        sandbox: this.sandboxLabel,
        secretsLogged: false,
      },
    }).catch(() => undefined);
  }
}

function isSdkMessage(value: unknown): value is SdkMessage {
  return isRecord(value)
    && (value.type === 'switchboard-sdk-request' || value.type === 'switchboard-sdk-state')
    && typeof value.appId === 'string'
    && typeof value.windowId === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

function scopedStorageKey(appId: string, payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const key = typeof record.key === 'string' && record.key.trim() ? record.key.trim() : 'default';
  return `switchboardos.generated-app.${appId}.${key}`;
}

function generatedAppFallbackCode(name: string): string {
  return `document.getElementById('app-root').textContent = ${JSON.stringify(name)} + ' has no source code.';`;
}
