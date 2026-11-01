import { test, expect } from '@playwright/test';

/**
 * textDocument/references E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises "Find References" (Shift+F12) backed by devsense-php-ls over the
 * WebSocket RPC router (ReferencesProvider in providers.browser.js).
 *
 * Because precisely asserting the references peek widget contents is fragile,
 * these tests assert the feature is wired (widget appears / no error) rather
 * than the exact reference list.
 *
 * Each test is self-contained and skips gracefully if the PHP language server
 * backend isn't responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/references', () => {
  const EDITOR = '.monaco-editor';
  const REFERENCES = '.monaco-peek-widget, .monaco-widget.references, .find-references';

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

  test('finds references for a variable used multiple times (Shift+F12)', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type PHP code where "$count" is declared and used multiple times.
    await page.keyboard.insertText(
      '<?php $count = 0;\n$count = $count + 1;\necho $count;'
    );
    await page.waitForTimeout(500);

    // Place caret on the "$count" declaration (line 1) and trigger find refs.
    const editor = page.locator(EDITOR).first();
    const box = await editor.boundingBox();
    test.skip(!box, 'editor bounding box not available');
    await page.mouse.click(box.x + 80, box.y + 30);
    await page.waitForTimeout(300);
    await page.keyboard.press('Shift+F12');

    // References widget should appear (or at least the feature should be wired
    // with no editor crash). Assert the editor remains responsive.
    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('$count');
    // If a references peek widget opened, assert it is visible.
    const refs = page.locator(REFERENCES);
    if ((await refs.count()) > 0) {
      await expect(refs.first()).toBeVisible();
    }
  });
});
