/**
 * Web Worker for off-main-thread upscaling.
 *
 * Message protocol (in → out):
 *   in:  { id: string; type: 'run';    blob: Blob; scale: 2|4; tileSize?: number }
 *   in:  { id: string; type: 'cancel' }
 *   out: { id: string; type: 'progress'; pct: number }
 *   out: { id: string; type: 'result';   blob: Blob }
 *   out: { id: string; type: 'error';    message: string }
 */

import { runUpscale } from '../upscaler.js';

// Map of active job ids → AbortController so cancel messages can interrupt
// in-progress fetches (the model must already be in IDB by the time the worker
// runs — network fetching doesn't happen here).
const activeJobs = new Map<string, AbortController>();

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'cancel') {
    const ctrl = activeJobs.get(msg.id);
    if (ctrl) {
      ctrl.abort();
      activeJobs.delete(msg.id);
    }
    return;
  }

  if (msg.type === 'run') {
    const { id, blob, scale, tileSize } = msg;
    const ctrl = new AbortController();
    activeJobs.set(id, ctrl);

    try {
      const result = await runUpscale(blob, {
        scale,
        tileSize: tileSize as 256 | 512 | 1024 | undefined,
        onProgress: (pct) => {
          if (ctrl.signal.aborted) return;
          const out: ProgressMessage = { id, type: 'progress', pct };
          self.postMessage(out);
        },
      });

      if (!ctrl.signal.aborted) {
        const out: ResultMessage = { id, type: 'result', blob: result };
        self.postMessage(out, []);
      }
    } catch (err) {
      if (!ctrl.signal.aborted) {
        const message =
          err instanceof Error ? err.message : String(err);
        const out: ErrorMessage = { id, type: 'error', message };
        self.postMessage(out);
      }
    } finally {
      activeJobs.delete(id);
    }
  }
};

// ─── Message types ───────────────────────────────────────────────────────────

interface RunMessage {
  id: string;
  type: 'run';
  blob: Blob;
  scale: 2 | 4;
  tileSize?: number;
}

interface CancelMessage {
  id: string;
  type: 'cancel';
}

type WorkerInMessage = RunMessage | CancelMessage;

interface ProgressMessage {
  id: string;
  type: 'progress';
  pct: number;
}

interface ResultMessage {
  id: string;
  type: 'result';
  blob: Blob;
}

interface ErrorMessage {
  id: string;
  type: 'error';
  message: string;
}

export type WorkerOutMessage = ProgressMessage | ResultMessage | ErrorMessage;
