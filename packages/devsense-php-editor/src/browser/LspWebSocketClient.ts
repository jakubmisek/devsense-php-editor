/**
 * Minimal JSON-RPC 2.0 client over a browser WebSocket, connected to the
 * server-side `PhpEditor`. Implements {@link LspRequestSender} so it can be
 * handed to the Monaco providers.
 */
import type { LspRequestSender } from '../providers/base';

/** JSON-RPC 2.0 message as received over the WebSocket. */
export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class LspWebSocketClient implements LspRequestSender {
  private socket: WebSocket | null = null;
  private readonly pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private notificationListeners: Array<(message: JsonRpcMessage) => void> = [];
  private closeListeners: Array<() => void> = [];

  constructor(readonly url: string) {}

  /** Open the socket. Resolves on `open`, rejects on a connection error. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error(`WebSocket connection to ${this.url} failed`));
      socket.onmessage = (event: MessageEvent<string>) => {
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(event.data) as JsonRpcMessage;
        } catch {
          return; // ignore non-JSON frames
        }
        this.handleMessage(message);
      };
      socket.onclose = () => {
        this.socket = null;
        for (const p of this.pending.values()) p.reject(new Error('WebSocket closed'));
        this.pending.clear();
        for (const l of this.closeListeners) l();
      };
    });
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id != null && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`Server error ${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    for (const l of this.notificationListeners) l(message);
  }

  /** Send a JSON-RPC request and resolve with its `result`. */
  sendRequest(method: string, params?: unknown): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('WebSocket not open'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  /** Send a JSON-RPC notification. Dropped silently when the socket is not open. */
  sendNotification(method: string, params?: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
  }

  /** Reply to a request the server sent to this client (e.g. `workspace/applyEdit`). */
  sendResponse(id: string | number, result: unknown): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
  }

  /** Subscribe to server notifications/requests. Returns an unsubscribe function. */
  onNotification(listener: (message: JsonRpcMessage) => void): () => void {
    this.notificationListeners.push(listener);
    return () => { this.notificationListeners = this.notificationListeners.filter((l) => l !== listener); };
  }

  /** Subscribe to the socket closing. Returns an unsubscribe function. */
  onClose(listener: () => void): () => void {
    this.closeListeners.push(listener);
    return () => { this.closeListeners = this.closeListeners.filter((l) => l !== listener); };
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
