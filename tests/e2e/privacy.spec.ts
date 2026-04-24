/**
 * Phase 10 — Privacy verification test.
 *
 * Verifies the core privacy promise: during a full PNG→WebP conversion no
 * network requests fire to any origin other than the local dev server.
 *
 * Strategy:
 *   - Intercept all outgoing network requests with page.route() before
 *     navigation and throughout the conversion.
 *   - Allow only same-origin requests (localhost:5280 or 127.0.0.1:5280).
 *   - Assert the external request list is empty after conversion completes.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(
  __dirname,
  '../../public/test-fixtures/sample.png',
);

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5280',
  'http://127.0.0.1:5280',
]);

function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    return ALLOWED_ORIGINS.has(origin);
  } catch {
    // Malformed URL — treat as disallowed to be safe.
    return false;
  }
}

test.describe('Privacy — no external network requests during conversion', () => {
  test('PNG → WebP conversion fires zero external requests', async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];

    // Intercept all routes before navigation.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (!isAllowedOrigin(url)) {
        externalRequests.push(url);
        // Abort so the request doesn't actually go out.
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto('/');

    // ── Pause the queue so we can choose WebP before processing starts ──
    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await startPauseBtn.click();

    // ── Upload the PNG fixture ──
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // ── Select WebP output ──
    await queueItem.locator('.queue-item__expand').click();
    const formatSelect = queueItem.locator('.settings-panel__select').first();
    await formatSelect.selectOption('webp');

    // ── Resume — let the processor run ──
    await startPauseBtn.click();

    // ── Wait for "done" badge ──
    const doneBadge = queueItem.locator('.queue-item__badge--done');
    await expect(doneBadge).toBeVisible({ timeout: 30000 });

    // ── Assert no external traffic ──
    expect(
      externalRequests,
      `External requests detected during conversion: ${externalRequests.join(', ')}`,
    ).toHaveLength(0);
  });

  test('AVIF conversion also fires zero external requests', async ({
    page,
    context,
  }) => {
    const externalRequests: string[] = [];

    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (!isAllowedOrigin(url)) {
        externalRequests.push(url);
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto('/');

    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await startPauseBtn.click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    await queueItem.locator('.queue-item__expand').click();
    const formatSelect = queueItem.locator('.settings-panel__select').first();
    await formatSelect.selectOption('avif');

    await startPauseBtn.click();

    const doneBadge = queueItem.locator('.queue-item__badge--done');
    await expect(doneBadge).toBeVisible({ timeout: 60000 });

    expect(
      externalRequests,
      `External requests detected during AVIF conversion: ${externalRequests.join(', ')}`,
    ).toHaveLength(0);
  });
});
