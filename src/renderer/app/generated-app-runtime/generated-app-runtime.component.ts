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
import type {
  AppletElementContextMenuActionContribution,
  AppletElementContextMenuObject,
  OpenAppletElementContextMenu,
} from '../applet-context-menu';
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

interface SdkContextMenuResultMessage {
  type: 'switchboard-sdk-context-menu-result';
  appId: string;
  windowId: string;
  invocationId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

type SdkMessage = SdkRequestMessage | SdkStateMessage | SdkContextMenuResultMessage;

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

interface GeneratedAppContextMenuActionRegistration {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  detail?: string;
  disabledReason?: string;
  disabled: boolean;
  destructive: boolean;
  separatorBefore: boolean;
  requiredCapabilities: string[];
  hasHandler: boolean;
}

interface GeneratedAppContextMenuRegistration {
  targetId: string;
  label: string;
  object: AppletElementContextMenuObject;
  actions: GeneratedAppContextMenuActionRegistration[];
}

interface PendingContextMenuInvocation {
  timeoutId: number;
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

      <p
        class="runtime-status"
        data-testid="generated-app-runtime-status"
        [attr.data-runtime-status]="semanticState.status"
      >
        {{ semanticState.summary }}
      </p>

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
      grid-template-rows: auto auto 1fr;
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

    .runtime-status {
      margin: 0;
      color: #c9d7ec;
      font-size: 12px;
      line-height: 1.4;
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
  @Input() openAppletElementContextMenu: OpenAppletElementContextMenu | null = null;
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
  private readonly contextMenuRegistrations = new Map<string, GeneratedAppContextMenuRegistration>();
  private readonly pendingContextMenuInvocations = new Map<string, PendingContextMenuInvocation>();
  private reloadGeneration = 0;
  private contextMenuInvocationOrdinal = 1;

  ngAfterViewInit(): void {
    this.applySrcdocToFrame();
  }

  ngOnInit(): void {
    window.addEventListener('message', this.messageHandler);
    this.reloadRuntime();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['manifest'] || changes['windowId'] || changes['hosts']) {
      this.reloadRuntime();
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageHandler);
    this.rejectPendingContextMenuInvocations('Generated app runtime was destroyed.');
  }

  get grantedCapabilitiesText(): string {
    return Array.from(this.grantedCapabilities).sort().join(',');
  }

  private reloadRuntime(): void {
    const generation = ++this.reloadGeneration;
    this.contextMenuRegistrations.clear();
    this.rejectPendingContextMenuInvocations('Generated app runtime was reloaded.');
    void this.loadPermissions().finally(() => {
      if (generation !== this.reloadGeneration) {
        return;
      }
      try {
        this.rebuildSrcdoc();
        this.publishReadyState();
      } catch (error) {
        this.publishSemanticState({
          kind: 'generated-app',
          status: 'runtime-error',
          summary: error instanceof Error ? error.message : 'Generated app runtime failed to load.',
          metadata: {
            appId: this.manifest?.appId,
            windowId: this.windowId,
            isolation: this.sandboxLabel,
            nodeAccess: false,
            sourceCodeLogged: false,
            secretsLogged: false,
          },
        });
      }
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
      const __contextMenuHandlers = new Map();
      function __contextMenuKey(targetId, actionId) {
        return String(targetId || 'window') + '::' + String(actionId || '');
      }
      function __serializableContextAction(action) {
        const input = action && typeof action === 'object' ? action : {};
        const id = typeof input.id === 'string' ? input.id : '';
        if (typeof input.handler === 'function') {
          __contextMenuHandlers.set(__contextMenuKey(input.targetId || input.__targetId || 'window', id), input.handler);
        }
        return {
          id,
          label: typeof input.label === 'string' ? input.label : id,
          icon: typeof input.icon === 'string' ? input.icon : undefined,
          shortcut: typeof input.shortcut === 'string' ? input.shortcut : undefined,
          detail: typeof input.detail === 'string' ? input.detail : undefined,
          disabledReason: typeof input.disabledReason === 'string' ? input.disabledReason : undefined,
          disabled: Boolean(input.disabled),
          destructive: Boolean(input.destructive),
          separatorBefore: Boolean(input.separatorBefore),
          requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [],
          hasHandler: typeof input.handler === 'function',
        };
      }
      function __contextMenuRect(element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }
      function __contextMenuPayload(input) {
        const source = input && typeof input === 'object' ? input : {};
        const targetId = typeof source.targetId === 'string' && source.targetId.trim()
          ? source.targetId.trim()
          : 'window';
        const rawActions = Array.isArray(source.actions) ? source.actions : [];
        const actions = rawActions.map((action) => __serializableContextAction({ ...action, __targetId: targetId }));
        return {
          targetId,
          label: typeof source.label === 'string' ? source.label : undefined,
          x: Number.isFinite(source.x) ? source.x : undefined,
          y: Number.isFinite(source.y) ? source.y : undefined,
          targetRect: source.targetRect && typeof source.targetRect === 'object' ? source.targetRect : undefined,
          object: source.object && typeof source.object === 'object' ? source.object : undefined,
          actions,
        };
      }
      async function __contextMenuRegister(input) {
        return __sdkRequest('contextMenu:register', __contextMenuPayload(input));
      }
      function __contextMenuOpen(input) {
        return __sdkRequest('contextMenu:open', __contextMenuPayload(input));
      }
      function __contextMenuOpenFromEvent(event, input) {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        const element = event && event.currentTarget instanceof Element ? event.currentTarget : null;
        const rect = __contextMenuRect(element);
        return __contextMenuOpen({
          ...(input || {}),
          x: event && Number.isFinite(event.clientX) ? event.clientX : rect ? rect.left + 12 : undefined,
          y: event && Number.isFinite(event.clientY) ? event.clientY : rect ? rect.top + 12 : undefined,
          targetRect: rect,
        });
      }
      async function __contextMenuBindElement(element, input) {
        if (!element || typeof element.addEventListener !== 'function') {
          throw new Error('SwitchboardOS.contextMenu.bindElement requires a DOM element owned by the generated app.');
        }
        const registration = { ...(input || {}) };
        if (!registration.targetId && element.id) {
          registration.targetId = element.id;
        }
        const registered = await __contextMenuRegister(registration);
        const open = (event) => __contextMenuOpenFromEvent(event, {
          targetId: registration.targetId || element.id || 'window',
          label: registration.label,
          object: registration.object,
        });
        const keyOpen = (event) => {
          if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            return open(event);
          }
          return undefined;
        };
        element.addEventListener('contextmenu', open);
        element.addEventListener('keydown', keyOpen);
        return Object.freeze({
          ...registered,
          dispose: () => {
            element.removeEventListener('contextmenu', open);
            element.removeEventListener('keydown', keyOpen);
          },
        });
      }
      window.addEventListener('message', async (event) => {
        const data = event.data || {};
        if (data.type !== 'switchboard-sdk-context-menu-invoke' || data.appId !== __appId || data.windowId !== __windowId) {
          return;
        }
        try {
          const handler = __contextMenuHandlers.get(__contextMenuKey(data.targetId, data.actionId));
          if (typeof handler !== 'function') {
            throw new Error('Generated app context menu action is not registered.');
          }
          const result = await handler(Object.freeze({
            actionId: data.actionId,
            targetId: data.targetId,
            source: 'switchboard-shell-context-menu',
          }));
          parent.postMessage({
            type: 'switchboard-sdk-context-menu-result',
            appId: __appId,
            windowId: __windowId,
            invocationId: data.invocationId,
            ok: true,
            result: result === undefined ? null : result,
          }, '*');
        } catch (error) {
          parent.postMessage({
            type: 'switchboard-sdk-context-menu-result',
            appId: __appId,
            windowId: __windowId,
            invocationId: data.invocationId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }, '*');
        }
      });
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
        contextMenu: Object.freeze({
          register: __contextMenuRegister,
          open: __contextMenuOpen,
          openFromEvent: __contextMenuOpenFromEvent,
          bindElement: __contextMenuBindElement,
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

    if (message.type === 'switchboard-sdk-context-menu-result') {
      this.resolveContextMenuInvocation(message);
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

    if (message.method === 'contextMenu:register') {
      return this.registerContextMenuContribution(message.payload);
    }

    if (message.method === 'contextMenu:open') {
      return this.openContextMenuContribution(message.payload);
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

  private registerContextMenuContribution(payload: unknown): Record<string, unknown> {
    this.assertContextMenuContributionAllowed();
    const record = isRecord(payload) ? payload : {};
    const targetId = sdkStringFromRecord(record, 'targetId', 'window', 80);
    const rawActions = Array.isArray(record.actions) ? record.actions : [];
    if (rawActions.length === 0) {
      throw new Error('Generated app context menu registration requires at least one action.');
    }

    const actions = rawActions.map((action) => this.contextMenuActionFromPayload(action));
    const object = this.contextMenuObjectFromPayload(record.object, targetId, actions, record);
    const registration: GeneratedAppContextMenuRegistration = {
      targetId,
      label: sdkStringFromRecord(record, 'label', object.label, 96),
      object,
      actions,
    };
    this.contextMenuRegistrations.set(targetId, registration);
    this.publishSemanticState({
      kind: 'generated-app',
      status: 'context-menu-registered',
      summary: `${this.manifest!.name} registered a shell context menu for ${registration.label}.`,
      metadata: {
        appId: this.manifest!.appId,
        windowId: this.windowId,
        targetId,
        targetScope: 'generated-app-element',
        actionIds: actions.map((action) => action.id),
        disabledActionIds: actions.filter((action) => action.disabled).map((action) => action.id),
        source: 'generated-app-sdk',
        sourceCodeLogged: false,
        secretsLogged: false,
      },
    });
    return {
      registered: true,
      targetId,
      targetScope: 'generated-app-element',
      actionIds: actions.map((action) => action.id),
      disabledActionIds: actions.filter((action) => action.disabled).map((action) => action.id),
    };
  }

  private openContextMenuContribution(payload: unknown): Record<string, unknown> {
    this.assertContextMenuContributionAllowed();
    if (!this.openAppletElementContextMenu) {
      throw new Error('Shell context menu dispatcher is unavailable for generated apps.');
    }

    const record = isRecord(payload) ? payload : {};
    const targetId = sdkStringFromRecord(record, 'targetId', 'window', 80);
    const registration = this.contextMenuRegistrations.get(targetId);
    if (!registration) {
      throw new Error(`No generated app context menu is registered for target ${targetId}.`);
    }

    const coordinates = this.contextMenuCoordinates(record);
    const sourceAppId = this.manifest!.appId;
    const sourceWindowId = this.windowId;
    const actions: AppletElementContextMenuActionContribution[] = registration.actions.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      shortcut: action.shortcut,
      detail: action.detail ?? action.disabledReason,
      disabledReason: action.disabledReason,
      disabled: action.disabled,
      destructive: action.destructive,
      separatorBefore: action.separatorBefore,
      source: 'generated-app-sdk',
      sourceAppId,
      sourceWindowId,
      targetScope: 'generated-app-element',
      requiredCapabilities: [...action.requiredCapabilities],
      handler: () => this.invokeGeneratedContextMenuAction(registration, action),
    }));

    this.openAppletElementContextMenu({
      x: coordinates.x,
      y: coordinates.y,
      target: 'generated-app-element',
      label: sdkStringFromRecord(record, 'label', registration.label, 96),
      object: {
        ...registration.object,
        sourceAppId,
        sourceWindowId,
      },
      actions,
      focusReturnElement: this.frame?.nativeElement,
    });

    return {
      opened: true,
      targetId,
      targetScope: 'generated-app-element',
      sourceAppId,
      sourceWindowId,
      actionIds: registration.actions.map((action) => action.id),
      disabledActionIds: registration.actions.filter((action) => action.disabled).map((action) => action.id),
    };
  }

  private async invokeGeneratedContextMenuAction(
    registration: GeneratedAppContextMenuRegistration,
    action: GeneratedAppContextMenuActionRegistration,
  ): Promise<void> {
    const invocationId = `context-menu-${this.contextMenuInvocationOrdinal++}`;
    this.publishSemanticState({
      kind: 'generated-app',
      status: 'context-menu-action-running',
      summary: `${this.manifest!.name} is running ${action.label}.`,
      metadata: {
        appId: this.manifest!.appId,
        windowId: this.windowId,
        targetId: registration.targetId,
        actionId: action.id,
        targetScope: 'generated-app-element',
        source: 'generated-app-sdk',
        sourceCodeLogged: false,
        secretsLogged: false,
      },
    });

    await new Promise<unknown>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingContextMenuInvocations.delete(invocationId);
        reject(new Error('Generated app context menu action timed out.'));
      }, 15000);
      this.pendingContextMenuInvocations.set(invocationId, { timeoutId, resolve, reject });
      this.frame?.nativeElement.contentWindow?.postMessage({
        type: 'switchboard-sdk-context-menu-invoke',
        appId: this.manifest!.appId,
        windowId: this.windowId,
        invocationId,
        targetId: registration.targetId,
        actionId: action.id,
      }, '*');
    }).then((result) => {
      this.publishSemanticState({
        kind: 'generated-app',
        status: 'context-menu-action-complete',
        summary: `${action.label} completed through the generated app SDK context menu.`,
        metadata: {
          appId: this.manifest!.appId,
          windowId: this.windowId,
          targetId: registration.targetId,
          actionId: action.id,
          targetScope: 'generated-app-element',
          source: 'generated-app-sdk',
          resultReturned: result !== undefined && result !== null,
          sourceCodeLogged: false,
          secretsLogged: false,
        },
      });
    }).catch((error) => {
      this.publishSemanticState({
        kind: 'generated-app',
        status: 'context-menu-action-error',
        summary: error instanceof Error ? error.message : 'Generated app context menu action failed.',
        metadata: {
          appId: this.manifest!.appId,
          windowId: this.windowId,
          targetId: registration.targetId,
          actionId: action.id,
          targetScope: 'generated-app-element',
          source: 'generated-app-sdk',
          sourceCodeLogged: false,
          secretsLogged: false,
        },
      });
      throw error;
    });
  }

  private resolveContextMenuInvocation(message: SdkContextMenuResultMessage): void {
    const pending = this.pendingContextMenuInvocations.get(message.invocationId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeoutId);
    this.pendingContextMenuInvocations.delete(message.invocationId);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }
    pending.reject(new Error(message.error || 'Generated app context menu action failed.'));
  }

  private rejectPendingContextMenuInvocations(reason: string): void {
    for (const [invocationId, pending] of this.pendingContextMenuInvocations.entries()) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error(reason));
      this.pendingContextMenuInvocations.delete(invocationId);
    }
  }

  private assertContextMenuContributionAllowed(): void {
    if (!this.grantedCapabilities.has('context-menu:contribute')) {
      throw new Error('Generated app context menu requires approved context-menu:contribute capability.');
    }
  }

  private contextMenuActionFromPayload(payload: unknown): GeneratedAppContextMenuActionRegistration {
    const record = isRecord(payload) ? payload : {};
    const id = sdkStringFromRecord(record, 'id', '', 80);
    if (!id) {
      throw new Error('Generated app context menu action is missing id.');
    }
    const requiredCapabilities = sdkStringArray(record.requiredCapabilities, 12, 96);
    const missingCapabilities = requiredCapabilities.filter((capability) => !this.grantedCapabilities.has(capability));
    const explicitDisabledReason = sdkOptionalStringFromRecord(record, 'disabledReason', 180);
    const handlerMissing = record.hasHandler === false;
    const disabledReason = explicitDisabledReason
      ?? (missingCapabilities.length > 0
        ? `Missing required capability: ${missingCapabilities.join(', ')}.`
        : handlerMissing
          ? 'Generated app action did not register a callback.'
          : undefined);
    return {
      id,
      label: sdkStringFromRecord(record, 'label', id, 96),
      icon: sdkOptionalStringFromRecord(record, 'icon', 12) ?? undefined,
      shortcut: sdkOptionalStringFromRecord(record, 'shortcut', 40) ?? undefined,
      detail: sdkOptionalStringFromRecord(record, 'detail', 180) ?? undefined,
      disabledReason,
      disabled: Boolean(record.disabled) || Boolean(disabledReason),
      destructive: Boolean(record.destructive),
      separatorBefore: Boolean(record.separatorBefore),
      requiredCapabilities,
      hasHandler: !handlerMissing,
    };
  }

  private contextMenuObjectFromPayload(
    payload: unknown,
    targetId: string,
    actions: GeneratedAppContextMenuActionRegistration[],
    registrationRecord: Record<string, unknown>,
  ): AppletElementContextMenuObject {
    const record = isRecord(payload) ? payload : {};
    const actionCapabilities = actions.flatMap((action) => action.requiredCapabilities);
    const objectCapabilities = sdkStringArray(record.requiredCapabilities, 12, 96);
    return {
      id: sdkStringFromRecord(record, 'id', `generated-app:${this.manifest!.appId}:${targetId}`, 120),
      kind: sdkStringFromRecord(record, 'kind', 'generated-app-element', 80),
      owner: this.manifest!.appId,
      source: 'generated-app-sdk',
      targetScope: 'generated-app-element',
      label: sdkStringFromRecord(record, 'label', sdkStringFromRecord(registrationRecord, 'label', targetId, 96), 96),
      actionIds: actions.map((action) => action.id),
      sourceAppId: this.manifest!.appId,
      sourceWindowId: this.windowId,
      requiredCapabilities: Array.from(new Set([
        'context-menu:contribute',
        ...objectCapabilities,
        ...actionCapabilities,
      ])),
    };
  }

  private contextMenuCoordinates(record: Record<string, unknown>): { x: number; y: number } {
    const frameRect = this.frame?.nativeElement.getBoundingClientRect();
    const rawX = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : null;
    const rawY = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : null;
    const targetRect = isRecord(record.targetRect) ? record.targetRect : {};
    const rectLeft = typeof targetRect.left === 'number' && Number.isFinite(targetRect.left) ? targetRect.left : 16;
    const rectTop = typeof targetRect.top === 'number' && Number.isFinite(targetRect.top) ? targetRect.top : 16;
    const localX = rawX ?? rectLeft + 12;
    const localY = rawY ?? rectTop + 12;
    const x = Math.max(8, Math.round((frameRect?.left ?? 0) + localX));
    const y = Math.max(8, Math.round((frameRect?.top ?? 0) + localY));
    return { x, y };
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
  if (!isRecord(value) || typeof value.appId !== 'string' || typeof value.windowId !== 'string') {
    return false;
  }
  if (value.type === 'switchboard-sdk-request') {
    return typeof value.requestId === 'string' && typeof value.method === 'string';
  }
  if (value.type === 'switchboard-sdk-state') {
    return isRecord(value.state);
  }
  return value.type === 'switchboard-sdk-context-menu-result' && typeof value.invocationId === 'string';
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

function sdkStringFromRecord(record: Record<string, unknown>, key: string, fallback: string, maxLength: number): string {
  const value = typeof record[key] === 'string' ? record[key].trim() : '';
  return (value || fallback).slice(0, maxLength);
}

function sdkOptionalStringFromRecord(record: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = typeof record[key] === 'string' ? record[key].trim() : '';
  return value ? value.slice(0, maxLength) : null;
}

function sdkStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim().slice(0, maxLength)),
  )).slice(0, maxItems);
}

function generatedAppFallbackCode(name: string): string {
  return `document.getElementById('app-root').textContent = ${JSON.stringify(name)} + ' has no source code.';`;
}
