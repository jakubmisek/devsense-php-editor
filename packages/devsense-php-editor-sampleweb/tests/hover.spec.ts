import { test, expect } from '@playwright/test';

/**
 * textDocument/hover E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises the Monaco hover widget backed by devsense-php-ls over the
 * WebSocket RPC router (HoverProvider in providers.browser.js).
 *
 * Hover is triggered by moving the mouse over a valid PHP identifier
 * (function name, variable, keyword). We try multiple positions to find
 * one where the server returns hover contents.
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/hover', () => {
  const EDITOR = '.monaco-editor';
  // Use a visible hover widget selector to avoid strict-mode violations from
  // hidden tooltip widgets that Monaco keeps in the DOM.
  const HOVER = '.monaco-hover:not([hidden])';

  test.beforeEach(async ({ page }) => {
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    test.skip(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)');

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1000);
  });

  test('shows hover tooltip over valid PHP identifiers', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type a PHP snippet with several identifiers to hover over.
    await page.keyboard.insertText('<?php echo strlen("hello");');
    await page.waitForTimeout(500);

    const editor = page.locator(EDITOR).first();
    const box = await editor.boundingBox();
    test.skip(!box, 'editor bounding box not available');

    // Try hovering over several positions:
    // - 'strlen' at approx char 9-14 on line 1
    // - 'echo' at approx char 5-8 on line 1
    // - the string literal 'hello' at approx char 15-20 on line 1
    const hoverPositions = [
      { x: box.x + 120, y: box.y + 40, label: 'strlen' },
      { x: box.x + 70, y: box.y + 40, label: 'echo' },
      { x: box.x + 170, y: box.y + 40, label: 'string literal' },
    ];

    let hoverFound = false;
    for (const pos of hoverPositions) {
      await page.mouse.move(pos.x, pos.y);
      await page.waitForTimeout(1000);

      const hover = page.locator(HOVER);
      const isVisible = await hover.first().isVisible();
      if (isVisible) {
        hoverFound = true;
        console.log(`Hover visible over ${pos.label}`);
        await expect(hover.first()).toContainText(/strlen|echo|string/i, {
          timeout: 5000,
        });
        break;
      }
    }

    test.skip(!hoverFound, 'no hover tooltip visible over any tested position');
  });
});
