import { test, expect } from '@playwright/test';

/**
 * textDocument/signatureHelp E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises the Monaco signature help popup backed by devsense-php-ls over the
 * WebSocket RPC router (SignatureHelpProvider, trigger characters "(", ",", "<").
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/signatureHelp', () => {
  const EDITOR = '.monaco-editor';
  // Use a visible signature help selector to avoid strict-mode violations.
  const SIGNATURE =
    '.monaco-signature-help:not([hidden]), .monaco-widget.signature-help:not([hidden]), .parameter-help:not([hidden])';

  test.beforeEach(async ({ page }) => {
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    test.skip(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)');

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(3000);
  });

  test('shows signature help popup for strlen( with parameter info', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type the function name and opening paren — "(" is a signature help trigger.
    await page.keyboard.insertText('<?php strlen(');
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
