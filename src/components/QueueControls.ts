/**
 * QueueControls — panel with start/pause/resume, concurrency settings,
 * clear actions, retry-all-errored, convert-all, re-convert-all, and live counts.
 */

import type { QueueStore } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { createDownloadZipButton } from '@/components/DownloadZipButton';
import { settingsDiffer } from '@/lib/utils/settings-differ';

export function createQueueControls(
  store: QueueStore,
  processor: QueueProcessor
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'queue-controls';

  // ── Status bar (counts + start/pause button) ─────────────────────────────

  const statusBar = document.createElement('div');
  statusBar.className = 'queue-controls__status-bar';

  const counts = document.createElement('span');
  counts.className = 'queue-controls__counts';

  const startPauseBtn = document.createElement('button');
  startPauseBtn.type = 'button';
  startPauseBtn.className = 'queue-controls__start-pause';

  const shortcutHint = document.createElement('span');
  shortcutHint.className = 'queue-controls__shortcut-hint';
  shortcutHint.setAttribute('aria-hidden', 'true');
  shortcutHint.textContent = 'Space to start/pause';

  statusBar.appendChild(counts);
  statusBar.appendChild(shortcutHint);
  statusBar.appendChild(startPauseBtn);

  // ── Action buttons ────────────────────────────────────────────────────────

  const actionsBar = document.createElement('div');
  actionsBar.className = 'queue-controls__actions';

  const convertAllBtn = document.createElement('button');
  convertAllBtn.type = 'button';
  convertAllBtn.className = 'queue-controls__convert-all';
  convertAllBtn.textContent = 'Convert all (0)';

  const reconvertAllBtn = document.createElement('button');
  reconvertAllBtn.type = 'button';
  reconvertAllBtn.className = 'queue-controls__reconvert-all';
  reconvertAllBtn.textContent = 'Re-convert all (0)';

  const retryAllBtn = document.createElement('button');
  retryAllBtn.type = 'button';
  retryAllBtn.className = 'queue-controls__retry-all';
  retryAllBtn.textContent = 'Retry errored';

  const clearCompletedBtn = document.createElement('button');
  clearCompletedBtn.type = 'button';
  clearCompletedBtn.className = 'queue-controls__clear-completed';
  clearCompletedBtn.textContent = 'Clear completed';

  const clearAllBtn = document.createElement('button');
  clearAllBtn.type = 'button';
  clearAllBtn.className = 'queue-controls__clear-all';
  clearAllBtn.textContent = 'Clear all';

  const downloadZipBtn = createDownloadZipButton(store);

  actionsBar.appendChild(convertAllBtn);
  actionsBar.appendChild(reconvertAllBtn);
  actionsBar.appendChild(retryAllBtn);
  actionsBar.appendChild(clearCompletedBtn);
  actionsBar.appendChild(clearAllBtn);
  actionsBar.appendChild(downloadZipBtn);

  panel.appendChild(statusBar);
  panel.appendChild(actionsBar);

  // ── State sync ────────────────────────────────────────────────────────────

  let hasBeenShown = false;

  function syncUI(): void {
    const pState = processor.getState();
    const { items } = store.getState();

    // Only show controls once the queue has more than 1 item. Once shown, stays visible.
    if (items.length > 1) hasBeenShown = true;
    panel.classList.toggle('queue-controls--hidden', !hasBeenShown);

    // Counts
    const doneCount = items.filter(i => i.status === 'done').length;
    const errorCount = items.filter(i => i.status === 'error').length;
    counts.textContent = `Active: ${pState.active} · Queued: ${pState.queued} · Done: ${doneCount}${errorCount > 0 ? ` · Errors: ${errorCount}` : ''}`;

    // Start/Pause button
    startPauseBtn.textContent = pState.running ? 'Pause' : 'Start';
    startPauseBtn.setAttribute('aria-label', pState.running ? 'Pause queue' : 'Start queue');
    startPauseBtn.className = `queue-controls__start-pause${pState.running ? ' queue-controls__start-pause--running' : ''}`;

    // Retry-all button: only visible+enabled when there are errored/cancelled items
    const erroredCount = items.filter(i => i.status === 'error' || i.status === 'cancelled').length;
    retryAllBtn.disabled = erroredCount === 0;
    retryAllBtn.style.display = erroredCount > 0 ? '' : 'none';

    // Convert-all: shown when there are waiting items
    const waitingCount = items.filter(i => i.status === 'waiting').length;
    convertAllBtn.textContent = `Convert all (${waitingCount})`;
    convertAllBtn.disabled = waitingCount === 0;
    convertAllBtn.style.display = waitingCount > 0 ? '' : 'none';

    // Re-convert-all: shown when done items have stale settings
    const globalDefaults = store.getGlobalDefaults();
    const staleItems = items.filter(i => i.status === 'done' && settingsDiffer(i.settings, globalDefaults));
    reconvertAllBtn.textContent = `Re-convert all (${staleItems.length})`;
    reconvertAllBtn.disabled = staleItems.length === 0;
    reconvertAllBtn.style.display = staleItems.length > 0 ? '' : 'none';

    // Clear-completed: only enabled when there are done items
    clearCompletedBtn.disabled = !items.some(i => i.status === 'done');

    // Clear-all: only enabled when there are any items
    clearAllBtn.disabled = items.length === 0;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  startPauseBtn.addEventListener('click', () => {
    if (processor.getState().running) {
      processor.pause();
    } else {
      processor.start();
    }
  });

  convertAllBtn.addEventListener('click', () => {
    processor.start();
  });

  reconvertAllBtn.addEventListener('click', () => {
    const { items } = store.getState();
    const globalDefaults = store.getGlobalDefaults();
    const staleFiles = items
      .filter(i => i.status === 'done' && settingsDiffer(i.settings, globalDefaults))
      .map(i => i.file);
    if (staleFiles.length > 0) store.addFiles(staleFiles);
  });

  retryAllBtn.addEventListener('click', () => {
    const { items } = store.getState();
    items
      .filter(i => i.status === 'error' || i.status === 'cancelled')
      .forEach(i => processor.retryItem(i.id));
  });

  clearCompletedBtn.addEventListener('click', () => {
    store.clearCompleted();
  });

  clearAllBtn.addEventListener('click', () => {
    store.clearAll();
  });

  // ── Subscribe to changes ──────────────────────────────────────────────────

  store.subscribe(syncUI);
  processor.subscribe(syncUI);

  syncUI();

  return panel;
}
