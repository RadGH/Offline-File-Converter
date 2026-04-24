import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';

// ---------------------------------------------------------------------------
// Mock gif.js — dynamic import inside gif.ts
// ---------------------------------------------------------------------------

type GifEventHandler = (arg?: unknown) => void;

interface MockGifEncoder {
  addFrame: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  _handlers: Record<string, GifEventHandler[]>;
}

let mockGifInstance: MockGifEncoder;

// Factory that creates a mock GIF instance and auto-fires 'finished' on render()
function makeMockGif(): MockGifEncoder {
  const instance: MockGifEncoder = {
    addFrame: vi.fn(),
    render: vi.fn(),
    on: vi.fn(),
    _handlers: {},
  };

  // Capture event listeners
  instance.on.mockImplementation((event: string, fn: GifEventHandler) => {
    instance._handlers[event] = instance._handlers[event] ?? [];
    instance._handlers[event].push(fn);
    return instance;
  });

  // When render() is called, fire 'progress' then 'finished'
  instance.render.mockImplementation(() => {
    const fakeBlob = new Blob([new Uint8Array(256)], { type: 'image/gif' });
    // Fire progress at 0.5 then finished
    (instance._handlers['progress'] ?? []).forEach(fn => fn(0.5));
    (instance._handlers['finished'] ?? []).forEach(fn => fn(fakeBlob));
  });

  return instance;
}

// Mock constructor
const MockGIFClass = vi.fn().mockImplementation(() => {
  mockGifInstance = makeMockGif();
  return mockGifInstance;
});

vi.mock('gif.js', () => ({ default: MockGIFClass }));

// Stub ImageData (not available in jsdom)
class MockImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(data: Uint8ClampedArray | number, width?: number, height?: number) {
    if (typeof data === 'number') {
      this.width = data;
      this.height = width ?? data;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = data;
      this.width = width ?? 0;
      this.height = height ?? 0;
    }
  }
}
vi.stubGlobal('ImageData', MockImageData);

// Mock createImageBitmap
const mockBitmap: ImageBitmap = { width: 64, height: 64, close: vi.fn() };
vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext(_type: string) {
    return {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(
        new MockImageData(new Uint8ClampedArray(64 * 64 * 4), 64, 64)
      ),
    };
  }
}
vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

const { convertToGif } = await import('@/lib/converters/gif');

function makeFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(32)], name, { type });
}

function makeInput(overrides: Partial<ConversionInput['settings']> = {}): ConversionInput {
  return {
    file: makeFile(),
    settings: {
      format: 'gif',
      quality: 80,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      pngOptimize: false,
      upscale: false,
      ...overrides,
    },
  };
}

describe('convertToGif', () => {
  beforeEach(() => {
    MockGIFClass.mockClear();
    (mockBitmap.close as ReturnType<typeof vi.fn>).mockClear();
  });

  it('calls encoder.render()', async () => {
    await convertToGif(makeInput());
    expect(mockGifInstance.render).toHaveBeenCalledOnce();
  });

  it('calls addFrame with an ImageData object', async () => {
    await convertToGif(makeInput());
    expect(mockGifInstance.addFrame).toHaveBeenCalledOnce();
    const [frame] = mockGifInstance.addFrame.mock.calls[0];
    // MockImageData is stubbed as the global ImageData in this test context
    expect(frame).toBeInstanceOf(MockImageData);
  });

  it('returns a blob with MIME image/gif', async () => {
    const result = await convertToGif(makeInput());
    expect(result.blob.type).toBe('image/gif');
  });

  it('output filename has .gif extension', async () => {
    const result = await convertToGif(makeInput());
    expect(result.outName).toBe('photo.gif');
  });

  it('output format field is gif', async () => {
    const result = await convertToGif(makeInput());
    expect(result.outFormat).toBe('gif');
  });

  it('maps quality 80 to low gifQuality (higher slider = better quality = lower gif.js value)', async () => {
    await convertToGif(makeInput({ quality: 80 }));
    const [opts] = MockGIFClass.mock.calls[0];
    // quality=80 → gifQuality = max(1, round(30 - (80/100)*29)) = max(1, round(7.2)) = 7
    expect(opts.quality).toBe(7);
  });

  it('maps quality 1 to gifQuality 30 (worst quality = fastest)', async () => {
    await convertToGif(makeInput({ quality: 1 }));
    const [opts] = MockGIFClass.mock.calls[0];
    expect(opts.quality).toBe(30);
  });

  it('maps quality 100 to gifQuality 1 (best quality)', async () => {
    await convertToGif(makeInput({ quality: 100 }));
    const [opts] = MockGIFClass.mock.calls[0];
    expect(opts.quality).toBe(1);
  });

  it('initial onProgress fires at 10', async () => {
    const calls: number[] = [];
    await convertToGif(makeInput(), (pct) => calls.push(pct));
    expect(calls[0]).toBe(10);
  });

  it('final onProgress fires at 100', async () => {
    const calls: number[] = [];
    await convertToGif(makeInput(), (pct) => calls.push(pct));
    expect(calls[calls.length - 1]).toBe(100);
  });

  it('outSize matches blob size', async () => {
    const result = await convertToGif(makeInput());
    expect(result.outSize).toBe(256);
  });
});
