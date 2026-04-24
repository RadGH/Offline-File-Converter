/**
 * PNG optimizer via UPNG.js.
 * Decodes and re-encodes the PNG with palette quantization + aggressive deflate.
 * Returns the smaller of the two blobs — if the optimizer produces a larger
 * file (already-optimized input), the original blob is returned unchanged.
 *
 * This module is lazy-loaded by the dispatcher — never import it at the top level.
 */

/**
 * Optimize a PNG blob using UPNG.js.
 * Smaller result always wins; the original is returned if UPNG inflates the file.
 */
export async function optimizePng(
  pngBlob: Blob,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  onProgress?.(10);

  // Dynamic import — never pulled into the main bundle
  const UPNG = (await import('upng-js')).default;

  const arrayBuffer = await pngBlob.arrayBuffer();
  onProgress?.(40);

  const decoded = UPNG.decode(arrayBuffer);
  onProgress?.(70);

  // RGBA8 frames (UPNG.toRGBA8 returns one ArrayBuffer per frame)
  const frames = UPNG.toRGBA8(decoded);

  // Re-encode; cnum=0 → auto palette (up to 256 colours); 0 = lossless zlib
  const reencoded = UPNG.encode(frames, decoded.width, decoded.height, 0);
  onProgress?.(95);

  // Microtask yield so the main thread can breathe
  await new Promise<void>(resolve => setTimeout(resolve, 0));

  const optimizedBlob = new Blob([reencoded], { type: 'image/png' });

  if (optimizedBlob.size >= pngBlob.size) {
    console.debug(
      '[png-optimize] Optimizer produced a larger or equal file; returning original.',
      { original: pngBlob.size, optimized: optimizedBlob.size }
    );
    onProgress?.(100);
    return pngBlob;
  }

  onProgress?.(100);
  return optimizedBlob;
}
