import { spawn } from 'child_process';
import type {
  AuditEvent,
  CreateAuditEventInput,
  CreateCommandHistoryInput,
  HostOperationInput,
  HostOperationKind,
  HostOperationResult,
  HostRecord,
  SshExecInput,
  SshExecResult,
  SshExecStatus,
  SshFileEntry,
  SshFileListInput,
  SshFileListResult,
  SshFileStatInput,
  SshFileStatResult,
  SshFileTransferInput,
  SshFileTransferResult,
} from '../shared/mvp-models';

export interface SshCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface SshProviderExecInput {
  host: HostRecord;
  command: string;
  remoteCommand?: string;
  timeoutMs: number;
}

export interface SshProvider {
  readonly name: string;
  buildShellCommand(host: HostRecord): SshCommand;
  exec(input: SshProviderExecInput): Promise<SshExecResult>;
  listDir(input: SshProviderFileListInput): Promise<SshFileListResult>;
  stat(input: SshProviderFileStatInput): Promise<SshFileStatResult>;
  upload(input: SshProviderFileTransferInput): Promise<SshFileTransferResult>;
  download(input: SshProviderFileTransferInput): Promise<SshFileTransferResult>;
}

export interface SshProviderFileListInput {
  host: HostRecord;
  path: string;
  limit: number;
  timeoutMs: number;
}

export interface SshProviderFileStatInput {
  host: HostRecord;
  path: string;
  timeoutMs: number;
}

export interface SshProviderFileTransferInput {
  host: HostRecord;
  localPath: string;
  remotePath: string;
  timeoutMs: number;
}

type HostResolver = (hostId: string) => HostRecord | null;
type AuditLogger = (event: CreateAuditEventInput) => AuditEvent | Promise<AuditEvent>;
type CommandHistoryLogger = (input: CreateCommandHistoryInput) => unknown;

interface HostOperationCommand {
  kind: HostOperationKind;
  command: string;
  script: string;
  rows: (stdout: string) => HostOperationResult['rows'];
}

interface SshServiceExecOptions {
  timeoutMs?: number;
  remoteCommand?: string;
  persistHistory?: boolean;
}

const DEFAULT_EXEC_TIMEOUT_MS = 20000;
const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 250;
const HOST_OPERATION_KINDS: readonly HostOperationKind[] = ['files', 'processes', 'services', 'logs', 'metrics'];

export function buildSystemSshCommand(host: HostRecord): SshCommand {
  const address = host.address || host.hostname;
  const target = host.username ? `${host.username}@${address}` : address;
  const port = String(host.port);
  const keyPath = host.authMode === 'key' ? host.keyPath?.trim() : '';
  const keyArgs = keyPath
    ? ['-i', keyPath, '-o', 'IdentitiesOnly=yes']
    : [];

  return {
    command: 'ssh',
    args: [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'NumberOfPasswordPrompts=0',
      '-o',
      'ConnectTimeout=10',
      '-p',
      port,
      ...keyArgs,
      target,
    ],
    env: {
      ...process.env,
      TERM: process.env.TERM || 'xterm-256color',
    },
  };
}

export function buildSystemSshShellCommand(host: HostRecord): SshCommand {
  const base = buildSystemSshCommand(host);
  return {
    ...base,
    args: ['-tt', ...base.args],
  };
}

export function buildSystemScpCommand(host: HostRecord): SshCommand {
  const address = host.address || host.hostname;
  const port = String(host.port);
  const keyPath = host.authMode === 'key' ? host.keyPath?.trim() : '';
  const keyArgs = keyPath
    ? ['-i', keyPath, '-o', 'IdentitiesOnly=yes']
    : [];

  return {
    command: 'scp',
    args: [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'NumberOfPasswordPrompts=0',
      '-o',
      'ConnectTimeout=10',
      '-P',
      port,
      ...keyArgs,
    ],
    env: {
      ...process.env,
      TERM: process.env.TERM || 'xterm-256color',
    },
  };
}

export class SystemSshProvider implements SshProvider {
  readonly name = 'system-ssh';

  buildShellCommand(host: HostRecord): SshCommand {
    return buildSystemSshCommand(host);
  }

  async exec(input: SshProviderExecInput): Promise<SshExecResult> {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const sshCommand = this.buildShellCommand(input.host);
    const remoteCommand = `sh -lc ${shellQuote(input.remoteCommand ?? input.command)}`;
    const result = await runProcess(sshCommand.command, [...sshCommand.args, remoteCommand], sshCommand.env, input.timeoutMs);
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    const status: SshExecStatus = result.exitCode === 0 ? 'success' : 'failed';
    const error = status === 'success'
      ? null
      : result.error ?? `ssh exited with code ${result.exitCode ?? 'unknown'}`;

    return {
      hostId: input.host.id,
      command: input.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs,
      startedAt,
      completedAt,
      status,
      error,
    };
  }

  async listDir(input: SshProviderFileListInput): Promise<SshFileListResult> {
    const command = `listDir ${input.path}`;
    const script = [
      'set -eu',
      `target=${shellQuote(input.path)}`,
      'if [ ! -d "$target" ]; then',
      '  echo "target is not a directory: $target" >&2',
      '  exit 2',
      'fi',
      'if command -v find >/dev/null 2>&1; then',
      `  find "$target" -maxdepth 1 -mindepth 1 -printf '%f\\t%p\\t%y\\t%s\\t%TY-%Tm-%Td %TH:%TM:%TS\\t%m\\t%u\\t%g\\n' | sed -n '1,${input.limit}p'`,
      'else',
      `  LC_ALL=C ls -la -- "$target" | sed -n '1,${input.limit}p'`,
      'fi',
    ].join('\n');
    const execResult = await this.exec({
      host: input.host,
      command,
      remoteCommand: script,
      timeoutMs: input.timeoutMs,
    });
    return {
      ...fileListBase(input.host.id, input.path, command, execResult),
      entries: execResult.status === 'success'
        ? parseProviderFileEntries(execResult.stdout, input.path)
        : [],
    };
  }

  async stat(input: SshProviderFileStatInput): Promise<SshFileStatResult> {
    const command = `stat ${input.path}`;
    const script = [
      'set -eu',
      `target=${shellQuote(input.path)}`,
      'if command -v stat >/dev/null 2>&1; then',
      '  type="$(stat -c %F -- "$target" 2>/dev/null || stat -f %HT -- "$target")"',
      '  size="$(stat -c %s -- "$target" 2>/dev/null || stat -f %z -- "$target")"',
      '  modified="$(stat -c %y -- "$target" 2>/dev/null || stat -f %Sm -- "$target")"',
      '  permissions="$(stat -c %A -- "$target" 2>/dev/null || stat -f %Sp -- "$target")"',
      '  owner="$(stat -c %U -- "$target" 2>/dev/null || stat -f %Su -- "$target")"',
      '  group="$(stat -c %G -- "$target" 2>/dev/null || stat -f %Sg -- "$target")"',
      '  printf "name=%s\\npath=%s\\ntype=%s\\nsize=%s\\nmodified=%s\\npermissions=%s\\nowner=%s\\ngroup=%s\\n" "$(basename -- "$target")" "$target" "$type" "$size" "$modified" "$permissions" "$owner" "$group"',
      'else',
      '  LC_ALL=C ls -ld -- "$target"',
      'fi',
    ].join('\n');
    const execResult = await this.exec({
      host: input.host,
      command,
      remoteCommand: script,
      timeoutMs: input.timeoutMs,
    });
    return {
      ...fileStatBase(input.host.id, input.path, command, execResult),
      entry: execResult.status === 'success'
        ? parseProviderFileStat(execResult.stdout, input.path)
        : null,
    };
  }

  async upload(input: SshProviderFileTransferInput): Promise<SshFileTransferResult> {
    return this.runScpTransfer(input, 'upload');
  }

  async download(input: SshProviderFileTransferInput): Promise<SshFileTransferResult> {
    return this.runScpTransfer(input, 'download');
  }

  private async runScpTransfer(
    input: SshProviderFileTransferInput,
    direction: 'upload' | 'download',
  ): Promise<SshFileTransferResult> {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const scp = buildSystemScpCommand(input.host);
    const remoteTarget = remoteScpTarget(input.host, input.remotePath);
    const args = direction === 'upload'
      ? [...scp.args, input.localPath, remoteTarget]
      : [...scp.args, remoteTarget, input.localPath];
    const result = await runProcess(scp.command, args, scp.env, input.timeoutMs);
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - started;
    const status: SshExecStatus = result.exitCode === 0 ? 'success' : 'failed';
    return {
      hostId: input.host.id,
      localPath: input.localPath,
      remotePath: input.remotePath,
      command: direction === 'upload' ? 'scp upload' : 'scp download',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs,
      startedAt,
      completedAt,
      status,
      error: status === 'success'
        ? null
        : result.error ?? `scp exited with code ${result.exitCode ?? 'unknown'}`,
      direction,
    };
  }
}

export class SshService {
  constructor(
    private readonly resolveHost: HostResolver,
    private readonly logAuditEvent: AuditLogger,
    private readonly logCommandHistory: CommandHistoryLogger | null = null,
    private readonly provider: SshProvider = new SystemSshProvider(),
  ) {}

  buildShellCommand(host: HostRecord): SshCommand {
    return this.provider.buildShellCommand(host);
  }

  async exec(input: SshExecInput, options: SshServiceExecOptions = {}): Promise<SshExecResult> {
    const host = this.resolveHost(input.hostId);
    if (!host) {
      const result = this.failureResult(input.hostId, input.command, 'Host record was not found.');
      void this.auditExec(result, 'host_not_found');
      return result;
    }

    const command = input.command.trim();
    if (!command) {
      const result = this.failureResult(host.id, input.command, 'SSH command is required.');
      void this.auditExec(result, 'invalid_command');
      return result;
    }

    try {
      const result = await this.provider.exec({
        host,
        command,
        remoteCommand: options.remoteCommand,
        timeoutMs: normalizeTimeout(options.timeoutMs ?? input.timeoutMs),
      });
      if (options.persistHistory && this.logCommandHistory) {
        this.logCommandHistory({
          hostId: host.id,
          command,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
        });
      }
      void this.auditExec(result, null);
      return result;
    } catch (error) {
      const result = this.failureResult(
        host.id,
        command,
        error instanceof Error ? error.message : 'SSH provider execution failed.',
      );
      void this.auditExec(result, 'provider_error');
      return result;
    }
  }

  async runHostOperation(input: HostOperationInput): Promise<HostOperationResult> {
    const operation = buildHostOperation(input);
    if (!operation) {
      return this.unsupportedOperation(input);
    }

    const result = await this.exec(
      {
        hostId: input.hostId,
        command: operation.command,
        timeoutMs: DEFAULT_EXEC_TIMEOUT_MS,
      },
      {
        remoteCommand: operation.script,
        persistHistory: true,
      },
    );
    const rows = result.status === 'success' ? operation.rows(result.stdout) : [];
    const summary = result.status === 'success'
      ? `${rows.length} ${operation.kind} row(s) returned.`
      : `${operation.kind} inspection failed: ${result.error ?? `exit code ${result.exitCode ?? 'unknown'}`}.`;

    void this.auditHostOperation(input, result, operation.kind);

    return {
      hostId: result.hostId,
      kind: operation.kind,
      command: operation.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      status: result.status,
      error: result.error,
      summary,
      rows,
    };
  }

  async listDir(input: SshFileListInput): Promise<SshFileListResult> {
    const host = this.resolveHost(input.hostId);
    const path = input.path?.trim() || '.';
    if (!host) {
      const result = this.fileListFailure(input.hostId, path, 'Host record was not found.');
      void this.auditFileRead('ssh.file_list_failed', result, path);
      return result;
    }
    try {
      const result = await this.provider.listDir({
        host,
        path,
        limit: normalizeLimit(input.limit),
        timeoutMs: normalizeTimeout(input.timeoutMs),
      });
      void this.auditFileRead(result.status === 'success' ? 'ssh.file_list_succeeded' : 'ssh.file_list_failed', result, path);
      return result;
    } catch (error) {
      const result = this.fileListFailure(host.id, path, error instanceof Error ? error.message : 'SSH file list failed.');
      void this.auditFileRead('ssh.file_list_failed', result, path);
      return result;
    }
  }

  async stat(input: SshFileStatInput): Promise<SshFileStatResult> {
    const host = this.resolveHost(input.hostId);
    const path = input.path.trim();
    if (!host) {
      const result = this.fileStatFailure(input.hostId, path, 'Host record was not found.');
      void this.auditFileRead('ssh.file_stat_failed', result, path);
      return result;
    }
    try {
      const result = await this.provider.stat({
        host,
        path,
        timeoutMs: normalizeTimeout(input.timeoutMs),
      });
      void this.auditFileRead(result.status === 'success' ? 'ssh.file_stat_succeeded' : 'ssh.file_stat_failed', result, path);
      return result;
    } catch (error) {
      const result = this.fileStatFailure(host.id, path, error instanceof Error ? error.message : 'SSH file stat failed.');
      void this.auditFileRead('ssh.file_stat_failed', result, path);
      return result;
    }
  }

  async upload(input: SshFileTransferInput): Promise<SshFileTransferResult> {
    return this.transfer(input, 'upload');
  }

  async download(input: SshFileTransferInput): Promise<SshFileTransferResult> {
    return this.transfer(input, 'download');
  }

  listFiles(input: Omit<HostOperationInput, 'kind'>): Promise<HostOperationResult> {
    return this.runHostOperation({ ...input, kind: 'files' });
  }

  listProcesses(input: Omit<HostOperationInput, 'kind'>): Promise<HostOperationResult> {
    return this.runHostOperation({ ...input, kind: 'processes' });
  }

  listServices(input: Omit<HostOperationInput, 'kind'>): Promise<HostOperationResult> {
    return this.runHostOperation({ ...input, kind: 'services' });
  }

  readLogs(input: Omit<HostOperationInput, 'kind'>): Promise<HostOperationResult> {
    return this.runHostOperation({ ...input, kind: 'logs' });
  }

  readMetrics(input: Omit<HostOperationInput, 'kind'>): Promise<HostOperationResult> {
    return this.runHostOperation({ ...input, kind: 'metrics' });
  }

  private failureResult(hostId: string, command: string, error: string): SshExecResult {
    const now = new Date().toISOString();
    return {
      hostId,
      command,
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      status: 'failed',
      error,
    };
  }

  private fileListFailure(hostId: string, path: string, error: string): SshFileListResult {
    const now = new Date().toISOString();
    return {
      hostId,
      path,
      command: `listDir ${path}`,
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      status: 'failed',
      error,
      entries: [],
    };
  }

  private fileStatFailure(hostId: string, path: string, error: string): SshFileStatResult {
    const now = new Date().toISOString();
    return {
      hostId,
      path,
      command: `stat ${path}`,
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      status: 'failed',
      error,
      entry: null,
    };
  }

  private transferFailure(
    hostId: string,
    input: SshFileTransferInput,
    direction: 'upload' | 'download',
    error: string,
  ): SshFileTransferResult {
    const now = new Date().toISOString();
    return {
      hostId,
      localPath: input.localPath,
      remotePath: input.remotePath,
      command: direction === 'upload' ? 'scp upload' : 'scp download',
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      status: 'failed',
      error,
      direction,
    };
  }

  private async transfer(
    input: SshFileTransferInput,
    direction: 'upload' | 'download',
  ): Promise<SshFileTransferResult> {
    const host = this.resolveHost(input.hostId);
    if (!host) {
      const result = this.transferFailure(input.hostId, input, direction, 'Host record was not found.');
      void this.auditFileTransfer(result);
      return result;
    }
    try {
      const result = direction === 'upload'
        ? await this.provider.upload({
          host,
          localPath: input.localPath,
          remotePath: input.remotePath,
          timeoutMs: normalizeTimeout(input.timeoutMs),
        })
        : await this.provider.download({
          host,
          localPath: input.localPath,
          remotePath: input.remotePath,
          timeoutMs: normalizeTimeout(input.timeoutMs),
        });
      void this.auditFileTransfer(result);
      return result;
    } catch (error) {
      const result = this.transferFailure(
        host.id,
        input,
        direction,
        error instanceof Error ? error.message : `SSH file ${direction} failed.`,
      );
      void this.auditFileTransfer(result);
      return result;
    }
  }

  private unsupportedOperation(input: HostOperationInput): HostOperationResult {
    const now = new Date().toISOString();
    const kind = String(input.kind) as HostOperationKind;
    const message = `Host operation is not supported by the SSH service: ${kind}.`;
    const result: HostOperationResult = {
      hostId: input.hostId,
      kind,
      command: kind,
      stdout: '',
      stderr: '',
      exitCode: null,
      durationMs: 0,
      startedAt: now,
      completedAt: now,
      status: 'unsupported',
      error: message,
      summary: message,
      rows: [],
    };
    void this.logAuditEvent({
      type: 'ssh.operation_unsupported',
      entityType: 'host',
      entityId: input.hostId,
      message,
      metadata: {
        hostId: input.hostId,
        kind,
        secretsLogged: false,
      },
    });
    return result;
  }

  private async auditExec(result: SshExecResult, reason: string | null): Promise<void> {
    try {
      await this.logAuditEvent({
        type: result.status === 'success' ? 'ssh.exec_succeeded' : 'ssh.exec_failed',
        entityType: 'host',
        entityId: result.hostId,
        message: result.status === 'success'
          ? 'SSH command execution completed.'
          : 'SSH command execution failed.',
        metadata: {
          hostId: result.hostId,
          commandPreview: safeCommandPreview(result.command),
          commandLength: result.command.length,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          status: result.status,
          error: result.error,
          reason,
          backend: this.provider.name,
          batchMode: true,
          secretsLogged: false,
        },
      });
    } catch (error) {
      console.error('Unable to write SSH exec audit event.', error);
    }
  }

  private async auditHostOperation(input: HostOperationInput, result: SshExecResult, kind: HostOperationKind): Promise<void> {
    try {
      await this.logAuditEvent({
        type: `host.${kind}.inspected`,
        entityType: 'host',
        entityId: result.hostId,
        message: `Read-only ${kind} inspection ${result.status} for host ${result.hostId}.`,
        metadata: {
          hostId: result.hostId,
          kind,
          commandPreview: safeCommandPreview(result.command),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          status: result.status,
          error: result.error,
          path: input.path ?? null,
          filter: input.filter ?? null,
          backend: this.provider.name,
          batchMode: true,
          secretsLogged: false,
        },
      });
    } catch (error) {
      console.error('Unable to write host operation audit event.', error);
    }
  }

  private async auditFileRead(
    type: string,
    result: SshFileListResult | SshFileStatResult,
    path: string,
  ): Promise<void> {
    try {
      await this.logAuditEvent({
        type,
        entityType: 'host',
        entityId: result.hostId,
        message: `SSH file read operation ${result.status} for host ${result.hostId}.`,
        metadata: {
          hostId: result.hostId,
          path,
          commandPreview: safeCommandPreview(result.command),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          status: result.status,
          error: result.error,
          backend: this.provider.name,
          secretsLogged: false,
        },
      });
    } catch (error) {
      console.error('Unable to write SSH file read audit event.', error);
    }
  }

  private async auditFileTransfer(result: SshFileTransferResult): Promise<void> {
    try {
      await this.logAuditEvent({
        type: result.status === 'success'
          ? `ssh.file_${result.direction}_succeeded`
          : `ssh.file_${result.direction}_failed`,
        entityType: 'host',
        entityId: result.hostId,
        message: `SSH file ${result.direction} ${result.status} for host ${result.hostId}.`,
        metadata: {
          hostId: result.hostId,
          direction: result.direction,
          localPath: result.localPath,
          remotePath: result.remotePath,
          commandPreview: safeCommandPreview(result.command),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          status: result.status,
          error: result.error,
          backend: this.provider.name,
          secretsLogged: false,
        },
      });
    } catch (error) {
      console.error('Unable to write SSH file transfer audit event.', error);
    }
  }
}

function buildHostOperation(input: HostOperationInput): HostOperationCommand | null {
  if (!HOST_OPERATION_KINDS.includes(input.kind)) {
    return null;
  }

  const kind = input.kind;
  const limit = normalizeLimit(input.limit);
  if (kind === 'files') {
    const path = input.path?.trim() || '.';
    const script = [
      'set -eu',
      `target=${shellQuote(path)}`,
      'if [ -d "$target" ]; then',
      `  LC_ALL=C ls -la -- "$target" | sed -n '1,${limit}p'`,
      'else',
      '  LC_ALL=C ls -ld -- "$target"',
      'fi',
    ].join('\n');
    return {
      kind,
      command: `ls -la -- ${shellQuote(path)}`,
      script,
      rows: parseFileRows,
    };
  }

  if (kind === 'processes') {
    const script = [
      'set -eu',
      `ps -eo pid,ppid,user,stat,pcpu,pmem,comm --sort=-pcpu | sed -n '1,${limit}p'`,
    ].join('\n');
    return {
      kind,
      command: 'ps -eo pid,ppid,user,stat,pcpu,pmem,comm --sort=-pcpu',
      script,
      rows: parseProcessRows,
    };
  }

  if (kind === 'services') {
    const script = [
      'set -eu',
      'if command -v systemctl >/dev/null 2>&1; then',
      `  systemctl list-units --type=service --all --no-pager | sed -n '1,${limit}p'`,
      'elif command -v service >/dev/null 2>&1; then',
      `  service --status-all 2>&1 | sed -n '1,${limit}p'`,
      'else',
      `  ps -eo pid,comm,args | sed -n '1,${limit}p'`,
      'fi',
    ].join('\n');
    return {
      kind,
      command: 'systemctl list-units --type=service --all --no-pager',
      script,
      rows: parseServiceRows,
    };
  }

  if (kind === 'logs') {
    const script = [
      'set -eu',
      'if command -v journalctl >/dev/null 2>&1; then',
      `  journalctl -n ${limit} --no-pager`,
      'elif [ -r /var/log/syslog ]; then',
      `  tail -n ${limit} /var/log/syslog`,
      'elif [ -r /var/log/messages ]; then',
      `  tail -n ${limit} /var/log/messages`,
      'else',
      `  dmesg | tail -n ${limit}`,
      'fi',
    ].join('\n');
    return {
      kind,
      command: `journalctl -n ${limit} --no-pager`,
      script,
      rows: parseLogRows,
    };
  }

  const script = [
    'set -eu',
    'os="$(uname -srmo 2>/dev/null || uname -a 2>/dev/null || printf unknown)"',
    'if [ -r /etc/os-release ]; then',
    '  pretty="$(awk -F= \'/^PRETTY_NAME=/ {gsub(/"/, "", $2); print $2; exit}\' /etc/os-release 2>/dev/null || true)"',
    '  if [ -n "$pretty" ]; then os="$pretty ($os)"; fi',
    'fi',
    'uptime_text="$(uptime -p 2>/dev/null || uptime 2>/dev/null || printf unknown)"',
    'if command -v free >/dev/null 2>&1; then',
    '  memory="$(free -m | awk \'/^Mem:/ {printf "%s/%s MB used", $3, $2}\' 2>/dev/null || true)"',
    'elif command -v vm_stat >/dev/null 2>&1; then',
    '  memory="$(vm_stat 2>/dev/null | awk \'/Pages free/ {free=$3} /Pages active/ {active=$3} /Pages inactive/ {inactive=$3} END {gsub(/\\./, "", free); gsub(/\\./, "", active); gsub(/\\./, "", inactive); printf "vm_stat free=%s active=%s inactive=%s pages", free, active, inactive}\' || true)"',
    'else',
    '  memory="unknown"',
    'fi',
    'if command -v df >/dev/null 2>&1; then',
    '  disk="$(df -h / 2>/dev/null | awk \'NR==2 {printf "%s used of %s (%s)", $3, $2, $5}\' || true)"',
    'else',
    '  disk="unknown"',
    'fi',
    'printf "os=%s\\n" "${os:-unknown}"',
    'printf "uptime=%s\\n" "${uptime_text:-unknown}"',
    'printf "memory=%s\\n" "${memory:-unknown}"',
    'printf "disk=%s\\n" "${disk:-unknown}"',
  ].join('\n');
  return {
    kind,
    command: 'collect host metrics: os, uptime, memory, disk',
    script,
    rows: parseMetricRows,
  };
}

function runProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv | undefined,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; error: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: 'pipe' });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (!settled) {
        child.kill('SIGTERM');
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.once('error', (error) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: `${Buffer.concat(stderrChunks).toString('utf8')}${error.message}\n`,
        exitCode: 127,
        error: error.message,
      });
    });
    child.once('exit', (code) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: timedOut ? null : code,
        error: timedOut ? `SSH command timed out after ${timeoutMs} ms.` : null,
      });
    });
  });
}

function fileListBase(
  hostId: string,
  path: string,
  command: string,
  result: SshExecResult,
): Omit<SshFileListResult, 'entries'> {
  return {
    hostId,
    path,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    status: result.status,
    error: result.error,
  };
}

function fileStatBase(
  hostId: string,
  path: string,
  command: string,
  result: SshExecResult,
): Omit<SshFileStatResult, 'entry'> {
  return {
    hostId,
    path,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    status: result.status,
    error: result.error,
  };
}

function remoteScpTarget(host: HostRecord, remotePath: string): string {
  const address = host.address || host.hostname;
  const target = host.username ? `${host.username}@${address}` : address;
  return `${target}:${shellQuote(remotePath)}`;
}

function parseProviderFileEntries(stdout: string, parentPath: string): SshFileEntry[] {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 0 && lines[0].includes('\t')) {
    return lines.map((line) => {
      const [name = '', path = '', rawType = '', rawSize = '', modified = '', mode = '', owner = '', group = ''] = line.split('\t');
      return {
        name,
        path: path || joinRemotePath(parentPath, name),
        type: fileTypeFromFind(rawType),
        size: Number.isFinite(Number(rawSize)) ? Number(rawSize) : null,
        modified: modified || null,
        permissions: mode ? `0${mode}` : '',
        owner,
        group,
      };
    });
  }
  return parseLsRows(stdout, parentPath);
}

function parseProviderFileStat(stdout: string, path: string): SshFileEntry | null {
  const fields = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)=(.*)$/);
    if (match) {
      fields.set(match[1], match[2].trim());
    }
  }
  if (fields.size > 0) {
    return {
      name: fields.get('name') || basenameRemotePath(path),
      path: fields.get('path') || path,
      type: fileTypeFromStat(fields.get('type') || ''),
      size: Number.isFinite(Number(fields.get('size'))) ? Number(fields.get('size')) : null,
      modified: fields.get('modified') || null,
      permissions: fields.get('permissions') || '',
      owner: fields.get('owner') || '',
      group: fields.get('group') || '',
    };
  }
  return parseLsRows(stdout, parentRemotePath(path))[0] ?? null;
}

function parseLsRows(stdout: string, parentPath: string): SshFileEntry[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('total '))
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const permissions = parts[0] ?? '';
      const name = parts.slice(8).join(' ');
      return {
        name,
        path: joinRemotePath(parentPath, name),
        type: fileTypeFromPermissions(permissions),
        size: Number.isFinite(Number(parts[4])) ? Number(parts[4]) : null,
        modified: parts.slice(5, 8).join(' ') || null,
        permissions,
        owner: parts[2] ?? '',
        group: parts[3] ?? '',
      };
    });
}

function fileTypeFromFind(value: string): SshFileEntry['type'] {
  if (value === 'f') return 'file';
  if (value === 'd') return 'directory';
  if (value === 'l') return 'symlink';
  if (value) return 'other';
  return 'unknown';
}

function fileTypeFromStat(value: string): SshFileEntry['type'] {
  const lower = value.toLowerCase();
  if (lower.includes('directory')) return 'directory';
  if (lower.includes('symbolic link') || lower.includes('symlink')) return 'symlink';
  if (lower.includes('regular file') || lower === 'file') return 'file';
  if (lower) return 'other';
  return 'unknown';
}

function fileTypeFromPermissions(value: string): SshFileEntry['type'] {
  if (value.startsWith('d')) return 'directory';
  if (value.startsWith('l')) return 'symlink';
  if (value.startsWith('-')) return 'file';
  if (value) return 'other';
  return 'unknown';
}

function joinRemotePath(parentPath: string, name: string): string {
  if (!name) return parentPath;
  if (parentPath === '/' || !parentPath) return `/${name}`.replace(/^\/+/, '/');
  return `${parentPath.replace(/\/+$/, '')}/${name}`;
}

function basenameRemotePath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function parentRemotePath(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '/';
  return normalized.slice(0, index);
}

function parseFileRows(stdout: string): HostOperationResult['rows'] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('total '))
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        permissions: parts[0] ?? '',
        owner: parts[2] ?? '',
        group: parts[3] ?? '',
        size: Number(parts[4]) || 0,
        modified: parts.slice(5, 8).join(' '),
        name: parts.slice(8).join(' '),
        directory: (parts[0] ?? '').startsWith('d'),
      };
    });
}

function parseProcessRows(stdout: string): HostOperationResult['rows'] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('PID '))
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: Number(parts[0]) || null,
        ppid: Number(parts[1]) || null,
        user: parts[2] ?? '',
        state: parts[3] ?? '',
        cpu: Number(parts[4]) || 0,
        memory: Number(parts[5]) || 0,
        command: parts.slice(6).join(' '),
      };
    });
}

function parseServiceRows(stdout: string): HostOperationResult['rows'] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.includes('LOAD   ACTIVE SUB'))
    .map((line) => {
      const parts = line.trim().replace(/^●\s*/, '').split(/\s+/);
      return {
        service: parts[0] ?? '',
        load: parts[1] ?? '',
        active: parts[2] ?? '',
        sub: parts[3] ?? '',
        description: parts.slice(4).join(' '),
      };
    });
}

function parseLogRows(stdout: string): HostOperationResult['rows'] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => ({
      index: index + 1,
      line,
    }));
}

function parseMetricRows(stdout: string): HostOperationResult['rows'] {
  const fields = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)=(.*)$/);
    if (match) {
      fields.set(match[1], match[2].trim());
    }
  }
  return [{
    os: fields.get('os') || 'unknown',
    uptime: fields.get('uptime') || 'unknown',
    memory: fields.get('memory') || 'unknown',
    disk: fields.get('disk') || 'unknown',
  }];
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value ?? DEFAULT_LIMIT)));
}

function normalizeTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EXEC_TIMEOUT_MS;
  }
  return Math.max(1000, Math.min(120000, Math.floor(value ?? DEFAULT_EXEC_TIMEOUT_MS)));
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function safeCommandPreview(command: string): string {
  const redacted = command
    .replace(/((?:password|passphrase|token|secret|api[_-]?key)\s*=\s*)\S+/gi, '$1[redacted]')
    .replace(/(--(?:password|passphrase|token|secret|api-key)(?:=|\s+))\S+/gi, '$1[redacted]');
  return redacted.length > 160 ? `${redacted.slice(0, 157)}...` : redacted;
}
