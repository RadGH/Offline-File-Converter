import type { QueueItem as QueueItemData, OutputFormat } from '@/lib/queue/store';
import type { QueueStore } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { formatBytes } from '@/lib/utils/format-bytes';
import { createSettingsPanel } from '@/components/SettingsPanel';

/** Format factors for estimated output size heuristic. */
const FORMAT_FACTOR: Record<OutputFormat, number> = {
  jpeg: 0.55,
  webp: 0.45,
  avif: 0.25,
  png: 0.70,
  gif: 1.00,
};

function estimatedOutputSize(item: QueueItemData): number | null {
  if (!item.originalDimensions) return null;
  if (item.status !== 'waiting') return null;
  const factor = FORMAT_FACTOR[item.settings.format] ?? 0.55;
  const q = item.settings.quality / 100;
  return Math.round(item.file.size * q * factor);
}

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting',
  processing: 'Processing',
  done: 'Done',
  error: 'Error',
  cancelled: 'Cancelled',
};

/** Tracks which items have their settings panel expanded. */
const expandedState = new Map<string, boolean>();

/** Returns "62% saved" style string. Positive pct = saved, negative = larger. */
function formatSavedPct(originalSize: number, outSize: number): string {
  if (originalSize === 0) return '';
  const delta = originalSize - outSize;
  const pct = Math.round((delta / originalSize) * 100);
  if (pct > 0) return `${pct}% saved`;
  if (pct < 0) return `${Math.abs(pct)}% larger`;
  return 'same size';
}

export function createQueueItemEl(
  item: QueueItemData,
  store: QueueStore,
  processor: QueueProcessor
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'queue-item-wrapper';
  wrapper.dataset.id = item.id;

  const el = document.createElement('div');
  el.className = `queue-item queue-item--${item.status}`;

  // Thumbnail
  const thumb = document.createElement('img');
  thumb.className = 'queue-item__thumb';
  thumb.alt = item.file.name;
  const objectUrl = URL.createObjectURL(item.file);
  thumb.src = objectUrl;

  // Info column
  const info = document.createElement('div');
  info.className = 'queue-item__info';

  const name = document.createElement('span');
  name.className = 'queue-item__name';
  name.textContent = item.file.name;
  name.title = item.file.name;

  const meta = document.createElement('span');
  meta.className = 'queue-item__meta';

  if (item.status === 'done' && item.result) {
    const saved = formatSavedPct(item.file.size, item.result.outSize);
    meta.textContent = `${formatBytes(item.file.size)} → ${formatBytes(item.result.outSize)}${saved ? ` (${saved})` : ''}`;
  } else {
    const estSize = estimatedOutputSize(item);
    const estText = estSize !== null ? ` · ≈ ${formatBytes(estSize)} expected` : '';
    meta.textContent = formatBytes(item.file.size) + estText;
  }

  // Estimate span — hidden by CSS class; code stays for easy re-enable
  meta.classList.add('estimate');

  info.appendChild(name);
  info.appendChild(meta);

  // Progress bar (visible when processing)
  const progressBar = document.createElement('div');
  progressBar.className = 'queue-item__progress-bar';
  progressBar.style.display = item.status === 'processing' ? '' : 'none';
  progressBar.setAttribute('role', 'progressbar');
  progressBar.setAttribute('aria-valuemin', '0');
  progressBar.setAttribute('aria-valuemax', '100');
  progressBar.setAttribute('aria-valuenow', String(item.progress));
  progressBar.setAttribute('aria-label', `Conversion progress for ${item.file.name}`);

  const progressFill = document.createElement('div');
  progressFill.className = 'queue-item__progress-fill';
  progressFill.style.width = `${item.progress}%`;
  progressBar.appendChild(progressFill);
  info.appendChild(progressBar);

  // Status badge
  const badge = document.createElement('span');
  badge.className = `queue-item__badge queue-item__badge--${item.status}`;
  badge.textContent = STATUS_LABELS[item.status] ?? item.status;

  // Error message
  if (item.error) {
    const errMsg = document.createElement('span');
    errMsg.className = 'queue-item__error';
    errMsg.textContent = item.error;
    info.appendChild(errMsg);
  }

  // Actions column
  const actions = document.createElement('div');
  actions.className = 'queue-item__actions';

  // Cancel button — shown when waiting or processing
  if (item.status === 'waiting' || item.status === 'processing') {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'queue-item__cancel-btn';
    cancelBtn.setAttribute('aria-label', `Cancel ${item.file.name}`);
    cancelBtn.textContent = 'Cancel';

    cancelBtn.addEventListener('click', () => {
      processor.cancelItem(item.id);
    });

    actions.appendChild(cancelBtn);
  }

  // Retry button — shown when error or cancelled
  if (item.status === 'error' || item.status === 'cancelled') {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'queue-item__retry-btn';
    retryBtn.setAttribute('aria-label', `Retry ${item.file.name}`);
    retryBtn.textContent = 'Retry';

    retryBtn.addEventListener('click', () => {
      processor.retryItem(item.id);
    });

    actions.appendChild(retryBtn);
  }

  // Download button — shown when done
  if (item.status === 'done' && item.result) {
    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'queue-item__download-btn';
    dlBtn.setAttribute('aria-label', `Download ${item.result.outName}`);
    dlBtn.textContent = 'Download';

    dlBtn.addEventListener('click', () => {
      if (!item.result) return;
      const url = URL.createObjectURL(item.result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.result.outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a brief delay to allow the browser to start the download
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    actions.appendChild(dlBtn);
  }

  // Expand/collapse chevron button
  const settingsPanelId = `settings-panel-${item.id}`;
  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'queue-item__expand';
  expandBtn.setAttribute('aria-label', `Toggle settings for ${item.file.name}`);
  expandBtn.setAttribute('aria-controls', settingsPanelId);

  const isExpanded = expandedState.get(item.id) ?? false;
  expandBtn.setAttribute('aria-expanded', String(isExpanded));
  expandBtn.textContent = isExpanded ? '▾' : '▸';

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'queue-item__remove';
  removeBtn.type = 'button';
  removeBtn.setAttribute('aria-label', `Remove ${item.file.name}`);
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    URL.revokeObjectURL(objectUrl);
    store.removeFile(item.id);
  });

  el.appendChild(thumb);
  el.appendChild(info);
  el.appendChild(badge);
  el.appendChild(actions);
  el.appendChild(expandBtn);
  el.appendChild(removeBtn);

  wrapper.appendChild(el);

  // Settings panel — created lazily on first expand
  let settingsPanel: HTMLElement | null = null;

  function applyExpandState(expanded: boolean): void {
    expandedState.set(item.id, expanded);
    expandBtn.setAttribute('aria-expanded', String(expanded));
    expandBtn.textContent = expanded ? '▾' : '▸';

    if (expanded) {
      if (!settingsPanel) {
        settingsPanel = createSettingsPanel(store, item.id);
        settingsPanel.id = settingsPanelId;
        wrapper.appendChild(settingsPanel);
      }
      settingsPanel.style.display = '';
    } else if (settingsPanel) {
      settingsPanel.style.display = 'none';
    }
  }

  // Apply initial state (restores open state across re-renders)
  applyExpandState(isExpanded);

  expandBtn.addEventListener('click', () => {
    const current = expandedState.get(item.id) ?? false;
    applyExpandState(!current);
  });

  // Cleanup object URL when element is removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(wrapper)) {
      URL.revokeObjectURL(objectUrl);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return wrapper;
}
