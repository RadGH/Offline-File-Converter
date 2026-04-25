import type { QueueStore, PerFileSettings, OutputFormat } from '@/lib/queue/store';
import { computePairedDimension } from '@/lib/utils/resize';

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png',  label: 'PNG'  },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif',  label: 'GIF'  },
];

const LOSSLESS_FORMATS = new Set<OutputFormat>(['png', 'gif']);

function isLossless(fmt: OutputFormat): boolean {
  return LOSSLESS_FORMATS.has(fmt);
}

/**
 * Minimal settings panel for the redesign entry.
 * Always visible (not collapsible). No upscale controls.
 *
 * Exposes: format, quality, width×height+aspect, strip metadata.
 */
export function createSimpleSettings(store: QueueStore): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'simple-settings';

  // ── Format row ────────────────────────────────────────────────────────────
  const formatRow = makeRow('Format');
  const formatSelect = document.createElement('select');
  formatSelect.className = 'rd-select';
  FORMAT_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    formatSelect.appendChild(option);
  });
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

  dimWrapper.appendChild(widthInput);
  dimWrapper.appendChild(dimSep);
  dimWrapper.appendChild(heightInput);
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

  // ── Assemble ──────────────────────────────────────────────────────────────
  wrapper.appendChild(formatRow.el);
  wrapper.appendChild(qualityRow.el);
  wrapper.appendChild(dimsRow.el);
  wrapper.appendChild(aspectRow.el);
  wrapper.appendChild(stripRow.el);

  // ── Sync helpers ──────────────────────────────────────────────────────────

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
  }

  syncFromDefaults(store.getGlobalDefaults());

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
