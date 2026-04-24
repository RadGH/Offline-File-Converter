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
  /** Only applies when format === 'png'. Runs UPNG optimizer after canvas encode. */
  pngOptimize: boolean;
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
}

export interface QueueSettings {
  concurrency: number;
  autoStart: boolean;
}

export interface QueueState {
  items: QueueItem[];
  globalDefaults: PerFileSettings;
  queueSettings: QueueSettings;
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
}

const DEFAULT_SETTINGS: PerFileSettings = {
  format: 'jpeg',
  quality: 85,
  width: null,
  height: null,
  maintainAspect: true,
  stripMetadata: true,
  pngOptimize: false,
};

const DEFAULT_QUEUE_SETTINGS: QueueSettings = {
  concurrency: 2,
  autoStart: true,
};

export function createQueueStore(): QueueStore {
  let state: QueueState = {
    items: [],
    globalDefaults: { ...DEFAULT_SETTINGS },
    queueSettings: { ...DEFAULT_QUEUE_SETTINGS },
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
    notify();
  }

  function getQueueSettings(): QueueSettings {
    return state.queueSettings;
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
  };
}
