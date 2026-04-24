import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Settings panel E2E tests — GlobalDefaults panel.
 *
 * The per-item settings panel (expand chevron flow) has been removed.
 * These tests verify the GlobalDefaults panel which is open by default and
 * whose values apply to all NEW files added after a change.
 *
 * 2×1 PNG: minimal valid buffer used for lightweight tests that don't need
 * a successful conversion (UI-only assertions). Tests that need an actual
 * completed conversion use FIXTURE_PNG from the test-fixtures directory.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');


test.describe('GlobalDefaults panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── Panel visibility ────────────────────────────────────────────────────────

  test('GlobalDefaults panel is open by default', async ({ page }) => {
    const body = page.locator('.global-defaults__body');
    await expect(body).toBeVisible();
  });

  test('GlobalDefaults panel collapses and re-expands via toggle', async ({ page }) => {
    const body = page.locator('.global-defaults__body');
    await expect(body).toBeVisible();

    await page.locator('.global-defaults__toggle').click();
    await expect(body).not.toBeVisible();

    await page.locator('.global-defaults__toggle').click();
    await expect(body).toBeVisible();
  });

  // ── Format select ───────────────────────────────────────────────────────────

  test('changing format in GlobalDefaults persists and affects new uploads', async ({ page }) => {
    // Set global default to WebP
    const formatSelect = page.locator('.global-defaults .settings-panel__select').first();
    await formatSelect.selectOption('webp');
    await expect(formatSelect).toHaveValue('webp');

    // Upload a real fixture — it inherits the WebP format and converts successfully
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // Wait for conversion to finish and verify download filename has .webp
    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 20000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.webp$/i);
  });

  // ── Quality slider ──────────────────────────────────────────────────────────

  test('quality slider is disabled for PNG format in GlobalDefaults', async ({ page }) => {
    const formatSelect = page.locator('.global-defaults .settings-panel__select').first();
    const slider = page.locator('.global-defaults .settings-panel__slider');

    // Default format is jpeg — slider should be enabled
    await expect(slider).not.toBeDisabled();

    // Switch to PNG → slider disabled
    await formatSelect.selectOption('png');
    await expect(slider).toBeDisabled();
  });

  test('quality slider is disabled for GIF format in GlobalDefaults', async ({ page }) => {
    const formatSelect = page.locator('.global-defaults .settings-panel__select').first();
    const slider = page.locator('.global-defaults .settings-panel__slider');

    await formatSelect.selectOption('gif');
    await expect(slider).toBeDisabled();
  });

  // ── PNG optimize checkbox ───────────────────────────────────────────────────

  test('PNG-optimize checkbox visible when PNG selected in GlobalDefaults, hidden for WebP', async ({ page }) => {
    const formatSelect = page.locator('.global-defaults .settings-panel__select').first();

    // Default (jpeg) — optimize row should be hidden
    await expect(
      page.locator('.global-defaults .settings-panel__row').filter({ hasText: 'Optimize PNG' })
    ).toBeHidden();

    // Switch to PNG — row should appear
    await formatSelect.selectOption('png');
    const pngOptimizeRow = page.locator('.global-defaults .settings-panel__row').filter({ hasText: 'Optimize PNG' });
    await expect(pngOptimizeRow).toBeVisible();

    // Switch to WebP — row should hide again
    await formatSelect.selectOption('webp');
    await expect(pngOptimizeRow).toBeHidden();
  });

  // ── Aspect-lock toggle ──────────────────────────────────────────────────────

  test('aspect-lock toggle in GlobalDefaults is on by default and can be toggled', async ({ page }) => {
    // The GlobalDefaults aspect-lock checkbox should be on by default (no upload needed)
    const aspectCheckbox = page.locator('.global-defaults .settings-panel__checkbox').first();
    await expect(aspectCheckbox).toBeChecked();

    // Toggling it off and back on should not throw
    await aspectCheckbox.uncheck();
    await expect(aspectCheckbox).not.toBeChecked();

    await aspectCheckbox.check();
    await expect(aspectCheckbox).toBeChecked();
  });

  // ── Strip metadata ──────────────────────────────────────────────────────────

  test('strip-metadata toggle in GlobalDefaults persists after interaction', async ({ page }) => {
    // Strip metadata checkbox (second checkbox in global-defaults)
    const stripCheckbox = page.locator('.global-defaults .settings-panel__checkbox').nth(1);

    // Default is checked (strip=true)
    await expect(stripCheckbox).toBeChecked();

    // Uncheck it
    await stripCheckbox.uncheck();
    await expect(stripCheckbox).not.toBeChecked();

    // Toggle something else and come back — state should persist (in-memory store)
    const formatSelect = page.locator('.global-defaults .settings-panel__select').first();
    await formatSelect.selectOption('webp');
    await formatSelect.selectOption('jpeg');

    await expect(stripCheckbox).not.toBeChecked();
  });

  // ── GlobalDefaults does not mutate existing items ───────────────────────────

  test('GlobalDefaults format change does not affect already-queued items', async ({ page }) => {
    // Upload a real fixture — it inherits the current default (jpeg)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // Wait for it to finish so we have a stable done item
    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 20000 });

    // Change global default to avif — the existing done item's filename should still be .jpg
    await page.locator('.global-defaults .settings-panel__select').first().selectOption('avif');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadBtn.click(),
    ]);

    // The existing item was converted as jpeg (the default at upload time)
    expect(download.suggestedFilename()).not.toMatch(/\.avif$/i);
  });
});
