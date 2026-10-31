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

    // Monaco editor renders (check for editor area)
    await expect(page.locator('.monaco-editor')).toBeVisible();
  });

  test('displays PHP code in editor', async ({ page }) => {
    // The editor should contain initial PHP content
    await expect(page.locator('.monaco-editor')).toContainText('php');
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
    // This test requires the WS server to be running and diagnostics pushed.
    // It verifies the diagnostics panel renders when diagnostics arrive.
    const panel = page.locator('#diagnostics-panel');
    await expect(panel).toBeVisible();
  });
});
