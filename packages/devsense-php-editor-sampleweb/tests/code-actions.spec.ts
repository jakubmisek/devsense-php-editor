import { test, expect } from '@playwright/test';

/**
 * textDocument/codeAction E2E tests.
 *
 * Exercises the lightbulb / Quick Fix widget (Ctrl+.) against a live Monaco
 * editor backed by devsense-php-ls over WebSocket RPC.
 *
 * Diagnostics for untitled-workspace-{id}:// documents need devsense-php-ls >= 1.0.19497.
 */
test.describe('textDocument/codeAction', () => {
  test.beforeEach(async ({ page }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const portRes = await page.request.fetch('/php-editor-port', {
      failOnStatusCode: false,
    });
    const backendAvailable = portRes.ok();
    expect(!backendAvailable, 'LSP backend not responding at /php-editor-port').toBe(false);

    await page.goto('/');
    await page.locator('.monaco-editor').waitFor({
      state: 'visible',
      timeout: 30000,
    });
    await page.waitForFunction(() => (window as unknown as { phpEditor?: { getConnectionState(): string } }).phpEditor?.getConnectionState() === 'connected', null, { timeout: 30000 });
    await page.waitForTimeout(1000);
  });

  test('shows code action suggestions for invalid PHP (missing semicolon)', async ({
    page,
  }) => {
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.evaluate(() => (window as unknown as { phpEditor: { setValue(v: string): void } }).phpEditor.setValue('<?php\nclass A {}\necho "missing semicolon"\necho "another line";\n'));

    // devsense-php-ls pushes diagnostics lazily, 1-3 s after typing stops.

    // Assert a diagnostic surfaced in the diagnostics panel.
    const diagnosticsPanel = page.locator('#diagnostics-panel');
    await expect(diagnosticsPanel).toBeVisible();

    await expect(page.locator('.diagnostics-header .count')).not.toHaveText('0', { timeout: 10000 });

    // Put the caret on the class (refactorings are offered there) and open the code action menu (never auto-apply).
    // Retry: under load Monaco may cancel the explicit request in favour of the lightbulb one.
    const menu = page.locator('.action-widget').first();
    await expect(async () => {
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        const w = window as unknown as { phpEditor: { editor: { setPosition(p: { lineNumber: number; column: number }): void; focus(): void; trigger(s: string, id: string, a: unknown): void } } };
        w.phpEditor.editor.setPosition({ lineNumber: 2, column: 8 });
        w.phpEditor.editor.focus();
        w.phpEditor.editor.trigger('test', 'editor.action.codeAction', { apply: 'never' });
      });
      await expect(menu).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 20000 });
    await expect(page.getByRole('option').first()).toBeVisible();
  });
});
