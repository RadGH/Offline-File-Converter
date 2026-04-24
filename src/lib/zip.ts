import type { QueueItem } from '@/lib/queue/store';

/**
 * Builds a ZIP blob from all completed queue items.
 *
 * Duplicate outNames are disambiguated by inserting ` (N)` before the
 * extension, starting at `(2)` for the second occurrence.
 *
 * JSZip is dynamically imported so it stays out of the main entry chunk.
 */
export async function buildZip(
  items: QueueItem[],
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const done = items.filter(
    (item): item is QueueItem & { result: NonNullable<QueueItem['result']> } =>
      item.status === 'done' && item.result !== undefined,
  );

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // Deduplicate outNames
  const seen = new Map<string, number>();

  for (const item of done) {
    const raw = item.result.outName;
    const count = (seen.get(raw) ?? 0) + 1;
    seen.set(raw, count);

    const finalName = count === 1 ? raw : deduplicateName(raw, count);
    zip.file(finalName, item.result.blob);
  }

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => onProgress?.(metadata.percent),
  );
}

/**
 * Returns `converted-images-YYYY-MM-DD.zip` for the given date.
 */
export function zipFilename(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `converted-images-${yyyy}-${mm}-${dd}.zip`;
}

/**
 * Inserts ` (N)` before the last extension.
 * e.g. `photo.webp` + 2 → `photo (2).webp`
 */
function deduplicateName(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return `${name} (${n})`;
  return `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
}
