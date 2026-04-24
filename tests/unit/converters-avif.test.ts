import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';

// ---------------------------------------------------------------------------
// Mock @jsquash/avif — dynamic import inside avif.ts
// ---------------------------------------------------------------------------
const mockEncode = vi.fn().mockResolvedValue(new ArrayBuffer(128));

vi.mock('@jsquash/avif', () => ({
  encode: mockEncode,
}));

// Mock createImageBitmap
const mockBitmap: ImageBitmap = { width: 64, height: 64, close: vi.fn() };
vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));

// Stub ImageData (not available in jsdom)
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

// Mock OffscreenCanvas so getImageData works
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(_type: string) {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(
        new MockImageData(new Uint8ClampedArray(64 * 64 * 4), 64, 64)
      ),
    };
  }
}
vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

const { convertToAvif } = await import('@/lib/converters/avif');

function makeFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(32)], name, { type });
}

function makeInput(overrides: Partial<ConversionInput['settings']> = {}): ConversionInput {
  return {
    file: makeFile(),
    settings: {
      format: 'avif',
      quality: 75,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      pngOptimize: false,
      ...overrides,
    },
  };
}

describe('convertToAvif', () => {
  beforeEach(() => {
    mockEncode.mockClear();
    (mockBitmap.close as ReturnType<typeof vi.fn>).mockClear();
  });

  it('calls encode with quality from settings', async () => {
    await convertToAvif(makeInput({ quality: 60 }));
    expect(mockEncode).toHaveBeenCalledOnce();
    const [, opts] = mockEncode.mock.calls[0];
    expect(opts).toMatchObject({ quality: 60 });
  });

  it('calls encode with an ImageData-like object', async () => {
    await convertToAvif(makeInput());
    const [imageData] = mockEncode.mock.calls[0];
    // MockImageData is stubbed as the global ImageData in this test context
    expect(imageData).toBeInstanceOf(MockImageData);
  });

  it('returns a blob with MIME image/avif', async () => {
    const result = await convertToAvif(makeInput());
    expect(result.blob.type).toBe('image/avif');
  });

  it('output filename has .avif extension', async () => {
    const result = await convertToAvif(makeInput());
    expect(result.outName).toBe('photo.avif');
  });

  it('output format field is avif', async () => {
    const result = await convertToAvif(makeInput());
    expect(result.outFormat).toBe('avif');
  });

  it('reports progress at 10, 30, 60, 100', async () => {
    const calls: number[] = [];
    await convertToAvif(makeInput(), (pct) => calls.push(pct));
    expect(calls[0]).toBe(10);
    expect(calls[1]).toBe(30);
    expect(calls[2]).toBe(60);
    expect(calls[calls.length - 1]).toBe(100);
  });

  it('outSize matches returned ArrayBuffer size (128 bytes = 128)', async () => {
    const result = await convertToAvif(makeInput());
    // ArrayBuffer(128) wrapped in Blob = 128 bytes
    expect(result.outSize).toBe(128);
  });

  it('replaces any source extension with .avif', async () => {
    const input = { ...makeInput(), file: makeFile('banner.png', 'image/png') };
    const result = await convertToAvif(input);
    expect(result.outName).toBe('banner.avif');
  });
});
