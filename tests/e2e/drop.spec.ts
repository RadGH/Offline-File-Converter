import { test, expect } from '@playwright/test';

// Minimal 1×1 PNG (valid, decodable)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

test('drop zone: uploading 3 files shows all 3 in the queue', async ({ page }) => {
  await page.goto('/');

  const input = page.locator('input[type="file"]');

  await input.setInputFiles([
    { name: 'alpha.png', mimeType: 'image/png', buffer: TINY_PNG },
    { name: 'beta.png',  mimeType: 'image/png', buffer: TINY_PNG },
    { name: 'gamma.png', mimeType: 'image/png', buffer: TINY_PNG },
  ]);

  // Three items should appear in the queue
  const items = page.locator('.queue-item');
  await expect(items).toHaveCount(3);

  // Correct filenames
  await expect(page.locator('.queue-item__name').nth(0)).toContainText('alpha.png');
  await expect(page.locator('.queue-item__name').nth(1)).toContainText('beta.png');
  await expect(page.locator('.queue-item__name').nth(2)).toContainText('gamma.png');
});

test('drop zone: non-image files are rejected', async ({ page }) => {
  await page.goto('/');

  const input = page.locator('input[type="file"]');

  await input.setInputFiles([
    { name: 'document.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fake pdf') },
    { name: 'valid.png',    mimeType: 'image/png',        buffer: TINY_PNG },
  ]);

  // Only the valid image should appear
  const items = page.locator('.queue-item');
  await expect(items).toHaveCount(1);
  await expect(page.locator('.queue-item__name').nth(0)).toContainText('valid.png');
});
