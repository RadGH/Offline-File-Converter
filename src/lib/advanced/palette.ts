/**
 * Median-cut color quantizer.
 *
 * Extracts up to N representative colors from an ImageData.
 * Pure TS, no deps. Works on a sub-sampled subset of pixels for speed
 * (caps at ~16k samples regardless of source size).
 *
 * Returns colors as [r,g,b] tuples sorted by frequency (most common first).
 */

export type RGB = [number, number, number];

interface Box {
  pixels: number[]; // packed RGB (r<<16|g<<8|b)
  rmin: number; rmax: number;
  gmin: number; gmax: number;
  bmin: number; bmax: number;
}

function makeBox(pixels: number[]): Box {
  let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
  for (const p of pixels) {
    const r = (p >> 16) & 0xff;
    const g = (p >> 8) & 0xff;
    const b = p & 0xff;
    if (r < rmin) rmin = r; if (r > rmax) rmax = r;
    if (g < gmin) gmin = g; if (g > gmax) gmax = g;
    if (b < bmin) bmin = b; if (b > bmax) bmax = b;
  }
  return { pixels, rmin, rmax, gmin, gmax, bmin, bmax };
}

function longestAxis(b: Box): 'r' | 'g' | 'b' {
  const dr = b.rmax - b.rmin;
  const dg = b.gmax - b.gmin;
  const db = b.bmax - b.bmin;
  if (dr >= dg && dr >= db) return 'r';
  if (dg >= db) return 'g';
  return 'b';
}

function splitBox(box: Box): [Box, Box] | null {
  const axis = longestAxis(box);
  const sorted = box.pixels.slice().sort((a, b) => {
    if (axis === 'r') return ((a >> 16) & 0xff) - ((b >> 16) & 0xff);
    if (axis === 'g') return ((a >> 8) & 0xff) - ((b >> 8) & 0xff);
    return (a & 0xff) - (b & 0xff);
  });
  if (sorted.length < 2) return null;
  const mid = sorted.length >> 1;
  return [makeBox(sorted.slice(0, mid)), makeBox(sorted.slice(mid))];
}

function avgColor(b: Box): RGB {
  let r = 0, g = 0, bl = 0;
  for (const p of b.pixels) {
    r += (p >> 16) & 0xff;
    g += (p >> 8) & 0xff;
    bl += p & 0xff;
  }
  const n = b.pixels.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
}

/**
 * Extract up to `count` representative colors from an ImageData.
 * Skips fully transparent pixels.
 */
export function extractPalette(img: ImageData, count: number): RGB[] {
  const data = img.data;
  const totalPx = data.length / 4;
  const stride = Math.max(1, Math.floor(totalPx / 16384));
  const samples: number[] = [];
  for (let i = 0; i < totalPx; i += stride) {
    const o = i * 4;
    const a = data[o + 3];
    if (a < 8) continue;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    samples.push((r << 16) | (g << 8) | b);
  }
  if (samples.length === 0) return [];

  let boxes: Box[] = [makeBox(samples)];
  while (boxes.length < count) {
    boxes.sort((a, b) => b.pixels.length - a.pixels.length);
    const target = boxes.shift();
    if (!target) break;
    const split = splitBox(target);
    if (!split) { boxes.push(target); break; }
    boxes.push(split[0], split[1]);
    if (boxes.every(b => b.pixels.length < 2)) break;
  }

  return boxes
    .map(b => ({ color: avgColor(b), n: b.pixels.length }))
    .sort((a, b) => b.n - a.n)
    .map(x => x.color);
}

/** Find the nearest palette index for a given RGB triple (squared distance). */
export function nearestIndex(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = palette[i][0] - r;
    const dg = palette[i][1] - g;
    const db = palette[i][2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Detect whether an ImageData has any pixel with alpha < 255. */
export function hasAlpha(img: ImageData): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 255) return true;
  }
  return false;
}
