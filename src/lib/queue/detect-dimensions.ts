import type { QueueStore, QueueState } from './store';

/**
 * Attempts to measure an image File's natural dimensions via createImageBitmap,
 * falling back to an HTMLImageElement (needed for HEIC/AVIF on some browsers).
 */
async function measureFile(file: File): Promise<{ width: number; height: number }> {
  // Primary: createImageBitmap (faster, works for most formats)
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    // Fall back to HTMLImageElement (handles HEIC fallback after heic2any decode, etc.)
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not determine dimensions for ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Subscribe to the store and lazily detect dimensions for any waiting item that
 * has not yet had originalDimensions populated. Idempotent — skips already-measured items.
 *
 * Call once from main.ts after store is created.
 */
export function startDimensionDetection(store: QueueStore): void {
  const pending = new Set<string>();

  function onStateChange(state: QueueState): void {
    for (const item of state.items) {
      if (item.originalDimensions !== undefined) continue;
      if (pending.has(item.id)) continue;

      pending.add(item.id);

      measureFile(item.file).then(dims => {
        store.setOriginalDimensions(item.id, dims);
      }).catch(() => {
        // Silently ignore unmeasurable files — UI handles missing dims gracefully
      }).finally(() => {
        pending.delete(item.id);
      });
    }
  }

  store.subscribe(onStateChange);
  // Run once on init in case there are already items
  onStateChange(store.getState());
}
