/**
 * ONNX Runtime Web session lifecycle for the upscale model.
 *
 * - Dynamically imports onnxruntime-web so it stays out of the main bundle.
 * - Reads model bytes from IndexedDB via getCachedModelBytes().
 * - Chooses executionProviders based on detectCapability().
 * - Caches the InferenceSession in-module.
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
  // When the bundle's import.meta.url contains "node_modules", we know we're
  // in dev mode and let ORT resolve paths relative to its own bundle.
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

  const capability = await detectCapability();
  const executionProviders: string[] =
    capability === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];

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
