/**
 * Phase 9 — A11y smoke tests.
 * Verifies: skip link, drop zone ARIA, button accessible names, progress bar ARIA.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

test.describe('A11y — structural ARIA', () => {
  test('skip link exists and is focusable', async ({ page }) => {
    await page.goto('/');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toHaveCount(1);
    await expect(skipLink).toHaveAttribute('href', '#main');

    // Tab to focus it and verify it becomes visible
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
  });

  test('drop zone has role="button" and tabindex="0"', async ({ page }) => {
    await page.goto('/');
    const dropZone = page.locator('.drop-zone');
    await expect(dropZone).toHaveAttribute('role', 'button');
    await expect(dropZone).toHaveAttribute('tabindex', '0');
  });

  test('all primary buttons have accessible names', async ({ page }) => {
    await page.goto('/');
    // Check all <button> elements have either text content or aria-label
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const ariaLabel = await btn.getAttribute('aria-label');
      const textContent = (await btn.textContent())?.trim() ?? '';
      const hasName = (ariaLabel && ariaLabel.trim().length > 0) || textContent.length > 0;
      expect(
        hasName,
        `Button at index ${i} has no accessible name (aria-label="${ariaLabel}", text="${textContent}")`
      ).toBe(true);
    }
  });

  test('progress bar has required ARIA attributes when conversion is active', async ({ page }) => {
    await page.goto('/');

    // Upload a file and wait for processing to start
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG]);

    // Wait for the item to appear
    await expect(page.locator('.queue-item')).toHaveCount(1, { timeout: 5_000 });

    // Wait for done (processing may be very fast)
    await page.waitForFunction(
      () => document.querySelectorAll('.queue-item__badge--done').length === 1 ||
            document.querySelectorAll('.queue-item__badge--processing').length === 1,
      { timeout: 15_000 }
    );

    // Progress bar should exist in the DOM with required ARIA attrs
    const progressBar = page.locator('.queue-item__progress-bar').first();
    await expect(progressBar).toHaveAttribute('role', 'progressbar');
    await expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    await expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    // aria-valuenow should be a number string
    const valuenow = await progressBar.getAttribute('aria-valuenow');
    expect(valuenow).not.toBeNull();
    expect(Number(valuenow)).toBeGreaterThanOrEqual(0);
  });
});
