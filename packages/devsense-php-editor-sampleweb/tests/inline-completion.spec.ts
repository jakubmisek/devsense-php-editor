import { test, expect } from '@playwright/test';

/**
 * textDocument/inlineCompletion E2E tests.
 *
 * Exercises inline completion (ghost text) against a live Monaco editor
 * backed by devsense-php-ls over WebSocket RPC.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types '<?php ec' to trigger inline completion
 *   4. Asserts inline completion ghost text appears
 */
test.describe('textDocument/inlineCompletion', () => {
  const EDITOR = '.monaco-editor';
  const INLINE_COMPLETION = '.monaco-inline-completion';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete.
    await page.waitForTimeout(1500);
  });

  test('shows inline completion ghost text after typing "<?php ec"', async ({
    page,
  }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const backendOk = await page.evaluate(() => {
      return fetch('/php-editor-port')
        .then((r) => r.ok)
        .catch(() => false);
    });
    test.skip(!backendOk, 'LSP backend not responding at /php-editor-port');

    await page.locator(EDITOR).click();
    await page.keyboard.press('Control+A');
    // Type a partial PHP construct that should trigger inline completion.
    await page.keyboard.insertText('<?php ec');

    // Inline completion is automatic (triggered on typing); wait for ghost text.
    const ghost = page.locator(INLINE_COMPLETION);
    await expect(ghost).toBeVisible({ timeout: 10000 });
  });
});
