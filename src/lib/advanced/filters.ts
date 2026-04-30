/**
 * Pure-TS image filter pipeline operating on ImageData.
 *
 * Applied in this order:
 *   1. brightness/contrast/saturation
 *   2. grayscale
 *   3. invert
 *   4. palette overrides (per-color remap)
 *   5. posterize (with optional dither)
 *
 * All operations mutate the passed ImageData in place. Caller owns lifecycle.
 */

import type { AdvancedFilters, PaletteOverride } from '@/lib/queue/store';
import { extractPalette, nearestIndex, type RGB } from './palette';

const clamp = (v: number): number => v < 0 ? 0 : v > 255 ? 255 : v;

function applyBrightnessContrastSaturation(d: Uint8ClampedArray, b: number, c: number, s: number): void {
  // brightness: -100..100 → -255..255 additive
  const bAdd = (b / 100) * 255;
  // contrast: -100..100 → factor centered on 128
  // We map -100..100 → -255..255 for contrast
  const cMapped = (c / 100) * 255;
  const cf = (259 * (cMapped + 255)) / (255 * (259 - cMapped));
  // saturation: -100..100 → multiplier 0..2
  const sMul = 1 + (s / 100);

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], bl = d[i + 2];
    // brightness
    if (bAdd !== 0) { r += bAdd; g += bAdd; bl += bAdd; }
    // contrast
    if (c !== 0) {
      r = cf * (r - 128) + 128;
      g = cf * (g - 128) + 128;
      bl = cf * (bl - 128) + 128;
    }
    // saturation
    if (s !== 0) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = luma + (r - luma) * sMul;
      g = luma + (g - luma) * sMul;
      bl = luma + (bl - luma) * sMul;
    }
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(bl);
  }
}

function applyGrayscale(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const luma = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = clamp(luma);
  }
}

function applyInvert(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

/** Replace each pixel that is "close enough" to a from-color with its to-color. */
function applyPaletteOverrides(d: Uint8ClampedArray, overrides: PaletteOverride[]): void {
  if (overrides.length === 0) return;
  const tol = 12; // +/- per channel; tuned for picked-pixel matches
  const tol2 = tol * tol * 3;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    for (const o of overrides) {
      const dr = r - o.from[0];
      const dg = g - o.from[1];
      const db = b - o.from[2];
      if (dr * dr + dg * dg + db * db <= tol2) {
        d[i] = o.to[0];
        d[i + 1] = o.to[1];
        d[i + 2] = o.to[2];
        break;
      }
    }
  }
}

function quantizeUniform(d: Uint8ClampedArray, levels: number): void {
  if (levels < 2) return;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.round(d[i] / step) * step;
    d[i + 1] = Math.round(d[i + 1] / step) * step;
    d[i + 2] = Math.round(d[i + 2] / step) * step;
  }
}

function quantizePalette(
  img: ImageData,
  palette: RGB[],
  dither: AdvancedFilters['dither']
): void {
  const w = img.width, h = img.height;
  const d = img.data;
  if (dither === 'floyd-steinberg') {
    const buf = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) buf[i] = d[i];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const r = clamp(buf[o]);
        const g = clamp(buf[o + 1]);
        const b = clamp(buf[o + 2]);
        const idx = nearestIndex(palette, r, g, b);
        const nr = palette[idx][0], ng = palette[idx][1], nb = palette[idx][2];
        const er = r - nr, eg = g - ng, eb = b - nb;
        d[o] = nr; d[o + 1] = ng; d[o + 2] = nb;
        const distribute = (dx: number, dy: number, f: number) => {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy >= h) return;
          const oo = (yy * w + xx) * 4;
          buf[oo] += er * f;
          buf[oo + 1] += eg * f;
          buf[oo + 2] += eb * f;
        };
        distribute(1, 0, 7 / 16);
        distribute(-1, 1, 3 / 16);
        distribute(0, 1, 5 / 16);
        distribute(1, 1, 1 / 16);
      }
    }
  } else if (dither === 'ordered') {
    const m = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const t = (m[y & 3][x & 3] / 16 - 0.5) * 32;
        const r = clamp(d[o] + t);
        const g = clamp(d[o + 1] + t);
        const b = clamp(d[o + 2] + t);
        const idx = nearestIndex(palette, r, g, b);
        d[o] = palette[idx][0]; d[o + 1] = palette[idx][1]; d[o + 2] = palette[idx][2];
      }
    }
  } else {
    for (let i = 0; i < d.length; i += 4) {
      const idx = nearestIndex(palette, d[i], d[i + 1], d[i + 2]);
      d[i] = palette[idx][0]; d[i + 1] = palette[idx][1]; d[i + 2] = palette[idx][2];
    }
  }
}

/** One-pass quantizer: for each pixel, find the nearest `from` color in the
 *  override list and write the corresponding `to` color. Optionally dithered.
 *  This is the posterize+palette-overwrite step combined. */
function quantizeToOverrides(
  img: ImageData,
  overrides: PaletteOverride[],
  dither: AdvancedFilters['dither']
): void {
  const fromPalette: RGB[] = overrides.map(o => [o.from[0], o.from[1], o.from[2]]);
  const w = img.width, h = img.height;
  const d = img.data;
  const writeMapped = (idx: number, ix: number) => {
    const to = overrides[ix].to;
    d[idx] = to[0]; d[idx + 1] = to[1]; d[idx + 2] = to[2];
  };
  if (dither === 'floyd-steinberg') {
    const buf = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) buf[i] = d[i];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const r = clamp(buf[o]), g = clamp(buf[o + 1]), b = clamp(buf[o + 2]);
        const idx = nearestIndex(fromPalette, r, g, b);
        const matched = fromPalette[idx];
        const er = r - matched[0], eg = g - matched[1], eb = b - matched[2];
        writeMapped(o, idx);
        const distribute = (dx: number, dy: number, ff: number) => {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy >= h) return;
          const oo = (yy * w + xx) * 4;
          buf[oo] += er * ff; buf[oo + 1] += eg * ff; buf[oo + 2] += eb * ff;
        };
        distribute(1, 0, 7 / 16);
        distribute(-1, 1, 3 / 16);
        distribute(0, 1, 5 / 16);
        distribute(1, 1, 1 / 16);
      }
    }
  } else if (dither === 'ordered') {
    const m = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const t = (m[y & 3][x & 3] / 16 - 0.5) * 32;
        const r = clamp(d[o] + t), g = clamp(d[o + 1] + t), b = clamp(d[o + 2] + t);
        const idx = nearestIndex(fromPalette, r, g, b);
        writeMapped(o, idx);
      }
    }
  } else {
    for (let i = 0; i < d.length; i += 4) {
      const idx = nearestIndex(fromPalette, d[i], d[i + 1], d[i + 2]);
      writeMapped(i, idx);
    }
  }
}

export interface ApplyFiltersInput {
  filters?: AdvancedFilters;
  paletteOverrides?: PaletteOverride[];
}

/**
 * Apply the full filter pipeline to ImageData in place.
 * No-op when input is empty/undefined.
 *
 * Palette overrides + posterize are now a SINGLE coupled step:
 *   - When `posterize >= 2` AND `paletteOverrides` has entries, every pixel is
 *     quantized to its nearest `from` color in the override list and replaced
 *     with the matching `to` color. The override list IS the posterize palette.
 *   - When `posterize >= 2` but no overrides exist, the legacy behaviour
 *     applies: extract a palette of `posterize` colors and quantize to it
 *     (or uniform RGB bins if `posterizeFromImage` is false).
 */
export function applyFilters(img: ImageData, input: ApplyFiltersInput): void {
  const f = input.filters;
  const overrides = input.paletteOverrides ?? [];
  const d = img.data;

  if (f) {
    if (f.brightness !== 0 || f.contrast !== 0 || f.saturation !== 0) {
      applyBrightnessContrastSaturation(d, f.brightness, f.contrast, f.saturation);
    }
    if (f.grayscale) applyGrayscale(d);
    if (f.invert) applyInvert(d);
  }

  const posterizeOn = f != null && f.posterize >= 2;
  if (posterizeOn && overrides.length >= 2) {
    // Palette-mapped posterize: quantize to the `from` colors and write the
    // corresponding `to` colors. This is the one-pass version that subsumes
    // both "posterize" and "palette overwrite".
    quantizeToOverrides(img, overrides, f!.dither);
  } else if (overrides.length > 0) {
    // Posterize off — overrides are exact-match replacements only.
    applyPaletteOverrides(d, overrides);
  } else if (posterizeOn) {
    if (f!.posterizeFromImage) {
      const palette = extractPalette(img, Math.max(2, Math.min(256, f!.posterize)));
      if (palette.length >= 2) quantizePalette(img, palette, f!.dither);
    } else {
      quantizeUniform(d, Math.max(2, Math.min(256, f!.posterize)));
    }
  }
}
