import { test, expect, type Page } from '@playwright/test';
import { openPlayground, setText } from './helpers';

/**
 * textDocument/publishDiagnostics for untitled-workspace-{id}:// documents (devsense-php-ls >= 1.0.19497).
 * The server publishes lazily, 1-3 s after the last change, so assertions poll for up to 15 s.
 */
const WAIT = { timeout: 15000 };

type Marker = { severity: number; message: string; startLineNumber: number; code?: unknown };
const markers = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { monaco: { editor: { getModelMarkers(f: { owner: string }): Marker[] } } };
  return w.monaco.editor.getModelMarkers({ owner: 'devsense-php-ls' }).map((m) => ({ severity: m.severity, message: m.message, startLineNumber: m.startLineNumber }));
});
const count = (page: Page) => page.locator('.diagnostics-header .count');

test.describe('DEVSENSE PHP Editor - Diagnostics', () => {
  test('diagnostics panel renders with a zero count for valid code', async ({ page }) => {
    await openPlayground(page);
    await expect(page.locator('#diagnostics-panel')).toBeVisible();
    await expect(count(page)).toHaveText('0', WAIT);
  });

  test('a syntax error appears in the panel and as an editor marker', async ({ page }) => {
    await openPlayground(page);
    await setText(page, '<?php\necho "a"\necho "b";\n');
    await expect(count(page)).toContainText(/1 error/, WAIT);
    await expect(page.locator('#diagnostics-panel')).toContainText(/Syntax error: unexpected token 'echo'/);
    await expect(page.locator('#diagnostics-panel')).toContainText('L3:C1');
    const m = await markers(page);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ severity: 8, startLineNumber: 3 });
    await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible(WAIT);
  });

  test('fixing the code clears the panel and the markers', async ({ page }) => {
    await openPlayground(page);
    await setText(page, '<?php\necho "a"\necho "b";\n');
    await expect(count(page)).toContainText(/error/, WAIT);
    await setText(page, '<?php\necho "a";\necho "b";\n');
    await expect(count(page)).toHaveText('0', WAIT);
    await expect.poll(() => markers(page), WAIT).toEqual([]);
  });

  test('severity mapping: LSP Error/Warning/Hint -> Monaco Error/Warning/Hint and panel labels', async ({ page }) => {
    await openPlayground(page);
    // PHP0406 (warning: wrong argument type), PHP0421 (hint: unused parameter), PHP1039 (error: duplicate parameter).
    await setText(page, '<?php\nfunction f(int $a) {}\nf("x");\nfunction g($b, $b) {}\n');
    await expect.poll(async () => (await markers(page)).map((m) => m.severity).sort(), WAIT).toEqual([1, 1, 4, 8]);
    const m = await markers(page);
    expect(m.find((x) => x.severity === 4)?.message).toMatch(/expected to be of type int/);
    expect(m.find((x) => x.severity === 8)?.message).toMatch(/Duplicate parameter/);
    const panel = page.locator('#diagnostics-panel');
    await expect(panel.locator('.diagnostic-item.severity-1 .severity').first()).toHaveText('Error');
    await expect(panel.locator('.diagnostic-item.severity-2 .severity').first()).toHaveText('Warning');
    await expect(panel.locator('.diagnostic-item.severity-4 .severity').first()).toHaveText('Hint');
    await expect(count(page)).toContainText('1 error');
    await expect(count(page)).toContainText('1 warning');
  });

  test('diagnostics are isolated per client: two pages with different errors', async ({ browser }) => {
    const [ctxA, ctxB] = [await browser.newContext(), await browser.newContext()];
    const [a, b] = [await ctxA.newPage(), await ctxB.newPage()];
    try {
      await Promise.all([openPlayground(a), openPlayground(b)]);
      const [uriA, uriB] = await Promise.all([a, b].map((p) => p.evaluate(() => window.phpEditor!.getDocumentUri())));
      expect(uriA).not.toBe(uriB);
      await setText(a, '<?php\nfunction g($b, $b) {}\n');      // duplicate parameter (error)
      await setText(b, '<?php\necho "a"\necho "b";\n');        // syntax error
      await expect(a.locator('#diagnostics-panel')).toContainText(/Duplicate parameter/, WAIT);
      await expect(b.locator('#diagnostics-panel')).toContainText(/Syntax error/, WAIT);
      // Give the server time to publish anything stray, then check nothing crossed over.
      await a.waitForTimeout(2000);
      await expect(a.locator('#diagnostics-panel')).not.toContainText(/Syntax error/);
      await expect(b.locator('#diagnostics-panel')).not.toContainText(/Duplicate parameter/);
      expect((await markers(a)).map((m) => m.message).join()).not.toMatch(/Syntax error/);
      expect((await markers(b)).map((m) => m.message).join()).not.toMatch(/Duplicate parameter/);
    } finally {
      await ctxA.close(); await ctxB.close();
    }
  });

  test('diagnostics work again after a page reload (new client, new workspace)', async ({ page }) => {
    await openPlayground(page);
    const before = await page.evaluate(() => window.phpEditor!.getDocumentUri());
    await setText(page, '<?php\necho "a"\necho "b";\n');
    await expect(count(page)).toContainText(/error/, WAIT);
    await page.reload();
    await openPlayground(page);
    const after = await page.evaluate(() => window.phpEditor!.getDocumentUri());
    expect(after).not.toBe(before);
    await expect(count(page)).toHaveText('0', WAIT); // stale diagnostics from the old client don't leak in
    await setText(page, '<?php\n$q = = ;\n');
    await expect(count(page)).toContainText(/error/, WAIT);
    await expect.poll(async () => (await markers(page)).length, WAIT).toBeGreaterThan(0);
  });
});
