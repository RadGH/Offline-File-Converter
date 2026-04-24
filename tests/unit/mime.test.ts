import { describe, it, expect } from 'vitest';
import { detectInputFormat, isSupportedInput } from '@/lib/utils/mime';

function makeFile(name: string, type: string): File {
  return new File([], name, { type });
}

describe('detectInputFormat', () => {
  it('detects jpeg by MIME', () => {
    expect(detectInputFormat(makeFile('photo.jpg', 'image/jpeg'))).toBe('jpeg');
  });

  it('detects jpeg by extension fallback', () => {
    expect(detectInputFormat(makeFile('photo.jpg', ''))).toBe('jpeg');
    expect(detectInputFormat(makeFile('photo.jpeg', ''))).toBe('jpeg');
  });

  it('detects png', () => {
    expect(detectInputFormat(makeFile('img.png', 'image/png'))).toBe('png');
    expect(detectInputFormat(makeFile('img.png', ''))).toBe('png');
  });

  it('detects webp', () => {
    expect(detectInputFormat(makeFile('img.webp', 'image/webp'))).toBe('webp');
    expect(detectInputFormat(makeFile('img.webp', ''))).toBe('webp');
  });

  it('detects avif', () => {
    expect(detectInputFormat(makeFile('img.avif', 'image/avif'))).toBe('avif');
    expect(detectInputFormat(makeFile('img.avif', ''))).toBe('avif');
  });

  it('detects heic by MIME', () => {
    expect(detectInputFormat(makeFile('img.heic', 'image/heic'))).toBe('heic');
    expect(detectInputFormat(makeFile('img.heif', 'image/heif'))).toBe('heic');
  });

  it('detects heic by extension', () => {
    expect(detectInputFormat(makeFile('img.heic', ''))).toBe('heic');
    expect(detectInputFormat(makeFile('img.heif', ''))).toBe('heic');
  });

  it('detects gif', () => {
    expect(detectInputFormat(makeFile('img.gif', 'image/gif'))).toBe('gif');
    expect(detectInputFormat(makeFile('img.gif', ''))).toBe('gif');
  });

  it('detects bmp', () => {
    expect(detectInputFormat(makeFile('img.bmp', 'image/bmp'))).toBe('bmp');
    expect(detectInputFormat(makeFile('img.bmp', ''))).toBe('bmp');
  });

  it('returns null for unsupported MIME with no extension', () => {
    expect(detectInputFormat(makeFile('file.xyz', 'application/octet-stream'))).toBeNull();
  });

  it('returns null for unknown extension', () => {
    expect(detectInputFormat(makeFile('doc.pdf', ''))).toBeNull();
  });
});

describe('isSupportedInput', () => {
  it('returns true for a jpeg file', () => {
    expect(isSupportedInput(makeFile('a.jpg', 'image/jpeg'))).toBe(true);
  });

  it('returns false for a PDF', () => {
    expect(isSupportedInput(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
  });
});
