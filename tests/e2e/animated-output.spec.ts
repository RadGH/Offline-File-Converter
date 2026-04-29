/**
 * Verifies that the animated output formats (gif-animated, webp-animated)
 * produce real multi-frame files, not single-frame output.
 *
 * Strategy: drives the page like a user, intercepts the resulting blob, and
 * inspects bytes for multi-frame markers.
 *   - GIF: count Image Descriptor blocks (byte 0x2C) preceded by a Graphic
 *     Control Extension (0x21 0xF9). Animated GIFs have 2+; static = 1.
 *   - WebP: count ANMF chunks. Animated WebPs have 2+; static = 0.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ANIM_FIXTURE = resolve(__dirname, '../../public/test-fixtures/anim.webp');

function countAnmfChunks(bytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (bytes[i] === 0x41 && bytes[i + 1] === 0x4e && bytes[i + 2] === 0x4d && bytes[i + 3] === 0x46) {
      count++;
    }
  }
  return count;
}

function countGifFrames(bytes: Uint8Array): number {
  // Walk the GIF file. After the global header + logical screen + GCT,
  // count occurrences of Image Separator (0x2C) at the start of an extension/image block.
  // Simple heuristic: count 0x21 0xF9 0x04 (Graphic Control Extension prefix), since
  // every animation frame in our encoder is preceded by GCE.
  let count = 0;
  for (let i = 0; i + 3 <= bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      count++;
    }
  }
  return count;
}

async function uploadAnimAndConvert(page: import('@playwright/test').Page, format: 'gif-animated' | 'webp-animated'): Promise<Uint8Array> {
  await page.goto('/');
  // Dismiss consent banner so it doesn't intercept clicks.
  const acceptBtn = page.locator('.consent-banner__btn--accept, .consent-banner__btn--reject').first();
  if (await acceptBtn.count() > 0 && await acceptBtn.isVisible()) {
    await acceptBtn.click();
  }
  // Add the fixture via the file input
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(ANIM_FIXTURE);
  // Wait for source to appear in queue
  await expect(page.locator('.queue-item--source')).toHaveCount(1, { timeout: 10_000 });

  // Pick the format
  await page.locator('.simple-settings select').first().selectOption(format);

  // Click Convert below settings
  await page.locator('.simple-convert__btn').click();

  // Wait for at least one conversion child to be done (besides the initial auto one).
  // The output we care about is the LAST done child (most recent).
  await expect(async () => {
    const lastDoneCount = await page.locator('.queue-item--conversion .queue-item__badge--done').count();
    expect(lastDoneCount).toBeGreaterThan(0);
  }).toPass({ timeout: 60_000 });

  // Pull the most recent completed conversion's blob via the Download button.
  // We intercept via a download event.
  const downloadButtons = page.locator('.queue-item--conversion .queue-item__download-btn');
  const count = await downloadButtons.count();
  expect(count).toBeGreaterThan(0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButtons.last().click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('download path missing');
  return new Uint8Array(readFileSync(path));
}

test.describe('animated output formats', () => {
  test('gif-animated produces a multi-frame GIF', async ({ page }) => {
    const bytes = await uploadAnimAndConvert(page, 'gif-animated');
    // Validate GIF signature
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2])).toBe('GIF');
    // Multi-frame check
    const frames = countGifFrames(bytes);
    expect(frames).toBeGreaterThanOrEqual(2);
  });

  test('webp-animated produces a multi-frame WebP', async ({ page }) => {
    const bytes = await uploadAnimAndConvert(page, 'webp-animated');
    // Validate WebP RIFF
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('RIFF');
    expect(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])).toBe('WEBP');
    // Multi-frame check
    const anmfCount = countAnmfChunks(bytes);
    expect(anmfCount).toBeGreaterThanOrEqual(2);
  });
});
