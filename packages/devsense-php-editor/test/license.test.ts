/**
 * Unit tests: licence option / DEVSENSE_PHP_LS_LICENSE reach initializationOptions["0"]
 * of the single real `initialize`, and never reach WebSocket clients or the log.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type * as lsp from 'vscode-languageserver-protocol';
import { resolveLicense, buildInitializationOptions, redactSecrets, LICENSE_ENV_VAR } from '../src/server/license';
import { Router } from '../src/server/Router';
import { PhpEditor } from '../src/PhpEditor';
import type { LspClient, JsonRpcMessage } from '../src/lsp/client';
import type { WsServer, WsClient } from '../src/server/WsServer';

const SECRET = 'LICENSE-SECRET-1234';

class FakeLs extends EventEmitter {
  sent: JsonRpcMessage[] = [];
  initializeResult: lsp.InitializeResult = { capabilities: {}, serverInfo: { name: `ls (licensed to ${SECRET})` } };
  send(message: JsonRpcMessage): void {
    this.sent.push(message);
    if (message.method === 'initialize') setImmediate(() => this.emit('message', { jsonrpc: '2.0', id: message.id, result: this.initializeResult }));
  }
}

class FakeWs extends EventEmitter {
  out: Array<{ to: string; message: JsonRpcMessage }> = [];
  sendTo(clientId: string, message: JsonRpcMessage): boolean { this.out.push({ to: clientId, message }); return true; }
  broadcast(message: JsonRpcMessage): void { this.out.push({ to: '*', message }); }
  getClientIds(): string[] { return ['c1', 'c2']; }
}

function setup(license: string | undefined, extra?: Record<string, unknown>) {
  const ls = new FakeLs();
  const ws = new FakeWs();
  const router = new Router(ls as unknown as LspClient, ws as unknown as WsServer, {
    initializationOptions: buildInitializationOptions(license, extra),
    secrets: license ? [license] : [],
    licensed: license !== undefined,
  });
  const client = (id: string) => ({ id } as unknown as WsClient);
  const fromClient = (id: string, message: JsonRpcMessage) => ws.emit('message', client(id), message);
  return { ls, ws, router, fromClient };
}

const tick = () => new Promise((r) => setTimeout(r, 10));

test('resolveLicense: option wins, env fallback, blank is none', () => {
  assert.equal(resolveLicense('opt', { [LICENSE_ENV_VAR]: 'env' }), 'opt');
  assert.equal(resolveLicense(undefined, { [LICENSE_ENV_VAR]: ' env ' }), 'env');
  assert.equal(resolveLicense(undefined, {}), undefined);
  assert.equal(resolveLicense('  ', {}), undefined);
  const json = '{"key":"abc","sig":"xyz"}';
  assert.equal(resolveLicense(undefined, { [LICENSE_ENV_VAR]: json }), json, 'offline JSON code is passed verbatim as a string');
});

test('buildInitializationOptions: licence goes to "0" and beats a configured "0"', () => {
  assert.deepEqual(buildInitializationOptions(SECRET, { '0': 'other', foo: 1 }), { '0': SECRET, foo: 1 });
  assert.deepEqual(buildInitializationOptions(undefined, { foo: 1 }), { foo: 1 });
  assert.deepEqual(buildInitializationOptions(undefined), {});
});

test('redactSecrets replaces strings containing a secret, deeply', () => {
  assert.deepEqual(redactSecrets({ a: [`x${SECRET}y`, 'ok'], b: { c: SECRET }, n: 1 }, [SECRET]), { a: ['[redacted]', 'ok'], b: { c: '[redacted]' }, n: 1 });
  const v = { a: 'x' };
  assert.equal(redactSecrets(v, []), v);
});

test('Router: licence reaches the real initialize; client initialize gets a redacted cached result', async () => {
  const { ls, ws, router, fromClient } = setup(SECRET);
  await router.whenReady();
  const init = ls.sent.filter((m) => m.method === 'initialize');
  assert.equal(init.length, 1);
  assert.equal((init[0].params as lsp.InitializeParams).initializationOptions['0'], SECRET);

  // A client trying to inject its own "0" is answered locally; nothing it sent reaches the LS.
  fromClient('c1', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {}, initializationOptions: { '0': 'CLIENT-KEY' } } });
  await tick();
  assert.equal(ls.sent.filter((m) => m.method === 'initialize').length, 1);
  assert.ok(!JSON.stringify(ls.sent).includes('CLIENT-KEY'));
  const reply = ws.out.find((o) => o.to === 'c1' && o.message.id === 1);
  assert.ok(reply, 'client got an initialize reply');
  assert.ok(!JSON.stringify(reply.message).includes(SECRET), 'cached InitializeResult is redacted');
  assert.equal((reply.message.result as lsp.InitializeResult).serverInfo?.name, '[redacted]');
});

test('Router: nothing sent to any client contains the licence; stats expose only `licensed`', async () => {
  const { ls, ws, router, fromClient } = setup(SECRET);
  await router.whenReady();
  fromClient('c1', { jsonrpc: '2.0', id: 7, method: '$/devsense/stats' });
  ls.emit('message', { jsonrpc: '2.0', method: 'window/showMessage', params: { type: 1, message: `invalid licence ${SECRET}` } });
  fromClient('c1', { jsonrpc: '2.0', id: 8, method: 'textDocument/hover', params: {} });
  await tick();
  const fwd = ls.sent.find((m) => m.method === 'textDocument/hover');
  assert.ok(fwd);
  ls.emit('message', { jsonrpc: '2.0', id: fwd.id, result: { contents: SECRET } });
  await tick();
  assert.ok(!JSON.stringify(ws.out).includes(SECRET));
  const stats = ws.out.find((o) => o.message.id === 7)?.message.result as Record<string, unknown>;
  assert.equal(stats.licensed, true);
});

test('Router: unlicensed stats report licensed=false and no "0"', async () => {
  const { ls, ws, router, fromClient } = setup(undefined);
  await router.whenReady();
  assert.ok(!('0' in ((ls.sent[0].params as lsp.InitializeParams).initializationOptions ?? {})));
  fromClient('c1', { jsonrpc: '2.0', id: 1, method: '$/devsense/stats' });
  await tick();
  assert.equal((ws.out.find((o) => o.message.id === 1)?.message.result as Record<string, unknown>).licensed, false);
});

test('Router: workspace/applyEdit is forwarded to the owning client and its answer goes back to the LS', async () => {
  const { ls, ws, router, fromClient } = setup(undefined);
  await router.whenReady();
  router.registerUri('c2', 'untitled-workspace-c2://');
  const edit: lsp.WorkspaceEdit = { changes: { 'untitled-workspace-c2://a.php': [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: 'x' }] } };
  ls.emit('message', { jsonrpc: '2.0', id: 99, method: 'workspace/applyEdit', params: { edit } });
  const out = ws.out.find((o) => o.message.method === 'workspace/applyEdit');
  assert.ok(out);
  assert.equal(out.to, 'c2');
  fromClient('c1', { jsonrpc: '2.0', id: out.message.id, result: { applied: true } }); // wrong client: ignored
  assert.equal(ls.sent.filter((m) => m.id === 99).length, 0);
  fromClient('c2', { jsonrpc: '2.0', id: out.message.id, result: { applied: true } });
  assert.deepEqual(ls.sent.find((m) => m.id === 99)?.result, { applied: true });

  // Edits to documents nobody owns are refused server-side.
  ls.emit('message', { jsonrpc: '2.0', id: 100, method: 'workspace/applyEdit', params: { edit: { changes: { 'file:///etc/x': [] } } } });
  assert.deepEqual(ls.sent.find((m) => m.id === 100)?.result, { applied: false });
});

test('PhpEditor (real LS): licence option is never logged nor sent to a WebSocket client', { timeout: 60000 }, async () => {
  const logs: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  const capture = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.log = capture; console.error = capture; console.warn = capture;
  const editor = new PhpEditor({ port: 0, license: SECRET });
  try {
    const port = await editor.start();
    assert.equal(editor.isLicensed(), true);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const received: string[] = [];
    socket.on('message', (d: WebSocket.RawData) => received.push(d.toString()));
    await new Promise<void>((r) => socket.on('open', () => r()));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } }));
    socket.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: '$/devsense/stats' }));
    await new Promise((r) => setTimeout(r, 1500));
    socket.close();
    assert.ok(received.some((m) => m.includes('"capabilities"')), 'got initialize result');
    assert.ok(received.some((m) => m.includes('"licensed":true')), 'stats report licensed');
    assert.ok(!received.some((m) => m.includes(SECRET)), 'licence never sent to the client');
  } finally {
    await editor.stop();
    Object.assign(console, orig);
  }
  assert.ok(!logs.some((l) => l.includes(SECRET)), 'licence never logged');
});
