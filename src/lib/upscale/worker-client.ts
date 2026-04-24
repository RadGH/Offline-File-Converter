/**
 * Main-thread wrapper for the upscale Web Worker.
 *
 * Creates the worker lazily on first call, manages message IDs, and exposes
 * a promise-based API. Falls back to main-thread runUpscale() if the Worker
 * constructor throws (e.g. test environments, CSP restrictions).
 */

import type { WorkerOutMessage } from './worker/upscale.worker.js';
import type { UpscaleOptions } from './upscaler.js';

type UpscaleWorkerOptions = Omit<UpscaleOptions, 'onProgress'> & {
  onProgress?: (pct: number) => void;
};

let _worker: Worker | null = null;
let _workerFailed = false;

// Pending jobs: id → { resolve, reject, onProgress }
const _pending = new Map<
  string,
  {
    resolve: (blob: Blob) => void;
    reject: (err: Error) => void;
    onProgress?: (pct: number) => void;
  }
>();

function getWorker(): Worker | null {
  if (_workerFailed) return null;
  if (_worker) return _worker;

  try {
    _worker = new Worker(
      new URL('./worker/upscale.worker.ts', import.meta.url),
      { type: 'module' },
    );

    _worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      const job = _pending.get(msg.id);
      if (!job) return;

      if (msg.type === 'progress') {
        job.onProgress?.(msg.pct);
      } else if (msg.type === 'result') {
        _pending.delete(msg.id);
        job.resolve(msg.blob);
      } else if (msg.type === 'error') {
        _pending.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    };

    _worker.onerror = (event) => {
      // Worker crashed — reject all pending, mark failed so future calls
      // fall back to main thread.
      const err = new Error(event.message ?? 'Upscale worker error');
      for (const job of _pending.values()) {
        job.reject(err);
      }
      _pending.clear();
      _worker = null;
      _workerFailed = true;
    };

    // Clean up worker when the page unloads to avoid memory leaks.
    addEventListener('unload', () => _worker?.terminate(), { once: true });
  } catch {
    _workerFailed = true;
    return null;
  }

  return _worker;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Upscale a Blob in a Web Worker.
 *
 * Falls back transparently to main-thread runUpscale() if workers are
 * unavailable (test env, CSP, first-crash).
 */
export async function upscaleInWorker(
  blob: Blob,
  opts: UpscaleWorkerOptions,
): Promise<Blob> {
  const worker = getWorker();

  if (!worker) {
    // Main-thread fallback.
    const { runUpscale } = await import('./upscaler.js');
    return runUpscale(blob, opts);
  }

  const id = generateId();

  return new Promise<Blob>((resolve, reject) => {
    _pending.set(id, { resolve, reject, onProgress: opts.onProgress });

    worker.postMessage({
      id,
      type: 'run',
      blob,
      scale: opts.scale,
      tileSize: opts.tileSize,
    });
  });
}

/**
 * Cancel an in-progress upscale job.
 * The promise will remain pending until the worker acknowledges; the caller
 * should race it against a timeout if needed.
 */
export function cancelUpscale(id: string): void {
  _worker?.postMessage({ id, type: 'cancel' });
}
