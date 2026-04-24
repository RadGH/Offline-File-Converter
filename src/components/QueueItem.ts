import type { QueueItem as QueueItemData } from '@/lib/queue/store';
import type { QueueStore } from '@/lib/queue/store';
import { formatBytes } from '@/lib/utils/format-bytes';
import { createSettingsPanel } from '@/components/SettingsPanel';
import { convert } from '@/lib/converters/index';

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
  store: QueueStore
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
    meta.textContent = formatBytes(item.file.size);
  }

  info.appendChild(name);
  info.appendChild(meta);

  // Progress bar (visible when processing)
  const progressBar = document.createElement('div');
  progressBar.className = 'queue-item__progress-bar';
  progressBar.style.display = item.status === 'processing' ? '' : 'none';

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

  // Convert button — shown when waiting or error
  if (item.status === 'waiting' || item.status === 'error') {
    const convertBtn = document.createElement('button');
    convertBtn.type = 'button';
    convertBtn.className = 'queue-item__convert-btn';
    convertBtn.setAttribute('aria-label', `Convert ${item.file.name}`);
    convertBtn.textContent = 'Convert';

    convertBtn.addEventListener('click', async () => {
      store.setStatus(item.id, 'processing');
      store.setProgress(item.id, 0);

      try {
        const result = await convert(
          {
            file: item.file,
            settings: item.settings,
            originalDimensions: item.originalDimensions,
          },
          (pct) => store.setProgress(item.id, pct)
        );

        store.setResult(item.id, {
          blob: result.blob,
          outName: result.outName,
          outSize: result.outSize,
        });
        // setResult already sets status to 'done' and progress to 100
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        store.setError(item.id, msg);
      }
    });

    actions.appendChild(convertBtn);
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
  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'queue-item__expand';
  expandBtn.setAttribute('aria-label', `Toggle settings for ${item.file.name}`);

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
