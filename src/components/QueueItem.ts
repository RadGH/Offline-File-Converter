import type { QueueItem as QueueItemData } from '@/lib/queue/store';
import type { QueueStore } from '@/lib/queue/store';
import { formatBytes } from '@/lib/utils/format-bytes';

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Waiting',
  processing: 'Processing',
  done: 'Done',
  error: 'Error',
  cancelled: 'Cancelled',
};

export function createQueueItemEl(
  item: QueueItemData,
  store: QueueStore
): HTMLElement {
  const el = document.createElement('div');
  el.className = `queue-item queue-item--${item.status}`;
  el.dataset.id = item.id;

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
  el.appendChild(removeBtn);

  // Cleanup object URL when element is removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(el)) {
      URL.revokeObjectURL(objectUrl);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return el;
}
