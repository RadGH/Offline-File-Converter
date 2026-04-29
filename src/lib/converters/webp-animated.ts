/**
 * Animated WebP encoder.
 *
 * Strategy:
 *   1. Decode every frame of the input via WebCodecs ImageDecoder.
 *   2. Encode each frame as a single-frame WebP via @jsquash/webp.
 *   3. Strip each per-frame WebP file down to its VP8/VP8L (+ ALPH) chunks.
 *   4. Wrap everything in a WebP MUX container with a top-level VP8X +
 *      ANIM chunks + an ANMF chunk per frame.
 *
 * The WebP RIFF/MUX format is documented at
 *   https://developers.google.com/speed/webp/docs/riff_container#extended_file_format
 *
 * Lazy-loaded by the dispatcher.
 */

import type { ConversionInput, ConversionResult } from './types';
import { extForOutput } from '@/lib/utils/mime';
import { applyResize } from '@/lib/utils/resize';
import { decodeAllFrames } from '@/lib/advanced/decode-frames';
import { applyFilters } from '@/lib/advanced/filters';
import { DEFAULT_WEBP_ADVANCED } from '@/lib/queue/store';

function buildOutName(originalName: string, ext: string): string {
  const dotIdx = originalName.lastIndexOf('.');
  const base = dotIdx >= 0 ? originalName.slice(0, dotIdx) : originalName;
  return `${base}.${ext}`;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// ── WebP RIFF helpers ──────────────────────────────────────────────────────

function fourCC(s: string): Uint8Array {
  const b = new Uint8Array(4);
  for (let i = 0; i < 4; i++) b[i] = s.charCodeAt(i);
  return b;
}

function writeUint32LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}
function writeUint24LE(out: number[], v: number): void {
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff);
}

function makeChunk(tag: string, payload: Uint8Array): Uint8Array {
  const padded = payload.length + (payload.length & 1); // pad to even
  const buf = new Uint8Array(8 + padded);
  buf.set(fourCC(tag), 0);
  buf[4] = payload.length & 0xff;
  buf[5] = (payload.length >>> 8) & 0xff;
  buf[6] = (payload.length >>> 16) & 0xff;
  buf[7] = (payload.length >>> 24) & 0xff;
  buf.set(payload, 8);
  return buf;
}

interface ParsedWebp {
  hasAlpha: boolean;
  /** Raw bytes of the inner VP8/VP8L (and optional ALPH) chunks, ready to embed in ANMF. */
  innerChunks: Uint8Array;
}

/**
 * Parse a per-frame static WebP file produced by @jsquash/webp and extract
 * the chunks needed for an ANMF payload (ALPH + VP8/VP8L). Drops VP8X,
 * ICCP, EXIF, XMP, and any other auxiliary chunks.
 */
function parseStaticWebp(file: Uint8Array): ParsedWebp {
  if (file.length < 12) throw new Error('webp-animated: per-frame webp too short');
  const tag = String.fromCharCode(file[0], file[1], file[2], file[3]);
  if (tag !== 'RIFF') throw new Error('webp-animated: per-frame webp missing RIFF header');
  const form = String.fromCharCode(file[8], file[9], file[10], file[11]);
  if (form !== 'WEBP') throw new Error('webp-animated: per-frame webp missing WEBP form');

  let pos = 12;
  let hasAlpha = false;
  const keep: Uint8Array[] = [];
  while (pos < file.length) {
    if (pos + 8 > file.length) break;
    const cTag = String.fromCharCode(file[pos], file[pos + 1], file[pos + 2], file[pos + 3]);
    const cLen = file[pos + 4] | (file[pos + 5] << 8) | (file[pos + 6] << 16) | (file[pos + 7] << 24);
    const padded = cLen + (cLen & 1);
    const chunkEnd = pos + 8 + padded;
    if (chunkEnd > file.length) break;

    if (cTag === 'ALPH' || cTag === 'VP8 ' || cTag === 'VP8L') {
      // Keep the full chunk (header + payload + pad).
      keep.push(file.subarray(pos, chunkEnd));
      if (cTag === 'ALPH') hasAlpha = true;
      if (cTag === 'VP8L') hasAlpha = true; // VP8L files often include alpha
    }
    // Skip VP8X / ICCP / EXIF / XMP / others.
    pos = chunkEnd;
  }

  if (keep.length === 0) throw new Error('webp-animated: per-frame webp had no VP8/VP8L data');
  // Concatenate kept chunks.
  let total = 0;
  for (const c of keep) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of keep) { out.set(c, o); o += c.length; }
  return { hasAlpha, innerChunks: out };
}

function buildVp8xChunk(canvasW: number, canvasH: number, hasAlpha: boolean): Uint8Array {
  // VP8X payload is 10 bytes:
  //   1 byte flags (animation=bit1, alpha=bit4, ...)
  //   3 bytes reserved
  //   3 bytes (canvasW - 1) LE
  //   3 bytes (canvasH - 1) LE
  const payload: number[] = [];
  let flags = 0;
  flags |= 1 << 1; // animation
  if (hasAlpha) flags |= 1 << 4;
  payload.push(flags, 0, 0, 0);
  writeUint24LE(payload, canvasW - 1);
  writeUint24LE(payload, canvasH - 1);
  return makeChunk('VP8X', new Uint8Array(payload));
}

function buildAnimChunk(loopCount: number): Uint8Array {
  // 4 bytes background color (BGRA), 2 bytes loop count
  const payload: number[] = [];
  // Background ARGB → we pick fully-transparent black: 0x00000000
  writeUint32LE(payload, 0);
  payload.push(loopCount & 0xff, (loopCount >>> 8) & 0xff);
  return makeChunk('ANIM', new Uint8Array(payload));
}

function buildAnmfChunk(
  frameW: number,
  frameH: number,
  durationMs: number,
  blendOver: boolean,
  disposeBackground: boolean,
  innerFrameData: Uint8Array,
): Uint8Array {
  // ANMF payload (16 bytes header + frame data):
  //   3 bytes x_offset / 2  → use 0
  //   3 bytes y_offset / 2  → use 0
  //   3 bytes (frameW - 1)
  //   3 bytes (frameH - 1)
  //   3 bytes duration_ms
  //   1 byte flags (reserved 6 + blend 1 + dispose 1)
  const payload: number[] = [];
  writeUint24LE(payload, 0);
  writeUint24LE(payload, 0);
  writeUint24LE(payload, frameW - 1);
  writeUint24LE(payload, frameH - 1);
  writeUint24LE(payload, Math.max(0, Math.min(0xffffff, durationMs)));
  // bit 0 = dispose-to-background (1) or none (0)
  // bit 1 = blend: 0=blend over previous, 1=overwrite (no blend)
  let flags = 0;
  if (disposeBackground) flags |= 0x01;
  if (!blendOver) flags |= 0x02;
  payload.push(flags);
  const header = new Uint8Array(payload);
  const total = new Uint8Array(header.length + innerFrameData.length);
  total.set(header, 0);
  total.set(innerFrameData, header.length);
  return makeChunk('ANMF', total);
}

function assembleWebpFile(parts: Uint8Array[]): Uint8Array {
  let dataLen = 4; // "WEBP"
  for (const p of parts) dataLen += p.length;
  const file = new Uint8Array(8 + dataLen);
  file.set(fourCC('RIFF'), 0);
  file[4] = dataLen & 0xff;
  file[5] = (dataLen >>> 8) & 0xff;
  file[6] = (dataLen >>> 16) & 0xff;
  file[7] = (dataLen >>> 24) & 0xff;
  file.set(fourCC('WEBP'), 8);
  let o = 12;
  for (const p of parts) { file.set(p, o); o += p.length; }
  return file;
}

// ── Main entry ─────────────────────────────────────────────────────────────

export async function convertToWebpAnimated(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings, originalDimensions } = input;

  onProgress?.(5);
  const decoded = await decodeAllFrames(file);
  onProgress?.(20);

  const baseDims = originalDimensions ?? { width: decoded.width, height: decoded.height };
  const { width: outW, height: outH } = applyResize(baseDims, {
    width: settings.width,
    height: settings.height,
    maintainAspect: settings.maintainAspect,
    preserveOrientation: settings.preserveOrientation,
    dimensionUnit: settings.dimensionUnit,
  });

  const adv = settings.webp ?? DEFAULT_WEBP_ADVANCED;
  const { encode } = await import('@jsquash/webp');

  const totalFrames = decoded.frames.length;
  const anmfChunks: Uint8Array[] = [];
  let anyAlpha = false;
  const resample = settings.resample ?? 'high';

  for (let i = 0; i < totalFrames; i++) {
    const frame = decoded.frames[i];
    const cv = makeCanvas(outW, outH);
    const ctx = (cv as unknown as { getContext(t: '2d', o?: { alpha?: boolean }): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null }).getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not get 2d context');
    if (resample === 'nearest') ctx.imageSmoothingEnabled = false;
    else if (resample === 'bilinear') { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; }
    else { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(frame.bitmap, 0, 0, outW, outH);

    const id = ctx.getImageData(0, 0, outW, outH);
    if (settings.filters || (settings.paletteOverrides && settings.paletteOverrides.length > 0)) {
      applyFilters(id, { filters: settings.filters, paletteOverrides: settings.paletteOverrides });
    }

    const perFrame = await encode(id, {
      quality: settings.quality,
      lossless: adv.lossless ? 1 : 0,
      alpha_quality: adv.alphaQuality,
      method: Math.max(0, Math.min(6, adv.method)),
      near_lossless: Math.max(0, Math.min(100, adv.nearLossless)),
    });

    const parsed = parseStaticWebp(new Uint8Array(perFrame));
    if (parsed.hasAlpha) anyAlpha = true;

    anmfChunks.push(buildAnmfChunk(
      outW, outH,
      frame.durationMs,
      true,   // blend over previous
      true,   // dispose to background BEFORE drawing the next frame
              // (prevents ghosting when the next frame has transparent pixels;
              // our frames are full composited bitmaps so each is self-contained).
      parsed.innerChunks,
    ));

    onProgress?.(20 + Math.round((i + 1) / totalFrames * 75));
    if (i % 2 === 1) await new Promise(r => setTimeout(r, 0));
    frame.bitmap.close?.();
  }

  const vp8x = buildVp8xChunk(outW, outH, anyAlpha);
  const anim = buildAnimChunk(decoded.loop || 0);
  const fileBytes = assembleWebpFile([vp8x, anim, ...anmfChunks]);

  const stable = new Uint8Array(fileBytes.byteLength);
  stable.set(fileBytes);
  const blob = new Blob([stable.buffer], { type: 'image/webp' });

  onProgress?.(100);

  return {
    blob,
    outName: buildOutName(file.name, extForOutput('webp-animated')),
    outSize: blob.size,
    outWidth: outW,
    outHeight: outH,
    outFormat: 'webp-animated',
  };
}
