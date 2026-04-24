/**
 * Upscale Phase 2.2 — Headless smoke test.
 *
 * Strategy:
 *   1. Serve the app normally (Vite dev server on port 5280).
 *   2. Use page.route() to intercept the HuggingFace model URL and serve the
 *      locally-downloaded model file from /tmp/upscale-models/.
 *   3. Use page.addInitScript() to inject the pipeline code that:
 *        a. Downloads the model (via mocked route).
 *        b. Calls runUpscale() on the 64×64 PNG fixture.
 *        c. Stores the result on window for retrieval.
 *   4. Assert output dimensions = 64 × scale.
 *
 * Skipped when /tmp/upscale-models/model_uint8.onnx is absent.
 *
 * Privacy: privacy.spec.ts never interacts with the upscale feature, so the
 * model route never fires in those tests — zero external requests guaranteed.
 */

import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';

const MODEL_LOCAL_PATH = '/tmp/upscale-models/model_uint8.onnx';
const MODEL_HF_URL =
  'https://huggingface.co/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model_uint8.onnx';

const modelExists = existsSync(MODEL_LOCAL_PATH);

test.describe('Upscale smoke test — runUpscale Blob→Blob headless', () => {
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

  test('64×64 PNG upscales to 256×256 (4x) via ORT WASM session', async ({ page }) => {
    if (!modelExists) {
      test.skip();
      return;
    }

    await page.goto('/');
    test.slow(); // 3× configured timeout for WASM inference

    // Inject and run the upscale pipeline inside the page context.
    // We pass the code as a string via page.evaluate so it executes in the
    // browser JS context (not in Node).
    const result = await page.evaluate(
      async ([downloaderUrl, upscalerUrl, fixtureUrl, scaleStr]: string[]) => {
        const scale = Number(scaleStr) as 2 | 4;
        // @ts-ignore — runtime dynamic imports by URL
        const { downloadModelWithProgress } = await import(downloaderUrl);
        // @ts-ignore — runtime dynamic imports by URL
        const { runUpscale } = await import(upscalerUrl);

        await downloadModelWithProgress(undefined, () => { /* noop */ });

        const fixtureResp = await fetch(fixtureUrl);
        const blob = await fixtureResp.blob();
        const outBlob = await runUpscale(blob, { scale });

        const bmp = await createImageBitmap(outBlob);
        const w = bmp.width;
        const h = bmp.height;
        bmp.close();
        return { width: w, height: h, size: outBlob.size };
      },
      [
        '/src/lib/upscale/downloader.ts',
        '/src/lib/upscale/upscaler.ts',
        '/test-fixtures/sample.png',
        '4',
      ],
    );

    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    expect(result.size).toBeGreaterThan(0);
  });

  test('64×64 PNG upscales to 128×128 when scale=2', async ({ page }) => {
    if (!modelExists) {
      test.skip();
      return;
    }

    await page.goto('/');
    test.slow();

    const result = await page.evaluate(
      async ([downloaderUrl, upscalerUrl, fixtureUrl, scaleStr]: string[]) => {
        const scale = Number(scaleStr) as 2 | 4;
        // @ts-ignore — runtime dynamic imports by URL
        const { downloadModelWithProgress } = await import(downloaderUrl);
        // @ts-ignore — runtime dynamic imports by URL
        const { runUpscale } = await import(upscalerUrl);

        await downloadModelWithProgress(undefined, () => { /* noop */ });

        const fixtureResp = await fetch(fixtureUrl);
        const blob = await fixtureResp.blob();
        const outBlob = await runUpscale(blob, { scale });

        const bmp = await createImageBitmap(outBlob);
        const w = bmp.width;
        const h = bmp.height;
        bmp.close();
        return { width: w, height: h };
      },
      [
        '/src/lib/upscale/downloader.ts',
        '/src/lib/upscale/upscaler.ts',
        '/test-fixtures/sample.png',
        '2',
      ],
    );

    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
  });
});
