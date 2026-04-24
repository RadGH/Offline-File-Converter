/**
 * Vitest global setup — runs before each test file.
 *
 * jsdom does not expose the Canvas API or ImageData, which are browser
 * globals needed by the tiler tests. We provide a minimal polyfill that
 * covers the Uint8ClampedArray-based ImageData constructor used in tests.
 */

if (typeof ImageData === 'undefined') {
  // Minimal ImageData polyfill for jsdom.
  // Only implements what the tiler tests actually use.
  class ImageDataPolyfill {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;

    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      height?: number,
    ) {
      if (typeof dataOrWidth === 'number') {
        // ImageData(width, height)
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
      } else {
        // ImageData(Uint8ClampedArray, width[, height])
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? dataOrWidth.length / (widthOrHeight * 4);
      }
    }
  }

  (globalThis as unknown as Record<string, unknown>).ImageData = ImageDataPolyfill;
}
