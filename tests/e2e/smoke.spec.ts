import { test, expect } from '@playwright/test';

test('homepage renders main header (warm design)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.rd-header__logo')).toContainText('Image Converter');
  await expect(page.locator('.rd-header__tagline')).toContainText('files stay on your device');
});
