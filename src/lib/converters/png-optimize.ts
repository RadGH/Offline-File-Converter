/**
 * PNG optimizer via UPNG.js.
 *
 * Strategy:
 *  1. Try lossless re-encode (cnum=0 — UPNG auto-selects color type based on content).
 *     This wins for screenshots and pixel art, and strips the alpha channel from
 *     canvas-produced PNGs that have no actual transparency.
 *  2. Also try palette quantization (cnum=64 — 64-color dithered palette).
 *     This wins for photos and complex images where lossless can't compress further.
 *  3. Return whichever of the three (original, lossless, quantized) is smallest.
 *
 * UPNG.encode(rgba[], w, h, cnum, dels):
 *   cnum=0  → UPNG auto-picks smallest color type (truecolor, palette, or greyscale).
 *              Lossless. Removes unnecessary alpha channel.
 *   cnum=64 → quantize to at most 64 colors (dithered palette). Lossy but small.
 *              On typical photos this produces roughly the same output as
 *              ImageCompressor.com at default settings.
 *
 * This module is lazy-loaded by the dispatcher — never import it at the top level.
 */

export interface PngOptimizeOptions {
  /** auto = pick smaller of lossless/quantized; on = always quantize; off = always lossless */
  paletteQuantize?: 'auto' | 'on' | 'off';
  /** 2..256 palette colors when paletteQuantize='on' or used in 'auto' candidate */
  paletteSize?: number;
}

/**
 * Optimize a PNG blob using UPNG.js.
 * The smallest result always wins for 'auto' mode — original is returned
 * if UPNG can't improve it.
 */
export async function optimizePng(
  pngBlob: Blob,
  onProgress?: (pct: number) => void,
  options?: PngOptimizeOptions
): Promise<Blob> {
  const mode = options?.paletteQuantize ?? 'auto';
  const paletteSize = Math.max(2, Math.min(256, options?.paletteSize ?? 64));

  onProgress?.(10);
  const UPNG = (await import('upng-js')).default;
  const arrayBuffer = await pngBlob.arrayBuffer();
  onProgress?.(30);

  const decoded = UPNG.decode(arrayBuffer);
  onProgress?.(50);
  const frames = UPNG.toRGBA8(decoded);

  if (mode === 'on') {
    const quantized = UPNG.encode(frames, decoded.width, decoded.height, paletteSize);
    onProgress?.(100);
    return new Blob([quantized], { type: 'image/png' });
  }

  if (mode === 'off') {
    const lossless = UPNG.encode(frames, decoded.width, decoded.height, 0);
    onProgress?.(100);
    if (lossless.byteLength < pngBlob.size) {
      return new Blob([lossless], { type: 'image/png' });
    }
    return pngBlob;
  }

  // auto: try both, return smallest that beats original
  const lossless = UPNG.encode(frames, decoded.width, decoded.height, 0);
  onProgress?.(70);
  const quantized = UPNG.encode(frames, decoded.width, decoded.height, paletteSize);
  onProgress?.(90);
  await new Promise<void>(resolve => setTimeout(resolve, 0));

  const original = pngBlob.size;
  let bestBuf: ArrayBuffer | null = null;
  for (const buf of [lossless, quantized]) {
    if (buf.byteLength < original) {
      if (bestBuf === null || buf.byteLength < bestBuf.byteLength) bestBuf = buf;
    }
  }
  onProgress?.(100);
  if (bestBuf === null) return pngBlob;
  return new Blob([bestBuf], { type: 'image/png' });
}
