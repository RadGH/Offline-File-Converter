import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';

// ---------------------------------------------------------------------------
// Mock gifenc — module is dynamically imported inside gif.ts
// ---------------------------------------------------------------------------

const mockBytes = new Uint8Array(256);
mockBytes.fill(0xab);

const writeFrame = vi.fn();
const finish = vi.fn();
const bytes = vi.fn().mockReturnValue(mockBytes);
const GIFEncoder = vi.fn().mockReturnValue({ writeFrame, finish, bytes, bytesView: bytes });
const quantize = vi.fn().mockImplementation((_data: Uint8Array, count: number) => {
  // Return a fake palette of the requested size with at least one transparent slot for rgba4444.
  const palette: number[][] = [];
  for (let i = 0; i < count; i++) palette.push([i, i, i, i === 0 ? 0 : 255]);
  return palette;
});
const applyPalette = vi.fn().mockImplementation((data: Uint8Array) => new Uint8Array(data.length / 4));

vi.mock('gifenc', () => ({ quantize, applyPalette, GIFEncoder, default: GIFEncoder }));

// Stub ImageData (jsdom doesn't have it)
class MockImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(data: Uint8ClampedArray | number, width?: number, height?: number) {
    if (typeof data === 'number') {
      this.width = data;
      this.height = width ?? data;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = data;
      this.width = width ?? 0;
      this.height = height ?? 0;
    }
  }
}
vi.stubGlobal('ImageData', MockImageData);

// Mock createImageBitmap
const mockBitmap: ImageBitmap = { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap;
vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));

// Mock OffscreenCanvas with full surface
class MockOffscreenCanvas {
  width: number;
  height: number;
  imageSmoothingEnabled = true;
  imageSmoothingQuality: 'low' | 'medium' | 'high' = 'high';
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(_type: string, _opts?: unknown) {
    const self = this;
    return {
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      get imageSmoothingEnabled() { return self.imageSmoothingEnabled; },
      set imageSmoothingEnabled(v: boolean) { self.imageSmoothingEnabled = v; },
      get imageSmoothingQuality() { return self.imageSmoothingQuality; },
      set imageSmoothingQuality(v: 'low' | 'medium' | 'high') { self.imageSmoothingQuality = v; },
      getImageData: (_x: number, _y: number, w: number, h: number) =>
        new MockImageData(new Uint8ClampedArray(w * h * 4), w, h),
      putImageData: vi.fn(),
    };
  }
}
vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

const { convertToGif } = await import('@/lib/converters/gif');

function makeFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(32)], name, { type });
}

function makeInput(overrides: Partial<ConversionInput['settings']> = {}): ConversionInput {
  return {
    file: makeFile(),
    settings: {
      format: 'gif',
      quality: 80,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      upscale: false,
      preserveOrientation: false,
      resample: 'high' as const,
      dimensionUnit: 'px' as const,
      ...overrides,
    },
  };
}

describe('convertToGif (gifenc backend)', () => {
  beforeEach(() => {
    GIFEncoder.mockClear();
    writeFrame.mockClear();
    finish.mockClear();
    quantize.mockClear();
    applyPalette.mockClear();
  });

  it('writes a single frame and finishes', async () => {
    await convertToGif(makeInput());
    expect(writeFrame).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledOnce();
  });

  it('returns a blob with MIME image/gif', async () => {
    const result = await convertToGif(makeInput());
    expect(result.blob.type).toBe('image/gif');
  });

  it('output filename has .gif extension', async () => {
    const result = await convertToGif(makeInput());
    expect(result.outName).toBe('photo.gif');
  });

  it('output format field is gif', async () => {
    const result = await convertToGif(makeInput());
    expect(result.outFormat).toBe('gif');
  });

  it('passes the configured palette size to quantize', async () => {
    await convertToGif(makeInput({ gif: { transparency: 'auto', paletteSize: 64, dither: 'none' } }));
    const [, count] = quantize.mock.calls[0];
    expect(count).toBe(64);
  });

  it('uses rgba4444 format when transparency is auto and source has alpha', async () => {
    await convertToGif(makeInput({ gif: { transparency: 'auto', paletteSize: 256, dither: 'none' } }));
    // Mock getImageData returns all-zero data → all alpha=0 → source has alpha → rgba4444
    const [, , opts] = quantize.mock.calls[0];
    expect(opts?.format).toBe('rgba4444');
  });

  it('uses rgb444 format when transparency is off', async () => {
    await convertToGif(makeInput({ gif: { transparency: 'off', paletteSize: 256, dither: 'none' } }));
    const [, , opts] = quantize.mock.calls[0];
    expect(opts?.format).toBe('rgb444');
  });

  it('writeFrame includes transparent flag when transparency is enabled', async () => {
    await convertToGif(makeInput({ gif: { transparency: 'auto', paletteSize: 256, dither: 'none' } }));
    const [, , , opts] = writeFrame.mock.calls[0];
    expect(opts?.transparent).toBe(true);
  });

  it('writeFrame transparent=false when transparency=off', async () => {
    await convertToGif(makeInput({ gif: { transparency: 'off', paletteSize: 256, dither: 'none' } }));
    const [, , , opts] = writeFrame.mock.calls[0];
    expect(opts?.transparent).toBe(false);
  });

  it('progress callback fires 10 first and 100 last', async () => {
    const calls: number[] = [];
    await convertToGif(makeInput(), (pct) => calls.push(pct));
    expect(calls[0]).toBe(10);
    expect(calls[calls.length - 1]).toBe(100);
  });

  it('outSize matches blob size', async () => {
    const result = await convertToGif(makeInput());
    expect(result.outSize).toBe(256);
  });
});
