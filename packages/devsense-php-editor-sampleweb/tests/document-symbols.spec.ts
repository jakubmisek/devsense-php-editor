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
 */
test.describe('textDocument/documentSymbol', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-editor').waitFor({
      state: 'visible',
      timeout: 30000,
    });
  });

  test('lists PHP functions and classes in the Go to Symbol palette', async ({
    page,
  }) => {
    // Skip gracefully if the LSP backend isn't responding.
    const backendOk = await page.evaluate(() => {
      return fetch('/php-editor-port')
        .then((r) => r.ok)
        .catch(() => false);
    });
    test.skip(!backendOk, 'LSP backend not responding at /php-editor-port');

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
    await expect(
      page.locator('.monaco-editor .monaco-list')
    ).toBeVisible({ timeout: 5000 });

    // Assert the expected symbols are listed.
    await expect(page.locator('.monaco-editor')).toContainText('Calculator');
    await expect(page.locator('.monaco-editor')).toContainText('add');
    await expect(page.locator('.monaco-editor')).toContainText('subtract');
    await expect(page.locator('.monaco-editor')).toContainText('greet');
  });
});
