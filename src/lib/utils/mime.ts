import type { OutputFormat } from '@/lib/queue/store';

export type InputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'heic' | 'gif' | 'bmp';

const MIME_TO_FORMAT: Record<string, InputFormat> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/x-bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
};

const EXT_TO_FORMAT: Record<string, InputFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  heic: 'heic',
  heif: 'heic',
  gif: 'gif',
  bmp: 'bmp',
};

export function detectInputFormat(file: File): InputFormat | null {
  const byMime = MIME_TO_FORMAT[file.type.toLowerCase()];
  if (byMime) return byMime;

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_FORMAT[ext] ?? null;
}

export function isSupportedInput(file: File): boolean {
  return detectInputFormat(file) !== null;
}

export function mimeForOutput(format: OutputFormat): string {
  switch (format) {
    case 'jpeg': return 'image/jpeg';
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'gif':  return 'image/gif';
    case 'gif-animated':  return 'image/gif';
    case 'webp-animated': return 'image/webp';
  }
}

export function extForOutput(format: OutputFormat): string {
  switch (format) {
    case 'jpeg': return 'jpg';
    case 'png':  return 'png';
    case 'webp': return 'webp';
    case 'avif': return 'avif';
    case 'gif':  return 'gif';
    case 'gif-animated':  return 'gif';
    case 'webp-animated': return 'webp';
  }
}
