import { test, expect } from '@playwright/test';

test.describe('Layout', () => {
  test('core layout renders on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.locator('.site-header h1')).toContainText('Convert & compress');
    await expect(page.locator('.converter-col')).toBeVisible();
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('.site-footer')).toContainText('No uploads');
  });

  test('core layout renders on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    await expect(page.locator('.site-header h1')).toBeVisible();
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('.site-footer')).toBeVisible();
  });

  test('no ad slots in DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ad-slot')).toHaveCount(0);
  });
});
