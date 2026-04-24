import type { QueueStore } from '@/lib/queue/store';
import { createQueueItemEl } from '@/components/QueueItem';

export function createFileQueue(store: QueueStore): HTMLElement {
  const container = document.createElement('div');
  container.className = 'file-queue';

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'file-queue__empty';
  emptyMsg.textContent = 'No files yet. Drop images above or click to browse.';
  container.appendChild(emptyMsg);

  const list = document.createElement('div');
  list.className = 'file-queue__list';
  container.appendChild(list);

  function render(): void {
    const { items } = store.getState();
    list.innerHTML = '';

    if (items.length === 0) {
      emptyMsg.style.display = '';
      list.style.display = 'none';
    } else {
      emptyMsg.style.display = 'none';
      list.style.display = '';
      items.forEach(item => {
        list.appendChild(createQueueItemEl(item, store));
      });
    }
  }

  render();
  store.subscribe(render);

  return container;
}
