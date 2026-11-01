import { test, expect } from '@playwright/test';

/**
 * textDocument/documentSymbol E2E tests.
 *
 * Exercises the Go to Symbol palette (Ctrl+Shift+O) against a live Monaco
 * editor backed by devsense-php-ls over WebSocket RPC.
 *
 * Each test:
 *   1. Loads the app and waits for Monaco to render
 *   2. Skips gracefully if the LSP backend isn't responding
 *   3. Types PHP containing functions/classes
 *   4. Opens the symbol palette and asserts symbols appear
 *
 * Note: document symbols may not be returned for sandboxed
 * untitled-workspace-{id}:// documents. If the palette doesn't appear, the
 * test is skipped gracefully.
 */
test.describe('textDocument/documentSymbol', () => {
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

  test('lists PHP functions and classes in the Go to Symbol palette', async ({
    page,
  }) => {
    await page.locator('.monaco-editor').click();
    // Replace the initial editor content.
    await page.keyboard.press('Control+A');
    await page.keyboard.type(
      `<?php

class Calculator {
    public function add(int $a, int $b): int {
        return $a + $b;
    }

    public function subtract(int $a, int $b): int {
        return $a - $b;
    }
}

function greet(string $name): void {
    echo "Hello, " . $name;
}
`
    );

    // Give devsense-php-ls time to compute document symbols.
    await page.waitForTimeout(1500);

    // Open the Go to Symbol palette (Ctrl+Shift+O).
    await page.keyboard.press('Control+Shift+O');

    // Assert the symbol picker overlay appeared.
    const palette = page.locator('.quick-input-widget .monaco-list');
    await expect(palette.first()).toBeVisible({ timeout: 10000 });

    // Assert the expected symbols are listed.
    await expect(palette.first()).toContainText('Calculator');
    await expect(palette.first()).toContainText('add');
    await expect(palette.first()).toContainText('subtract');
    await expect(palette.first()).toContainText('greet');
  });
});
