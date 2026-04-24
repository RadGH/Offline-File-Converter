import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';

// ---------------------------------------------------------------------------
// Mock canvas.ts so we don't need a real canvas in dispatch tests
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

// After mocking, import the dispatcher
const { convert } = await import('@/lib/converters/index');

function makeFile(name: string, type = 'image/jpeg'): File {
  return new File([new Uint8Array(10)], name, { type });
}

function makeInput(
  fileName: string,
  mimeType: string,
  outputFormat: ConversionInput['settings']['format']
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
    },
  };
}

describe('convert dispatcher', () => {
  beforeEach(() => {
    mockConvertViaCanvas.mockClear();
  });

  // ── Canvas routes (jpeg / png / webp output) ────────────────────────────

  it('routes jpeg input → jpeg output to canvas', async () => {
    await convert(makeInput('photo.jpg', 'image/jpeg', 'jpeg'));
    expect(mockConvertViaCanvas).toHaveBeenCalledOnce();
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
    expect(mockConvertViaCanvas).toHaveBeenCalledWith(
      expect.any(Object),
      onProgress
    );
  });

  // ── Not-yet-supported: avif output ─────────────────────────────────────

  it('throws not-yet-supported for avif output', async () => {
    await expect(
      convert(makeInput('photo.jpg', 'image/jpeg', 'avif'))
    ).rejects.toThrow('not-yet-supported: avif');
  });

  it('does NOT call canvas converter for avif output', async () => {
    try {
      await convert(makeInput('photo.jpg', 'image/jpeg', 'avif'));
    } catch {
      // expected
    }
    expect(mockConvertViaCanvas).not.toHaveBeenCalled();
  });

  // ── Not-yet-supported: gif output ──────────────────────────────────────

  it('throws not-yet-supported for gif output', async () => {
    await expect(
      convert(makeInput('photo.jpg', 'image/jpeg', 'gif'))
    ).rejects.toThrow('not-yet-supported: gif');
  });

  it('does NOT call canvas converter for gif output', async () => {
    try {
      await convert(makeInput('photo.jpg', 'image/jpeg', 'gif'));
    } catch {
      // expected
    }
    expect(mockConvertViaCanvas).not.toHaveBeenCalled();
  });

  // ── Not-yet-supported: heic input ──────────────────────────────────────

  it('throws not-yet-supported for heic input (by MIME)', async () => {
    await expect(
      convert(makeInput('photo.heic', 'image/heic', 'jpeg'))
    ).rejects.toThrow('not-yet-supported: heic-input');
  });

  it('throws not-yet-supported for heif input (by MIME)', async () => {
    await expect(
      convert(makeInput('photo.heif', 'image/heif', 'jpeg'))
    ).rejects.toThrow('not-yet-supported: heic-input');
  });

  it('throws not-yet-supported for heic input (by extension fallback)', async () => {
    // MIME is empty — detectInputFormat falls back to extension
    await expect(
      convert(makeInput('photo.heic', '', 'webp'))
    ).rejects.toThrow('not-yet-supported: heic-input');
  });

  it('does NOT call canvas converter for heic input', async () => {
    try {
      await convert(makeInput('photo.heic', 'image/heic', 'jpeg'));
    } catch {
      // expected
    }
    expect(mockConvertViaCanvas).not.toHaveBeenCalled();
  });
});
