import { describe, it, expect, vi } from 'vitest';
import { createQueueStore } from '@/lib/queue/store';
import { createQueueProcessor } from '@/lib/queue/processor';
import type { ConversionInput, ConversionResult } from '@/lib/converters/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(name: string, type = 'image/jpeg'): File {
  return new File([new Uint8Array(10)], name, { type });
}

function makeResult(name: string): ConversionResult {
  return {
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    outName: name,
    outSize: 1,
    outWidth: 1,
    outHeight: 1,
    outFormat: 'jpeg',
  };
}

/**
 * Creates a controllable convert function.
 * Each call to `convertFn` adds a resolve/reject handle to `resolvers`.
 * Tests call `resolvers[n].resolve()` / `.reject()` to drive completion.
 */
function makeControllableConverter(): {
  convertFn: (input: ConversionInput) => Promise<ConversionResult>;
  resolvers: Array<{ resolve: (r: ConversionResult) => void; reject: (e: Error) => void; input: ConversionInput }>;
} {
  const resolvers: Array<{ resolve: (r: ConversionResult) => void; reject: (e: Error) => void; input: ConversionInput }> = [];

  const convertFn = (input: ConversionInput): Promise<ConversionResult> => {
    return new Promise<ConversionResult>((resolve, reject) => {
      resolvers.push({ resolve, reject, input });
    });
  };

  return { convertFn, resolvers };
}

// ── Store actions used ────────────────────────────────────────────────────────

describe('createQueueProcessor', () => {

  // ── concurrency=1: sequential processing ────────────────────────────────

  it('concurrency=1: processes items one at a time', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    processor.start();

    // Allow microtasks to flush
    await Promise.resolve();

    // Only 1 item should be processing
    expect(store.getState().items.filter(i => i.status === 'processing').length).toBe(1);
    expect(resolvers).toHaveLength(1);

    // Complete the first item
    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    // Now the second should be processing
    expect(resolvers).toHaveLength(2);
    expect(store.getState().items.filter(i => i.status === 'processing').length).toBe(1);

    resolvers[1].resolve(makeResult('b.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    expect(resolvers).toHaveLength(3);
    resolvers[2].resolve(makeResult('c.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().items.every(i => i.status === 'done')).toBe(true);
  });

  // ── concurrency=3: all 3 start in parallel ────────────────────────────────

  it('concurrency=3: starts all 3 items in parallel', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 3, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    processor.start();

    await Promise.resolve();

    // All 3 should have started
    expect(resolvers).toHaveLength(3);
    expect(store.getState().items.filter(i => i.status === 'processing').length).toBe(3);
  });

  // ── pause/resume ────────────────────────────────────────────────────────────

  it('pause stops new items from being dispatched', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    processor.start();
    await Promise.resolve();

    // First item is dispatched
    expect(resolvers).toHaveLength(1);

    processor.pause();

    // Complete item 1 while paused
    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    // No new item should have been picked up (paused)
    expect(resolvers).toHaveLength(1);
    expect(store.getState().items.filter(i => i.status === 'waiting').length).toBe(2);
  });

  it('resume after pause processes remaining items', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    processor.start();
    await Promise.resolve();

    processor.pause();

    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    // Still paused — only 1 item processed
    expect(resolvers).toHaveLength(1);

    processor.resume();
    await Promise.resolve();

    // b should now be dispatched
    expect(resolvers).toHaveLength(2);
    resolvers[1].resolve(makeResult('b.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().items.every(i => i.status === 'done')).toBe(true);
  });

  it('start() is idempotent when already running', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    processor.start();
    await Promise.resolve();
    processor.start(); // second call — should not double-dispatch
    await Promise.resolve();

    expect(resolvers).toHaveLength(1);
  });

  // ── cancelItem ──────────────────────────────────────────────────────────────

  it('cancelItem on waiting → status becomes cancelled, never converted', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    // Do NOT start the processor — cancel while still waiting
    const ids = store.getState().items.filter(i => !i.isSource).map(i => i.id);

    processor.cancelItem(ids[0]);

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('cancelled');
    expect(resolvers).toHaveLength(0); // convertFn was never called
  });

  it('cancelItem on waiting prevents it from being processed when started', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 2, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const ids = store.getState().items.filter(i => !i.isSource).map(i => i.id);

    processor.cancelItem(ids[0]);

    processor.start();
    await Promise.resolve();

    // Only b should have been dispatched
    expect(resolvers).toHaveLength(1);
    const convs = store.getState().items.filter(i => !i.isSource);
    expect(convs.find(i => i.id === ids[0])?.status).toBe('cancelled');
    expect(convs.find(i => i.id === ids[1])?.status).toBe('processing');
  });

  it('cancelItem on processing: item completes but status is cancelled (documented in-flight limitation)', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    processor.start();
    await Promise.resolve();

    expect(resolvers).toHaveLength(1);
    const id = store.getState().items.find(i => !i.isSource)!.id;

    // Cancel while in-flight
    processor.cancelItem(id);

    // Resolve the underlying conversion (it completes, but result is discarded)
    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    // Status should be cancelled, not done
    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('cancelled');
  });

  // ── retryItem ───────────────────────────────────────────────────────────────

  it('retryItem on errored → resets to waiting and processor picks it up', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    processor.start();
    await Promise.resolve();

    const id = store.getState().items.find(i => !i.isSource)!.id;

    // Fail the conversion
    resolvers[0].reject(new Error('boom'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('error');

    // Retry
    processor.retryItem(id);
    await Promise.resolve();

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('processing');
    expect(resolvers).toHaveLength(2);

    resolvers[1].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('done');
  });

  it('retryItem on cancelled → resets to waiting', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers: _resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    processor.cancelItem(id);

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('cancelled');

    processor.start();
    processor.retryItem(id);
    await Promise.resolve();

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('processing');
  });

  it('retryItem on done → no-op (status stays done)', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    processor.start();
    await Promise.resolve();

    const id = store.getState().items.find(i => !i.isSource)!.id;
    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('done');

    processor.retryItem(id); // should be no-op
    await Promise.resolve();

    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('done');
    // convertFn was not called again
    expect(resolvers).toHaveLength(1);
  });

  // ── store mutations ─────────────────────────────────────────────────────────

  it('calls setStatus, setProgress, setResult correctly on success', async () => {
    const store = createQueueStore();
    const setStatusSpy = vi.spyOn(store, 'setStatus');
    const setProgressSpy = vi.spyOn(store, 'setProgress');
    const setResultSpy = vi.spyOn(store, 'setResult');

    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    processor.start();
    await Promise.resolve();

    expect(setStatusSpy).toHaveBeenCalledWith(id, 'processing');
    expect(setProgressSpy).toHaveBeenCalledWith(id, 0);

    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    expect(setResultSpy).toHaveBeenCalledWith(id, expect.objectContaining({ outName: 'a.jpg' }));
  });

  it('calls setError correctly on failure', async () => {
    const store = createQueueStore();
    const setErrorSpy = vi.spyOn(store, 'setError');

    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    processor.start();
    await Promise.resolve();

    resolvers[0].reject(new Error('test error'));
    await Promise.resolve();
    await Promise.resolve();

    expect(setErrorSpy).toHaveBeenCalledWith(id, 'test error');
  });

  // ── getState() ──────────────────────────────────────────────────────────────

  it('getState() returns accurate running/active/queued counts', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 2, store, convertFn });

    expect(processor.getState()).toEqual({ running: false, active: 0, queued: 0 });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);

    expect(processor.getState()).toEqual({ running: false, active: 0, queued: 3 });

    processor.start();
    await Promise.resolve();

    const state = processor.getState();
    expect(state.running).toBe(true);
    expect(state.active).toBe(2);
    expect(state.queued).toBe(1);

    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    // one done, one still active, one moved from queued to active
    expect(processor.getState().active).toBe(2);
    expect(processor.getState().queued).toBe(0);
  });

  // ── subscribe ────────────────────────────────────────────────────────────────

  it('subscribe/unsubscribe fires on state changes', async () => {
    const store = createQueueStore();
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    const listener = vi.fn();
    const unsub = processor.subscribe(listener);

    processor.start();
    expect(listener).toHaveBeenCalledTimes(1);

    store.addFiles([makeFile('a.jpg')]);
    await Promise.resolve();
    // store.subscribe triggers tick, then processItem calls notifyListeners
    expect(listener.mock.calls.length).toBeGreaterThan(1);

    unsub();
    const callsBefore = listener.mock.calls.length;
    resolvers[0].resolve(makeResult('a.jpg'));
    await Promise.resolve();
    await Promise.resolve();

    // After unsubscribe, no more calls
    expect(listener.mock.calls.length).toBe(callsBefore);
  });

  // ── concurrency sync from store ──────────────────────────────────────────────

  it('respects updated concurrency from store queueSettings', async () => {
    const store = createQueueStore();
    store.setQueueSettings({ concurrency: 1 });
    const { convertFn, resolvers } = makeControllableConverter();
    const processor = createQueueProcessor({ concurrency: 1, store, convertFn });

    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    processor.start();
    await Promise.resolve();

    // With concurrency=1, only 1 item is processing
    expect(resolvers).toHaveLength(1);

    // Now increase concurrency to 3 via store
    store.setQueueSettings({ concurrency: 3 });
    await Promise.resolve();

    // Should have dispatched more items
    expect(resolvers.length).toBeGreaterThan(1);
  });
});
