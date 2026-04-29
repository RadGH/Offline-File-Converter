/**
 * Advanced WebP encoder via @jsquash/webp.
 *
 * Used only when settings.webp is set (i.e. the user has loaded the advanced
 * pack and configured WebP-specific options). The simple/canvas WebP path
 * remains for users who haven't loaded advanced features — it stays fast
 * and small.
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

export async function convertToWebpAdvanced(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;
  const adv = settings.webp;
  if (!adv) throw new Error('webp-advanced called without settings.webp');

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

  const { imageData } = await decodeProcessedImageData(file, outWidth, outHeight, settings);
  onProgress?.(60);

  const { encode } = await import('@jsquash/webp');
  const buf = await encode(imageData, {
    quality: settings.quality,
    lossless: adv.lossless ? 1 : 0,
    alpha_quality: adv.alphaQuality,
    method: Math.max(0, Math.min(6, adv.method)),
    near_lossless: Math.max(0, Math.min(100, adv.nearLossless)),
  });

  const blob = new Blob([buf], { type: 'image/webp' });
  onProgress?.(100);

  return {
    blob, outName: buildOutName(file.name, extForOutput('webp')),
    outSize: blob.size, outWidth, outHeight, outFormat: 'webp',
  };
}
