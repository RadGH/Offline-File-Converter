/**
 * Advanced-pack lazy loader.
 *
 * The advanced features (filter pipeline, palette quantizer, alternative
 * encoders, before/after preview, eyedropper) all live in code that is NOT
 * imported by the main bundle. This loader triggers the dynamic-import of
 * those modules in parallel, reports progress, and caches the resolved
 * module records in memory.
 *
 * Browsers cache the underlying chunk files via the standard HTTP cache, so a
 * full reload after first download usually re-fetches at zero network cost.
 * No IndexedDB / service-worker layer is needed for this v1.
 *
 * The "Unload" button clears the in-memory references so the user can verify
 * the gating works (the controls go back to "Load" state and a full reload
 * is required to re-arm them — which is exactly what we want).
 */

let loadedPack: AdvancedPack | null = null;
let loadingPromise: Promise<AdvancedPack> | null = null;

export interface AdvancedPack {
  filters: typeof import('./filters');
  palette: typeof import('./palette');
  decode: typeof import('./decode');
  imageHash: typeof import('./image-hash');
  preview: typeof import('./preview');
  paletteOverrides: typeof import('./palette-overrides');
}

export interface LoadProgress {
  loaded: number;
  total: number;
}

export type LoadListener = (p: LoadProgress) => void;

export function isLoaded(): boolean {
  return loadedPack !== null;
}

export function getLoadedPack(): AdvancedPack | null {
  return loadedPack;
}

export async function loadAdvancedPack(onProgress?: LoadListener): Promise<AdvancedPack> {
  if (loadedPack) return loadedPack;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async (): Promise<AdvancedPack> => {
    const total = 6;
    let loaded = 0;
    const tick = () => { loaded++; onProgress?.({ loaded, total }); };

    onProgress?.({ loaded: 0, total });

    // Dynamic-import each. Vite splits each into its own chunk.
    const [filters, palette, decode, imageHash, preview, paletteOverrides] = await Promise.all([
      import('./filters').then(m => { tick(); return m; }),
      import('./palette').then(m => { tick(); return m; }),
      import('./decode').then(m => { tick(); return m; }),
      import('./image-hash').then(m => { tick(); return m; }),
      import('./preview').then(m => { tick(); return m; }),
      import('./palette-overrides').then(m => { tick(); return m; }),
    ]);

    const pack: AdvancedPack = { filters, palette, decode, imageHash, preview, paletteOverrides };
    loadedPack = pack;
    return pack;
  })();

  try {
    return await loadingPromise;
  } catch (err) {
    loadingPromise = null;
    throw err;
  }
}

/**
 * Drop in-memory references. The chunks remain in the browser HTTP cache so
 * a future Load is fast, but the in-page state goes back to "not loaded".
 */
export function unloadAdvancedPack(): void {
  loadedPack = null;
  loadingPromise = null;
}
