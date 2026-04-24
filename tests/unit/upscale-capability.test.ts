/**
 * Unit tests for capability.ts
 *
 * Tests all branches of detectCapability() using navigator/WebAssembly mocks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { detectCapability, _resetCapabilityCache } from '@/lib/upscale/capability';

// Helper to restore navigator.gpu after each test.
const originalNavigator = global.navigator;

describe('detectCapability', () => {
  beforeEach(() => {
    _resetCapabilityCache();
    // Reset navigator to original state (jsdom has no .gpu).
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('returns "wasm" when WebAssembly is available and navigator.gpu is absent', async () => {
    // jsdom has WebAssembly but no navigator.gpu
    const result = await detectCapability();
    expect(result).toBe('wasm');
  });

  it('caches the result so the second call is synchronous-cheap', async () => {
    const first = await detectCapability();
    const second = await detectCapability();
    expect(first).toBe(second);
  });

  it('returns "webgpu" when navigator.gpu.requestAdapter and requestDevice succeed', async () => {
    const mockDevice = { destroy: vi.fn() };
    const mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
    };
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await detectCapability();
    expect(result).toBe('webgpu');
    expect(mockDevice.destroy).toHaveBeenCalledOnce();
  });

  it('falls back to "wasm" when requestAdapter returns null', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await detectCapability();
    expect(result).toBe('wasm');
  });

  it('falls back to "wasm" when requestDevice throws', async () => {
    const mockAdapter = {
      requestDevice: vi.fn().mockRejectedValue(new Error('device lost')),
    };
    Object.defineProperty(global, 'navigator', {
      value: {
        ...originalNavigator,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await detectCapability();
    expect(result).toBe('wasm');
  });

  it('returns "none" when WebAssembly is unavailable', async () => {
    const savedWasm = (global as Record<string, unknown>).WebAssembly;
    delete (global as Record<string, unknown>).WebAssembly;

    const result = await detectCapability();
    expect(result).toBe('none');

    (global as Record<string, unknown>).WebAssembly = savedWasm;
  });
});
