import { test, expect } from '@playwright/test';

test.describe('DEVSENSE PHP Editor - Diagnostics', () => {
  test('diagnostics panel renders empty state', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('#diagnostics-panel');
    await expect(panel).toBeVisible();
  });

  test('diagnostics count updates', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('.diagnostics-header .count');
    await expect(header).toBeVisible();
    // Initial state: no diagnostics -> count shows 0
    await expect(header).toContainText('0');
  });
});
