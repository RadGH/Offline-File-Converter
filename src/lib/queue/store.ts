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
}

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

export interface QueueState {
  items: QueueItem[];
  globalDefaults: PerFileSettings;
  queueSettings: QueueSettings;
  modelStatus: UpscaleModelStatus;
  upscaleCapability: UpscaleCapabilityValue;
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
  };
}
