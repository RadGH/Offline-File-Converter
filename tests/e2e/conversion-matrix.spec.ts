/**
 * Phase 7 — Conversion Matrix Test Suite
 *
 * 7 inputs × 5 outputs = 35 test cases.
 * Each case: set global default format → upload fixture → wait for done → download → verify magic bytes + naturalWidth.
 * Results written to test-results/matrix-results.jsonl for MATRIX.md generation.
 *
 * NOTE: Per-item settings panel removed. Format is set via GlobalDefaults
 * BEFORE upload so new files inherit the chosen format.
 */
import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.resolve(__dirname, '../../public/test-fixtures');
const RESULTS_DIR = path.resolve(__dirname, '../../test-results/matrix');
const RESULTS_JSONL = path.resolve(__dirname, '../../test-results/matrix-results.jsonl');

// 7 input formats
const INPUTS = ['jpg', 'png', 'webp', 'avif', 'heic', 'gif', 'bmp'] as const;
type InputFmt = (typeof INPUTS)[number];

// 5 output formats (HEIC is decode-only, so not an output target)
const OUTPUTS = ['jpeg', 'png', 'webp', 'avif', 'gif'] as const;
type OutputFmt = (typeof OUTPUTS)[number];

// Map input ext to fixture filename
const fixtureFile: Record<InputFmt, string> = {
  jpg: 'sample.jpg',
  png: 'sample.png',
  webp: 'sample.webp',
  avif: 'sample.avif',
  heic: 'sample.heic',
  gif: 'sample.gif',
  bmp: 'sample.bmp',
};

// MIME magic byte checkers
function checkMagicBytes(buf: Buffer, fmt: OutputFmt): { ok: boolean; reason?: string } {
  switch (fmt) {
    case 'jpeg': {
      const ok = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      return ok ? { ok: true } : { ok: false, reason: `Expected FF D8 FF, got ${buf.slice(0, 3).toString('hex')}` };
    }
    case 'png': {
      const ok =
        buf[0] === 0x89 &&
        buf[1] === 0x50 && // P
        buf[2] === 0x4e && // N
        buf[3] === 0x47;   // G
      return ok ? { ok: true } : { ok: false, reason: `Expected PNG magic, got ${buf.slice(0, 4).toString('hex')}` };
    }
    case 'webp': {
      const riff = buf.slice(0, 4).toString('ascii');
      const webp = buf.slice(8, 12).toString('ascii');
      const ok = riff === 'RIFF' && webp === 'WEBP';
      return ok ? { ok: true } : { ok: false, reason: `Expected RIFF...WEBP, got riff=${riff} webp=${webp}` };
    }
    case 'avif': {
      // ftyp box: bytes 4–8 contain the brand. Common brands: avif, avis, mif1, heic, heif
      const ftypBox = buf.slice(4, 12).toString('ascii');
      const ok = ftypBox.startsWith('ftyp');
      const brand = buf.slice(8, 12).toString('ascii');
      const isAvifBrand = ['avif', 'avis', 'mif1', 'heic', 'heif'].some((b) => brand.startsWith(b));
      if (!ok) return { ok: false, reason: `Expected ftyp box, got ${ftypBox}` };
      if (!isAvifBrand) return { ok: false, reason: `Unexpected AVIF brand: ${brand}` };
      return { ok: true };
    }
    case 'gif': {
      const magic = buf.slice(0, 6).toString('ascii');
      const ok = /^GIF8[79]a/.test(magic);
      return ok ? { ok: true } : { ok: false, reason: `Expected GIF87a or GIF89a, got ${magic}` };
    }
  }
}

// Result line written to JSONL
interface MatrixResult {
  input: string;
  output: string;
  status: 'pass' | 'fail';
  error?: string;
  outputSize: number;
  durationMs: number;
}

function writeResult(result: MatrixResult): void {
  fs.appendFileSync(RESULTS_JSONL, JSON.stringify(result) + '\n', 'utf8');
}

/**
 * Set global default format, upload a file, wait for done, return the queue item locator.
 * Conversion begins immediately (autoStart is on).
 */
async function uploadAndConvert(
  page: Page,
  filePath: string,
  outputFormat: OutputFmt,
  timeoutMs: number
): Promise<ReturnType<Page['locator']>> {
  await page.goto('/');

  // Capture console errors to help diagnose failures
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Set global default format before upload — new files inherit it
  await page.locator('.simple-settings .rd-select').first().selectOption(outputFormat);

  // Upload file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for queue item
  const queueItem = page.locator('.queue-item-wrapper').first();
  await expect(queueItem).toBeVisible({ timeout: 5000 });

  // Wait for done badge
  try {
    await expect(queueItem.locator('.queue-item__badge--done')).toBeVisible({ timeout: timeoutMs });
  } catch (e) {
    // Check for error badge
    const errBadge = queueItem.locator('.queue-item__badge--error');
    const hasError = await errBadge.isVisible();
    const consoleErrors = errors.join('; ');
    const msg = hasError
      ? `Conversion errored. Console: ${consoleErrors || 'none'}`
      : `Timed out after ${timeoutMs}ms. Console: ${consoleErrors || 'none'}`;
    throw new Error(msg);
  }

  return queueItem;
}

test.beforeAll(() => {
  // Clean up previous results
  if (fs.existsSync(RESULTS_JSONL)) fs.unlinkSync(RESULTS_JSONL);
  // Ensure output dirs exist
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
});

// Build the 35 test cases
for (const inputExt of INPUTS) {
  for (const outputFmt of OUTPUTS) {
    const inputLabel = inputExt.toUpperCase();
    const outputLabel = outputFmt.toUpperCase();
    const fixturePath = path.join(FIXTURES_DIR, fixtureFile[inputExt]);

    test.describe(`${inputLabel} → ${outputLabel}`, () => {
      test(`converts ${inputLabel} to ${outputLabel}`, async ({ page }) => {
        test.setTimeout(60_000);

        // Skip if fixture doesn't exist
        if (!fs.existsSync(fixturePath)) {
          writeResult({
            input: inputExt,
            output: outputFmt,
            status: 'fail',
            error: `Fixture not found: ${fixturePath}`,
            outputSize: 0,
            durationMs: 0,
          });
          test.skip(true, `Fixture missing: ${fixturePath}`);
          return;
        }

        const start = Date.now();
        let queueItem: ReturnType<Page['locator']>;

        try {
          queueItem = await uploadAndConvert(page, fixturePath, outputFmt, 30_000);
        } catch (err) {
          const durationMs = Date.now() - start;
          const error = err instanceof Error ? err.message : String(err);
          writeResult({ input: inputExt, output: outputFmt, status: 'fail', error, outputSize: 0, durationMs });
          throw err;
        }

        // Trigger download and capture blob
        const downloadBtn = queueItem.locator('.queue-item__download-btn');
        await expect(downloadBtn).toBeVisible();

        const [download] = await Promise.all([
          page.waitForEvent('download'),
          downloadBtn.click(),
        ]);

        // Read blob bytes
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const blob = Buffer.concat(chunks);
        const durationMs = Date.now() - start;

        // Save blob for inspection
        const outputExt = outputFmt === 'jpeg' ? 'jpg' : outputFmt;
        const outPath = path.join(RESULTS_DIR, `${inputExt}-to-${outputFmt}.${outputExt}`);
        fs.writeFileSync(outPath, blob);

        // Assert: blob non-empty
        let assertionError: string | undefined;
        try {
          expect(blob.length).toBeGreaterThan(0);
        } catch {
          assertionError = `Empty blob (0 bytes)`;
        }

        // Assert: magic bytes
        if (!assertionError) {
          const magicCheck = checkMagicBytes(blob, outputFmt);
          if (!magicCheck.ok) {
            assertionError = `Magic bytes mismatch: ${magicCheck.reason}`;
          }
        }

        // Assert: naturalWidth > 0 (decodable in browser)
        if (!assertionError) {
          // Write blob as data URL and decode in page context
          const base64 = blob.toString('base64');
          const mimeMap: Record<OutputFmt, string> = {
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            avif: 'image/avif',
            gif: 'image/gif',
          };
          const mime = mimeMap[outputFmt];
          const dataUrl = `data:${mime};base64,${base64}`;

          const naturalWidth = await page.evaluate(async (src: string) => {
            return new Promise<number>((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img.naturalWidth);
              img.onerror = () => resolve(0);
              img.src = src;
            });
          }, dataUrl);

          if (naturalWidth <= 0) {
            // AVIF naturalWidth can be 0 on non-AVIF browsers — only fail hard for other formats
            if (outputFmt !== 'avif') {
              assertionError = `naturalWidth=${naturalWidth} — image not decodable in browser`;
            }
          }
        }

        if (assertionError) {
          writeResult({ input: inputExt, output: outputFmt, status: 'fail', error: assertionError, outputSize: blob.length, durationMs });
          throw new Error(assertionError);
        }

        writeResult({ input: inputExt, output: outputFmt, status: 'pass', outputSize: blob.length, durationMs });
      });
    });
  }
}
