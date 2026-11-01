import { test, expect } from '@playwright/test';

/**
 * Shared single devsense-php-ls instance:
 *  - the server worker performs exactly one real `initialize`; client initializes are faked
 *  - request ids from different clients do not collide
 *  - diagnostics are routed only to the client owning the document URI
 */
test.describe('shared language server', () => {
  test('two concurrent clients, one LS initialize, isolated ids and diagnostics', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const port = (await (await fetch('/php-editor-port', { cache: 'no-store' })).text()).trim();
      const open = () => new Promise<any>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        const c: any = { ws, msgs: [] as any[], waiters: new Map<any, (m: any) => void>() };
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          c.msgs.push(m);
          if (m.method === 'client/workspace') { c.workspaceUri = m.params.workspaceUri; resolve(c); }
          if (m.id != null && !m.method) c.waiters.get(m.id)?.(m);
        };
        ws.onerror = reject;
      });
      const req = (c: any, id: number, method: string, params: any) => new Promise<any>((res) => {
        c.waiters.set(id, res);
        c.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      });
      const note = (c: any, method: string, params: any) => c.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));

      const [a, b] = await Promise.all([open(), open()]);
      const [ia, ib] = await Promise.all([
        req(a, 1, 'initialize', { processId: null, rootUri: null, capabilities: {} }),
        req(b, 1, 'initialize', { processId: null, rootUri: null, capabilities: {} }),
      ]);
      note(a, 'initialized', {}); note(b, 'initialized', {});
      const uriA = a.workspaceUri + 'untitled.php';
      const uriB = b.workspaceUri + 'untitled.php';
      note(a, 'textDocument/didOpen', { textDocument: { uri: uriA, languageId: 'php', version: 1, text: '<?php\nfunction fa($x) { return $x; }\nstrlen(\n' } });
      note(b, 'textDocument/didOpen', { textDocument: { uri: uriB, languageId: 'php', version: 1, text: '<?php\nfunction fb($y) { return $y; }\n$q = = ;\n' } });
      // Same request id (2) from both clients at the same time.
      const [sa, sb] = await Promise.all([
        req(a, 2, 'textDocument/documentSymbol', { textDocument: { uri: uriA } }),
        req(b, 2, 'textDocument/documentSymbol', { textDocument: { uri: uriB } }),
      ]);
      await new Promise((r) => setTimeout(r, 4000)); // diagnostics are pushed with delay
      const stats = await req(a, 3, '$/devsense/stats', {});
      const diagUris = (c: any) => c.msgs.filter((m: any) => m.method === 'textDocument/publishDiagnostics').map((m: any) => m.params.uri);
      const lsRequests = (c: any) => c.msgs.filter((m: any) => m.method && m.id != null).map((m: any) => m.method);
      const res = {
        caps: [!!ia.result?.capabilities?.completionProvider, !!ib.result?.capabilities?.completionProvider],
        symA: (sa.result || []).map((s: any) => s.name), symB: (sb.result || []).map((s: any) => s.name),
        diagA: diagUris(a), diagB: diagUris(b), uriA, uriB,
        lsRequestsToClients: [...lsRequests(a), ...lsRequests(b)],
        stats: stats.result,
      };
      a.ws.close(); b.ws.close();
      return res;
    });

    expect(result.caps).toEqual([true, true]);
    expect(result.stats.lsInitializeCount).toBe(1);
    expect(result.symA.join()).toContain('fa');
    expect(result.symA.join()).not.toContain('fb');
    expect(result.symB.join()).toContain('fb');
    expect(result.symB.join()).not.toContain('fa');
    // LS -> client requests (registerCapability, ...) are answered by the server worker.
    expect(result.lsRequestsToClients).toEqual([]);
    // Diagnostics only ever reach the owner.
    expect(result.diagA.every((u: string) => u === result.uriA)).toBe(true);
    expect(result.diagB.every((u: string) => u === result.uriB)).toBe(true);
    // NOTE: devsense-php-ls currently publishes no diagnostics for untitled-workspace-{id}://
    // URIs (it does for file:// and untitled:), so we can only assert isolation here.
    // See the fixme test below.
  });

  test('page reload does not re-initialize the language server', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.reload();
    await page.waitForTimeout(1500);
    const count = await page.evaluate(async () => {
      const port = (await (await fetch('/php-editor-port', { cache: 'no-store' })).text()).trim();
      return new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        ws.onopen = () => ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: '$/devsense/stats' }));
        ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { ws.close(); resolve(m.result.lsInitializeCount); } };
      });
    });
    expect(count).toBe(1);
  });

  test.fixme('LS publishes diagnostics for untitled-workspace-{id}:// documents (server-side)', async () => {
    // Verified directly against devsense-php-ls 1.0.19490 over stdio: a syntax error in
    // file:///a.php or untitled:Untitled-1 yields publishDiagnostics; the same text in
    // untitled-workspace-abc://untitled.php yields none.
  });
});
