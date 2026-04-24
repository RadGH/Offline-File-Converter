/**
 * Proves upscale actually changes the output.
 *
 * Runs the 64×64 test fixture through runUpscale() at 4×, then also through
 * canvas bilinear scaling to the same 256×256 target, and asserts:
 *   - Both outputs exist
 *   - Output dimensions are identical (256×256)
 *   - Byte sizes are different (AI content differs from bilinear blur)
 */

import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';

const MODEL_LOCAL_PATH = '/tmp/upscale-models/model_uint8.onnx';
const MODEL_HF_URL =
  'https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model_uint8.onnx';

const modelExists = existsSync(MODEL_LOCAL_PATH);

test.describe('Upscale output differs from canvas bilinear', () => {
  test.beforeEach(async ({ page }) => {
    if (!modelExists) return;
    await page.route(MODEL_HF_URL, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        },
        path: MODEL_LOCAL_PATH,
      });
    });
  });

  test('AI-upscaled 256x256 differs byte-wise from canvas bilinear 256x256', async ({ page }) => {
    if (!modelExists) {
      test.skip();
      return;
    }

    await page.goto('/');
    test.slow();

    const { aiSize, naiveSize, aiWidth, naiveWidth } = await page.evaluate(
      async ([downloaderUrl, upscalerUrl, fixtureUrl]: string[]) => {
        // @ts-ignore
        const { downloadModelWithProgress } = await import(downloaderUrl);
        // @ts-ignore
        const { runUpscale } = await import(upscalerUrl);

        await downloadModelWithProgress(undefined, () => { /* noop */ });

        const fixtureResp = await fetch(fixtureUrl);
        const originalBlob = await fixtureResp.blob();

        const aiBlob = await runUpscale(originalBlob, { scale: 4 });

        // Canvas bilinear 4× scale (naive path)
        const bmp = await createImageBitmap(originalBlob);
        const canvas = new OffscreenCanvas(bmp.width * 4, bmp.height * 4);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close();
        const naiveBlob = await canvas.convertToBlob({ type: 'image/png' });

        const aiBmp = await createImageBitmap(aiBlob);
        const naiveBmp = await createImageBitmap(naiveBlob);
        const out = {
          aiSize: aiBlob.size,
          naiveSize: naiveBlob.size,
          aiWidth: aiBmp.width,
          naiveWidth: naiveBmp.width,
        };
        aiBmp.close();
        naiveBmp.close();
        return out;
      },
      [
        '/src/lib/upscale/downloader.ts',
        '/src/lib/upscale/upscaler.ts',
        '/test-fixtures/sample.png',
      ],
    );

    expect(aiWidth).toBe(256);
    expect(naiveWidth).toBe(256);
    expect(aiSize).toBeGreaterThan(0);
    expect(naiveSize).toBeGreaterThan(0);
    // If they match exactly the pipeline isn't actually running inference.
    expect(aiSize).not.toBe(naiveSize);
    // eslint-disable-next-line no-console
    console.log(`[upscale-compare] AI=${aiSize}B  naive=${naiveSize}B  Δ=${aiSize - naiveSize}B`);
  });
});
