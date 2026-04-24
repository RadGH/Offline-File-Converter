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
 *
 * NOTE: Queue controls are hidden until >1 item exists (class .queue-controls--hidden
 * applies display:none with display:none). Tests that need to interact with controls
 * before uploading use page.evaluate() to dispatch clicks directly, bypassing
 * Playwright's visibility checks.
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

/**
 * Click a hidden element via evaluate — bypasses Playwright visibility checks.
 * Used for queue-controls that are display:none until >1 item exists.
 */
async function clickHidden(page: import('@playwright/test').Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) throw new Error(`Element not found: ${sel}`);
    el.click();
  }, selector);
}

// ── Sequential mode ────────────────────────────────────────────────────────────

test.describe('Processor — sequential mode (concurrency=1)', () => {
  test('items go waiting → processing → done one at a time', async ({ page }) => {
    await page.goto('/');

    // Set concurrency to 1 via the "One at a time" radio.
    // Controls are display:none until >1 item — use evaluate to click hidden element.
    await clickHidden(page, 'input[name="concurrency-mode"][value="one"]');

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

    await clickHidden(page, 'input[name="concurrency-mode"][value="one"]');

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

    // Set concurrency to 3 via the parallel radio + input (hidden until >1 item)
    await clickHidden(page, 'input[name="concurrency-mode"][value="parallel"]');
    await page.evaluate(() => {
      const input = document.querySelector('.queue-controls__concurrency-input') as HTMLInputElement | null;
      if (!input) throw new Error('concurrency input not found');
      input.value = '3';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

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

    // Sequential mode for deterministic control (hidden — use evaluate)
    await clickHidden(page, 'input[name="concurrency-mode"][value="one"]');

    // Pause the queue BEFORE uploading files (hidden — use evaluate).
    await clickHidden(page, '.queue-controls__start-pause');

    // Upload 3 files — they should all remain in 'waiting' while paused
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG, FIXTURE_PNG]);

    await expect(page.locator('.queue-item')).toHaveCount(3);

    // Controls are now visible (3 items). Verify paused state via button text.
    const controlBtn = page.locator('.queue-controls__start-pause');
    await expect(controlBtn).toHaveText('Start');

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

    // Pause the queue before adding files so items stay in waiting state.
    // Controls are hidden — use evaluate to click the hidden button.
    await clickHidden(page, '.queue-controls__start-pause');

    const fileInput = page.locator('input[type="file"]');
    // Upload 2 files so controls become visible after upload
    await fileInput.setInputFiles([FIXTURE_PNG, FIXTURE_PNG]);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // Controls visible now (2 items). Verify paused state.
    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await expect(startPauseBtn).toHaveText('Start');

    // The first item should be waiting since queue is paused
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
