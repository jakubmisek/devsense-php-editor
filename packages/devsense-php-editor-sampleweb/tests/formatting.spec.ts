import { test, expect } from '@playwright/test';
import { openPlayground, setText, getText, runAction } from './helpers';

/**
 * Document formatting. devsense-php-ls advertises documentFormattingProvider=false and
 * implements formatting only via textDocument/rangeFormatting, so FormattingProvider sends
 * rangeFormatting over the full document range.
 */
test.describe('textDocument/formatting', () => {
  test.beforeEach(async ({ page }) => openPlayground(page));

  test('Format Document reformats the whole file (via rangeFormatting)', async ({ page }) => {
    const before = `<?php\nfunction foo($x){return strlen($x);}\nclass Bar{public function baz($y){echo $y;}}\n`;
    await setText(page, before);
    await page.waitForTimeout(500);
    await runAction(page, 'editor.action.formatDocument');
    await expect.poll(() => getText(page), { timeout: 10000 }).not.toBe(before);
    const after = await getText(page);
    expect(after).toMatch(/\n\s+return strlen\(\$x\);/);
    expect(after).toMatch(/\n\s+echo \$y;/);
  });

  test('Shift+Alt+F keyboard shortcut formats the document', async ({ page }) => {
    const before = `<?php\nfunction foo($x){return $x;}\n`;
    await setText(page, before);
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('Shift+Alt+F');
    await expect.poll(() => getText(page), { timeout: 10000 }).not.toBe(before);
  });
});
