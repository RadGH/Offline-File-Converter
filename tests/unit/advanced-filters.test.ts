/**
 * Verifies that each AdvancedFilters toggle actually changes pixel output.
 * No mocks needed — these are pure-TS pixel transforms.
 */

import { describe, it, expect } from 'vitest';
import { applyFilters } from '@/lib/advanced/filters';
import { extractPalette, hasAlpha } from '@/lib/advanced/palette';
import type { AdvancedFilters } from '@/lib/queue/store';
import { DEFAULT_FILTERS } from '@/lib/queue/store';

// Minimal ImageData for jsdom is provided by setup.ts.

function makeGradient(w = 16, h = 16): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      data[o] = (x * 16) & 255;          // R
      data[o + 1] = (y * 16) & 255;      // G
      data[o + 2] = ((x + y) * 8) & 255; // B
      data[o + 3] = 255;
    }
  }
  return new ImageData(data, w, h);
}

function copy(img: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

function differs(a: ImageData, b: ImageData): boolean {
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return true;
  return false;
}

function withFilter(over: Partial<AdvancedFilters>): AdvancedFilters {
  return { ...DEFAULT_FILTERS, ...over };
}

describe('applyFilters — each toggle changes output', () => {
  it('brightness +50 brightens', () => {
    const a = makeGradient(); const b = copy(a);
    applyFilters(b, { filters: withFilter({ brightness: 50 }) });
    expect(differs(a, b)).toBe(true);
  });

  it('contrast +50 changes pixels', () => {
    const a = makeGradient(); const b = copy(a);
    applyFilters(b, { filters: withFilter({ contrast: 50 }) });
    expect(differs(a, b)).toBe(true);
  });

  it('saturation -50 desaturates', () => {
    const a = makeGradient(); const b = copy(a);
    applyFilters(b, { filters: withFilter({ saturation: -50 }) });
    expect(differs(a, b)).toBe(true);
  });

  it('grayscale collapses RGB to luma', () => {
    const a = makeGradient(); const b = copy(a);
    applyFilters(b, { filters: withFilter({ grayscale: true }) });
    // every pixel should now have R==G==B
    for (let i = 0; i < b.data.length; i += 4) {
      expect(b.data[i]).toBe(b.data[i + 1]);
      expect(b.data[i + 1]).toBe(b.data[i + 2]);
    }
    expect(differs(a, b)).toBe(true);
  });

  it('invert flips RGB channels', () => {
    const a = makeGradient(); const b = copy(a);
    applyFilters(b, { filters: withFilter({ invert: true }) });
    for (let i = 0; i < b.data.length; i += 4) {
      expect(b.data[i]).toBe(255 - a.data[i]);
    }
  });

  it('posterize reduces unique colors', () => {
    const a = makeGradient(32, 32); const b = copy(a);
    applyFilters(b, { filters: withFilter({ posterize: 4, posterizeFromImage: false }) });
    const unique = new Set<number>();
    for (let i = 0; i < b.data.length; i += 4) {
      unique.add((b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2]);
    }
    // Uniform 4-level posterize → at most 4^3 = 64 unique colors
    expect(unique.size).toBeLessThanOrEqual(64);
  });

  it('palette overrides remap matching pixels', () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    }
    const img = new ImageData(data, w, h);
    applyFilters(img, {
      paletteOverrides: [{ from: [255, 0, 0], to: [0, 255, 0] }],
    });
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(0);
      expect(img.data[i + 1]).toBe(255);
      expect(img.data[i + 2]).toBe(0);
    }
  });

  it('extractPalette returns at least 2 colors for a varied image', () => {
    const img = makeGradient(64, 64);
    const palette = extractPalette(img, 8);
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(palette.length).toBeLessThanOrEqual(8);
  });

  it('hasAlpha detects fully-opaque vs partial-alpha images', () => {
    const opaque = makeGradient(4, 4);
    expect(hasAlpha(opaque)).toBe(false);
    const trans = makeGradient(4, 4);
    trans.data[3] = 0;
    expect(hasAlpha(trans)).toBe(true);
  });

  it('default filters with no toggles is a no-op', () => {
    const a = makeGradient(); const b = copy(a);
    applyFilters(b, { filters: DEFAULT_FILTERS });
    expect(differs(a, b)).toBe(false);
  });
});
