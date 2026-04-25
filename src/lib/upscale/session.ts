/**
 * ONNX Runtime Web session lifecycle for the upscale model.
 *
 * - Dynamically imports onnxruntime-web so it stays out of the main bundle.
 * - Reads model bytes from IndexedDB via getCachedModelBytes().
 * - Chooses executionProviders based on detectCapability().
 * - Caches the InferenceSession in-module.
 *
 * WebGPU notes:
 *   The previous Swin2SR-Classical INT8 model contained DepthToSpace ops that
 *   have incomplete WebGPU kernel coverage in ORT, causing a null-deref
 *   ("Cannot read properties of null (reading 'Nd')"). The replacement
 *   Swin2SR-Realworld uint8 model does not use DepthToSpace and runs cleanly
 *   on the WebGPU execution provider.
 *
 * WASM multi-threading:
 *   When crossOriginIsolated === true (provided by the COI service worker
 *   registered in main.ts), ORT picks up SharedArrayBuffer and uses real
 *   threads. numThreads is capped at 4 to avoid excessive memory on mobile.
 *   When crossOriginIsolated === false ORT automatically falls back to 1
 *   thread; no warning is emitted.
 *
 * Force-WASM override (dev/testing):
 *   Set localStorage.setItem('upscale.forceWasm', '1') before page load.
 *   Clear with localStorage.removeItem('upscale.forceWasm').
 */

import type * as OrtType from 'onnxruntime-web';
import { detectCapability } from './capability.js';
import { getCachedModelBytes } from './model-cache.js';

// Lazily resolved InferenceSession, shared across calls.
let _session: OrtType.InferenceSession | null = null;
let _sessionPromise: Promise<OrtType.InferenceSession> | null = null;

/**
 * Get (or create) the upscale InferenceSession.
 *
 * The session is created on first call and reused thereafter. If model bytes
 * are not cached, throws an Error — the caller should ensure the model is
 * downloaded before calling this.
 */
export async function getUpscaleSession(): Promise<OrtType.InferenceSession> {
  if (_session !== null) return _session;
  if (_sessionPromise !== null) return _sessionPromise;

  _sessionPromise = _createSession();
  _session = await _sessionPromise;
  return _session;
}

async function _createSession(): Promise<OrtType.InferenceSession> {
  const ort = await import('onnxruntime-web');

  // Point ORT to same-origin WASM files.
  // In production (after `npm run build`), the files are copied to /ort/ by
  // the prebuild script. In development, Vite serves the raw node_modules
  // files; we detect dev mode by checking if import.meta.env.DEV is set.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaEnv = (import.meta as unknown as Record<string, any>).env as Record<string, unknown> | undefined;
  const isDev = metaEnv?.['DEV'] === true;

  if (!isDev) {
    // Production: WASM files are in /ort/.
    ort.env.wasm.wasmPaths = '/ort/';
  }
  // In dev mode, let ORT resolve WASM/mjs paths relative to its own module
  // location in node_modules/onnxruntime-web/dist/ — no override needed.

  ort.env.wasm.proxy = false;

  const bytes = await getCachedModelBytes();
  if (!bytes) {
    throw new Error(
      'Upscale model is not cached. Download the model before running inference.',
    );
  }

  // Dev/testing escape hatch: set localStorage item to force WASM even when
  // WebGPU is available.  Allows comparing execution providers side-by-side.
  const forceWasm =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('upscale.forceWasm') === '1';

  const capability = await detectCapability();

  // WebGPU primary, WASM fallback.
  // The Swin2SR-Realworld model does not use DepthToSpace so the ORT WebGPU
  // backend runs without the null-deref that affected the classical INT8 model.
  const executionProviders: string[] =
    !forceWasm && capability === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];

  // Enable multi-threading when available (requires cross-origin isolation
  // headers — provided by the COI service worker in public/coi-serviceworker.js).
  // If crossOriginIsolated is false, ORT silently falls back to 1 thread.
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency, 4);
  }

  const session = await ort.InferenceSession.create(bytes.buffer as ArrayBuffer, {
    executionProviders,
    graphOptimizationLevel: 'all',
  });

  return session;
}

/**
 * Dispose the cached session and free GPU/WASM memory.
 * A subsequent call to getUpscaleSession() will rebuild from cache.
 */
export async function disposeUpscaleSession(): Promise<void> {
  if (_session !== null) {
    try {
      await _session.release();
    } catch {
      // release() may throw if already disposed — ignore.
    }
    _session = null;
  }
  _sessionPromise = null;
}
