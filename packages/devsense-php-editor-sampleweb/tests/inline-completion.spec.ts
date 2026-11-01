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
  const INLINE_COMPLETION = '.monaco-inline-completion:not([hidden])';

  test.beforeEach(async ({ page }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'LSP backend not responding at /php-editor-port').toBe(false);

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete.
    await page.waitForTimeout(3000);
  });

  test('shows inline completion ghost text after typing "<?php ec"', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    await page.keyboard.press('Control+A');
    // Type a partial PHP construct that should trigger inline completion.
    await page.keyboard.type('<?php ec');

    // Inline completion is automatic (triggered on typing); wait for ghost text.
    await page.waitForTimeout(4000);

    const ghost = page.locator(INLINE_COMPLETION);
    await expect(ghost.first()).toBeVisible({ timeout: 10000 });
  });
});
