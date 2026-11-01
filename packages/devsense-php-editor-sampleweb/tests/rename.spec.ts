import { test, expect } from '@playwright/test';
import { openPlayground, setText, getText } from './helpers';

/** textDocument/prepareRename + textDocument/rename via F2. */
test.describe('DEVSENSE PHP Editor - textDocument/rename', () => {
  test.beforeEach(async ({ page }) => openPlayground(page));

  test('F2 on a variable opens rename input and renames all occurrences', async ({ page }) => {
    await setText(page, '<?php\nfunction f() {\n$count = 1;\n$count = $count + 1;\necho $count;\n}\n');
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const ed = (window as any).monaco.editor.getEditors()[0]; ed.setPosition({ lineNumber: 3, column: 3 }); ed.focus(); });
    await page.keyboard.press('F2');
    const input = page.locator('.rename-box input, .rename-input');
    await expect(input.first()).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Control+A');
    await page.keyboard.type('$total');
    await page.keyboard.press('Enter');
    await expect.poll(() => getText(page), { timeout: 10000 }).not.toContain('count');
    expect((await getText(page)).match(/\$total\b/g)?.length).toBe(4);
  });
});
