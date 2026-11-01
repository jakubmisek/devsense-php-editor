import { test, expect } from '@playwright/test';
import { openPlayground, setText, getText, runAction } from './helpers';

test.describe('textDocument/rangeFormatting', () => {
  test.beforeEach(async ({ page }) => openPlayground(page));

  test('formats only the selected range of PHP code', async ({ page }) => {
    const before = `<?php\nfunction foo($x){return strlen($x);}\nfunction bar($y){return $y;}\n`;
    await setText(page, before);
    await page.waitForTimeout(500);
    // Select line 2 only (the foo function).
    await page.evaluate(() => {
      const ed = (window as any).monaco.editor.getEditors()[0];
      ed.setSelection({ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: ed.getModel().getLineMaxColumn(2) });
      ed.focus();
    });
    await runAction(page, 'editor.action.formatSelection');
    await expect.poll(() => getText(page), { timeout: 10000 }).not.toBe(before);
    const after = await getText(page);
    expect(after).toMatch(/\n\s+return strlen\(\$x\);/);
    // The unselected line is untouched.
    expect(after).toContain('function bar($y){return $y;}');
  });
});
