import { test, expect } from '@playwright/test';

test.describe('DEVSENSE PHP Editor - Theme', () => {
  test('defaults to automatic theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      /light|dark/
    );
  });

  test('switches between light/dark/automatic', async ({ page }) => {
    await page.goto('/');
    const select = page.locator('#theme-select');

    await select.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await select.selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await select.selectOption('automatic');
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      /light|dark/
    );
  });
});
