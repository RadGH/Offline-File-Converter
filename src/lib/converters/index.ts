import type { ConversionInput, ConversionResult, ConvertOptions } from './types';
import { detectInputFormat } from '@/lib/utils/mime';
import { convertViaCanvas } from './canvas';

export type { ConversionInput, ConversionResult, ConvertOptions };

/**
 * Services injected by the processor to enable optional AI upscaling.
 * Keeping this as a parameter (not a singleton import) makes the converter
 * independently testable without touching the store or worker.
 */
export interface UpscaleServices {
  /** Returns true when the model is cached and ready to run. */
  isModelReady: () => boolean;
  /** Run upscaling on a Blob. Caller picks scale factor. */
  runUpscale: (blob: Blob, scale: 2 | 4, onProgress?: (pct: number) => void) => Promise<Blob>;
}

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
  onProgress?: (pct: number) => void,
  options?: {
    upscaleServices?: UpscaleServices;
    onUpscaled?: (factor: 2 | 4) => void;
    onUpscaleStart?: () => void;
    onUpscaleEnd?: () => void;
  },
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

  // ── Optional AI upscale step (before resize+encode) ──────────────────────────
  // If the user checked "Upscale with AI", run the model. Do NOT gate on
  // "willEnlarge" — the user has explicitly opted in, and upscaling even when
  // the target is smaller still produces a crisper result than naive downscale
  // of a low-res source. Model runs at its native 4x scale.
  if (settings.upscale && options?.upscaleServices?.isModelReady()) {
    const factor: 4 = 4;
    onProgress?.(5);
    options.onUpscaleStart?.();
    // Relay per-tile progress from the worker into the 5-70% range so the
    // user sees movement during inference (upscaling dominates total time).
    const upscaledBlob = await options.upscaleServices.runUpscale(file, factor, (pct) => {
      onProgress?.(5 + Math.round((pct / 100) * 65));
    });
    options.onUpscaleEnd?.();
    // Replace file with upscaled result; bump originalDimensions (if known)
    // by the scale factor so the subsequent resize step sees the new source.
    file = new File([upscaledBlob], file.name, { type: upscaledBlob.type || 'image/png' });
    if (originalDimensions) {
      originalDimensions = {
        width: originalDimensions.width * factor,
        height: originalDimensions.height * factor,
      };
    }
    options.onUpscaled?.(factor);
    // (Do not reset onProgress here — keep climbing from 70% into the
    // resize/encode phase below.)
  }

  // ── Output format routing ───────────────────────────────────────────────────
  let { format } = settings;

  // Resolve 'auto' before dispatching. Probe the file once for alpha + frame count.
  if (format === 'auto') {
    const { resolveAutoFormat } = await import('./auto-format');
    const { decodeAllFrames } = await import('@/lib/advanced/decode-frames');
    let isAnimated = false;
    let hasAlpha = false;
    try {
      const probe = await decodeAllFrames(file);
      isAnimated = probe.frames.length > 1;
      // Sample alpha from the first frame.
      if (probe.frames.length > 0) {
        const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(probe.width, probe.height) : null;
        if (cv) {
          const ctx = (cv as unknown as { getContext(t: '2d', o?: { alpha?: boolean }): CanvasRenderingContext2DSettings | null })
            .getContext('2d', { alpha: true }) as unknown as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
          if (ctx) {
            ctx.clearRect(0, 0, probe.width, probe.height);
            ctx.drawImage(probe.frames[0].bitmap, 0, 0);
            // Sample-check alpha on a 32×32 grid.
            const stepX = Math.max(1, Math.floor(probe.width / 32));
            const stepY = Math.max(1, Math.floor(probe.height / 32));
            const id = ctx.getImageData(0, 0, probe.width, probe.height);
            outer: for (let y = 0; y < probe.height; y += stepY) {
              for (let x = 0; x < probe.width; x += stepX) {
                if (id.data[(y * probe.width + x) * 4 + 3] < 255) { hasAlpha = true; break outer; }
              }
            }
          }
        }
        probe.frames.forEach(f => f.bitmap.close?.());
      }
    } catch {
      // probe failure → fall through with isAnimated=false, hasAlpha=false
    }
    format = resolveAutoFormat(file, { hasAlpha, isAnimated });
    settings = { ...settings, format };
  }

  switch (format) {
    case 'jpeg': {
      // Advanced JPEG path (progressive + chroma subsampling) only when user
      // has configured settings.jpeg via the advanced panel.
      if (settings.jpeg) {
        const { convertToJpegAdvanced } = await import('./jpeg-advanced');
        return convertToJpegAdvanced({ file, settings, originalDimensions }, onProgress);
      }
      return convertViaCanvas({ file, settings, originalDimensions }, onProgress);
    }
    case 'webp': {
      if (settings.webp) {
        const { convertToWebpAdvanced } = await import('./webp-advanced');
        return convertToWebpAdvanced({ file, settings, originalDimensions }, onProgress);
      }
      return convertViaCanvas({ file, settings, originalDimensions }, onProgress);
    }
    case 'png': {
      const result = await convertViaCanvas({ file, settings, originalDimensions }, onProgress);
      const { optimizePng } = await import('./png-optimize');
      const optimizedBlob = await optimizePng(
        result.blob,
        (pct) => onProgress?.(80 + Math.round(pct * 0.2)),
        settings.png ? {
          paletteQuantize: settings.png.paletteQuantize,
          paletteSize: settings.png.paletteSize,
        } : undefined,
      );
      return { ...result, blob: optimizedBlob, outSize: optimizedBlob.size };
    }

    case 'avif': {
      // Lazy-load @jsquash/avif WASM encoder
      const { convertToAvif } = await import('./avif');
      return convertToAvif({ file, settings, originalDimensions }, onProgress);
    }

    case 'gif': {
      // Lazy-load gif encoder (gifenc; static single-frame).
      const { convertToGif } = await import('./gif');
      return convertToGif({ file, settings, originalDimensions }, onProgress);
    }

    case 'gif-animated': {
      const { convertToGifAnimated } = await import('./gif-animated');
      return convertToGifAnimated({ file, settings, originalDimensions }, onProgress);
    }

    case 'webp-animated': {
      const { convertToWebpAnimated } = await import('./webp-animated');
      return convertToWebpAnimated({ file, settings, originalDimensions }, onProgress);
    }

    case 'auto':
    default: {
      // 'auto' is resolved earlier; reaching here means a typo or future
      // format that wasn't wired in. Fall back to canvas with a sane mime.
      throw new Error(`Unknown output format: ${String(format)}`);
    }
  }
}
