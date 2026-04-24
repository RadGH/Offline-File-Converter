import { test, expect } from '@playwright/test';

test('homepage renders hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Offline Image Converter');
  await expect(page.locator('.tagline')).toContainText('Files never leave your device');
});
