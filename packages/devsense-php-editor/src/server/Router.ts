import type * as lsp from 'vscode-languageserver-protocol';
import { LspClient, JsonRpcMessage, isJsonRpcMessage } from '../lsp/client';
import { WsServer, WsClient } from './WsServer';

export interface RouterOptions {
  /** initializationOptions (e.g. { "0": license }) merged into the LS `initialize`. */
  initializationOptions?: Record<string, unknown>;
  /** Capabilities advertised to the LS in the single real `initialize`. */
  clientCapabilities?: lsp.ClientCapabilities;
}

/** Client-side capabilities sent in the one real `initialize` (browser Monaco feature set). */
const DEFAULT_CLIENT_CAPABILITIES: lsp.ClientCapabilities = {
  workspace: { configuration: true, workspaceFolders: false, didChangeConfiguration: { dynamicRegistration: true } },
  textDocument: {
    synchronization: { didSave: false, dynamicRegistration: false },
    completion: { completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] }, contextSupport: true, completionList: { itemDefaults: ['editRange', 'insertTextFormat', 'commitCharacters', 'data'] } },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } }, contextSupport: true },
    definition: {}, references: {}, documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['', 'quickfix', 'refactor', 'source'] } } },
    formatting: {}, rangeFormatting: {}, onTypeFormatting: {}, rename: { prepareSupport: true },
    publishDiagnostics: { relatedInformation: true },
    semanticTokens: { requests: { full: true, range: true }, tokenTypes: [], tokenModifiers: [], formats: ['relative'] },
    inlayHint: {}, codeLens: {}, inlineCompletion: {},
  },
  window: { workDoneProgress: false },
};

/**
 * Routes JSON-RPC between WebSocket clients and ONE shared devsense-php-ls.
 *
 *  - The Router performs the single real `initialize`/`initialized` at startup and
 *    caches the LS capabilities. A client's `initialize` is answered locally with
 *    the cached result; client `initialized`, `shutdown` and `exit` are swallowed.
 *  - Client request ids are remapped to unique LS ids, and responses are mapped
 *    back to the originating client with its original id (no collisions).
 *  - LS -> client requests (client/registerCapability, workspace/configuration, ...)
 *    are answered here and never reach browsers.
 *  - `textDocument/publishDiagnostics` is routed by `params.uri` to the owning
 *    client (owner = client whose workspace URI prefixes the document URI).
 */
export class Router {
  private readonly ls: LspClient;
  private readonly ws: WsServer;
  private readonly options: RouterOptions;

  /** LS request id -> originating client + original id. */
  private pending = new Map<number, { clientId: string; originalId: string | number }>();
  /** Workspace/document URI prefix -> clientId. */
  private uriToClient = new Map<string, string>();
  /** Router-originated requests awaiting responses. */
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private nextRequestId = 1;
  private initResult: lsp.InitializeResult | null = null;
  private ready: Promise<lsp.InitializeResult>;
  /** Count of `initialize` requests actually sent to the LS (for diagnostics/tests). */
  public lsInitializeCount = 0;

  constructor(ls: LspClient, ws: WsServer, options: RouterOptions = {}) {
    this.ls = ls;
    this.ws = ws;
    this.options = options;
    ws.on('message', (client, data) => this.handleClientMessage(client, data));
    ws.on('disconnect', (clientId: string) => this.handleDisconnect(clientId));
    ls.on('message', (message) => this.handleLsMessage(message));
    this.ready = this.initializeLs();
    this.ready.catch((err) => console.error('[Router] LS initialize failed:', err));
  }

  /** Resolves with the cached LS InitializeResult once the single handshake is done. */
  whenReady(): Promise<lsp.InitializeResult> { return this.ready; }

  private async initializeLs(): Promise<lsp.InitializeResult> {
    this.lsInitializeCount++;
    const params: lsp.InitializeParams = {
      processId: process.pid,
      clientInfo: { name: 'devsense-php-editor' },
      rootUri: null,
      workspaceFolders: null,
      capabilities: this.options.clientCapabilities ?? DEFAULT_CLIENT_CAPABILITIES,
      initializationOptions: { ...(this.options.initializationOptions || {}) },
    };
    const result = (await this.request('initialize', params)) as lsp.InitializeResult;
    this.ls.send({ jsonrpc: '2.0', method: 'initialized', params: {} });
    this.initResult = result;
    console.log('[Router] LS initialized; capabilities cached');
    return result;
  }

  private sendToClient(clientId: string, message: JsonRpcMessage): void {
    this.ws.sendTo(clientId, message);
  }

  /** A WS client sent a JSON-RPC message. */
  private handleClientMessage(client: WsClient, data: unknown): void {
    if (!isJsonRpcMessage(data)) return;
    const { method, id } = data;
    const isRequest = method != null && id != null;
    const replyId = id ?? null;

    // Lifecycle messages are owned by the server worker, never forwarded.
    if (method === 'initialize' && isRequest) {
      this.ready.then(
        (result) => this.sendToClient(client.id, { jsonrpc: '2.0', id: replyId, result }),
        (err: unknown) => this.sendToClient(client.id, { jsonrpc: '2.0', id: replyId, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } }),
      );
      return;
    }
    if (method === 'shutdown' && isRequest) {
      this.sendToClient(client.id, { jsonrpc: '2.0', id: replyId, result: null });
      return;
    }
    if (method === 'initialized' || method === 'exit') return;
    // Introspection for tests/monitoring: how many real initialize requests hit the LS.
    if (method === '$/devsense/stats' && isRequest) {
      this.sendToClient(client.id, { jsonrpc: '2.0', id: replyId, result: { lsInitializeCount: this.lsInitializeCount, clientId: client.id, clients: this.ws.getClientIds() } });
      return;
    }

    // Response from the client to an LS request: we answer those ourselves.
    if (method == null) return;

    // Claim ownership of any document the client touches.
    const uri = (data.params as Partial<lsp.TextDocumentPositionParams> | undefined)?.textDocument?.uri;
    if (uri && method === 'textDocument/didOpen') this.uriToClient.set(uri, client.id);

    const forward = () => {
      if (isRequest) {
        const lsId = this.nextRequestId++;
        this.pending.set(lsId, { clientId: client.id, originalId: id as string | number });
        this.ls.send({ ...data, id: lsId });
      } else {
        this.ls.send(data);
      }
    };
    // Hold traffic until the real handshake has completed.
    if (this.initResult) forward(); else this.ready.then(forward, () => undefined);
  }

  private handleDisconnect(clientId: string): void {
    for (const [uri, owner] of this.uriToClient) {
      if (owner !== clientId) continue;
      if (!uri.endsWith('://')) this.ls.send({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } });
      this.uriToClient.delete(uri);
    }
    for (const [lsId, p] of this.pending) {
      if (p.clientId === clientId) {
        this.pending.delete(lsId);
        this.ls.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id: lsId } });
      }
    }
  }

  /** A message arrived from the LS. */
  private handleLsMessage(message: JsonRpcMessage): void {

    // LS -> client request: answer on the server side.
    if (message.method && message.id != null) {
      this.ls.send({ jsonrpc: '2.0', id: message.id, result: this.answerServerRequest(message) });
      return;
    }

    // Response.
    if (message.id != null) {
      const own = typeof message.id === 'number' ? this.pendingRequests.get(message.id) : undefined;
      if (own) {
        this.pendingRequests.delete(message.id as number);
        if (message.error) own.reject(new Error(`LS error ${message.error.code}: ${message.error.message}`));
        else own.resolve(message.result);
        return;
      }
      const p = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
      if (p) {
        this.pending.delete(message.id as number);
        this.sendToClient(p.clientId, { ...message, id: p.originalId });
      }
      return;
    }

    if (message.method === 'textDocument/publishDiagnostics') {
      const uri = (message.params as lsp.PublishDiagnosticsParams | undefined)?.uri;
      const clientId = uri ? this.getClientForUri(uri) : undefined;
      if (clientId) this.sendToClient(clientId, message);
      else console.log('[Router] Dropping diagnostics for unowned URI', uri);
      return;
    }

    if (message.method === 'window/logMessage' || message.method === '$/progress' || message.method === 'telemetry/event') {
      return; // server-side only
    }
    this.ws.broadcast(message);
  }

  private answerServerRequest(message: JsonRpcMessage): unknown {
    switch (message.method) {
      case 'workspace/configuration':
        return ((message.params as lsp.ConfigurationParams | undefined)?.items ?? []).map(() => null);
      case 'workspace/workspaceFolders':
        return [];
      case 'window/showMessageRequest':
        return null;
      case 'workspace/applyEdit':
        return { applied: false };
      default: // client/registerCapability, client/unregisterCapability, window/workDoneProgress/create, refresh requests...
        return null;
    }
  }

  /** Record that a client owns a URI or URI prefix (e.g. its workspace root). */
  registerUri(clientId: string, uri: string): void {
    this.uriToClient.set(uri, clientId);
  }

  /** Owning client for a URI: exact match, else the workspace root that prefixes it. */
  getClientForUri(uri: string): string | undefined {
    const exact = this.uriToClient.get(uri);
    if (exact) return exact;
    for (const [prefix, owner] of this.uriToClient) {
      if (prefix.endsWith('://') && uri.startsWith(prefix)) return owner;
    }
    return undefined;
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ls.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  /** Send a request to the LS from the Node side (waits for the shared handshake). */
  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    await this.ready;
    return this.request(method, params);
  }
}
