/**
 * QueueControls — panel with start/pause/resume, concurrency settings,
 * clear actions, retry-all-errored, and live active/queued counts.
 */

import type { QueueStore } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { createDownloadZipButton } from '@/components/DownloadZipButton';

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

  statusBar.appendChild(counts);
  statusBar.appendChild(startPauseBtn);

  // ── Concurrency section ───────────────────────────────────────────────────

  const concurrencySection = document.createElement('div');
  concurrencySection.className = 'queue-controls__concurrency';

  // Radio: one-at-a-time vs parallel
  const oneAtATimeLabel = document.createElement('label');
  oneAtATimeLabel.className = 'queue-controls__radio-label';
  const oneAtATimeRadio = document.createElement('input');
  oneAtATimeRadio.type = 'radio';
  oneAtATimeRadio.name = 'concurrency-mode';
  oneAtATimeRadio.value = 'one';
  oneAtATimeRadio.className = 'queue-controls__radio';
  oneAtATimeLabel.appendChild(oneAtATimeRadio);
  oneAtATimeLabel.append(' One at a time');

  const parallelLabel = document.createElement('label');
  parallelLabel.className = 'queue-controls__radio-label';
  const parallelRadio = document.createElement('input');
  parallelRadio.type = 'radio';
  parallelRadio.name = 'concurrency-mode';
  parallelRadio.value = 'parallel';
  parallelRadio.className = 'queue-controls__radio';
  parallelLabel.appendChild(parallelRadio);
  parallelLabel.append(' Parallel (');

  const parallelCount = document.createElement('input');
  parallelCount.type = 'number';
  parallelCount.min = '2';
  parallelCount.max = '8';
  parallelCount.className = 'queue-controls__concurrency-input';
  parallelCount.setAttribute('aria-label', 'Parallel concurrency count');

  parallelLabel.appendChild(parallelCount);
  parallelLabel.append(')');

  concurrencySection.appendChild(oneAtATimeLabel);
  concurrencySection.appendChild(parallelLabel);

  // ── Action buttons ────────────────────────────────────────────────────────

  const actionsBar = document.createElement('div');
  actionsBar.className = 'queue-controls__actions';

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

  actionsBar.appendChild(retryAllBtn);
  actionsBar.appendChild(clearCompletedBtn);
  actionsBar.appendChild(clearAllBtn);
  actionsBar.appendChild(downloadZipBtn);

  panel.appendChild(statusBar);
  panel.appendChild(concurrencySection);
  panel.appendChild(actionsBar);

  // ── State sync ────────────────────────────────────────────────────────────

  function syncUI(): void {
    const pState = processor.getState();
    const { items } = store.getState();
    const settings = store.getQueueSettings();

    // Counts
    const doneCount = items.filter(i => i.status === 'done').length;
    const errorCount = items.filter(i => i.status === 'error').length;
    counts.textContent = `Active: ${pState.active} · Queued: ${pState.queued} · Done: ${doneCount}${errorCount > 0 ? ` · Errors: ${errorCount}` : ''}`;

    // Start/Pause button
    startPauseBtn.textContent = pState.running ? 'Pause' : 'Start';
    startPauseBtn.setAttribute('aria-label', pState.running ? 'Pause queue' : 'Start queue');
    startPauseBtn.className = `queue-controls__start-pause${pState.running ? ' queue-controls__start-pause--running' : ''}`;

    // Concurrency radios
    const isOne = settings.concurrency === 1;
    oneAtATimeRadio.checked = isOne;
    parallelRadio.checked = !isOne;
    parallelCount.value = String(isOne ? 2 : settings.concurrency);
    parallelCount.disabled = isOne;

    // Retry-all button: only enabled when there are errored items
    retryAllBtn.disabled = !items.some(i => i.status === 'error' || i.status === 'cancelled');

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

  oneAtATimeRadio.addEventListener('change', () => {
    if (oneAtATimeRadio.checked) {
      store.setQueueSettings({ concurrency: 1 });
      syncUI();
    }
  });

  parallelRadio.addEventListener('change', () => {
    if (parallelRadio.checked) {
      const n = Math.min(8, Math.max(2, Number(parallelCount.value) || 2));
      store.setQueueSettings({ concurrency: n });
      syncUI();
    }
  });

  parallelCount.addEventListener('change', () => {
    if (parallelRadio.checked) {
      const n = Math.min(8, Math.max(2, Number(parallelCount.value) || 2));
      store.setQueueSettings({ concurrency: n });
      syncUI();
    }
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
