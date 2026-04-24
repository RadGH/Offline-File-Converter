/**
 * WebGPU / WASM capability detection for the upscale pipeline.
 * Result is cached in-module — subsequent calls are synchronous-fast.
 */

export type UpscaleCapability = 'webgpu' | 'wasm' | 'none';

let _cached: UpscaleCapability | null = null;

/**
 * Detect the best available execution provider.
 *
 * Order: WebGPU → WASM → none.
 * WebGPU requires a real GPU adapter *and* device — Safari/Firefox stubs that
 * expose navigator.gpu but refuse requestAdapter() are correctly detected as
 * WASM-only.
 */
export async function detectCapability(): Promise<UpscaleCapability> {
  if (_cached !== null) return _cached;

  // 1. Try WebGPU
  if (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    navigator.gpu != null
  ) {
    try {
      // navigator.gpu is typed as GPU in lib.dom.d.ts but not all TS versions
      // include it; access via any to avoid "does not exist" errors on older
      // TS dom lib builds.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = navigator.gpu as any;
      const adapter = await gpu.requestAdapter() as unknown;
      if (adapter != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const device = await (adapter as any).requestDevice() as { destroy(): void };
        // Immediately destroy — we only need to prove it works.
        device.destroy();
        _cached = 'webgpu';
        return _cached;
      }
    } catch {
      // Adapter or device request failed — fall through to WASM.
    }
  }

  // 2. Try WASM (SharedArrayBuffer not required for single-threaded WASM)
  if (typeof WebAssembly !== 'undefined') {
    _cached = 'wasm';
    return _cached;
  }

  // 3. Nothing usable.
  _cached = 'none';
  return _cached;
}

/** Reset cached result. Useful in tests. */
export function _resetCapabilityCache(): void {
  _cached = null;
}
