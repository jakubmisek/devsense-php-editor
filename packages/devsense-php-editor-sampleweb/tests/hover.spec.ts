import { test, expect } from '@playwright/test';
import { openPlayground, setText, runAction } from './helpers';

/** textDocument/hover via the Monaco hover widget (editor.action.showHover at a known position). */
test.describe('DEVSENSE PHP Editor - textDocument/hover', () => {
  test.beforeEach(async ({ page }) => openPlayground(page));

  test('shows hover tooltip for strlen', async ({ page }) => {
    await setText(page, '<?php\necho strlen("hello");\n');
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const ed = (window as any).monaco.editor.getEditors()[0]; ed.setPosition({ lineNumber: 2, column: 8 }); ed.focus(); });
    await runAction(page, 'editor.action.showHover');
    const hover = page.locator('.monaco-hover:not(.hidden) .monaco-hover-content, .monaco-editor-hover:not(.hidden)');
    await expect(hover.first()).toContainText(/strlen/i, { timeout: 10000 });
  });
});
