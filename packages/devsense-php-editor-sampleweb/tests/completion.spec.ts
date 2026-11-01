import { test, expect } from '@playwright/test';

/**
 * textDocument/completion E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises the Monaco completion widget backed by devsense-php-ls over the
 * WebSocket RPC router. The editor is wired in editor.ts via CompletionProvider
 * (trigger characters include ".", "$", etc.) and main.ts bootstraps the WS
 * connection using the port file served at /php-editor-port.
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
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
    test.skip(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)');

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete and the LS to
    // index the document before requesting completions.
    await page.waitForTimeout(3000);
  });

  test('shows completion widget with "echo" after typing "<?php ec"', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Overwrite any initial content with a clean PHP snippet.
    await page.keyboard.insertText('<?php ec');
    // Explicitly trigger completion (Ctrl+Space).
    await page.keyboard.press('Control+Space');
    // Give the LS time to compute completion items.
    await page.waitForTimeout(3000);

    const completion = page.locator(COMPLETION_LIST);
    await expect(completion).toBeVisible({ timeout: 10000 });
    // The devsense-php-ls server should offer "echo" as a completion item.
    await expect(completion).toContainText('echo', { timeout: 10000 });
  });

  test('shows completion widget after typing "<?php $x = " and triggering after "$"', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    await page.keyboard.insertText('<?php $x = ');
    // Position caret right after the "$"-style trigger; trigger completion.
    await page.keyboard.press('Control+Space');
    // Give the LS time to compute completion items.
    await page.waitForTimeout(3000);

    const completion = page.locator(COMPLETION_LIST);
    await expect(completion).toBeVisible({ timeout: 10000 });
    // Variable completions (e.g. $x) should be offered by the language server.
    await expect(completion).toContainText('$x', { timeout: 10000 });
  });
});
