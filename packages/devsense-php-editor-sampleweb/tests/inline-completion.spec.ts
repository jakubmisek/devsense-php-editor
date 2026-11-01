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
 *   3. Types '<?php class ' (trailing space): devsense-php-ls offers inline completion only in
 *      special cases; after `class ` it suggests a class name derived from the file name
 *      (opened as Greeter.php so the expected ghost text is `Greeter`)
 *   4. Asserts inline completion ghost text appears
 */
test.describe('textDocument/inlineCompletion', () => {
  const EDITOR = '.monaco-editor';
  const INLINE_COMPLETION = '.ghost-text-decoration, .ghost-text';

  test.beforeEach(async ({ page }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'LSP backend not responding at /php-editor-port').toBe(false);

    // The LS suggests the class name from the file name, but not for untitled.php or index.php.
    await page.goto('/?doc=Greeter.php');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete.
    await page.waitForTimeout(3000);
  });

  test('shows inline completion ghost text after typing "class "', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Start from "<?php\n" via the model: typing Enter right after "<?php" could accept the "<?php" completion item.
    await page.evaluate(() => { const ed = (window as any).monaco.editor.getEditors()[0]; ed.setValue('<?php\n'); ed.setPosition({ lineNumber: 2, column: 1 }); ed.focus(); });
    await page.waitForTimeout(300);
    await page.keyboard.type('class ');

    // Inline completion is automatic (triggered on typing). Under load the automatic request can be
    // superseded (e.g. by the suggest widget), so close it and trigger explicitly until ghost text shows.
    const ghost = page.locator(INLINE_COMPLETION);
    await expect(async () => {
      if (!(await ghost.first().isVisible())) {
        await page.keyboard.press('Escape');
        await page.evaluate(() => (window as any).monaco.editor.getEditors()[0].trigger('test', 'editor.action.inlineSuggest.trigger', {}));
      }
      await expect(ghost.first()).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20000 });
    await expect(page.locator('.ghost-text, .ghost-text-decoration').first()).toContainText('Greeter');
  });
});
