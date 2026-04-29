/**
 * Global ambient type declarations for third-party modules that lack
 * published @types packages or need module augmentation.
 */

declare module 'gifenc' {
  export type Palette = number[][];
  export interface QuantizeOptions {
    format?: 'rgb444' | 'rgb565' | 'rgba4444';
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    oneBitAlpha?: boolean | number;
    useSqrt?: boolean;
  }
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, count: number, opts?: QuantizeOptions): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb444' | 'rgb565' | 'rgba4444'): Uint8Array;
  export interface FrameOptions {
    palette?: Palette;
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  }
  export interface GifEncoderHandle {
    writeFrame(indexed: Uint8Array, w: number, h: number, opts?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    readonly buffer: ArrayBuffer;
  }
  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GifEncoderHandle;
  const _default: typeof GIFEncoder;
  export default _default;
}

