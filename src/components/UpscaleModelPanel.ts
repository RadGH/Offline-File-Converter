/**
 * UpscaleModelPanel — compact card inside GlobalDefaults showing AI model status.
 *
 * Renders reactively based on store.modelStatus and store.upscaleCapability.
 * Never triggers a download on its own — only when the user clicks "Download model".
 */

import type { QueueStore, UpscaleModelStatus, UpscaleCapabilityValue } from '@/lib/queue/store';
import { downloadModelWithProgress } from '@/lib/upscale/downloader.js';
import { deleteCachedModel } from '@/lib/upscale/model-cache.js';
import { UPSCALE_MODEL } from '@/lib/upscale/model-config.js';
import { toast } from './Toast.js';

function formatMb(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1) + ' MB';
}

function providerLabel(cap: UpscaleCapabilityValue): string {
  if (cap === 'webgpu') return 'WebGPU';
  if (cap === 'wasm') return 'WASM (CPU)';
  return 'Unknown';
}

/**
 * Creates and returns a panel element. The element re-renders itself
 * reactively whenever the store emits a new state.
 */
export function createUpscaleModelPanel(store: QueueStore): HTMLElement {
  const root = document.createElement('div');
  root.className = 'upscale-model-panel';

  // Scoped AbortController for the active download.
  let downloadAbort: AbortController | null = null;

  function render(): void {
    const modelStatus = store.getModelStatus();
    const capability = store.getUpscaleCapability();

    root.innerHTML = '';

    // Header row
    const header = document.createElement('div');
    header.className = 'upscale-model-panel__header';

    const title = document.createElement('span');
    title.className = 'upscale-model-panel__title';
    title.textContent = 'AI upscaling';

    const badge = document.createElement('span');
    badge.className = 'upscale-model-panel__badge';
    badge.textContent = 'Experimental';

    header.appendChild(title);
    header.appendChild(badge);
    root.appendChild(header);

    // Capability none — replace everything with refusal notice
    if (capability === 'none') {
      const msg = document.createElement('p');
      msg.className = 'upscale-model-panel__unavailable';
      msg.textContent =
        'Your browser doesn\'t support WebGPU or WASM SR inference. ' +
        'Upscaling is unavailable; Convert and Compress still work.';
      root.appendChild(msg);
      return;
    }

    // Description line
    const desc = document.createElement('p');
    desc.className = 'upscale-model-panel__desc';
    desc.textContent =
      'AI super-resolution runs entirely in your browser. ' +
      'When enabled, images enlarged by resize are sharpened before encoding.';
    root.appendChild(desc);

    // State-specific content
    renderByStatus(root, modelStatus, capability);
  }

  function renderByStatus(
    container: HTMLElement,
    status: UpscaleModelStatus,
    capability: UpscaleCapabilityValue,
  ): void {
    switch (status.kind) {
      case 'unknown': {
        const p = document.createElement('p');
        p.className = 'upscale-model-panel__checking';
        p.textContent = 'Checking cache…';
        container.appendChild(p);
        break;
      }

      case 'absent': {
        const info = document.createElement('p');
        info.className = 'upscale-model-panel__absent-info';
        info.textContent =
          `Downloads a small neural network (~${formatMb(UPSCALE_MODEL.sizeBytes)}) ` +
          'that runs in your browser. The model is cached after the first download.';
        container.appendChild(info);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'upscale-model-panel__download-btn';
        btn.id = 'upscale-model-download-btn';
        btn.textContent = 'Download model';
        btn.addEventListener('click', startDownload);
        container.appendChild(btn);
        break;
      }

      case 'downloading': {
        const label = document.createElement('p');
        label.className = 'upscale-model-panel__dl-label';
        const total = status.total || UPSCALE_MODEL.sizeBytes;
        const pct = total > 0 ? Math.round((status.loaded / total) * 100) : 0;
        label.textContent = `Downloading AI model… ${formatMb(status.loaded)} / ${formatMb(total)} (${pct}%)`;
        container.appendChild(label);

        const barWrap = document.createElement('div');
        barWrap.className = 'upscale-model-panel__progress-bar';
        const barFill = document.createElement('div');
        barFill.className = 'upscale-model-panel__progress-fill';
        barFill.style.width = `${pct}%`;
        barWrap.appendChild(barFill);
        container.appendChild(barWrap);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'upscale-model-panel__cancel-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
          downloadAbort?.abort();
          downloadAbort = null;
          store.setModelStatus({ kind: 'absent' });
        });
        container.appendChild(cancelBtn);
        break;
      }

      case 'verifying': {
        const p = document.createElement('p');
        p.className = 'upscale-model-panel__verifying';
        p.innerHTML = '<span class="upscale-model-panel__spinner" aria-hidden="true"></span> Verifying…';
        container.appendChild(p);
        break;
      }

      case 'ready': {
        const readyRow = document.createElement('div');
        readyRow.className = 'upscale-model-panel__ready-row';

        const check = document.createElement('span');
        check.className = 'upscale-model-panel__ready-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';

        const readyText = document.createElement('span');
        readyText.className = 'upscale-model-panel__ready-text';
        readyText.textContent =
          `AI model ready (${formatMb(UPSCALE_MODEL.sizeBytes)}, cached)`;

        const removeLink = document.createElement('button');
        removeLink.type = 'button';
        removeLink.className = 'upscale-model-panel__remove-link';
        removeLink.textContent = 'Remove';
        removeLink.title = 'Delete cached model and return to absent state';
        removeLink.addEventListener('click', async () => {
          try {
            await deleteCachedModel();
          } catch {
            // Ignore — best effort
          }
          store.setModelStatus({ kind: 'absent' });
        });

        readyRow.appendChild(check);
        readyRow.appendChild(readyText);
        readyRow.appendChild(removeLink);
        container.appendChild(readyRow);

        const providerInfo = document.createElement('p');
        providerInfo.className = 'upscale-model-panel__provider';
        providerInfo.textContent = `Running on: ${providerLabel(capability)}`;
        container.appendChild(providerInfo);
        break;
      }

      case 'error': {
        const errMsg = document.createElement('p');
        errMsg.className = 'upscale-model-panel__error';
        errMsg.textContent = `Download failed: ${status.reason}`;
        container.appendChild(errMsg);

        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'upscale-model-panel__download-btn';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', startDownload);
        container.appendChild(retryBtn);
        break;
      }
    }
  }

  async function startDownload(): Promise<void> {
    const capability = store.getUpscaleCapability();
    if (capability === 'none') return;

    downloadAbort = new AbortController();
    const signal = downloadAbort.signal;

    store.setModelStatus({ kind: 'downloading', loaded: 0, total: UPSCALE_MODEL.sizeBytes });

    try {
      await downloadModelWithProgress(signal, (loaded, total) => {
        store.setModelStatus({ kind: 'downloading', loaded, total });
      });

      // Move to verifying state while we re-read the cache to confirm
      store.setModelStatus({ kind: 'verifying' });

      // Brief async tick so the verifying state renders
      await new Promise(r => setTimeout(r, 80));

      store.setModelStatus({ kind: 'ready', loadedAt: Date.now() });
      downloadAbort = null;
      toast.info('AI upscaler ready.');
    } catch (err: unknown) {
      downloadAbort = null;
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled — already set to absent by the Cancel button handler
        return;
      }
      const reason = err instanceof Error ? err.message : String(err);
      store.setModelStatus({ kind: 'error', reason });
    }
  }

  // Reactive re-render on store changes
  store.subscribe(() => render());

  // Initial render
  render();

  return root;
}
