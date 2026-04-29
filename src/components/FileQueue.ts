import type { QueueStore } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { createQueueItemEl, disposeQueueItem } from '@/components/QueueItem';

/**
 * Renders the queue as a nested tree:
 *   - Top level: SOURCE rows (one per uploaded file). Click selects.
 *   - Nested under each source: CONVERSION children, indented.
 *
 * Sources show no Download/Compare/Reconvert buttons — only Remove.
 * Children show Download/Compare/Remove (no Reconvert; new conversions are
 * created by clicking the Convert button in the settings card).
 */
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

  let renderedIds = new Set<string>();

  function render(): void {
    const state = store.getState();
    const items = state.items;
    const currentIds = new Set(items.map(i => i.id));

    for (const prevId of renderedIds) {
      if (!currentIds.has(prevId)) disposeQueueItem(prevId);
    }
    renderedIds = currentIds;

    list.innerHTML = '';

    if (items.length === 0) {
      emptyMsg.style.display = '';
      list.style.display = 'none';
      return;
    }

    emptyMsg.style.display = 'none';
    list.style.display = '';

    const sources = items.filter(i => i.isSource);
    const conversionsByParent = new Map<string, typeof items>();
    for (const item of items) {
      if (!item.isSource && item.parentId) {
        const arr = conversionsByParent.get(item.parentId) ?? [];
        arr.push(item);
        conversionsByParent.set(item.parentId, arr);
      }
    }

    // Legacy: items without isSource and without parentId (shouldn't happen in
    // new flow but keep them rendering as flat rows for safety).
    const orphans = items.filter(i => !i.isSource && !i.parentId);

    for (const src of sources) {
      const group = document.createElement('div');
      group.className = 'queue-group';
      if (state.selectedSourceId === src.id) group.classList.add('queue-group--selected');

      const sourceEl = createQueueItemEl(src, store, processor);
      sourceEl.classList.add('queue-item--source');
      sourceEl.addEventListener('click', (e) => {
        // Don't steal clicks from the remove button etc.
        const t = e.target as HTMLElement;
        if (t.closest('button, a, input, select')) return;
        store.selectSource(src.id);
      });
      group.appendChild(sourceEl);

      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'queue-group__children';
      const children = conversionsByParent.get(src.id) ?? [];
      for (const child of children) {
        const childEl = createQueueItemEl(child, store, processor);
        childEl.classList.add('queue-item--conversion');
        childrenWrap.appendChild(childEl);
      }
      group.appendChild(childrenWrap);

      list.appendChild(group);
    }

    for (const orphan of orphans) {
      list.appendChild(createQueueItemEl(orphan, store, processor));
    }
  }

  render();
  store.subscribe(render);

  return container;
}
