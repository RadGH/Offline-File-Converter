import type { QueueStore } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { createQueueItemEl, disposeQueueItem } from '@/components/QueueItem';

export function createFileQueue(store: QueueStore, processor: QueueProcessor): HTMLElement {
  const container = document.createElement('div');
  container.className = 'file-queue';

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'file-queue__empty';
  emptyMsg.textContent = 'No files yet. Drop images above or click to browse.';
  container.appendChild(emptyMsg);

  const list = document.createElement('div');
  list.className = 'file-queue__list';
  container.appendChild(list);

  // Track which ids are currently rendered so we can dispose (revoke blob URLs)
  // for items that leave the store on the next render.
  let renderedIds = new Set<string>();

  function render(): void {
    const { items } = store.getState();
    const currentIds = new Set(items.map(i => i.id));

    // Any id that was rendered but is no longer in state → dispose.
    for (const prevId of renderedIds) {
      if (!currentIds.has(prevId)) disposeQueueItem(prevId);
    }
    renderedIds = currentIds;

    list.innerHTML = '';

    if (items.length === 0) {
      emptyMsg.style.display = '';
      list.style.display = 'none';
    } else {
      emptyMsg.style.display = 'none';
      list.style.display = '';
      items.forEach(item => {
        list.appendChild(createQueueItemEl(item, store, processor));
      });
    }
  }

  render();
  store.subscribe(render);

  return container;
}
