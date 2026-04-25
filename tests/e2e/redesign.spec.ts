import { test, expect } from '@playwright/test';

test.describe('Redesign', () => {
  test('page returns 200 and contains expected title', async ({ page }) => {
    const response = await page.goto('/redesign.html');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Image Converter/);
  });

  test('desktop: entire body content fits within viewport height (1280×800)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/redesign.html');

    // Wait for app to hydrate
    await expect(page.locator('.drop-zone')).toBeVisible();

    const fits = await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight + 1
    );
    expect(fits).toBe(true);
  });

  test('mobile: drop zone visible and queue is after drop zone in DOM (375×640)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 640 });
    await page.goto('/redesign.html');

    await expect(page.locator('.drop-zone')).toBeVisible();

    // Queue card should exist in DOM after the drop zone
    const dropZoneIndex = await page.evaluate(
      () => [...document.querySelectorAll('*')].indexOf(document.querySelector('.drop-zone')!)
    );
    const fileQueueIndex = await page.evaluate(
      () => [...document.querySelectorAll('*')].indexOf(document.querySelector('.file-queue')!)
    );
    expect(fileQueueIndex).toBeGreaterThan(dropZoneIndex);
  });

  test('drop zone exists and is clickable', async ({ page }) => {
    await page.goto('/redesign.html');
    const dropZone = page.locator('.drop-zone');
    await expect(dropZone).toBeVisible();
    await expect(dropZone).toHaveAttribute('role', 'button');
    // Verify it is in the tab order (clickable)
    await expect(dropZone).toHaveAttribute('tabindex', '0');
  });

  test('no upscale UI in DOM', async ({ page }) => {
    await page.goto('/redesign.html');
    await expect(page.locator('text="AI upscaling"')).toHaveCount(0);
    await expect(page.locator('.upscale-model-panel')).toHaveCount(0);
    await expect(page.locator('#global-upscale-checkbox')).toHaveCount(0);
  });
});
