import type { QueueStore, PerFileSettings, OutputFormat } from '@/lib/queue/store';
import { computePairedDimension } from '@/lib/utils/resize';

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png',  label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif',  label: 'GIF' },
];

const LOSSLESS_FORMATS = new Set<OutputFormat>(['png', 'gif']);

function isLossless(fmt: OutputFormat): boolean {
  return LOSSLESS_FORMATS.has(fmt);
}

/**
 * Creates the global defaults panel that sits above the file queue.
 * Changes here do NOT retroactively affect existing queue items.
 */
export function createGlobalDefaults(store: QueueStore): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'global-defaults';

  // ── Header / toggle ─────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'global-defaults__header';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'global-defaults__toggle';
  toggle.setAttribute('aria-expanded', 'true');

  const chevron = document.createElement('span');
  chevron.className = 'global-defaults__chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  const title = document.createElement('span');
  title.className = 'global-defaults__title';
  title.textContent = 'Default Settings';

  const note = document.createElement('span');
  note.className = 'global-defaults__note';
  note.textContent = 'Applied to new files only.';

  toggle.appendChild(chevron);
  toggle.appendChild(title);
  header.appendChild(toggle);
  header.appendChild(note);

  // ── Body ────────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'global-defaults__body';

  // Format
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

  // Quality
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

  // Width / Height
  const dimsRow = document.createElement('div');
  dimsRow.className = 'settings-panel__row settings-panel__row--dims';
  const widthLabel = document.createElement('label');
  widthLabel.className = 'settings-panel__field';
  widthLabel.textContent = 'Width';
  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '1';
  widthInput.placeholder = 'px';
  widthInput.className = 'settings-panel__dim-input';
  widthLabel.appendChild(widthInput);
  const heightLabel = document.createElement('label');
  heightLabel.className = 'settings-panel__field';
  heightLabel.textContent = 'Height';
  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = '1';
  heightInput.placeholder = 'px';
  heightInput.className = 'settings-panel__dim-input';
  heightLabel.appendChild(heightInput);
  const dimSep = document.createElement('span');
  dimSep.className = 'settings-panel__dim-sep';
  dimSep.textContent = '×';
  dimsRow.appendChild(widthLabel);
  dimsRow.appendChild(dimSep);
  dimsRow.appendChild(heightLabel);

  // Aspect ratio
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

  // Strip metadata
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

  // PNG Optimize
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

  body.appendChild(formatRow);
  body.appendChild(qualityRow);
  body.appendChild(dimsRow);
  body.appendChild(aspectRow);
  body.appendChild(stripRow);
  body.appendChild(pngOptimizeRow);

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  // ── Collapse toggle ─────────────────────────────────────────────────────────
  let isOpen = true;

  function setOpen(open: boolean): void {
    isOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    body.style.display = open ? '' : 'none';
    chevron.textContent = open ? '▾' : '▸';
    wrapper.classList.toggle('global-defaults--collapsed', !open);
  }

  toggle.addEventListener('click', () => setOpen(!isOpen));

  // ── Sync helpers ────────────────────────────────────────────────────────────

  function syncFromDefaults(defaults: PerFileSettings): void {
    formatSelect.value = defaults.format;
    const lossless = isLossless(defaults.format);
    qualitySlider.value = String(defaults.quality);
    qualityReadout.textContent = String(defaults.quality);
    qualitySlider.disabled = lossless;
    qualityReadout.style.display = lossless ? 'none' : '';
    losslessNote.style.display = lossless ? '' : 'none';
    widthInput.value = defaults.width !== null ? String(defaults.width) : '';
    heightInput.value = defaults.height !== null ? String(defaults.height) : '';
    aspectCheckbox.checked = defaults.maintainAspect;
    stripCheckbox.checked = defaults.stripMetadata;

    const isPng = defaults.format === 'png';
    pngOptimizeRow.style.display = isPng ? '' : 'none';
    pngOptimizeCheckbox.checked = defaults.pngOptimize;
  }

  // Initial sync
  syncFromDefaults(store.getGlobalDefaults());

  // ── Event handlers ──────────────────────────────────────────────────────────

  formatSelect.addEventListener('change', () => {
    store.setGlobalDefaults({ format: formatSelect.value as OutputFormat });
    syncFromDefaults(store.getGlobalDefaults());
  });

  qualitySlider.addEventListener('input', () => {
    const q = Number(qualitySlider.value);
    qualityReadout.textContent = String(q);
    store.setGlobalDefaults({ quality: q });
  });

  widthInput.addEventListener('change', () => {
    const raw = widthInput.value.trim();
    const defaults = store.getGlobalDefaults();
    if (raw === '') {
      if (defaults.maintainAspect) {
        store.setGlobalDefaults({ width: null, height: null });
        heightInput.value = '';
      } else {
        store.setGlobalDefaults({ width: null });
      }
      return;
    }
    const w = Math.max(1, Math.round(Number(raw)));
    if (defaults.maintainAspect && defaults.width !== null && defaults.height !== null) {
      const h = computePairedDimension({
        edited: 'width',
        value: w,
        originalWidth: defaults.width,
        originalHeight: defaults.height,
      });
      store.setGlobalDefaults({ width: w, height: h });
      heightInput.value = String(h);
    } else {
      store.setGlobalDefaults({ width: w });
    }
  });

  heightInput.addEventListener('change', () => {
    const raw = heightInput.value.trim();
    const defaults = store.getGlobalDefaults();
    if (raw === '') {
      if (defaults.maintainAspect) {
        store.setGlobalDefaults({ width: null, height: null });
        widthInput.value = '';
      } else {
        store.setGlobalDefaults({ height: null });
      }
      return;
    }
    const h = Math.max(1, Math.round(Number(raw)));
    if (defaults.maintainAspect && defaults.width !== null && defaults.height !== null) {
      const w = computePairedDimension({
        edited: 'height',
        value: h,
        originalWidth: defaults.width,
        originalHeight: defaults.height,
      });
      store.setGlobalDefaults({ width: w, height: h });
      widthInput.value = String(w);
    } else {
      store.setGlobalDefaults({ height: h });
    }
  });

  aspectCheckbox.addEventListener('change', () => {
    store.setGlobalDefaults({ maintainAspect: aspectCheckbox.checked });
  });

  stripCheckbox.addEventListener('change', () => {
    store.setGlobalDefaults({ stripMetadata: stripCheckbox.checked });
  });

  pngOptimizeCheckbox.addEventListener('change', () => {
    store.setGlobalDefaults({ pngOptimize: pngOptimizeCheckbox.checked });
  });

  return wrapper;
}
