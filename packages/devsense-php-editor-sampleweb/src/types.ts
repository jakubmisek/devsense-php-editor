/** Shared browser-side types. */
import type * as monacoNs from 'monaco-editor';

/** JSON-RPC 2.0 message as received over the WebSocket. */
export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type MonacoApi = typeof monacoNs;

declare global {
  interface Window {
    /** Exposed for Playwright tests (window.monaco.editor.getEditors()). */
    monaco: MonacoApi;
    /** Optional manual override of the PhpEditor WebSocket URL. */
    PHP_EDITOR_WS_URL?: string;
    MonacoEnvironment?: monacoNs.Environment;
  }
}
