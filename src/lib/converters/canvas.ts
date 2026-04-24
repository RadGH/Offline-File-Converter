import type { ConverterFn, ConversionResult } from './types';
import { mimeForOutput, extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';

// NOTE: Known limitation — EXIF/metadata preservation is out of scope for Phase 4.
// Re-encoding via canvas always strips metadata regardless of the `stripMetadata`
// setting. The strip-metadata toggle is effectively a no-op until a future phase
// adds an EXIF-preservation library (e.g. piexifjs or libexif via WASM).

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  // Primary path: createImageBitmap — supported for JPEG, PNG, WebP, GIF, BMP,
  // and AVIF on modern browsers. HEIC is not natively supported; Phase 6 will
  // add a WASM decoder for that.
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback: <img> + Object URL (some browsers handle more MIME types this way)
    return new Promise<ImageBitmap>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        createImageBitmap(img)
          .then(resolve)
          .catch(reject);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image: ${file.name}`));
      };
      img.src = url;
    });
  }
}

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

function blobToCanvas(
  bitmap: ImageBitmap,
  outWidth: number,
  outHeight: number
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(outWidth, outHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d context from OffscreenCanvas');
    ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
    return canvas;
  }
  // Fallback: detached HTMLCanvasElement (never attached to DOM)
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context from canvas');
  ctx.drawImage(bitmap, 0, 0, outWidth, outHeight);
  return canvas;
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      },
      mime,
      quality
    );
  });
}

export const convertViaCanvas: ConverterFn = async (input, onProgress) => {
  const { file, settings, originalDimensions } = input;
  const format = settings.format;
  const mime = mimeForOutput(format);
  const ext = extForOutput(format);
  const quality = settings.quality / 100;

  onProgress?.(10); // about to decode

  const bitmap = await loadImageBitmap(file);

  onProgress?.(40); // decoded

  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;

  // Use originalDimensions if available (pre-detected), otherwise use bitmap dims
  const baseDims = originalDimensions ?? { width: srcWidth, height: srcHeight };
  const { width: outWidth, height: outHeight } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
  });

  onProgress?.(70); // resized (logically; actual draw happens next)

  const canvas = blobToCanvas(bitmap, outWidth, outHeight);
  bitmap.close();

  const blob = await canvasToBlob(canvas, mime, quality);

  onProgress?.(100);

  const outName = buildOutName(file.name, ext);

  const result: ConversionResult = {
    blob,
    outName,
    outSize: blob.size,
    outWidth,
    outHeight,
    outFormat: format,
  };

  return result;
};
