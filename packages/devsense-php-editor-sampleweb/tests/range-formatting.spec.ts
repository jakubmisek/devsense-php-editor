import { test, expect } from '@playwright/test';

/**
 * textDocument/rangeFormatting E2E tests.
 *
 * Exercises range formatting (format selection) against a live Monaco editor
 * backed by devsense-php-ls over WebSocket RPC.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types PHP code with an unformatted block
 *   4. Selects a range of that code
 *   5. Formats the range
 *   6. Asserts the selected range is formatted while the rest is unchanged
 */
test.describe('textDocument/rangeFormatting', () => {
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
    await page.waitForTimeout(3000);
  });

  test('formats only the selected range of PHP code', async ({ page }) => {
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(
      `<?php
function foo($x){return strlen($x);}
echo "unchanged";
`
    );

    // Capture content before range formatting.
    const beforeContent = await page.evaluate(() => {
      const editors = (window as any).monaco?.editor?.getEditors?.();
      return editors?.[0]?.getValue() ?? '';
    });

    // Select the first line (the unformatted function) by triple-clicking it.
    await page.locator('.monaco-editor').click({ position: { x: 50, y: 60 } });
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.mouse.down({ button: 'left' });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(1000);

    // Format the selected range (Ctrl+K Ctrl+F is the default range format binding;
    // Monaco also binds Shift+Alt+F to format selection when a selection exists).
    await page.keyboard.press('Control+K');
    await page.keyboard.press('F');

    // Give devsense-php-ls more time to compute range formatting edits.
    await page.waitForTimeout(4000);

    // Capture content after range formatting.
    const afterContent = await page.evaluate(() => {
      const editors = (window as any).monaco?.editor?.getEditors?.();
      return editors?.[0]?.getValue() ?? '';
    });

    // Assert the selected range changed (was formatted).
    expect(afterContent).not.toBe(beforeContent);

    // Assert the unselected line ("echo \"unchanged\";") is preserved.
    expect(afterContent).toContain('echo "unchanged";');

    // Assert the formatted function now has spaces around braces/operators.
    expect(afterContent).toMatch(/function foo\(\$x\) \{/);
  });
});
