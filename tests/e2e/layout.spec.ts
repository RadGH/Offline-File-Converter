import { test, expect } from '@playwright/test';

test.describe('Layout & Ad Slots', () => {
  test('all three ad slots render at desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Top banner
    const topBanner = page.locator('[data-slot="top-banner"]');
    await expect(topBanner).toBeVisible();
    await expect(topBanner).toContainText('[Advertisement]');
    await expect(topBanner).toContainText('728');
    await expect(topBanner).toContainText('90');

    // Sidebar
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('[Advertisement]');
    await expect(sidebar).toContainText('300');
    await expect(sidebar).toContainText('600');

    // Bottom banner
    const bottomBanner = page.locator('[data-slot="bottom-banner"]');
    await expect(bottomBanner).toBeVisible();
    await expect(bottomBanner).toContainText('[Advertisement]');
  });

  test('sidebar ad is hidden at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    // Top banner still visible
    const topBanner = page.locator('[data-slot="top-banner"]');
    await expect(topBanner).toBeVisible();

    // Sidebar hidden
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toBeHidden();

    // Bottom banner still visible
    const bottomBanner = page.locator('[data-slot="bottom-banner"]');
    await expect(bottomBanner).toBeVisible();
  });
});
