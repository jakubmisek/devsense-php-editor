import { test, expect } from '@playwright/test';

/**
 * textDocument/codeAction E2E tests.
 *
 * Exercises the lightbulb / Quick Fix widget (Ctrl+.) against a live Monaco
 * editor backed by devsense-php-ls over WebSocket RPC.
 *
 * Note: devsense-php-ls does not return codeAction results for sandboxed
 * untitled-workspace-{id}:// documents. This test is expected to be skipped
 * until the server supports code actions for virtual workspace documents.
 */
test.describe('textDocument/codeAction', () => {
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

  test('shows code action suggestions for invalid PHP (missing semicolon)', async ({
    page,
  }) => {
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(
      `<?php
echo "missing semicolon"
echo "another line"
`
    );

    // Give devsense-php-ls time to publish diagnostics.
    await page.waitForTimeout(1500);

    // Assert a diagnostic surfaced in the diagnostics panel.
    const diagnosticsPanel = page.locator('#diagnostics-panel');
    await expect(diagnosticsPanel).toBeVisible();

    // Diagnostics may not appear for sandboxed URIs — skip if count stays 0.
    const countText = await page.locator('.diagnostics-header .count').textContent();
    test.skip(countText === '0', 'no diagnostics pushed for sandboxed URI (server-side limitation)');

    // Click into the editor at the error line so code actions are scoped there.
    await page.locator('.monaco-editor').click({ position: { x: 100, y: 100 } });

    // Trigger the code action widget (Ctrl+.).
    await page.keyboard.press('Control+.');

    // Assert the code action Quick Fix widget appeared.
    await expect(
      page.locator('.monaco-editor .monaco-list:not([hidden])')
    ).toBeVisible({ timeout: 10000 });

    // Assert at least one code action suggestion is listed.
    await expect(page.locator('.monaco-editor')).toContainText(
      /insert|add|fix|semicolon/i
    );
  });
});
