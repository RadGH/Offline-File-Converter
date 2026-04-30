import type { QueueStore, PerFileSettings, OutputFormat } from '@/lib/queue/store';
import type { QueueProcessor } from '@/lib/queue/processor';
import { computePairedDimension } from '@/lib/utils/resize';

interface FormatOption { value: OutputFormat; label: string; group?: 'auto' | 'still' | 'animated' }
const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'auto', label: 'Automatic (match source)', group: 'auto' },
  { value: 'jpeg', label: 'JPEG', group: 'still' },
  { value: 'png',  label: 'PNG',  group: 'still' },
  { value: 'webp', label: 'WebP', group: 'still' },
  { value: 'avif', label: 'AVIF', group: 'still' },
  { value: 'gif',  label: 'GIF',  group: 'still' },
  { value: 'gif-animated',  label: 'GIF (Animated)',  group: 'animated' },
  { value: 'webp-animated', label: 'WebP (Animated)', group: 'animated' },
  { value: 'mp4',           label: 'MP4 (H.264)',     group: 'animated' },
];

const LOSSLESS_FORMATS = new Set<OutputFormat>(['png', 'gif', 'gif-animated']);

function isLossless(fmt: OutputFormat): boolean {
  return LOSSLESS_FORMATS.has(fmt);
}

/**
 * Minimal settings panel for the main entry.
 * Always visible. No upscale controls.
 *
 * Exposes: format, quality, width×height+aspect+orientation+unit, resample, strip metadata.
 * Mode toggle (auto/manual) is also here.
 */
export function createSimpleSettings(store: QueueStore, _processor: QueueProcessor): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'simple-settings';

  // ── Format row ────────────────────────────────────────────────────────────
  const formatRow = makeRow('Format');
  const formatSelect = document.createElement('select');
  formatSelect.className = 'rd-select';
  const stillGroup = document.createElement('optgroup'); stillGroup.label = 'Still';
  const animGroup = document.createElement('optgroup'); animGroup.label = 'Animated';
  FORMAT_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.group === 'auto') formatSelect.appendChild(option);
    else if (opt.group === 'animated') animGroup.appendChild(option);
    else stillGroup.appendChild(option);
  });
  formatSelect.append(stillGroup, animGroup);
  formatRow.control.appendChild(formatSelect);

  // ── Quality row ───────────────────────────────────────────────────────────
  const qualityRow = makeRow('Quality');
  const qualitySlider = document.createElement('input');
  qualitySlider.type = 'range';
  qualitySlider.min = '1';
  qualitySlider.max = '100';
  qualitySlider.className = 'rd-slider';

  const qualityReadout = document.createElement('span');
  qualityReadout.className = 'rd-quality-readout';

  const losslessNote = document.createElement('span');
  losslessNote.className = 'rd-lossless-note';
  losslessNote.textContent = 'Lossless';

  qualityRow.control.appendChild(qualitySlider);
  qualityRow.control.appendChild(qualityReadout);
  qualityRow.control.appendChild(losslessNote);

  // ── Dimensions row ────────────────────────────────────────────────────────
  const dimsRow = makeRow('Size');
  const dimWrapper = document.createElement('div');
  dimWrapper.className = 'rd-dim-row';

  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  widthInput.min = '1';
  widthInput.placeholder = 'W';
  widthInput.className = 'rd-dim-input';
  widthInput.setAttribute('aria-label', 'Width in pixels');

  const dimSep = document.createElement('span');
  dimSep.className = 'rd-dim-sep';
  dimSep.setAttribute('aria-hidden', 'true');
  dimSep.textContent = '×';

  const heightInput = document.createElement('input');
  heightInput.type = 'number';
  heightInput.min = '1';
  heightInput.placeholder = 'H';
  heightInput.className = 'rd-dim-input';
  heightInput.setAttribute('aria-label', 'Height in pixels');

  // Single % toggle button (unchecked = px, checked = percent of source)
  const pctBtn = document.createElement('button');
  pctBtn.type = 'button';
  pctBtn.className = 'rd-pct-toggle';
  pctBtn.textContent = '%';
  pctBtn.setAttribute('aria-pressed', 'false');
  pctBtn.title = 'Toggle: interpret W/H as a percent of the source';

  dimWrapper.appendChild(widthInput);
  dimWrapper.appendChild(dimSep);
  dimWrapper.appendChild(heightInput);
  dimWrapper.appendChild(pctBtn);
  dimsRow.control.appendChild(dimWrapper);

  // ── Aspect row ────────────────────────────────────────────────────────────
  const aspectRow = makeRow('');
  const aspectLabel = document.createElement('label');
  aspectLabel.className = 'rd-checkbox-label';
  const aspectCheckbox = document.createElement('input');
  aspectCheckbox.type = 'checkbox';
  aspectCheckbox.className = 'rd-checkbox';
  aspectCheckbox.setAttribute('aria-label', 'Maintain aspect ratio');
  aspectLabel.appendChild(aspectCheckbox);
  aspectLabel.append(' Maintain aspect ratio');
  aspectRow.control.appendChild(aspectLabel);

  // ── Preserve orientation row ──────────────────────────────────────────────
  const orientRow = makeRow('');
  const orientLabel = document.createElement('label');
  orientLabel.className = 'rd-checkbox-label';
  const orientCheckbox = document.createElement('input');
  orientCheckbox.type = 'checkbox';
  orientCheckbox.className = 'rd-checkbox';
  orientCheckbox.setAttribute('aria-label', 'Preserve orientation');
  orientCheckbox.title = 'When typing dimensions, the value applies to the longer side of the source image.';
  orientLabel.appendChild(orientCheckbox);
  orientLabel.append(' Preserve orientation');
  orientLabel.title = 'When typing dimensions, the value applies to the longer side of the source image.';
  orientRow.control.appendChild(orientLabel);

  // ── Resample row ──────────────────────────────────────────────────────────
  const resampleRow = makeRow('Resample');
  const resampleSelect = document.createElement('select');
  resampleSelect.className = 'rd-select';
  const resampleOptions: { value: PerFileSettings['resample']; label: string }[] = [
    { value: 'high',     label: 'High (default)' },
    { value: 'bilinear', label: 'Bilinear'        },
    { value: 'nearest',  label: 'Nearest'         },
  ];
  resampleOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    resampleSelect.appendChild(option);
  });
  resampleRow.control.appendChild(resampleSelect);

  // ── Strip metadata row ────────────────────────────────────────────────────
  const stripRow = makeRow('');
  const stripLabel = document.createElement('label');
  stripLabel.className = 'rd-checkbox-label';
  const stripCheckbox = document.createElement('input');
  stripCheckbox.type = 'checkbox';
  stripCheckbox.className = 'rd-checkbox';
  stripCheckbox.setAttribute('aria-label', 'Strip EXIF metadata');
  stripLabel.appendChild(stripCheckbox);
  stripLabel.append(' Strip metadata (EXIF)');
  stripRow.control.appendChild(stripLabel);

  // ── Convert button (acts on currently selected source) ───────────────────
  // Lives at the very bottom of the settings panel, below Resample.
  // The selected-source indicator in the queue is the visual cue — no
  // separate "Source: filename" line.
  const convertWrap = document.createElement('div');
  convertWrap.className = 'simple-convert';
  const convertBtn = document.createElement('button');
  convertBtn.type = 'button';
  convertBtn.className = 'rd-btn rd-btn--primary simple-convert__btn';
  convertBtn.textContent = 'Convert';
  convertWrap.append(convertBtn);
  convertBtn.addEventListener('click', () => {
    const id = store.getSelectedSourceId();
    if (!id) return;
    store.cloneItemWithDefaults(id);
  });
  function syncConvertBtn(): void {
    const id = store.getSelectedSourceId();
    const items = store.getState().items;
    const src = id ? items.find(i => i.id === id && i.isSource) : null;
    convertBtn.disabled = !src;
  }
  syncConvertBtn();
  store.subscribe(syncConvertBtn);

  // ── Assemble ──────────────────────────────────────────────────────────────
  wrapper.appendChild(formatRow.el);
  wrapper.appendChild(qualityRow.el);
  wrapper.appendChild(dimsRow.el);
  wrapper.appendChild(aspectRow.el);
  wrapper.appendChild(orientRow.el);
  wrapper.appendChild(stripRow.el);
  wrapper.appendChild(resampleRow.el);
  wrapper.appendChild(convertWrap);

  // Queue mode is always 'auto' now — ensure stored settings reflect that.
  store.setQueueSettings({ mode: 'auto', autoStart: true });

  // ── Sync helpers ──────────────────────────────────────────────────────────

  function syncFromDefaults(defaults: PerFileSettings): void {
    formatSelect.value = defaults.format;
    const lossless = isLossless(defaults.format);
    const isAuto = defaults.format === 'auto';
    const isMp4 = defaults.format === 'mp4';

    // Quality: lossy → show slider+readout. Lossless → hide both, show "Lossless".
    // Automatic → hide the entire Quality row; the resolved format decides at
    // convert time and the slider value would be misleading either way.
    // MP4 → hide too; MP4 has its own quality slider in Advanced (the global
    // 1..100 number doesn't map to bitrate the same way).
    qualitySlider.value = String(defaults.quality);
    qualityReadout.textContent = String(defaults.quality);
    qualitySlider.style.display = lossless || isAuto || isMp4 ? 'none' : '';
    qualityReadout.style.display = lossless || isAuto || isMp4 ? 'none' : '';
    losslessNote.style.display = lossless && !isAuto && !isMp4 ? '' : 'none';
    qualityRow.el.style.display = isAuto || isMp4 ? 'none' : '';

    // Resample only relevant for lossy formats per spec — hide row otherwise.
    resampleRow.el.style.display = lossless ? 'none' : '';

    const isPct = defaults.dimensionUnit === 'percent';
    if (isPct) {
      widthInput.max = '999';
      heightInput.max = '999';
      widthInput.placeholder = 'W%';
      heightInput.placeholder = 'H%';
      widthInput.setAttribute('aria-label', 'Width as percent of original');
      heightInput.setAttribute('aria-label', 'Height as percent of original');
    } else {
      widthInput.removeAttribute('max');
      heightInput.removeAttribute('max');
      widthInput.placeholder = 'W';
      heightInput.placeholder = 'H';
      widthInput.setAttribute('aria-label', 'Width in pixels');
      heightInput.setAttribute('aria-label', 'Height in pixels');
    }
    widthInput.value = defaults.width !== null ? String(defaults.width) : '';
    heightInput.value = defaults.height !== null ? String(defaults.height) : '';

    // Single-button toggle: pressed = percent mode active.
    pctBtn.setAttribute('aria-pressed', isPct ? 'true' : 'false');
    pctBtn.classList.toggle('rd-pct-toggle--active', isPct);

    aspectCheckbox.checked = defaults.maintainAspect;
    stripCheckbox.checked = defaults.stripMetadata;
    resampleSelect.value = defaults.resample;

    // Preserve orientation: disabled when maintainAspect=false OR percent mode
    const orientEnabled = defaults.maintainAspect && !isPct;
    orientCheckbox.disabled = !orientEnabled;
    orientLabel.style.opacity = orientEnabled ? '' : '0.4';
    orientCheckbox.checked = orientEnabled ? defaults.preserveOrientation : false;
  }

  syncFromDefaults(store.getGlobalDefaults());

  // Re-sync when store changes externally
  store.subscribe(() => {
    syncFromDefaults(store.getGlobalDefaults());
  });

  // ── Event handlers ────────────────────────────────────────────────────────

  formatSelect.addEventListener('change', () => {
    store.setGlobalDefaults({ format: formatSelect.value as OutputFormat });
    syncFromDefaults(store.getGlobalDefaults());
  });

  qualitySlider.addEventListener('input', () => {
    const q = Number(qualitySlider.value);
    qualityReadout.textContent = String(q);
    store.setGlobalDefaults({ quality: q });
  });

  pctBtn.addEventListener('click', () => {
    const wasPct = store.getGlobalDefaults().dimensionUnit === 'percent';
    if (wasPct) {
      // Toggling OFF — back to px
      store.setGlobalDefaults({ dimensionUnit: 'px', width: null, height: null });
    } else {
      // Toggling ON — to percent. Force-disable preserveOrientation.
      store.setGlobalDefaults({ dimensionUnit: 'percent', width: null, height: null, preserveOrientation: false });
    }
    syncFromDefaults(store.getGlobalDefaults());
  });

  widthInput.addEventListener('change', () => {
    const raw = widthInput.value.trim();
    const defaults = store.getGlobalDefaults();
    const isPct = defaults.dimensionUnit === 'percent';

    if (raw === '') {
      if (!isPct && defaults.maintainAspect) {
        store.setGlobalDefaults({ width: null, height: null });
        heightInput.value = '';
      } else {
        store.setGlobalDefaults({ width: null });
      }
      return;
    }

    if (isPct) {
      const v = Math.max(1, Math.min(999, Math.round(Number(raw))));
      widthInput.value = String(v);
      store.setGlobalDefaults({ width: v });
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
    const isPct = defaults.dimensionUnit === 'percent';

    if (raw === '') {
      if (!isPct && defaults.maintainAspect) {
        store.setGlobalDefaults({ width: null, height: null });
        widthInput.value = '';
      } else {
        store.setGlobalDefaults({ height: null });
      }
      return;
    }

    if (isPct) {
      const v = Math.max(1, Math.min(999, Math.round(Number(raw))));
      heightInput.value = String(v);
      store.setGlobalDefaults({ height: v });
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
    const maintainAspect = aspectCheckbox.checked;
    // If disabling aspect, also force-disable preserveOrientation
    if (!maintainAspect) {
      store.setGlobalDefaults({ maintainAspect: false, preserveOrientation: false });
    } else {
      store.setGlobalDefaults({ maintainAspect: true });
    }
    syncFromDefaults(store.getGlobalDefaults());
  });

  orientCheckbox.addEventListener('change', () => {
    store.setGlobalDefaults({ preserveOrientation: orientCheckbox.checked });
  });

  resampleSelect.addEventListener('change', () => {
    store.setGlobalDefaults({ resample: resampleSelect.value as PerFileSettings['resample'] });
  });

  stripCheckbox.addEventListener('change', () => {
    store.setGlobalDefaults({ stripMetadata: stripCheckbox.checked });
  });

  return wrapper;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeRow(labelText: string): { el: HTMLElement; control: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'settings-row';

  const label = document.createElement('span');
  label.className = 'settings-row__label';
  label.textContent = labelText;

  const control = document.createElement('div');
  control.className = 'settings-row__control';

  el.appendChild(label);
  el.appendChild(control);

  return { el, control };
}
