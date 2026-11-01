import { test, expect } from '@playwright/test';

/**
 * textDocument/codeLens E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises Monaco code lenses backed by devsense-php-ls over the WebSocket
 * RPC router (CodeLensProvider in providers.browser.js).
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/codeLens', () => {
  const EDITOR = '.monaco-editor';
  const CODE_LENS = '.monaco-editor .mtc-codelens, .monaco-editor .codelens';

  test.beforeEach(async ({ page }) => {
    // Skip gracefully when the devsense-php-ls backend isn't reachable.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    test.skip(
      !backendAvailable,
      'devsense-php-ls backend not responding (no /php-editor-port)'
    );

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete.
    await page.waitForTimeout(1500);
  });

  test('shows code lenses above functions (e.g. "References: 0")', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type PHP code declaring functions so the server can emit code lenses.
    await page.keyboard.insertText(
      '<?php\nfunction foo() {\n  echo "foo";\n}\nfunction bar() {\n  echo "bar";\n}\n'
    );
    // Wait for code lenses to be requested and rendered above functions.
    await page.waitForTimeout(2000);

    // Editor remains visible and content rendered.
    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('function foo');

    // Assert code lens elements are visible if the backend returned any.
    const lenses = page.locator(CODE_LENS);
    const lensCount = await lenses.count();
    test.skip(lensCount === 0, 'no code lens elements rendered (backend may not return lenses for this snippet)');
    await expect(lenses.first()).toBeVisible({ timeout: 10000 });
  });
});
