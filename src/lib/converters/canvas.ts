import type { ConverterFn } from './types';
import { mimeForOutput, extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';
import { decodeToImageData, decodeFirstFrame } from '@/lib/advanced/decode';
import { applyFilters } from '@/lib/advanced/filters';

// NOTE: Known limitation — EXIF/metadata preservation is out of scope for Phase 4.
// Re-encoding via canvas always strips metadata regardless of the `stripMetadata`
// setting.

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
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
      (blob) => { if (blob) resolve(blob); else reject(new Error('canvas.toBlob returned null')); },
      mime,
      quality
    );
  });
}

/** True when the user has any active advanced edits that affect pixel data. */
function hasAdvancedEdits(settings: import('@/lib/queue/store').PerFileSettings): boolean {
  if (settings.paletteOverrides && settings.paletteOverrides.length > 0) return true;
  const f = settings.filters;
  if (!f) return false;
  return f.brightness !== 0 || f.contrast !== 0 || f.saturation !== 0
    || f.invert || f.grayscale || f.posterize >= 2;
}

export const convertViaCanvas: ConverterFn = async (input, onProgress) => {
  const { file, settings, originalDimensions } = input;
  const format = settings.format;
  const mime = mimeForOutput(format);
  const ext = extForOutput(format);
  const quality = settings.quality / 100;

  onProgress?.(10);

  // Decode first frame with alpha preserved (fixes animated-webp black bg).
  const decoded = await decodeFirstFrame(file);
  onProgress?.(40);

  const baseDims = originalDimensions ?? { width: decoded.width, height: decoded.height };
  const { width: outWidth, height: outHeight } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
    preserveOrientation: settings.preserveOrientation,
    dimensionUnit: settings.dimensionUnit,
  });

  const canvas = makeCanvas(outWidth, outHeight);
  const ctx = canvas.getContext('2d', { alpha: true } as CanvasRenderingContext2DSettings) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('Could not get 2d context');

  const resample = settings.resample ?? 'high';
  if (resample === 'nearest') ctx.imageSmoothingEnabled = false;
  else if (resample === 'bilinear') { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
  else { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }

  ctx.clearRect(0, 0, outWidth, outHeight);
  ctx.drawImage(decoded.canvas, 0, 0, outWidth, outHeight);
  onProgress?.(70);

  // Apply advanced filters if present.
  if (hasAdvancedEdits(settings)) {
    const imgData = ctx.getImageData(0, 0, outWidth, outHeight);
    applyFilters(imgData, {
      filters: settings.filters,
      paletteOverrides: settings.paletteOverrides,
    });
    ctx.putImageData(imgData, 0, 0);
  }

  // For JPEG (no alpha), if source has alpha we need a background — composite
  // onto white instead of black. Re-paint with white-fill underneath.
  if (format === 'jpeg' && decoded.hasAlpha) {
    const tmp = makeCanvas(outWidth, outHeight);
    const tctx = tmp.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (tctx) {
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, outWidth, outHeight);
      tctx.drawImage(canvas, 0, 0);
      const blob = await canvasToBlob(tmp, mime, quality);
      onProgress?.(100);
      return {
        blob, outName: buildOutName(file.name, ext), outSize: blob.size,
        outWidth, outHeight, outFormat: format,
      };
    }
  }

  const blob = await canvasToBlob(canvas, mime, quality);
  onProgress?.(100);

  return {
    blob,
    outName: buildOutName(file.name, ext),
    outSize: blob.size,
    outWidth,
    outHeight,
    outFormat: format,
  };
};

/**
 * Helper used by other converters (avif, webp-advanced, gif-advanced) to get
 * a properly-decoded ImageData with alpha preserved + filters applied.
 */
export async function decodeProcessedImageData(
  file: File,
  outWidth: number,
  outHeight: number,
  settings: import('@/lib/queue/store').PerFileSettings,
): Promise<{ imageData: ImageData; sourceHasAlpha: boolean }> {
  const { imageData, sourceHasAlpha } = await decodeToImageData(
    file, outWidth, outHeight, settings.resample ?? 'high'
  );
  if (hasAdvancedEdits(settings)) {
    applyFilters(imageData, {
      filters: settings.filters,
      paletteOverrides: settings.paletteOverrides,
    });
  }
  return { imageData, sourceHasAlpha };
}
