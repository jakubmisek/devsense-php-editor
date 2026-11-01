/**
 * WebSocket client to the devsense-php-editor PhpEditor server.
 *
 * Connects to ws://<host>:<port>, sends JSON-RPC 2.0 messages,
 * and dispatches incoming notifications (e.g. diagnostics) to callbacks.
 */
import type { JsonRpcMessage } from './types';

export class WsClient {
  private socket: WebSocket | null = null;
  private url: string;
  private onMessage: ((message: JsonRpcMessage) => void) | null = null;
  private onClose: (() => void) | null = null;
  private pendingRequests = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[WsClient] Connecting to', this.url);
      this.socket = new WebSocket(this.url);
      this.socket.onopen = () => {
        console.log('[WsClient] Connected to', this.url);
        resolve();
      };
      this.socket.onerror = (err) => {
        console.error('[WsClient] Connection error to', this.url, err);
        reject(err);
      };
      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as JsonRpcMessage;
          console.log('[WsClient] <- Server:', message.method || message.id || 'response');
          this.handleMessage(message);
        } catch {
          // ignore non-JSON
        }
      };
      this.socket.onclose = () => {
        console.log('[WsClient] Disconnected from', this.url);
        this.socket = null;
        this.onClose?.();
      };
    });
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Response to a request -> resolve pending promise.
    if (message.id != null && !message.method) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`Server error ${message.error.code}: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
      return;
    }

    // Notification -> dispatch to listener.
    this.onMessage?.(message);
  }

  /** Send a JSON-RPC request and await the response. */
  sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not open'));
    }
    const id = this.nextId++;
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  sendNotification(method: string, params?: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
  }

  setOnMessage(cb: (message: JsonRpcMessage) => void): void {
    this.onMessage = cb;
  }

  setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
