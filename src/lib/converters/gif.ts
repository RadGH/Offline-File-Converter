/**
 * GIF encoder via gif.js (LZW-based, runs a GIF worker).
 * This module is lazy-loaded by the dispatcher — never import it at the top level.
 *
 * Limitations:
 * - Animated GIF input: only first frame is decoded (animated GIF output requires
 *   multiple frames, which is out of scope for the MVP single-frame encoder).
 * - Quality slider mapped to gif.js quality option (1–30, lower = better quality).
 *   Formula: gifQuality = max(1, round(30 - (sliderQuality/100)*29))
 */

import type { ConversionInput, ConversionResult } from './types';
import { extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

export async function convertToGif(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;

  onProgress?.(10); // decode start

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        createImageBitmap(img).then(resolve).catch(reject);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image: ${file.name}`));
      };
      img.src = url;
    });
  }

  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;

  const baseDims = originalDimensions ?? { width: srcWidth, height: srcHeight };
  const { width: outWidth, height: outHeight } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
  });

  // Draw onto an OffscreenCanvas at the target size, get ImageData
  const canvas = new OffscreenCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context from OffscreenCanvas');
  ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, outWidth, outHeight);

  // Map quality slider (1–100) to gif.js quality (1–30; 1=best, 30=worst)
  const gifQuality = Math.max(1, Math.round(30 - (settings.quality / 100) * 29));

  // Resolve the gif.worker.js URL using Vite's asset URL pattern
  const workerUrl = new URL('gif.js/dist/gif.worker.js', import.meta.url).href;

  // Dynamic import — never pulled into the main bundle
  const GIF = (await import('gif.js')).default;

  const blob = await new Promise<Blob>((resolve, reject) => {
    const encoder = new GIF({
      quality: gifQuality,
      width: outWidth,
      height: outHeight,
      workerScript: workerUrl,
      workers: 1,
    });

    encoder.addFrame(imageData, { copy: true });

    encoder.on('progress', (pct: number) => {
      onProgress?.(10 + pct * 90);
    });

    encoder.on('finished', (finishedBlob: Blob) => {
      resolve(finishedBlob);
    });

    encoder.on('abort', () => {
      reject(new Error('GIF encoding aborted'));
    });

    // gif.js emits 'error' in some scenarios
    (encoder as unknown as { on(ev: string, fn: (e: Error) => void): void })
      .on('error', (err: Error) => reject(err));

    encoder.render();
  });

  onProgress?.(100);

  const outName = buildOutName(file.name, extForOutput('gif'));

  return {
    blob,
    outName,
    outSize: blob.size,
    outWidth,
    outHeight,
    outFormat: 'gif',
  };
}
