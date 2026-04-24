import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock upng-js — dynamic import inside png-optimize.ts
// ---------------------------------------------------------------------------
const fakeDecoded = { width: 64, height: 64, depth: 8, ctype: 2, frames: [], tabs: {}, data: new ArrayBuffer(64 * 64 * 4) };
const fakeFrames = [new ArrayBuffer(64 * 64 * 4)];
const fakeReencoded = new ArrayBuffer(200); // smaller than 512-byte input by default

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
    // Default: reencoded is 200 bytes — smaller than the default 512-byte blob
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

  it('calls UPNG.encode with frames, width, height', async () => {
    await optimizePng(makePngBlob(512));
    expect(mockEncode).toHaveBeenCalledWith(fakeFrames, 64, 64, 0);
  });

  it('returns the optimized blob when it is smaller than the original', async () => {
    // fakeReencoded is 200 bytes; input blob is 512 bytes → optimizer wins
    const result = await optimizePng(makePngBlob(512));
    expect(result.size).toBe(200);
    expect(result.type).toBe('image/png');
  });

  it('returns the ORIGINAL blob when optimized version is larger or equal', async () => {
    // Make reencoded larger than input
    const bigBuffer = new ArrayBuffer(1024);
    mockEncode.mockReturnValue(bigBuffer);

    const original = makePngBlob(512);
    const result = await optimizePng(original);
    expect(result).toBe(original); // same reference
  });

  it('returns original blob when sizes are exactly equal', async () => {
    // Equal size → original is returned
    const equalBuffer = new ArrayBuffer(512);
    mockEncode.mockReturnValue(equalBuffer);

    const original = makePngBlob(512);
    const result = await optimizePng(original);
    expect(result).toBe(original);
  });

  it('fires progress callbacks', async () => {
    const calls: number[] = [];
    await optimizePng(makePngBlob(512), (pct) => calls.push(pct));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toBe(100);
  });
});
