import { Devsense } from 'devsense-php-ls';
import { spawn, ChildProcess } from 'child_process';
import { LsServer } from './server/LsServer';
import { WsServer } from './server/WsServer';
import { Router } from './server/Router';
import { VirtualWorkspace } from './workspace/VirtualWorkspace';
import { resolveLicense, buildInitializationOptions } from './server/license';

export interface PhpEditorOptions {
  /** WebSocket port (0 = random available port). Default 8765. */
  port?: number;
  /** Host to bind the WebSocket server to. Default '127.0.0.1'. */
  host?: string;
  /**
   * devsense-php-ls licence unlocking premium features: the licence key, or the whole
   * offline-activation `{JSON CODE}` string from https://www.devsense.com/purchase/validation.
   * Sent as `initializationOptions["0"]` of the server-side `initialize` only; never sent to
   * browser clients and never logged. Falls back to the DEVSENSE_PHP_LS_LICENSE env variable.
   */
  license?: string;
  /** @deprecated Use `license`. */
  licenseKey?: string;
  /** Extra initializationOptions passed to the LS `initialize` request (a `"0"` here is overridden by `license`). */
  initializationOptions?: Record<string, unknown>;
  /** Working directory for the LS process. */
  cwd?: string;
  /** Additional environment variables for the LS process. */
  env?: Record<string, string>;
  /** Optional logger. */
  logger?: (msg: string) => void;
  /**
   * Attach the WebSocket endpoint to an existing HTTP(S) server (e.g. the one serving the static
   * front end) instead of listening on `port`/`host`. The server must be (or become) listening.
   */
  server?: import('http').Server;
  /** Accept WebSocket upgrades only on this path, e.g. `/lsp`. Default: any path. */
  path?: string;
  /** File path to write the WS port for client discovery. */
  portFile?: string;
}

export interface PhpEditorInfo {
  port: number;
  url: string;
}

/**
 * PhpEditor manages a single devsense-php-ls language server instance,
 * exposes a WebSocket server for client RPC, and routes LSP messages between
 * WebSocket clients and the language server.
 *
 * Lifecycle:
 *   start() -> spawn LS, initialize handshake, start WS server
 *   stop()  -> shutdown LS, stop WS server
 */
export class PhpEditor {
  private ls: LsServer | null = null;
  private ws: WsServer | null = null;
  private router: Router | null = null;
  private initialized = false;
  private licensed = false;
  private readonly options: PhpEditorOptions;

  constructor(options: PhpEditorOptions = {}) {
    this.options = {
      port: 8765,
      host: '127.0.0.1',
      ...options,
    };
  }

  /** Start the language server and WebSocket server. Returns the WS port. */
  async start(): Promise<number> {
    if (this.initialized) return this.getPort()!;

    console.log('[PhpEditor] Starting...');

    // 1. Spawn the LS process.
    this.ls = new LsServer({
      cwd: this.options.cwd,
      env: this.options.env,
      logger: this.options.logger,
    });
    this.ls.on('error', (err) => {
      console.error('[PhpEditor] LS error:', err.message);
      this.options.logger?.(`LS error: ${err.message}`);
    });
    this.ls.on('exit', (code, signal) => {
      console.log('[PhpEditor] LS exited code=', code, 'signal=', signal);
      this.options.logger?.(`LS exited code=${code} signal=${signal}`);
      this.initialized = false;
    });

    console.log('[PhpEditor] Spawning language server...');
    await this.ls.start();
    const client = this.ls.getClient();
    if (!client) {
      throw new Error('Failed to create LSP client for devsense-php-ls');
    }

    console.log('[PhpEditor] LS client created, starting WebSocket server...');

    // 2. Start the WebSocket server.
    this.ws = new WsServer({ port: this.options.port, host: this.options.host, server: this.options.server, path: this.options.path });
    const port = await this.ws.start();
    console.log('[PhpEditor] WebSocket server listening on ws://', this.options.host, ':', port);
    this.options.logger?.(`WebSocket server listening on ws://${this.options.host}:${port}`);

    // 3. Wire up the router between WS clients and the LS.
    // Licence: `license` option > deprecated `licenseKey` > DEVSENSE_PHP_LS_LICENSE. Never logged.
    const license = resolveLicense(this.options.license ?? this.options.licenseKey);
    this.licensed = license !== undefined;
    const initializationOptions = buildInitializationOptions(license, this.options.initializationOptions);
    console.log('[PhpEditor] Premium licence:', this.licensed ? 'configured' : 'not configured');

    this.router = new Router(client, this.ws, { initializationOptions, secrets: license ? [license] : [], licensed: this.licensed });
    // Single shared LS handshake, done once by the server worker.
    await this.router.whenReady();

    // Write port to file for client discovery if configured.
    if (this.options.portFile) {
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(path.dirname(this.options.portFile), { recursive: true });
      fs.writeFileSync(this.options.portFile, String(port));
      console.log('[PhpEditor] WS port written to', this.options.portFile);
    }

    // Per-client virtual workspace assignment + diagnostic URI ownership.
    this.ws.on('connection', (client) => {
      const workspace = new VirtualWorkspace(client.id);
      this.router!.registerUri(client.id, workspace.rootUri);
      // Tell the client its assigned workspace URI so it can build matching
      // virtual document URIs (fixes diagnostic routing / LS doc recognition).
      this.ws!.sendTo(client.id, {
        jsonrpc: '2.0',
        method: 'client/workspace',
        params: { clientId: client.id, workspaceUri: workspace.rootUri },
      });
      console.log('[PhpEditor] Client connected:', client.id, '(workspace', workspace.rootUri, ')');
      this.options.logger?.(`Client connected: ${client.id} (workspace ${workspace.rootUri})`);
    });
    this.ws.on('disconnect', (clientId) => {
      console.log('[PhpEditor] Client disconnected:', clientId);
      this.options.logger?.(`Client disconnected: ${clientId}`);
    });

    this.initialized = true;
    console.log('[PhpEditor] Started successfully on port', port);
    return port;
  }

  /** Stop the LS and WebSocket server (shutdown/exit handshake). */
  async stop(): Promise<void> {
    this.initialized = false;
    console.log('[PhpEditor] Stopping...');

    // Graceful LS shutdown handshake: shutdown -> exit.
    const client = this.ls?.getClient();
    if (client && !client.isClosed()) {
      console.log('[PhpEditor] Sending shutdown to LS...');
      try {
        client.send({ jsonrpc: '2.0', id: 0, method: 'shutdown', params: null });
        client.notify('exit');
      } catch { /* ignore */ }
    }

    if (this.ws) {
      await this.ws.stop();
      this.ws = null;
      console.log('[PhpEditor] WebSocket server stopped');
    }
    if (this.ls) {
      await this.ls.stop();
      this.ls = null;
      console.log('[PhpEditor] Language server stopped');
    }
    this.router = null;
    console.log('[PhpEditor] Stopped');
  }

  /** WebSocket port (0 if not started). */
  getPort(): number | null {
    return this.ws ? this.ws.getPort() : null;
  }

  /** WebSocket URL, e.g. `ws://127.0.0.1:4567`. */
  getUrl(): string | null {
    const port = this.getPort();
    if (port === null) return null;
    return `ws://${this.options.host}:${port}`;
  }

  /** Whether start() has completed successfully. */
  /** True when a licence (option or DEVSENSE_PHP_LS_LICENSE) was configured. Not a validation result. */
  isLicensed(): boolean {
    return this.licensed;
  }

  isRunning(): boolean {
    return this.initialized && this.ls?.isRunning() === true;
  }

  /** The underlying WsServer (for advanced use / testing). */
  getWsServer(): WsServer | null {
    return this.ws;
  }

  /** The underlying LsServer (for advanced use / testing). */
  getLsServer(): LsServer | null {
    return this.ls;
  }

  /** The underlying Router (for advanced use / testing). */
  getRouter(): Router | null {
    return this.router;
  }
}
