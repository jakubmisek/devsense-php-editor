import { LspClient } from '../lsp/client';
import { WsServer, WsClient } from './WsServer';

export interface RouterOptions {
  /** initializationOptions (e.g. { "0": license }) merged into LS `initialize`. */
  initializationOptions?: Record<string, any>;
}

export interface RouterEvents {
  /** A client connected. */
  clientConnected: (clientId: string) => void;
  /** A client disconnected. */
  clientDisconnected: (clientId: string) => void;
}

/**
 * Routes JSON-RPC messages between WebSocket clients and the language server.
 *
 * Routing rules:
 *   Client -> LS: forward requests/notifications. Track pending request ids
 *                  so responses can be routed back to the originating client.
 *   LS -> Client responses: route back to the client that sent the request.
 *   LS -> Client notifications: `textDocument/publishDiagnostics` is routed
 *                               to the client owning params.textDocument.uri.
 *                               Other notifications are broadcast to all clients.
 */
export class Router {
  private readonly ls: LspClient;
  private readonly ws: WsServer;
  private readonly options: RouterOptions;

  // request id -> clientId (for routing responses back)
  private pending = new Map<string | number, string>();
  // uri -> clientId (for routing diagnostics by URI)
  private uriToClient = new Map<string, string>();
  // request id -> { resolve, reject } for promise-based requests
  private pendingRequests = new Map<string | number, { resolve: (value: any) => void; reject: (err: Error) => void }>;
  private nextRequestId = 1;

  constructor(ls: LspClient, ws: WsServer, options: RouterOptions = {}) {
    this.ls = ls;
    this.ws = ws;
    this.options = options;

    // Incoming messages from WS clients -> forward to LS.
    ws.on('message', (client, data) => this.handleClientMessage(client, data));

    // Incoming messages from LS -> route to WS client(s).
    ls.on('message', (message) => this.handleLsMessage(message));
  }

  /** A WS client sent a JSON-RPC message. Forward it to the LS. */
  private handleClientMessage(client: WsClient, data: any): void {
    const message = this.prepareClientMessage(client, data);
    if (!message) return;

    // Track requests so we can route the response back to this client.
    if (message.method && message.id != null) {
      this.pending.set(message.id, client.id);
    }

    this.ls.send(message);
  }

  /**
   * Prepare/rewrite a client message before forwarding to the LS.
   * Injects initializationOptions."0" (license) into `initialize` params.
   */
  private prepareClientMessage(client: WsClient, data: any): any {
    if (!data || typeof data !== 'object') return data;

    // Clone to avoid mutating the caller's object.
    const message = { ...data };

    if (message.method === 'initialize' && message.params) {
      const params = { ...message.params };
      const initOpts = { ...(params.initializationOptions || {}) };
      if (this.options.initializationOptions) {
        for (const [k, v] of Object.entries(this.options.initializationOptions)) {
          if (!(k in initOpts)) initOpts[k] = v;
        }
      }
      params.initializationOptions = initOpts;
      message.params = params;
    }

    return message;
  }

  /** A message arrived from the LS. Route responses/notifications to WS clients. */
  private handleLsMessage(message: any): void {
    if (!message || typeof message !== 'object') return;

    // Response to a request -> route back to the originating client.
    if (message.id != null && !message.method) {
      const clientId = this.pending.get(message.id);
      if (clientId) {
        this.pending.delete(message.id);
        this.ws.sendTo(clientId, message);
      }
      // Resolve any pending promise-based request.
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`LS error ${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Notification -> route by method.
    if (message.method) {
      this.handleLsNotification(message);
      return;
    }
  }

  private handleLsNotification(message: any): void {
    const method: string = message.method;
    const params: any = message.params || {};

    if (method === 'textDocument/publishDiagnostics') {
      const uri = params.textDocument?.uri;
      if (uri) {
        this.uriToClient.set(uri, params._clientId || this.uriToClient.get(uri) || '');
      }
      const clientId = uri ? this.uriToClient.get(uri) : undefined;
      if (clientId) {
        this.ws.sendTo(clientId, message);
      } else {
        // No owning client yet: broadcast.
        this.ws.broadcast(message);
      }
      return;
    }

    // All other LS notifications: broadcast to all clients.
    this.ws.broadcast(message);
  }

  /** Record that a client owns a virtual document URI (for diagnostic routing). */
  registerUri(clientId: string, uri: string): void {
    this.uriToClient.set(uri, clientId);
  }

  /** Get the client id that owns a URI, if any. */
  getClientForUri(uri: string): string | undefined {
    return this.uriToClient.get(uri);
  }

  /**
   * Send a JSON-RPC request to the language server and return a Promise
   * that resolves with the result when the response arrives.
   * Used by providers to make LSP requests and await responses.
   */
  sendRequest(method: string, params?: any): Promise<any> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const message = this.prepareClientMessage(null as any, {
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
      this.ls.send(message);
    });
  }
}
