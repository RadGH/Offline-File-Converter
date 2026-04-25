import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Mock createImageBitmap globally
const mockBitmap: ImageBitmap = {
  width: 100,
  height: 80,
  close: vi.fn(),
};

// Keep a reference to swap in per-test
let createImageBitmapImpl: (source: ImageBitmapSource) => Promise<ImageBitmap> =
  () => Promise.resolve(mockBitmap);

vi.stubGlobal('createImageBitmap', (source: ImageBitmapSource) =>
  createImageBitmapImpl(source)
);

// Mock OffscreenCanvas so we can control toBlob / convertToBlob
let lastToBlobCall: { mime: string; quality: number } | null = null;
let toBlobResult: Blob | null = new Blob(['fake-image-data'], { type: 'image/webp' });
let toBlobError: Error | null = null;

class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(_type: string) {
    return {
      drawImage: vi.fn(),
    };
  }
  convertToBlob({ type, quality }: { type: string; quality: number }): Promise<Blob> {
    lastToBlobCall = { mime: type, quality };
    if (toBlobError) return Promise.reject(toBlobError);
    if (!toBlobResult) return Promise.reject(new Error('null blob'));
    return Promise.resolve(toBlobResult);
  }
}

vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

// ---------------------------------------------------------------------------
// After mocks are set up, import the module under test
// ---------------------------------------------------------------------------
const { convertViaCanvas } = await import('@/lib/converters/canvas');

function makeFile(name: string, type = 'image/jpeg'): File {
  return new File([new Uint8Array(10)], name, { type });
}

function makeInput(
  name: string,
  overrides: Partial<ConversionInput['settings']> = {},
  originalDimensions?: { width: number; height: number }
): ConversionInput {
  return {
    file: makeFile(name),
    settings: {
      format: 'webp',
      quality: 80,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      pngOptimize: false,
      upscale: false,
      preserveOrientation: false,
      resample: 'high' as const,
      dimensionUnit: 'px' as const,
      ...overrides,
    },
    originalDimensions,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('convertViaCanvas', () => {
  beforeEach(() => {
    lastToBlobCall = null;
    toBlobResult = new Blob(['fake-image-data'], { type: 'image/webp' });
    toBlobError = null;
    createImageBitmapImpl = () => Promise.resolve(mockBitmap);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('output filename swaps extension for webp', async () => {
    const input = makeInput('photo.jpg', { format: 'webp' });
    const result = await convertViaCanvas(input);
    expect(result.outName).toBe('photo.webp');
  });

  it('output filename swaps extension for png', async () => {
    toBlobResult = new Blob(['fake'], { type: 'image/png' });
    const input = makeInput('banner.jpeg', { format: 'png' });
    const result = await convertViaCanvas(input);
    expect(result.outName).toBe('banner.png');
  });

  it('output filename swaps extension for jpeg', async () => {
    toBlobResult = new Blob(['fake'], { type: 'image/jpeg' });
    const input = makeInput('image.webp', { format: 'jpeg' });
    const result = await convertViaCanvas(input);
    expect(result.outName).toBe('image.jpg');
  });

  it('output filename handles files with no extension', async () => {
    const input = makeInput('nodotfile', { format: 'webp' });
    const result = await convertViaCanvas(input);
    expect(result.outName).toBe('nodotfile.webp');
  });

  it('calls convertToBlob with correct MIME for webp', async () => {
    const input = makeInput('photo.jpg', { format: 'webp', quality: 80 });
    await convertViaCanvas(input);
    expect(lastToBlobCall?.mime).toBe('image/webp');
  });

  it('calls convertToBlob with correct MIME for jpeg', async () => {
    toBlobResult = new Blob(['fake'], { type: 'image/jpeg' });
    const input = makeInput('photo.png', { format: 'jpeg', quality: 75 });
    await convertViaCanvas(input);
    expect(lastToBlobCall?.mime).toBe('image/jpeg');
  });

  it('calls convertToBlob with correct MIME for png', async () => {
    toBlobResult = new Blob(['fake'], { type: 'image/png' });
    const input = makeInput('photo.jpg', { format: 'png', quality: 100 });
    await convertViaCanvas(input);
    expect(lastToBlobCall?.mime).toBe('image/png');
  });

  it('converts quality from 1-100 slider to 0-1 for toBlob', async () => {
    const input = makeInput('photo.jpg', { format: 'webp', quality: 75 });
    await convertViaCanvas(input);
    expect(lastToBlobCall?.quality).toBeCloseTo(0.75);
  });

  it('quality 100 maps to 1.0', async () => {
    const input = makeInput('photo.jpg', { format: 'webp', quality: 100 });
    await convertViaCanvas(input);
    expect(lastToBlobCall?.quality).toBeCloseTo(1.0);
  });

  it('quality 1 maps to 0.01', async () => {
    const input = makeInput('photo.jpg', { format: 'webp', quality: 1 });
    await convertViaCanvas(input);
    expect(lastToBlobCall?.quality).toBeCloseTo(0.01);
  });

  it('progress callbacks are invoked in order: 10, 40, 70, 100', async () => {
    const calls: number[] = [];
    const input = makeInput('photo.jpg', { format: 'webp' });
    await convertViaCanvas(input, (pct) => calls.push(pct));
    expect(calls).toEqual([10, 40, 70, 100]);
  });

  it('final progress value is always 100', async () => {
    const calls: number[] = [];
    await convertViaCanvas(makeInput('x.jpg'), (pct) => calls.push(pct));
    expect(calls[calls.length - 1]).toBe(100);
  });

  it('errors from convertToBlob propagate', async () => {
    toBlobError = new Error('encode failed');
    const input = makeInput('photo.jpg', { format: 'webp' });
    await expect(convertViaCanvas(input)).rejects.toThrow('encode failed');
  });

  it('errors from createImageBitmap propagate', async () => {
    createImageBitmapImpl = () => Promise.reject(new Error('unsupported format'));
    // Also make the Image() fallback fail (jsdom limitation)
    const input = makeInput('photo.heic', { format: 'webp' });
    await expect(convertViaCanvas(input)).rejects.toThrow();
  });

  it('result includes outSize matching the blob size', async () => {
    const blobData = 'fake-webp-data-for-size-check';
    toBlobResult = new Blob([blobData], { type: 'image/webp' });
    const input = makeInput('photo.jpg', { format: 'webp' });
    const result = await convertViaCanvas(input);
    expect(result.outSize).toBe(blobData.length);
  });

  it('result outFormat matches requested format', async () => {
    const input = makeInput('photo.jpg', { format: 'webp' });
    const result = await convertViaCanvas(input);
    expect(result.outFormat).toBe('webp');
  });

  it('result dimensions match bitmap size when no resize is requested', async () => {
    const input = makeInput('photo.jpg', { format: 'webp', width: null, height: null });
    const result = await convertViaCanvas(input);
    // bitmap is 100×80; no resize target → should pass through
    expect(result.outWidth).toBe(100);
    expect(result.outHeight).toBe(80);
  });

  it('uses originalDimensions over bitmap dims for resize calculation when provided', async () => {
    // originalDimensions is 400×200; target width 200 → height should be 100
    const input = makeInput(
      'photo.jpg',
      { format: 'webp', width: 200, height: null, maintainAspect: true },
      { width: 400, height: 200 }
    );
    const result = await convertViaCanvas(input);
    expect(result.outWidth).toBe(200);
    expect(result.outHeight).toBe(100);
  });
});
