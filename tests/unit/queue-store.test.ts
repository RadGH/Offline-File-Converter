import { describe, it, expect, vi } from 'vitest';
import { createQueueStore } from '@/lib/queue/store';
import type { UpscaleModelStatus } from '@/lib/queue/store';

function makeFile(name: string, type = 'image/jpeg'): File {
  return new File([new Uint8Array(10)], name, { type });
}

describe('createQueueStore', () => {
  it('starts with empty items', () => {
    const store = createQueueStore();
    expect(store.getState().items).toHaveLength(0);
  });

  it('addFiles creates items in waiting status', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.png', 'image/png')]);
    const convs = store.getState().items.filter(i => !i.isSource);
    expect(convs).toHaveLength(2);
    expect(convs[0].status).toBe('waiting');
    expect(convs[1].status).toBe('waiting');
    expect(convs[0].progress).toBe(0);
  });

  it('addFiles rejects non-image files', () => {
    const store = createQueueStore();
    store.addFiles([
      makeFile('doc.pdf', 'application/pdf'),
      makeFile('img.jpg', 'image/jpeg'),
    ]);
    const sources = store.getState().items.filter(i => i.isSource);
    expect(sources).toHaveLength(1);
    expect(sources[0].file.name).toBe('img.jpg');
  });

  it('addFiles generates unique IDs', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const ids = store.getState().items.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('addFiles uses globalDefaults for settings', () => {
    const store = createQueueStore();
    store.setGlobalDefaults({ format: 'webp', quality: 70 });
    store.addFiles([makeFile('a.jpg')]);
    const conv = store.getState().items.find(i => !i.isSource)!;
    expect(conv.settings.format).toBe('webp');
    expect(conv.settings.quality).toBe(70);
  });

  it('removeFile of a source removes its conversion children too', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const sources = store.getState().items.filter(i => i.isSource);
    store.removeFile(sources[0].id);
    const remaining = store.getState().items;
    expect(remaining.find(i => i.file.name === 'a.jpg')).toBeUndefined();
    expect(remaining.find(i => i.file.name === 'b.jpg')).toBeDefined();
  });

  it('clearCompleted only removes done conversion items (sources persist)', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    const convs = store.getState().items.filter(i => !i.isSource);
    store.setStatus(convs[0].id, 'done');
    store.setStatus(convs[2].id, 'error');
    store.clearCompleted();
    const remaining = store.getState().items;
    // 3 sources still present; among conversions: 'a' (done) is removed,
    // 'b' (waiting) and 'c' (error) remain.
    const remainingConvs = remaining.filter(i => !i.isSource);
    expect(remainingConvs.find(i => i.file.name === 'a.jpg')).toBeUndefined();
    expect(remainingConvs.find(i => i.file.name === 'b.jpg')).toBeDefined();
    expect(remainingConvs.find(i => i.file.name === 'c.jpg')).toBeDefined();
    expect(remaining.filter(i => i.isSource)).toHaveLength(3);
  });

  it('clearAll removes all items', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    store.clearAll();
    expect(store.getState().items).toHaveLength(0);
  });

  it('updateFileSettings merges settings', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    store.updateFileSettings(id, { format: 'png', quality: 90 });
    const item = store.getState().items.find(i => !i.isSource)!;
    expect(item.settings.format).toBe('png');
    expect(item.settings.quality).toBe(90);
    // other settings remain
    expect(item.settings.maintainAspect).toBe(true);
  });

  it('setStatus updates status', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    store.setStatus(id, 'processing');
    expect(store.getState().items.find(i => !i.isSource)!.status).toBe('processing');
  });

  it('setProgress updates progress', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    store.setProgress(id, 50);
    expect(store.getState().items.find(i => !i.isSource)!.progress).toBe(50);
  });

  it('setResult marks item done with result', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    store.setResult(id, { blob, outName: 'a.jpg', outSize: 4 });
    const item = store.getState().items.find(i => !i.isSource)!;
    expect(item.status).toBe('done');
    expect(item.progress).toBe(100);
    expect(item.result?.outName).toBe('a.jpg');
  });

  it('setError marks item errored', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    store.setError(id, 'Conversion failed');
    const item = store.getState().items.find(i => !i.isSource)!;
    expect(item.status).toBe('error');
    expect(item.error).toBe('Conversion failed');
  });

  it('subscribers fire on mutations', () => {
    const store = createQueueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.addFiles([makeFile('a.jpg')]);
    expect(listener).toHaveBeenCalledTimes(1);
    store.clearAll();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops further notifications', () => {
    const store = createQueueStore();
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.addFiles([makeFile('a.jpg')]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    store.clearAll();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setGlobalDefaults updates defaults without affecting existing items', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const originalFormat = store.getState().items.find(i => !i.isSource)!.settings.format;
    store.setGlobalDefaults({ format: 'webp' });
    // existing item unchanged
    expect(store.getState().items.find(i => !i.isSource)!.settings.format).toBe(originalFormat);
    // new items use new defaults
    store.addFiles([makeFile('b.jpg')]);
    expect(store.getState().items[1].settings.format).toBe('webp');
  });

  it('getGlobalDefaults returns current defaults', () => {
    const store = createQueueStore();
    store.setGlobalDefaults({ quality: 60 });
    expect(store.getGlobalDefaults().quality).toBe(60);
  });

  it('setOriginalDimensions stores dimensions on the item', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    expect(store.getState().items.find(i => !i.isSource)!.originalDimensions).toBeUndefined();
    store.setOriginalDimensions(id, { width: 1920, height: 1080 });
    const item = store.getState().items.find(i => !i.isSource)!;
    expect(item.originalDimensions).toEqual({ width: 1920, height: 1080 });
  });

  it('setOriginalDimensions does not affect other items', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const convs = store.getState().items.filter(i => !i.isSource);
    const [convA, convB] = convs;
    store.setOriginalDimensions(convA.id, { width: 800, height: 600 });
    expect(store.getState().items.find(i => i.id === convA.id)?.originalDimensions).toEqual({ width: 800, height: 600 });
    expect(store.getState().items.find(i => i.id === convB.id)?.originalDimensions).toBeUndefined();
  });

  it('setOriginalDimensions notifies subscribers', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    const listener = vi.fn();
    store.subscribe(listener);
    store.setOriginalDimensions(id, { width: 640, height: 480 });
    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0] as ReturnType<typeof store.getState>;
    expect(state.items.find(i => !i.isSource)!.originalDimensions).toEqual({ width: 640, height: 480 });
  });

  it('setOriginalDimensions can be called multiple times (overwrite)', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    store.setOriginalDimensions(id, { width: 100, height: 100 });
    store.setOriginalDimensions(id, { width: 200, height: 150 });
    expect(store.getState().items.find(i => !i.isSource)!.originalDimensions).toEqual({ width: 200, height: 150 });
  });
});

describe('queueSettings', () => {
  it('has default concurrency=2 and autoStart=true', () => {
    const store = createQueueStore();
    const settings = store.getQueueSettings();
    expect(settings.concurrency).toBe(2);
    expect(settings.autoStart).toBe(true);
  });

  it('getQueueSettings returns current settings with defaults', () => {
    // Clear localStorage to avoid cross-test contamination
    localStorage.removeItem('converter.queueSettings.v1');
    const store = createQueueStore();
    expect(store.getQueueSettings()).toEqual({ concurrency: 2, autoStart: true, mode: 'auto' });
  });

  it('setQueueSettings updates concurrency', () => {
    const store = createQueueStore();
    store.setQueueSettings({ concurrency: 4 });
    expect(store.getQueueSettings().concurrency).toBe(4);
  });

  it('setQueueSettings updates autoStart', () => {
    const store = createQueueStore();
    store.setQueueSettings({ autoStart: false });
    expect(store.getQueueSettings().autoStart).toBe(false);
  });

  it('setQueueSettings merges partial patch (does not wipe other fields)', () => {
    // Clear localStorage to avoid cross-test contamination
    localStorage.removeItem('converter.queueSettings.v1');
    const store = createQueueStore();
    store.setQueueSettings({ concurrency: 5 });
    expect(store.getQueueSettings().autoStart).toBe(true); // unchanged
    store.setQueueSettings({ autoStart: false });
    expect(store.getQueueSettings().concurrency).toBe(5); // unchanged
  });

  it('setQueueSettings is reflected in getState()', () => {
    const store = createQueueStore();
    store.setQueueSettings({ concurrency: 3 });
    expect(store.getState().queueSettings.concurrency).toBe(3);
  });

  it('setQueueSettings notifies subscribers', () => {
    const store = createQueueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setQueueSettings({ concurrency: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0] as ReturnType<typeof store.getState>;
    expect(state.queueSettings.concurrency).toBe(1);
  });

  it('setQueueSettings clamps to valid range (store does not enforce, but default is reasonable)', () => {
    const store = createQueueStore();
    store.setQueueSettings({ concurrency: 8 });
    expect(store.getQueueSettings().concurrency).toBe(8);
    store.setQueueSettings({ concurrency: 1 });
    expect(store.getQueueSettings().concurrency).toBe(1);
  });
});

// ── Upscale-related store additions ─────────────────────────────────────────

describe('PerFileSettings.upscale default', () => {
  it('new files default to upscale=false', () => {
    const store = createQueueStore();
    store.addFiles([new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' })]);
    expect(store.getState().items.find(i => !i.isSource)!.settings.upscale).toBe(false);
  });

  it('globalDefaults has upscale=false by default', () => {
    const store = createQueueStore();
    expect(store.getGlobalDefaults().upscale).toBe(false);
  });

  it('setGlobalDefaults propagates upscale to new files', () => {
    const store = createQueueStore();
    store.setGlobalDefaults({ upscale: true });
    store.addFiles([new File([new Uint8Array(10)], 'b.jpg', { type: 'image/jpeg' })]);
    expect(store.getState().items.find(i => !i.isSource)!.settings.upscale).toBe(true);
  });
});

describe('modelStatus', () => {
  it('defaults to { kind: "unknown" }', () => {
    const store = createQueueStore();
    expect(store.getModelStatus()).toEqual({ kind: 'unknown' });
  });

  it('setModelStatus transitions to absent', () => {
    const store = createQueueStore();
    store.setModelStatus({ kind: 'absent' });
    expect(store.getModelStatus()).toEqual({ kind: 'absent' });
  });

  it('setModelStatus transitions to downloading with progress', () => {
    const store = createQueueStore();
    store.setModelStatus({ kind: 'downloading', loaded: 4_000_000, total: 19_000_000 });
    const status = store.getModelStatus() as Extract<UpscaleModelStatus, { kind: 'downloading' }>;
    expect(status.kind).toBe('downloading');
    expect(status.loaded).toBe(4_000_000);
    expect(status.total).toBe(19_000_000);
  });

  it('setModelStatus transitions to verifying', () => {
    const store = createQueueStore();
    store.setModelStatus({ kind: 'verifying' });
    expect(store.getModelStatus().kind).toBe('verifying');
  });

  it('setModelStatus transitions to ready with loadedAt', () => {
    const store = createQueueStore();
    const ts = Date.now();
    store.setModelStatus({ kind: 'ready', loadedAt: ts });
    const status = store.getModelStatus() as Extract<UpscaleModelStatus, { kind: 'ready' }>;
    expect(status.kind).toBe('ready');
    expect(status.loadedAt).toBe(ts);
  });

  it('setModelStatus transitions to error with reason', () => {
    const store = createQueueStore();
    store.setModelStatus({ kind: 'error', reason: 'Network error' });
    const status = store.getModelStatus() as Extract<UpscaleModelStatus, { kind: 'error' }>;
    expect(status.kind).toBe('error');
    expect(status.reason).toBe('Network error');
  });

  it('setModelStatus notifies subscribers', () => {
    const store = createQueueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setModelStatus({ kind: 'absent' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('getState includes modelStatus', () => {
    const store = createQueueStore();
    store.setModelStatus({ kind: 'ready', loadedAt: 1 });
    expect(store.getState().modelStatus).toEqual({ kind: 'ready', loadedAt: 1 });
  });
});

describe('upscaleCapability', () => {
  it('defaults to "unknown"', () => {
    const store = createQueueStore();
    expect(store.getUpscaleCapability()).toBe('unknown');
  });

  it('setUpscaleCapability updates and notifies', () => {
    const store = createQueueStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setUpscaleCapability('webgpu');
    expect(store.getUpscaleCapability()).toBe('webgpu');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('getState includes upscaleCapability', () => {
    const store = createQueueStore();
    store.setUpscaleCapability('wasm');
    expect(store.getState().upscaleCapability).toBe('wasm');
  });
});

describe('setUpscaledBy', () => {
  it('sets upscaledBy on the correct item', () => {
    const store = createQueueStore();
    store.addFiles([
      new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(10)], 'b.jpg', { type: 'image/jpeg' }),
    ]);
    const convs = store.getState().items.filter(i => !i.isSource);
    const id = convs[0].id;
    store.setUpscaledBy(id, 4);
    expect(store.getState().items.find(i => i.id === id)?.upscaledBy).toBe(4);
    expect(store.getState().items.find(i => i.id === convs[1].id)?.upscaledBy).toBeUndefined();
  });

  it('supports factor 2', () => {
    const store = createQueueStore();
    store.addFiles([new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    store.setUpscaledBy(id, 2);
    expect(store.getState().items.find(i => !i.isSource)!.upscaledBy).toBe(2);
  });

  it('notifies subscribers', () => {
    const store = createQueueStore();
    store.addFiles([new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' })]);
    const id = store.getState().items.find(i => !i.isSource)!.id;
    const listener = vi.fn();
    store.subscribe(listener);
    store.setUpscaledBy(id, 4);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
