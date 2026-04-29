/**
 * Robust image decoder that preserves alpha across animated webp/gif inputs.
 *
 * Why this exists:
 *   `createImageBitmap(file)` works for static images, but in some browsers
 *   the first frame of an animated webp comes back composited onto opaque
 *   black, destroying the source alpha. The user's original screenshot
 *   showed exactly this: a transparent animated webp converting to a single
 *   frame on a solid black background.
 *
 *   Workaround chain:
 *     1. createImageBitmap(file, { premultiplyAlpha: 'none' }) — preferred.
 *        Modern browsers honor the option and keep alpha intact for the
 *        first frame of animated WebP.
 *     2. ImageDecoder API (Chromium) — explicitly extracts frame 0 with alpha.
 *     3. <img src=ObjectURL> + createImageBitmap fallback — works for most
 *        formats; some browsers still composite on black, hence step 1 first.
 *
 * Returns a transparent OffscreenCanvas (or HTMLCanvas fallback) at the
 * decoded source dimensions, plus a flag indicating whether alpha was found.
 */

export interface DecodedSource {
  /** Detached canvas containing the first frame; transparent where source was. */
  canvas: OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
  hasAlpha: boolean;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function ctxOf(canvas: OffscreenCanvas | HTMLCanvasElement): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  // Force alpha:true so the backing store is RGBA, not RGB.
  // The getContext signature differs across the union; cast canvas to a
  // generic shape with the call we need.
  const get = (canvas as unknown as { getContext(type: '2d', opts?: { alpha?: boolean }): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null }).getContext;
  const ctx = get.call(canvas, '2d', { alpha: true });
  if (!ctx) throw new Error('Could not get 2d context');
  return ctx;
}

function detectAlphaFromCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  w: number,
  h: number
): boolean {
  const ctx = ctxOf(canvas);
  // Sample at most 64×64 grid points to keep this O(1) regardless of size.
  const stepX = Math.max(1, Math.floor(w / 64));
  const stepY = Math.max(1, Math.floor(h / 64));
  // Single getImageData is faster than per-pixel; shrink to a tiny strip.
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      if (d[(y * w + x) * 4 + 3] < 255) return true;
    }
  }
  return false;
}

async function decodeViaImageDecoder(file: File): Promise<DecodedSource | null> {
  // ImageDecoder API — Chromium-only at time of writing.
  const ID = (globalThis as unknown as { ImageDecoder?: { isTypeSupported: (t: string) => Promise<boolean> } & (new (init: { data: ReadableStream | BufferSource; type: string }) => unknown) }).ImageDecoder;
  if (!ID) return null;
  try {
    if (typeof ID.isTypeSupported === 'function') {
      const supported = await ID.isTypeSupported(file.type || 'image/webp');
      if (!supported) return null;
    }
    const decoder = new (ID as unknown as new (init: { data: BufferSource; type: string }) => {
      decode(opts?: { frameIndex?: number }): Promise<{ image: VideoFrame }>;
      tracks: { ready: Promise<void>; selectedTrack: { animated: boolean } | null };
    })({ data: await file.arrayBuffer(), type: file.type || 'image/webp' });
    const { image: frame } = await decoder.decode({ frameIndex: 0 });
    const w = (frame as unknown as VideoFrame).displayWidth;
    const h = (frame as unknown as VideoFrame).displayHeight;
    const canvas = makeCanvas(w, h);
    const ctx = ctxOf(canvas);
    ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0);
    (frame as unknown as VideoFrame).close?.();
    const alpha = detectAlphaFromCanvas(canvas, w, h);
    return { canvas, width: w, height: h, hasAlpha: alpha };
  } catch {
    return null;
  }
}

async function decodeViaCreateImageBitmap(file: File): Promise<DecodedSource | null> {
  try {
    const bitmap = await createImageBitmap(file, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const w = bitmap.width, h = bitmap.height;
    const canvas = makeCanvas(w, h);
    const ctx = ctxOf(canvas);
    // Clear transparent (default) then draw — explicit guard against any
    // implementation that initializes the backing store opaque.
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const alpha = detectAlphaFromCanvas(canvas, w, h);
    return { canvas, width: w, height: h, hasAlpha: alpha };
  } catch {
    return null;
  }
}

async function decodeViaImgTag(file: File): Promise<DecodedSource | null> {
  return new Promise<DecodedSource | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const canvas = makeCanvas(w, h);
        const ctx = ctxOf(canvas);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const alpha = detectAlphaFromCanvas(canvas, w, h);
        resolve({ canvas, width: w, height: h, hasAlpha: alpha });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/**
 * Decode the first frame of a file with alpha preserved when available.
 * Throws if all decode strategies fail.
 */
export async function decodeFirstFrame(file: File): Promise<DecodedSource> {
  // Order matters: createImageBitmap with explicit options is fastest and
  // keeps alpha for animated webp on Chromium. ImageDecoder is the safety net
  // for animated formats that the bitmap path mishandles. <img> is the last
  // resort for older browsers / unusual MIME types.
  const fromBitmap = await decodeViaCreateImageBitmap(file);
  if (fromBitmap) return fromBitmap;

  const fromDecoder = await decodeViaImageDecoder(file);
  if (fromDecoder) return fromDecoder;

  const fromImg = await decodeViaImgTag(file);
  if (fromImg) return fromImg;

  throw new Error(`Failed to decode image: ${file.name}`);
}

/**
 * Convenience: decode and return ImageData at a target size with the given
 * resampling preference. The output canvas is transparent when the source
 * had alpha.
 */
export async function decodeToImageData(
  file: File,
  outWidth: number,
  outHeight: number,
  resample: 'nearest' | 'bilinear' | 'high'
): Promise<{ imageData: ImageData; sourceHasAlpha: boolean }> {
  const src = await decodeFirstFrame(file);
  const out = makeCanvas(outWidth, outHeight);
  const ctx = ctxOf(out);
  ctx.clearRect(0, 0, outWidth, outHeight);
  if (resample === 'nearest') {
    ctx.imageSmoothingEnabled = false;
  } else if (resample === 'bilinear') {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  ctx.drawImage(src.canvas, 0, 0, outWidth, outHeight);
  const imageData = ctx.getImageData(0, 0, outWidth, outHeight);
  return { imageData, sourceHasAlpha: src.hasAlpha };
}
