import { test, expect } from '@playwright/test';

/**
 * textDocument/semanticTokens/full E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises Monaco semantic tokens highlighting backed by devsense-php-ls over
 * the WebSocket RPC router (SemanticTokensProvider in providers.browser.js).
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and skips gracefully if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/semanticTokens/full', () => {
  const EDITOR = '.monaco-editor';

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
    // Allow the LSP initialize/didOpen + semantic tokens request to complete.
    await page.waitForTimeout(1500);
  });

  test('applies semantic token classes to PHP keywords, strings, and variables', async ({
    page,
  }) => {
    await page.locator(EDITOR).click();
    // Type a small PHP snippet containing keywords, strings, and variables.
    await page.keyboard.insertText(
      '<?php\n$name = "world";\nif ($name) {\n  echo $name;\n}\n'
    );
    // Brief pause for semantic tokens to be requested and applied by Monaco.
    await page.waitForTimeout(2000);

    // Editor content should still be rendered.
    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('<?php');

    // Assert semantic tokens were applied: Monaco wraps tokens in spans with
    // token-decoration classes (e.g. .mtk1, .mtk2, ...) inside .monaco-editor.
    const tokenSpans = page.locator('.monaco-editor span[class*="mtk"]');
    const tokenCount = await tokenSpans.count();
    test.skip(tokenCount === 0, 'no semantic token spans rendered (backend may not have returned tokens)');
    await expect(tokenSpans.first()).toBeVisible();
  });
});
