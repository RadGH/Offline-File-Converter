export type AdSlotName = 'top-banner' | 'sidebar' | 'bottom-banner';
export type AdSlotSize = '728x90' | '300x600';

export interface AdSlotOptions {
  slot: AdSlotName;
  size: AdSlotSize;
}

export function createAdSlot({ slot, size }: AdSlotOptions): HTMLElement {
  const [w, h] = size.split('x');

  const el = document.createElement('div');
  el.className = `ad-slot ad-slot--${slot}`;
  el.dataset.slot = slot;
  el.setAttribute('aria-label', 'Advertisement');

  const label = document.createElement('span');
  label.className = 'ad-slot__label';
  label.textContent = '[Advertisement]';

  const dims = document.createElement('span');
  dims.className = 'ad-slot__size';
  dims.textContent = `${w} × ${h}`;

  el.appendChild(label);
  el.appendChild(dims);

  return el;
}
