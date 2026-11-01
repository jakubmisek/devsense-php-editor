import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { Server as HttpServer } from 'http';
import type { JsonRpcMessage } from '../lsp/client';

export interface WsServerOptions {
  port?: number;
  host?: string;
  /** Attach to an existing HTTP(S) server instead of listening on `port` (one port for static files + WS). */
  server?: HttpServer;
  /** Only accept WebSocket upgrades on this path (e.g. `/lsp`). Default: any path. */
  path?: string;
}

export interface WsClient {
  id: string;
  socket: WebSocket;
}

export interface WsServerEvents {
  connection: (client: WsClient) => void;
  /** Parsed JSON (not yet validated as JSON-RPC), or `{ raw }` for non-JSON frames. */
  message: (client: WsClient, data: unknown) => void;
  disconnect: (clientId: string) => void;
  error: (err: Error) => void;
}

/**
 * WebSocket server for client RPC.
 *
 * Each connected client is assigned a unique `{id}`. Messages are parsed
 * as JSON-RPC 2.0 and emitted via the `message` event.
 */
export class WsServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, WsClient>();
  private nextId = 0;
  private readonly options: WsServerOptions;

  constructor(options: WsServerOptions = {}) {
    super();
    this.options = options;
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const { server, path } = this.options;
      if (server) {
        this.wss = new WebSocketServer({ server, path });
        const addr = server.address();
        const listening = () => { const a = server.address(); resolve(typeof a === 'object' && a ? a.port : 0); };
        if (addr) listening(); else server.once('listening', listening);
      } else {
        this.wss = new WebSocketServer({ port: this.options.port || 0, host: this.options.host, path });
      }

      this.wss.on('listening', () => {
        const addr = this.wss!.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve(port);
      });

      this.wss.on('error', (err: Error) => {
        this.emit('error', err);
        reject(err);
      });

      this.wss.on('connection', (socket: WebSocket) => {
        const id = `client-${++this.nextId}`;
        const client: WsClient = { id, socket };
        this.clients.set(id, client);

        console.log('[WsServer] Client connected:', id, '(total:', this.clients.size + ')');

        socket.on('message', (raw: Buffer | string) => {
          let data: unknown;
          try {
            data = JSON.parse(raw.toString('utf8'));
            const m = data as JsonRpcMessage | null;
            console.log('[WsServer] <- Client', id, ':', m?.method || m?.id || 'response');
          } catch {
            data = { raw: raw.toString('utf8') };
            console.log('[WsServer] <- Client', id, ': <non-JSON>');
          }
          this.emit('message', client, data);
        });

        socket.on('close', () => {
          console.log('[WsServer] Client disconnected:', id);
          this.clients.delete(id);
          this.emit('disconnect', id);
        });

        socket.on('error', (err: Error) => {
          console.error('[WsServer] Client', id, 'error:', err.message);
          this.emit('error', err);
        });

        this.emit('connection', client);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return; }
      // Close all client sockets.
      for (const client of this.clients.values()) {
        try { client.socket.close(); } catch { /* ignore */ }
      }
      this.clients.clear();
      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
      setTimeout(() => resolve(), 2000);
    });
  }

  /** Send a JSON-serializable message to a specific client by id. */
  sendTo(clientId: string, message: JsonRpcMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) return false;
    client.socket.send(JSON.stringify(message));
    return true;
  }

  /** Broadcast a message to all connected clients. */
  broadcast(message: JsonRpcMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        try { client.socket.send(payload); } catch { /* ignore */ }
      }
    }
  }

  getClientIds(): string[] { return [...this.clients.keys()]; }

  getClient(clientId: string): WsClient | undefined {
    return this.clients.get(clientId);
  }

  getPort(): number | null {
    if (!this.wss) return null;
    const addr = this.wss.address();
    return typeof addr === 'object' && addr ? addr.port : null;
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
