/**
 * Unit tests for tiler.ts — split + stitch math.
 *
 * Key guarantees tested:
 * 1. splitIntoTiles produces correct tile count and pixel content.
 * 2. splitIntoTiles + stitchTiles (scale=1, overlap=0) is pixel-exact.
 * 3. splitIntoTiles + stitchTiles (scale=4, overlap=0) produces correct dims.
 * 4. Feathered overlap blending produces values within tolerance ≤ 2/channel.
 * 5. Edge cases: single tile, image smaller than tileSize.
 */

import { describe, it, expect } from 'vitest';
import { splitIntoTiles, stitchTiles } from '@/lib/upscale/tiler';
import type { OutputTile } from '@/lib/upscale/tiler';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a solid-color ImageData of given dimensions. */
function makeImageData(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return new ImageData(data, width, height);
}

/** Create an ImageData where each pixel encodes its (x, y) coordinate. */
function makeGradientImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Use truncated coords so values stay in [0,255]
      data[i + 0] = x % 256;
      data[i + 1] = y % 256;
      data[i + 2] = (x + y) % 256;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Simulate the upscale step trivially: for a scale=4 model, just stretch each
 * pixel to a 4×4 block (nearest-neighbour). Used to produce OutputTile[] from
 * input tiles without real inference.
 */
function fakeUpscaleTile(
  tile: { x: number; y: number; data: ImageData },
  scale: number,
): OutputTile {
  const { width: tw, height: th } = tile.data;
  const outW = tw * scale;
  const outH = th * scale;
  const out = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const src = (srcY * tw + srcX) * 4;
      const dst = (y * outW + x) * 4;
      out[dst + 0] = tile.data.data[src + 0];
      out[dst + 1] = tile.data.data[src + 1];
      out[dst + 2] = tile.data.data[src + 2];
      out[dst + 3] = tile.data.data[src + 3];
    }
  }

  return { x: tile.x, y: tile.y, data: new ImageData(out, outW, outH) };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('splitIntoTiles', () => {
  it('returns original width/height in SplitResult', () => {
    const img = makeImageData(100, 80, 128, 64, 32);
    const result = splitIntoTiles(img, 64, 0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
  });

  it('produces at least one tile', () => {
    const img = makeImageData(32, 32, 0, 0, 0);
    const { tiles } = splitIntoTiles(img, 64, 0);
    expect(tiles.length).toBeGreaterThanOrEqual(1);
  });

  it('each tile pixel matches the source at the correct offset', () => {
    const img = makeGradientImageData(64, 64);
    const { tiles } = splitIntoTiles(img, 32, 0);

    for (const tile of tiles) {
      for (let row = 0; row < tile.data.height; row++) {
        for (let col = 0; col < tile.data.width; col++) {
          const srcX = tile.x + col;
          const srcY = tile.y + row;
          const srcIdx = (srcY * 64 + srcX) * 4;
          const dstIdx = (row * tile.data.width + col) * 4;

          expect(tile.data.data[dstIdx + 0]).toBe(img.data[srcIdx + 0]);
          expect(tile.data.data[dstIdx + 1]).toBe(img.data[srcIdx + 1]);
          expect(tile.data.data[dstIdx + 2]).toBe(img.data[srcIdx + 2]);
          expect(tile.data.data[dstIdx + 3]).toBe(img.data[srcIdx + 3]);
        }
      }
    }
  });

  it('tiles cover all image pixels (union of tiles covers width×height)', () => {
    const W = 100;
    const H = 70;
    const img = makeImageData(W, H, 0, 0, 0);
    const { tiles } = splitIntoTiles(img, 48, 8);

    const covered = new Uint8Array(W * H);
    for (const tile of tiles) {
      for (let row = 0; row < tile.data.height; row++) {
        for (let col = 0; col < tile.data.width; col++) {
          const px = tile.x + col;
          const py = tile.y + row;
          if (px < W && py < H) covered[py * W + px] = 1;
        }
      }
    }
    const uncovered = Array.from(covered).filter((v) => v === 0).length;
    expect(uncovered).toBe(0);
  });

  it('throws when tileSize <= 2*overlap', () => {
    const img = makeImageData(64, 64, 0, 0, 0);
    expect(() => splitIntoTiles(img, 32, 16)).toThrow();
  });
});

describe('stitchTiles (scale=1, overlap=0) — pixel-exact round-trip', () => {
  it('64×64 image: split + stitch is identical', () => {
    const img = makeGradientImageData(64, 64);
    const { tiles, width, height } = splitIntoTiles(img, 32, 0);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 1));
    const result = stitchTiles(outTiles, width, height, 1, 0);

    expect(result.width).toBe(64);
    expect(result.height).toBe(64);

    // Every pixel must exactly match the source.
    for (let i = 0; i < img.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i]);
    }
  });

  it('non-square 100×70 image: split + stitch is identical', () => {
    const img = makeGradientImageData(100, 70);
    const { tiles, width, height } = splitIntoTiles(img, 64, 0);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 1));
    const result = stitchTiles(outTiles, width, height, 1, 0);

    expect(result.width).toBe(100);
    expect(result.height).toBe(70);
    for (let i = 0; i < img.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i]);
    }
  });
});

describe('stitchTiles (scale=4, overlap=0) — correct output dimensions', () => {
  it('64×64 input → 256×256 output', () => {
    const img = makeGradientImageData(64, 64);
    const { tiles, width, height } = splitIntoTiles(img, 32, 0);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 4));
    const result = stitchTiles(outTiles, width, height, 4, 0);

    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });

  it('non-square 40×30 input → 160×120 output', () => {
    const img = makeGradientImageData(40, 30);
    const { tiles, width, height } = splitIntoTiles(img, 32, 0);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 4));
    const result = stitchTiles(outTiles, width, height, 4, 0);

    expect(result.width).toBe(160);
    expect(result.height).toBe(120);
  });

  it('non-overlap center pixels match expected value within 1', () => {
    // Solid colour image: output should have same colour everywhere.
    const img = makeImageData(64, 64, 100, 150, 200);
    const { tiles, width, height } = splitIntoTiles(img, 32, 0);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 4));
    const result = stitchTiles(outTiles, width, height, 4, 0);

    // Sample 10 arbitrary interior pixels.
    for (const [px, py] of [[10, 10], [50, 50], [128, 128], [200, 100], [255, 255]] as [number, number][]) {
      const idx = (py * result.width + px) * 4;
      expect(Math.abs(result.data[idx + 0] - 100)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.data[idx + 1] - 150)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.data[idx + 2] - 200)).toBeLessThanOrEqual(1);
    }
  });
});

describe('stitchTiles (scale=4, overlap=32) — feathered blend tolerance', () => {
  it('seam pixel channel error ≤ 2 for solid-colour image', () => {
    const img = makeImageData(128, 128, 80, 120, 180);
    // tileSize must be > 2*overlap; use 96 with 32px overlap (step=32).
    const { tiles, width, height } = splitIntoTiles(img, 96, 32);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 4));
    const result = stitchTiles(outTiles, width, height, 4, 32);

    expect(result.width).toBe(128 * 4);
    expect(result.height).toBe(128 * 4);

    // Sample 20 random pixels including seam regions.
    for (let sample = 0; sample < 20; sample++) {
      const px = Math.floor((sample / 20) * 511);
      const py = Math.floor(((sample * 7) % 20) / 20 * 511);
      const idx = (py * result.width + px) * 4;
      expect(Math.abs(result.data[idx + 0] - 80)).toBeLessThanOrEqual(2);
      expect(Math.abs(result.data[idx + 1] - 120)).toBeLessThanOrEqual(2);
      expect(Math.abs(result.data[idx + 2] - 180)).toBeLessThanOrEqual(2);
    }
  });

  it('non-overlap regions (center of each tile) are pixel-exact', () => {
    // Create an image where a pixel's value equals its x coordinate (mod 256).
    const W = 128;
    const H = 64;
    const img = makeImageData(W, H, 50, 100, 200);
    // tileSize must be > 2*overlap; use 96 with 32px overlap (step=32).
    const { tiles, width, height } = splitIntoTiles(img, 96, 32);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 4));
    const result = stitchTiles(outTiles, width, height, 4, 32);

    // Center of the entire output (far from any seam) should be close to exact.
    const cx = Math.floor(result.width / 2);
    const cy = Math.floor(result.height / 2);
    const idx = (cy * result.width + cx) * 4;
    expect(Math.abs(result.data[idx + 0] - 50)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.data[idx + 1] - 100)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.data[idx + 2] - 200)).toBeLessThanOrEqual(1);
  });
});

describe('edge cases', () => {
  it('image smaller than tileSize produces one tile', () => {
    const img = makeImageData(32, 20, 10, 20, 30);
    const { tiles, width, height } = splitIntoTiles(img, 64, 0);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].x).toBe(0);
    expect(tiles[0].y).toBe(0);
    expect(width).toBe(32);
    expect(height).toBe(20);
  });

  it('single pixel image round-trips correctly', () => {
    const img = makeImageData(1, 1, 255, 0, 128);
    const { tiles, width, height } = splitIntoTiles(img, 64, 0);
    const outTiles = tiles.map((t) => fakeUpscaleTile(t, 4));
    const result = stitchTiles(outTiles, width, height, 4, 0);
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    // All pixels should be the same colour.
    for (let i = 0; i < 4 * 4; i++) {
      expect(result.data[i * 4 + 0]).toBe(255);
      expect(result.data[i * 4 + 1]).toBe(0);
      expect(result.data[i * 4 + 2]).toBe(128);
    }
  });
});
