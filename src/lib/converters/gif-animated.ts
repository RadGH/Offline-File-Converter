/**
 * Animated GIF encoder via gifenc (multi-frame).
 *
 * Lazy-loaded by the dispatcher. Uses ImageDecoder to extract every frame
 * from an animated source (animated webp, animated gif), then writes each
 * frame to the gifenc output with the source-provided delay.
 *
 * Limitations:
 *   - On browsers without WebCodecs ImageDecoder (Firefox/Safari), the
 *     decoder falls back to a single composited frame, so the output will
 *     be a static GIF. The user is informed via toast inside the dispatcher
 *     when this happens (frame count == 1 from a known animated source).
 */

import type { ConversionInput, ConversionResult } from './types';
import { extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';
import { decodeAllFrames } from '@/lib/advanced/decode-frames';
import { applyFilters } from '@/lib/advanced/filters';
import { DEFAULT_GIF_ADVANCED } from '@/lib/queue/store';

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export async function convertToGifAnimated(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;

  onProgress?.(5);
  const decoded = await decodeAllFrames(file);
  onProgress?.(25);

  const baseDims = originalDimensions ?? { width: decoded.width, height: decoded.height };
  const { width: outW, height: outH } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
    preserveOrientation: settings.preserveOrientation,
    dimensionUnit: settings.dimensionUnit,
  });

  const adv = settings.gif ?? DEFAULT_GIF_ADVANCED;
  const useTransparency = adv.transparency !== 'off';
  const paletteSize = Math.max(2, Math.min(256, adv.paletteSize));

  const { quantize, applyPalette, GIFEncoder } = await import('gifenc');
  const encoder = GIFEncoder();

  const totalFrames = decoded.frames.length;

  // Resample mode for downscaling each frame.
  const resample = settings.resample ?? 'high';

  // We compute one global palette from the first frame to keep file size
  // reasonable; per-frame palettes balloon the output. gifenc supports
  // local palettes per frame too — left as future work.
  let globalPalette: number[][] | null = null;

  for (let i = 0; i < totalFrames; i++) {
    const frame = decoded.frames[i];
    const cv = makeCanvas(outW, outH);
    const ctx = (cv as unknown as { getContext(t: '2d', o?: { alpha?: boolean }): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null }).getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not get 2d context');
    if (resample === 'nearest') ctx.imageSmoothingEnabled = false;
    else if (resample === 'bilinear') { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
    else { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(frame.bitmap, 0, 0, outW, outH);
    const id = ctx.getImageData(0, 0, outW, outH);

    // Apply advanced filters per frame (consistent across animation).
    if (settings.filters || (settings.paletteOverrides && settings.paletteOverrides.length > 0)) {
      applyFilters(id, { filters: settings.filters, paletteOverrides: settings.paletteOverrides });
    }

    if (!globalPalette) {
      globalPalette = quantize(id.data, paletteSize, {
        format: useTransparency ? 'rgba4444' : 'rgb444',
      });
    }

    const indexed = applyPalette(id.data, globalPalette, useTransparency ? 'rgba4444' : 'rgb444');

    // Resolve transparent index when transparency is on.
    let transparentIndex: number | undefined;
    if (useTransparency) {
      for (let k = 0; k < globalPalette.length; k++) {
        const c = globalPalette[k];
        if (c.length >= 4 && c[3] === 0) { transparentIndex = k; break; }
      }
    }

    encoder.writeFrame(indexed, outW, outH, {
      palette: i === 0 ? globalPalette : undefined,
      delay: frame.durationMs,
      transparent: useTransparency,
      transparentIndex,
      first: i === 0,
      repeat: i === 0 ? (decoded.loop || 0) : undefined,
      // dispose=2 → restore to background; required for transparent animations
      dispose: useTransparency ? 2 : -1,
    });

    onProgress?.(25 + Math.round((i + 1) / totalFrames * 70));
    // Yield occasionally so the UI thread breathes.
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
    // Free the source bitmap.
    frame.bitmap.close?.();
  }

  encoder.finish();
  const bytes = encoder.bytes();
  const buf = new Uint8Array(bytes.byteLength); buf.set(bytes);
  const blob = new Blob([buf.buffer], { type: 'image/gif' });

  onProgress?.(100);

  return {
    blob,
    outName: buildOutName(file.name, extForOutput('gif-animated')),
    outSize: blob.size,
    outWidth: outW,
    outHeight: outH,
    outFormat: 'gif-animated',
  };
}
