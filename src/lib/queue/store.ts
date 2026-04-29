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

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';

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

export type AdvancedLayout = 'inline' | 'dialog';

export interface AdvancedUiState {
  pack: AdvancedPackStatus;
  layout: AdvancedLayout;
  /** Whether the advanced disclosure is expanded (Layout A) or dialog open (Layout B handles its own state). */
  expanded: boolean;
  previewEnabled: boolean;
  /** While true, the preview shows raw source pixels (no filters) so the eyedropper can sample. */
  eyedropperActive: boolean;
  /** Index of the palette override row whose 'from' color is being picked. -1 = none. */
  eyedropperRow: number;
}

export interface QueueState {
  items: QueueItem[];
  globalDefaults: PerFileSettings;
  queueSettings: QueueSettings;
  modelStatus: UpscaleModelStatus;
  upscaleCapability: UpscaleCapabilityValue;
  advancedUi: AdvancedUiState;
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
}

const DEFAULT_SETTINGS: PerFileSettings = {
  format: 'jpeg',
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
  layout: 'dialog',
  expanded: false,
  previewEnabled: true,
  eyedropperActive: false,
  eyedropperRow: -1,
};

function loadPersistedAdvancedUi(): AdvancedUiState {
  try {
    const raw = localStorage.getItem(LS_KEY_ADV_UI);
    if (!raw) return { ...DEFAULT_ADV_UI };
    const parsed = JSON.parse(raw) as Partial<AdvancedUiState>;
    return {
      ...DEFAULT_ADV_UI,
      // Persist only layout + previewEnabled. Pack status and ephemeral flags reset.
      layout: parsed.layout === 'inline' ? 'inline' : 'dialog',
      previewEnabled: parsed.previewEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_ADV_UI };
  }
}

function persistAdvancedUi(ui: AdvancedUiState): void {
  try {
    localStorage.setItem(LS_KEY_ADV_UI, JSON.stringify({
      layout: ui.layout,
      previewEnabled: ui.previewEnabled,
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

    const newItems: QueueItem[] = supported.map(file => ({
      id: genId(),
      file,
      status: 'waiting',
      progress: 0,
      settings: { ...state.globalDefaults },
    }));

    state = { ...state, items: [...state.items, ...newItems] };
    notify();
  }

  function removeFile(id: string): void {
    state = { ...state, items: state.items.filter(item => item.id !== id) };
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
    state = { ...state, items: state.items.filter(item => item.status !== 'done') };
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
  };
}
