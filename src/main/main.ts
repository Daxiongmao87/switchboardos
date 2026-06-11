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
import { randomBytes } from 'crypto';
import { networkInterfaces } from 'os';
import { MvpSqliteStore } from './mvp-sqlite-store';
import type { HostRecord } from '../shared/mvp-models';
import { TerminalSessionManager, type TerminalEventSender } from './terminal-session-manager';
import { generateBootstrapScript, listBootstrapPresets } from './bootstrap-generator';
import { HostedServer, type HostedServerAppInfo } from './hosted-server';
import { HostOperationRunner } from './host-operation-runner';
import { SecretVault, SecretVaultUnavailableError, type SecretMetadata } from './secret-vault';
import { SshService } from './ssh-service';
import { PolicyService } from './policy-service';
import { AgentOperatorService } from './agent-operator-service';
import {
  validateBootstrapGenerateInput,
  validateHostOperationInput,
  validateOperatorProposeInput,
  validateSecretKeyInput,
  validateSecretStoreInput,
  validateSettingsUpdate,
  validateSshExecInput,
  validateSshFileListInput,
  validateSshFileStatInput,
  validateSshFileTransferInput,
  validateTerminalResizeInput,
  validateTerminalStartInput,
  validateTerminalStopInput,
  validateTerminalWriteInput,
} from './runtime-validation';
import type {
  BootstrapGenerateInput,
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
  HostOperationInput,
  CreateWorkspaceProfileInput,
  MvpSettingsUpdate,
  OperatorProposeInput,
  SshExecInput,
  SshFileListInput,
  SshFileStatInput,
  SshFileTransferInput,
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
  const authDisabled = HOSTED_DISABLED_VALUES.has(authFlag);
  const authRequired = !authDisabled || !isLocalHostedHost(host);
  const authToken = tokenFromEnv ?? (authRequired ? randomBytes(24).toString('base64url') : null);
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
      tlsGuidance: config.lanEnabled || !isLocalHostedHost(config.host)
        ? 'Non-local hosted access should be placed behind TLS or a trusted reverse proxy.'
        : 'Localhost hosted access uses token login, session cookies, and CSRF checks.',
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
    return mvpStore.createHost(hostData);
  }
);

ipcMain.handle(
  'host:update',
  async (_event, hostId: string, hostData: UpdateHostInput) => {
    return mvpStore.updateHost(hostId, hostData);
  }
);

ipcMain.handle(
  'host:delete',
  async (_event, hostId: string) => {
    return mvpStore.deleteHost(hostId);
  }
);

ipcMain.handle(
  'host:test-connection',
  async (_event, hostId: string) => {
    return mvpStore.testConnection(hostId);
  }
);

// Host group, favorite, duplicate, import
ipcMain.handle(
  'host:updateGroup',
  async (_event, hostId: string, groupName: string) => {
    return mvpStore.assignHostToGroup(hostId, groupName);
  }
);

ipcMain.handle(
  'host:setFavorite',
  async (_event, hostId: string, favorite: boolean) => {
    return mvpStore.setHostFavorite(hostId, favorite);
  }
);

ipcMain.handle(
  'host:duplicate',
  async (_event, hostId: string) => {
    return mvpStore.duplicateHost(hostId);
  }
);

ipcMain.handle(
  'host:import',
  async (_event, hosts: HostRecord[]) => {
    return mvpStore.importHosts(hosts);
  }
);

// MVP settings
ipcMain.handle(
  'settings:get',
  async () => {
    return mvpStore.getSettings();
  }
);

ipcMain.handle(
  'settings:update',
  async (_event, update: MvpSettingsUpdate) => {
    const validatedUpdate = validateSettingsUpdate(update);
    policyService.assertAllowed('settings:update', {
      caller: 'ipc',
      action: 'settings:update',
    });
    return mvpStore.updateSettings(validatedUpdate);
  }
);

// Secret storage (OS keychain)
ipcMain.handle(
  'secret:store',
  async (_event, key: string, value: string): Promise<boolean> => {
    const validated = validateSecretStoreInput(key, value);
    const auditKey = validated.key;
    policyService.assertAllowed('secret:store', {
      caller: 'ipc',
      action: 'secret:store',
    });
    try {
      const secret = secretVault.store(validated.key, validated.value);
      const credentialRefId = upsertSecretCredentialRef(secret);
      logSecretAuditEvent(
        'secret.stored',
        secret.key,
        'Secret material stored with Electron safeStorage; SQLite stores reference metadata only.',
        {
          backend: secret.backend,
          credentialRefId,
          rawSecretInSqlite: false,
        },
      );
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
  }
);

ipcMain.handle(
  'secret:retrieve',
  async (_event, key: string): Promise<string | null> => {
    const auditKey = validateSecretKeyInput(key);
    policyService.assertAllowed('secret:retrieve', {
      caller: 'ipc',
      action: 'secret:retrieve',
    });
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
  }
);

ipcMain.handle(
  'secret:delete',
  async (_event, key: string): Promise<boolean> => {
    const auditKey = validateSecretKeyInput(key);
    policyService.assertAllowed('secret:delete', {
      caller: 'ipc',
      action: 'secret:delete',
    });
    try {
      const metadata = secretVault.metadata(auditKey);
      const deleted = secretVault.delete(auditKey);
      if (deleted) {
        const deletedCredentialRefIds = deleteSecretCredentialRefs(auditKey);
        logSecretAuditEvent(
          'secret.deleted',
          auditKey,
          'Secret material deleted from secure local storage.',
          {
            backend: metadata?.backend ?? 'unknown',
            deletedCredentialRefIds,
          },
        );
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
  }
);

// Audit logging
ipcMain.handle(
  'audit:list',
  async () => {
    return mvpStore.listAuditEvents();
  }
);

ipcMain.handle(
  'audit:log',
  async (_event, event: CreateAuditEventInput) => {
    return mvpStore.logAuditEvent(event);
  }
);

// Terminal sessions
ipcMain.handle(
  'terminal:start',
  async (_event, hostId: string) => {
    const validatedHostId = validateTerminalStartInput(hostId);
    policyService.assertAllowed('terminal:start', {
      caller: 'ipc',
      action: 'terminal:start',
      hostId: validatedHostId,
    });
    return terminalSessions.start(validatedHostId);
  }
);

ipcMain.handle(
  'terminal:write',
  async (_event, sessionId: string, input: string) => {
    const validated = validateTerminalWriteInput(sessionId, input);
    policyService.assertAllowed('terminal:write', {
      caller: 'ipc',
      action: 'terminal:write',
      sessionId: validated.sessionId,
    });
    return terminalSessions.write(validated.sessionId, validated.input);
  }
);

ipcMain.handle(
  'terminal:resize',
  async (_event, sessionId: string, cols: number, rows: number) => {
    const validated = validateTerminalResizeInput(sessionId, cols, rows);
    policyService.assertAllowed('terminal:resize', {
      caller: 'ipc',
      action: 'terminal:resize',
      sessionId: validated.sessionId,
    });
    return terminalSessions.resize(validated.sessionId, validated.cols, validated.rows);
  }
);

ipcMain.handle(
  'terminal:stop',
  async (_event, sessionId: string) => {
    const validatedSessionId = validateTerminalStopInput(sessionId);
    policyService.assertAllowed('terminal:stop', {
      caller: 'ipc',
      action: 'terminal:stop',
      sessionId: validatedSessionId,
    });
    return terminalSessions.stop(validatedSessionId);
  }
);

// Workspace profiles
ipcMain.handle(
  'workspace:list-profiles',
  async () => {
    return mvpStore.listWorkspaceProfiles();
  }
);

ipcMain.handle(
  'workspace:get-profile',
  async (_event, profileId: string) => {
    return mvpStore.getWorkspaceProfile(profileId);
  }
);

ipcMain.handle(
  'workspace:create-profile',
  async (_event, input: CreateWorkspaceProfileInput) => {
    return mvpStore.createWorkspaceProfile(input);
  }
);

ipcMain.handle(
  'workspace:update-profile',
  async (_event, profileId: string, input: UpdateWorkspaceProfileInput) => {
    return mvpStore.updateWorkspaceProfile(profileId, input);
  }
);

ipcMain.handle(
  'workspace:delete-profile',
  async (_event, profileId: string) => {
    return mvpStore.deleteWorkspaceProfile(profileId);
  }
);

ipcMain.handle(
  'workspace:get-active-profile-id',
  async () => {
    return mvpStore.getActiveWorkspaceProfileId();
  }
);

ipcMain.handle(
  'workspace:set-active-profile-id',
  async (_event, profileId: string) => {
    mvpStore.setActiveWorkspaceProfileId(profileId);
    return profileId;
  }
);

ipcMain.handle(
  'workspace-file:list',
  async (_event, relativePath = ''): Promise<WorkspaceFileEntry[]> => {
    return listWorkspaceFiles(typeof relativePath === 'string' ? relativePath : '');
  }
);

ipcMain.handle(
  'workspace-file:create-folder',
  async (_event, targetRelativePath = ''): Promise<WorkspaceFileEntry> => {
    return createWorkspaceFolder(typeof targetRelativePath === 'string' ? targetRelativePath : '');
  }
);

ipcMain.handle(
  'workspace-file:create-file',
  async (_event, kind: WorkspaceFileEntry['kind'] = 'note', targetRelativePath = ''): Promise<WorkspaceFileEntry> => {
    const safeKind = kind === 'applet' || kind === 'scriptlet' || kind === 'note' ? kind : 'note';
    return createWorkspaceFile(safeKind, typeof targetRelativePath === 'string' ? targetRelativePath : '');
  }
);

ipcMain.handle(
  'workspace-file:rename',
  async (_event, relativePath: string, newName: string): Promise<WorkspaceFileEntry> => {
    return renameWorkspaceFile(
      typeof relativePath === 'string' ? relativePath : '',
      typeof newName === 'string' ? newName : '',
    );
  }
);

ipcMain.handle(
  'workspace-file:duplicate',
  async (_event, relativePath: string): Promise<WorkspaceFileEntry> => {
    return duplicateWorkspaceFile(typeof relativePath === 'string' ? relativePath : '');
  }
);

ipcMain.handle(
  'workspace-file:copy',
  async (_event, relativePath: string, targetRelativePath?: string): Promise<WorkspaceFileEntry> => {
    return copyWorkspaceFile(
      typeof relativePath === 'string' ? relativePath : '',
      typeof targetRelativePath === 'string' ? targetRelativePath : '',
    );
  }
);

ipcMain.handle(
  'workspace-file:move',
  async (_event, relativePath: string, targetRelativePath?: string): Promise<WorkspaceFileEntry> => {
    return moveWorkspaceFile(
      typeof relativePath === 'string' ? relativePath : '',
      typeof targetRelativePath === 'string' ? targetRelativePath : '',
    );
  }
);

ipcMain.handle(
  'workspace-file:delete-permanent',
  async (_event, relativePath: string): Promise<boolean> => {
    return deleteWorkspaceFilePermanent(typeof relativePath === 'string' ? relativePath : '');
  }
);

ipcMain.handle(
  'workspace-file:list-trash',
  async (): Promise<WorkspaceTrashEntry[]> => {
    return listWorkspaceTrash();
  }
);

ipcMain.handle(
  'workspace-file:move-to-trash',
  async (_event, relativePath: string): Promise<WorkspaceTrashEntry> => {
    return moveWorkspaceFileToTrash(typeof relativePath === 'string' ? relativePath : '');
  }
);

ipcMain.handle(
  'workspace-file:restore-trash',
  async (_event, id: string): Promise<WorkspaceFileEntry> => {
    return restoreWorkspaceTrashItem(typeof id === 'string' ? id : '');
  }
);

ipcMain.handle(
  'workspace-file:delete-trash-permanent',
  async (_event, id: string): Promise<boolean> => {
    return deleteWorkspaceTrashItemPermanent(typeof id === 'string' ? id : '');
  }
);

ipcMain.handle(
  'workspace-file:empty-trash',
  async (): Promise<boolean> => {
    return emptyWorkspaceTrash();
  }
);

// Host Groups
ipcMain.handle('host-group:list', async () => mvpStore.listHostGroups());
ipcMain.handle('host-group:get', async (_event, groupId: string) => mvpStore.getHostGroup(groupId));
ipcMain.handle('host-group:create', async (_event, input: CreateHostGroupInput) => mvpStore.createHostGroup(input));
ipcMain.handle('host-group:update', async (_event, groupId: string, input: UpdateHostGroupInput) => mvpStore.updateHostGroup(groupId, input));
ipcMain.handle('host-group:delete', async (_event, groupId: string) => mvpStore.deleteHostGroup(groupId));

// Host Tags
ipcMain.handle('host-tag:list', async () => mvpStore.listHostTags());
ipcMain.handle('host-tag:get', async (_event, tagId: string) => mvpStore.getHostTag(tagId));
ipcMain.handle('host-tag:create', async (_event, input: CreateHostTagInput) => mvpStore.createHostTag(input));
ipcMain.handle('host-tag:update', async (_event, tagId: string, input: UpdateHostTagInput) => mvpStore.updateHostTag(tagId, input));
ipcMain.handle('host-tag:delete', async (_event, tagId: string) => mvpStore.deleteHostTag(tagId));

// Credential References
ipcMain.handle('credential-ref:list', async () => mvpStore.listCredentialRefs());
ipcMain.handle('credential-ref:get', async (_event, refId: string) => mvpStore.getCredentialRef(refId));
ipcMain.handle('credential-ref:create', async (_event, input: CreateCredentialRefInput) => mvpStore.createCredentialRef(input));
ipcMain.handle('credential-ref:update', async (_event, refId: string, input: UpdateCredentialRefInput) => mvpStore.updateCredentialRef(refId, input));
ipcMain.handle('credential-ref:delete', async (_event, refId: string) => mvpStore.deleteCredentialRef(refId));

// App Manifests
ipcMain.handle('app-manifest:list', async () => mvpStore.listAppManifests());
ipcMain.handle('app-manifest:get', async (_event, manifestId: string) => mvpStore.getAppManifest(manifestId));
ipcMain.handle('app-manifest:create', async (_event, input: CreateAppManifestInput) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'app-manifest:create',
  });
  return mvpStore.createAppManifest(input);
});
ipcMain.handle('app-manifest:update', async (_event, manifestId: string, input: UpdateAppManifestInput) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'app-manifest:update',
  });
  return mvpStore.updateAppManifest(manifestId, input);
});
ipcMain.handle('app-manifest:delete', async (_event, manifestId: string) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'app-manifest:delete',
  });
  return mvpStore.deleteAppManifest(manifestId);
});

// App Permissions
ipcMain.handle('app-permission:list', async (_event, appId?: string) => mvpStore.listAppPermissions(appId));
ipcMain.handle('app-permission:create', async (_event, input: CreateAppPermissionInput) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'app-permission:create',
  });
  return mvpStore.createAppPermission(input);
});
ipcMain.handle('app-permission:delete', async (_event, permissionId: string) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'app-permission:delete',
  });
  return mvpStore.deleteAppPermission(permissionId);
});

// Agent Endpoints
ipcMain.handle('agent-endpoint:list', async () => mvpStore.listAgentEndpoints());
ipcMain.handle('agent-endpoint:get', async (_event, endpointId: string) => mvpStore.getAgentEndpoint(endpointId));
ipcMain.handle('agent-endpoint:create', async (_event, input: CreateAgentEndpointInput) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'agent-endpoint:create',
  });
  return mvpStore.createAgentEndpoint(input);
});
ipcMain.handle('agent-endpoint:update', async (_event, endpointId: string, input: UpdateAgentEndpointInput) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'agent-endpoint:update',
  });
  return mvpStore.updateAgentEndpoint(endpointId, input);
});
ipcMain.handle('agent-endpoint:delete', async (_event, endpointId: string) => {
  policyService.assertAllowed('settings:update', {
    caller: 'ipc',
    action: 'agent-endpoint:delete',
  });
  return mvpStore.deleteAgentEndpoint(endpointId);
});

// Operator proposals
ipcMain.handle('agent:propose', async (_event, input: OperatorProposeInput) => agentOperator.propose(validateOperatorProposeInput(input)));

// Bootstrap Presets
ipcMain.handle('bootstrap-preset:list', async () => mvpStore.listBootstrapPresets());
ipcMain.handle('bootstrap-preset:get', async (_event, presetId: string) => mvpStore.getBootstrapPreset(presetId));
ipcMain.handle('bootstrap-preset:create', async (_event, input: CreateBootstrapPresetInput) => mvpStore.createBootstrapPreset(input));
ipcMain.handle('bootstrap-preset:update', async (_event, presetId: string, input: UpdateBootstrapPresetInput) => mvpStore.updateBootstrapPreset(presetId, input));
ipcMain.handle('bootstrap-preset:delete', async (_event, presetId: string) => mvpStore.deleteBootstrapPreset(presetId));

// Bootstrap Runs
ipcMain.handle('bootstrap-run:list', async () => mvpStore.listBootstrapRuns());
ipcMain.handle('bootstrap-run:get', async (_event, runId: string) => mvpStore.getBootstrapRun(runId));
ipcMain.handle('bootstrap-run:create', async (_event, input: CreateBootstrapRunInput) => mvpStore.createBootstrapRun(input));
ipcMain.handle('bootstrap-run:update', async (_event, runId: string, input: UpdateBootstrapRunInput) => mvpStore.updateBootstrapRun(runId, input));
ipcMain.handle('bootstrap-run:delete', async (_event, runId: string) => mvpStore.deleteBootstrapRun(runId));

// Command History
ipcMain.handle('command-history:list', async (_event, limit?: number) => mvpStore.listCommandHistory(limit));
ipcMain.handle('command-history:create', async (_event, input: CreateCommandHistoryInput) => mvpStore.createCommandHistoryEntry(input));
ipcMain.handle('command-history:delete', async (_event, entryId: string) => mvpStore.deleteCommandHistoryEntry(entryId));

// Read-only Host Operations
ipcMain.handle('host-operation:run', async (_event, input: HostOperationInput) => {
  const validatedInput = validateHostOperationInput(input);
  policyService.assertAllowed('host-operation:run', {
    caller: 'ipc',
    action: 'host-operation:run',
    hostId: validatedInput.hostId,
  });
  return hostOperations.run(validatedInput);
});

// Structured SSH command execution
ipcMain.handle('ssh:exec', async (_event, input: SshExecInput) => {
  const validatedInput = validateSshExecInput(input);
  policyService.assertAllowed('ssh:exec', {
    caller: 'ipc',
    action: 'ssh:exec',
    hostId: validatedInput.hostId,
  });
  return sshService.exec(validatedInput);
});

// Bootstrap generator
ipcMain.handle(
  'bootstrap:presets',
  async () => {
    return listBootstrapPresets();
  }
);

ipcMain.handle(
  'bootstrap:generate',
  async (_event, input: BootstrapGenerateInput) => {
    const validatedInput = validateBootstrapGenerateInput(input);
    const hostId = validatedInput.hostId ?? null;
    policyService.assertAllowed('bootstrap:generate', {
      caller: 'ipc',
      action: 'bootstrap:generate',
      hostId,
    });
    const host = hostId ? mvpStore.getHost(hostId) : null;
    const result = generateBootstrapScript(validatedInput, host);
    mvpStore.logAuditEvent({
      type: 'bootstrap.generated',
      entityType: host ? 'host' : 'bootstrap',
      entityId: host?.id ?? null,
      message: `Generated ${result.preset.name} bootstrap script${host ? ` for ${host.name}` : ''}.`,
      metadata: {
        presetId: result.preset.id,
        hostId: host?.id ?? null,
        installPackages: validatedInput.options?.installPackages ?? true,
        includeDockerCheck: validatedInput.options?.includeDockerCheck ?? false,
        executesRemotely: false,
      },
    });
    return result;
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
