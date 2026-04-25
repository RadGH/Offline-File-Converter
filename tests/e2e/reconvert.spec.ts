/**
 * Re-convert E2E test.
 * Adds a file, waits for it to be done, changes a global default (format),
 * verifies Re-convert button appears, clicks it, and confirms a new queue
 * item appears.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

test.describe('Re-convert button', () => {
  test('appears on done item when settings change, adds new queue entry on click', async ({ page }) => {
    await page.goto('/');

    // Wait for the app to load
    await expect(page.locator('.drop-zone')).toBeVisible();

    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const firstItem = page.locator('.queue-item-wrapper').first();
    await expect(firstItem).toBeVisible({ timeout: 5000 });

    // Wait for conversion to complete
    await expect(firstItem.locator('.queue-item__badge--done')).toBeVisible({ timeout: 30000 });

    // No Re-convert button yet (settings match)
    await expect(firstItem.locator('.queue-item__reconvert-btn')).toHaveCount(0);

    // Change format to trigger settings diff
    const formatSelect = page.locator('.simple-settings .rd-select').first();
    const currentFormat = await formatSelect.inputValue();
    const newFormat = currentFormat === 'webp' ? 'png' : 'webp';
    await formatSelect.selectOption(newFormat);

    // Re-convert button should now appear
    await expect(firstItem.locator('.queue-item__reconvert-btn')).toBeVisible({ timeout: 2000 });

    // Click Re-convert
    const countBefore = await page.locator('.queue-item-wrapper').count();
    await firstItem.locator('.queue-item__reconvert-btn').click();

    // A new item should appear in the queue
    await expect(page.locator('.queue-item-wrapper')).toHaveCount(countBefore + 1, { timeout: 5000 });
  });
});
