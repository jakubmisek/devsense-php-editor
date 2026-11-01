import { test, expect } from '@playwright/test';

const opt = (v: 'light' | 'dark' | 'system') => `[data-testid="theme-option-${v}"]`;

test.describe('DEVSENSE PHP Editor - Theme', () => {
  test('defaults to system theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
    await expect(page.locator(opt('system'))).toHaveAttribute('aria-checked', 'true');
  });

  test('icon switch is an accessible radiogroup', async ({ page }) => {
    await page.goto('/');
    const group = page.getByRole('radiogroup', { name: 'Color theme' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('radio')).toHaveCount(3);
    for (const name of ['Light theme', 'Dark theme', 'System theme']) {
      await expect(group.getByRole('radio', { name })).toHaveAttribute('title', name);
    }
  });

  test('switches between light/dark/system', async ({ page }) => {
    await page.goto('/');
    await page.click(opt('dark'));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator(opt('dark'))).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(opt('system'))).toHaveAttribute('aria-checked', 'false');

    await page.click(opt('light'));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator(opt('light'))).toHaveAttribute('aria-checked', 'true');

    await page.click(opt('system'));
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
    await expect(page.locator(opt('system'))).toHaveAttribute('aria-checked', 'true');
  });

  test('system follows prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.click(opt('system'));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('choice persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.click(opt('dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator(opt('dark'))).toHaveAttribute('aria-checked', 'true');
  });

  test('arrow keys move the selection with roving focus', async ({ page }) => {
    await page.goto('/');
    await page.click(opt('light'));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(opt('dark'))).toBeFocused();
    await expect(page.locator(opt('dark'))).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(opt('system'))).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(page.locator(opt('light'))).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('ArrowLeft'); // wraps back
    await expect(page.locator(opt('system'))).toBeFocused();
    // Only the checked radio is in the tab order.
    await expect(page.locator(opt('system'))).toHaveAttribute('tabindex', '0');
    await expect(page.locator(opt('light'))).toHaveAttribute('tabindex', '-1');
  });
});
