/**
 * Phase 8 — ZIP download E2E test.
 *
 * Uploads 3 uniquely-named copies of sample.png, waits for all three to
 * reach "done" status, clicks Download ZIP, captures the download, opens
 * the zip with JSZip, and verifies contents.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

// Read the fixture once
const sampleBuffer = fs.readFileSync(FIXTURE_PNG);

test.describe('Phase 8 — ZIP download', () => {
  test('upload 3 files, wait for done, download ZIP with 3 entries', async ({ page }) => {
    await page.goto('/');

    // ── 1. Upload 3 uniquely-named PNG copies ──────────────────────────────
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      { name: 'photo-a.png', mimeType: 'image/png', buffer: sampleBuffer },
      { name: 'photo-b.png', mimeType: 'image/png', buffer: sampleBuffer },
      { name: 'photo-c.png', mimeType: 'image/png', buffer: sampleBuffer },
    ]);

    // ── 2. Wait for 3 queue items to appear ────────────────────────────────
    const items = page.locator('.queue-item-wrapper');
    await expect(items).toHaveCount(3, { timeout: 5_000 });

    // ── 3. Wait for all 3 to reach "done" status ───────────────────────────
    // The done badge is .queue-item__badge--done
    const doneBadges = page.locator('.queue-item__badge--done');
    await expect(doneBadges).toHaveCount(3, { timeout: 30_000 });

    // ── 4. ZIP button should now be enabled ────────────────────────────────
    const zipBtn = page.locator('.queue-controls__download-zip');
    await expect(zipBtn).toBeVisible();
    await expect(zipBtn).toBeEnabled({ timeout: 5_000 });
    await expect(zipBtn).toContainText('Download all as ZIP (3)');

    // ── 5. Click and capture the download ──────────────────────────────────
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      zipBtn.click(),
    ]);

    // ── 6. Verify the zip filename format ──────────────────────────────────
    expect(download.suggestedFilename()).toMatch(
      /^converted-images-\d{4}-\d{2}-\d{2}\.zip$/,
    );

    // ── 7. Save to temp and inspect contents ───────────────────────────────
    const tmpPath = path.join(__dirname, `_zip-test-${Date.now()}.zip`);
    try {
      await download.saveAs(tmpPath);

      const zipData = fs.readFileSync(tmpPath);
      const zip = await JSZip.loadAsync(zipData);
      const fileNames = Object.keys(zip.files).filter(
        (name) => !zip.files[name].dir,
      );

      // ── 8. Verify 3 files inside ──────────────────────────────────────────
      expect(fileNames).toHaveLength(3);

      // Default output format is jpeg → .jpg extension
      for (const name of fileNames) {
        expect(name).toMatch(/\.(jpg|jpeg|png|webp|avif|gif)$/i);
      }
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });
});
