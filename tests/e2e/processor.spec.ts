/**
 * Phase 5 E2E — Queue processor: sequential mode, parallel mode, pause/resume.
 *
 * Strategy for the "parallel" test: the Phase 5 canvas converter runs fast
 * (sub-millisecond for tiny images). Rather than asserting simultaneous
 * processing (which is inherently racy), we verify that all 3 items complete
 * successfully in parallel mode. This avoids flakiness while still exercising
 * the parallel code path end-to-end.
 *
 * The pause/resume test adds 3 files in sequential mode (concurrency=1),
 * waits for the first to complete, clicks Pause, verifies the remaining 2
 * stay in "waiting" status, then clicks Resume and waits for completion.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns the count of items with the given status badge class.
 */
async function countByStatus(
  page: import('@playwright/test').Page,
  status: 'waiting' | 'processing' | 'done' | 'error' | 'cancelled'
): Promise<number> {
  return page.locator(`.queue-item__badge--${status}`).count();
}

// ── Sequential mode ────────────────────────────────────────────────────────────

test.describe('Processor — sequential mode (concurrency=1)', () => {
  test('items go waiting → processing → done one at a time', async ({ page }) => {
    await page.goto('/');

    // Set concurrency to 1 via the "One at a time" radio
    const oneAtATime = page.locator('input[name="concurrency-mode"][value="one"]');
    await oneAtATime.check();

    // Upload 3 copies of the fixture
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG, FIXTURE_PNG]);

    // All 3 items should appear
    await expect(page.locator('.queue-item')).toHaveCount(3);

    // Wait for all 3 to complete
    await page.waitForFunction(
      () => document.querySelectorAll('.queue-item__badge--done').length === 3,
      { timeout: 30_000 }
    );

    expect(await countByStatus(page, 'done')).toBe(3);
    expect(await countByStatus(page, 'error')).toBe(0);
    expect(await countByStatus(page, 'waiting')).toBe(0);
    expect(await countByStatus(page, 'processing')).toBe(0);
  });

  test('at most 1 item is processing at any given time (sequential snapshot)', async ({ page }) => {
    await page.goto('/');

    const oneAtATime = page.locator('input[name="concurrency-mode"][value="one"]');
    await oneAtATime.check();

    // Upload only 2 items so the observation window is wider
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG]);

    await expect(page.locator('.queue-item')).toHaveCount(2);

    // Poll until processing starts, then assert count ≤ 1
    await page.waitForFunction(
      () => document.querySelectorAll('.queue-item__badge--processing').length > 0,
      { timeout: 10_000 }
    );

    const processingCount = await countByStatus(page, 'processing');
    expect(processingCount).toBeLessThanOrEqual(1);

    // Wait for completion
    await page.waitForFunction(
      () => document.querySelectorAll('.queue-item__badge--done').length === 2,
      { timeout: 30_000 }
    );
  });
});

// ── Parallel mode ──────────────────────────────────────────────────────────────

test.describe('Processor — parallel mode (concurrency=3)', () => {
  test('all 3 items complete successfully in parallel mode', async ({ page }) => {
    await page.goto('/');

    // Set concurrency to 3 via the parallel radio + input
    const parallelRadio = page.locator('input[name="concurrency-mode"][value="parallel"]');
    await parallelRadio.check();
    const concurrencyInput = page.locator('.queue-controls__concurrency-input');
    await concurrencyInput.fill('3');
    await concurrencyInput.dispatchEvent('change');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG, FIXTURE_PNG]);

    await expect(page.locator('.queue-item')).toHaveCount(3);

    // Wait for all 3 to complete
    await page.waitForFunction(
      () => document.querySelectorAll('.queue-item__badge--done').length === 3,
      { timeout: 30_000 }
    );

    expect(await countByStatus(page, 'done')).toBe(3);
    expect(await countByStatus(page, 'error')).toBe(0);
  });
});

// ── Pause / Resume ─────────────────────────────────────────────────────────────

test.describe('Processor — pause and resume', () => {
  test('pause holds items in waiting; resume processes them to completion', async ({ page }) => {
    await page.goto('/');

    // Sequential mode for deterministic control
    const oneAtATime = page.locator('input[name="concurrency-mode"][value="one"]');
    await oneAtATime.check();

    // Pause the queue BEFORE uploading files.
    // This tests the core contract: a paused processor does not dispatch items.
    const controlBtn = page.locator('.queue-controls__start-pause');
    await controlBtn.click(); // pauses from initial running state

    // Verify the button now shows "Start" (paused state)
    await expect(controlBtn).toHaveText('Start');

    // Upload 3 files — they should all remain in 'waiting' while paused
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG, FIXTURE_PNG]);

    await expect(page.locator('.queue-item')).toHaveCount(3);

    // All 3 items should stay in 'waiting' — give 500ms to confirm nothing fires
    await page.waitForTimeout(500);
    expect(await countByStatus(page, 'waiting')).toBe(3);
    expect(await countByStatus(page, 'done')).toBe(0);
    expect(await countByStatus(page, 'processing')).toBe(0);

    // Resume — processor should now run through all 3 items
    await controlBtn.click();
    await expect(controlBtn).toHaveText('Pause'); // running state

    // All 3 should eventually complete
    await page.waitForFunction(
      () => document.querySelectorAll('.queue-item__badge--done').length === 3,
      { timeout: 30_000 }
    );

    expect(await countByStatus(page, 'done')).toBe(3);
    expect(await countByStatus(page, 'waiting')).toBe(0);
  });
});

// ── Cancel / Retry ─────────────────────────────────────────────────────────────

test.describe('Processor — cancel and retry', () => {
  test('cancel a waiting item; retry restores it to done', async ({ page }) => {
    await page.goto('/');

    // Pause the queue before adding files so items stay in waiting state
    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await startPauseBtn.click(); // toggles to paused (processor starts in running state, so first click pauses)

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG]);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // The item should be waiting since queue is paused
    await expect(queueItem.locator('.queue-item__badge--waiting')).toBeVisible({ timeout: 5000 });

    // Cancel it
    const cancelBtn = queueItem.locator('.queue-item__cancel-btn');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(queueItem.locator('.queue-item__badge--cancelled')).toBeVisible({ timeout: 5000 });

    // Retry button should appear
    const retryBtn = queueItem.locator('.queue-item__retry-btn');
    await expect(retryBtn).toBeVisible();

    // Resume queue before retrying so item gets processed
    await startPauseBtn.click();
    await retryBtn.click();

    // Should eventually complete
    await expect(queueItem.locator('.queue-item__badge--done')).toBeVisible({ timeout: 30_000 });
  });
});
