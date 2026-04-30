/**
 * MP4 (H.264) encoder via WebCodecs `VideoEncoder` + mp4-muxer.
 *
 * Why this exists:
 *   Animated GIF and animated WebP have no inter-frame compression — every
 *   frame ships its full pixel data. Real video codecs use motion estimation
 *   plus residual encoding, so they typically produce 5–20× smaller files
 *   for the same animated content. An 8 MB GIF that is BIGGER as animated
 *   WebP often lands in the few-hundred-KB range as H.264 MP4.
 *
 * Limitations / contracts:
 *   - H.264 has no alpha. Transparent source pixels are flattened onto
 *     `settings.mp4.backgroundColor` (default white).
 *   - Requires browser `VideoEncoder` support (Chromium 94+, Safari 17+,
 *     Firefox 130+). Earlier browsers throw a clear error.
 *   - Frame rate is constant. Source per-frame delays are quantized to a
 *     single fps (median of source delays, or settings.mp4.fpsOverride).
 *   - Uses mp4-muxer's `fastStart: 'in-memory'` so the moov atom sits at
 *     the front of the file — the result is streamable.
 *
 * Lazy-loaded by the dispatcher.
 */

import type { ConversionInput, ConversionResult } from './types';
import { extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';
import { decodeAllFrames } from '@/lib/advanced/decode-frames';
import { applyFilters } from '@/lib/advanced/filters';
import { DEFAULT_MP4_ADVANCED } from '@/lib/queue/store';

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Pick a single frame rate to use for the entire video.
 *  Default heuristic: median of per-frame source delays, clamped to 1..60 fps.
 *  Override via settings.mp4.fpsOverride when nonzero. */
function pickFps(durations: number[], override: number): number {
  if (override > 0) return Math.max(1, Math.min(60, Math.round(override)));
  const valid = durations.filter(d => d > 0).sort((a, b) => a - b);
  if (valid.length === 0) return 30;
  const median = valid[Math.floor(valid.length / 2)];
  const fps = Math.round(1000 / median);
  return Math.max(1, Math.min(60, fps));
}

/** Map quality slider 1..100 to bits-per-pixel-per-second.
 *  Curve picked to roughly match these targets:
 *    1   → 0.02 bpp·s  (heavily compressed, visible artefacts)
 *    50  → 0.10 bpp·s  (good)
 *    100 → 0.20 bpp·s  (visually lossless on typical content) */
function bitrateFor(quality: number, w: number, h: number, fps: number): number {
  const q = Math.max(1, Math.min(100, quality));
  const bpp = 0.02 + (0.18 * ((q - 1) / 99));
  // bits per second = pixels × bits/pixel/frame × frames/second
  return Math.round(w * h * fps * bpp);
}

/** True when the runtime supports VideoEncoder + the H.264 codec. */
async function isVideoEncoderSupported(): Promise<boolean> {
  const VE = (globalThis as unknown as {
    VideoEncoder?: { isConfigSupported?: (cfg: unknown) => Promise<{ supported?: boolean }> };
  }).VideoEncoder;
  if (!VE) return false;
  try {
    if (typeof VE.isConfigSupported === 'function') {
      const r = await VE.isConfigSupported({
        codec: 'avc1.42E01F',
        width: 320, height: 240,
        bitrate: 500_000,
      });
      return r.supported === true;
    }
    return true;
  } catch {
    return false;
  }
}

export async function convertToMp4(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;

  if (!(await isVideoEncoderSupported())) {
    throw new Error(
      'MP4 export requires WebCodecs VideoEncoder. ' +
      'Use a recent Chromium-based browser, Safari 17+, or Firefox 130+.'
    );
  }

  const adv = settings.mp4 ?? DEFAULT_MP4_ADVANCED;

  onProgress?.(5);
  const decoded = await decodeAllFrames(file);
  onProgress?.(20);

  const baseDims = originalDimensions ?? { width: decoded.width, height: decoded.height };
  let { width: outW, height: outH } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
    preserveOrientation: settings.preserveOrientation,
    dimensionUnit: settings.dimensionUnit,
  });
  // H.264 requires even dimensions for chroma subsampling.
  if (outW % 2 === 1) outW -= 1;
  if (outH % 2 === 1) outH -= 1;
  if (outW < 2 || outH < 2) throw new Error('MP4 output requires at least 2×2 pixels.');

  const fps = pickFps(decoded.frames.map(f => f.durationMs), adv.fpsOverride);
  const bitrate = bitrateFor(adv.quality, outW, outH, fps);

  // Lazy-load mp4-muxer (~6 KB gz).
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: 'avc',
      width: outW, height: outH,
      frameRate: fps,
    },
    fastStart: 'in-memory',
  });

  // Wire up the encoder.
  let encoderError: Error | null = null;
  const VEctor = (globalThis as unknown as { VideoEncoder: new (init: {
    output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void;
    error: (e: Error) => void;
  }) => {
    configure(cfg: VideoEncoderConfig): void;
    encode(frame: VideoFrame, opts?: { keyFrame?: boolean }): void;
    flush(): Promise<void>;
    close(): void;
    state: string;
  } }).VideoEncoder;

  const encoder = new VEctor({
    output: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e: Error) => { encoderError = e; },
  });

  encoder.configure({
    codec: 'avc1.42E01F', // H.264 baseline 3.1
    width: outW, height: outH,
    bitrate,
    framerate: fps,
    avc: { format: 'avc' },
  } as VideoEncoderConfig);

  // Compose each frame onto a background-filled canvas (H.264 has no alpha),
  // run advanced filters, then feed it to the encoder.
  const canvas = makeCanvas(outW, outH);
  const ctx = (canvas as unknown as {
    getContext(t: '2d', o?: { alpha?: boolean }):
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  }).getContext('2d', { alpha: false });
  if (!ctx) throw new Error('mp4: 2d context unavailable');

  const [bgR, bgG, bgB] = adv.backgroundColor;
  const bgFill = `rgb(${bgR}, ${bgG}, ${bgB})`;

  const resample = settings.resample ?? 'high';
  if (resample === 'nearest') ctx.imageSmoothingEnabled = false;
  else if (resample === 'bilinear') { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
  else { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }

  const totalFrames = decoded.frames.length;
  const usPerFrame = 1_000_000 / fps;
  // Keyframe interval: ~2 seconds at the chosen fps, capped at the frame count.
  const keyEvery = Math.max(1, Math.min(totalFrames, fps * 2));

  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;
    const frame = decoded.frames[i];

    ctx.fillStyle = bgFill;
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(frame.bitmap, 0, 0, outW, outH);

    // Run advanced filters per frame (consistent across the video).
    if (settings.filters || (settings.paletteOverrides && settings.paletteOverrides.length > 0)) {
      const id = ctx.getImageData(0, 0, outW, outH);
      applyFilters(id, { filters: settings.filters, paletteOverrides: settings.paletteOverrides });
      ctx.putImageData(id, 0, 0);
    }

    const vf = new VideoFrame(canvas as unknown as CanvasImageSource, {
      timestamp: Math.round(i * usPerFrame),
      duration: Math.round(usPerFrame),
    });
    encoder.encode(vf, { keyFrame: i % keyEvery === 0 });
    vf.close();

    frame.bitmap.close?.();

    onProgress?.(20 + Math.round((i + 1) / totalFrames * 70));
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }

  await encoder.flush();
  if (encoderError) throw encoderError;
  encoder.close();

  muxer.finalize();
  onProgress?.(98);

  const buf = (target as unknown as { buffer: ArrayBuffer }).buffer;
  const stable = new Uint8Array(buf.byteLength);
  stable.set(new Uint8Array(buf));
  const blob = new Blob([stable.buffer], { type: 'video/mp4' });

  onProgress?.(100);

  return {
    blob,
    outName: buildOutName(file.name, extForOutput('mp4')),
    outSize: blob.size,
    outWidth: outW,
    outHeight: outH,
    outFormat: 'mp4',
  };
}
