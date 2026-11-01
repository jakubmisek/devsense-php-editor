import { test, expect } from '@playwright/test';

/**
 * Server-side LSP investigation tests for devsense-php-ls.
 *
 * These tests spawn devsense.php.ls directly (via child_process) and exercise
 * LSP 3.18 over stdio using a real file:/// URI — bypassing Monaco, WebSocket,
 * and the untitled-workspace-{id}:// sandboxed workspace schema.
 *
 * Purpose: determine which LSP methods the server actually handles, so we know
 * what fails next time consistently. These tests do NOT depend on the sampleweb
 * frontend or PhpEditor WebSocket server.
 *
 * Each test is self-contained: it spawns the LS, runs one LSP method, and
 * terminates the process.
 *
 * The binary path is resolved via devsense-php-ls's languageServerPath()
 * helper, or passed as the first command-line argument.
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEST_URI = 'file:///tmp/ls-investigate-sample.php';
const TEST_CONTENT = `<?php
function foo($x){return strlen($x);}
class Bar{public function baz($y){echo $y;}}
`;

// --- LSP framing helpers ---------------------------------------------
function frame(message: any): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = `Content-Length: ${body.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'ascii'), body]);
}

function parseFrames(buf: Buffer): { messages: any[]; remaining: Buffer } {
  const messages: any[] = [];
  let remaining = buf;
  while (remaining.length > 0) {
    const headerEnd = remaining.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const header = remaining.slice(0, headerEnd).toString('ascii');
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) { remaining = remaining.slice(1); continue; }
    const contentLength = parseInt(m[1], 10);
    const bodyStart = headerEnd + 4;
    const total = bodyStart + contentLength;
    if (remaining.length < total) break;
    const body = remaining.slice(bodyStart, total).toString('utf8');
    remaining = remaining.slice(total);
    try { messages.push(JSON.parse(body)); } catch { /* ignore */ }
  }
  return { messages, remaining };
}

function resolveLsBinary(): string {
  if (process.argv[2]) return process.argv[2];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Devsense } = require('devsense-php-ls');
    const lsPath = Devsense.PHP.LS.languageServerPath();
    if (lsPath) return lsPath;
  } catch { /* fall through */ }

  // Search from the repo root upward for the binary.
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const candidates = [
    path.join(repoRoot, 'packages', 'devsense-php-editor', 'node_modules', 'devsense-php-ls-linux-x64', 'dist', 'devsense.php.ls'),
    path.join(repoRoot, 'node_modules', 'devsense-php-ls-linux-x64', 'dist', 'devsense.php.ls'),
    path.join(process.cwd(), 'node_modules', 'devsense-php-ls-linux-x64', 'dist', 'devsense.php.ls'),
    path.join(__dirname, 'node_modules', 'devsense-php-ls-linux-x64', 'dist', 'devsense.php.ls'),
  ];
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); return c; } catch { /* try next */ }
  }
  throw new Error('Could not locate devsense.php.ls binary. Pass it as argv[2].');
}

const LS_BIN = resolveLsBinary();

function spawnLs() {
  const proc = spawn(LS_BIN, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  let stdoutBuf = Buffer.alloc(0);
  let pendingResolve: ((v: any) => void) | null = null;
  let pendingReject: ((e: Error) => void) | null = null;
  let messageId = 0;

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
    let remaining = stdoutBuf;
    while (true) {
      const { messages, remaining: newRemaining } = parseFrames(remaining);
      stdoutBuf = newRemaining;
      for (const msg of messages) {
        if (msg.id != null && !msg.method && pendingResolve) {
          if (msg.error) pendingReject(new Error(`LS error ${msg.error.code}: ${msg.error.message}`));
          else pendingResolve(msg.result);
          pendingResolve = null;
          pendingReject = null;
        }
      }
      if (remaining === stdoutBuf) break; // no progress
      remaining = stdoutBuf;
    }
  });

  return {
    proc,
    send: (msg: any) => {
      if (proc.stdin) proc.stdin.write(frame(msg));
    },
    request: (method: string, params?: any): Promise<any> =>
      new Promise((resolve, reject) => {
        const id = ++messageId;
        pendingResolve = resolve;
        pendingReject = reject;
        proc.stdin!.write(frame({ jsonrpc: '2.0', id, method, params }));
      }),
    notify: (method: string, params?: any) => {
      if (proc.stdin) proc.stdin.write(frame({ jsonrpc: '2.0', method, params }));
    },
    kill: () => {
      try { proc.kill(); } catch { /* ignore */ }
    },
  };
}

async function withLs<T>(fn: (ls: { send: (msg: any) => void; request: (method: string, params?: any) => Promise<any>; notify: (method: string, params?: any) => void; kill: () => void }) => Promise<T>): Promise<T> {
  const ls = spawnLs();
  try {
    await new Promise((r) => setTimeout(r, 1500)); // let LS start
    return await fn(ls);
  } finally {
    ls.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}

test.describe('devsense-php-ls server-side LSP investigation', () => {
  // These tests spawn devsense.php.ls directly and do NOT depend on the
  // PhpEditor WebSocket server or the /php-editor-port port file.
  test('initialize returns expected capabilities', async () => {
    const result = await withLs(async (ls) => {
      const initResult = await ls.request('initialize', {
        processId: process.pid,
        rootUri: 'file:///tmp',
        rootPath: '/tmp',
        capabilities: {
          textDocument: {
            completion: { dynamicRegistration: true },
            hover: { dynamicRegistration: true },
            formatting: { dynamicRegistration: true },
            rangeFormatting: { dynamicRegistration: true },
            documentSymbol: { dynamicRegistration: true },
            codeAction: { dynamicRegistration: true },
            signatureHelp: { dynamicRegistration: true },
          },
          workspace: { workspaceEdit: { documentChanges: true } },
        },
        initializationOptions: {},
      });
      ls.notify('initialized', {});
      return initResult;
    });

    expect(result).toBeDefined();
    const caps = result.capabilities;
    expect(caps.hoverProvider).toBe(true);
    expect(caps.completionProvider).toBeDefined();
    expect(caps.documentRangeFormattingProvider).toBeDefined();
    console.log('Server capabilities:', Object.keys(caps).join(', '));
  });

  test('textDocument/completion returns items', async () => {
    const result = await withLs(async (ls) => {
      await ls.request('initialize', {
        processId: process.pid,
        rootUri: 'file:///tmp',
        capabilities: { textDocument: { completion: { dynamicRegistration: true } } },
        initializationOptions: {},
      });
      ls.notify('initialized', {});
      ls.notify('textDocument/didOpen', {
        textDocument: { uri: TEST_URI, languageId: 'php', version: 1, text: TEST_CONTENT },
      });
      await new Promise((r) => setTimeout(r, 800));
      return ls.request('textDocument/completion', {
        textDocument: { uri: TEST_URI },
        position: { line: 0, character: 5 },
        context: { triggerKind: 1 },
      });
    });

    expect(result).toBeDefined();
    const items = result && result.items ? result.items.length : 0;
    console.log(`Completion items: ${items}`);
    expect(items).toBeGreaterThan(0);
  });

  test('textDocument/hover at multiple positions', async () => {
    const hoverPositions = [
      // TEST_CONTENT line 1: `function foo($x){return strlen($x);}`
      { line: 1, character: 10, label: 'foo (function name)' },
      { line: 1, character: 26, label: 'strlen (function name)' },
      { line: 1, character: 14, label: '$x (parameter)' },
    ];

    let hoverFound = false;
    let lastError: Error | null = null;

    const result = await withLs(async (ls) => {
      await ls.request('initialize', {
        processId: process.pid,
        rootUri: 'file:///tmp',
        capabilities: { textDocument: { hover: { dynamicRegistration: true } } },
        initializationOptions: {},
      });
      ls.notify('initialized', {});
      ls.notify('textDocument/didOpen', {
        textDocument: { uri: TEST_URI, languageId: 'php', version: 1, text: TEST_CONTENT },
      });
      await new Promise((r) => setTimeout(r, 800));

      for (const pos of hoverPositions) {
        try {
          const hr = await ls.request('textDocument/hover', {
            textDocument: { uri: TEST_URI },
            // Send a clean LSP Position (no extra `label` field).
            position: { line: pos.line, character: pos.character },
          });
          if (hr && hr.contents) {
            hoverFound = true;
            console.log(`Hover at ${pos.label}: contents returned`);
            break;
          }
        } catch (err) {
          lastError = err as Error;
          console.log(`Hover at ${pos.label}: ERROR - ${(err as Error).message}`);
        }
      }
    });

    if (hoverFound) {
      console.log('Hover: PASS - contents returned at some position');
    } else {
      console.log(`Hover: FAIL - no contents at any position. Last error: ${lastError?.message}`);
    }
    expect(!hoverFound, 'hover returns no contents at any tested position (server-side limitation)').toBe(false);
  });

  test('textDocument/rangeFormatting returns edits', async () => {
    const result = await withLs(async (ls) => {
      await ls.request('initialize', {
        processId: process.pid,
        rootUri: 'file:///tmp',
        capabilities: {
          textDocument: { rangeFormatting: { dynamicRegistration: true } },
        },
        initializationOptions: {},
      });
      ls.notify('initialized', {});
      ls.notify('textDocument/didOpen', {
        textDocument: { uri: TEST_URI, languageId: 'php', version: 1, text: TEST_CONTENT },
      });
      await new Promise((r) => setTimeout(r, 800));
      return ls.request('textDocument/rangeFormatting', {
        textDocument: { uri: TEST_URI },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 40 },
        },
        options: { tabSize: 4, insertSpaces: true },
      });
    });

    const edits = result && result.length ? result.length : 0;
    console.log(`RangeFormatting edits: ${edits}`);
    expect(edits).toBeGreaterThan(0);
  });
});
