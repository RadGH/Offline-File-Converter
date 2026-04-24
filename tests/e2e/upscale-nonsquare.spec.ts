/**
 * Regression: the Swin2SR export crashed on non-square edge tiles (reshape
 * error "Input shape:{1,180,65536}, requested shape:{1,180,256,253}"). The
 * tiler now pads edge tiles to full square size via clamp-to-edge. This test
 * feeds a non-square input that would have produced edge tiles and asserts
 * the upscale completes successfully.
 */

import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';

const MODEL_LOCAL_PATH = '/tmp/upscale-models/model_uint8.onnx';
const MODEL_HF_URL =
  'https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model_uint8.onnx';

const modelExists = existsSync(MODEL_LOCAL_PATH);

test.describe('Upscale handles non-square images (edge-tile padding)', () => {
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

  test('100×80 input upscales to 400×320 without model reshape crash', async ({ page }) => {
    if (!modelExists) {
      test.skip();
      return;
    }
    await page.goto('/');
    test.setTimeout(180_000);

    const result = await page.evaluate(
      async ([downloaderUrl, upscalerUrl]: string[]) => {
        // @ts-ignore
        const { downloadModelWithProgress } = await import(downloaderUrl);
        // @ts-ignore
        const { runUpscale } = await import(upscalerUrl);

        await downloadModelWithProgress(undefined, () => {});

        // Build a 100×80 PNG. Source is smaller than the 256 tile size so the
        // tiler would previously emit a single 100×80 non-square tile that
        // crashes Swin2SR's internal reshape. With edge-clamp padding the
        // tile is 256×256 (content in upper-left) and inference succeeds.
        const canvas = new OffscreenCanvas(100, 80);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#4a5';
        ctx.fillRect(0, 0, 100, 80);
        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText('hi', 8, 30);
        const inputBlob = await canvas.convertToBlob({ type: 'image/png' });

        const outBlob = await runUpscale(inputBlob, { scale: 4 });
        const bmp = await createImageBitmap(outBlob);
        const r = { w: bmp.width, h: bmp.height, size: outBlob.size };
        bmp.close();
        return r;
      },
      ['/src/lib/upscale/downloader.ts', '/src/lib/upscale/upscaler.ts'],
    );

    expect(result.w).toBe(400);
    expect(result.h).toBe(320);
    expect(result.size).toBeGreaterThan(0);
  });
});
