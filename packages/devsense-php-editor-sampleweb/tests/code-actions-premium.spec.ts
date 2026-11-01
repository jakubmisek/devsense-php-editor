import { test, expect, type Page } from '@playwright/test';

/**
 * Code actions end to end, without relying on diagnostics.
 *
 * Without a licence every title carries "(PREMIUM)" and running one shows the server's
 * licence notice (devsense:showMessage → window/showMessage). With DEVSENSE_PHP_LS_LICENSE
 * set in the environment of the test run (PhpEditor inherits it), the actions apply edits:
 *  - directly: the CodeAction carries a WorkspaceEdit ("Short array syntax []");
 *  - via workspace/executeCommand → server-sent workspace/applyEdit ("Add __construct ...");
 *  - codeAction/resolve is called for actions without an edit (devsense-php-ls returns them unchanged).
 * Licensed tests are skipped when the env variable is not set (e.g. CI without a secret).
 */
const LICENSED = !!process.env.DEVSENSE_PHP_LS_LICENSE?.trim();

async function openActions(page: Page, code: string, lineNumber: number, column: number) {
  await page.goto('/');
  await page.locator('.monaco-editor').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => window.phpEditor?.getConnectionState() === 'connected', null, { timeout: 30000 });
  await page.evaluate(({ code, lineNumber, column }) => {
    const ed = window.phpEditor!;
    ed.setValue(code);
    ed.editor.focus();
    ed.editor.setPosition({ lineNumber, column });
  }, { code, lineNumber, column });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.phpEditor!.editor.trigger('test', 'editor.action.codeAction', { apply: 'never' }));
  const menu = page.locator('.action-widget').first();
  await expect(menu).toBeVisible({ timeout: 10000 });
  return menu;
}

const getValue = (page: Page) => page.evaluate(() => window.phpEditor!.getValue());

test.describe('code actions (premium gating)', () => {
  test('unlicensed: actions are (PREMIUM) and running one shows the licence notice', async ({ page }) => {
    test.skip(LICENSED, 'DEVSENSE_PHP_LS_LICENSE is set');
    const menu = await openActions(page, '<?php\nclass A {}\n', 2, 8);
    await expect(menu).toContainText('(PREMIUM)');
    await page.getByRole('option', { name: /__construct/ }).first().click();
    await expect(page.locator('#server-message')).toContainText(/licensed users/i, { timeout: 10000 });
  });

  test('licensed: stats report licensed and titles have no (PREMIUM)', async ({ page }) => {
    test.skip(!LICENSED, 'DEVSENSE_PHP_LS_LICENSE not set');
    const menu = await openActions(page, '<?php\nclass A {}\n', 2, 8);
    await expect(menu).toContainText('__construct');
    await expect(menu).not.toContainText('(PREMIUM)');
  });

  test('licensed: command action applies its edit via workspace/applyEdit', async ({ page }) => {
    test.skip(!LICENSED, 'DEVSENSE_PHP_LS_LICENSE not set');
    await openActions(page, '<?php\nclass A {}\n', 2, 8);
    await page.getByRole('option', { name: /__construct/ }).first().click();
    await expect.poll(() => getValue(page), { timeout: 10000 }).toContain('function __construct()');
  });

  test('licensed: quick fix applies its direct WorkspaceEdit', async ({ page }) => {
    test.skip(!LICENSED, 'DEVSENSE_PHP_LS_LICENSE not set');
    await openActions(page, '<?php\n$x = array(1,2);\n', 2, 8);
    await page.getByRole('option', { name: /Short array syntax/ }).first().click();
    await expect.poll(() => getValue(page), { timeout: 10000 }).toMatch(/\$x = \[1, ?2\];/);
  });

  test('licensed: the licence never appears in WebSocket traffic', async ({ page }) => {
    test.skip(!LICENSED, 'DEVSENSE_PHP_LS_LICENSE not set');
    const secret = process.env.DEVSENSE_PHP_LS_LICENSE!.trim();
    const frames: string[] = [];
    page.on('websocket', (ws) => {
      ws.on('framereceived', (f) => frames.push(String(f.payload)));
      ws.on('framesent', (f) => frames.push(String(f.payload)));
    });
    await openActions(page, '<?php\nclass A {}\n', 2, 8);
    await page.getByRole('option', { name: /__construct/ }).first().click();
    await expect.poll(() => getValue(page), { timeout: 10000 }).toContain('__construct');
    const stats = await page.evaluate(async () => {
      const client = (window.phpEditor as unknown as { getDocumentUri(): string });
      return client.getDocumentUri();
    });
    expect(stats).toContain('untitled-workspace-');
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.some((f) => f.includes('"capabilities"'))).toBe(true);
    expect(frames.filter((f) => f.includes(secret))).toHaveLength(0);
  });
});
