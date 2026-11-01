import { test, expect } from '@playwright/test';

test.describe('DEVSENSE PHP Editor Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads with correct title and editor', async ({ page }) => {
    // Top bar title
    await expect(page.locator('.top-bar .title')).toHaveText(
      'DEVSENSE PHP Editor Playground'
    );

    // Editor container exists
    await expect(page.locator('#editor-container')).toBeVisible();

    // Monaco editor renders
    await expect(page.locator('.monaco-editor')).toBeVisible();
  });

  test('theme switcher changes editor theme', async ({ page }) => {
    const select = page.locator('#theme-select');
    await expect(select).toBeVisible();

    // Switch to dark
    await select.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Switch to light
    await select.selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Switch to automatic
    await select.selectOption('automatic');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      /light|dark/
    );
  });

  test('diagnostics panel is present and collapsible', async ({ page }) => {
    const panel = page.locator('#diagnostics-panel');
    await expect(panel).toBeVisible();

    // Toggle diagnostics panel
    const header = panel.locator('.diagnostics-header');
    await expect(header).toBeVisible();
    await header.click();

    // List should toggle
    const list = panel.locator('.diagnostics-list');
    await expect(list).toBeHidden();
    await header.click();
    await expect(list).toBeVisible();
  });

  test('editor accepts typing', async ({ page }) => {
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('// test comment');
    await expect(page.locator('.monaco-editor')).toContainText('test comment');
  });

  test('bottom diagnostics panel shows errors when PHP has syntax errors', async ({ page }) => {
    // devsense-php-ls pushes diagnostics lazily (1-3 s after the last edit).
    await page.waitForFunction(() => (window as any).monaco?.editor?.getEditors?.().length > 0);
    await page.waitForTimeout(1500);
    await page.evaluate(() => (window as any).monaco.editor.getEditors()[0].getModel().setValue('<?php\n$q = = ;\n'));
    const panel = page.locator('#diagnostics-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('.diagnostics-header .count')).not.toHaveText('0', { timeout: 10000 });
    await expect(panel).toContainText(/syntax error/i);
  });
});
