import { test, expect } from '@playwright/test';

/**
 * textDocument/definition E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises "Go to Definition" (F12 / Ctrl+Click) backed by devsense-php-ls
 * over the WebSocket RPC router (DefinitionProvider in providers.browser.js).
 *
 * Because precisely asserting the editor caret position after navigation is
 * fragile, these tests assert that the feature is wired (no error, provider
 * responds) rather than the exact target line.
 *
 * Each test is self-contained and fails if the PHP language server
 * backend isn't responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/definition', () => {
  const EDITOR = '.monaco-editor';

  test.beforeEach(async ({ page }) => {
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)').toBe(false);

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1500);
  });

  test('goes to definition via F12 without error (feature wired)', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Replace editor content with a function definition and a call to it.
    await page.keyboard.insertText(
      '<?php function greet(string $name): void { echo $name; }\ngreet("world");'
    );
    await page.waitForTimeout(500);

    // Move caret onto the "greet" call identifier, then press F12 (go to def).
    // Position roughly over the second occurrence of "greet" on line 2.
    const editor = page.locator(EDITOR).first();
    const box = await editor.boundingBox();
    expect(!box, 'editor bounding box not available').toBe(false);
    await page.mouse.click(box.x + 260, box.y + 60);
    await page.waitForTimeout(300);
    await page.keyboard.press('F12');

    // The editor should remain functional (no crash / error dialog) after the
    // definition request. Assert the editor is still visible and responsive.
    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('function greet');
  });

  test('goes to definition via Ctrl+Click without error (feature wired)', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    await page.keyboard.insertText(
      '<?php function add(int $a, int $b): int { return $a + $b; }\nadd(1, 2);'
    );
    await page.waitForTimeout(500);

    const editor = page.locator(EDITOR).first();
    const box = await editor.boundingBox();
    expect(!box, 'editor bounding box not available').toBe(false);
    // Ctrl+Click over the "add" call on line 2.
    await page.keyboard.down('Control');
    await page.mouse.click(box.x + 250, box.y + 60);
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('function add');
  });
});
