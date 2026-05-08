import { randomUUID } from 'crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import type {
  AuditEvent,
  CreateAuditEventInput,
  HostRecord,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalResizeResult,
  TerminalStartResult,
  TerminalStatusEvent,
  TerminalStopResult,
  TerminalWriteResult,
} from '../shared/mvp-models';

interface TerminalCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

type TerminalEvent =
  | { channel: 'terminal:output'; payload: TerminalOutputEvent }
  | { channel: 'terminal:status'; payload: TerminalStatusEvent }
  | { channel: 'terminal:exit'; payload: TerminalExitEvent };

export type TerminalEventSender = (event: TerminalEvent) => void;
export type TerminalAuditLogger = (event: CreateAuditEventInput) => AuditEvent | Promise<AuditEvent>;
export type TerminalHostResolver = (hostId: string) => HostRecord | null;
export type TerminalCommandBuilder = (host: HostRecord) => TerminalCommand;

interface TerminalSession {
  id: string;
  host: HostRecord;
  process: ChildProcessWithoutNullStreams;
  stopRequested: boolean;
  killTimer: NodeJS.Timeout | null;
  cols: number;
  rows: number;
}

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
const FORCE_KILL_DELAY_MS = 2000;

export function buildSshCommand(host: HostRecord): TerminalCommand {
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

export class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    private readonly resolveHost: TerminalHostResolver,
    private readonly sendEvent: TerminalEventSender,
    private readonly logAuditEvent: TerminalAuditLogger,
    private readonly buildCommand: TerminalCommandBuilder = buildSshCommand,
  ) {}

  start(hostId: string): TerminalStartResult {
    const host = this.resolveHost(hostId);
    if (!host) {
      const message = 'Host record was not found. Terminal session was not started.';
      void this.audit({
        type: 'terminal.session_failed',
        entityType: 'host',
        entityId: hostId,
        message,
        metadata: { hostId, reason: 'host_not_found' },
      });
      return { sessionId: null, status: 'failed', message, hostId };
    }

    const validationError = this.validateHost(host);
    if (validationError) {
      void this.audit({
        type: 'terminal.session_failed',
        entityType: 'host',
        entityId: host.id,
        message: validationError,
        metadata: { hostId: host.id, reason: 'invalid_host' },
      });
      return {
        sessionId: null,
        status: 'failed',
        message: validationError,
        hostId,
      };
    }

    const sessionId = randomUUID();
    let command: TerminalCommand;
    try {
      command = this.buildCommand(host);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to build terminal command.';
      void this.audit({
        type: 'terminal.session_failed',
        entityType: 'host',
        entityId: host.id,
        message,
        metadata: { hostId: host.id, sessionId, reason: 'command_build_failed' },
      });
      return { sessionId: null, status: 'failed', message, hostId };
    }

    try {
      const child = spawn(command.command, command.args, {
        env: command.env,
        stdio: 'pipe',
      });
      const session: TerminalSession = {
        id: sessionId,
        host,
        process: child,
        stopRequested: false,
        killTimer: null,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
      };

      this.sessions.set(sessionId, session);
      this.attachProcessHandlers(session);
      this.emitStatus(session, 'starting', `Starting SSH session for ${host.name}.`);
      this.emitOutput(session, 'system', this.buildStartNotice(host));
      void this.audit({
        type: 'terminal.session_started',
        entityType: 'host',
        entityId: host.id,
        message: `Terminal session ${sessionId} started for ${host.name}.`,
        metadata: {
          hostId: host.id,
          sessionId,
          address: host.address || host.hostname,
          port: host.port,
          username: host.username || null,
          backend: 'ssh-spawn',
          batchMode: true,
        },
      });

      return {
        sessionId,
        status: 'started',
        message: 'Terminal session started. SSH uses BatchMode and existing local keys/agent only.',
        hostId,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to start terminal session.';
      void this.audit({
        type: 'terminal.session_failed',
        entityType: 'host',
        entityId: host.id,
        message,
        metadata: { hostId: host.id, sessionId, reason: 'spawn_failed' },
      });
      return { sessionId: null, status: 'failed', message, hostId };
    }
  }

  write(sessionId: string, input: string): TerminalWriteResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        success: false,
        message: 'Terminal session is not active.',
      };
    }

    if (!session.process.stdin.writable) {
      return {
        sessionId,
        success: false,
        message: 'Terminal input stream is closed.',
      };
    }

    session.process.stdin.write(input);
    return {
      sessionId,
      success: true,
      message: 'Input written to terminal session.',
    };
  }

  resize(sessionId: string, cols: number, rows: number): TerminalResizeResult {
    const session = this.sessions.get(sessionId);
    const normalizedCols = Number.isFinite(cols) ? Math.max(1, Math.floor(cols)) : DEFAULT_COLS;
    const normalizedRows = Number.isFinite(rows) ? Math.max(1, Math.floor(rows)) : DEFAULT_ROWS;

    if (session) {
      session.cols = normalizedCols;
      session.rows = normalizedRows;
      this.emitStatus(
        session,
        'active',
        'Resize recorded, but SSH pipe backend does not support terminal resize propagation.'
      );
    }

    return {
      sessionId,
      success: false,
      message: 'Resize is not supported by the SSH pipe backend in this MVP slice.',
      cols: normalizedCols,
      rows: normalizedRows,
    };
  }

  stop(sessionId: string): TerminalStopResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        success: false,
        message: 'Terminal session is not active.',
      };
    }

    session.stopRequested = true;
    this.emitStatus(session, 'stopped', `Stopping terminal session ${sessionId}.`);
    void this.audit({
      type: 'terminal.session_stopped',
      entityType: 'host',
      entityId: session.host.id,
      message: `Terminal session ${sessionId} stop requested for ${session.host.name}.`,
      metadata: {
        hostId: session.host.id,
        sessionId,
        backend: 'ssh-spawn',
      },
    });

    if (!session.process.killed) {
      session.process.kill('SIGTERM');
      session.killTimer = setTimeout(() => {
        if (!session.process.killed) {
          session.process.kill('SIGKILL');
        }
      }, FORCE_KILL_DELAY_MS);
    }

    return {
      sessionId,
      success: true,
      message: 'Terminal session stop requested.',
    };
  }

  stopAll(reason: string): void {
    for (const sessionId of this.sessions.keys()) {
      const result = this.stop(sessionId);
      if (result.success) {
        const session = this.sessions.get(sessionId);
        if (session) {
          this.emitOutput(session, 'system', `${reason}\n`);
        }
      }
    }
  }

  private attachProcessHandlers(session: TerminalSession): void {
    session.process.once('spawn', () => {
      this.emitStatus(session, 'active', `SSH process started for ${session.host.name}.`);
    });

    session.process.stdout.on('data', (chunk: Buffer) => {
      this.emitOutput(session, 'stdout', chunk.toString('utf8'));
    });

    session.process.stderr.on('data', (chunk: Buffer) => {
      this.emitOutput(session, 'stderr', chunk.toString('utf8'));
    });

    session.process.once('error', (error: NodeJS.ErrnoException) => {
      const message = error.message || 'Terminal process failed to start.';
      this.emitExit(session, 'failed', null, null, message);
      void this.audit({
        type: 'terminal.session_failed',
        entityType: 'host',
        entityId: session.host.id,
        message,
        metadata: {
          hostId: session.host.id,
          sessionId: session.id,
          errorCode: error.code ?? null,
          backend: 'ssh-spawn',
        },
      });
      this.cleanupSession(session);
    });

    session.process.once('exit', (code, signal) => {
      if (!this.sessions.has(session.id)) {
        return;
      }

      const status = session.stopRequested ? 'stopped' : code === 0 ? 'exited' : 'failed';
      const message = this.buildExitMessage(session, code, signal, status);
      this.emitExit(session, status, code, signal, message);
      void this.audit({
        type: 'terminal.session_exited',
        entityType: 'host',
        entityId: session.host.id,
        message,
        metadata: {
          hostId: session.host.id,
          sessionId: session.id,
          exitCode: code,
          signal,
          backend: 'ssh-spawn',
        },
      });
      this.cleanupSession(session);
    });
  }

  private validateHost(host: HostRecord): string | null {
    const address = host.address || host.hostname;
    if (!address) {
      return 'Host has no address or hostname. Terminal session was not started.';
    }

    if (!Number.isInteger(host.port) || host.port < 1 || host.port > 65535) {
      return `Host port ${host.port} is invalid. Terminal session was not started.`;
    }

    return null;
  }

  private buildStartNotice(host: HostRecord): string {
    const target = `${host.username ? `${host.username}@` : ''}${host.address || host.hostname}:${host.port}`;
    return [
      `Starting ssh session to ${target}`,
      'MVP terminal uses system ssh with BatchMode=yes.',
      'Password prompts, stored secrets, and keychain integration are not handled by this slice.',
      '',
    ].join('\n');
  }

  private buildExitMessage(
    session: TerminalSession,
    code: number | null,
    signal: NodeJS.Signals | null,
    status: TerminalExitEvent['status'],
  ): string {
    if (status === 'stopped') {
      return `Terminal session ${session.id} stopped for ${session.host.name}.`;
    }

    if (code === 0) {
      return `Terminal session ${session.id} exited for ${session.host.name}.`;
    }

    const suffix = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
    return `Terminal session ${session.id} ended for ${session.host.name} with ${suffix}.`;
  }

  private emitOutput(
    session: TerminalSession,
    stream: TerminalOutputEvent['stream'],
    data: string,
  ): void {
    this.sendEvent({
      channel: 'terminal:output',
      payload: {
        sessionId: session.id,
        hostId: session.host.id,
        stream,
        data,
        createdAt: new Date().toISOString(),
      },
    });
  }

  private emitStatus(
    session: TerminalSession,
    status: TerminalStatusEvent['status'],
    message: string,
  ): void {
    this.sendEvent({
      channel: 'terminal:status',
      payload: {
        sessionId: session.id,
        hostId: session.host.id,
        status,
        message,
        createdAt: new Date().toISOString(),
      },
    });
  }

  private emitExit(
    session: TerminalSession,
    status: TerminalExitEvent['status'],
    exitCode: number | null,
    signal: NodeJS.Signals | null,
    message: string,
  ): void {
    this.sendEvent({
      channel: 'terminal:exit',
      payload: {
        sessionId: session.id,
        hostId: session.host.id,
        status,
        exitCode,
        signal,
        message,
        createdAt: new Date().toISOString(),
      },
    });
  }

  private cleanupSession(session: TerminalSession): void {
    if (session.killTimer) {
      clearTimeout(session.killTimer);
      session.killTimer = null;
    }

    this.sessions.delete(session.id);
    session.process.removeAllListeners();
    session.process.stdout.removeAllListeners();
    session.process.stderr.removeAllListeners();
  }

  private async audit(input: CreateAuditEventInput): Promise<void> {
    try {
      await this.logAuditEvent(input);
    } catch {
      // Terminal session lifecycle must not fail because audit persistence failed.
    }
  }
}
