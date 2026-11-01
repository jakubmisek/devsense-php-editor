import { test, expect } from '@playwright/test';

/**
 * textDocument/signatureHelp E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises the Monaco signature help popup backed by devsense-php-ls over the
 * WebSocket RPC router (SignatureHelpProvider, trigger characters "(", ",", "<").
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and fails if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/signatureHelp', () => {
  const EDITOR = '.monaco-editor';
  // Use a visible signature help selector to avoid strict-mode violations.
  const SIGNATURE = '.parameter-hints-widget.visible';

  test.beforeEach(async ({ page }) => {
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)').toBe(false);

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(3000);
  });

  test('shows signature help popup for strlen( with parameter info', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type the function name and opening paren — "(" is a signature help trigger.
    // insertText() does not fire trigger characters; type "(" as a real keystroke.
    await page.evaluate(() => {
      const ed = (window as any).monaco.editor.getEditors()[0];
      ed.getModel().setValue('<?php\nstrlen');
      ed.setPosition({ lineNumber: 2, column: 7 });
      ed.focus();
    });
    await page.waitForTimeout(1000);
    await page.keyboard.type('(');
    // Give the LS time to compute signature help.
    await page.waitForTimeout(4000);

    // The signature help popup should appear showing parameters for strlen.
    const signature = page.locator(SIGNATURE);
    await expect(signature.first()).toBeVisible({ timeout: 10000 });
    // Assert the popup references strlen / its parameters.
    await expect(signature.first()).toContainText(/strlen|string/i, {
      timeout: 10000,
    });
  });
});
