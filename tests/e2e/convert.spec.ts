/**
 * Phase 4 — Canvas converter E2E tests.
 *
 * NOTE (Phase 5 update): The per-item "Convert" button was removed in Phase 5.
 * Conversions are now driven automatically by the queue processor.
 * These tests upload a file and wait for the processor to complete it.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

test.describe('Phase 4 — Canvas converter', () => {
  test('upload PNG, convert to WebP, download returns valid image', async ({ page }) => {
    await page.goto('/');

    // ── 1. Pause queue so we can set format before processing starts ──
    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await startPauseBtn.click(); // toggles to paused

    // ── 2. Upload the fixture via the hidden file input ──
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    // The queue item should appear
    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // ── 3. Change format to webp via the settings panel ──
    // Open the settings panel
    const expandBtn = queueItem.locator('.queue-item__expand');
    await expandBtn.click();

    // Select WebP in the format dropdown
    const formatSelect = queueItem.locator('.settings-panel__select').first();
    await formatSelect.selectOption('webp');

    // ── 4. Resume queue — processor picks up the item ──
    await startPauseBtn.click();

    // ── 5. Wait for the Download button to appear ──
    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });

    // ── 6. Verify "done" badge ──
    const badge = queueItem.locator('.queue-item__badge--done');
    await expect(badge).toBeVisible();

    // ── 7. Capture the download and verify blob properties ──
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadBtn.click(),
    ]);

    // Verify filename has .webp extension
    expect(download.suggestedFilename()).toMatch(/\.webp$/i);

    // Read the downloaded file and verify it's a non-empty WebP
    const downloadStream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const blob = Buffer.concat(chunks);

    expect(blob.length).toBeGreaterThan(0);

    // WebP files start with RIFF....WEBP
    const riff = blob.slice(0, 4).toString('ascii');
    const webp = blob.slice(8, 12).toString('ascii');
    expect(riff).toBe('RIFF');
    expect(webp).toBe('WEBP');
  });

  test('converted image is decodable in the browser (naturalWidth > 0)', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // Wait for the download button (processor auto-converts with default jpeg format)
    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });

    // Use page.evaluate to decode the output blob from the store via a data URL
    const naturalWidth = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let capturedUrl: string | null = null;
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (obj: Blob | MediaSource) => {
          const url = origCreate(obj);
          capturedUrl = url;
          return url;
        };

        const dlBtn = document.querySelector('.queue-item__download-btn') as HTMLButtonElement;
        if (!dlBtn) { resolve(-1); return; }

        dlBtn.click();

        setTimeout(() => {
          if (!capturedUrl) { resolve(-2); return; }
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth);
          img.onerror = () => resolve(0);
          img.src = capturedUrl;
        }, 50);
      });
    });

    expect(naturalWidth).toBeGreaterThan(0);
  });

  test('shows size reduction meta after conversion', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    await expect(queueItem.locator('.queue-item__download-btn')).toBeVisible({ timeout: 15000 });

    // The meta line should show "→" indicating original → output size
    const meta = queueItem.locator('.queue-item__meta');
    await expect(meta).toContainText('→');
  });

  test('AVIF output converts successfully (Phase 6)', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"]');

    // Pause queue before uploading so we can change format first
    const startPauseBtn = page.locator('.queue-controls__start-pause');
    await startPauseBtn.click(); // pause

    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // Open settings and pick AVIF
    await queueItem.locator('.queue-item__expand').click();
    const formatSelect = queueItem.locator('.settings-panel__select').first();
    await formatSelect.selectOption('avif');

    // Resume — processor picks up the item
    await startPauseBtn.click();

    // Should end up in done state (AVIF encoder is now wired)
    const doneBadge = queueItem.locator('.queue-item__badge--done');
    await expect(doneBadge).toBeVisible({ timeout: 30000 });

    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible();
  });
});
