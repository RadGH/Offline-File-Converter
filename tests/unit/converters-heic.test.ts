import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock heic2any — dynamic import inside heic.ts
// ---------------------------------------------------------------------------
const fakeDecodedBlob = new Blob([new Uint8Array(512)], { type: 'image/png' });
const mockHeic2Any = vi.fn().mockResolvedValue(fakeDecodedBlob);

vi.mock('heic2any', () => ({ default: mockHeic2Any }));

const { decodeHeic } = await import('@/lib/converters/heic');

function makeHeicFile(name = 'photo.heic'): File {
  return new File([new Uint8Array(1024)], name, { type: 'image/heic' });
}

describe('decodeHeic', () => {
  it('calls heic2any with the file blob and PNG target type', async () => {
    const file = makeHeicFile();
    await decodeHeic(file);
    expect(mockHeic2Any).toHaveBeenCalledWith(
      expect.objectContaining({ blob: file, toType: 'image/png' })
    );
  });

  it('returns a Blob', async () => {
    const result = await decodeHeic(makeHeicFile());
    expect(result).toBeInstanceOf(Blob);
  });

  it('returns the decoded PNG blob from heic2any', async () => {
    const result = await decodeHeic(makeHeicFile());
    expect(result).toBe(fakeDecodedBlob);
  });

  it('handles heic2any returning an array (multiple frames) — returns first', async () => {
    const firstBlob = new Blob([new Uint8Array(256)], { type: 'image/png' });
    const secondBlob = new Blob([new Uint8Array(256)], { type: 'image/png' });
    mockHeic2Any.mockResolvedValueOnce([firstBlob, secondBlob]);

    const result = await decodeHeic(makeHeicFile());
    expect(result).toBe(firstBlob);
  });

  it('propagates errors from heic2any', async () => {
    mockHeic2Any.mockRejectedValueOnce(new Error('HEIC decode failed'));
    await expect(decodeHeic(makeHeicFile())).rejects.toThrow('HEIC decode failed');
  });
});
