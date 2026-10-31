import { test, expect } from '@playwright/test';

test.describe('DEVSENSE PHP Editor - Language Features', () => {
  test('editor supports PHP language', async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('<?php echo "test";');
    await expect(page.locator('.monaco-editor')).toContainText('echo');
  });

  test('typing triggers editor content change', async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('<?php');
    await expect(page.locator('.monaco-editor')).toContainText('<?php');
  });
});
