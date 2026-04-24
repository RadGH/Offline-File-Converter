/**
 * Phase 9 — Keyboard shortcuts E2E tests.
 * Verifies Space toggles processor pause/resume.
 *
 * NOTE: The "Esc closes expanded settings panels" test was removed because
 * per-item settings panels no longer exist (the expand chevron was removed).
 *
 * NOTE: Queue controls are hidden until >1 item is queued. Tests that interact
 * with the start/pause button upload 2 files so the controls become visible.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

test.describe('Keyboard shortcuts', () => {
  test('Space on body pauses the running processor (button label changes)', async ({ page }) => {
    await page.goto('/');

    // Upload 2 files so queue-controls become visible (hidden until >1 item)
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG]);
    await expect(page.locator('.queue-item')).toHaveCount(2, { timeout: 5_000 });

    const startPauseBtn = page.locator('.queue-controls__start-pause');
    // Processor is running — button should say "Pause"
    await expect(startPauseBtn).toHaveText('Pause');

    // Ensure focus is on body (no input focused)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Press Space
    await page.keyboard.press('Space');

    // Button should now say "Start" (paused)
    await expect(startPauseBtn).toHaveText('Start');

    // Press Space again to resume
    await page.keyboard.press('Space');

    await expect(startPauseBtn).toHaveText('Pause');
  });

  test('Space does not toggle processor when focus is inside an input', async ({ page }) => {
    await page.goto('/');

    // Upload 2 files so queue-controls become visible
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG]);
    await expect(page.locator('.queue-item')).toHaveCount(2, { timeout: 5_000 });

    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await expect(startPauseBtn).toHaveText('Pause');

    // Focus the concurrency number input
    const concurrencyInput = page.locator('.queue-controls__concurrency-input');
    await concurrencyInput.focus();

    // Press Space — should NOT toggle
    await page.keyboard.press('Space');

    // Button should still say "Pause"
    await expect(startPauseBtn).toHaveText('Pause');
  });
});
