import type { ConversionInput, ConversionResult } from './types';
import { detectInputFormat } from '@/lib/utils/mime';
import { convertViaCanvas } from './canvas';

export type { ConversionInput, ConversionResult };

/**
 * Dispatcher: routes a conversion to the appropriate codec.
 *
 * Phase 6 adds AVIF encode, GIF encode, HEIC decode, and PNG optimization.
 * All heavy codecs (avif, gif, heic, png-optimize) are lazy-loaded via
 * dynamic import() so they are excluded from the initial bundle.
 *
 * HEIC input is handled by decoding the HEIC to a PNG blob first via heic2any,
 * then piping the resulting PNG through the normal pipeline as if it were a PNG
 * input file.
 *
 * Workers: AVIF and GIF are computationally heavy WASM/worker-based codecs.
 * Per the build plan they should run in Web Workers. However, gif.js internally
 * manages its own Web Worker (gif.worker.js) for pixel processing, so it is
 * effectively off-thread already. @jsquash/avif initialises a WASM module but
 * does not spin its own worker — it runs synchronously on the calling thread.
 * A dedicated converter.worker.ts wrapper would isolate that from the UI thread
 * further, but this is deferred (see NOTE below).
 *
 * NOTE — Web Worker wrapper deferral:
 *   The converter.worker.ts integration for AVIF main-thread WASM is deferred.
 *   Reason: @jsquash/avif requires SharedArrayBuffer for cross-origin isolated
 *   contexts and has WASM initialisation that needs the module URL resolved at
 *   import time, which conflicts with Vite's worker bundling unless the worker
 *   is co-bundled with the WASM asset. Wiring this correctly without breaking
 *   the existing canvas pipeline and unit test suite requires additional build
 *   config changes that are out of scope for Phase 6. The AVIF encoder runs on
 *   the main thread for now — it is async and non-blocking for typical image
 *   sizes (<10 MB). GIF encoding already runs in gif.js's internal worker.
 *   A TODO is recorded in src/lib/workers/converter.worker.ts.
 */
export async function convert(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  let { file, settings } = input;
  let { originalDimensions } = input;

  // ── HEIC decode passthrough ─────────────────────────────────────────────────
  const inputFormat = detectInputFormat(file);
  if (inputFormat === 'heic') {
    // Lazy-load heic decoder
    const { decodeHeic } = await import('./heic');
    const pngBlob = await decodeHeic(file);
    // Wrap decoded PNG blob as a File so the rest of the pipeline can use it
    file = new File([pngBlob], file.name + '.decoded.png', { type: 'image/png' });
    // originalDimensions will be detected fresh from the new file if needed
  }

  // ── Output format routing ───────────────────────────────────────────────────
  const { format } = settings;

  switch (format) {
    case 'jpeg':
    case 'png':
    case 'webp': {
      // Canvas API handles these natively in all modern browsers.
      const result = await convertViaCanvas({ file, settings, originalDimensions }, onProgress);

      // Optional PNG optimisation pass
      if (format === 'png' && settings.pngOptimize) {
        const { optimizePng } = await import('./png-optimize');
        const optimizedBlob = await optimizePng(result.blob, (pct) => {
          // Compress the progress range into 0–20 so it doesn't look like it
          // jumped backwards after the canvas encoder reported 100.
          onProgress?.(80 + Math.round(pct * 0.2));
        });
        return {
          ...result,
          blob: optimizedBlob,
          outSize: optimizedBlob.size,
        };
      }

      return result;
    }

    case 'avif': {
      // Lazy-load @jsquash/avif WASM encoder
      const { convertToAvif } = await import('./avif');
      return convertToAvif({ file, settings, originalDimensions }, onProgress);
    }

    case 'gif': {
      // Lazy-load gif.js encoder (gif.js manages its own internal web worker)
      const { convertToGif } = await import('./gif');
      return convertToGif({ file, settings, originalDimensions }, onProgress);
    }

    default: {
      // TypeScript exhaustiveness guard
      const _never: never = format;
      throw new Error(`Unknown output format: ${String(_never)}`);
    }
  }
}
