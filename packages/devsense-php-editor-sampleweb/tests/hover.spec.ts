import { test, expect } from '@playwright/test';

/**
 * textDocument/hover E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises the Monaco hover widget backed by devsense-php-ls over the
 * WebSocket RPC router (HoverProvider in providers.browser.js).
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/hover', () => {
  const EDITOR = '.monaco-editor';
  const HOVER = '.monaco-hover';

  test.beforeEach(async ({ page }) => {
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    test.skip(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)');

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1500);
  });

  test('shows hover tooltip with strlen documentation over "strlen"', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type a small PHP snippet that uses the well-known strlen function.
    await page.keyboard.insertText('<?php echo strlen("hello");');
    await page.waitForTimeout(500);

    // Move the mouse over the "strlen" identifier (characters 9..14 on line 1).
    const editor = page.locator(EDITOR).first();
    const box = await editor.boundingBox();
    test.skip(!box, 'editor bounding box not available');

    // Approximate position of "strlen" within the editor content area.
    // Line 1 top ~ some offset; "strlen" starts after '<?php echo ' (9 chars).
    const x = box.x + 120;
    const y = box.y + 40;
    await page.mouse.move(x, y);
    await page.waitForTimeout(1000);

    const hover = page.locator(HOVER);
    await expect(hover).toBeVisible({ timeout: 10000 });
    await expect(hover).toContainText('strlen', { timeout: 10000 });
  });
});
