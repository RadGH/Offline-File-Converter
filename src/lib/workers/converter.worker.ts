/**
 * converter.worker.ts — Heavy codec Web Worker
 *
 * TODO (Phase 6 deferral): Full AVIF/GIF worker integration is deferred.
 *
 * Reason: @jsquash/avif uses Emscripten WASM and requires the codec .wasm
 * file to be co-located or importable from the worker context. Vite's worker
 * bundling (worker.format: 'es') handles this correctly only when the WASM
 * asset URL is statically analysable at build time. The current dynamic
 * import() pattern in avif.ts works on the main thread but does not
 * automatically transfer WASM module references to a worker context without
 * additional `?init` or `?url` Vite query suffixes on the WASM imports inside
 * @jsquash/avif's own code — which we cannot change.
 *
 * gif.js already manages its own Web Worker internally (gif.worker.js),
 * so wrapping it in a second worker would add overhead with no benefit.
 *
 * Current state: AVIF runs on the main thread (async, non-blocking for typical
 * image sizes). GIF uses gif.js's built-in worker. PNG-optimize is sync-ish
 * pure JS wrapped in a microtask yield. All are acceptable for the MVP.
 *
 * When this worker is properly wired up, the message protocol should be:
 *
 * Incoming:
 *   { id: string, kind: 'avif'|'gif', file: ArrayBuffer, filename: string,
 *     settings: PerFileSettings, origDims?: { width: number; height: number } }
 *
 * Outgoing:
 *   { type: 'progress', id: string, pct: number }
 *   { type: 'result', id: string, blob: Blob, outName: string,
 *     outSize: number, outWidth: number, outHeight: number }
 *   { type: 'error', id: string, message: string }
 */

// Placeholder — no-op self to satisfy TypeScript module requirements.
export {};
