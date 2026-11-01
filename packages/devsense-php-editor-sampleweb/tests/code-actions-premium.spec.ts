import { test, expect } from '@playwright/test';

/**
 * Code actions end to end without relying on diagnostics:
 * list actions at a position, then run one (its LSP command goes to the server via
 * workspace/executeCommand). Without DEVSENSE_PHP_LS_LICENSE the titles carry
 * "(PREMIUM)" and running one shows the server's licence notice.
 */
test.describe('code actions (premium gating)', () => {
  test('lists actions and runs one through workspace/executeCommand', async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-editor').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => window.phpEditor?.getConnectionState() === 'connected', null, { timeout: 30000 });

    await page.evaluate(() => {
      const ed = window.phpEditor!;
      ed.setValue('<?php\nclass A {}\n$x = array(1, 2);\n');
      ed.editor.focus();
      ed.editor.setPosition({ lineNumber: 2, column: 8 }); // on the class name
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => window.phpEditor!.editor.trigger('test', 'editor.action.codeAction', {}));
    const menu = page.locator('.action-widget').first();
    await expect(menu).toBeVisible({ timeout: 10000 });
    await expect(menu).toContainText(/__construct|\/\*\*/);

    const titles = (await menu.textContent()) ?? '';
    const before = await page.evaluate(() => window.phpEditor!.getValue());

    // Run the "Add __construct" action.
    await page.getByRole('option', { name: /__construct/ }).first().click();

    if (titles.includes('(PREMIUM)')) {
      // Unlicensed: the server answers the command with a window/showMessage notice.
      await expect(page.locator('#server-message')).toContainText(/licensed users/i, { timeout: 10000 });
    } else {
      // Licensed: the action's edit (direct, resolved, or via workspace/applyEdit) changes the document.
      await expect.poll(() => page.evaluate(() => window.phpEditor!.getValue()), { timeout: 10000 }).not.toBe(before);
    }
  });
});
