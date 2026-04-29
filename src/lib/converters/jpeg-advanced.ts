/**
 * Advanced JPEG encoder via @jsquash/jpeg (MozJPEG WASM).
 * Exposes progressive + chroma subsampling.
 *
 * Used only when settings.jpeg is set.
 */

import type { ConversionInput, ConversionResult } from './types';
import { extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';
import { decodeProcessedImageData } from './canvas';

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

function chromaToMozjpeg(c: '4:4:4' | '4:2:2' | '4:2:0'): number {
  // mozjpeg subsampling: 0=4:4:4, 1=4:2:2 (h subsample), 2=4:2:0 (h+v subsample)
  if (c === '4:4:4') return 0;
  if (c === '4:2:2') return 1;
  return 2;
}

export async function convertToJpegAdvanced(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;
  const adv = settings.jpeg;
  if (!adv) throw new Error('jpeg-advanced called without settings.jpeg');

  onProgress?.(10);

  let baseDims = originalDimensions;
  if (!baseDims) {
    try {
      const bmp = await createImageBitmap(file);
      baseDims = { width: bmp.width, height: bmp.height };
      bmp.close?.();
    } catch { baseDims = { width: 1, height: 1 }; }
  }
  const { width: outWidth, height: outHeight } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
    preserveOrientation: settings.preserveOrientation,
    dimensionUnit: settings.dimensionUnit,
  });

  // JPEG cannot store alpha. Composite onto white before passing pixels in.
  const { imageData } = await decodeProcessedImageData(file, outWidth, outHeight, settings);
  // Composite alpha onto white if any transparency.
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 255) {
      const t = a / 255;
      d[i]     = Math.round(d[i] * t + 255 * (1 - t));
      d[i + 1] = Math.round(d[i + 1] * t + 255 * (1 - t));
      d[i + 2] = Math.round(d[i + 2] * t + 255 * (1 - t));
      d[i + 3] = 255;
    }
  }

  onProgress?.(60);

  const { encode } = await import('@jsquash/jpeg');
  const buf = await encode(imageData, {
    quality: settings.quality,
    progressive: adv.progressive,
    chroma_subsample: chromaToMozjpeg(adv.chromaSubsampling),
  });

  const blob = new Blob([buf], { type: 'image/jpeg' });
  onProgress?.(100);

  return {
    blob, outName: buildOutName(file.name, extForOutput('jpeg')),
    outSize: blob.size, outWidth, outHeight, outFormat: 'jpeg',
  };
}
