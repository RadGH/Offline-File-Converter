/**
 * Live preview renderer + before/after slider helper.
 *
 * Decoding the source is expensive, so we cache the decoded canvas keyed by
 * file identity. Filters re-run on every settings change but use the cached
 * source canvas, debounced ~250ms.
 */

import type { PerFileSettings } from '@/lib/queue/store';
import { decodeFirstFrame, type DecodedSource } from './decode';
import { applyFilters } from './filters';

const sourceCache = new WeakMap<File, Promise<DecodedSource>>();

export function getSourceDecoded(file: File): Promise<DecodedSource> {
  let p = sourceCache.get(file);
  if (!p) {
    p = decodeFirstFrame(file);
    sourceCache.set(file, p);
  }
  return p;
}

export interface RenderOpts {
  /** Maximum preview side, e.g. 600. Output is contained within this box. */
  maxSide: number;
  /** Skip filter pipeline (raw mode for eyedropper). */
  raw?: boolean;
}

export interface RenderResult {
  before: ImageBitmap | OffscreenCanvas | HTMLCanvasElement;
  after: ImageBitmap | OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
  /** Raw source canvas at preview size — used by eyedropper for color picking. */
  rawSource: OffscreenCanvas | HTMLCanvasElement;
  hasAlpha: boolean;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export async function renderPreview(file: File, settings: PerFileSettings, opts: RenderOpts): Promise<RenderResult> {
  const src = await getSourceDecoded(file);
  const ratio = Math.min(opts.maxSide / src.width, opts.maxSide / src.height, 1);
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));

  // "Before" canvas — raw downscaled source, filters off.
  const before = makeCanvas(w, h);
  const bctx = before.getContext('2d', { alpha: true } as CanvasRenderingContext2DSettings) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!bctx) throw new Error('preview: ctx');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(src.canvas, 0, 0, w, h);

  // "After" canvas — filters applied unless raw mode.
  const after = makeCanvas(w, h);
  const actx = after.getContext('2d', { alpha: true } as CanvasRenderingContext2DSettings) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!actx) throw new Error('preview: ctx');
  actx.imageSmoothingEnabled = true;
  actx.imageSmoothingQuality = 'high';
  actx.drawImage(src.canvas, 0, 0, w, h);

  if (!opts.raw) {
    const id = actx.getImageData(0, 0, w, h);
    applyFilters(id, {
      filters: settings.filters,
      paletteOverrides: settings.paletteOverrides,
    });
    actx.putImageData(id, 0, 0);
  }

  return {
    before, after, width: w, height: h,
    rawSource: before, hasAlpha: src.hasAlpha,
  };
}

/** Sample a single pixel from a canvas at integer coords. Returns [r,g,b]. */
export function samplePixel(canvas: OffscreenCanvas | HTMLCanvasElement, x: number, y: number): [number, number, number] {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  if (!ctx) return [0, 0, 0];
  const cx = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
  const d = ctx.getImageData(cx, cy, 1, 1).data;
  return [d[0], d[1], d[2]];
}
