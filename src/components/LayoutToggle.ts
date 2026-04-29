/**
 * Header button that switches between the two advanced-panel layouts
 * (inline accordion ↔ side-panel dialog) so the user can compare them.
 */

import type { QueueStore } from '@/lib/queue/store';

export function createLayoutToggle(store: QueueStore, onOpenDialog: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'rd-layout-toggle';

  const label = document.createElement('span');
  label.className = 'rd-layout-toggle__label';
  label.textContent = 'Layout:';

  const inlineBtn = document.createElement('button');
  inlineBtn.type = 'button';
  inlineBtn.className = 'rd-unit-btn';
  inlineBtn.textContent = 'Inline';
  inlineBtn.title = 'Show advanced controls beneath the settings panel';

  const dialogBtn = document.createElement('button');
  dialogBtn.type = 'button';
  dialogBtn.className = 'rd-unit-btn';
  dialogBtn.textContent = 'Dialog';
  dialogBtn.title = 'Show advanced controls in a side panel';

  const group = document.createElement('div');
  group.className = 'rd-unit-toggle';
  group.append(inlineBtn, dialogBtn);

  const advBtn = document.createElement('button');
  advBtn.type = 'button';
  advBtn.className = 'rd-btn rd-btn--secondary rd-layout-toggle__open';
  advBtn.textContent = 'Advanced…';
  advBtn.style.display = 'none';
  advBtn.addEventListener('click', () => onOpenDialog());

  wrap.append(label, group, advBtn);

  function sync(): void {
    const layout = store.getAdvancedUi().layout;
    inlineBtn.classList.toggle('rd-unit-btn--active', layout === 'inline');
    dialogBtn.classList.toggle('rd-unit-btn--active', layout === 'dialog');
    advBtn.style.display = layout === 'dialog' ? '' : 'none';
  }
  sync();
  store.subscribe(() => sync());

  inlineBtn.addEventListener('click', () => store.setAdvancedUi({ layout: 'inline' }));
  dialogBtn.addEventListener('click', () => store.setAdvancedUi({ layout: 'dialog' }));

  return wrap;
}
