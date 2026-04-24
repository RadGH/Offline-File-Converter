import type { QueueStore } from '@/lib/queue/store';
import { buildZip, zipFilename } from '@/lib/zip';

/**
 * Creates the "Download all as ZIP" button element.
 *
 * - Disabled when no items are done.
 * - Shows live progress while building ("Building ZIP… 45%").
 * - Displays a transient red error message below the button on failure.
 */
export function createDownloadZipButton(store: QueueStore): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'download-zip-wrapper';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'queue-controls__download-zip';

  const errorMsg = document.createElement('span');
  errorMsg.className = 'download-zip-error';
  errorMsg.setAttribute('aria-live', 'polite');

  wrapper.appendChild(btn);
  wrapper.appendChild(errorMsg);

  let building = false;
  let errorTimer: ReturnType<typeof setTimeout> | null = null;

  function syncBtn(): void {
    if (building) return; // don't clobber progress text
    const { items } = store.getState();
    const doneCount = items.filter((i) => i.status === 'done').length;
    btn.disabled = doneCount === 0;
    btn.textContent =
      doneCount > 0 ? `Download all as ZIP (${doneCount})` : 'Download all as ZIP';
  }

  async function handleClick(): Promise<void> {
    if (building) return;
    building = true;
    btn.disabled = true;

    // Clear any existing error
    if (errorTimer !== null) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
    errorMsg.textContent = '';

    try {
      const { items } = store.getState();
      const blob = await buildZip(items, (pct) => {
        btn.textContent = `Building ZIP… ${Math.round(pct)}%`;
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after browser has had time to initiate the download
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorMsg.textContent = `ZIP error: ${message}`;
      errorTimer = setTimeout(() => {
        errorMsg.textContent = '';
        errorTimer = null;
      }, 4_000);
    } finally {
      building = false;
      syncBtn();
    }
  }

  btn.addEventListener('click', () => {
    void handleClick();
  });

  store.subscribe(syncBtn);
  syncBtn();

  return wrapper;
}
