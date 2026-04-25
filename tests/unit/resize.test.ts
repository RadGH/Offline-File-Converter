import { describe, it, expect } from 'vitest';
import { computePairedDimension, applyResize } from '@/lib/utils/resize';
import type { PerFileSettings } from '@/lib/queue/store';
import { settingsDiffer } from '@/lib/utils/settings-differ';

// ─── computePairedDimension ──────────────────────────────────────────────────

describe('computePairedDimension', () => {
  it('returns other dimension for width edit (1:1 aspect)', () => {
    expect(computePairedDimension({ edited: 'width', value: 200, originalWidth: 100, originalHeight: 100 })).toBe(200);
  });

  it('returns other dimension for height edit (1:1 aspect)', () => {
    expect(computePairedDimension({ edited: 'height', value: 200, originalWidth: 100, originalHeight: 100 })).toBe(200);
  });

  it('computes height from width for 2:1 image', () => {
    // 2:1 → editing width to 400, height should be 200
    expect(computePairedDimension({ edited: 'width', value: 400, originalWidth: 200, originalHeight: 100 })).toBe(200);
  });

  it('computes width from height for 2:1 image', () => {
    // 2:1 → editing height to 200, width should be 400
    expect(computePairedDimension({ edited: 'height', value: 200, originalWidth: 200, originalHeight: 100 })).toBe(400);
  });

  it('rounds to nearest integer', () => {
    // 3:2 image, width=100 → height = 100*2/3 = 66.666… → 67
    expect(computePairedDimension({ edited: 'width', value: 100, originalWidth: 3, originalHeight: 2 })).toBe(67);
  });

  it('returns 0 when originalWidth is 0', () => {
    expect(computePairedDimension({ edited: 'width', value: 100, originalWidth: 0, originalHeight: 100 })).toBe(0);
  });

  it('returns 0 when originalHeight is 0', () => {
    expect(computePairedDimension({ edited: 'height', value: 100, originalWidth: 100, originalHeight: 0 })).toBe(0);
  });

  it('returns 0 when value is 0', () => {
    expect(computePairedDimension({ edited: 'width', value: 0, originalWidth: 100, originalHeight: 100 })).toBe(0);
  });

  it('returns 0 when value is negative', () => {
    expect(computePairedDimension({ edited: 'width', value: -5, originalWidth: 100, originalHeight: 100 })).toBe(0);
  });

  it('handles non-square aspect ratios correctly for width→height', () => {
    // 1920x1080 → compute height for width=960
    expect(computePairedDimension({ edited: 'width', value: 960, originalWidth: 1920, originalHeight: 1080 })).toBe(540);
  });

  it('handles non-square aspect ratios correctly for height→width', () => {
    // 1920x1080 → compute width for height=540
    expect(computePairedDimension({ edited: 'height', value: 540, originalWidth: 1920, originalHeight: 1080 })).toBe(960);
  });
});

// ─── applyResize ─────────────────────────────────────────────────────────────

describe('applyResize', () => {
  const orig = { width: 1920, height: 1080 };

  // Both null
  it('returns original when both target dims are null', () => {
    expect(applyResize(orig, { width: null, height: null, maintainAspect: true })).toEqual(orig);
    expect(applyResize(orig, { width: null, height: null, maintainAspect: false })).toEqual(orig);
  });

  // maintainAspect = true, only width
  it('maintainAspect=true + only width → computes proportional height', () => {
    const result = applyResize(orig, { width: 960, height: null, maintainAspect: true });
    expect(result.width).toBe(960);
    expect(result.height).toBe(540);
  });

  // maintainAspect = true, only height
  it('maintainAspect=true + only height → computes proportional width', () => {
    const result = applyResize(orig, { width: null, height: 540, maintainAspect: true });
    expect(result.width).toBe(960);
    expect(result.height).toBe(540);
  });

  // maintainAspect = true, both set — fit inside box
  it('maintainAspect=true + both set → fits inside box (width limited)', () => {
    // Box 800x600, original 1920x1080 (16:9)
    // scaleW = 800/1920 = 0.4167, scaleH = 600/1080 = 0.5556 → min=0.4167
    // result = 800 × 450
    const result = applyResize(orig, { width: 800, height: 600, maintainAspect: true });
    expect(result.width).toBe(800);
    expect(result.height).toBe(450);
  });

  it('maintainAspect=true + both set → fits inside box (height limited)', () => {
    // Box 1920x540, original 1920x1080 (16:9)
    // scaleW = 1, scaleH = 0.5 → min=0.5
    // result = 960 × 540
    const result = applyResize(orig, { width: 1920, height: 540, maintainAspect: true });
    expect(result.width).toBe(960);
    expect(result.height).toBe(540);
  });

  it('maintainAspect=true + both set → exact box match', () => {
    // Box exactly matches aspect: 3840x2160
    const result = applyResize(orig, { width: 3840, height: 2160, maintainAspect: true });
    expect(result.width).toBe(3840);
    expect(result.height).toBe(2160);
  });

  // maintainAspect = false
  it('maintainAspect=false + both set → use as-is', () => {
    const result = applyResize(orig, { width: 500, height: 300, maintainAspect: false });
    expect(result).toEqual({ width: 500, height: 300 });
  });

  it('maintainAspect=false + only width → height stays original', () => {
    const result = applyResize(orig, { width: 500, height: null, maintainAspect: false });
    expect(result).toEqual({ width: 500, height: 1080 });
  });

  it('maintainAspect=false + only height → width stays original', () => {
    const result = applyResize(orig, { width: null, height: 300, maintainAspect: false });
    expect(result).toEqual({ width: 1920, height: 300 });
  });

  // Integer rounding
  it('rounds to integers', () => {
    // 1000x333 (non-round aspect), target width=100 with aspect lock
    const result = applyResize({ width: 1000, height: 333 }, { width: 100, height: null, maintainAspect: true });
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.width).toBe(100);
    expect(result.height).toBe(33); // 100*333/1000 = 33.3 → 33
  });

  // Zero/edge cases
  it('handles originalWidth=0 gracefully', () => {
    const result = applyResize({ width: 0, height: 100 }, { width: 50, height: null, maintainAspect: true });
    expect(result.width).toBe(50);
    expect(result.height).toBe(0);
  });

  it('handles originalHeight=0 gracefully', () => {
    const result = applyResize({ width: 100, height: 0 }, { width: null, height: 50, maintainAspect: true });
    expect(result.width).toBe(0);
    expect(result.height).toBe(50);
  });

  it('fit-inside-box with zero original dims falls back', () => {
    const result = applyResize({ width: 0, height: 0 }, { width: 100, height: 100, maintainAspect: true });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  // 2:1 aspect for deterministic math
  it('2:1 image — width 200 → height 100', () => {
    const result = applyResize({ width: 400, height: 200 }, { width: 200, height: null, maintainAspect: true });
    expect(result).toEqual({ width: 200, height: 100 });
  });
});

// ─── preserveOrientation ─────────────────────────────────────────────────────

describe('applyResize — preserveOrientation', () => {
  // Portrait source: 800×1200 (h > w)
  const portrait = { width: 800, height: 1200 };
  // Landscape source: 1920×1080 (w > h)
  const landscape = { width: 1920, height: 1080 };

  it('portrait + width-only typed → treats typed value as height (longer side)', () => {
    // User typed W=500, source is portrait → apply 500 to height
    const result = applyResize(portrait, { width: 500, height: null, maintainAspect: true, preserveOrientation: true });
    // 500 is applied to height (longer side), width = 500 * 800/1200 = 333
    expect(result.height).toBe(500);
    expect(result.width).toBe(Math.round(500 * 800 / 1200)); // 333
  });

  it('landscape + height-only typed → treats typed value as width (longer side)', () => {
    // User typed H=500, source is landscape → apply 500 to width
    const result = applyResize(landscape, { width: null, height: 500, maintainAspect: true, preserveOrientation: true });
    // 500 applied to width (longer side), height = 500 * 1080/1920 = 281
    expect(result.width).toBe(500);
    expect(result.height).toBe(Math.round(500 * 1080 / 1920));
  });

  it('landscape + width-only typed → no swap (typed W goes to width already longer)', () => {
    const result = applyResize(landscape, { width: 960, height: null, maintainAspect: true, preserveOrientation: true });
    expect(result.width).toBe(960);
    expect(result.height).toBe(540);
  });

  it('portrait + portrait-typed both → no swap needed', () => {
    // Typed W=400, H=600 which is portrait matching source portrait
    const result = applyResize(portrait, { width: 400, height: 600, maintainAspect: true, preserveOrientation: true });
    // Fit inside 400×600 with aspect 800:1200 = 2:3, scale = min(400/800, 600/1200) = 0.5
    expect(result.width).toBe(400);
    expect(result.height).toBe(600);
  });

  it('portrait + landscape-typed both → swaps to portrait', () => {
    // Typed W=2000, H=1000 (landscape) but source is portrait → swap to W=1000 H=2000
    const result = applyResize(portrait, { width: 2000, height: 1000, maintainAspect: true, preserveOrientation: true });
    // After swap: target is 1000×2000, fit inside: scale = min(1000/800, 2000/1200) = min(1.25, 1.667) = 1.25
    expect(result.width).toBe(Math.round(800 * 1.25)); // 1000
    expect(result.height).toBe(Math.round(1200 * 1.25)); // 1500
  });

  it('disabled when dimensionUnit=percent (no swap)', () => {
    // percent mode should ignore preserveOrientation
    const result = applyResize(portrait, { width: 50, height: null, maintainAspect: true, preserveOrientation: true, dimensionUnit: 'percent' });
    // 50% of both sides
    expect(result.width).toBe(400);
    expect(result.height).toBe(600);
  });
});

// ─── percent mode ─────────────────────────────────────────────────────────────

describe('applyResize — percent mode', () => {
  const orig = { width: 1000, height: 500 };

  it('50% with maintainAspect scales both axes', () => {
    const result = applyResize(orig, { width: 50, height: null, maintainAspect: true, dimensionUnit: 'percent' });
    expect(result).toEqual({ width: 500, height: 250 });
  });

  it('null width treated as 100% in percent mode', () => {
    const result = applyResize(orig, { width: null, height: null, maintainAspect: false, dimensionUnit: 'percent' });
    expect(result).toEqual({ width: 1000, height: 500 });
  });

  it('200% doubles both axes independently when maintainAspect=false', () => {
    const result = applyResize(orig, { width: 200, height: 50, maintainAspect: false, dimensionUnit: 'percent' });
    expect(result).toEqual({ width: 2000, height: 250 });
  });

  it('100% returns original size', () => {
    const result = applyResize(orig, { width: 100, height: 100, maintainAspect: true, dimensionUnit: 'percent' });
    expect(result).toEqual({ width: 1000, height: 500 });
  });
});

// ─── settingsDiffer ───────────────────────────────────────────────────────────

const baseSettings: PerFileSettings = {
  format: 'jpeg',
  quality: 85,
  width: null,
  height: null,
  maintainAspect: true,
  stripMetadata: true,
  upscale: false,
  preserveOrientation: false,
  resample: 'high',
  dimensionUnit: 'px',
};

describe('settingsDiffer', () => {
  it('returns false for identical settings', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings })).toBe(false);
  });

  it('returns true when format differs', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings, format: 'webp' })).toBe(true);
  });

  it('returns true when quality differs', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings, quality: 70 })).toBe(true);
  });

  it('returns true when dimensionUnit differs', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings, dimensionUnit: 'percent' })).toBe(true);
  });

  it('returns true when resample differs', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings, resample: 'nearest' })).toBe(true);
  });

  it('returns true when preserveOrientation differs', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings, preserveOrientation: true })).toBe(true);
  });

  it('returns true when width differs (null vs number)', () => {
    expect(settingsDiffer(baseSettings, { ...baseSettings, width: 800 })).toBe(true);
  });
});
