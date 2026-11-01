import { test, expect, Page } from '@playwright/test';
import WebSocket from 'ws';
import { openPlayground, setText, getText } from './helpers';

/**
 * textDocument/prepareRename + textDocument/rename.
 *
 * devsense-php-ls only renames in `file:` documents (any other scheme gives
 * -32803 "Cannot rename a built-in symbol" for every symbol), so the Router runs rename
 * against a short-lived `file:///untitled-workspace-{id}/` shadow copy (see uriMap.ts).
 */
const SRC = `<?php
function foo($param) {
  $count = 1;
  return $count + $param;
}
class Bar {}
foo(1);
new Bar();
echo strlen("x");
`;

async function f2(page: Page, line: number, col: number, newName: string): Promise<void> {
  await page.evaluate(([l, c]) => { const ed = (window as any).monaco.editor.getEditors()[0]; ed.setPosition({ lineNumber: l, column: c }); ed.focus(); }, [line, col]);
  await page.keyboard.press('F2');
  const input = page.locator('.rename-box input, .rename-input').first();
  await expect(input).toBeVisible({ timeout: 10000 });
  await expect(input).not.toHaveValue('', { timeout: 10000 }); // prefilled once prepareRename answered
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+A');
  await page.keyboard.type(newName);
  await page.keyboard.press('Enter');
}

test.describe('DEVSENSE PHP Editor - textDocument/rename (browser)', () => {
  test.beforeEach(async ({ page }) => {
    await openPlayground(page);
    await setText(page, SRC);
    await page.waitForTimeout(1500);
  });

  const cases: Array<[string, number, number, string, RegExp, number]> = [
    ['local variable', 3, 4, '$total', /\$total\b/g, 2],
    ['function parameter', 2, 15, '$arg', /\$arg\b/g, 2],
    ['function name', 2, 11, 'baz', /\bbaz\(/g, 2],
    ['class name', 6, 8, 'Qux', /\bQux\b/g, 2],
  ];
  for (const [name, line, col, newName, re, count] of cases) {
    test(`F2 renames a ${name}`, async ({ page }) => {
      await f2(page, line, col, newName);
      await expect.poll(async () => (await getText(page)).match(re)?.length ?? 0, { timeout: 10000 }).toBe(count);
    });
  }
});

/** Same requests straight over the PhpEditor WebSocket, checking the raw LSP results. */
test.describe('DEVSENSE PHP Editor - textDocument/rename (WebSocket)', () => {
  test('prepareRename/rename results for user symbols and strlen', async ({ request, baseURL }) => {
    const port = (await (await request.get(`${baseURL}/php-editor-port`)).text()).trim();
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let id = 0;
    const pending = new Map<number, (m: any) => void>();
    let workspaceUri = '';
    const gotWs = new Promise<void>((res) => ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.method === 'client/workspace') { workspaceUri = m.params.workspaceUri; res(); }
      else if (m.id != null && !m.method) pending.get(m.id)?.(m);
    }));
    await new Promise((r) => ws.once('open', r));
    await gotWs;
    const req = (method: string, params: unknown) => new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ jsonrpc: '2.0', id: i, method, params })); });
    await req('initialize', { processId: null, rootUri: null, capabilities: {} });
    const uri = `${workspaceUri}rename.php`;
    ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'php', version: 1, text: SRC } } }));
    await new Promise((r) => setTimeout(r, 2000));
    try {
      for (const [line, character, newName, edits] of [[2, 3, '$total', 2], [1, 14, '$arg', 2], [1, 10, 'baz', 2], [5, 7, 'Qux', 2]] as const) {
        const prep = await req('textDocument/prepareRename', { textDocument: { uri }, position: { line, character } });
        expect(prep.result, `prepareRename ${line}:${character}`).toBeTruthy();
        const ren = await req('textDocument/rename', { textDocument: { uri }, position: { line, character }, newName });
        expect(ren.error).toBeUndefined();
        const dc = ren.result.documentChanges[0];
        expect(dc.textDocument.uri).toBe(uri); // mapped back to the client's virtual URI
        expect(dc.edits).toHaveLength(edits);
      }
      // strlen is a built-in. Expected: -32803 "Cannot rename a built-in symbol".
      // devsense-php-ls 1.0.19497 currently returns an edit annotated "Unsafe refactoring"
      // (needsConfirmation) instead; accept either, but never a plain safe rename.
      const s = await req('textDocument/rename', { textDocument: { uri }, position: { line: 8, character: 6 }, newName: 'zz' });
      if (s.error) expect(s.error.code).toBe(-32803);
      else expect(Object.values(s.result.changeAnnotations ?? {}).some((a: any) => a.needsConfirmation)).toBe(true);
    } finally { ws.close(); }
  });
});
