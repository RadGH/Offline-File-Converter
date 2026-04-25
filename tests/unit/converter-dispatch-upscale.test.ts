/**
 * Unit tests for the upscale step inside the convert() dispatcher.
 *
 * UpscaleServices are mocked — no ONNX / model bytes required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConversionInput } from '@/lib/converters/types';
import type { UpscaleServices } from '@/lib/converters/index';

// ---------------------------------------------------------------------------
// Mock all codec dependencies so the test is fast / deterministic.
// ---------------------------------------------------------------------------

const mockConvertViaCanvas = vi.fn().mockResolvedValue({
  blob: new Blob(['canvas-data'], { type: 'image/jpeg' }),
  outName: 'out.jpg',
  outSize: 11,
  outWidth: 100,
  outHeight: 80,
  outFormat: 'jpeg',
});

vi.mock('@/lib/converters/canvas', () => ({
  convertViaCanvas: mockConvertViaCanvas,
}));

vi.mock('@/lib/converters/avif', () => ({
  convertToAvif: vi.fn().mockResolvedValue({
    blob: new Blob(['avif'], { type: 'image/avif' }),
    outName: 'out.avif',
    outSize: 4,
    outWidth: 100,
    outHeight: 80,
    outFormat: 'avif',
  }),
}));

vi.mock('@/lib/converters/gif', () => ({
  convertToGif: vi.fn().mockResolvedValue({
    blob: new Blob(['gif'], { type: 'image/gif' }),
    outName: 'out.gif',
    outSize: 3,
    outWidth: 100,
    outHeight: 80,
    outFormat: 'gif',
  }),
}));

vi.mock('@/lib/converters/heic', () => ({
  decodeHeic: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
}));

vi.mock('@/lib/converters/png-optimize', () => ({
  optimizePng: vi.fn().mockImplementation((b: Blob) => Promise.resolve(b)),
}));

const { convert } = await import('@/lib/converters/index');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(64)], name, { type });
}

function makeInput(
  overrides: Partial<ConversionInput['settings']> = {},
  originalDimensions?: { width: number; height: number },
): ConversionInput {
  return {
    file: makeFile(),
    settings: {
      format: 'jpeg',
      quality: 85,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      upscale: false,
      preserveOrientation: false,
      resample: 'high' as const,
      dimensionUnit: 'px' as const,
      ...overrides,
    },
    originalDimensions,
  };
}

function makeUpscaleServices(modelReady = true): {
  services: UpscaleServices;
  runUpscaleMock: ReturnType<typeof vi.fn>;
} {
  const upscaledBlob = new Blob(['upscaled'], { type: 'image/jpeg' });
  const runUpscaleMock = vi.fn().mockResolvedValue(upscaledBlob);
  return {
    services: {
      isModelReady: () => modelReady,
      runUpscale: runUpscaleMock,
    },
    runUpscaleMock,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockConvertViaCanvas.mockClear();
});

describe('convert() — upscale integration', () => {
  it('skips upscale when settings.upscale is false', async () => {
    const { services, runUpscaleMock } = makeUpscaleServices(true);
    await convert(
      makeInput({ upscale: false, width: 1000, height: 800 }, { width: 200, height: 160 }),
      undefined,
      { upscaleServices: services },
    );
    expect(runUpscaleMock).not.toHaveBeenCalled();
  });

  it('skips upscale when model is not ready', async () => {
    const { services, runUpscaleMock } = makeUpscaleServices(false);
    await convert(
      makeInput({ upscale: true, width: 1000, height: 800 }, { width: 200, height: 160 }),
      undefined,
      { upscaleServices: services },
    );
    expect(runUpscaleMock).not.toHaveBeenCalled();
  });

  it('skips upscale when no upscaleServices provided', async () => {
    await convert(
      makeInput({ upscale: true, width: 1000, height: 800 }, { width: 200, height: 160 }),
    );
    // Just checking it doesn't throw and canvas is called
    expect(mockConvertViaCanvas).toHaveBeenCalledTimes(1);
  });

  it('runs upscale whenever upscale=true and model ready, regardless of target size', async () => {
    const { services, runUpscaleMock } = makeUpscaleServices(true);
    // target is smaller than source — we still run upscale because the user opted in
    await convert(
      makeInput({ upscale: true, width: 100, height: 80 }, { width: 200, height: 160 }),
      undefined,
      { upscaleServices: services },
    );
    expect(runUpscaleMock).toHaveBeenCalledTimes(1);
  });

  it('always calls runUpscale with the model native factor of 4', async () => {
    const { services, runUpscaleMock } = makeUpscaleServices(true);
    await convert(
      makeInput({ upscale: true, width: 400, height: 320 }, { width: 200, height: 160 }),
      undefined,
      { upscaleServices: services },
    );
    expect(runUpscaleMock).toHaveBeenCalledWith(expect.any(File), 4, expect.any(Function));
  });

  it('calls onUpscaled with factor=4 on every upscale', async () => {
    const { services } = makeUpscaleServices(true);
    const onUpscaled = vi.fn();
    await convert(
      makeInput({ upscale: true, width: 800, height: 640 }, { width: 200, height: 160 }),
      undefined,
      { upscaleServices: services, onUpscaled },
    );
    expect(onUpscaled).toHaveBeenCalledWith(4);
  });

  it('does not call onUpscaled when upscale is unchecked', async () => {
    const { services } = makeUpscaleServices(true);
    const onUpscaled = vi.fn();
    await convert(
      makeInput({ upscale: false, width: 800, height: 640 }, { width: 200, height: 160 }),
      undefined,
      { upscaleServices: services, onUpscaled },
    );
    expect(onUpscaled).not.toHaveBeenCalled();
  });

  it('still upscales even when originalDimensions are unknown', async () => {
    const { services, runUpscaleMock } = makeUpscaleServices(true);
    await convert(
      makeInput({ upscale: true, width: 800, height: 640 }),
      undefined,
      { upscaleServices: services },
    );
    expect(runUpscaleMock).toHaveBeenCalledTimes(1);
  });

  it('propagates the error (no silent fallback) when runUpscale throws', async () => {
    const services: UpscaleServices = {
      isModelReady: () => true,
      runUpscale: vi.fn().mockRejectedValue(new Error('ORT crash')),
    };
    await expect(
      convert(
        makeInput({ upscale: true, width: 800, height: 640 }, { width: 200, height: 160 }),
        undefined,
        { upscaleServices: services },
      ),
    ).rejects.toThrow('ORT crash');
  });
});
