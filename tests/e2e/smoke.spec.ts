import { test, expect } from '@playwright/test';

test('homepage renders hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Convert & compress images in your browser');
  await expect(page.locator('.tagline').first()).toContainText('never leave your device');
});
