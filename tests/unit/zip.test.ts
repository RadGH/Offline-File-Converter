import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueueItem } from '@/lib/queue/store';

// ── JSZip mock ────────────────────────────────────────────────────────────────

const mockFile = vi.fn();
const mockGenerateAsync = vi.fn();

vi.mock('jszip', () => {
  return {
    default: class MockJSZip {
      file = mockFile;
      generateAsync = mockGenerateAsync;
    },
  };
});

// Import after mock is set up
const { buildZip, zipFilename } = await import('@/lib/zip');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlob(content = 'data'): Blob {
  return new Blob([content]);
}

function makeDoneItem(id: string, outName: string): QueueItem {
  return {
    id,
    file: new File([], 'input.jpg', { type: 'image/jpeg' }),
    status: 'done',
    progress: 100,
    settings: {
      format: 'jpeg',
      quality: 85,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      pngOptimize: false,
      upscale: false,
    },
    result: {
      blob: makeBlob(id),
      outName,
      outSize: id.length,
    },
  };
}

function makeNonDoneItem(id: string, status: QueueItem['status'] = 'waiting'): QueueItem {
  return {
    id,
    file: new File([], 'input.jpg', { type: 'image/jpeg' }),
    status,
    progress: 0,
    settings: {
      format: 'jpeg',
      quality: 85,
      width: null,
      height: null,
      maintainAspect: true,
      stripMetadata: true,
      pngOptimize: false,
      upscale: false,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildZip', () => {
  const fakeBlob = new Blob(['zip-content']);

  beforeEach(() => {
    mockFile.mockClear();
    mockGenerateAsync.mockReset();
    mockGenerateAsync.mockResolvedValue(fakeBlob);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls zip.file() for each done item with correct name and blob', async () => {
    const items = [
      makeDoneItem('a', 'photo.webp'),
      makeDoneItem('b', 'other.jpg'),
    ];

    await buildZip(items);

    expect(mockFile).toHaveBeenCalledTimes(2);
    expect(mockFile).toHaveBeenCalledWith('photo.webp', items[0].result!.blob);
    expect(mockFile).toHaveBeenCalledWith('other.jpg', items[1].result!.blob);
  });

  it('filters out non-done items (waiting, error, cancelled)', async () => {
    const items = [
      makeDoneItem('done1', 'done.jpg'),
      makeNonDoneItem('w1', 'waiting'),
      makeNonDoneItem('e1', 'error'),
      makeNonDoneItem('c1', 'cancelled'),
    ];

    await buildZip(items);

    expect(mockFile).toHaveBeenCalledTimes(1);
    expect(mockFile).toHaveBeenCalledWith('done.jpg', items[0].result!.blob);
  });

  it('deduplicates identical outNames: first keeps name, second gets (2), third gets (3)', async () => {
    const items = [
      makeDoneItem('a', 'photo.webp'),
      makeDoneItem('b', 'photo.webp'),
      makeDoneItem('c', 'photo.webp'),
    ];

    await buildZip(items);

    expect(mockFile).toHaveBeenCalledTimes(3);
    const calls = mockFile.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContain('photo.webp');
    expect(calls).toContain('photo (2).webp');
    expect(calls).toContain('photo (3).webp');
  });

  it('deduplicates names without extension', async () => {
    const items = [
      makeDoneItem('a', 'image'),
      makeDoneItem('b', 'image'),
    ];

    await buildZip(items);

    const calls = mockFile.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls).toContain('image');
    expect(calls).toContain('image (2)');
  });

  it('invokes onProgress callback during generateAsync', async () => {
    const items = [makeDoneItem('a', 'file.jpg')];
    const progressValues: number[] = [];

    // Simulate the metadata callback JSZip would call
    mockGenerateAsync.mockImplementation(
      async (
        _opts: unknown,
        progressCb: ((m: { percent: number }) => void) | undefined,
      ) => {
        if (progressCb) {
          progressCb({ percent: 25 });
          progressCb({ percent: 75 });
          progressCb({ percent: 100 });
        }
        return fakeBlob;
      },
    );

    await buildZip(items, (pct) => progressValues.push(pct));

    expect(progressValues).toEqual([25, 75, 100]);
  });

  it('returns the blob produced by generateAsync', async () => {
    const items = [makeDoneItem('a', 'img.png')];
    const result = await buildZip(items);
    expect(result).toBe(fakeBlob);
  });
});

describe('zipFilename', () => {
  it('produces correct format for a known date', () => {
    expect(zipFilename(new Date('2026-04-23'))).toBe('converted-images-2026-04-23.zip');
  });

  it('zero-pads month and day', () => {
    expect(zipFilename(new Date('2026-01-05'))).toBe('converted-images-2026-01-05.zip');
  });

  it('matches the expected filename regex pattern', () => {
    const name = zipFilename(new Date('2026-04-23'));
    expect(name).toMatch(/^converted-images-\d{4}-\d{2}-\d{2}\.zip$/);
  });
});
