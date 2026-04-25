import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';

// ---------------------------------------------------------------------------
// Mock canvas.ts
// ---------------------------------------------------------------------------
const mockConvertViaCanvas = vi.fn().mockResolvedValue({
  blob: new Blob(['data'], { type: 'image/webp' }),
  outName: 'test.webp',
  outSize: 4,
  outWidth: 100,
  outHeight: 80,
  outFormat: 'webp',
});

vi.mock('@/lib/converters/canvas', () => ({
  convertViaCanvas: mockConvertViaCanvas,
}));

// ---------------------------------------------------------------------------
// Mock the heavy codec modules (avif, gif, heic, png-optimize)
// ---------------------------------------------------------------------------
const mockConvertToAvif = vi.fn().mockResolvedValue({
  blob: new Blob(['avif-data'], { type: 'image/avif' }),
  outName: 'test.avif',
  outSize: 8,
  outWidth: 100,
  outHeight: 80,
  outFormat: 'avif',
});
vi.mock('@/lib/converters/avif', () => ({ convertToAvif: mockConvertToAvif }));

const mockConvertToGif = vi.fn().mockResolvedValue({
  blob: new Blob(['gif-data'], { type: 'image/gif' }),
  outName: 'test.gif',
  outSize: 8,
  outWidth: 100,
  outHeight: 80,
  outFormat: 'gif',
});
vi.mock('@/lib/converters/gif', () => ({ convertToGif: mockConvertToGif }));

const mockDecodeHeic = vi.fn().mockResolvedValue(
  new Blob([new Uint8Array(512)], { type: 'image/png' })
);
vi.mock('@/lib/converters/heic', () => ({ decodeHeic: mockDecodeHeic }));

const mockOptimizePng = vi.fn().mockImplementation((blob: Blob) => Promise.resolve(blob));
vi.mock('@/lib/converters/png-optimize', () => ({ optimizePng: mockOptimizePng }));

// After mocking, import the dispatcher
const { convert } = await import('@/lib/converters/index');

function makeFile(name: string, type = 'image/jpeg'): File {
  return new File([new Uint8Array(10)], name, { type });
}

function makeInput(
  fileName: string,
  mimeType: string,
  outputFormat: ConversionInput['settings']['format'],
  extraSettings: Partial<ConversionInput['settings']> = {}
): ConversionInput {
  return {
    file: makeFile(fileName, mimeType),
    settings: {
      format: outputFormat,
      quality: 85,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      pngOptimize: false,
      upscale: false,
      preserveOrientation: false,
      resample: 'high' as const,
      dimensionUnit: 'px' as const,
      ...extraSettings,
    },
  };
}

describe('convert dispatcher — Phase 6', () => {
  beforeEach(() => {
    mockConvertViaCanvas.mockClear();
    mockConvertToAvif.mockClear();
    mockConvertToGif.mockClear();
    mockDecodeHeic.mockClear();
    mockOptimizePng.mockClear();
  });

  // ── Canvas routes (jpeg / png / webp output) ────────────────────────────

  it('routes jpeg input → jpeg output to canvas', async () => {
    await convert(makeInput('photo.jpg', 'image/jpeg', 'jpeg'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
    expect(mockConvertToAvif).not.toHaveBeenCalled();
  });

  it('routes jpeg input → png output to canvas', async () => {
    mockConvertViaCanvas.mockResolvedValueOnce({
      blob: new Blob(['data'], { type: 'image/png' }),
      outName: 'photo.png',
      outSize: 4,
      outWidth: 100,
      outHeight: 80,
      outFormat: 'png',
    });
    await convert(makeInput('photo.jpg', 'image/jpeg', 'png'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
  });

  it('routes jpeg input → webp output to canvas', async () => {
    await convert(makeInput('photo.jpg', 'image/jpeg', 'webp'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
  });

  it('routes png input → webp output to canvas', async () => {
    await convert(makeInput('photo.png', 'image/png', 'webp'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
  });

  it('routes webp input → jpeg output to canvas', async () => {
    mockConvertViaCanvas.mockResolvedValueOnce({
      blob: new Blob(['data'], { type: 'image/jpeg' }),
      outName: 'photo.jpg',
      outSize: 4,
      outWidth: 100,
      outHeight: 80,
      outFormat: 'jpeg',
    });
    await convert(makeInput('photo.webp', 'image/webp', 'jpeg'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
  });

  it('routes bmp input → png output to canvas', async () => {
    mockConvertViaCanvas.mockResolvedValueOnce({
      blob: new Blob(['data'], { type: 'image/png' }),
      outName: 'photo.png',
      outSize: 4,
      outWidth: 100,
      outHeight: 80,
      outFormat: 'png',
    });
    await convert(makeInput('photo.bmp', 'image/bmp', 'png'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
  });

  it('passes onProgress callback through to canvas converter', async () => {
    const onProgress = vi.fn();
    await convert(makeInput('photo.jpg', 'image/jpeg', 'webp'), onProgress);
    expect(mockConvertViaCanvas).toHaveBeenCalledWith(expect.any(Object), onProgress);
  });

  // ── AVIF output (now works — no throw) ─────────────────────────────────

  it('routes jpeg input → avif output to avif converter', async () => {
    await convert(makeInput('photo.jpg', 'image/jpeg', 'avif'));
    expect(mockConvertToAvif).toHaveBeenCalledOnce();
    expect(mockConvertViaCanvas).not.toHaveBeenCalled();
  });

  it('does NOT throw for avif output', async () => {
    await expect(
      convert(makeInput('photo.jpg', 'image/jpeg', 'avif'))
    ).resolves.toBeDefined();
  });

  it('avif result has outFormat avif', async () => {
    const result = await convert(makeInput('photo.jpg', 'image/jpeg', 'avif'));
    expect(result.outFormat).toBe('avif');
  });

  // ── GIF output (now works — no throw) ──────────────────────────────────

  it('routes jpeg input → gif output to gif converter', async () => {
    await convert(makeInput('photo.jpg', 'image/jpeg', 'gif'));
    expect(mockConvertToGif).toHaveBeenCalledOnce();
    expect(mockConvertViaCanvas).not.toHaveBeenCalled();
  });

  it('does NOT throw for gif output', async () => {
    await expect(
      convert(makeInput('photo.jpg', 'image/jpeg', 'gif'))
    ).resolves.toBeDefined();
  });

  // ── HEIC input (now works — no throw) ──────────────────────────────────

  it('routes heic input through heic decoder then canvas for jpeg output', async () => {
    await convert(makeInput('photo.heic', 'image/heic', 'jpeg'));
    expect(mockDecodeHeic).toHaveBeenCalledOnce();
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
  });

  it('does NOT throw for heic input', async () => {
    await expect(
      convert(makeInput('photo.heic', 'image/heic', 'jpeg'))
    ).resolves.toBeDefined();
  });

  it('routes heif input (by MIME) through heic decoder', async () => {
    await convert(makeInput('photo.heif', 'image/heif', 'png'));
    expect(mockDecodeHeic).toHaveBeenCalledOnce();
  });

  it('routes heic input (by extension, no MIME) through heic decoder', async () => {
    await convert(makeInput('photo.heic', '', 'webp'));
    expect(mockDecodeHeic).toHaveBeenCalledOnce();
  });

  it('routes heic input → avif output through decoder + avif converter', async () => {
    await convert(makeInput('photo.heic', 'image/heic', 'avif'));
    expect(mockDecodeHeic).toHaveBeenCalledOnce();
    expect(mockConvertToAvif).toHaveBeenCalledOnce();
    expect(mockConvertViaCanvas).not.toHaveBeenCalled();
  });

  it('routes heic input → gif output through decoder + gif converter', async () => {
    await convert(makeInput('photo.heic', 'image/heic', 'gif'));
    expect(mockDecodeHeic).toHaveBeenCalledOnce();
    expect(mockConvertToGif).toHaveBeenCalledOnce();
  });

  // ── PNG optimize passthrough ────────────────────────────────────────────

  it('does NOT call optimizePng when pngOptimize is false', async () => {
    mockConvertViaCanvas.mockResolvedValueOnce({
      blob: new Blob(['data'], { type: 'image/png' }),
      outName: 'photo.png',
      outSize: 4,
      outWidth: 100,
      outHeight: 80,
      outFormat: 'png',
    });
    await convert(makeInput('photo.jpg', 'image/jpeg', 'png', { pngOptimize: false }));
    expect(mockOptimizePng).not.toHaveBeenCalled();
  });

  it('calls optimizePng when format=png and pngOptimize=true', async () => {
    mockConvertViaCanvas.mockResolvedValueOnce({
      blob: new Blob(['data'], { type: 'image/png' }),
      outName: 'photo.png',
      outSize: 4,
      outWidth: 100,
      outHeight: 80,
      outFormat: 'png',
    });
    await convert(makeInput('photo.jpg', 'image/jpeg', 'png', { pngOptimize: true }));
    expect(mockOptimizePng).toHaveBeenCalledOnce();
  });

  it('does NOT call optimizePng for non-png outputs even if pngOptimize=true', async () => {
    await convert(makeInput('photo.jpg', 'image/jpeg', 'jpeg', { pngOptimize: true }));
    expect(mockOptimizePng).not.toHaveBeenCalled();
  });
});
