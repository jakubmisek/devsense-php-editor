import { test, expect } from '@playwright/test';

/**
 * textDocument/codeAction E2E tests.
 *
 * Exercises the lightbulb / Quick Fix widget (Ctrl+.) against a live Monaco
 * editor backed by devsense-php-ls over WebSocket RPC.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types invalid PHP to trigger a diagnostic
 *   4. Waits for the diagnostic to appear
 *   5. Triggers code actions and asserts suggestions appear
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
    await page.waitForTimeout(3000);
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
    await page.waitForTimeout(4000);

    // Assert a diagnostic surfaced in the diagnostics panel.
    const diagnosticsPanel = page.locator('#diagnostics-panel');
    await expect(diagnosticsPanel).toBeVisible();
    await expect(page.locator('.diagnostics-header .count')).not.toContainText(
      '0'
    );

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
