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

/**
 * Optimize a PNG blob using UPNG.js.
 * The smallest result always wins — original is returned if UPNG can't improve it.
 */
export async function optimizePng(
  pngBlob: Blob,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  onProgress?.(10);

  // Dynamic import — never pulled into the main bundle
  const UPNG = (await import('upng-js')).default;

  const arrayBuffer = await pngBlob.arrayBuffer();
  onProgress?.(30);

  const decoded = UPNG.decode(arrayBuffer);
  onProgress?.(50);

  // RGBA8 frames (UPNG.toRGBA8 returns one ArrayBuffer per frame)
  const frames = UPNG.toRGBA8(decoded);

  // Candidate 1: lossless auto (cnum=0).
  // UPNG picks truecolor, greyscale, or palette as appropriate.
  // Strips the alpha channel when all pixels are fully opaque.
  const lossless = UPNG.encode(frames, decoded.width, decoded.height, 0);
  onProgress?.(70);

  // Candidate 2: 64-color palette quantization.
  // Lossy — wins for photos where lossless truecolor can't compress.
  const quantized = UPNG.encode(frames, decoded.width, decoded.height, 64);
  onProgress?.(90);

  // Microtask yield so the main thread can breathe
  await new Promise<void>(resolve => setTimeout(resolve, 0));

  // Pick the smallest result that beats the original
  const original = pngBlob.size;
  let bestBuf: ArrayBuffer | null = null;

  for (const buf of [lossless, quantized]) {
    if (buf.byteLength < original) {
      if (bestBuf === null || buf.byteLength < bestBuf.byteLength) {
        bestBuf = buf;
      }
    }
  }

  onProgress?.(100);

  if (bestBuf === null) {
    console.debug(
      '[png-optimize] Neither candidate beat the original; returning original.',
      { original, lossless: lossless.byteLength, quantized: quantized.byteLength }
    );
    return pngBlob;
  }

  return new Blob([bestBuf], { type: 'image/png' });
}
