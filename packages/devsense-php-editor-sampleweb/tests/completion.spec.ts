import { test, expect } from '@playwright/test';

/**
 * textDocument/completion E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises the Monaco completion widget backed by devsense-php-ls over the
 * WebSocket RPC router. Completion works on the sandboxed
 * untitled-workspace-{id}:// URI when triggered properly.
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and fails if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/completion', () => {
  const EDITOR = '.monaco-editor';
  const COMPLETION_LIST = '.monaco-list:not([hidden])';

  test.beforeEach(async ({ page }) => {
    // Skip gracefully when the devsense-php-ls backend isn't reachable.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)').toBe(false);

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1000);
  });

  test('shows completion widget with "echo" after typing "<?php ec"', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Overwrite any initial content with a clean PHP snippet.
    await page.keyboard.insertText('<?php ec');
    // Explicitly trigger completion (Ctrl+Space).
    await page.keyboard.press('Control+Space');
    // Give the LS a moment to compute completion items (diagnostics push is async).
    await page.waitForTimeout(1000);

    const completion = page.locator(COMPLETION_LIST);
    await expect(completion).toBeVisible({ timeout: 10000 });
    // The devsense-php-ls server should offer "echo" as a completion item.
    await expect(completion).toContainText('echo', { timeout: 10000 });
  });

  test('offers a previously declared variable after typing "$xy"', async ({ page }) => {
    // $x is declared on an earlier line; after typing "$" the LS should offer it.
    await page.evaluate(() => {
      const ed = (window as any).monaco.editor.getEditors()[0];
      ed.getModel().setValue('<?php\n$xyz = 1;\necho ');
      const m = ed.getModel();
      ed.setPosition({ lineNumber: 3, column: m.getLineMaxColumn(3) });
      ed.focus();
    });
    await page.keyboard.type('$');
    const completion = page.locator(COMPLETION_LIST);
    await expect(completion).toBeVisible({ timeout: 10000 });
    // The suggest list is virtualized (~12 rows) and superglobals sort first,
    // so narrow it the way a user would before asserting.
    await page.keyboard.type('xy');
    await expect(completion).toContainText('$xyz', { timeout: 10000 });
  });
});
