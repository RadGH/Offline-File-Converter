import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PNG = path.resolve(__dirname, '../../public/test-fixtures/sample.png');

test.describe('Phase 4 — Canvas converter', () => {
  test('upload PNG, convert to WebP, download returns valid image', async ({ page }) => {
    await page.goto('/');

    // ── 1. Upload the fixture via the hidden file input ──
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    // The queue item should appear with a Convert button
    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // ── 2. Change format to webp via the settings panel ──
    // Open the settings panel
    const expandBtn = queueItem.locator('.queue-item__expand');
    await expandBtn.click();

    // Select WebP in the format dropdown
    const formatSelect = queueItem.locator('.settings-panel__select').first();
    await formatSelect.selectOption('webp');

    // ── 3. Click Convert ──
    const convertBtn = queueItem.locator('.queue-item__convert-btn');
    await expect(convertBtn).toBeVisible();
    await convertBtn.click();

    // ── 4. Wait for the Download button to appear ──
    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });

    // ── 5. Verify "done" badge ──
    const badge = queueItem.locator('.queue-item__badge--done');
    await expect(badge).toBeVisible();

    // ── 6. Capture the download and verify blob properties ──
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

    // Keep default format (jpeg) — no settings change needed
    const convertBtn = queueItem.locator('.queue-item__convert-btn');
    await expect(convertBtn).toBeVisible();
    await convertBtn.click();

    const downloadBtn = queueItem.locator('.queue-item__download-btn');
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });

    // Use page.evaluate to decode the output blob from the store via a data URL
    // We trigger download, intercept the object URL, and load it into an <img>
    const naturalWidth = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        // Find the download anchor that would be created and read its href
        // We simulate a click and intercept via a global override of URL.createObjectURL
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

        // Wait a tick, then load the captured URL into an img
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
    const convertBtn = queueItem.locator('.queue-item__convert-btn');
    await expect(convertBtn).toBeVisible({ timeout: 5000 });
    await convertBtn.click();

    await expect(queueItem.locator('.queue-item__download-btn')).toBeVisible({ timeout: 15000 });

    // The meta line should show "→" indicating original → output size
    const meta = queueItem.locator('.queue-item__meta');
    await expect(meta).toContainText('→');
  });

  test('AVIF output shows not-yet-supported error', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE_PNG);

    const queueItem = page.locator('.queue-item-wrapper').first();
    await expect(queueItem).toBeVisible({ timeout: 5000 });

    // Open settings and pick AVIF
    await queueItem.locator('.queue-item__expand').click();
    const formatSelect = queueItem.locator('.settings-panel__select').first();
    await formatSelect.selectOption('avif');

    const convertBtn = queueItem.locator('.queue-item__convert-btn');
    await convertBtn.click();

    // Should end up in error state
    const errorBadge = queueItem.locator('.queue-item__badge--error');
    await expect(errorBadge).toBeVisible({ timeout: 5000 });

    const errMsg = queueItem.locator('.queue-item__error');
    await expect(errMsg).toContainText('not-yet-supported');
  });
});
