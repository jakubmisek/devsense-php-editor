import { spawn, ChildProcess } from 'child_process';
import { Devsense } from 'devsense-php-ls';
import { EventEmitter } from 'events';
import { LspClient, JsonRpcMessage } from '../lsp/client';

export interface LsServerOptions {
  /** Extra initializationOptions merged into the LS `initialize` request. */
  initializationOptions?: Record<string, unknown>;
  cwd?: string;
  env?: Record<string, string>;
  logger?: (msg: string) => void;
}

export interface LsServerEvents {
  /** The LS process has spawned and the LspClient is ready. */
  started: () => void;
  /** The LS process exited. */
  exit: (code: number | null, signal: string | null) => void;
  /** An error occurred spawning or running the LS. */
  error: (err: Error) => void;
  /** Raw stderr output from the LS. */
  stderr: (text: string) => void;
}

/**
 * Manages a single devsense-php-ls language server process.
 *
 * Responsibilities:
 *   - Spawn the binary via `languageServerPath()`.
 *   - Expose an `LspClient` for JSON-RPC over stdio.
 *   - Report lifecycle events (started/exit/error).
 */
export class LsServer extends EventEmitter {
  private proc: ChildProcess | null = null;
  private client: LspClient | null = null;
  private readonly options: LsServerOptions;

  constructor(options: LsServerOptions = {}) {
    super();
    this.options = options;
  }

  /** Spawn the language server process and wire up the LspClient. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const lsPath = Devsense.PHP.LS.languageServerPath();
      if (!lsPath) {
        const err = new Error('devsense.php.ls binary not found. Install devsense-php-ls platform package.');
        console.error('[LsServer]', err.message);
        this.emit('error', err);
        reject(err);
        return;
      }

      console.log('[LsServer] Spawning language server:', lsPath);

      const child = spawn(lsPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
      });

      this.proc = child;

      child.on('error', (err: Error) => {
        console.error('[LsServer] Process error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      child.on('exit', (code: number | null, signal: string | null) => {
        console.log('[LsServer] Language server exited code=', code, 'signal=', signal);
        this.proc = null;
        this.client = null;
        this.emit('exit', code, signal);
      });

      this.client = new LspClient(child);
      this.client.on('error', (err: Error) => {
        console.error('[LsServer] LspClient error:', err.message);
        this.emit('error', err);
      });
      this.client.on('stderr', (text: string) => {
        console.log('[LsServer] LS stderr:', text.trim());
        this.emit('stderr', text);
      });
      this.client.on('message', (msg: JsonRpcMessage) => {
        console.log('[LsServer] <- LS message:', msg.method || msg.id || 'response');
      });
      this.client.on('exit', () => {
        console.log('[LsServer] LspClient exit');
        this.proc = null;
        this.client = null;
      });

      // The client is ready to frame once stdout is attached.
      console.log('[LsServer] Language server started');
      this.emit('started');
      resolve();
    });
  }

  /** The JSON-RPC client over stdio to the LS. */
  getClient(): LspClient | null {
    return this.client;
  }

  /** The underlying child process. */
  getProcess(): ChildProcess | null {
    return this.proc;
  }

  isRunning(): boolean {
    return this.proc !== null && !this.proc.killed;
  }

  /** Send `shutdown` then `exit` and terminate the process. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.proc) {
        console.log('[LsServer] No process to stop');
        resolve();
        return;
      }
      console.log('[LsServer] Stopping language server process...');
      const onExit = () => {
        console.log('[LsServer] Process stopped');
        this.proc = null;
        this.client = null;
        resolve();
      };
      this.proc.once('exit', onExit);
      try { this.proc.kill(); } catch { /* ignore */ }
      // Fallback resolve so stop() never hangs forever.
      setTimeout(() => {
        try { this.proc?.removeListener('exit', onExit); } catch { /* ignore */ }
        console.log('[LsServer] Stop timeout reached');
        resolve();
      }, 3000);
    });
  }

  /** Send a raw JSON-RPC message to the LS (for logging/tracing). */
  send(message: JsonRpcMessage): void {
    console.log('[LsServer] -> LS message:', message.method || message.id || 'response');
    this.client?.send(message);
  }
}
