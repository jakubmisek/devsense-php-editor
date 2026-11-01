import { test, expect } from '@playwright/test';

/**
 * textDocument/formatting E2E tests.
 *
 * Exercises document formatting against a live Monaco editor backed by
 * devsense-php-ls over WebSocket RPC.
 *
 * Note: devsense-php-ls provides formatting via textDocument/rangeFormatting
 * RPC method. When a selection is active, Monaco binds Shift+Alt+F to
 * rangeFormatting. We therefore select all text before formatting so the
 * rangeFormatting path is exercised.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types unformatted PHP code
 *   4. Selects all text
 *   5. Formats (Shift+Alt+F → rangeFormatting)
 *   6. Asserts the code got reformatted
 */
test.describe('textDocument/formatting', () => {
  test.beforeEach(async ({ page }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    test.skip(!backendAvailable, 'LSP backend not responding at /php-editor-port');

    await page.goto('/');
    await page.locator('.monaco-editor').waitFor({
      state: 'visible',
      timeout: 30000,
    });
    await page.waitForTimeout(1000);
  });

  test('reformats unformatted PHP document via rangeFormatting', async ({
    page,
  }) => {
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

    // Select all text so Shift+Alt+F triggers rangeFormatting.
    await page.keyboard.press('Control+A');

    // Format the selection (Shift+Alt+F → textDocument/rangeFormatting).
    await page.keyboard.press('Shift+Alt+F');

    // Give the LS a moment to respond (diagnostics push is async, not waited on).
    await page.waitForTimeout(1000);

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
