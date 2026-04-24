/**
 * Boot-time upscale initialisation.
 *
 * Called once after the store is created. Detects capability and checks the
 * IndexedDB cache. Never starts a download — that is an explicit user action.
 */

import type { QueueStore } from './store.js';
import { detectCapability } from '@/lib/upscale/capability.js';
import { hasCachedModel } from '@/lib/upscale/model-cache.js';

export async function initUpscaleBoot(store: QueueStore): Promise<void> {
  let capability: 'webgpu' | 'wasm' | 'none';

  try {
    capability = await detectCapability();
  } catch {
    capability = 'none';
  }

  store.setUpscaleCapability(capability);

  if (capability === 'none') {
    // No execution provider available — downloading won't help.
    store.setModelStatus({ kind: 'absent' });
    return;
  }

  try {
    const cached = await hasCachedModel();
    if (cached) {
      store.setModelStatus({ kind: 'ready', loadedAt: Date.now() });
    } else {
      store.setModelStatus({ kind: 'absent' });
    }
  } catch {
    // IndexedDB unavailable or blocked — treat as absent.
    store.setModelStatus({ kind: 'absent' });
  }
}
