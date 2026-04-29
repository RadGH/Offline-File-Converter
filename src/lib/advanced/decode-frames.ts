/**
 * Multi-frame decoder for animated WebP / GIF inputs.
 *
 * Uses the WebCodecs `ImageDecoder` API (Chromium/Edge). Falls back to
 * single-frame decode on browsers without ImageDecoder. Caller can detect
 * fallback via the returned `frameCount` (will be 1).
 *
 * Returns each frame as an ImageBitmap or as raw ImageData when needed.
 */

export interface DecodedFrame {
  bitmap: ImageBitmap;
  /** Frame display duration in milliseconds. 0 if unknown. */
  durationMs: number;
}

export interface MultiFrameResult {
  frames: DecodedFrame[];
  width: number;
  height: number;
  /** Loop count from source (0 = infinite). */
  loop: number;
  /** True when decode used the multi-frame path (ImageDecoder); false on fallback. */
  multiFrame: boolean;
}

interface ImageDecoderCtor {
  isTypeSupported(type: string): Promise<boolean>;
  new (init: { data: BufferSource; type: string }): ImageDecoderInstance;
}

interface ImageDecoderInstance {
  decode(opts?: { frameIndex?: number }): Promise<{ image: VideoFrame; complete: boolean }>;
  tracks: {
    ready: Promise<void>;
    selectedTrack: { animated: boolean; frameCount: number; repetitionCount: number } | null;
  };
  close(): void;
}

function getImageDecoder(): ImageDecoderCtor | null {
  return (globalThis as unknown as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder ?? null;
}

async function decodeViaImageDecoder(file: File): Promise<MultiFrameResult | null> {
  const ID = getImageDecoder();
  if (!ID) return null;
  try {
    const type = file.type || 'image/webp';
    if (typeof ID.isTypeSupported === 'function') {
      const supported = await ID.isTypeSupported(type);
      if (!supported) return null;
    }
    const decoder = new ID({ data: await file.arrayBuffer(), type });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const count = track?.frameCount ?? 1;
    const loop = track?.repetitionCount ?? 0;
    const frames: DecodedFrame[] = [];
    let width = 0, height = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const vf = image as unknown as VideoFrame;
      width = vf.displayWidth;
      height = vf.displayHeight;
      const dur = (vf.duration ?? 0) / 1000; // microseconds → ms
      // Convert VideoFrame → ImageBitmap
      const bitmap = await createImageBitmap(vf as unknown as CanvasImageSource);
      vf.close?.();
      frames.push({ bitmap, durationMs: Math.max(20, Math.round(dur)) });
    }
    decoder.close();
    return { frames, width, height, loop, multiFrame: count > 1 };
  } catch {
    return null;
  }
}

async function decodeFallbackSingleFrame(file: File): Promise<MultiFrameResult> {
  // Fallback: createImageBitmap returns the first composited frame; we lose
  // animation but at least produce a valid output.
  const bitmap = await createImageBitmap(file);
  return {
    frames: [{ bitmap, durationMs: 100 }],
    width: bitmap.width,
    height: bitmap.height,
    loop: 0,
    multiFrame: false,
  };
}

/**
 * Decode all frames of an animated source. Falls back gracefully to a
 * single-frame decode on browsers without WebCodecs ImageDecoder support.
 */
export async function decodeAllFrames(file: File): Promise<MultiFrameResult> {
  const multi = await decodeViaImageDecoder(file);
  if (multi) return multi;
  return decodeFallbackSingleFrame(file);
}
