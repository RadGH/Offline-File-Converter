import type { QueueItem as QueueItemData } from '@/lib/queue/store';
import type { QueueStore } from '@/lib/queue/store';
import { formatBytes } from '@/lib/utils/format-bytes';
import { createSettingsPanel } from '@/components/SettingsPanel';

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting',
  processing: 'Processing',
  done: 'Done',
  error: 'Error',
  cancelled: 'Cancelled',
};

/** Tracks which items have their settings panel expanded. */
const expandedState = new Map<string, boolean>();

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
  meta.textContent = formatBytes(item.file.size);

  info.appendChild(name);
  info.appendChild(meta);

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
