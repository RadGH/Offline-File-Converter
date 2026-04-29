import type { QueueItem as QueueItemData, OutputFormat } from '@/lib/queue/store';
import type { QueueStore } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { formatBytes } from '@/lib/utils/format-bytes';
import { settingsDiffer } from '@/lib/utils/settings-differ';

export { settingsDiffer };

const FORMAT_FACTOR: Record<OutputFormat, number> = {
  auto: 0.55,
  jpeg: 0.55,
  webp: 0.45,
  avif: 0.25,
  png: 0.70,
  gif: 1.00,
  'gif-animated': 1.50,
  'webp-animated': 0.80,
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

/** Estimate upscale duration from image dimensions.
 *  Baseline: ~65s per 256×256 tile on single-threaded WASM — the self-correcting
 *  logic in the render path replaces this with the observed rate once inference
 *  is ≥10% in, so this is just the first guess before any real data. */
function estimateUpscaleTotalMs(item: QueueItemData): number {
  const dims = item.originalDimensions;
  if (!dims) return 65_000;
  const step = 224; // 256 tile minus 32 overlap
  const tiles = Math.max(1, Math.ceil(dims.width / step)) * Math.max(1, Math.ceil(dims.height / step));
  return tiles * 65_000;
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

/** Tracks which items have their compare panel open. */
const compareOpen = new Map<string, boolean>();

/** Blob URLs for thumbnails, keyed by item id. Created on first render and
 *  reused across re-renders so rapid store updates (e.g. progress ticks)
 *  don't churn URLs and cause net::ERR_FILE_NOT_FOUND on in-flight loads. */
const thumbUrlCache = new Map<string, string>();

function getOrCreateThumbUrl(item: QueueItemData): string {
  let url = thumbUrlCache.get(item.id);
  if (!url) {
    url = URL.createObjectURL(item.file);
    thumbUrlCache.set(item.id, url);
  }
  return url;
}

/** Called by FileQueue when an item is removed from the store — revokes its
 *  cached blob URL and drops companion state. */
export function disposeQueueItem(itemId: string): void {
  const url = thumbUrlCache.get(itemId);
  if (url) {
    URL.revokeObjectURL(url);
    thumbUrlCache.delete(itemId);
  }
  compareOpen.delete(itemId);
}

/** Integer percent saved; negative if larger. */
function savedPct(originalSize: number, outSize: number): number {
  if (originalSize === 0) return 0;
  return Math.round(((originalSize - outSize) / originalSize) * 100);
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

  const thumb = document.createElement('img');
  thumb.className = 'queue-item__thumb';
  thumb.alt = item.file.name;
  const originalUrl = getOrCreateThumbUrl(item);
  thumb.src = originalUrl;

  const info = document.createElement('div');
  info.className = 'queue-item__info';

  const name = document.createElement('span');
  name.className = 'queue-item__name';
  name.textContent = item.file.name;
  name.title = item.file.name;

  const meta = document.createElement('span');
  meta.className = 'queue-item__meta';

  if (item.status === 'done' && item.result) {
    meta.textContent = `${formatBytes(item.file.size)} → ${formatBytes(item.result.outSize)}`;
  } else {
    const estSize = estimatedOutputSize(item);
    const estText = estSize !== null ? ` · ≈ ${formatBytes(estSize)} expected` : '';
    meta.textContent = formatBytes(item.file.size) + estText;
  }

  info.appendChild(name);
  info.appendChild(meta);

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

  // Dedicated upscale progress bar + ETA while inference is in flight.
  if (item.status === 'processing' && item.upscaleStartedAt) {
    const upscaleWrap = document.createElement('div');
    upscaleWrap.className = 'queue-item__upscale-row';

    const upBar = document.createElement('div');
    upBar.className = 'queue-item__upscale-bar';
    const upFill = document.createElement('div');
    upFill.className = 'queue-item__upscale-fill';
    upBar.appendChild(upFill);

    const etaText = document.createElement('span');
    etaText.className = 'queue-item__upscale-eta';

    upscaleWrap.appendChild(upBar);
    upscaleWrap.appendChild(etaText);
    info.appendChild(upscaleWrap);

    const startedAt = item.upscaleStartedAt;
    function refreshEta(): void {
      const elapsed = Date.now() - startedAt;
      const pctPhase = Math.max(0, Math.min(1, (item.progress - 5) / 65));
      const baselineTotal = estimateUpscaleTotalMs(item);
      // Once ≥10% through, trust the actual rate; otherwise use the baseline.
      const estTotal = pctPhase > 0.1 ? elapsed / pctPhase : baselineTotal;
      const remaining = Math.max(0, estTotal - elapsed);
      const pctDisplay = Math.min(100, Math.round((elapsed / estTotal) * 100));
      upFill.style.width = `${pctDisplay}%`;
      etaText.textContent =
        remaining < 1000
          ? `↑ Finalising upscale…`
          : `↑ Upscaling · ~${formatDuration(remaining)} remaining · ${formatDuration(elapsed)} elapsed`;
      upBar.setAttribute('aria-valuenow', String(pctDisplay));
    }
    refreshEta();

    // Tick every second so the countdown feels alive between progress events.
    const tickId = window.setInterval(refreshEta, 1000);
    // Clear when the wrapper is dropped from the DOM by the next FileQueue render.
    const obs = new MutationObserver(() => {
      if (!document.contains(wrapper)) {
        clearInterval(tickId);
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (item.error) {
    const errMsg = document.createElement('span');
    errMsg.className = 'queue-item__error';
    errMsg.textContent = item.error;
    info.appendChild(errMsg);
  }

  // Prominent saved-% bubble — shown only when done and we have a meaningful change
  let savedBubble: HTMLElement | null = null;
  if (item.status === 'done' && item.result) {
    const pct = savedPct(item.file.size, item.result.outSize);
    savedBubble = document.createElement('span');
    const polarity = pct > 0 ? 'saved' : pct < 0 ? 'larger' : 'same';
    savedBubble.className = `queue-item__saved queue-item__saved--${polarity}`;
    if (pct > 0) savedBubble.textContent = `−${pct}%`;
    else if (pct < 0) savedBubble.textContent = `+${Math.abs(pct)}%`;
    else savedBubble.textContent = '±0%';
    savedBubble.title = pct > 0 ? `${pct}% smaller than original`
      : pct < 0 ? `${Math.abs(pct)}% larger than original`
      : 'Same size as original';
  }

  // Upscaled bubble — shown when AI upscaling ran
  let upscaledBubble: HTMLElement | null = null;
  if (item.upscaledBy) {
    upscaledBubble = document.createElement('span');
    upscaledBubble.className = 'queue-item__upscaled';
    upscaledBubble.textContent = `↑ Upscaled ${item.upscaledBy}×`;
    upscaledBubble.title = `AI upscaling applied (${item.upscaledBy}× super-resolution)`;
  }

  const badge = document.createElement('span');
  badge.className = `queue-item__badge queue-item__badge--${item.status}`;
  badge.textContent = STATUS_LABELS[item.status] ?? item.status;

  // Actions
  const actions = document.createElement('div');
  actions.className = 'queue-item__actions';

  if (item.status === 'waiting' || item.status === 'processing') {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'queue-item__cancel-btn';
    cancelBtn.setAttribute('aria-label', `Cancel ${item.file.name}`);
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => processor.cancelItem(item.id));
    actions.appendChild(cancelBtn);
  }

  if (item.status === 'error' || item.status === 'cancelled') {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'queue-item__retry-btn';
    retryBtn.setAttribute('aria-label', `Retry ${item.file.name}`);
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => processor.retryItem(item.id));
    actions.appendChild(retryBtn);
  }

  // Compare panel (lazy) + Compare + Download buttons — only when done
  let comparePanel: HTMLElement | null = null;
  let compareBtn: HTMLButtonElement | null = null;

  const comparePanelId = `compare-panel-${item.id}`;

  function setCompareOpen(open: boolean): void {
    compareOpen.set(item.id, open);
    if (!compareBtn) return;
    compareBtn.setAttribute('aria-expanded', String(open));
    compareBtn.textContent = open ? 'Hide compare' : 'Compare';

    if (open) {
      if (!comparePanel && item.result) {
        comparePanel = buildComparePanel(comparePanelId, originalUrl, item.result.blob);
        wrapper.appendChild(comparePanel);
      }
      if (comparePanel) comparePanel.style.display = '';
    } else if (comparePanel) {
      comparePanel.style.display = 'none';
    }
  }

  // Source rows render no Compare/Download/Reconvert. Conversion children
  // get Compare + Download. Re-convert is removed; the new Convert button
  // in the settings card is the single mechanism to add new conversions.
  const isSource = !!item.isSource;
  if (!isSource && item.status === 'done' && item.result) {
    compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'queue-item__compare-btn';
    compareBtn.setAttribute('aria-controls', comparePanelId);
    compareBtn.setAttribute('aria-expanded', 'false');
    compareBtn.textContent = 'Compare';
    compareBtn.addEventListener('click', () => {
      const current = compareOpen.get(item.id) ?? false;
      setCompareOpen(!current);
    });
    actions.appendChild(compareBtn);

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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    actions.appendChild(dlBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'queue-item__remove';
  removeBtn.type = 'button';
  removeBtn.setAttribute('aria-label', `Remove ${item.file.name}`);
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    // The item's blob URL and companion state are revoked by FileQueue when
    // it notices the item has dropped out of the store.
    store.removeFile(item.id);
  });

  el.appendChild(thumb);
  el.appendChild(info);
  if (!isSource && savedBubble) el.appendChild(savedBubble);
  if (!isSource && upscaledBubble) el.appendChild(upscaledBubble);
  if (!isSource) el.appendChild(badge);
  el.appendChild(actions);
  el.appendChild(removeBtn);

  wrapper.appendChild(el);

  // Restore compare-panel open state across re-renders
  if (compareOpen.get(item.id)) setCompareOpen(true);

  return wrapper;
}

/** Before/after slider comparison panel. `before` is the original Blob URL; `after` is the result Blob. */
function buildComparePanel(panelId: string, beforeUrl: string, afterBlob: Blob): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'compare-panel';
  panel.id = panelId;

  // Prevent drag gestures inside the compare panel from bubbling up to the
  // document-level drop handler (which would try to add files).
  panel.addEventListener('dragstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  panel.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  const viewport = document.createElement('div');
  viewport.className = 'compare-panel__viewport';

  const afterUrl = URL.createObjectURL(afterBlob);

  const afterImg = document.createElement('img');
  afterImg.className = 'compare-panel__after';
  afterImg.alt = 'Converted result';
  afterImg.src = afterUrl;
  afterImg.draggable = false;

  const beforeClip = document.createElement('div');
  beforeClip.className = 'compare-panel__before-clip';

  const beforeImg = document.createElement('img');
  beforeImg.className = 'compare-panel__before';
  beforeImg.alt = 'Original';
  beforeImg.src = beforeUrl;
  beforeImg.draggable = false;
  beforeClip.appendChild(beforeImg);

  const handle = document.createElement('div');
  handle.className = 'compare-panel__handle';

  viewport.appendChild(afterImg);
  viewport.appendChild(beforeClip);
  viewport.appendChild(handle);

  viewport.style.setProperty('--split', '50%');

  const labels = document.createElement('div');
  labels.className = 'compare-panel__labels';
  labels.innerHTML = `<span class="compare-panel__label">Original</span><span class="compare-panel__label">Converted</span>`;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '50';
  slider.className = 'compare-panel__slider';
  slider.setAttribute('aria-label', 'Compare slider: left is original, right is converted');

  function setSplit(v: number): void {
    const pct = Math.max(0, Math.min(100, v));
    viewport.style.setProperty('--split', `${pct}%`);
  }
  slider.addEventListener('input', () => setSplit(Number(slider.value)));

  // Drag on the viewport for more direct interaction
  let dragging = false;
  function handlePointer(e: PointerEvent): void {
    const rect = viewport.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    slider.value = String(Math.round(pct));
    setSplit(pct);
  }
  viewport.addEventListener('pointerdown', (e) => { dragging = true; handlePointer(e); });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => { if (dragging) handlePointer(e); });

  panel.appendChild(labels);
  panel.appendChild(viewport);
  panel.appendChild(slider);

  // Revoke the after URL when the panel is removed from the DOM
  const obs = new MutationObserver(() => {
    if (!document.contains(panel)) {
      URL.revokeObjectURL(afterUrl);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  return panel;
}
