import { test, expect } from '@playwright/test';

/**
 * textDocument/formatting E2E tests.
 *
 * Exercises document formatting (Shift+Alt+F) against a live Monaco editor
 * backed by devsense-php-ls over WebSocket RPC.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types unformatted PHP code
 *   4. Formats the document
 *   5. Asserts the code got reformatted
 */
test.describe('textDocument/formatting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-editor').waitFor({
      state: 'visible',
      timeout: 30000,
    });
  });

  test('reformats unformatted PHP document on Shift+Alt+F', async ({ page }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const backendOk = await page.evaluate(() => {
      return fetch('/php-editor-port')
        .then((r) => r.ok)
        .catch(() => false);
    });
    test.skip(!backendOk, 'LSP backend not responding at /php-editor-port');

    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(
      `<?php
function foo($x){return strlen($x);}
class Bar{public function baz($y){echo $y;}}
`
    );

    // Capture the unformatted content before formatting.
    const beforeContent = await page.evaluate(() => {
      const editors = (window as any).monaco?.editor?.getEditors?.();
      return editors?.[0]?.getValue() ?? '';
    });

    // Format the document (Shift+Alt+F).
    await page.keyboard.press('Shift+Alt+F');

    // Give devsense-php-ls time to compute formatting edits.
    await page.waitForTimeout(1500);

    // Capture the formatted content after formatting.
    const afterContent = await page.evaluate(() => {
      const editors = (window as any).monaco?.editor?.getEditors?.();
      return editors?.[0]?.getValue() ?? '';
    });

    // Assert the content actually changed (was reformatted).
    expect(afterContent).not.toBe(beforeContent);

    // Assert typical formatting markers: spaces around braces/operators,
    // and indentation on function/class bodies.
    expect(afterContent).toContain('{');
    expect(afterContent).toMatch(/\n\s+(return|echo)/);
  });
});
