export type AppletElementContextMenuHandler = () => void | Promise<void>;

export interface AppletElementContextMenuActionContribution<ActionId extends string = string> {
  id: ActionId;
  label: string;
  icon?: string;
  shortcut?: string;
  detail?: string;
  disabledReason?: string;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  source?: string;
  sourceAppId?: string;
  sourceWindowId?: string;
  targetScope?: string;
  requiredCapabilities?: string[];
  handler: AppletElementContextMenuHandler;
}

export interface AppletElementContextMenuObject {
  id: string;
  kind: string;
  owner: string;
  source: string;
  targetScope: string;
  label: string;
  actionIds?: string[];
  sourceAppId?: string;
  sourceWindowId?: string;
  hostId?: string;
  remotePath?: string;
  requiredCapabilities?: string[];
}

export interface AppletElementContextMenuRequest<ActionId extends string = string> {
  x: number;
  y: number;
  target: string;
  label: string;
  object: AppletElementContextMenuObject;
  actions: AppletElementContextMenuActionContribution<ActionId>[];
  focusReturnElement?: HTMLElement;
}

export type OpenAppletElementContextMenu = <ActionId extends string = string>(
  request: AppletElementContextMenuRequest<ActionId>,
) => void;
