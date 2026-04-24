/**
 * Queue processor — drives conversions with configurable concurrency.
 *
 * Concurrency model:
 *  - `start()` / `resume()` enter the running state and begin dispatching
 *    waiting items up to `concurrency` at once.
 *  - `pause()` stops dispatching new items. In-flight conversions are NOT
 *    aborted — canvas operations cannot be cancelled mid-draw. They will
 *    finish normally and their result/error is still written to the store.
 *  - `cancelItem(id)`:
 *      - waiting  → immediately set status to 'cancelled'; never converted.
 *      - processing → a cancellation flag is recorded. The in-flight convert()
 *        call will still resolve/reject (canvas cannot be aborted), but on
 *        completion the item is marked 'cancelled' instead of 'done'/'error'.
 *        This is the documented limitation for in-flight cancel.
 *  - `retryItem(id)` — valid only for 'error' or 'cancelled' status. Resets
 *    the item to 'waiting' and kicks the dispatch loop.
 */

import type { QueueStore } from '@/lib/queue/store';
import type { ConverterFn } from '@/lib/converters/types';
import { convert } from '@/lib/converters/index';
import type { UpscaleServices } from '@/lib/converters/index';

export type { ConverterFn };
export type { UpscaleServices };

export interface ProcessorOptions {
  concurrency: number;
  store: QueueStore;
  /** Defaults to the standard converter dispatcher. Override in tests. */
  convertFn?: ConverterFn;
  /** Optional AI upscale services threaded into each convert() call. */
  upscaleServices?: UpscaleServices;
}

export interface ProcessorState {
  running: boolean;
  active: number;
  queued: number;
}

export type ProcessorListener = (state: ProcessorState) => void;

export interface QueueProcessor {
  start: () => void;
  pause: () => void;
  /** Alias for start; idempotent if already running. */
  resume: () => void;
  cancelItem: (id: string) => void;
  retryItem: (id: string) => void;
  getState: () => ProcessorState;
  subscribe: (listener: ProcessorListener) => () => void;
}

export function createQueueProcessor(opts: ProcessorOptions): QueueProcessor {
  const { store } = opts;
  const convertFn: ConverterFn = opts.convertFn ?? convert;
  const upscaleServices = opts.upscaleServices;

  let concurrency = opts.concurrency;
  let running = false;
  /** Last concurrency value seen from the store, to detect changes. */
  let lastStoreConcurrency = store.getQueueSettings().concurrency;

  /** IDs of items currently being converted. */
  const active = new Set<string>();

  /** IDs that were cancelled while in-flight (processing). */
  const pendingCancel = new Set<string>();

  const listeners = new Set<ProcessorListener>();

  /** Re-entrancy guard for tick(). Prevents cascading dispatch via store notifications. */
  let ticking = false;

  // ── Internal helpers ────────────────────────────────────────────────────────

  function notifyListeners(): void {
    const snap = buildState();
    listeners.forEach(fn => fn(snap));
  }

  function buildState(): ProcessorState {
    const { items } = store.getState();
    const queued = items.filter(i => i.status === 'waiting').length;
    return { running, active: active.size, queued };
  }

  /**
   * Core dispatch loop. Called after start/resume, and after each item
   * finishes. Picks waiting items up to the concurrency limit and starts them.
   *
   * Re-entrancy guard: store mutations inside processItem (setStatus etc.) fire
   * the store subscriber which calls tick() again. The guard prevents the
   * re-entrant call from double-dispatching while the outer tick loop is still
   * running.
   */
  function tick(): void {
    if (!running) return;
    if (ticking) return;

    ticking = true;
    try {
      // Re-read waiting items on each iteration so we see the latest state.
      let slots = concurrency - active.size;
      while (slots > 0) {
        const { items } = store.getState();
        const next = items.find(i => i.status === 'waiting');
        if (!next) break;
        processItem(next.id);
        slots = concurrency - active.size;
      }
    } finally {
      ticking = false;
    }
  }

  function processItem(id: string): void {
    active.add(id);
    store.setStatus(id, 'processing');
    store.setProgress(id, 0);
    notifyListeners();

    // Snapshot the item's current settings at dispatch time.
    const storeState = store.getState();
    const item = storeState.items.find(i => i.id === id);
    if (!item) {
      active.delete(id);
      notifyListeners();
      tick();
      return;
    }

    convertFn(
      {
        file: item.file,
        settings: item.settings,
        originalDimensions: item.originalDimensions,
      },
      (pct) => store.setProgress(id, pct),
      {
        upscaleServices,
        onUpscaled: (factor) => store.setUpscaledBy(id, factor),
      },
    )
      .then(result => {
        active.delete(id);
        if (pendingCancel.has(id)) {
          // In-flight cancel: conversion finished but caller asked to cancel.
          pendingCancel.delete(id);
          store.setStatus(id, 'cancelled');
        } else {
          store.setResult(id, {
            blob: result.blob,
            outName: result.outName,
            outSize: result.outSize,
          });
          // setResult sets status → 'done' internally
        }
        notifyListeners();
        tick();
      })
      .catch((err: unknown) => {
        active.delete(id);
        if (pendingCancel.has(id)) {
          pendingCancel.delete(id);
          store.setStatus(id, 'cancelled');
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          store.setError(id, msg);
        }
        notifyListeners();
        tick();
      });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  function start(): void {
    if (running) return;
    running = true;
    notifyListeners();
    // Re-subscribe to store so new files added while running also trigger dispatch.
    tick();
  }

  function pause(): void {
    if (!running) return;
    running = false;
    notifyListeners();
    // NOTE: in-flight items keep running; they finish and write results to the
    // store as normal. Pausing only prevents new items from being dispatched.
  }

  function resume(): void {
    start();
  }

  function cancelItem(id: string): void {
    const { items } = store.getState();
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (item.status === 'waiting') {
      store.setStatus(id, 'cancelled');
      notifyListeners();
    } else if (item.status === 'processing') {
      // Flag for cancellation on finish — canvas cannot be aborted mid-draw.
      pendingCancel.add(id);
    }
    // Any other status: no-op (already done/error/cancelled).
  }

  function retryItem(id: string): void {
    const { items } = store.getState();
    const item = items.find(i => i.id === id);
    if (!item) return;
    if (item.status !== 'error' && item.status !== 'cancelled') return;

    // Reset to waiting; clear previous error state.
    store.setStatus(id, 'waiting');
    store.setProgress(id, 0);
    notifyListeners();

    if (running) {
      tick();
    }
  }

  function getState(): ProcessorState {
    return buildState();
  }

  function subscribe(listener: ProcessorListener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  // Kick the tick loop on any store change (new files, settings changes, etc.).
  // Only sync concurrency when the STORE's queueSettings.concurrency changes —
  // not on every notification (which would overwrite the opts.concurrency with
  // the store's default on the very first store mutation).
  store.subscribe(() => {
    const storeConcurrency = store.getQueueSettings().concurrency;
    if (storeConcurrency !== lastStoreConcurrency) {
      lastStoreConcurrency = storeConcurrency;
      concurrency = storeConcurrency;
    }
    if (running) tick();
  });

  return { start, pause, resume, cancelItem, retryItem, getState, subscribe };
}
