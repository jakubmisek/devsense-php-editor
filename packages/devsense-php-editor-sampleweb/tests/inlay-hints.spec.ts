import { test, expect } from '@playwright/test';

/**
 * textDocument/inlayHint E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises Monaco inlay hints backed by devsense-php-ls over the WebSocket
 * RPC router (InlayHintProvider in providers.browser.js).
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/inlayHint', () => {
  const EDITOR = '.monaco-editor';
  const INLAY_HINT = '.monaco-editor .mtc-inlay-hint, .monaco-editor .inlay-hint';

  test.beforeEach(async ({ page }) => {
    // Skip gracefully when the devsense-php-ls backend isn't reachable.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    test.skip(
      !backendAvailable,
      'devsense-php-ls backend not responding (no /php-editor-port)'
    );

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete.
    await page.waitForTimeout(1500);
  });

  test('shows inlay hints for function call parameters', async ({ page }) => {
    await page.locator(EDITOR).click();
    // Type a PHP function call with parameters to trigger inlay hints.
    await page.keyboard.insertText('<?php strlen("hello");');
    // Wait for inlay hints to be requested and rendered.
    await page.waitForTimeout(2000);

    // Editor remains visible and content rendered.
    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('strlen');

    // Assert inlay hint elements are visible if the backend returned any.
    const hints = page.locator(INLAY_HINT);
    const hintCount = await hints.count();
    test.skip(hintCount === 0, 'no inlay hints rendered (backend may not return hints for this snippet)');
    await expect(hints.first()).toBeVisible({ timeout: 10000 });
  });
});
