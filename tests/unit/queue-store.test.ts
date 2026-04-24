import { describe, it, expect, vi } from 'vitest';
import { createQueueStore } from '@/lib/queue/store';

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
    const { items } = store.getState();
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe('waiting');
    expect(items[1].status).toBe('waiting');
    expect(items[0].progress).toBe(0);
  });

  it('addFiles rejects non-image files', () => {
    const store = createQueueStore();
    store.addFiles([
      makeFile('doc.pdf', 'application/pdf'),
      makeFile('img.jpg', 'image/jpeg'),
    ]);
    expect(store.getState().items).toHaveLength(1);
    expect(store.getState().items[0].file.name).toBe('img.jpg');
  });

  it('addFiles generates unique IDs', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const ids = store.getState().items.map(i => i.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('addFiles uses globalDefaults for settings', () => {
    const store = createQueueStore();
    store.setGlobalDefaults({ format: 'webp', quality: 70 });
    store.addFiles([makeFile('a.jpg')]);
    const { items } = store.getState();
    expect(items[0].settings.format).toBe('webp');
    expect(items[0].settings.quality).toBe(70);
  });

  it('removeFile removes the correct item', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const id = store.getState().items[0].id;
    store.removeFile(id);
    const { items } = store.getState();
    expect(items).toHaveLength(1);
    expect(items[0].file.name).toBe('b.jpg');
  });

  it('clearCompleted only removes done items', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    const [a, _b, c] = store.getState().items;
    store.setStatus(a.id, 'done');
    store.setStatus(c.id, 'error');
    store.clearCompleted();
    const { items } = store.getState();
    expect(items).toHaveLength(2);
    expect(items.find(i => i.file.name === 'a.jpg')).toBeUndefined();
    expect(items.find(i => i.file.name === 'b.jpg')).toBeDefined();
    expect(items.find(i => i.file.name === 'c.jpg')).toBeDefined();
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
    const id = store.getState().items[0].id;
    store.updateFileSettings(id, { format: 'png', quality: 90 });
    const item = store.getState().items[0];
    expect(item.settings.format).toBe('png');
    expect(item.settings.quality).toBe(90);
    // other settings remain
    expect(item.settings.maintainAspect).toBe(true);
  });

  it('setStatus updates status', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items[0].id;
    store.setStatus(id, 'processing');
    expect(store.getState().items[0].status).toBe('processing');
  });

  it('setProgress updates progress', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items[0].id;
    store.setProgress(id, 50);
    expect(store.getState().items[0].progress).toBe(50);
  });

  it('setResult marks item done with result', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items[0].id;
    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    store.setResult(id, { blob, outName: 'a.jpg', outSize: 4 });
    const item = store.getState().items[0];
    expect(item.status).toBe('done');
    expect(item.progress).toBe(100);
    expect(item.result?.outName).toBe('a.jpg');
  });

  it('setError marks item errored', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items[0].id;
    store.setError(id, 'Conversion failed');
    const item = store.getState().items[0];
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
    const originalFormat = store.getState().items[0].settings.format;
    store.setGlobalDefaults({ format: 'webp' });
    // existing item unchanged
    expect(store.getState().items[0].settings.format).toBe(originalFormat);
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
    const id = store.getState().items[0].id;
    expect(store.getState().items[0].originalDimensions).toBeUndefined();
    store.setOriginalDimensions(id, { width: 1920, height: 1080 });
    const item = store.getState().items[0];
    expect(item.originalDimensions).toEqual({ width: 1920, height: 1080 });
  });

  it('setOriginalDimensions does not affect other items', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    const [a, b] = store.getState().items;
    store.setOriginalDimensions(a.id, { width: 800, height: 600 });
    expect(store.getState().items[0].originalDimensions).toEqual({ width: 800, height: 600 });
    expect(store.getState().items[1].originalDimensions).toBeUndefined();
    // b still untouched
    expect(store.getState().items.find(i => i.id === b.id)?.originalDimensions).toBeUndefined();
  });

  it('setOriginalDimensions notifies subscribers', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items[0].id;
    const listener = vi.fn();
    store.subscribe(listener);
    store.setOriginalDimensions(id, { width: 640, height: 480 });
    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0][0] as ReturnType<typeof store.getState>;
    expect(state.items[0].originalDimensions).toEqual({ width: 640, height: 480 });
  });

  it('setOriginalDimensions can be called multiple times (overwrite)', () => {
    const store = createQueueStore();
    store.addFiles([makeFile('a.jpg')]);
    const id = store.getState().items[0].id;
    store.setOriginalDimensions(id, { width: 100, height: 100 });
    store.setOriginalDimensions(id, { width: 200, height: 150 });
    expect(store.getState().items[0].originalDimensions).toEqual({ width: 200, height: 150 });
  });
});
