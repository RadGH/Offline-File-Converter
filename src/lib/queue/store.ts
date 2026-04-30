import { isSupportedInput } from '@/lib/utils/mime';

/** UUID generator with fallback for insecure contexts (LAN IPs, HTTP).
 *  `crypto.randomUUID` requires a secure context (HTTPS or localhost). */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type QueueStatus = 'waiting' | 'processing' | 'done' | 'error' | 'cancelled';

export type OutputFormat = 'auto' | 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'gif-animated' | 'webp-animated' | 'mp4';

// ── Advanced settings ─────────────────────────────────────────────────────────
// All advanced fields are optional. When undefined the converter falls back
// to "simple" behavior identical to pre-advanced builds. The advanced UI is
// gated behind a lazy "advanced pack" download — these fields only become
// non-undefined once the pack is loaded and the user has interacted.

export interface AdvancedFilters {
  /** -100..100, applied as additive on 0-255 scale (val * 2.55) */
  brightness: number;
  /** -100..100, contrast factor centered on 128 */
  contrast: number;
  /** -100..100, saturation around grayscale */
  saturation: number;
  /** invert RGB channels */
  invert: boolean;
  /** desaturate to luma */
  grayscale: boolean;
  /** Posterize: 0 = off, 2..32 = quantization levels per channel.
   *  When paletteFromImage is true, posterize quantizes to the extracted palette. */
  posterize: number;
  /** When true, posterize remaps to extracted image palette (size = posterize). */
  posterizeFromImage: boolean;
  /** Dither algorithm applied during palette/posterize remap. */
  dither: 'none' | 'floyd-steinberg' | 'ordered';
}

export interface PaletteOverride {
  /** Source color (anchor in original image) — RGB triple */
  from: [number, number, number];
  /** Replacement color — RGB triple */
  to: [number, number, number];
}

export interface GifAdvancedSettings {
  /** off=no transparency; auto=detect from source alpha; manual=use transparentColor */
  transparency: 'off' | 'auto' | 'manual';
  /** Manual transparent color (RGB) when transparency='manual'. */
  transparentColor?: [number, number, number];
  /** 2..256 — palette quantization size used by gifenc. */
  paletteSize: number;
  /** Floyd-Steinberg / atkinson / false. */
  dither: 'none' | 'floyd-steinberg' | 'atkinson';
}

export interface WebpAdvancedSettings {
  lossless: boolean;
  /** 0..100 separate alpha quality (lossy mode). */
  alphaQuality: number;
  /** 0..6 encoder method; higher = slower + smaller. */
  method: number;
  /** 0..100 near-lossless preprocessing (100 = off, 0 = max preprocessing). */
  nearLossless: number;
}

export interface PngAdvancedSettings {
  /** auto = pick smaller of lossless/quantized; on = always quantize; off = always lossless */
  paletteQuantize: 'auto' | 'on' | 'off';
  /** 2..256 palette colors when paletteQuantize='on' */
  paletteSize: number;
  /** Adam7 interlacing. */
  interlace: boolean;
}

export interface JpegAdvancedSettings {
  progressive: boolean;
  /** 444=no subsample, 422=h subsample, 420=h+v subsample */
  chromaSubsampling: '4:4:4' | '4:2:2' | '4:2:0';
}

export interface AvifAdvancedSettings {
  /** 0..10 — speed (jsquash uses 0..10, higher = faster + larger). */
  speed: number;
  lossless: boolean;
}

export interface Mp4AdvancedSettings {
  /** 1..100 quality slider; maps to a bitrate curve based on width × height × fps. */
  quality: number;
  /** Background color used to flatten transparent source frames. H.264 has no alpha. */
  backgroundColor: [number, number, number];
  /** Override the auto-picked frame rate. 0 = auto (median of source delays). */
  fpsOverride: number;
}

export interface PerFileSettings {
  format: OutputFormat;
  quality: number;
  width: number | null;
  height: number | null;
  maintainAspect: boolean;
  stripMetadata: boolean;
  /** When true and model is ready, upscale via AI before resize when enlarging. */
  upscale: boolean;
  /**
   * When true and maintainAspect=true and dimensionUnit='px': the typed
   * dimension applies to the LONGER side of the source image.
   */
  preserveOrientation: boolean;
  /** Resampling filter used when drawing the bitmap to the output canvas. */
  resample: 'nearest' | 'bilinear' | 'high';
  /** Whether W/H inputs are pixel values ('px') or percent of source ('percent'). */
  dimensionUnit: 'px' | 'percent';

  // ── Advanced (optional) ─────────────────────────────────────────────────
  filters?: AdvancedFilters;
  paletteOverrides?: PaletteOverride[];
  gif?: GifAdvancedSettings;
  webp?: WebpAdvancedSettings;
  png?: PngAdvancedSettings;
  jpeg?: JpegAdvancedSettings;
  avif?: AvifAdvancedSettings;
  mp4?: Mp4AdvancedSettings;
}

export const DEFAULT_FILTERS: AdvancedFilters = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  invert: false,
  grayscale: false,
  posterize: 0,
  posterizeFromImage: true,
  dither: 'none',
};

export const DEFAULT_GIF_ADVANCED: GifAdvancedSettings = {
  transparency: 'auto',
  paletteSize: 256,
  dither: 'floyd-steinberg',
};

export const DEFAULT_WEBP_ADVANCED: WebpAdvancedSettings = {
  lossless: false,
  alphaQuality: 90,
  method: 4,
  nearLossless: 100,
};

export const DEFAULT_PNG_ADVANCED: PngAdvancedSettings = {
  paletteQuantize: 'auto',
  paletteSize: 64,
  interlace: false,
};

export const DEFAULT_JPEG_ADVANCED: JpegAdvancedSettings = {
  progressive: true,
  chromaSubsampling: '4:2:0',
};

export const DEFAULT_AVIF_ADVANCED: AvifAdvancedSettings = {
  speed: 6,
  lossless: false,
};

export const DEFAULT_MP4_ADVANCED: Mp4AdvancedSettings = {
  quality: 65,
  backgroundColor: [255, 255, 255],
  fpsOverride: 0,
};

export interface QueueItemResult {
  blob: Blob;
  outName: string;
  outSize: number;
}

export interface OriginalDimensions {
  width: number;
  height: number;
}

export interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  settings: PerFileSettings;
  error?: string;
  result?: QueueItemResult;
  originalDimensions?: OriginalDimensions;
  /** Set after processing when AI upscaling was applied. */
  upscaledBy?: 2 | 4;
  /** ms timestamp when AI upscale started, if currently in-flight.
   *  Cleared when upscale finishes or errors. */
  upscaleStartedAt?: number;
  /** Source items have undefined parentId. Conversion items reference their source. */
  parentId?: string;
  /** True for the original-upload row that spawns conversion children. */
  isSource?: boolean;
}

// ── Upscale model status ──────────────────────────────────────────────────────

export type UpscaleModelStatus =
  | { kind: 'unknown' }
  | { kind: 'absent' }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'verifying' }
  | { kind: 'ready'; loadedAt: number }
  | { kind: 'error'; reason: string };

export type UpscaleCapabilityValue = 'unknown' | 'webgpu' | 'wasm' | 'none';

export interface QueueSettings {
  concurrency: number;
  autoStart: boolean;
  /** 'auto' = processor starts automatically on file add. 'manual' = user must trigger. */
  mode: 'auto' | 'manual';
}

export type AdvancedPackStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; reason: string };

export type PreviewView = 'slider' | 'original' | 'side-by-side';

export interface AdvancedUiState {
  pack: AdvancedPackStatus;
  /** Whether the dialog is open. */
  dialogOpen: boolean;
  previewEnabled: boolean;
  /** Which preview layout to render. */
  previewView: PreviewView;
  /** While true, the preview shows raw source pixels (no filters) so the eyedropper can sample. */
  eyedropperActive: boolean;
  /** Index of the palette override row whose 'from' color is being picked. -1 = none. */
  eyedropperRow: number;
  /** JSON-serialized snapshot of the per-file settings at the moment of the last successful Advanced Convert. */
  lastConvertedSnapshot: string | null;
  /** Last result produced by the Advanced Convert button — drives the in-dialog result row. */
  lastResult: { itemId: string; outName: string; outSize: number; thumbDataUrl: string | null } | null;
}

export interface QueueState {
  items: QueueItem[];
  globalDefaults: PerFileSettings;
  queueSettings: QueueSettings;
  modelStatus: UpscaleModelStatus;
  upscaleCapability: UpscaleCapabilityValue;
  advancedUi: AdvancedUiState;
  /** id of the currently selected source item, or null. Used by the Advanced
   *  panel for preview and by the simple-settings Convert button. */
  selectedSourceId: string | null;
}

export type Listener = (state: QueueState) => void;

export interface QueueStore {
  getState: () => QueueState;
  subscribe: (listener: Listener) => () => void;
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  updateFileSettings: (id: string, patch: Partial<PerFileSettings>) => void;
  setGlobalDefaults: (patch: Partial<PerFileSettings>) => void;
  getGlobalDefaults: () => PerFileSettings;
  clearCompleted: () => void;
  clearAll: () => void;
  setStatus: (id: string, status: QueueStatus) => void;
  setProgress: (id: string, progress: number) => void;
  setResult: (id: string, result: QueueItemResult) => void;
  setError: (id: string, error: string) => void;
  setOriginalDimensions: (id: string, dims: OriginalDimensions) => void;
  setQueueSettings: (patch: Partial<QueueSettings>) => void;
  getQueueSettings: () => QueueSettings;
  setModelStatus: (next: UpscaleModelStatus) => void;
  getModelStatus: () => UpscaleModelStatus;
  setUpscaleCapability: (c: UpscaleCapabilityValue) => void;
  getUpscaleCapability: () => UpscaleCapabilityValue;
  setUpscaledBy: (id: string, factor: 2 | 4) => void;
  setUpscaleStartedAt: (id: string, t: number | undefined) => void;
  setAdvancedUi: (patch: Partial<AdvancedUiState>) => void;
  getAdvancedUi: () => AdvancedUiState;
  /** Clone an existing item with the current global defaults applied, append to the queue. Returns the new id. */
  cloneItemWithDefaults: (sourceId: string) => string | null;
  /** Mark the given source item as selected. Pass null to clear selection. */
  selectSource: (id: string | null) => void;
  getSelectedSourceId: () => string | null;
}

const DEFAULT_SETTINGS: PerFileSettings = {
  format: 'auto',
  quality: 85,
  width: null,
  height: null,
  maintainAspect: true,
  stripMetadata: true,
  upscale: false,
  preserveOrientation: false,
  resample: 'high',
  dimensionUnit: 'px',
};

const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  concurrency: 2,
  autoStart: true,
  mode: 'auto',
};

const LS_KEY_DEFAULTS = 'converter.globalDefaults.v1';
const LS_KEY_QUEUE = 'converter.queueSettings.v1';
const LS_KEY_ADV_UI = 'converter.advancedUi.v1';

const DEFAULT_ADV_UI: AdvancedUiState = {
  pack: { kind: 'idle' },
  dialogOpen: false,
  previewEnabled: true,
  previewView: 'slider',
  eyedropperActive: false,
  eyedropperRow: -1,
  lastConvertedSnapshot: null,
  lastResult: null,
};

function loadPersistedAdvancedUi(): AdvancedUiState {
  try {
    const raw = localStorage.getItem(LS_KEY_ADV_UI);
    if (!raw) return { ...DEFAULT_ADV_UI };
    const parsed = JSON.parse(raw) as Partial<AdvancedUiState>;
    return {
      ...DEFAULT_ADV_UI,
      previewEnabled: parsed.previewEnabled !== false,
      previewView: parsed.previewView === 'original' || parsed.previewView === 'side-by-side'
        ? parsed.previewView : 'slider',
    };
  } catch {
    return { ...DEFAULT_ADV_UI };
  }
}

function persistAdvancedUi(ui: AdvancedUiState): void {
  try {
    localStorage.setItem(LS_KEY_ADV_UI, JSON.stringify({
      previewEnabled: ui.previewEnabled,
      previewView: ui.previewView,
    }));
  } catch {
    // ignore
  }
}

function loadPersistedDefaults(): PerFileSettings {
  try {
    const raw = localStorage.getItem(LS_KEY_DEFAULTS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PerFileSettings>;
    // Merge onto defaults so added fields in new versions don't break.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistDefaults(defaults: PerFileSettings): void {
  try {
    localStorage.setItem(LS_KEY_DEFAULTS, JSON.stringify(defaults));
  } catch {
    // Ignore quota / private-mode errors.
  }
}

function loadPersistedQueueSettings(): QueueSettings {
  try {
    const raw = localStorage.getItem(LS_KEY_QUEUE);
    if (!raw) return { ...DEFAULT_QUEUE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<QueueSettings>;
    return { ...DEFAULT_QUEUE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_QUEUE_SETTINGS };
  }
}

function persistQueueSettings(settings: QueueSettings): void {
  try {
    localStorage.setItem(LS_KEY_QUEUE, JSON.stringify(settings));
  } catch {
    // Ignore quota / private-mode errors.
  }
}

export function createQueueStore(): QueueStore {
  let state: QueueState = {
    items: [],
    globalDefaults: loadPersistedDefaults(),
    queueSettings: loadPersistedQueueSettings(),
    modelStatus: { kind: 'unknown' },
    upscaleCapability: 'unknown',
    advancedUi: loadPersistedAdvancedUi(),
    selectedSourceId: null,
  };

  const listeners = new Set<Listener>();

  function notify(): void {
    const snap = state;
    listeners.forEach(fn => fn(snap));
  }

  function getState(): QueueState {
    return state;
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function addFiles(files: File[]): void {
    const supported = files.filter(f => isSupportedInput(f));
    if (supported.length === 0) return;

    // Each upload becomes a SOURCE row (no processing) plus an initial
    // CONVERSION child that uses the current globalDefaults. The processor
    // skips items where isSource=true so sources never run through it.
    const newItems: QueueItem[] = [];
    let firstSourceId: string | null = state.selectedSourceId;
    for (const file of supported) {
      const sourceId = genId();
      newItems.push({
        id: sourceId,
        file,
        status: 'done', // source rows are never "waiting"; mark done so UI doesn't show progress
        progress: 100,
        settings: { ...state.globalDefaults },
        isSource: true,
      });
      // Initial conversion child with current globalDefaults (likely 'auto').
      newItems.push({
        id: genId(),
        file,
        status: 'waiting',
        progress: 0,
        settings: { ...state.globalDefaults },
        parentId: sourceId,
      });
      if (!firstSourceId) firstSourceId = sourceId;
    }

    state = {
      ...state,
      items: [...state.items, ...newItems],
      selectedSourceId: firstSourceId,
    };
    notify();
  }

  function removeFile(id: string): void {
    // If id is a SOURCE, drop the source AND all of its conversion children.
    const target = state.items.find(i => i.id === id);
    if (target?.isSource) {
      const filtered = state.items.filter(item => item.id !== id && item.parentId !== id);
      const nextSelected = state.selectedSourceId === id
        ? (filtered.find(i => i.isSource)?.id ?? null)
        : state.selectedSourceId;
      state = { ...state, items: filtered, selectedSourceId: nextSelected };
    } else {
      state = { ...state, items: state.items.filter(item => item.id !== id) };
    }
    notify();
  }

  function updateFileSettings(id: string, patch: Partial<PerFileSettings>): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id
          ? { ...item, settings: { ...item.settings, ...patch } }
          : item
      ),
    };
    notify();
  }

  function setGlobalDefaults(patch: Partial<PerFileSettings>): void {
    state = {
      ...state,
      globalDefaults: { ...state.globalDefaults, ...patch },
    };
    persistDefaults(state.globalDefaults);
    notify();
  }

  function getGlobalDefaults(): PerFileSettings {
    return state.globalDefaults;
  }

  function clearCompleted(): void {
    // Drop completed CONVERSIONS only — source rows persist as anchors for
    // the queue. Then drop any source whose all-children-removed state leaves
    // it without any conversion children — but that's actually fine, the
    // source stays as a reference image until the user removes it explicitly.
    state = { ...state, items: state.items.filter(item => item.isSource || item.status !== 'done') };
    notify();
  }

  function clearAll(): void {
    state = { ...state, items: [] };
    notify();
  }

  function setStatus(id: string, status: QueueStatus): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, status } : item
      ),
    };
    notify();
  }

  function setProgress(id: string, progress: number): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, progress } : item
      ),
    };
    notify();
  }

  function setResult(id: string, result: QueueItemResult): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, status: 'done', progress: 100, result } : item
      ),
    };
    notify();
  }

  function setError(id: string, error: string): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, status: 'error', error } : item
      ),
    };
    notify();
  }

  function setOriginalDimensions(id: string, dims: OriginalDimensions): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, originalDimensions: dims } : item
      ),
    };
    notify();
  }

  function setQueueSettings(patch: Partial<QueueSettings>): void {
    state = {
      ...state,
      queueSettings: { ...state.queueSettings, ...patch },
    };
    persistQueueSettings(state.queueSettings);
    notify();
  }

  function getQueueSettings(): QueueSettings {
    return state.queueSettings;
  }

  function setModelStatus(next: UpscaleModelStatus): void {
    state = { ...state, modelStatus: next };
    notify();
  }

  function getModelStatus(): UpscaleModelStatus {
    return state.modelStatus;
  }

  function setUpscaleCapability(c: UpscaleCapabilityValue): void {
    state = { ...state, upscaleCapability: c };
    notify();
  }

  function getUpscaleCapability(): UpscaleCapabilityValue {
    return state.upscaleCapability;
  }

  function setUpscaledBy(id: string, factor: 2 | 4): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, upscaledBy: factor } : item
      ),
    };
    notify();
  }

  function cloneItemWithDefaults(sourceId: string): string | null {
    const src = state.items.find(i => i.id === sourceId);
    if (!src) return null;
    // Always parent the new conversion to the original SOURCE (walking up if a
    // child id was passed in).
    const parentId = src.isSource ? src.id : (src.parentId ?? src.id);
    const parent = state.items.find(i => i.id === parentId) ?? src;
    const newItem: QueueItem = {
      id: genId(),
      file: parent.file,
      status: 'waiting',
      progress: 0,
      settings: { ...state.globalDefaults },
      originalDimensions: parent.originalDimensions,
      parentId,
    };
    state = { ...state, items: [...state.items, newItem] };
    notify();
    return newItem.id;
  }

  function selectSource(id: string | null): void {
    state = { ...state, selectedSourceId: id };
    notify();
  }
  function getSelectedSourceId(): string | null {
    return state.selectedSourceId;
  }

  function setAdvancedUi(patch: Partial<AdvancedUiState>): void {
    state = { ...state, advancedUi: { ...state.advancedUi, ...patch } };
    persistAdvancedUi(state.advancedUi);
    notify();
  }

  function getAdvancedUi(): AdvancedUiState {
    return state.advancedUi;
  }

  function setUpscaleStartedAt(id: string, t: number | undefined): void {
    state = {
      ...state,
      items: state.items.map(item =>
        item.id === id ? { ...item, upscaleStartedAt: t } : item
      ),
    };
    notify();
  }

  return {
    getState,
    subscribe,
    addFiles,
    removeFile,
    updateFileSettings,
    setGlobalDefaults,
    getGlobalDefaults,
    clearCompleted,
    clearAll,
    setStatus,
    setProgress,
    setResult,
    setError,
    setOriginalDimensions,
    setQueueSettings,
    getQueueSettings,
    setModelStatus,
    getModelStatus,
    setUpscaleCapability,
    getUpscaleCapability,
    setUpscaledBy,
    setUpscaleStartedAt,
    setAdvancedUi,
    getAdvancedUi,
    cloneItemWithDefaults,
    selectSource,
    getSelectedSourceId,
  };
}
