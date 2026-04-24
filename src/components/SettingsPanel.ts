import type { QueueStore, PerFileSettings, OutputFormat, QueueState } from '@/lib/queue/store';
import { computePairedDimension } from '@/lib/utils/resize';

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png',  label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif',  label: 'GIF' },
];

/** Formats where quality is irrelevant (lossless in our pipeline) */
const LOSSLESS_FORMATS = new Set<OutputFormat>(['png', 'gif']);

function isLossless(fmt: OutputFormat): boolean {
  return LOSSLESS_FORMATS.has(fmt);
}

/**
 * Creates a per-file settings panel that binds to the given item id.
 * The panel reacts to store changes so it stays in sync even if
 * originalDimensions arrive after initial render.
 */
export function createSettingsPanel(store: QueueStore, itemId: string): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.dataset.settingsFor = itemId;

  // ── Format row ─────────────────────────────────────────────────────────────
  const formatRow = document.createElement('div');
  formatRow.className = 'settings-panel__row';

  const formatLabel = document.createElement('label');
  formatLabel.className = 'settings-panel__field';
  formatLabel.textContent = 'Format';

  const formatSelect = document.createElement('select');
  formatSelect.className = 'settings-panel__select';
  FORMAT_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    formatSelect.appendChild(option);
  });

  formatLabel.appendChild(formatSelect);
  formatRow.appendChild(formatLabel);

  // ── Quality row ─────────────────────────────────────────────────────────────
  const qualityRow = document.createElement('div');
  qualityRow.className = 'settings-panel__row';

  const qualityLabel = document.createElement('label');
  qualityLabel.className = 'settings-panel__field';
  qualityLabel.textContent = 'Quality';

  const qualitySlider = document.createElement('input');
  qualitySlider.type = 'range';
  qualitySlider.min = '1';
  qualitySlider.max = '100';
  qualitySlider.className = 'settings-panel__slider';

  const qualityReadout = document.createElement('span');
  qualityReadout.className = 'settings-panel__quality-readout';

  const losslessNote = document.createElement('span');
  losslessNote.className = 'settings-panel__lossless-note';
  losslessNote.textContent = 'Lossless';

  qualityLabel.appendChild(qualitySlider);
  qualityLabel.appendChild(qualityReadout);
  qualityLabel.appendChild(losslessNote);
  qualityRow.appendChild(qualityLabel);

  // ── Dimensions row ──────────────────────────────────────────────────────────
  const dimsRow = document.createElement('div');
  dimsRow.className = 'settings-panel__row settings-panel__row--dims';

  const widthLabel = document.createElement('label');
  widthLabel.className = 'settings-panel__field';
  widthLabel.textContent = 'Width';

  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '1';
  widthInput.className = 'settings-panel__dim-input';
  widthInput.setAttribute('aria-label', 'Width in pixels');

  widthLabel.appendChild(widthInput);

  const heightLabel = document.createElement('label');
  heightLabel.className = 'settings-panel__field';
  heightLabel.textContent = 'Height';

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = '1';
  heightInput.className = 'settings-panel__dim-input';
  heightInput.setAttribute('aria-label', 'Height in pixels');

  heightLabel.appendChild(heightInput);

  const origNote = document.createElement('span');
  origNote.className = 'settings-panel__orig-note';
  origNote.setAttribute('data-orig-note', 'true');

  dimsRow.appendChild(widthLabel);
  const dimSep = document.createElement('span');
  dimSep.className = 'settings-panel__dim-sep';
  dimSep.textContent = '×';
  dimsRow.appendChild(dimSep);
  dimsRow.appendChild(heightLabel);
  dimsRow.appendChild(origNote);

  // ── Aspect ratio row ────────────────────────────────────────────────────────
  const aspectRow = document.createElement('div');
  aspectRow.className = 'settings-panel__row';

  const aspectLabel = document.createElement('label');
  aspectLabel.className = 'settings-panel__field settings-panel__field--checkbox';

  const aspectCheckbox = document.createElement('input');
  aspectCheckbox.type = 'checkbox';
  aspectCheckbox.className = 'settings-panel__checkbox';

  aspectLabel.appendChild(aspectCheckbox);
  aspectLabel.append(' Maintain aspect ratio');
  aspectRow.appendChild(aspectLabel);

  // ── Strip metadata row ──────────────────────────────────────────────────────
  const stripRow = document.createElement('div');
  stripRow.className = 'settings-panel__row';

  const stripLabel = document.createElement('label');
  stripLabel.className = 'settings-panel__field settings-panel__field--checkbox';

  const stripCheckbox = document.createElement('input');
  stripCheckbox.type = 'checkbox';
  stripCheckbox.className = 'settings-panel__checkbox';

  stripLabel.appendChild(stripCheckbox);
  stripLabel.append(' Strip metadata (EXIF)');
  stripRow.appendChild(stripLabel);

  // ── PNG Optimize row ────────────────────────────────────────────────────────
  const pngOptimizeRow = document.createElement('div');
  pngOptimizeRow.className = 'settings-panel__row';

  const pngOptimizeLabel = document.createElement('label');
  pngOptimizeLabel.className = 'settings-panel__field settings-panel__field--checkbox';

  const pngOptimizeCheckbox = document.createElement('input');
  pngOptimizeCheckbox.type = 'checkbox';
  pngOptimizeCheckbox.className = 'settings-panel__checkbox';

  pngOptimizeLabel.appendChild(pngOptimizeCheckbox);
  pngOptimizeLabel.append(' Optimize PNG (slower, smaller)');
  pngOptimizeRow.appendChild(pngOptimizeLabel);

  const pngOptimizeHelp = document.createElement('p');
  pngOptimizeHelp.className = 'settings-panel__help';
  pngOptimizeHelp.textContent = 'Uses UPNG for extra compression. Adds 1–3s per file.';
  pngOptimizeRow.appendChild(pngOptimizeHelp);

  panel.appendChild(formatRow);
  panel.appendChild(qualityRow);
  panel.appendChild(dimsRow);
  panel.appendChild(aspectRow);
  panel.appendChild(stripRow);
  panel.appendChild(pngOptimizeRow);

  // ── Sync helpers ────────────────────────────────────────────────────────────

  function getItem() {
    return store.getState().items.find(i => i.id === itemId);
  }

  function syncToSettings(settings: PerFileSettings, origDims?: { width: number; height: number }): void {
    formatSelect.value = settings.format;

    const lossless = isLossless(settings.format);
    qualitySlider.value = String(settings.quality);
    qualityReadout.textContent = String(settings.quality);
    qualitySlider.disabled = lossless;
    qualityReadout.style.display = lossless ? 'none' : '';
    losslessNote.style.display = lossless ? '' : 'none';

    widthInput.value = settings.width !== null ? String(settings.width) : '';
    heightInput.value = settings.height !== null ? String(settings.height) : '';

    if (origDims) {
      widthInput.placeholder = String(origDims.width);
      heightInput.placeholder = String(origDims.height);
      origNote.textContent = `orig: ${origDims.width} × ${origDims.height}`;
      origNote.style.display = '';
    } else {
      widthInput.placeholder = '';
      heightInput.placeholder = '';
      origNote.style.display = 'none';
    }

    aspectCheckbox.checked = settings.maintainAspect;
    stripCheckbox.checked = settings.stripMetadata;

    const isPng = settings.format === 'png';
    pngOptimizeRow.style.display = isPng ? '' : 'none';
    pngOptimizeCheckbox.checked = settings.pngOptimize;
  }

  // Initial render
  const initialItem = getItem();
  if (initialItem) {
    syncToSettings(initialItem.settings, initialItem.originalDimensions);
  }

  // Subscribe to store for dimension updates and external setting changes
  const unsubscribe = store.subscribe((_state: QueueState) => {
    const item = getItem();
    if (!item) {
      unsubscribe();
      return;
    }
    syncToSettings(item.settings, item.originalDimensions);
  });

  // ── Event handlers ──────────────────────────────────────────────────────────

  formatSelect.addEventListener('change', () => {
    store.updateFileSettings(itemId, { format: formatSelect.value as OutputFormat });
  });

  qualitySlider.addEventListener('input', () => {
    const q = Number(qualitySlider.value);
    qualityReadout.textContent = String(q);
    store.updateFileSettings(itemId, { quality: q });
  });

  widthInput.addEventListener('change', () => {
    const raw = widthInput.value.trim();
    const item = getItem();
    if (!item) return;

    if (raw === '') {
      // Clear both if aspect locked
      if (item.settings.maintainAspect) {
        store.updateFileSettings(itemId, { width: null, height: null });
      } else {
        store.updateFileSettings(itemId, { width: null });
      }
      return;
    }

    const w = Math.max(1, Math.round(Number(raw)));
    if (item.settings.maintainAspect && item.originalDimensions) {
      const h = computePairedDimension({
        edited: 'width',
        value: w,
        originalWidth: item.originalDimensions.width,
        originalHeight: item.originalDimensions.height,
      });
      store.updateFileSettings(itemId, { width: w, height: h });
    } else {
      store.updateFileSettings(itemId, { width: w });
    }
  });

  heightInput.addEventListener('change', () => {
    const raw = heightInput.value.trim();
    const item = getItem();
    if (!item) return;

    if (raw === '') {
      if (item.settings.maintainAspect) {
        store.updateFileSettings(itemId, { width: null, height: null });
      } else {
        store.updateFileSettings(itemId, { height: null });
      }
      return;
    }

    const h = Math.max(1, Math.round(Number(raw)));
    if (item.settings.maintainAspect && item.originalDimensions) {
      const w = computePairedDimension({
        edited: 'height',
        value: h,
        originalWidth: item.originalDimensions.width,
        originalHeight: item.originalDimensions.height,
      });
      store.updateFileSettings(itemId, { width: w, height: h });
    } else {
      store.updateFileSettings(itemId, { height: h });
    }
  });

  aspectCheckbox.addEventListener('change', () => {
    store.updateFileSettings(itemId, { maintainAspect: aspectCheckbox.checked });
  });

  stripCheckbox.addEventListener('change', () => {
    store.updateFileSettings(itemId, { stripMetadata: stripCheckbox.checked });
  });

  pngOptimizeCheckbox.addEventListener('change', () => {
    store.updateFileSettings(itemId, { pngOptimize: pngOptimizeCheckbox.checked });
  });

  return panel;
}
