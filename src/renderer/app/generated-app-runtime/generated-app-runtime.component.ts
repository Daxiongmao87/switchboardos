import {
  AfterViewInit,
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

type GeneratedAppWindowSdkMethod =
  | 'window:getInfo'
  | 'window:setTitle'
  | 'window:setBadge'
  | 'window:setStatus'
  | 'window:setPreferredSize';

interface GeneratedAppWindowSdkRequestDetail {
  appId: string;
  windowId: string;
  method: GeneratedAppWindowSdkMethod;
  payload?: unknown;
  handled: boolean;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

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
export class GeneratedAppRuntimeComponent implements AfterViewInit, OnInit, OnChanges, OnDestroy {
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
  private reloadGeneration = 0;

  ngAfterViewInit(): void {
    this.applySrcdocToFrame();
  }

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
    const generation = ++this.reloadGeneration;
    void this.loadPermissions().finally(() => {
      if (generation !== this.reloadGeneration) {
        return;
      }
      this.rebuildSrcdoc();
      this.publishReadyState();
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
    } catch {
      this.permissionStatus = 'Permission load failed';
    }
  }

  private publishReadyState(): void {
    if (!this.manifest) {
      return;
    }

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
        window: Object.freeze({
          id: __windowId,
          appId: __appId,
          getInfo: () => __sdkRequest('window:getInfo'),
          setTitle: (title) => __sdkRequest('window:setTitle', { title }),
          setBadge: (badge) => __sdkRequest('window:setBadge', { badge }),
          setStatus: (status) => __sdkRequest('window:setStatus', { status }),
          setPreferredSize: (size) => __sdkRequest('window:setPreferredSize', size),
        }),
        host: Object.freeze({
          listHosts: () => __sdkRequest('host:list'),
          getHost: (hostId) => __sdkRequest('host:get', { hostId }),
          getHostStatus: (hostId) => __sdkRequest('host:getStatus', { hostId }),
          getCapabilities: (hostId) => __sdkRequest('host:getCapabilities', { hostId }),
          testConnection: (hostId) => __sdkRequest('host:testConnection', { hostId }),
        }),
        storage: Object.freeze({
          get: (key) => __sdkRequest('storage:get', { key }),
          set: (key, value) => __sdkRequest('storage:set', { key, value }),
          delete: (key) => __sdkRequest('storage:delete', { key }),
          remove: (key) => __sdkRequest('storage:delete', { key }),
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
    this.applySrcdocToFrame();
  }

  private applySrcdocToFrame(): void {
    if (!this.frame?.nativeElement || this.frame.nativeElement.srcdoc === this.srcdoc) {
      return;
    }

    this.frame.nativeElement.srcdoc = this.srcdoc;
  }

  private async handleMessage(event: MessageEvent<unknown>): Promise<void> {
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
    if (isGeneratedAppWindowSdkMethod(message.method)) {
      return this.executeWindowSdkRequest(message);
    }

    if (message.method === 'host:list') {
      if (!api?.appHost) {
        throw new Error('Generated app host SDK API is unavailable.');
      }
      return api.appHost.listHosts(this.manifest!.appId, this.windowId);
    }

    if (message.method === 'host:get') {
      if (!api?.appHost) {
        throw new Error('Generated app host SDK API is unavailable.');
      }
      const hostId = sdkHostId(message.payload);
      return api.appHost.getHost(this.manifest!.appId, this.windowId, hostId);
    }

    if (message.method === 'host:getStatus') {
      if (!api?.appHost) {
        throw new Error('Generated app host SDK API is unavailable.');
      }
      const hostId = sdkHostId(message.payload);
      return api.appHost.getHostStatus(this.manifest!.appId, this.windowId, hostId);
    }

    if (message.method === 'host:getCapabilities') {
      if (!api?.appHost) {
        throw new Error('Generated app host SDK API is unavailable.');
      }
      const hostId = sdkHostId(message.payload);
      return api.appHost.getCapabilities(this.manifest!.appId, this.windowId, hostId);
    }

    if (message.method === 'host:testConnection') {
      if (!api?.appHost) {
        throw new Error('Generated app host SDK API is unavailable.');
      }
      const hostId = sdkHostId(message.payload);
      return api.appHost.testConnection(this.manifest!.appId, this.windowId, hostId);
    }

    if (message.method === 'storage:get') {
      if (!api?.appStorage) {
        throw new Error('App scoped storage API is unavailable.');
      }
      const key = sdkStorageKey(message.payload);
      const result = await api.appStorage.get(this.manifest!.appId, key);
      return result.value;
    }

    if (message.method === 'storage:set') {
      if (!api?.appStorage) {
        throw new Error('App scoped storage API is unavailable.');
      }
      const payload = isRecord(message.payload) ? message.payload : {};
      const key = sdkStorageKey(payload);
      await api.appStorage.set(this.manifest!.appId, key, String(payload.value ?? ''));
      return true;
    }

    if (message.method === 'storage:delete') {
      if (!api?.appStorage) {
        throw new Error('App scoped storage API is unavailable.');
      }
      const key = sdkStorageKey(message.payload);
      const result = await api.appStorage.remove(this.manifest!.appId, key);
      return result.deleted;
    }

    throw new Error(`Unsupported SwitchboardOS SDK method: ${message.method}`);
  }

  private executeWindowSdkRequest(message: SdkRequestMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const detail: GeneratedAppWindowSdkRequestDetail = {
        appId: this.manifest!.appId,
        windowId: this.windowId,
        method: message.method as GeneratedAppWindowSdkMethod,
        payload: message.payload,
        handled: false,
        resolve,
        reject,
      };
      window.dispatchEvent(new CustomEvent('switchboard-generated-app-window-request', { detail }));
      if (!detail.handled) {
        reject(new Error('Generated app window SDK handler is unavailable.'));
      }
    });
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
        storageValueLogged: false,
        sourceCodeLogged: false,
        packageMetadataLogged: false,
        providerPayloadLogged: false,
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

function isGeneratedAppWindowSdkMethod(value: string): value is GeneratedAppWindowSdkMethod {
  return value === 'window:getInfo'
    || value === 'window:setTitle'
    || value === 'window:setBadge'
    || value === 'window:setStatus'
    || value === 'window:setPreferredSize';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

function sdkStorageKey(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const key = typeof record.key === 'string' && record.key.trim() ? record.key.trim() : 'default';
  return key;
}

function sdkHostId(payload: unknown): string {
  const record = isRecord(payload) ? payload : {};
  const hostId = typeof record.hostId === 'string' ? record.hostId.trim() : '';
  if (!hostId) {
    throw new Error('Host SDK request is missing hostId.');
  }
  return hostId;
}

function generatedAppFallbackCode(name: string): string {
  return `document.getElementById('app-root').textContent = ${JSON.stringify(name)} + ' has no source code.';`;
}
