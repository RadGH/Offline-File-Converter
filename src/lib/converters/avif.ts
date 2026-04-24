/**
 * AVIF encoder via @jsquash/avif (WASM-based).
 * This module is lazy-loaded by the dispatcher — never import it at the top level.
 */

import type { ConversionInput, ConversionResult } from './types';
import { extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

async function getImageData(
  file: File,
  outWidth: number,
  outHeight: number
): Promise<ImageData> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Fallback via <img> + ObjectURL
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

  const canvas = new OffscreenCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context from OffscreenCanvas');
  ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
  bitmap.close();

  return ctx.getImageData(0, 0, outWidth, outHeight);
}

export async function convertToAvif(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;

  onProgress?.(10); // decode start

  const bitmap = await createImageBitmap(file).catch(async () => {
    return new Promise<ImageBitmap>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); createImageBitmap(img).then(resolve).catch(reject); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load: ${file.name}`)); };
      img.src = url;
    });
  });
  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;
  bitmap.close();

  onProgress?.(30); // decoded

  const baseDims = originalDimensions ?? { width: srcWidth, height: srcHeight };
  const { width: outWidth, height: outHeight } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
  });

  onProgress?.(60); // resized

  const imageData = await getImageData(file, outWidth, outHeight);

  // Dynamic import — never pulled into the main bundle.
  // @jsquash/avif exports encode as a named export (not default).
  const { encode } = await import('@jsquash/avif');
  const arrayBuffer = await encode(imageData, { quality: settings.quality });

  const blob = new Blob([arrayBuffer], { type: 'image/avif' });

  onProgress?.(100);

  const outName = buildOutName(file.name, extForOutput('avif'));

  return {
    blob,
    outName,
    outSize: blob.size,
    outWidth,
    outHeight,
    outFormat: 'avif',
  };
}
