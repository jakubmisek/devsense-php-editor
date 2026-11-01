import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
};

/**
 * JSON-RPC over stdio for the devsense-php-ls language server.
 *
 * Framing follows the LSP base protocol:
 *   Content-Length: <N>\r\n\r\n< N bytes of JSON body >
 */
export class LspClient extends EventEmitter {
  private readonly proc: ChildProcess;
  private buffer = Buffer.alloc(0);
  private closed = false;

  constructor(proc: ChildProcess) {
    super();
    this.proc = proc;

    proc.stdout?.on('data', (chunk: Buffer) => this.onData(chunk));
    proc.stdout?.on('end', () => this.onEnd());
    proc.stderr?.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString('utf8'));
    });
    proc.on('error', (err: Error) => this.emit('error', err));
    proc.on('exit', (_code, _signal) => {
      this.closed = true;
      this.emit('exit');
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parseFrames();
  }

  private onEnd(): void {
    this.closed = true;
    this.emit('end');
  }

  private parseFrames(): void {
    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break; // incomplete header

      const header = this.buffer.slice(0, headerEnd).toString('ascii');
      const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        // malformed frame: drop one byte and resync
        this.buffer = this.buffer.slice(1);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = headerEnd + 4;
      const totalFrameLength = bodyStart + contentLength;
      if (this.buffer.length < totalFrameLength) break; // incomplete body

      const body = this.buffer.slice(bodyStart, totalFrameLength).toString('utf8');
      this.buffer = this.buffer.slice(totalFrameLength);

      try {
        const message = JSON.parse(body) as JsonRpcMessage;
        this.emit('message', message);
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /** Send a JSON-RPC message (request, notification, or response). */
  send(message: JsonRpcMessage): void {
    if (this.closed || !this.proc.stdin) return;
    const body = Buffer.from(JSON.stringify(message), 'utf8');
    const header = `Content-Length: ${body.length}\r\n\r\n`;
    console.log('[LspClient] -> LS:', message.method || message.id || 'response');
    this.proc.stdin.write(Buffer.concat([Buffer.from(header, 'ascii'), body]));
  }

  /** Send a notification (no id, no response expected). */
  notify(method: string, params?: any): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  /** Destroy the underlying process streams. */
  destroy(): void {
    this.closed = true;
    try { this.proc.stdin?.end(); } catch { /* ignore */ }
    try { this.proc.stdout?.destroy(); } catch { /* ignore */ }
    try { this.proc.stderr?.destroy(); } catch { /* ignore */ }
  }

  isClosed(): boolean { return this.closed; }
}
