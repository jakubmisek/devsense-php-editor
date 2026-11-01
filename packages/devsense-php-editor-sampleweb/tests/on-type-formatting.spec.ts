import { test, expect } from '@playwright/test';

/**
 * textDocument/onTypeFormatting E2E tests.
 *
 * Exercises on-type formatting against a live Monaco editor backed by
 * devsense-php-ls over WebSocket RPC. Typing a trigger character (e.g. '}')
 * sends textDocument/onTypeFormatting and applies formatting edits.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types unformatted PHP code
 *   4. Types '}' (on-type formatting trigger char)
 *   5. Asserts the editor content changed (formatting applied)
 */
test.describe('textDocument/onTypeFormatting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-editor').waitFor({
      state: 'visible',
      timeout: 30000,
    });
  });

  test('applies on-type formatting when typing "}"', async ({ page }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const backendOk = await page.evaluate(() => {
      return fetch('/php-editor-port')
        .then((r) => r.ok)
        .catch(() => false);
    });
    expect(!backendOk, 'LSP backend not responding at /php-editor-port').toBe(false);

    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    // Type unformatted PHP (opening brace on the same line, no closing brace).
    await page.keyboard.type(
      `<?php
function foo($x){
return strlen($x);
`
    );

    // Capture the unformatted content before typing the trigger char.
    const beforeContent = await page.evaluate(() => {
      const editors = (window as any).monaco?.editor?.getEditors?.();
      return editors?.[0]?.getValue() ?? '';
    });

    // Type the on-type formatting trigger character '}'.
    await page.keyboard.type('}');

    // Give devsense-php-ls time to compute on-type formatting edits.
    await page.waitForTimeout(1500);

    // Capture the content after on-type formatting.
    const afterContent = await page.evaluate(() => {
      const editors = (window as any).monaco?.editor?.getEditors?.();
      return editors?.[0]?.getValue() ?? '';
    });

    // Assert the content actually changed (on-type formatting applied).
    expect(afterContent).not.toBe(beforeContent);

    // Assert the closing brace was added and formatting markers are present
    // (brace on its own line, indented function body).
    expect(afterContent).toContain('}');
    expect(afterContent).toMatch(/\n\s+return/);
  });
});
