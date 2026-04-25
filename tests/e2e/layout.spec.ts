import { test, expect } from '@playwright/test';

test.describe('Layout', () => {
  test('core layout renders on desktop (warm main)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.locator('.rd-header__logo')).toContainText('Image Converter');
    await expect(page.locator('.rd-card')).toBeVisible();
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('.rd-footer')).toContainText('No uploads');
  });

  test('core layout renders on mobile (warm main)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    await expect(page.locator('.rd-header__logo')).toBeVisible();
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('.rd-footer')).toBeVisible();
  });

  test('no ad slots in DOM', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ad-slot')).toHaveCount(0);
  });

  // Old dark design still accessible at /upscale.html
  test('upscale layout renders with site-header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/upscale.html');
    await expect(page.locator('.site-header h1')).toContainText('Convert & compress');
    await expect(page.locator('.drop-zone')).toBeVisible();
    await expect(page.locator('.site-footer')).toContainText('No uploads');
  });
});
