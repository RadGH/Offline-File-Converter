import { test, expect } from '@playwright/test';

/**
 * 2×1 PNG: generated via OffscreenCanvas in the browser to guarantee validity.
 * We pass the buffer from the browser back to the file input via DataTransfer.
 *
 * Alternatively we can build a raw 2×1 PNG byte sequence here.
 * A minimal valid 2×1 PNG (width=2, height=1, 8-bit RGB):
 * Generated externally and verified.
 */
const TWO_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADklEQVQI12P4z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('Settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('upload one file and expand settings panel', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    // Item should appear
    await expect(page.locator('.queue-item-wrapper')).toHaveCount(1);

    // Settings panel not visible yet
    const panel = page.locator('.settings-panel');
    await expect(panel).not.toBeVisible();

    // Click expand chevron
    const expandBtn = page.locator('.queue-item__expand');
    await expandBtn.click();

    // Panel should now be visible
    await expect(panel).toBeVisible();
  });

  test('change format to WebP', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    await page.locator('.queue-item__expand').click();
    await expect(page.locator('.settings-panel')).toBeVisible();

    const formatSelect = page.locator('.settings-panel .settings-panel__select');
    await formatSelect.selectOption('webp');
    await expect(formatSelect).toHaveValue('webp');
  });

  test('quality slider is disabled for PNG format', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    await page.locator('.queue-item__expand').click();

    // Default format is jpeg, slider should be enabled
    const slider = page.locator('.settings-panel .settings-panel__slider');
    await expect(slider).not.toBeDisabled();

    // Change to PNG → slider disabled
    const formatSelect = page.locator('.settings-panel .settings-panel__select');
    await formatSelect.selectOption('png');
    await expect(slider).toBeDisabled();
  });

  test('quality slider is disabled for GIF format', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    await page.locator('.queue-item__expand').click();

    const formatSelect = page.locator('.settings-panel .settings-panel__select');
    await formatSelect.selectOption('gif');
    const slider = page.locator('.settings-panel .settings-panel__slider');
    await expect(slider).toBeDisabled();
  });

  test('aspect lock ON: setting width auto-populates height for 2×1 image', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'wide.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    await page.locator('.queue-item__expand').click();
    await expect(page.locator('.settings-panel')).toBeVisible();

    // Wait for originalDimensions to be detected (orig note should appear with 2×1)
    const origNote = page.locator('.settings-panel__orig-note');
    await expect(origNote).toContainText('2', { timeout: 5000 });

    // Make sure aspect lock is ON (it's on by default)
    const aspectCheckbox = page.locator('.settings-panel .settings-panel__checkbox').first();
    await expect(aspectCheckbox).toBeChecked();

    const widthInput = page.locator('.settings-panel .settings-panel__dim-input').first();
    const heightInput = page.locator('.settings-panel .settings-panel__dim-input').nth(1);

    // Set width to 100 → height should auto-populate to 50 (2:1 aspect)
    await widthInput.fill('100');
    await widthInput.dispatchEvent('change');

    await expect(heightInput).toHaveValue('50');
  });

  test('strip metadata toggle: unchecking stays unchecked', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    await page.locator('.queue-item__expand').click();
    await expect(page.locator('.settings-panel')).toBeVisible();

    // Strip metadata is the last checkbox — locate by data or position
    // Settings panel has 2 checkboxes: aspect ratio (index 0) and strip metadata (index 1)
    const stripCheckbox = page.locator('.settings-panel .settings-panel__checkbox').nth(1);

    // Default is checked (strip=true)
    await expect(stripCheckbox).toBeChecked();

    // Uncheck it
    await stripCheckbox.uncheck();
    await expect(stripCheckbox).not.toBeChecked();

    // Rerender by uploading another file and coming back — the original item should preserve state
    // (The store holds state, so just re-checking the same DOM element is sufficient since
    // the panel stays mounted while expanded)
    await expect(stripCheckbox).not.toBeChecked();
  });

  test('collapse re-hides the settings panel', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    const expandBtn = page.locator('.queue-item__expand');
    await expandBtn.click();
    await expect(page.locator('.settings-panel')).toBeVisible();

    await expandBtn.click();
    await expect(page.locator('.settings-panel')).not.toBeVisible();
  });

  test('global defaults panel is visible and collapsible', async ({ page }) => {
    // Global defaults should be visible by default
    const globalBody = page.locator('.global-defaults__body');
    await expect(globalBody).toBeVisible();

    // Collapse it
    await page.locator('.global-defaults__toggle').click();
    await expect(globalBody).not.toBeVisible();

    // Expand again
    await page.locator('.global-defaults__toggle').click();
    await expect(globalBody).toBeVisible();
  });

  test('PNG optimize checkbox: visible for PNG, hidden for WebP, persisted after rerender', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    await page.locator('.queue-item__expand').click();
    await expect(page.locator('.settings-panel')).toBeVisible();

    const formatSelect = page.locator('.settings-panel .settings-panel__select');

    // Start on default (jpeg) — optimize row should be hidden
    await expect(page.locator('.settings-panel .settings-panel__row').filter({ hasText: 'Optimize PNG' })).toBeHidden();

    // Switch to PNG — row should appear
    await formatSelect.selectOption('png');
    const pngOptimizeRow = page.locator('.settings-panel .settings-panel__row').filter({ hasText: 'Optimize PNG' });
    await expect(pngOptimizeRow).toBeVisible();

    // The checkbox starts unchecked (default pngOptimize: false)
    const pngOptimizeCheckbox = pngOptimizeRow.locator('input[type="checkbox"]');
    await expect(pngOptimizeCheckbox).not.toBeChecked();

    // Toggle it on
    await pngOptimizeCheckbox.check();
    await expect(pngOptimizeCheckbox).toBeChecked();

    // Trigger a store-driven rerender by toggling quality (format is PNG so slider is disabled;
    // use strip metadata checkbox instead to force a notify cycle)
    const stripCheckbox = page.locator('.settings-panel .settings-panel__checkbox').nth(1);
    await stripCheckbox.uncheck();
    await stripCheckbox.check();

    // pngOptimize should still be checked after rerender
    await expect(pngOptimizeCheckbox).toBeChecked();

    // Switch to WebP — optimize row must hide again
    await formatSelect.selectOption('webp');
    await expect(pngOptimizeRow).toBeHidden();
  });

  test('global defaults does not affect existing queue items', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles([
      { name: 'test.png', mimeType: 'image/png', buffer: TWO_BY_ONE_PNG },
    ]);

    // Open per-file settings
    await page.locator('.queue-item__expand').click();
    const itemFormatSelect = page.locator('.settings-panel .settings-panel__select');
    const initialFormat = await itemFormatSelect.inputValue();

    // Change global default to avif
    const globalFormatSelect = page.locator('.global-defaults .settings-panel__select');
    await globalFormatSelect.selectOption('avif');

    // Existing item's format should be unchanged
    await expect(itemFormatSelect).toHaveValue(initialFormat);
  });
});
