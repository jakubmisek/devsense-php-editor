import { test, expect } from '@playwright/test';
import { setText } from './helpers';

/**
 * textDocument/inlayHint E2E specs for devsense-php-editor-sampleweb.
 *
 * Exercises Monaco inlay hints backed by devsense-php-ls over the WebSocket
 * RPC router (InlayHintProvider in providers.browser.js).
 *
 * Each test is self-contained: it navigates to /, waits for the Monaco editor
 * to render, and fails if the PHP language server backend isn't
 * responding (port file unreachable).
 */
test.describe('DEVSENSE PHP Editor - textDocument/inlayHint', () => {
  const EDITOR = '.monaco-editor';
  const INLAY_HINT = '.monaco-editor .mtc-inlay-hint, .monaco-editor .inlay-hint';

  test.beforeEach(async ({ page }) => {
    // Skip gracefully when the devsense-php-ls backend isn't reachable.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'devsense-php-ls backend not responding (no /php-editor-port)').toBe(false);

    await page.goto('/');
    await page.locator(EDITOR).waitFor({ state: 'visible', timeout: 30000 });
    // Allow the LSP initialize/didOpen handshake to complete.
    await page.waitForTimeout(1500);
  });

  test('shows inlay hints for function call parameters', async ({ page }) => {
    await page.locator(EDITOR).click();
    // Type a PHP function call with parameters to trigger inlay hints.
    await setText(page, '<?php\nfunction greet($name, $times) { return $name; }\ngreet("hi", 3);\n');
    // Wait for inlay hints to be requested and rendered.
    await page.waitForTimeout(4000);

    // Editor remains visible and content rendered.
    await expect(page.locator(EDITOR)).toBeVisible();
    await expect(page.locator(EDITOR)).toContainText('greet');

    // Monaco renders inlay hints as injected text (before/after content) on model decorations;
    // there is no stable DOM class, so read the injected labels from the editor.
    await expect.poll(async () => page.evaluate(() => {
      const ed = (window as any).monaco.editor.getEditors()[0];
      return ed.getModel().getAllDecorations()
        .map((d: any) => d.options.before?.content ?? d.options.after?.content ?? '')
        .filter((c: string) => c.trim().length > 0).join('|');
    }), { timeout: 10000, message: 'inlay hint labels injected into the editor' }).toMatch(/name|times/);
  });
});
