/**
 * SwitchboardOS — Electron Main Process
 *
 * Owns all privileged operations:
 * - Window lifecycle management
 * - IPC broker between renderer and services
 * - Access to OS keychain, filesystem, SSH, SQLite
 * - Audit logging
 *
 * Security posture:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - preload script exposes narrow typed API only
 */

import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, isAbsolute, relative, resolve } from 'path';
import { createHash, randomBytes } from 'crypto';
import { networkInterfaces } from 'os';
import { MvpSqliteStore } from './mvp-sqlite-store';
import type { HostRecord } from '../shared/mvp-models';
import { TerminalSessionManager, type TerminalEventSender } from './terminal-session-manager';
import { generateBootstrapScript, listBootstrapPresets } from './bootstrap-generator';
import { HostedServer, type HostedServerAppInfo } from './hosted-server';
import { HostOperationRunner } from './host-operation-runner';
import { SecretVault, SecretVaultUnavailableError, type SecretMetadata } from './secret-vault';
import { SshService } from './ssh-service';
import { AppCapabilityDeniedError, PolicyService, type PolicyCapability } from './policy-service';
import { AgentOperatorService } from './agent-operator-service';
import {
  getHostRouteContract,
  runHostRouteContract,
} from './route-access-contracts';
import {
  validateAgentEndpointCreateInput,
  validateAgentEndpointIdInput,
  validateAgentEndpointUpdateInput,
  validateAppManifestCreateInput,
  validateAppManifestIdInput,
  validateAppManifestUpdateInput,
  validateAppPermissionCreateInput,
  validateAppPermissionIdInput,
  validateAppPermissionListInput,
  validateAppScopedStorageDeleteInput,
  validateAppScopedStorageGetInput,
  validateAppScopedStorageSetInput,
  validateAuditEventInput,
  validateGeneratedAppHostCapabilitiesInput,
  validateGeneratedAppHostGetInput,
  validateGeneratedAppHostListInput,
  validateGeneratedAppHostStatusInput,
  validateGeneratedAppHostTestConnectionInput,
  validateBootstrapGenerateInput,
  validateBootstrapPresetCreateInput,
  validateBootstrapPresetIdInput,
  validateBootstrapPresetUpdateInput,
  validateBootstrapRunCreateInput,
  validateBootstrapRunIdInput,
  validateBootstrapRunUpdateInput,
  validateCommandHistoryCreateInput,
  validateCommandHistoryEntryIdInput,
  validateCommandHistoryListLimitInput,
  validateCredentialRefCreateInput,
  validateCredentialRefIdInput,
  validateCredentialRefUpdateInput,
  validateHostCreateInput,
  validateHostFavoriteInput,
  validateHostGroupCreateInput,
  validateHostGroupIdInput,
  validateHostGroupNameInput,
  validateHostGroupUpdateInput,
  validateHostIdInput,
  validateHostImportInput,
  validateHostOperationInput,
  validateHostTagCreateInput,
  validateHostTagIdInput,
  validateHostTagUpdateInput,
  validateHostUpdateInput,
  validateNoInput,
  validateOperatorActionExecuteInput,
  validateOperatorProposeInput,
  validateSecretKeyInput,
  validateSecretStoreInput,
  validateSettingsUpdate,
  validateSshExecInput,
  validateSshFileDeleteInput,
  validateSshFileListInput,
  validateSshFileStatInput,
  validateSshFileTransferInput,
  validateTerminalResizeInput,
  validateTerminalStartInput,
  validateTerminalStopInput,
  validateTerminalWriteInput,
  validateWorkspaceFileCopyMoveInput,
  validateWorkspaceFileCreateFileInput,
  validateWorkspaceFileListInput,
  validateWorkspaceFilePathInput,
  validateWorkspaceFileRenameInput,
  validateWorkspaceFileTargetPathInput,
  validateWorkspaceProfileCreateInput,
  validateWorkspaceProfileIdInput,
  validateWorkspaceProfileUpdateInput,
  validateWorkspaceTrashIdInput,
} from './runtime-validation';
import type {
  AgentEndpoint,
  AppManifest,
  AppPermission,
  AppScopedStorageDeleteResult,
  AppScopedStorageGetInput,
  AppScopedStorageGetResult,
  AppScopedStorageRecord,
  AppScopedStorageSetInput,
  BootstrapGenerateInput,
  BootstrapGenerateResult,
  BootstrapPresetRecord,
  BootstrapRun,
  CommandHistoryEntry,
  CreateAgentEndpointInput,
  CreateAppManifestInput,
  CreateAppPermissionInput,
  CreateAuditEventInput,
  CreateBootstrapPresetInput,
  CreateBootstrapRunInput,
  CreateCommandHistoryInput,
  CreateCredentialRefInput,
  CreateHostGroupInput,
  CreateHostInput,
  CreateHostTagInput,
  GeneratedAppHostCapabilitiesResult,
  GeneratedAppHostGetResult,
  GeneratedAppHostListInput,
  GeneratedAppHostListResult,
  GeneratedAppHostSdkResult,
  GeneratedAppHostStatusResult,
  GeneratedAppHostSummary,
  GeneratedAppHostTargetInput,
  GeneratedAppHostTestConnectionResult,
  HostOperationInput,
  CreateWorkspaceProfileInput,
  MvpSettingsUpdate,
  OperatorActionExecuteInput,
  OperatorActionExecuteResult,
  OperatorProposeInput,
  OperatorProposeResult,
  SshExecInput,
  SshExecResult,
  SshFileDeleteInput,
  SshFileDeleteResult,
  SshFileListInput,
  SshFileListResult,
  SshFileStatInput,
  SshFileStatResult,
  SshFileTransferInput,
  SshFileTransferResult,
  TerminalResizeResult,
  TerminalStartResult,
  TerminalStopResult,
  TerminalWriteResult,
  UpdateAgentEndpointInput,
  UpdateAppManifestInput,
  UpdateBootstrapPresetInput,
  UpdateBootstrapRunInput,
  UpdateCredentialRefInput,
  UpdateHostGroupInput,
  UpdateHostInput,
  UpdateHostTagInput,
  UpdateWorkspaceProfileInput,
} from '../shared/mvp-models';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

// Track window state for multi-window support
let mainWindow: BrowserWindow | null = null;
let hostedServer: HostedServer | null = null;
let keepAliveForHostedServer = false;
const mvpStore = new MvpSqliteStore(() => app.getPath('userData'));
const policyService = new PolicyService(
  () => mvpStore.getSettings(),
  (event) => mvpStore.logAuditEvent(event),
);
const sshService = new SshService(
  (hostId) => mvpStore.getHost(hostId),
  (event) => mvpStore.logAuditEvent(event),
  (input) => mvpStore.createCommandHistoryEntry(input),
);
const sendTerminalEvent: TerminalEventSender = (event) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(event.channel, event.payload);
  });
  hostedServer?.broadcastTerminalEvent(event);
};
const terminalSessions = new TerminalSessionManager(
  (hostId) => mvpStore.getHost(hostId),
  sendTerminalEvent,
  (event) => mvpStore.logAuditEvent(event),
  (host) => sshService.buildShellCommand(host),
);
const hostOperations = new HostOperationRunner(sshService);
const secretVault = new SecretVault(() => app.getPath('userData'), safeStorage);
const agentOperator = new AgentOperatorService({
  store: mvpStore,
  secretVault,
  audit: (event) => mvpStore.logAuditEvent(event),
});
let hasRunExitCleanup = false;

const DEV_SERVER_URL = process.env.SWITCHBOARDOS_DEV_SERVER_URL;
const SHOULD_OPEN_DEVTOOLS =
  process.env.SWITCHBOARDOS_OPEN_DEVTOOLS === '1' ||
  process.argv.includes('--open-devtools');

const RENDERER_INDEX = join(__dirname, '..', '..', 'renderer', 'index.html');
const RENDERER_ROOT = dirname(RENDERER_INDEX);
const PRELOAD_PATH = join(__dirname, '..', 'preload', 'preload.js');
const RENDERER_LOAD_RETRY_DELAYS_MS = [250, 1000];

interface WorkspaceFileEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  detail: string;
  path: string;
  updatedAt: string;
  size: number;
}

interface WorkspaceTrashEntry {
  id: string;
  name: string;
  kind: 'folder' | 'applet' | 'scriptlet' | 'note';
  originalPath: string;
  trashPath: string;
  deletedAt: string;
  updatedAt: string;
  size: number;
}

const HOSTED_DEFAULT_HOST = '127.0.0.1';
const HOSTED_DEFAULT_PORT = 7878;
const HOSTED_DEFAULT_SESSION_IDLE_MINUTES = 30;
const HOSTED_DISABLED_VALUES = new Set(['0', 'false', 'off', 'no']);
const WORKSPACE_TRASH_DIRECTORY_NAME = '.switchboard-trash';
const HOSTED_ENABLED_VALUES = new Set(['1', 'true', 'on', 'yes']);
const HOSTED_LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

interface HostedConfig {
  enabled: boolean;
  host: string;
  port: number;
  lanEnabled: boolean;
  authRequired: boolean;
  authToken: string | null;
  authTokenGenerated: boolean;
  sessionTtlMs: number;
}

function envEnabled(name: string): boolean {
  return HOSTED_ENABLED_VALUES.has((process.env[name] ?? '').toLowerCase());
}

function isLocalHostedHost(host: string): boolean {
  return HOSTED_LOCAL_HOSTS.has(host);
}

function normalizeHostedHost(value: string | undefined, lanEnabled: boolean): string {
  const host = value?.trim() || HOSTED_DEFAULT_HOST;
  if (isLocalHostedHost(host) || lanEnabled) {
    return host;
  }

  console.warn(
    `SwitchboardOS hosted UI refused non-local bind address "${host}" because SWITCHBOARDOS_HOSTED_LAN=1 is not set; using ${HOSTED_DEFAULT_HOST}.`,
  );
  return HOSTED_DEFAULT_HOST;
}

function getHostedConfig(): HostedConfig {
  const flag = (process.env.SWITCHBOARDOS_HOSTED_ENABLED ?? '').toLowerCase();
  const enabled = !HOSTED_DISABLED_VALUES.has(flag);
  const lanEnabled = envEnabled('SWITCHBOARDOS_HOSTED_LAN')
    || envEnabled('SWITCHBOARDOS_HOSTED_ALLOW_LAN')
    || envEnabled('SWITCHBOARDOS_HOSTED_LAN_ENABLED');
  const host = normalizeHostedHost(
    process.env.SWITCHBOARDOS_HOSTED_HOST || process.env.SWITCHBOARDOS_HOSTED_BIND,
    lanEnabled,
  );
  const portRaw = Number.parseInt(process.env.SWITCHBOARDOS_HOSTED_PORT ?? '', 10);
  const port = Number.isInteger(portRaw) && portRaw >= 0 && portRaw <= 65535
    ? portRaw
    : HOSTED_DEFAULT_PORT;
  const tokenFromEnv = process.env.SWITCHBOARDOS_HOSTED_AUTH_TOKEN?.trim() || null;
  const authFlag = (process.env.SWITCHBOARDOS_HOSTED_AUTH_REQUIRED ?? '').toLowerCase();
  const authRequired = HOSTED_ENABLED_VALUES.has(authFlag);
  const authToken = authRequired
    ? tokenFromEnv ?? randomBytes(24).toString('base64url')
    : null;
  const sessionMinutesRaw = Number(process.env.SWITCHBOARDOS_HOSTED_SESSION_IDLE_MINUTES ?? '');
  const sessionMinutes = Number.isFinite(sessionMinutesRaw) && sessionMinutesRaw > 0
    ? sessionMinutesRaw
    : HOSTED_DEFAULT_SESSION_IDLE_MINUTES;

  return {
    enabled,
    host,
    port,
    lanEnabled,
    authRequired,
    authToken,
    authTokenGenerated: authRequired && !tokenFromEnv,
    sessionTtlMs: Math.round(sessionMinutes * 60 * 1000),
  };
}

function buildHostedAppInfo(config: HostedConfig): HostedServerAppInfo {
  return {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    hosted: true,
    hostedSecurity: {
      authRequired: config.authRequired,
      lanEnabled: config.lanEnabled,
      tlsGuidance: config.authRequired
        ? 'Hosted auth is explicitly enabled; use TLS or a trusted reverse proxy for non-local access.'
        : 'MVP hosted test access uses no access token; bind only on trusted test networks.',
    },
  };
}

async function startHostedServer(config: HostedConfig): Promise<void> {
  if (!config.enabled) {
    keepAliveForHostedServer = false;
    console.log('SwitchboardOS hosted UI: disabled (SWITCHBOARDOS_HOSTED_ENABLED).');
    return;
  }

  // Hosted mode must survive native window loss in service/headless runs.
  // Set this before async listen work so window-all-closed cannot quit during
  // startup.
  keepAliveForHostedServer = true;

  const server = new HostedServer({
    host: config.host,
    port: config.port,
    staticRoot: RENDERER_ROOT,
    store: mvpStore,
    terminalSessions,
    hostOperations,
    sshService,
    agentOperator,
    policyService,
    getAppInfo: () => buildHostedAppInfo(config),
    listWorkspaceFiles,
    createWorkspaceFolder,
    createWorkspaceFile,
    renameWorkspaceFile,
    duplicateWorkspaceFile,
    copyWorkspaceFile,
    moveWorkspaceFile,
    deleteWorkspaceFilePermanent,
    listWorkspaceTrash,
    moveWorkspaceFileToTrash,
    restoreWorkspaceTrashItem,
    deleteWorkspaceTrashItemPermanent,
    emptyWorkspaceTrash,
    auth: {
      required: config.authRequired,
      accessToken: config.authToken,
      sessionTtlMs: config.sessionTtlMs,
      lanEnabled: config.lanEnabled,
    },
  });

  try {
    const { url } = await server.start();
    hostedServer = server;
    const browserUrl = browserHostedUrl(config.host, url);
    console.log(`SwitchboardOS hosted UI: ${browserUrl}`);
    if (browserUrl !== url) {
      console.log(`SwitchboardOS hosted bind: ${url}`);
    }
    if (config.authRequired) {
      console.log(`SwitchboardOS hosted auth: login required; idle timeout ${Math.round(config.sessionTtlMs / 60000)} minute(s).`);
      if (config.authTokenGenerated && config.authToken) {
        console.log(`SwitchboardOS hosted login token: ${config.authToken}`);
      }
    } else {
      console.log('SwitchboardOS hosted auth: disabled for MVP testing; no access token required.');
    }
    if (!isLocalHostedHost(config.host)) {
      console.warn('SwitchboardOS hosted LAN mode is enabled. Keep this on a trusted network and prefer TLS or a reverse proxy for non-local access.');
    }
  } catch (err) {
    keepAliveForHostedServer = false;
    console.error('SwitchboardOS hosted UI failed to start:', err);
    // If the window already closed while we were starting, quit so we don't
    // leave a headless process with no server and no UI.
    if (BrowserWindow.getAllWindows().length === 0 && process.platform !== 'darwin') {
      app.quit();
    }
  }
}

function browserHostedUrl(bindHost: string, bindUrl: string): string {
  if (bindHost !== '0.0.0.0' && bindHost !== '::') {
    return bindUrl;
  }

  const url = new URL(bindUrl);
  const lanAddress = firstLanAddress();
  if (lanAddress) {
    url.hostname = lanAddress;
  } else {
    url.hostname = HOSTED_DEFAULT_HOST;
  }
  return url.toString();
}

function firstLanAddress(): string | null {
  const interfaces = networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return null;
}

function loadRenderer(window: BrowserWindow, attempt = 0): void {
  const loadPromise = DEV_SERVER_URL
    ? window.loadURL(DEV_SERVER_URL)
    : window.loadFile(RENDERER_INDEX);

  loadPromise.catch((err) => {
    const retryDelay = RENDERER_LOAD_RETRY_DELAYS_MS[attempt];
    if (retryDelay !== undefined && !window.isDestroyed()) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          loadRenderer(window, attempt + 1);
        }
      }, retryDelay);
      return;
    }

    console.error('Failed to load renderer:', err);
  });
}

function workspaceRoot(): string {
  const root = join(app.getPath('userData'), 'workspace');
  mkdirSync(root, { recursive: true });
  return root;
}

function workspacePath(relativePath = ''): string {
  const root = workspaceRoot();
  const target = resolve(root, relativePath || '.');
  const relativeToRoot = relative(root, target);
  if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
    throw new Error('Workspace path escapes the SwitchboardOS workspace root.');
  }
  return target;
}

function workspaceUserPath(relativePath = ''): string {
  const target = workspacePath(relativePath);
  const root = workspaceRoot();
  const rel = relative(root, target);
  if (rel !== '' && rel !== '.') {
    const firstSegment = rel.split(/[/\\]/)[0];
    if (firstSegment === WORKSPACE_TRASH_DIRECTORY_NAME) {
      throw new Error('Cannot access internal SwitchboardOS workspace storage.');
    }
  }
  return target;
}

function artifactKindForName(name: string, isDirectory: boolean): WorkspaceFileEntry['kind'] {
  if (isDirectory) {
    return 'folder';
  }
  if (name.endsWith('.sbapplet.json')) {
    return 'applet';
  }
  if (name.endsWith('.sbscriptlet.json')) {
    return 'scriptlet';
  }
  return 'note';
}

function workspaceEntryForPath(root: string, absolutePath: string): WorkspaceFileEntry {
  const stats = statSync(absolutePath);
  const name = absolutePath.split(/[\\/]/).pop() || 'Untitled';
  const path = relative(root, absolutePath);
  const kind = artifactKindForName(name, stats.isDirectory());
  return {
    id: path || name,
    name,
    kind,
    detail: stats.isDirectory()
      ? 'Workspace folder'
      : kind === 'applet'
        ? 'SwitchboardOS applet manifest'
        : kind === 'scriptlet'
          ? 'SSH-backed scriptlet manifest'
          : 'Workspace file',
    path,
    updatedAt: stats.mtime.toISOString(),
    size: stats.size,
  };
}

function listWorkspaceFiles(relativePath = ''): WorkspaceFileEntry[] {
  const root = workspaceRoot();
  const directory = workspaceUserPath(relativePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  return readdirSync(directory)
    .filter((name) => name !== WORKSPACE_TRASH_DIRECTORY_NAME)
    .map((name) => workspaceEntryForPath(root, join(directory, name)))
    .sort((a, b) => {
      if (a.kind === 'folder' && b.kind !== 'folder') {
        return -1;
      }
      if (a.kind !== 'folder' && b.kind === 'folder') {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
}

function nextWorkspaceName(baseName: string, extension = '', directory = workspaceRoot()): string {
  let name = `${baseName}${extension}`;
  let counter = 2;
  while (existsSync(join(directory, name))) {
    name = `${baseName} ${counter}${extension}`;
    counter += 1;
  }
  return name;
}

function workspaceFileExtensionForName(name: string): string {
  if (name.endsWith('.sbapplet.json')) {
    return '.sbapplet.json';
  }
  if (name.endsWith('.sbscriptlet.json')) {
    return '.sbscriptlet.json';
  }
  return extname(name);
}

function resolveWorkspaceDirectory(relativePath = ''): string {
  const directory = workspaceUserPath(relativePath);
  if (!existsSync(directory)) {
    throw new Error(`Workspace target directory does not exist: "${relativePath || '/'}".`);
  }
  if (!statSync(directory).isDirectory()) {
    throw new Error(`Workspace target "${relativePath || '/'}" is not a directory.`);
  }
  return directory;
}

function isPathWithinOrEqual(parentPath: string, descendantPath: string): boolean {
  const relativePath = relative(parentPath, descendantPath);
  return relativePath === '' || relativePath === '.' || !/^(\.\.)([\\/]|$)/.test(relativePath);
}

function nextWorkspaceCopyNameForTarget(
  sourcePath: string,
  sourceName: string,
  sourceDirectory: string,
  targetDirectory: string,
): string {
  if (sourceDirectory !== targetDirectory && !existsSync(join(targetDirectory, sourceName))) {
    return sourceName;
  }

  const sourceStats = statSync(sourcePath);
  const targetFileExists = (candidate: string): boolean => existsSync(join(targetDirectory, candidate));
  if (sourceStats.isDirectory()) {
    let copyName = `${sourceName} copy`;
    let counter = 2;
    while (targetFileExists(copyName)) {
      copyName = `${sourceName} copy ${counter}`;
      counter += 1;
    }
    return copyName;
  }

  const extension = workspaceFileExtensionForName(sourceName);
  const base = extension ? sourceName.slice(0, -extension.length) : sourceName;
  let copyName = `${base} copy${extension}`;
  let counter = 2;
  while (targetFileExists(copyName)) {
    copyName = `${base} copy ${counter}${extension}`;
    counter += 1;
  }
  return copyName;
}

function createWorkspaceFolder(targetRelativePath = ''): WorkspaceFileEntry {
  const root = workspaceRoot();
  const directory = resolveWorkspaceDirectory(targetRelativePath);
  const name = nextWorkspaceName('New Folder', '', directory);
  const absolutePath = join(directory, name);
  mkdirSync(absolutePath, { recursive: false });
  return workspaceEntryForPath(root, absolutePath);
}

function createWorkspaceFile(kind: WorkspaceFileEntry['kind'], targetRelativePath = ''): WorkspaceFileEntry {
  const root = workspaceRoot();
  const directory = resolveWorkspaceDirectory(targetRelativePath);
  const extension = kind === 'applet'
    ? '.sbapplet.json'
    : kind === 'scriptlet'
      ? '.sbscriptlet.json'
      : '.txt';
  const baseName = kind === 'applet'
    ? 'New Applet'
    : kind === 'scriptlet'
      ? 'New Scriptlet'
      : 'New Note';
  const name = nextWorkspaceName(baseName, extension, directory);
  const absolutePath = join(directory, name);
  const payload = kind === 'note'
    ? ''
    : JSON.stringify({
      schemaVersion: 1,
      kind,
      name: baseName,
      capabilities: [],
      createdAt: new Date().toISOString(),
    }, null, 2);
  writeFileSync(absolutePath, payload, { flag: 'wx' });
  return workspaceEntryForPath(root, absolutePath);
}

function duplicateWorkspaceFile(relativePath: string): WorkspaceFileEntry {
  const root = workspaceRoot();
  const sourceAbsolutePath = workspaceUserPath(relativePath);
  if (sourceAbsolutePath === root) {
    throw new Error('Cannot duplicate the workspace root directory.');
  }
  const sourceStats = statSync(sourceAbsolutePath);
  const sourceName = basename(sourceAbsolutePath);
  const sourceDirectory = dirname(sourceAbsolutePath);
  const duplicateName = nextWorkspaceCopyNameForTarget(sourceAbsolutePath, sourceName, sourceDirectory, sourceDirectory);
  const targetAbsolutePath = join(dirname(sourceAbsolutePath), duplicateName);
  cpSync(sourceAbsolutePath, targetAbsolutePath, {
    recursive: sourceStats.isDirectory(),
    force: false,
    errorOnExist: true,
  });
  return workspaceEntryForPath(root, targetAbsolutePath);
}

function copyWorkspaceFile(relativePath: string, targetRelativePath = ''): WorkspaceFileEntry {
  const root = workspaceRoot();
  const sourceAbsolutePath = workspaceUserPath(relativePath);
  if (sourceAbsolutePath === root) {
    throw new Error('Cannot copy the workspace root directory.');
  }
  const sourceStats = statSync(sourceAbsolutePath);
  const sourceName = basename(sourceAbsolutePath);
  const sourceDirectory = dirname(sourceAbsolutePath);
  const targetDirectory = resolveWorkspaceDirectory(targetRelativePath);

  if (sourceStats.isDirectory() && isPathWithinOrEqual(sourceAbsolutePath, targetDirectory)) {
    throw new Error('Cannot copy a folder into itself or one of its descendants.');
  }

  const targetName = nextWorkspaceCopyNameForTarget(sourceAbsolutePath, sourceName, sourceDirectory, targetDirectory);
  const targetAbsolutePath = join(targetDirectory, targetName);
  cpSync(sourceAbsolutePath, targetAbsolutePath, {
    recursive: sourceStats.isDirectory(),
    force: false,
    errorOnExist: true,
  });
  return workspaceEntryForPath(root, targetAbsolutePath);
}

function moveWorkspaceFile(relativePath: string, targetRelativePath = ''): WorkspaceFileEntry {
  const root = workspaceRoot();
  const sourceAbsolutePath = workspaceUserPath(relativePath);
  if (sourceAbsolutePath === root) {
    throw new Error('Cannot move the workspace root directory.');
  }

  const sourceStats = statSync(sourceAbsolutePath);
  const sourceName = basename(sourceAbsolutePath);
  const sourceDirectory = dirname(sourceAbsolutePath);
  const targetDirectory = resolveWorkspaceDirectory(targetRelativePath);

  if (sourceStats.isDirectory() && isPathWithinOrEqual(sourceAbsolutePath, targetDirectory)) {
    throw new Error('Cannot move a folder into itself or one of its descendants.');
  }

  let targetAbsolutePath = join(targetDirectory, sourceName);
  if (targetAbsolutePath !== sourceAbsolutePath && existsSync(targetAbsolutePath)) {
    targetAbsolutePath = join(targetDirectory, nextWorkspaceCopyNameForTarget(sourceAbsolutePath, sourceName, sourceDirectory, targetDirectory));
  }

  if (targetAbsolutePath !== sourceAbsolutePath) {
    renameSync(sourceAbsolutePath, targetAbsolutePath);
  }

  return workspaceEntryForPath(root, targetAbsolutePath);
}

function sanitizeWorkspaceFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Workspace file name cannot be empty.');
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Workspace file name cannot include path separators.');
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new Error('Workspace file name cannot be "." or "..".');
  }
  return trimmed;
}

function renameWorkspaceFile(relativePath: string, newName: string): WorkspaceFileEntry {
  const safeNewName = sanitizeWorkspaceFileName(newName);
  const root = workspaceRoot();
  const currentAbsolutePath = workspaceUserPath(relativePath);
  if (currentAbsolutePath === root) {
    throw new Error('Cannot rename the workspace root directory.');
  }
  const currentRelativePath = relative(root, currentAbsolutePath);
  const currentDirRelative = dirname(currentRelativePath);
  const targetRelativePath = currentDirRelative === '.'
    ? safeNewName
    : join(currentDirRelative, safeNewName);
  const targetAbsolutePath = workspaceUserPath(targetRelativePath);
  if (targetAbsolutePath === root) {
    throw new Error('Invalid workspace rename target.');
  }
  if (existsSync(targetAbsolutePath)) {
    throw new Error(`A workspace item already exists at "${targetRelativePath}".`);
  }
  renameSync(currentAbsolutePath, targetAbsolutePath);
  return workspaceEntryForPath(root, targetAbsolutePath);
}

function deleteWorkspaceFilePermanent(relativePath: string): boolean {
  const root = workspaceRoot();
  const absolutePath = workspaceUserPath(relativePath);
  if (absolutePath === root) {
    throw new Error('Cannot delete the workspace root directory.');
  }
  if (!existsSync(absolutePath)) {
    return false;
  }
  rmSync(absolutePath, { recursive: true, force: true });
  return true;
}

function trashRoot(): string {
  return join(workspaceRoot(), WORKSPACE_TRASH_DIRECTORY_NAME);
}

function trashFilesRoot(): string {
  return join(trashRoot(), 'files');
}

function trashEntryDir(id: string): string {
  return join(trashFilesRoot(), validateTrashId(id));
}

function trashContentPath(entry: WorkspaceTrashEntry): string {
  return join(trashEntryDir(entry.id), sanitizeWorkspaceFileName(entry.name));
}

function trashManifestPath(): string {
  return join(trashRoot(), 'manifest.json');
}

function readTrashManifest(): WorkspaceTrashEntry[] {
  const path = trashManifestPath();
  if (!existsSync(path)) {
    return [];
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    if (Array.isArray(data)) {
      return data as WorkspaceTrashEntry[];
    }
  } catch { /* ignore */ }
  return [];
}

function writeTrashManifest(entries: WorkspaceTrashEntry[]): void {
  mkdirSync(trashRoot(), { recursive: true });
  writeFileSync(trashManifestPath(), JSON.stringify(entries, null, 2), { flag: 'w' });
}

function generateTrashId(): string {
  return randomBytes(12).toString('hex');
}

function validateTrashId(id: string): string {
  if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) {
    throw new Error(`Invalid trash id: "${id}".`);
  }
  return id;
}

function listWorkspaceTrash(): WorkspaceTrashEntry[] {
  const entries = readTrashManifest();
  return entries.filter((entry) => {
    try {
      return existsSync(trashContentPath(entry));
    } catch {
      return false;
    }
  });
}

function moveWorkspaceFileToTrash(relativePath: string): WorkspaceTrashEntry {
  const absolutePath = workspaceUserPath(relativePath);
  if (absolutePath === workspaceRoot()) {
    throw new Error('Cannot move the workspace root to trash.');
  }
  if (!existsSync(absolutePath)) {
    throw new Error(`Workspace file does not exist: "${relativePath}".`);
  }

  const id = generateTrashId();
  const stats = statSync(absolutePath);
  const name = basename(absolutePath);
  const kind = artifactKindForName(name, stats.isDirectory());
  const now = new Date().toISOString();

  const entryDir = trashEntryDir(id);
  mkdirSync(entryDir, { recursive: true });
  const contentTarget = join(entryDir, name);
  renameSync(absolutePath, contentTarget);

  const entry: WorkspaceTrashEntry = {
    id,
    name,
    kind,
    originalPath: relativePath,
    trashPath: join('.switchboard-trash', 'files', id, name),
    deletedAt: now,
    updatedAt: now,
    size: stats.size,
  };

  const manifest = readTrashManifest();
  manifest.push(entry);
  writeTrashManifest(manifest);
  return entry;
}

function restoreWorkspaceTrashItem(id: string): WorkspaceFileEntry {
  const root = workspaceRoot();
  const validatedId = validateTrashId(id);
  const manifest = readTrashManifest();
  const entryIndex = manifest.findIndex((e) => e.id === validatedId);
  if (entryIndex === -1) {
    throw new Error(`Trashed item not found: "${id}".`);
  }

  const entry = manifest[entryIndex];
  const sourcePath = trashContentPath(entry);
  if (!existsSync(sourcePath)) {
    manifest.splice(entryIndex, 1);
    writeTrashManifest(manifest);
    throw new Error(`Trashed content missing on disk: "${id}".`);
  }

  const targetPath = workspaceUserPath(entry.originalPath);
  const targetPathDir = dirname(targetPath);
  mkdirSync(targetPathDir, { recursive: true });

  let finalTarget = targetPath;
  if (existsSync(targetPath)) {
    const conflictName = nextWorkspaceCopyNameForTarget(
      sourcePath,
      entry.name,
      dirname(sourcePath),
      targetPathDir,
    );
    finalTarget = join(targetPathDir, conflictName);
  }

  renameSync(sourcePath, finalTarget);

  manifest.splice(entryIndex, 1);
  writeTrashManifest(manifest);

  const entryDirPath = trashEntryDir(entry.id);
  if (existsSync(entryDirPath)) {
    rmSync(entryDirPath, { recursive: true, force: true });
  }

  return workspaceEntryForPath(root, finalTarget);
}

function deleteWorkspaceTrashItemPermanent(id: string): boolean {
  const validatedId = validateTrashId(id);
  const manifest = readTrashManifest();
  const entryIndex = manifest.findIndex((e) => e.id === validatedId);
  if (entryIndex === -1) {
    return false;
  }

  const entryDirPath = trashEntryDir(validatedId);
  if (existsSync(entryDirPath)) {
    rmSync(entryDirPath, { recursive: true, force: true });
  }

  manifest.splice(entryIndex, 1);
  writeTrashManifest(manifest);
  return true;
}

function emptyWorkspaceTrash(): boolean {
  const filesDir = trashFilesRoot();
  if (existsSync(filesDir)) {
    rmSync(filesDir, { recursive: true, force: true });
  }
  writeTrashManifest([]);
  return true;
}

function requireRouteAccessContract(contractId: string): NonNullable<ReturnType<typeof getHostRouteContract>> {
  const contract = getHostRouteContract(contractId);
  if (!contract) {
    throw new Error(`Missing route access contract: ${contractId}`);
  }
  return contract;
}

function runWorkspaceFileIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
  });
}

function runWorkspaceProfileIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
  });
}

function runCredentialRefIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
  });
}

function runSecretIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
  shouldAuditSuccess?: (result: TResult) => boolean,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    shouldAuditSuccess,
    successAuditMetadata,
  });
}

function runAuditIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
  });
}

function runSshIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    hostId?: string | null;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => Promise<TResult> | TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function sshExecRouteSuccessMetadata(result: SshExecResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    commandTextLogged: false,
    commandOutputLogged: false,
    secretsLogged: false,
  };
}

function sshFileListRouteSuccessMetadata(result: SshFileListResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    entryCount: result.entries.length,
    path: result.path,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function sshFileStatRouteSuccessMetadata(result: SshFileStatResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    entryFound: Boolean(result.entry),
    path: result.path,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function sshFileTransferRouteSuccessMetadata(result: SshFileTransferResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    direction: result.direction,
    localPathLogged: false,
    remotePathLogged: false,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function sshFileDeleteRouteSuccessMetadata(result: SshFileDeleteResult): Record<string, unknown> {
  return {
    resultStatus: result.status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    operation: 'delete',
    recursive: result.recursive,
    deleted: result.deleted,
    pathHash: hashAuditPath(result.path),
    pathLength: result.path.length,
    remotePathLogged: false,
    commandTextLogged: false,
    commandOutputLogged: false,
    fileContentsLogged: false,
    secretsLogged: false,
  };
}

function hashAuditPath(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}

function runTerminalIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    hostId?: string | null;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => Promise<TResult> | TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function terminalRouteSuccessMetadata(
  result: TerminalStartResult | TerminalWriteResult | TerminalResizeResult | TerminalStopResult,
): Record<string, unknown> {
  return {
    resultStatus: 'status' in result ? result.status : null,
    success: 'success' in result ? result.success : null,
    sessionId: result.sessionId,
    cols: 'cols' in result ? result.cols : null,
    rows: 'rows' in result ? result.rows : null,
    terminalInputLogged: false,
    terminalOutputLogged: false,
  };
}

function runAgentEndpointIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function runAppRouteIpc<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityId?: string | null;
    entityType: string;
    appId?: string | null;
    hostId?: string | null;
  },
  input: unknown,
  execute: () => Promise<TResult> | TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function runBootstrapRouteIpc<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    hostId?: string | null;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function runCommandHistoryIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    hostId?: string | null;
    entityId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function commandHistoryRouteSuccessMetadata(result: CommandHistoryEntry | boolean): Record<string, unknown> {
  if (typeof result === 'boolean') {
    return {
      deleted: result,
      commandLogged: false,
      commandOutputLogged: false,
    };
  }

  return {
    hasHostId: Boolean(result.hostId),
    hasSessionId: Boolean(result.sessionId),
    hasExitCode: result.exitCode !== null,
    hasDurationMs: result.durationMs !== null,
    commandLogged: false,
    commandOutputLogged: false,
  };
}

function runSettingsIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    entityType: string;
  },
  input: unknown,
  execute: () => TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function settingsRouteSuccessMetadata(update: MvpSettingsUpdate): Record<string, unknown> {
  return {
    themeUpdated: update.theme !== undefined,
    windowBehaviorUpdated: update.defaultWindowBehavior !== undefined,
    wallpaperUpdated: update.desktopWallpaper !== undefined || update.desktopWallpaperLayout !== undefined,
    sshDefaultsUpdated: update.sshDefaults !== undefined,
    operatorUpdated: update.operator !== undefined,
    settingsValuesLogged: false,
    secretsLogged: false,
  };
}

function runAgentOperatorIpcRoute<TResult>(
  contractId: string,
  context: {
    route: string;
    action: string;
    hostId?: string | null;
    entityType: string;
  },
  input: unknown,
  execute: () => Promise<TResult> | TResult,
  successAuditMetadata?: (result: TResult) => Record<string, unknown>,
): Promise<TResult> {
  return runHostRouteContract({
    contract: requireRouteAccessContract(contractId),
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      ...context,
    },
    input,
    execute,
    successAuditMetadata,
  });
}

function agentEndpointRouteSuccessMetadata(result: AgentEndpoint | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      endpointFound: Boolean(result),
      storesSecretMaterial: false,
      apiKeyLogged: false,
    };
  }

  return {
    endpointId: result.id,
    endpointProvider: result.provider,
    endpointModel: result.model,
    endpointPolicy: result.policy,
    endpointEnabled: result.enabled,
    credentialRefIdLogged: false,
    storesSecretMaterial: false,
    apiKeyLogged: false,
  };
}

function appManifestRouteSuccessMetadata(result: AppManifest | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      manifestFound: Boolean(result),
      sourceCodeLogged: false,
      packageMetadataLogged: false,
    };
  }

  return {
    manifestId: result.id,
    appId: result.appId,
    appVersion: result.version,
    appCategory: result.category,
    appEnabled: result.enabled,
    requestedCapabilityCount: result.capabilities.length,
    sourceCodeLogged: false,
    packageMetadataLogged: false,
  };
}

function appPermissionRouteSuccessMetadata(result: AppPermission | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      permissionFound: Boolean(result),
    };
  }

  return {
    permissionId: result.id,
    appId: result.appId,
    capability: result.capability,
    granted: result.granted,
  };
}

type AppScopedStorageResult = AppScopedStorageGetResult | AppScopedStorageRecord | AppScopedStorageDeleteResult;

function appScopedStorageEntityId(appId: string, key: string): string {
  return `${appId}:${appScopedStorageKeyHash(key)}`;
}

function appScopedStorageKeyHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function appScopedStorageRouteSuccessMetadata(result: AppScopedStorageResult): Record<string, unknown> {
  const value = 'value' in result ? result.value : null;
  return {
    appId: result.appId,
    keyHash: appScopedStorageKeyHash(result.key),
    keyLength: result.key.length,
    valuePresent: value !== null,
    valueLength: typeof value === 'string' ? value.length : 0,
    deleted: 'deleted' in result ? result.deleted : false,
    found: 'found' in result ? result.found : true,
    storageValueLogged: false,
    sourceCodeLogged: false,
    packageMetadataLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

function assertAppScopedStorageGranted(input: AppScopedStorageGetInput, action: string): void {
  if (mvpStore.hasGrantedAppPermission(input.appId, 'storage:scoped')) {
    return;
  }

  mvpStore.logAuditEvent({
    type: 'app_storage.denied',
    entityType: 'app',
    entityId: input.appId,
    message: 'Generated app scoped storage request denied.',
    metadata: {
      actionClass: 'app-storage-route',
      action,
      appId: input.appId,
      capability: 'storage:scoped',
      granted: false,
      keyHash: appScopedStorageKeyHash(input.key),
      keyLength: input.key.length,
      storageValueLogged: false,
      sourceCodeLogged: false,
      packageMetadataLogged: false,
      providerPayloadLogged: false,
      secretsLogged: false,
    },
  });
  throw new AppCapabilityDeniedError(input.appId, 'storage:scoped', action);
}

function generatedAppHostCapabilityForMethod(input: GeneratedAppHostListInput | GeneratedAppHostTargetInput): PolicyCapability {
  return input.method === 'host:testConnection' ? 'host:actions' : 'host:read';
}

function generatedAppHostSummary(host: HostRecord): GeneratedAppHostSummary {
  return {
    id: host.id,
    name: host.name,
    address: host.address || host.hostname,
    port: host.port,
    lastConnectionStatus: host.lastConnectionStatus,
    lastCheckedAt: host.lastCheckedAt,
    osHint: host.osHint,
    bootstrapStatus: host.bootstrapStatus,
    capabilities: [...host.capabilities],
    tags: [...host.tags],
  };
}

function generatedAppHostStatus(host: HostRecord): GeneratedAppHostStatusResult['status'] {
  return {
    id: host.id,
    lastConnectionStatus: host.lastConnectionStatus,
    lastCheckedAt: host.lastCheckedAt,
    bootstrapStatus: host.bootstrapStatus,
    osHint: host.osHint,
  };
}

function generatedAppHostListResult(input: GeneratedAppHostListInput): GeneratedAppHostListResult {
  const hosts = mvpStore.listHosts().map(generatedAppHostSummary);
  return {
    ...input,
    hosts,
    hostCount: hosts.length,
  };
}

function generatedAppHostGetResult(input: Extract<GeneratedAppHostTargetInput, { method: 'host:get' }>): GeneratedAppHostGetResult {
  const host = mvpStore.getHost(input.hostId);
  return {
    ...input,
    host: host ? generatedAppHostSummary(host) : null,
    found: Boolean(host),
  };
}

function generatedAppHostStatusResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:getStatus' }>,
): GeneratedAppHostStatusResult {
  const host = mvpStore.getHost(input.hostId);
  return {
    ...input,
    status: host ? generatedAppHostStatus(host) : null,
    found: Boolean(host),
  };
}

function generatedAppHostCapabilitiesResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:getCapabilities' }>,
): GeneratedAppHostCapabilitiesResult {
  const host = mvpStore.getHost(input.hostId);
  return {
    ...input,
    capabilities: host ? [...host.capabilities] : [],
    found: Boolean(host),
  };
}

async function generatedAppHostTestConnectionResult(
  input: Extract<GeneratedAppHostTargetInput, { method: 'host:testConnection' }>,
): Promise<GeneratedAppHostTestConnectionResult> {
  const result = await mvpStore.testConnection(input.hostId);
  return {
    ...input,
    status: result.status,
    success: result.success,
    message: result.message,
    checkedAt: result.checkedAt,
    latencyMs: result.latencyMs,
    protocolDetected: result.protocolDetected,
    errorCode: result.errorCode,
  };
}

function generatedAppHostRouteSuccessMetadata(result: GeneratedAppHostSdkResult): Record<string, unknown> {
  const found = 'found' in result ? result.found : true;
  return {
    appId: result.appId,
    windowId: result.windowId,
    method: result.method,
    hostId: 'hostId' in result ? result.hostId : null,
    hostCount: 'hostCount' in result ? result.hostCount : null,
    found,
    success: 'success' in result ? result.success : null,
    status: 'status' in result && typeof result.status === 'string' ? result.status : null,
    capability: generatedAppHostCapabilityForMethod(result),
    hostCredentialsLogged: false,
    hostNotesLogged: false,
    sourceCodeLogged: false,
    packageMetadataLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

function assertGeneratedAppHostCapabilityGranted(
  input: GeneratedAppHostListInput | GeneratedAppHostTargetInput,
  action: string,
): void {
  const capability = generatedAppHostCapabilityForMethod(input);
  if (mvpStore.hasGrantedAppPermission(input.appId, capability)) {
    return;
  }

  mvpStore.logAuditEvent({
    type: 'app_host_sdk.denied',
    entityType: 'app',
    entityId: input.appId,
    message: 'Generated app host SDK request denied.',
    metadata: {
      actionClass: 'app-host-sdk-route',
      action,
      appId: input.appId,
      windowId: input.windowId,
      method: input.method,
      hostId: 'hostId' in input ? input.hostId : null,
      capability,
      granted: false,
      hostCredentialsLogged: false,
      hostNotesLogged: false,
      sourceCodeLogged: false,
      packageMetadataLogged: false,
      providerPayloadLogged: false,
      secretsLogged: false,
    },
  });
  throw new AppCapabilityDeniedError(input.appId, capability, action);
}

function bootstrapPresetRouteSuccessMetadata(result: BootstrapPresetRecord | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      presetFound: Boolean(result),
      scriptTemplateLogged: false,
    };
  }

  return {
    bootstrapPresetId: result.id,
    presetId: result.presetId,
    presetEnabled: result.enabled,
    variableCount: result.variables.length,
    scriptTemplateLogged: false,
  };
}

function bootstrapRunRouteSuccessMetadata(result: BootstrapRun | boolean | null): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {
      runFound: Boolean(result),
      scriptOutputLogged: false,
    };
  }

  return {
    runId: result.id,
    presetId: result.presetId,
    hostId: result.hostId,
    status: result.status,
    scriptOutputLogged: false,
  };
}

function bootstrapGenerateRouteSuccessMetadata(
  result: BootstrapGenerateResult,
  input: BootstrapGenerateInput,
): Record<string, unknown> {
  return {
    presetId: result.preset.id,
    hostId: result.hostId,
    installPackages: input.options?.installPackages ?? true,
    includeDockerCheck: input.options?.includeDockerCheck ?? false,
    generatedScriptLogged: false,
    generatedScriptLength: result.script.length,
    generatedScriptLineCount: result.script.split(/\r?\n/).length,
    executesRemotely: false,
  };
}

function operatorProposeRouteSuccessMetadata(result: OperatorProposeResult): Record<string, unknown> {
  return {
    mode: result.mode,
    endpointId: result.endpointId,
    proposalCount: result.proposals.length,
    warningCount: result.warnings.length,
    proposalOnly: true,
    structuredActionExecution: false,
    operatorRequestLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

function operatorActionRouteSuccessMetadata(result: OperatorActionExecuteResult): Record<string, unknown> {
  return {
    proposalId: result.proposalId,
    proposalSource: result.proposalSource,
    proposalRisk: result.proposalRisk,
    actionKind: result.actionKind,
    executionStatus: result.status,
    terminalSessionId: result.terminalSessionId,
    terminalStartStatus: result.terminalStartStatus,
    terminalWriteAccepted: result.terminalWriteAccepted,
    requiresApproval: result.requiresApproval,
    approved: result.approved,
    proposalOnly: false,
    structuredActionExecution: true,
    operatorRequestLogged: false,
    requestLogged: false,
    proposedCommandsLogged: false,
    commandLogged: false,
    terminalInputLogged: false,
    commandOutputLogged: false,
    providerPayloadLogged: false,
    secretsLogged: false,
  };
}

/**
 * Create the main application window.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:switchboardos',
    },
  });

  loadRenderer(mainWindow);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Keep default startup headless-safe; open DevTools only when explicitly requested.
  if (!app.isPackaged && SHOULD_OPEN_DEVTOOLS) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function logSecretAuditEvent(type: string, key: string, message: string, metadata: Record<string, unknown> = {}): void {
  try {
    mvpStore.logAuditEvent({
      type,
      entityType: 'secret',
      entityId: key,
      message,
      metadata: {
        secretId: key,
        ...metadata,
      },
    });
  } catch (err) {
    console.error('Failed to write secret audit event:', err);
  }
}

function errorMetadata(err: unknown): Record<string, unknown> {
  return {
    errorName: err instanceof Error ? err.name : 'Error',
    errorMessage: err instanceof Error ? err.message : 'Unknown secret storage error',
  };
}

function upsertSecretCredentialRef(secret: SecretMetadata): string | null {
  try {
    const refs = mvpStore.listCredentialRefs();
    const existing = refs.find(
      (ref) => ref.type === 'keychain_ref' && ref.referenceValue === secret.key,
    );
    const metadata = {
      ...(existing?.metadata ?? {}),
      secretId: secret.key,
      secretStorage: 'safeStorage',
      secretBackend: secret.backend,
      storesSecretMaterial: false,
      updatedAt: secret.updatedAt,
    };

    if (existing) {
      const updated = mvpStore.updateCredentialRef(existing.id, {
        name: existing.name || `Secret reference: ${secret.key}`,
        type: 'keychain_ref',
        referenceValue: secret.key,
        metadata,
      });
      return updated?.id ?? existing.id;
    }

    return mvpStore.createCredentialRef({
      name: `Secret reference: ${secret.key}`,
      type: 'keychain_ref',
      referenceValue: secret.key,
      metadata,
    }).id;
  } catch (err) {
    logSecretAuditEvent(
      'secret.credential_ref_failed',
      secret.key,
      'Failed to update credential reference metadata for stored secret.',
      errorMetadata(err),
    );
    return null;
  }
}

function deleteSecretCredentialRefs(secretKey: string): string[] {
  const deletedRefIds: string[] = [];
  try {
    for (const ref of mvpStore.listCredentialRefs()) {
      if (ref.type === 'keychain_ref' && ref.referenceValue === secretKey) {
        if (mvpStore.deleteCredentialRef(ref.id)) {
          deletedRefIds.push(ref.id);
        }
      }
    }
  } catch (err) {
    logSecretAuditEvent(
      'secret.credential_ref_failed',
      secretKey,
      'Failed to delete credential reference metadata for removed secret.',
      errorMetadata(err),
    );
  }
  return deletedRefIds;
}

// ============================================================
// IPC Handlers — Main↔Renderer Communication
// ============================================================

/**
 * App-level queries from renderer.
 */
ipcMain.handle('app:get-info', (): Record<string, unknown> => {
  return {
    isPackaged: app.isPackaged,
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
  };
});

/**
 * Window management from renderer.
 */
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:restore-bounds', (_event, bounds: Electron.Rectangle) => {
  mainWindow?.setBounds(bounds);
});

ipcMain.handle('window:get-bounds', () => {
  return mainWindow?.getBounds() ?? null;
});

/**
 * File dialog from renderer.
 */
ipcMain.handle(
  'dialog:open-file',
  async (_event, options?: Electron.OpenDialogOptions) => {
    const props = options?.properties || [];
    const dialogOptions: Record<string, unknown> = {
      properties: ['openFile', ...(props as unknown as string[])],
      title: options?.title,
      defaultPath: options?.defaultPath,
      buttonLabel: options?.buttonLabel,
      filters: options?.filters,
      securityScopedBookmarks: options?.securityScopedBookmarks,
      message: options?.message,
    };
    const result = await dialog.showOpenDialog(mainWindow!, dialogOptions as Electron.OpenDialogOptions);
    return result;
  }
);

ipcMain.handle(
  'dialog:open-directory',
  async (_event, options?: Electron.OpenDialogOptions) => {
    const props = options?.properties || [];
    const dialogOptions: Record<string, unknown> = {
      properties: ['openDirectory', ...(props as unknown as string[])],
      title: options?.title,
      defaultPath: options?.defaultPath,
      buttonLabel: options?.buttonLabel,
      filters: options?.filters,
      securityScopedBookmarks: options?.securityScopedBookmarks,
      message: options?.message,
    };
    const result = await dialog.showOpenDialog(mainWindow!, dialogOptions as Electron.OpenDialogOptions);
    return result;
  }
);

/**
 * Placeholder IPC channels — to be wired as services are implemented:
 *
 * - host:management    — Host CRUD operations
 * - ssh:session        — SSH session management
 * - secret:storage     — OS keychain access
 * - database:query     — SQLite operations
 * - audit:log          — Audit event writing
 * - agent:invoke       — Agent service calls
 * - bootstrap:generate — Bootstrap script generation
 */

// Host management
ipcMain.handle(
  'host:list',
  async () => {
    return mvpStore.listHosts();
  }
);

ipcMain.handle(
  'host:get',
  async (_event, hostId: string) => {
    return mvpStore.getHost(hostId);
  }
);

ipcMain.handle(
  'host:create',
  async (_event, hostData: CreateHostInput) => {
    const contract = getHostRouteContract('ipc:host:create');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:create');
    }
    const validatedHostData = validateHostCreateInput(hostData);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:create',
        action: 'host:create',
      },
      input: validatedHostData,
      execute: () => mvpStore.createHost(validatedHostData),
    });
  }
);

ipcMain.handle(
  'host:update',
  async (_event, hostId: string, hostData: UpdateHostInput) => {
    const contract = getHostRouteContract('ipc:host:update');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:update');
    }
    const validatedHostId = validateHostIdInput(hostId);
    const validatedInput = validateHostUpdateInput(hostData);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:update',
        action: 'host:update',
        hostId: validatedHostId,
      },
      input: validatedInput,
      execute: () => mvpStore.updateHost(validatedHostId, validatedInput),
    });
  }
);

ipcMain.handle(
  'host:delete',
  async (_event, hostId: string) => {
    const contract = getHostRouteContract('ipc:host:delete');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:delete');
    }
    const validatedHostId = validateHostIdInput(hostId);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:delete',
        action: 'host:delete',
        hostId: validatedHostId,
      },
      input: validatedHostId,
      execute: () => mvpStore.deleteHost(validatedHostId),
    });
  }
);

ipcMain.handle(
  'host:test-connection',
  async (_event, hostId: string) => {
    const contract = getHostRouteContract('ipc:host:test-connection');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:test-connection');
    }
    const validatedHostId = validateHostIdInput(hostId);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:test-connection',
        action: 'host:test-connection',
        hostId: validatedHostId,
      },
      input: validatedHostId,
      execute: () => mvpStore.testConnection(validatedHostId),
    });
  }
);

// Host group, favorite, duplicate, import
ipcMain.handle(
  'host:updateGroup',
  async (_event, hostId: string, groupName: string) => {
    const contract = getHostRouteContract('ipc:host:updateGroup');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:updateGroup');
    }
    const validatedHostId = validateHostIdInput(hostId);
    const validatedGroupName = validateHostGroupNameInput(groupName);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:updateGroup',
        action: 'host:updateGroup',
        hostId: validatedHostId,
      },
      input: validatedGroupName,
      execute: () => mvpStore.assignHostToGroup(validatedHostId, validatedGroupName),
    });
  }
);

ipcMain.handle(
  'host:setFavorite',
  async (_event, hostId: string, favorite: boolean) => {
    const contract = getHostRouteContract('ipc:host:setFavorite');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:setFavorite');
    }
    const validatedHostId = validateHostIdInput(hostId);
    const validatedFavorite = validateHostFavoriteInput(favorite);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:setFavorite',
        action: 'host:setFavorite',
        hostId: validatedHostId,
      },
      input: validatedFavorite,
      execute: () => mvpStore.setHostFavorite(validatedHostId, validatedFavorite),
    });
  }
);

ipcMain.handle(
  'host:duplicate',
  async (_event, hostId: string) => {
    const contract = getHostRouteContract('ipc:host:duplicate');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:duplicate');
    }
    const validatedHostId = validateHostIdInput(hostId);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:duplicate',
        action: 'host:duplicate',
        hostId: validatedHostId,
      },
      input: validatedHostId,
      execute: () => mvpStore.duplicateHost(validatedHostId),
    });
  }
);

ipcMain.handle(
  'host:import',
  async (_event, hosts: HostRecord[]) => {
    const contract = getHostRouteContract('ipc:host:import');
    if (!contract) {
      throw new Error('Missing host route contract: ipc:host:import');
    }
    const validatedHosts = validateHostImportInput(hosts);
    return runHostRouteContract({
      contract,
      policyService,
      logAuditEvent: (event) => mvpStore.logAuditEvent(event),
      context: {
        caller: 'ipc',
        route: 'host:import',
        action: 'host:import',
      },
      input: validatedHosts,
      execute: () => mvpStore.importHosts(validatedHosts),
    });
  }
);

// MVP settings
ipcMain.handle(
  'settings:get',
  async (_event, input?: unknown) => {
    validateNoInput(input);
    return runSettingsIpcRoute(
      'ipc:settings:get',
      {
        route: 'settings:get',
        action: 'settings:get',
        entityType: 'settings',
      },
      null,
      () => mvpStore.getSettings(),
    );
  }
);

ipcMain.handle(
  'settings:update',
  async (_event, update: MvpSettingsUpdate) => {
    const validatedUpdate = validateSettingsUpdate(update);
    return runSettingsIpcRoute(
      'ipc:settings:update',
      {
        route: 'settings:update',
        action: 'settings:update',
        entityType: 'settings',
      },
      validatedUpdate,
      () => mvpStore.updateSettings(validatedUpdate),
      () => settingsRouteSuccessMetadata(validatedUpdate),
    );
  }
);

// Secret storage (OS keychain)
ipcMain.handle(
  'secret:store',
  async (_event, key: string, value: string): Promise<boolean> => {
    const validated = validateSecretStoreInput(key, value);
    const auditKey = validated.key;
    let successMetadata: Record<string, unknown> = {};
    return runSecretIpcRoute(
      'ipc:secret:store',
      {
        route: 'secret:store',
        action: 'secret:store',
        entityId: auditKey,
        entityType: 'secret',
      },
      validated,
      () => {
        try {
          const secret = secretVault.store(validated.key, validated.value);
          const credentialRefId = upsertSecretCredentialRef(secret);
          successMetadata = {
            backend: secret.backend,
            credentialRefId,
            rawSecretInSqlite: false,
          };
          return true;
        } catch (err) {
          logSecretAuditEvent(
            'secret.store_failed',
            auditKey,
            err instanceof SecretVaultUnavailableError
              ? 'Secret storage unavailable; raw secret material was not persisted.'
              : 'Secret storage failed; raw secret material was not persisted.',
            {
              ...errorMetadata(err),
              rawSecretInSqlite: false,
            },
          );
          return false;
        }
      },
      (result) => result === true,
      () => successMetadata,
    );
  }
);

ipcMain.handle(
  'secret:retrieve',
  async (_event, key: string): Promise<string | null> => {
    const auditKey = validateSecretKeyInput(key);
    return runSecretIpcRoute(
      'ipc:secret:retrieve',
      {
        route: 'secret:retrieve',
        action: 'secret:retrieve',
        entityId: auditKey,
        entityType: 'secret',
      },
      auditKey,
      () => {
        try {
          logSecretAuditEvent(
            'secret.retrieve_denied',
            auditKey,
            'Renderer secret retrieval denied; plaintext secrets are available only to main-process services.',
            {
              exists: secretVault.has(auditKey),
              plaintextReturned: false,
            },
          );
        } catch (err) {
          logSecretAuditEvent(
            'secret.use_failed',
            auditKey,
            'Secret retrieval check failed; plaintext was not returned to renderer.',
            {
              ...errorMetadata(err),
              plaintextReturned: false,
            },
          );
        }
        return null;
      },
    );
  }
);

ipcMain.handle(
  'secret:delete',
  async (_event, key: string): Promise<boolean> => {
    const auditKey = validateSecretKeyInput(key);
    let successMetadata: Record<string, unknown> = {};
    return runSecretIpcRoute(
      'ipc:secret:delete',
      {
        route: 'secret:delete',
        action: 'secret:delete',
        entityId: auditKey,
        entityType: 'secret',
      },
      auditKey,
      () => {
        try {
          const metadata = secretVault.metadata(auditKey);
          const deleted = secretVault.delete(auditKey);
          if (deleted) {
            const deletedCredentialRefIds = deleteSecretCredentialRefs(auditKey);
            successMetadata = {
              backend: metadata?.backend ?? 'unknown',
              deletedCredentialRefIds,
            };
          }
          return deleted;
        } catch (err) {
          logSecretAuditEvent(
            'secret.delete_failed',
            auditKey,
            'Secret delete failed; no secret value was logged.',
            errorMetadata(err),
          );
          return false;
        }
      },
      (result) => result === true,
      () => successMetadata,
    );
  }
);

// Audit logging
ipcMain.handle(
  'audit:list',
  async (_event, input?: unknown) => {
    validateNoInput(input);
    return runAuditIpcRoute(
      'ipc:audit:list',
      {
        route: 'audit:list',
        action: 'audit:list',
        entityType: 'audit_event',
      },
      null,
      () => mvpStore.listAuditEvents(),
    );
  }
);

ipcMain.handle(
  'audit:log',
  async (_event, event: CreateAuditEventInput) => {
    const validatedEvent = validateAuditEventInput(event);
    return runAuditIpcRoute(
      'ipc:audit:log',
      {
        route: 'audit:log',
        action: 'audit:log',
        entityType: 'audit_event',
      },
      validatedEvent,
      () => mvpStore.logAuditEvent(validatedEvent),
    );
  }
);

// Terminal sessions
ipcMain.handle(
  'terminal:start',
  async (_event, hostId: string) => {
    const validatedHostId = validateTerminalStartInput(hostId);
    return runTerminalIpcRoute(
      'ipc:terminal:start',
      {
        route: 'terminal:start',
        action: 'terminal:start',
        hostId: validatedHostId,
        entityType: 'host',
      },
      validatedHostId,
      () => terminalSessions.start(validatedHostId),
      terminalRouteSuccessMetadata,
    );
  }
);

ipcMain.handle(
  'terminal:write',
  async (_event, sessionId: string, input: string) => {
    const validated = validateTerminalWriteInput(sessionId, input);
    return runTerminalIpcRoute(
      'ipc:terminal:write',
      {
        route: 'terminal:write',
        action: 'terminal:write',
        entityId: validated.sessionId,
        entityType: 'terminal_session',
      },
      validated,
      () => terminalSessions.write(validated.sessionId, validated.input),
      terminalRouteSuccessMetadata,
    );
  }
);

ipcMain.handle(
  'terminal:resize',
  async (_event, sessionId: string, cols: number, rows: number) => {
    const validated = validateTerminalResizeInput(sessionId, cols, rows);
    return runTerminalIpcRoute(
      'ipc:terminal:resize',
      {
        route: 'terminal:resize',
        action: 'terminal:resize',
        entityId: validated.sessionId,
        entityType: 'terminal_session',
      },
      validated,
      () => terminalSessions.resize(validated.sessionId, validated.cols, validated.rows),
      terminalRouteSuccessMetadata,
    );
  }
);

ipcMain.handle(
  'terminal:stop',
  async (_event, sessionId: string) => {
    const validatedSessionId = validateTerminalStopInput(sessionId);
    return runTerminalIpcRoute(
      'ipc:terminal:stop',
      {
        route: 'terminal:stop',
        action: 'terminal:stop',
        entityId: validatedSessionId,
        entityType: 'terminal_session',
      },
      validatedSessionId,
      () => terminalSessions.stop(validatedSessionId),
      terminalRouteSuccessMetadata,
    );
  }
);

// Workspace profiles
ipcMain.handle(
  'workspace:list-profiles',
  async (_event, input?: unknown) => {
    validateNoInput(input);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:list-profiles',
      {
        route: 'workspace:list-profiles',
        action: 'workspace:list-profiles',
        entityType: 'workspace_profile',
      },
      null,
      () => mvpStore.listWorkspaceProfiles(),
    );
  }
);

ipcMain.handle(
  'workspace:get-profile',
  async (_event, profileId: string) => {
    const validatedProfileId = validateWorkspaceProfileIdInput(profileId);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:get-profile',
      {
        route: 'workspace:get-profile',
        action: 'workspace:get-profile',
        entityId: validatedProfileId,
        entityType: 'workspace_profile',
      },
      validatedProfileId,
      () => mvpStore.getWorkspaceProfile(validatedProfileId),
    );
  }
);

ipcMain.handle(
  'workspace:create-profile',
  async (_event, input: CreateWorkspaceProfileInput) => {
    const validatedInput = validateWorkspaceProfileCreateInput(input);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:create-profile',
      {
        route: 'workspace:create-profile',
        action: 'workspace:create-profile',
        entityType: 'workspace_profile',
      },
      validatedInput,
      () => mvpStore.createWorkspaceProfile(validatedInput),
    );
  }
);

ipcMain.handle(
  'workspace:update-profile',
  async (_event, profileId: string, input: UpdateWorkspaceProfileInput) => {
    const validatedProfileId = validateWorkspaceProfileIdInput(profileId);
    const validatedInput = validateWorkspaceProfileUpdateInput(input);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:update-profile',
      {
        route: 'workspace:update-profile',
        action: 'workspace:update-profile',
        entityId: validatedProfileId,
        entityType: 'workspace_profile',
      },
      validatedInput,
      () => mvpStore.updateWorkspaceProfile(validatedProfileId, validatedInput),
    );
  }
);

ipcMain.handle(
  'workspace:delete-profile',
  async (_event, profileId: string) => {
    const validatedProfileId = validateWorkspaceProfileIdInput(profileId);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:delete-profile',
      {
        route: 'workspace:delete-profile',
        action: 'workspace:delete-profile',
        entityId: validatedProfileId,
        entityType: 'workspace_profile',
      },
      validatedProfileId,
      () => mvpStore.deleteWorkspaceProfile(validatedProfileId),
    );
  }
);

ipcMain.handle(
  'workspace:get-active-profile-id',
  async (_event, input?: unknown) => {
    validateNoInput(input);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:get-active-profile-id',
      {
        route: 'workspace:get-active-profile-id',
        action: 'workspace:get-active-profile-id',
        entityType: 'workspace_state',
      },
      null,
      () => mvpStore.getActiveWorkspaceProfileId(),
    );
  }
);

ipcMain.handle(
  'workspace:set-active-profile-id',
  async (_event, profileId: string) => {
    const validatedProfileId = validateWorkspaceProfileIdInput(profileId);
    return runWorkspaceProfileIpcRoute(
      'ipc:workspace:set-active-profile-id',
      {
        route: 'workspace:set-active-profile-id',
        action: 'workspace:set-active-profile-id',
        entityId: validatedProfileId,
        entityType: 'workspace_state',
      },
      validatedProfileId,
      () => {
        mvpStore.setActiveWorkspaceProfileId(validatedProfileId);
        return validatedProfileId;
      },
    );
  }
);

ipcMain.handle(
  'workspace-file:list',
  async (_event, relativePath = ''): Promise<WorkspaceFileEntry[]> => {
    const validatedPath = validateWorkspaceFileListInput(relativePath);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:list',
      {
        route: 'workspace-file:list',
        action: 'workspace-file:list',
        entityId: validatedPath || null,
        entityType: 'workspace_file',
      },
      validatedPath,
      () => listWorkspaceFiles(validatedPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:create-folder',
  async (_event, targetRelativePath = ''): Promise<WorkspaceFileEntry> => {
    const validatedTargetPath = validateWorkspaceFileTargetPathInput(targetRelativePath);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:create-folder',
      {
        route: 'workspace-file:create-folder',
        action: 'workspace-file:create-folder',
        entityId: validatedTargetPath || null,
        entityType: 'workspace_file',
      },
      validatedTargetPath,
      () => createWorkspaceFolder(validatedTargetPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:create-file',
  async (_event, kind: WorkspaceFileEntry['kind'] = 'note', targetRelativePath = ''): Promise<WorkspaceFileEntry> => {
    const validatedInput = validateWorkspaceFileCreateFileInput({
      kind,
      targetPath: targetRelativePath,
    });
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:create-file',
      {
        route: 'workspace-file:create-file',
        action: 'workspace-file:create-file',
        entityId: validatedInput.targetPath || null,
        entityType: 'workspace_file',
      },
      validatedInput,
      () => createWorkspaceFile(validatedInput.kind, validatedInput.targetPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:rename',
  async (_event, relativePath: string, newName: string): Promise<WorkspaceFileEntry> => {
    const validatedInput = validateWorkspaceFileRenameInput({
      path: relativePath,
      newName,
    });
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:rename',
      {
        route: 'workspace-file:rename',
        action: 'workspace-file:rename',
        entityId: validatedInput.path,
        entityType: 'workspace_file',
      },
      validatedInput,
      () => renameWorkspaceFile(validatedInput.path, validatedInput.newName),
    );
  }
);

ipcMain.handle(
  'workspace-file:duplicate',
  async (_event, relativePath: string): Promise<WorkspaceFileEntry> => {
    const validatedPath = validateWorkspaceFilePathInput(relativePath);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:duplicate',
      {
        route: 'workspace-file:duplicate',
        action: 'workspace-file:duplicate',
        entityId: validatedPath,
        entityType: 'workspace_file',
      },
      validatedPath,
      () => duplicateWorkspaceFile(validatedPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:copy',
  async (_event, relativePath: string, targetRelativePath?: string): Promise<WorkspaceFileEntry> => {
    const validatedInput = validateWorkspaceFileCopyMoveInput({
      path: relativePath,
      targetPath: targetRelativePath,
    });
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:copy',
      {
        route: 'workspace-file:copy',
        action: 'workspace-file:copy',
        entityId: validatedInput.path,
        entityType: 'workspace_file',
      },
      validatedInput,
      () => copyWorkspaceFile(validatedInput.path, validatedInput.targetPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:move',
  async (_event, relativePath: string, targetRelativePath?: string): Promise<WorkspaceFileEntry> => {
    const validatedInput = validateWorkspaceFileCopyMoveInput({
      path: relativePath,
      targetPath: targetRelativePath,
    });
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:move',
      {
        route: 'workspace-file:move',
        action: 'workspace-file:move',
        entityId: validatedInput.path,
        entityType: 'workspace_file',
      },
      validatedInput,
      () => moveWorkspaceFile(validatedInput.path, validatedInput.targetPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:delete-permanent',
  async (_event, relativePath: string): Promise<boolean> => {
    const validatedPath = validateWorkspaceFilePathInput(relativePath);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:delete-permanent',
      {
        route: 'workspace-file:delete-permanent',
        action: 'workspace-file:delete-permanent',
        entityId: validatedPath,
        entityType: 'workspace_file',
      },
      validatedPath,
      () => deleteWorkspaceFilePermanent(validatedPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:list-trash',
  async (_event, input?: unknown): Promise<WorkspaceTrashEntry[]> => {
    validateNoInput(input);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:list-trash',
      {
        route: 'workspace-file:list-trash',
        action: 'workspace-file:list-trash',
        entityType: 'workspace_trash',
      },
      null,
      () => listWorkspaceTrash(),
    );
  }
);

ipcMain.handle(
  'workspace-file:move-to-trash',
  async (_event, relativePath: string): Promise<WorkspaceTrashEntry> => {
    const validatedPath = validateWorkspaceFilePathInput(relativePath);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:move-to-trash',
      {
        route: 'workspace-file:move-to-trash',
        action: 'workspace-file:move-to-trash',
        entityId: validatedPath,
        entityType: 'workspace_file',
      },
      validatedPath,
      () => moveWorkspaceFileToTrash(validatedPath),
    );
  }
);

ipcMain.handle(
  'workspace-file:restore-trash',
  async (_event, id: string): Promise<WorkspaceFileEntry> => {
    const validatedId = validateWorkspaceTrashIdInput(id);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:restore-trash',
      {
        route: 'workspace-file:restore-trash',
        action: 'workspace-file:restore-trash',
        entityId: validatedId,
        entityType: 'workspace_trash',
      },
      validatedId,
      () => restoreWorkspaceTrashItem(validatedId),
    );
  }
);

ipcMain.handle(
  'workspace-file:delete-trash-permanent',
  async (_event, id: string): Promise<boolean> => {
    const validatedId = validateWorkspaceTrashIdInput(id);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:delete-trash-permanent',
      {
        route: 'workspace-file:delete-trash-permanent',
        action: 'workspace-file:delete-trash-permanent',
        entityId: validatedId,
        entityType: 'workspace_trash',
      },
      validatedId,
      () => deleteWorkspaceTrashItemPermanent(validatedId),
    );
  }
);

ipcMain.handle(
  'workspace-file:empty-trash',
  async (_event, input?: unknown): Promise<boolean> => {
    validateNoInput(input);
    return runWorkspaceFileIpcRoute(
      'ipc:workspace-file:empty-trash',
      {
        route: 'workspace-file:empty-trash',
        action: 'workspace-file:empty-trash',
        entityType: 'workspace_trash',
      },
      null,
      () => emptyWorkspaceTrash(),
    );
  }
);

// Host Groups
ipcMain.handle('host-group:list', async (_event, input?: unknown) => {
  const contract = getHostRouteContract('ipc:host-group:list');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-group:list');
  }
  validateNoInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-group:list',
      action: 'host-group:list',
      entityType: 'host_group',
    },
    execute: () => mvpStore.listHostGroups(),
  });
});
ipcMain.handle('host-group:get', async (_event, groupId: string) => {
  const contract = getHostRouteContract('ipc:host-group:get');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-group:get');
  }
  const validatedGroupId = validateHostGroupIdInput(groupId);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-group:get',
      action: 'host-group:get',
      entityId: validatedGroupId,
      entityType: 'host_group',
    },
    input: validatedGroupId,
    execute: () => mvpStore.getHostGroup(validatedGroupId),
  });
});
ipcMain.handle('host-group:create', async (_event, input: CreateHostGroupInput) => {
  const contract = getHostRouteContract('ipc:host-group:create');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-group:create');
  }
  const validatedInput = validateHostGroupCreateInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-group:create',
      action: 'host-group:create',
      entityType: 'host_group',
    },
    input: validatedInput,
    execute: () => mvpStore.createHostGroup(validatedInput),
  });
});
ipcMain.handle('host-group:update', async (_event, groupId: string, input: UpdateHostGroupInput) => {
  const contract = getHostRouteContract('ipc:host-group:update');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-group:update');
  }
  const validatedGroupId = validateHostGroupIdInput(groupId);
  const validatedInput = validateHostGroupUpdateInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-group:update',
      action: 'host-group:update',
      entityId: validatedGroupId,
      entityType: 'host_group',
    },
    input: validatedInput,
    execute: () => mvpStore.updateHostGroup(validatedGroupId, validatedInput),
  });
});
ipcMain.handle('host-group:delete', async (_event, groupId: string) => {
  const contract = getHostRouteContract('ipc:host-group:delete');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-group:delete');
  }
  const validatedGroupId = validateHostGroupIdInput(groupId);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-group:delete',
      action: 'host-group:delete',
      entityId: validatedGroupId,
      entityType: 'host_group',
    },
    input: validatedGroupId,
    execute: () => mvpStore.deleteHostGroup(validatedGroupId),
  });
});

// Host Tags
ipcMain.handle('host-tag:list', async (_event, input?: unknown) => {
  const contract = getHostRouteContract('ipc:host-tag:list');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-tag:list');
  }
  validateNoInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-tag:list',
      action: 'host-tag:list',
      entityType: 'host_tag',
    },
    execute: () => mvpStore.listHostTags(),
  });
});
ipcMain.handle('host-tag:get', async (_event, tagId: string) => {
  const contract = getHostRouteContract('ipc:host-tag:get');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-tag:get');
  }
  const validatedTagId = validateHostTagIdInput(tagId);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-tag:get',
      action: 'host-tag:get',
      entityId: validatedTagId,
      entityType: 'host_tag',
    },
    input: validatedTagId,
    execute: () => mvpStore.getHostTag(validatedTagId),
  });
});
ipcMain.handle('host-tag:create', async (_event, input: CreateHostTagInput) => {
  const contract = getHostRouteContract('ipc:host-tag:create');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-tag:create');
  }
  const validatedInput = validateHostTagCreateInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-tag:create',
      action: 'host-tag:create',
      entityType: 'host_tag',
    },
    input: validatedInput,
    execute: () => mvpStore.createHostTag(validatedInput),
  });
});
ipcMain.handle('host-tag:update', async (_event, tagId: string, input: UpdateHostTagInput) => {
  const contract = getHostRouteContract('ipc:host-tag:update');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-tag:update');
  }
  const validatedTagId = validateHostTagIdInput(tagId);
  const validatedInput = validateHostTagUpdateInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-tag:update',
      action: 'host-tag:update',
      entityId: validatedTagId,
      entityType: 'host_tag',
    },
    input: validatedInput,
    execute: () => mvpStore.updateHostTag(validatedTagId, validatedInput),
  });
});
ipcMain.handle('host-tag:delete', async (_event, tagId: string) => {
  const contract = getHostRouteContract('ipc:host-tag:delete');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-tag:delete');
  }
  const validatedTagId = validateHostTagIdInput(tagId);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-tag:delete',
      action: 'host-tag:delete',
      entityId: validatedTagId,
      entityType: 'host_tag',
    },
    input: validatedTagId,
    execute: () => mvpStore.deleteHostTag(validatedTagId),
  });
});

// Credential References
ipcMain.handle('credential-ref:list', async (_event, input?: unknown) => {
  validateNoInput(input);
  return runCredentialRefIpcRoute(
    'ipc:credential-ref:list',
    {
      route: 'credential-ref:list',
      action: 'credential-ref:list',
      entityType: 'credential_ref',
    },
    null,
    () => mvpStore.listCredentialRefs(),
  );
});
ipcMain.handle('credential-ref:get', async (_event, refId: string) => {
  const validatedRefId = validateCredentialRefIdInput(refId);
  return runCredentialRefIpcRoute(
    'ipc:credential-ref:get',
    {
      route: 'credential-ref:get',
      action: 'credential-ref:get',
      entityId: validatedRefId,
      entityType: 'credential_ref',
    },
    validatedRefId,
    () => mvpStore.getCredentialRef(validatedRefId),
  );
});
ipcMain.handle('credential-ref:create', async (_event, input: CreateCredentialRefInput) => {
  const validatedInput = validateCredentialRefCreateInput(input);
  return runCredentialRefIpcRoute(
    'ipc:credential-ref:create',
    {
      route: 'credential-ref:create',
      action: 'credential-ref:create',
      entityType: 'credential_ref',
    },
    validatedInput,
    () => mvpStore.createCredentialRef(validatedInput),
  );
});
ipcMain.handle('credential-ref:update', async (_event, refId: string, input: UpdateCredentialRefInput) => {
  const validatedRefId = validateCredentialRefIdInput(refId);
  const validatedInput = validateCredentialRefUpdateInput(input);
  return runCredentialRefIpcRoute(
    'ipc:credential-ref:update',
    {
      route: 'credential-ref:update',
      action: 'credential-ref:update',
      entityId: validatedRefId,
      entityType: 'credential_ref',
    },
    validatedInput,
    () => mvpStore.updateCredentialRef(validatedRefId, validatedInput),
  );
});
ipcMain.handle('credential-ref:delete', async (_event, refId: string) => {
  const validatedRefId = validateCredentialRefIdInput(refId);
  return runCredentialRefIpcRoute(
    'ipc:credential-ref:delete',
    {
      route: 'credential-ref:delete',
      action: 'credential-ref:delete',
      entityId: validatedRefId,
      entityType: 'credential_ref',
    },
    validatedRefId,
    () => mvpStore.deleteCredentialRef(validatedRefId),
  );
});

// App Manifests
ipcMain.handle('app-manifest:list', async (_event, input?: unknown) => {
  validateNoInput(input);
  return runAppRouteIpc(
    'ipc:app-manifest:list',
    {
      route: 'app-manifest:list',
      action: 'app-manifest:list',
      entityType: 'app_manifest',
    },
    null,
    () => mvpStore.listAppManifests(),
  );
});
ipcMain.handle('app-manifest:get', async (_event, manifestId: string) => {
  const validatedManifestId = validateAppManifestIdInput(manifestId);
  return runAppRouteIpc(
    'ipc:app-manifest:get',
    {
      route: 'app-manifest:get',
      action: 'app-manifest:get',
      entityId: validatedManifestId,
      entityType: 'app_manifest',
    },
    validatedManifestId,
    () => mvpStore.getAppManifest(validatedManifestId),
  );
});
ipcMain.handle('app-manifest:create', async (_event, input: CreateAppManifestInput) => {
  const validatedInput = validateAppManifestCreateInput(input);
  return runAppRouteIpc(
    'ipc:app-manifest:create',
    {
      route: 'app-manifest:create',
      action: 'app-manifest:create',
      entityType: 'app_manifest',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => mvpStore.createAppManifest(validatedInput),
    appManifestRouteSuccessMetadata,
  );
});
ipcMain.handle('app-manifest:update', async (_event, manifestId: string, input: UpdateAppManifestInput) => {
  const validatedManifestId = validateAppManifestIdInput(manifestId);
  const validatedInput = validateAppManifestUpdateInput(input);
  return runAppRouteIpc(
    'ipc:app-manifest:update',
    {
      route: 'app-manifest:update',
      action: 'app-manifest:update',
      entityId: validatedManifestId,
      entityType: 'app_manifest',
      appId: validatedInput.appId ?? null,
    },
    validatedInput,
    () => mvpStore.updateAppManifest(validatedManifestId, validatedInput),
    appManifestRouteSuccessMetadata,
  );
});
ipcMain.handle('app-manifest:delete', async (_event, manifestId: string) => {
  const validatedManifestId = validateAppManifestIdInput(manifestId);
  return runAppRouteIpc(
    'ipc:app-manifest:delete',
    {
      route: 'app-manifest:delete',
      action: 'app-manifest:delete',
      entityId: validatedManifestId,
      entityType: 'app_manifest',
    },
    validatedManifestId,
    () => mvpStore.deleteAppManifest(validatedManifestId),
    appManifestRouteSuccessMetadata,
  );
});

// App Permissions
ipcMain.handle('app-permission:list', async (_event, appId?: string) => {
  const validatedAppId = validateAppPermissionListInput(appId);
  return runAppRouteIpc(
    'ipc:app-permission:list',
    {
      route: 'app-permission:list',
      action: 'app-permission:list',
      entityType: 'app_permission',
      appId: validatedAppId ?? null,
    },
    validatedAppId ?? null,
    () => mvpStore.listAppPermissions(validatedAppId),
  );
});
ipcMain.handle('app-permission:delete', async (_event, permissionId: string) => {
  const validatedPermissionId = validateAppPermissionIdInput(permissionId);
  return runAppRouteIpc(
    'ipc:app-permission:delete',
    {
      route: 'app-permission:delete',
      action: 'app-permission:delete',
      entityId: validatedPermissionId,
      entityType: 'app_permission',
    },
    validatedPermissionId,
    () => mvpStore.deleteAppPermission(validatedPermissionId),
    appPermissionRouteSuccessMetadata,
  );
});
ipcMain.handle('app-permission:create', async (_event, input: CreateAppPermissionInput) => {
  const validatedInput = validateAppPermissionCreateInput(input);
  return runAppRouteIpc(
    'ipc:app-permission:create',
    {
      route: 'app-permission:create',
      action: 'app-permission:create',
      entityType: 'app_permission',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => mvpStore.createAppPermission(validatedInput),
    appPermissionRouteSuccessMetadata,
  );
});

// App Scoped Storage
ipcMain.handle('app-storage:get', async (_event, input: AppScopedStorageGetInput) => {
  const validatedInput = validateAppScopedStorageGetInput(input);
  return runAppRouteIpc(
    'ipc:app-storage:get',
    {
      route: 'app-storage:get',
      action: 'app-storage:get',
      entityId: appScopedStorageEntityId(validatedInput.appId, validatedInput.key),
      entityType: 'app_scoped_storage',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertAppScopedStorageGranted(validatedInput, 'app-storage:get');
      return mvpStore.getAppScopedStorage(validatedInput);
    },
    appScopedStorageRouteSuccessMetadata,
  );
});
ipcMain.handle('app-storage:set', async (_event, input: AppScopedStorageSetInput) => {
  const validatedInput = validateAppScopedStorageSetInput(input);
  return runAppRouteIpc(
    'ipc:app-storage:set',
    {
      route: 'app-storage:set',
      action: 'app-storage:set',
      entityId: appScopedStorageEntityId(validatedInput.appId, validatedInput.key),
      entityType: 'app_scoped_storage',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertAppScopedStorageGranted(validatedInput, 'app-storage:set');
      return mvpStore.setAppScopedStorage(validatedInput);
    },
    appScopedStorageRouteSuccessMetadata,
  );
});
ipcMain.handle('app-storage:delete', async (_event, input: AppScopedStorageGetInput) => {
  const validatedInput = validateAppScopedStorageDeleteInput(input);
  return runAppRouteIpc(
    'ipc:app-storage:delete',
    {
      route: 'app-storage:delete',
      action: 'app-storage:delete',
      entityId: appScopedStorageEntityId(validatedInput.appId, validatedInput.key),
      entityType: 'app_scoped_storage',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertAppScopedStorageGranted(validatedInput, 'app-storage:delete');
      return mvpStore.deleteAppScopedStorage(validatedInput);
    },
    appScopedStorageRouteSuccessMetadata,
  );
});

// Generated App Host SDK
ipcMain.handle('app-host:list', async (_event, input: GeneratedAppHostListInput) => {
  const validatedInput = validateGeneratedAppHostListInput(input);
  return runAppRouteIpc(
    'ipc:app-host:list',
    {
      route: 'app-host:list',
      action: 'app-host:list',
      entityId: validatedInput.appId,
      entityType: 'app',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertGeneratedAppHostCapabilityGranted(validatedInput, 'app-host:list');
      return generatedAppHostListResult(validatedInput);
    },
    generatedAppHostRouteSuccessMetadata,
  );
});
ipcMain.handle('app-host:get', async (_event, input: GeneratedAppHostTargetInput) => {
  const validatedInput = validateGeneratedAppHostGetInput(input);
  return runAppRouteIpc(
    'ipc:app-host:get',
    {
      route: 'app-host:get',
      action: 'app-host:get',
      hostId: validatedInput.hostId,
      entityType: 'host',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertGeneratedAppHostCapabilityGranted(validatedInput, 'app-host:get');
      return generatedAppHostGetResult(validatedInput);
    },
    generatedAppHostRouteSuccessMetadata,
  );
});
ipcMain.handle('app-host:get-status', async (_event, input: GeneratedAppHostTargetInput) => {
  const validatedInput = validateGeneratedAppHostStatusInput(input);
  return runAppRouteIpc(
    'ipc:app-host:get-status',
    {
      route: 'app-host:get-status',
      action: 'app-host:get-status',
      hostId: validatedInput.hostId,
      entityType: 'host',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertGeneratedAppHostCapabilityGranted(validatedInput, 'app-host:get-status');
      return generatedAppHostStatusResult(validatedInput);
    },
    generatedAppHostRouteSuccessMetadata,
  );
});
ipcMain.handle('app-host:get-capabilities', async (_event, input: GeneratedAppHostTargetInput) => {
  const validatedInput = validateGeneratedAppHostCapabilitiesInput(input);
  return runAppRouteIpc(
    'ipc:app-host:get-capabilities',
    {
      route: 'app-host:get-capabilities',
      action: 'app-host:get-capabilities',
      hostId: validatedInput.hostId,
      entityType: 'host',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertGeneratedAppHostCapabilityGranted(validatedInput, 'app-host:get-capabilities');
      return generatedAppHostCapabilitiesResult(validatedInput);
    },
    generatedAppHostRouteSuccessMetadata,
  );
});
ipcMain.handle('app-host:test-connection', async (_event, input: GeneratedAppHostTargetInput) => {
  const validatedInput = validateGeneratedAppHostTestConnectionInput(input);
  return runAppRouteIpc(
    'ipc:app-host:test-connection',
    {
      route: 'app-host:test-connection',
      action: 'app-host:test-connection',
      hostId: validatedInput.hostId,
      entityType: 'host',
      appId: validatedInput.appId,
    },
    validatedInput,
    () => {
      assertGeneratedAppHostCapabilityGranted(validatedInput, 'app-host:test-connection');
      return generatedAppHostTestConnectionResult(validatedInput);
    },
    generatedAppHostRouteSuccessMetadata,
  );
});

// Agent Endpoints
ipcMain.handle('agent-endpoint:list', async (_event, input?: unknown) => {
  validateNoInput(input);
  return runAgentEndpointIpcRoute(
    'ipc:agent-endpoint:list',
    {
      route: 'agent-endpoint:list',
      action: 'agent-endpoint:list',
      entityType: 'agent_endpoint',
    },
    null,
    () => mvpStore.listAgentEndpoints(),
  );
});
ipcMain.handle('agent-endpoint:get', async (_event, endpointId: string) => {
  const validatedEndpointId = validateAgentEndpointIdInput(endpointId);
  return runAgentEndpointIpcRoute(
    'ipc:agent-endpoint:get',
    {
      route: 'agent-endpoint:get',
      action: 'agent-endpoint:get',
      entityId: validatedEndpointId,
      entityType: 'agent_endpoint',
    },
    validatedEndpointId,
    () => mvpStore.getAgentEndpoint(validatedEndpointId),
  );
});
ipcMain.handle('agent-endpoint:create', async (_event, input: CreateAgentEndpointInput) => {
  const validatedInput = validateAgentEndpointCreateInput(input);
  return runAgentEndpointIpcRoute(
    'ipc:agent-endpoint:create',
    {
      route: 'agent-endpoint:create',
      action: 'agent-endpoint:create',
      entityType: 'agent_endpoint',
    },
    validatedInput,
    () => mvpStore.createAgentEndpoint(validatedInput),
    agentEndpointRouteSuccessMetadata,
  );
});
ipcMain.handle('agent-endpoint:update', async (_event, endpointId: string, input: UpdateAgentEndpointInput) => {
  const validatedEndpointId = validateAgentEndpointIdInput(endpointId);
  const validatedInput = validateAgentEndpointUpdateInput(input);
  return runAgentEndpointIpcRoute(
    'ipc:agent-endpoint:update',
    {
      route: 'agent-endpoint:update',
      action: 'agent-endpoint:update',
      entityId: validatedEndpointId,
      entityType: 'agent_endpoint',
    },
    validatedInput,
    () => mvpStore.updateAgentEndpoint(validatedEndpointId, validatedInput),
    agentEndpointRouteSuccessMetadata,
  );
});
ipcMain.handle('agent-endpoint:delete', async (_event, endpointId: string) => {
  const validatedEndpointId = validateAgentEndpointIdInput(endpointId);
  return runAgentEndpointIpcRoute(
    'ipc:agent-endpoint:delete',
    {
      route: 'agent-endpoint:delete',
      action: 'agent-endpoint:delete',
      entityId: validatedEndpointId,
      entityType: 'agent_endpoint',
    },
    validatedEndpointId,
    () => mvpStore.deleteAgentEndpoint(validatedEndpointId),
  );
});

// Operator proposals
ipcMain.handle('agent:propose', async (_event, input: OperatorProposeInput) => {
  const validatedInput = validateOperatorProposeInput(input);
  return runAgentOperatorIpcRoute(
    'ipc:agent:propose',
    {
      route: 'agent:propose',
      action: 'agent:propose',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => agentOperator.propose(validatedInput),
    operatorProposeRouteSuccessMetadata,
  );
});

ipcMain.handle('agent:execute-action', async (_event, input: OperatorActionExecuteInput) => {
  const validatedInput = validateOperatorActionExecuteInput(input);
  return runAgentOperatorIpcRoute(
    'ipc:agent:execute-action',
    {
      route: 'agent:execute-action',
      action: 'agent:execute-action',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => agentOperator.executeApprovedAction(validatedInput, terminalSessions),
    operatorActionRouteSuccessMetadata,
  );
});

// Bootstrap Presets
ipcMain.handle('bootstrap-preset:list', async (_event, input?: unknown) => {
  validateNoInput(input);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-preset:list',
    {
      route: 'bootstrap-preset:list',
      action: 'bootstrap-preset:list',
      entityType: 'bootstrap_preset',
    },
    null,
    () => mvpStore.listBootstrapPresets(),
  );
});
ipcMain.handle('bootstrap-preset:get', async (_event, presetId: string) => {
  const validatedPresetId = validateBootstrapPresetIdInput(presetId);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-preset:get',
    {
      route: 'bootstrap-preset:get',
      action: 'bootstrap-preset:get',
      entityId: validatedPresetId,
      entityType: 'bootstrap_preset',
    },
    validatedPresetId,
    () => mvpStore.getBootstrapPreset(validatedPresetId),
  );
});
ipcMain.handle('bootstrap-preset:create', async (_event, input: CreateBootstrapPresetInput) => {
  const validatedInput = validateBootstrapPresetCreateInput(input);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-preset:create',
    {
      route: 'bootstrap-preset:create',
      action: 'bootstrap-preset:create',
      entityType: 'bootstrap_preset',
    },
    validatedInput,
    () => mvpStore.createBootstrapPreset(validatedInput),
    bootstrapPresetRouteSuccessMetadata,
  );
});
ipcMain.handle('bootstrap-preset:update', async (_event, presetId: string, input: UpdateBootstrapPresetInput) => {
  const validatedPresetId = validateBootstrapPresetIdInput(presetId);
  const validatedInput = validateBootstrapPresetUpdateInput(input);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-preset:update',
    {
      route: 'bootstrap-preset:update',
      action: 'bootstrap-preset:update',
      entityId: validatedPresetId,
      entityType: 'bootstrap_preset',
    },
    validatedInput,
    () => mvpStore.updateBootstrapPreset(validatedPresetId, validatedInput),
    bootstrapPresetRouteSuccessMetadata,
  );
});
ipcMain.handle('bootstrap-preset:delete', async (_event, presetId: string) => {
  const validatedPresetId = validateBootstrapPresetIdInput(presetId);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-preset:delete',
    {
      route: 'bootstrap-preset:delete',
      action: 'bootstrap-preset:delete',
      entityId: validatedPresetId,
      entityType: 'bootstrap_preset',
    },
    validatedPresetId,
    () => mvpStore.deleteBootstrapPreset(validatedPresetId),
    bootstrapPresetRouteSuccessMetadata,
  );
});

// Bootstrap Runs
ipcMain.handle('bootstrap-run:list', async (_event, input?: unknown) => {
  validateNoInput(input);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-run:list',
    {
      route: 'bootstrap-run:list',
      action: 'bootstrap-run:list',
      entityType: 'bootstrap_run',
    },
    null,
    () => mvpStore.listBootstrapRuns(),
  );
});
ipcMain.handle('bootstrap-run:get', async (_event, runId: string) => {
  const validatedRunId = validateBootstrapRunIdInput(runId);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-run:get',
    {
      route: 'bootstrap-run:get',
      action: 'bootstrap-run:get',
      entityId: validatedRunId,
      entityType: 'bootstrap_run',
    },
    validatedRunId,
    () => mvpStore.getBootstrapRun(validatedRunId),
  );
});
ipcMain.handle('bootstrap-run:create', async (_event, input: CreateBootstrapRunInput) => {
  const validatedInput = validateBootstrapRunCreateInput(input);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-run:create',
    {
      route: 'bootstrap-run:create',
      action: 'bootstrap-run:create',
      hostId: validatedInput.hostId,
      entityType: 'bootstrap_run',
    },
    validatedInput,
    () => mvpStore.createBootstrapRun(validatedInput),
    bootstrapRunRouteSuccessMetadata,
  );
});
ipcMain.handle('bootstrap-run:update', async (_event, runId: string, input: UpdateBootstrapRunInput) => {
  const validatedRunId = validateBootstrapRunIdInput(runId);
  const validatedInput = validateBootstrapRunUpdateInput(input);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-run:update',
    {
      route: 'bootstrap-run:update',
      action: 'bootstrap-run:update',
      entityId: validatedRunId,
      entityType: 'bootstrap_run',
    },
    validatedInput,
    () => mvpStore.updateBootstrapRun(validatedRunId, validatedInput),
    bootstrapRunRouteSuccessMetadata,
  );
});
ipcMain.handle('bootstrap-run:delete', async (_event, runId: string) => {
  const validatedRunId = validateBootstrapRunIdInput(runId);
  return runBootstrapRouteIpc(
    'ipc:bootstrap-run:delete',
    {
      route: 'bootstrap-run:delete',
      action: 'bootstrap-run:delete',
      entityId: validatedRunId,
      entityType: 'bootstrap_run',
    },
    validatedRunId,
    () => mvpStore.deleteBootstrapRun(validatedRunId),
    bootstrapRunRouteSuccessMetadata,
  );
});

// Command History
ipcMain.handle('command-history:list', async (_event, limit?: number) => {
  const validatedLimit = validateCommandHistoryListLimitInput(limit);
  return runCommandHistoryIpcRoute(
    'ipc:command-history:list',
    {
      route: 'command-history:list',
      action: 'command-history:list',
      entityType: 'command_history',
    },
    validatedLimit ?? null,
    () => mvpStore.listCommandHistory(validatedLimit),
  );
});
ipcMain.handle('command-history:create', async (_event, input: CreateCommandHistoryInput) => {
  const validatedInput = validateCommandHistoryCreateInput(input);
  return runCommandHistoryIpcRoute(
    'ipc:command-history:create',
    {
      route: 'command-history:create',
      action: 'command-history:create',
      hostId: validatedInput.hostId ?? null,
      entityType: 'command_history',
    },
    validatedInput,
    () => mvpStore.createCommandHistoryEntry(validatedInput),
    commandHistoryRouteSuccessMetadata,
  );
});
ipcMain.handle('command-history:delete', async (_event, entryId: string) => {
  const validatedEntryId = validateCommandHistoryEntryIdInput(entryId);
  return runCommandHistoryIpcRoute(
    'ipc:command-history:delete',
    {
      route: 'command-history:delete',
      action: 'command-history:delete',
      entityId: validatedEntryId,
      entityType: 'command_history',
    },
    validatedEntryId,
    () => mvpStore.deleteCommandHistoryEntry(validatedEntryId),
    commandHistoryRouteSuccessMetadata,
  );
});

// Read-only Host Operations
ipcMain.handle('host-operation:run', async (_event, input: HostOperationInput) => {
  const contract = getHostRouteContract('ipc:host-operation:run');
  if (!contract) {
    throw new Error('Missing host route contract: ipc:host-operation:run');
  }
  const validatedInput = validateHostOperationInput(input);
  return runHostRouteContract({
    contract,
    policyService,
    logAuditEvent: (event) => mvpStore.logAuditEvent(event),
    context: {
      caller: 'ipc',
      route: 'host-operation:run',
      action: 'host-operation:run',
      hostId: validatedInput.hostId,
    },
    input: validatedInput,
    execute: () => hostOperations.run(validatedInput),
  });
});

// Structured SSH command execution
ipcMain.handle('ssh:exec', async (_event, input: SshExecInput) => {
  const validatedInput = validateSshExecInput(input);
  return runSshIpcRoute(
    'ipc:ssh:exec',
    {
      route: 'ssh:exec',
      action: 'ssh:exec',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => sshService.exec(validatedInput),
    sshExecRouteSuccessMetadata,
  );
});
ipcMain.handle('ssh-file:list', async (_event, input: SshFileListInput) => {
  const validatedInput = validateSshFileListInput(input);
  return runSshIpcRoute(
    'ipc:ssh-file:list',
    {
      route: 'ssh-file:list',
      action: 'ssh-file:list',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => sshService.listDir(validatedInput),
    sshFileListRouteSuccessMetadata,
  );
});
ipcMain.handle('ssh-file:stat', async (_event, input: SshFileStatInput) => {
  const validatedInput = validateSshFileStatInput(input);
  return runSshIpcRoute(
    'ipc:ssh-file:stat',
    {
      route: 'ssh-file:stat',
      action: 'ssh-file:stat',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => sshService.stat(validatedInput),
    sshFileStatRouteSuccessMetadata,
  );
});
ipcMain.handle('ssh-file:download', async (_event, input: SshFileTransferInput) => {
  const validatedInput = validateSshFileTransferInput(input);
  return runSshIpcRoute(
    'ipc:ssh-file:download',
    {
      route: 'ssh-file:download',
      action: 'ssh-file:download',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => sshService.download(validatedInput),
    sshFileTransferRouteSuccessMetadata,
  );
});
ipcMain.handle('ssh-file:upload', async (_event, input: SshFileTransferInput) => {
  const validatedInput = validateSshFileTransferInput(input);
  return runSshIpcRoute(
    'ipc:ssh-file:upload',
    {
      route: 'ssh-file:upload',
      action: 'ssh-file:upload',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => sshService.upload(validatedInput),
    sshFileTransferRouteSuccessMetadata,
  );
});
ipcMain.handle('ssh-file:delete', async (_event, input: SshFileDeleteInput) => {
  const validatedInput = validateSshFileDeleteInput(input);
  return runSshIpcRoute(
    'ipc:ssh-file:delete',
    {
      route: 'ssh-file:delete',
      action: 'ssh-file:delete',
      hostId: validatedInput.hostId,
      entityType: 'host',
    },
    validatedInput,
    () => sshService.delete(validatedInput),
    sshFileDeleteRouteSuccessMetadata,
  );
});

// Bootstrap generator
ipcMain.handle(
  'bootstrap:presets',
  async (_event, input?: unknown) => {
    validateNoInput(input);
    return runBootstrapRouteIpc(
      'ipc:bootstrap:presets',
      {
        route: 'bootstrap:presets',
        action: 'bootstrap:presets',
        entityType: 'bootstrap',
      },
      null,
      () => listBootstrapPresets(),
    );
  }
);

ipcMain.handle(
  'bootstrap:generate',
  async (_event, input: BootstrapGenerateInput) => {
    const validatedInput = validateBootstrapGenerateInput(input);
    const hostId = validatedInput.hostId ?? null;
    return runBootstrapRouteIpc(
      'ipc:bootstrap:generate',
      {
        route: 'bootstrap:generate',
        action: 'bootstrap:generate',
        hostId,
        entityType: hostId ? 'host' : 'bootstrap',
      },
      validatedInput,
      () => {
        const host = hostId ? mvpStore.getHost(hostId) : null;
        return generateBootstrapScript(validatedInput, host);
      },
      (result) => bootstrapGenerateRouteSuccessMetadata(result, validatedInput),
    );
  }
);

// ============================================================
// Semantic State — shared inspector state across windows
// ============================================================

const semanticState = new Map<string, unknown>();

ipcMain.handle(
  'semantic:set-state',
  (_event, appId: string, state: unknown) => {
    semanticState.set(appId, state);
  }
);

ipcMain.handle(
  'semantic:get-state',
  (_event, appId: string) => {
    return semanticState.get(appId) ?? null;
  }
);

// ============================================================
// App Lifecycle
// ============================================================

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Create app window when Electron is ready
app.whenReady().then(async () => {
  // Set keep-alive early so window-all-closed respects hosted mode even if the
  // renderer crashes or the window closes before startHostedServer finishes.
  const hostedConfig = getHostedConfig();
  keepAliveForHostedServer = hostedConfig.enabled;

  createWindow();
  await startHostedServer(hostedConfig);

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((err) => { console.error('app.whenReady error:', err); });

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (keepAliveForHostedServer) {
    console.log('SwitchboardOS hosted UI remains active after all Electron windows closed.');
    return;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function cleanupForExit(message: string): void {
  if (hasRunExitCleanup) {
    return;
  }

  hasRunExitCleanup = true;
  terminalSessions.stopAll(message);
  if (hostedServer) {
    void hostedServer.stop();
    hostedServer = null;
  }
  keepAliveForHostedServer = false;
  mvpStore.close();
  console.log('SwitchboardOS shutting down...');
}

// Graceful shutdown
app.on('will-quit', () => {
  cleanupForExit('Application is shutting down.');
});

function exitFromProcessSignal(): void {
  cleanupForExit('Application received a shutdown signal.');

  if (app.isReady()) {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.destroy();
    });
  }

  setImmediate(() => {
    process.exit(0);
  });
}

process.once('SIGTERM', exitFromProcessSignal);
process.once('SIGINT', exitFromProcessSignal);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
  mainWindow?.webContents.send('app:error', {
    message: 'An unexpected error occurred in the application shell.',
    details: err.message,
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason);
});
