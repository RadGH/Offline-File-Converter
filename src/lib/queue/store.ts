import { isSupportedInput } from '@/lib/utils/mime';

export type QueueStatus = 'waiting' | 'processing' | 'done' | 'error' | 'cancelled';

export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';

export interface PerFileSettings {
  format: OutputFormat;
  quality: number;
  width: number | null;
  height: number | null;
  maintainAspect: boolean;
  stripMetadata: boolean;
}

export interface QueueItemResult {
  blob: Blob;
  outName: string;
  outSize: number;
}

export interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  settings: PerFileSettings;
  error?: string;
  result?: QueueItemResult;
}

export interface QueueState {
  items: QueueItem[];
  globalDefaults: PerFileSettings;
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
}

const DEFAULT_SETTINGS: PerFileSettings = {
  format: 'jpeg',
  quality: 85,
  width: null,
  height: null,
  maintainAspect: true,
  stripMetadata: true,
};

export function createQueueStore(): QueueStore {
  let state: QueueState = {
    items: [],
    globalDefaults: { ...DEFAULT_SETTINGS },
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
      id: crypto.randomUUID(),
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
  };
}
