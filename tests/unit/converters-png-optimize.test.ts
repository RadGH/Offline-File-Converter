import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock upng-js — dynamic import inside png-optimize.ts
// ---------------------------------------------------------------------------
const fakeDecoded = { width: 64, height: 64, depth: 8, ctype: 2, frames: [], tabs: {}, data: new ArrayBuffer(64 * 64 * 4) };
const fakeFrames = [new ArrayBuffer(64 * 64 * 4)];
// Default: both candidates are 200 bytes — smaller than 512-byte input
const fakeReencoded = new ArrayBuffer(200);

const mockDecode = vi.fn().mockReturnValue(fakeDecoded);
const mockToRGBA8 = vi.fn().mockReturnValue(fakeFrames);
const mockEncode = vi.fn().mockReturnValue(fakeReencoded);

vi.mock('upng-js', () => ({
  default: {
    decode: mockDecode,
    toRGBA8: mockToRGBA8,
    encode: mockEncode,
  },
}));

const { optimizePng } = await import('@/lib/converters/png-optimize');

function makePngBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/png' });
}

describe('optimizePng', () => {
  beforeEach(() => {
    mockDecode.mockClear();
    mockToRGBA8.mockClear();
    mockEncode.mockClear();
    // Default: both candidates (lossless + quantized) are 200 bytes — smaller than 512-byte blob
    mockEncode.mockReturnValue(fakeReencoded);
  });

  it('calls UPNG.decode with the png buffer', async () => {
    const blob = makePngBlob(512);
    await optimizePng(blob);
    expect(mockDecode).toHaveBeenCalledOnce();
  });

  it('calls UPNG.toRGBA8 with the decoded image', async () => {
    await optimizePng(makePngBlob(512));
    expect(mockToRGBA8).toHaveBeenCalledWith(fakeDecoded);
  });

  it('calls UPNG.encode with cnum=0 (lossless auto) and cnum=64 (palette quantize)', async () => {
    await optimizePng(makePngBlob(512));
    // Two encode calls: lossless (cnum=0) and quantized (cnum=64)
    expect(mockEncode).toHaveBeenCalledTimes(2);
    expect(mockEncode).toHaveBeenCalledWith(fakeFrames, 64, 64, 0);
    expect(mockEncode).toHaveBeenCalledWith(fakeFrames, 64, 64, 64);
  });

  it('returns the optimized blob when it is smaller than the original', async () => {
    // fakeReencoded is 200 bytes; input blob is 512 bytes → optimizer wins
    const result = await optimizePng(makePngBlob(512));
    expect(result.size).toBe(200);
    expect(result.type).toBe('image/png');
  });

  it('returns the ORIGINAL blob when both candidates are larger than original', async () => {
    // Make both candidates larger than input
    const bigBuffer = new ArrayBuffer(1024);
    mockEncode.mockReturnValue(bigBuffer);

    const original = makePngBlob(512);
    const result = await optimizePng(original);
    expect(result).toBe(original); // same reference
  });

  it('returns original blob when both candidates are exactly equal to original', async () => {
    const equalBuffer = new ArrayBuffer(512);
    mockEncode.mockReturnValue(equalBuffer);

    const original = makePngBlob(512);
    const result = await optimizePng(original);
    expect(result).toBe(original);
  });

  it('returns the smaller of the two candidates', async () => {
    // First call (lossless): 300 bytes; second call (quantized): 150 bytes
    // Both beat original (512 bytes); quantized wins
    const losslessBuf = new ArrayBuffer(300);
    const quantizedBuf = new ArrayBuffer(150);
    mockEncode
      .mockReturnValueOnce(losslessBuf)
      .mockReturnValueOnce(quantizedBuf);

    const result = await optimizePng(makePngBlob(512));
    expect(result.size).toBe(150);
  });

  it('fires progress callbacks', async () => {
    const calls: number[] = [];
    await optimizePng(makePngBlob(512), (pct) => calls.push(pct));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toBe(100);
  });
});
