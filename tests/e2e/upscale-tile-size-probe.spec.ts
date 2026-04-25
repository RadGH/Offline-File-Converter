/**
 * Probe which square tile sizes the Swin2SR-realworld-x4-64 ONNX export
 * actually accepts.  Updated to use the v2 model (realworld uint8 variant).
 *
 * This also verifies the new model has no tile-size restrictions — the
 * previous classical INT8 model had reshape crashes at some sizes; the
 * realworld variant should accept any square input from 64→256.
 */

import { test } from '@playwright/test';
import { existsSync } from 'fs';

const MODEL_LOCAL_PATH = '/tmp/upscale-models/swin2sr_realworld_uint8.onnx';
const MODEL_HF_URL =
  'https://huggingface.co/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model_uint8.onnx';

const modelExists = existsSync(MODEL_LOCAL_PATH);

test.describe('Upscale ONNX tile-size probe (v2 realworld model)', () => {
  test.beforeEach(async ({ page }) => {
    if (!modelExists) return;

    // Suppress the COI service worker's one-time reload.
    await page.addInitScript(() => {
      sessionStorage.setItem('coi-reloaded', '1');
    });

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

  test('probe tile sizes 64 → 256 step 32', async ({ page }) => {
    if (!modelExists) {
      test.skip();
      return;
    }
    await page.goto('/');
    test.setTimeout(600_000); // up to 10min for the full probe

    const results = await page.evaluate(
      async ([downloaderUrl, sessionUrl]: string[]) => {
        // @ts-ignore
        const { downloadModelWithProgress } = await import(downloaderUrl);
        await downloadModelWithProgress(undefined, () => {});

        // @ts-ignore
        const { getUpscaleSession } = await import(sessionUrl);
        const session = await getUpscaleSession();
        const inputName = session.inputNames[0];

        // The Tensor constructor is exposed via the session's own module graph;
        // get it through the first session created. For simplicity, use a
        // trick: create a synthetic tensor via the ort global that session.ts
        // already loaded (it's cached after first import).
        // @ts-ignore
        const ort = (await import('/node_modules/onnxruntime-web/dist/ort.mjs'));

        const sizes = [64, 96, 128, 160, 192, 224, 256];
        const out: { size: number; ok: boolean; ms?: number; err?: string }[] = [];

        for (const n of sizes) {
          const floats = new Float32Array(3 * n * n);
          for (let i = 0; i < floats.length; i++) floats[i] = (i % 255) / 255;
          const tensor = new ort.Tensor('float32', floats, [1, 3, n, n]);
          const t0 = performance.now();
          try {
            await session.run({ [inputName]: tensor });
            out.push({ size: n, ok: true, ms: Math.round(performance.now() - t0) });
          } catch (e) {
            out.push({
              size: n,
              ok: false,
              err: (e as Error).message?.slice(0, 300) ?? String(e),
            });
          }
        }
        return out;
      },
      ['/src/lib/upscale/downloader.ts', '/src/lib/upscale/session.ts'],
    );

    // eslint-disable-next-line no-console
    console.log('\n=== Tile-size probe results (v2 realworld model) ===');
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        r.ok
          ? `  ${String(r.size).padStart(3)}×${r.size}  ✓  ${r.ms}ms`
          : `  ${String(r.size).padStart(3)}×${r.size}  ✗  ${r.err}`,
      );
    }
  });
});
