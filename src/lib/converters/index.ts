import type { ConversionInput, ConversionResult } from './types';
import { detectInputFormat } from '@/lib/utils/mime';
import { convertViaCanvas } from './canvas';

export type { ConversionInput, ConversionResult };

/**
 * Dispatcher: routes a conversion to the appropriate codec.
 *
 * Phase 4 supports canvas-native output formats: jpeg, png, webp.
 * AVIF and GIF output are reserved for Phase 6 (WASM codecs).
 * HEIC input is reserved for Phase 6 (WASM decoder).
 */
export async function convert(
  input: ConversionInput,
  onProgress?: (pct: number) => void
): Promise<ConversionResult> {
  const { file, settings } = input;

  // Reject HEIC input — Phase 6 will add heic2any / @jsquash/heic
  const inputFormat = detectInputFormat(file);
  if (inputFormat === 'heic') {
    throw new Error('not-yet-supported: heic-input');
  }

  // Route by output format
  const { format } = settings;

  switch (format) {
    case 'jpeg':
    case 'png':
    case 'webp':
      // Canvas API handles these natively in all modern browsers
      return convertViaCanvas(input, onProgress);

    case 'avif':
      // Phase 6: @jsquash/avif via Web Worker
      throw new Error('not-yet-supported: avif');

    case 'gif':
      // Phase 6: gif.js encoder via Web Worker
      throw new Error('not-yet-supported: gif');

    default: {
      // TypeScript exhaustiveness guard
      const _never: never = format;
      throw new Error(`Unknown output format: ${String(_never)}`);
    }
  }
}
