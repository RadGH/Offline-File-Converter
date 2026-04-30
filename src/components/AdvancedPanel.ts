/**
 * AdvancedPanel — the inner controls used by both layouts (inline + dialog).
 *
 * Owns: encoder-options-by-format, design filters, palette overrides, preview.
 * Mounts the gating button when the advanced pack is not yet loaded.
 *
 * The component is layout-agnostic: it returns an HTMLElement that can be
 * dropped into either an inline accordion or a modal dialog. Its CSS uses
 * `.adv-` prefixed classes that work in both shells.
 */

import type {
  QueueStore, PerFileSettings, AdvancedFilters,
  GifAdvancedSettings, WebpAdvancedSettings, PngAdvancedSettings,
  JpegAdvancedSettings, AvifAdvancedSettings, Mp4AdvancedSettings, PaletteOverride,
} from '@/lib/queue/store';
import {
  DEFAULT_FILTERS, DEFAULT_GIF_ADVANCED, DEFAULT_WEBP_ADVANCED,
  DEFAULT_PNG_ADVANCED, DEFAULT_JPEG_ADVANCED, DEFAULT_AVIF_ADVANCED,
  DEFAULT_MP4_ADVANCED,
} from '@/lib/queue/store';
import { loadAdvancedPack, isLoaded as isPackLoaded, type AdvancedPack } from '@/lib/advanced/pack-loader';

let packRef: AdvancedPack | null = null;

async function captureImageThumbnail(blob: Blob, size: number): Promise<string | null> {
  const bmp = await createImageBitmap(blob);
  const tcv = document.createElement('canvas');
  tcv.width = size; tcv.height = size;
  const tctx = tcv.getContext('2d');
  if (!tctx) { bmp.close?.(); return null; }
  tctx.imageSmoothingQuality = 'high';
  const scale = Math.min(size / bmp.width, size / bmp.height);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  tctx.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h);
  bmp.close?.();
  return tcv.toDataURL('image/png');
}

async function captureVideoThumbnail(blob: Blob, size: number): Promise<string | null> {
  // Decode the first frame from the result video by loading it into an
  // off-DOM <video>, waiting for `loadeddata`, then drawing it to a canvas.
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    const finish = (data: string | null) => {
      URL.revokeObjectURL(url);
      resolve(data);
    };
    const onReady = () => {
      try {
        const tcv = document.createElement('canvas');
        tcv.width = size; tcv.height = size;
        const tctx = tcv.getContext('2d');
        if (!tctx) return finish(null);
        tctx.imageSmoothingQuality = 'high';
        const vw = v.videoWidth || size, vh = v.videoHeight || size;
        const scale = Math.min(size / vw, size / vh);
        const w = Math.round(vw * scale), h = Math.round(vh * scale);
        tctx.drawImage(v, (size - w) / 2, (size - h) / 2, w, h);
        finish(tcv.toDataURL('image/png'));
      } catch {
        finish(null);
      }
    };
    v.addEventListener('loadeddata', onReady, { once: true });
    v.addEventListener('error', () => finish(null), { once: true });
    // Safety timeout — don't hang the result row forever if the video
    // takes too long to decode metadata.
    setTimeout(() => finish(null), 5000);
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function row(label: string): { row: HTMLElement; control: HTMLElement } {
  const r = el('div', 'adv-row');
  const lab = el('span', 'adv-row__label', label);
  const ctrl = el('div', 'adv-row__control');
  r.append(lab, ctrl);
  return { row: r, control: ctrl };
}

function rgbToHex(c: [number, number, number]): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function createAdvancedPanel(store: QueueStore): HTMLElement {
  const root = el('div', 'adv-panel');

  // ── Gating button ───────────────────────────────────────────────────────
  const gate = el('div', 'adv-gate');
  const gateBtn = el('button', 'rd-btn rd-btn--secondary adv-gate__btn', 'Load advanced features');
  gateBtn.type = 'button';
  const gateProgress = el('div', 'adv-gate__progress');
  const gateProgressFill = el('div', 'adv-gate__progress-fill');
  gateProgress.appendChild(gateProgressFill);
  gateProgress.style.display = 'none';
  const gateMsg = el('p', 'adv-gate__msg', 'Filter, palette, and preview tools load on demand to keep this page fast for simple conversions.');
  gate.append(gateMsg, gateBtn, gateProgress);

  // ── Body (hidden until loaded) ──────────────────────────────────────────
  const body = el('div', 'adv-body');
  body.style.display = 'none';
  // Note: the previous "Unload advanced" link and "Preview" checkbox were
  // removed per UX feedback — preview is always on, and the pack stays
  // loaded for the session once initialized.

  // Section: Encoder Options
  const encSection = el('section', 'adv-section');
  encSection.appendChild(el('h3', 'adv-section__title', 'Encoder options'));
  const encContainer = el('div', 'adv-section__body');
  encSection.appendChild(encContainer);

  // Section: Design filters
  const filtSection = el('section', 'adv-section');
  filtSection.appendChild(el('h3', 'adv-section__title', 'Design filters'));
  const filtContainer = el('div', 'adv-section__body');
  filtSection.appendChild(filtContainer);

  // Section: Palette overwrite
  const palSection = el('section', 'adv-section adv-section--collapsible');
  const palHeader = el('button', 'adv-section__toggle');
  palHeader.type = 'button';
  palHeader.innerHTML = '<span>Palette overwrite</span><span class="adv-section__chev">▾</span>';
  const palBody = el('div', 'adv-section__body adv-palette-body');
  palBody.style.display = 'none';
  palSection.append(palHeader, palBody);
  palHeader.addEventListener('click', () => {
    const open = palBody.style.display !== 'none';
    palBody.style.display = open ? 'none' : '';
    palHeader.classList.toggle('adv-section__toggle--open', !open);
  });

  // Section: Preview
  const prevSection = el('section', 'adv-section adv-section--preview');
  prevSection.appendChild(el('h3', 'adv-section__title', 'Preview'));
  const prevContainer = el('div', 'adv-section__body');
  prevSection.appendChild(prevContainer);

  // Sticky-footer Convert bar (UX A3) — primary button + result row.
  const footer = el('div', 'adv-footer');
  const convertBtn = el('button', 'rd-btn rd-btn--primary adv-convert-btn', 'No changes') as HTMLButtonElement;
  convertBtn.type = 'button';
  convertBtn.disabled = true;
  const resultRow = el('div', 'adv-result-row');
  resultRow.style.display = 'none';
  footer.append(convertBtn, resultRow);

  // Two-column layout on desktop:
  //   left  = encoder options, design filters, palette overrides, Convert footer
  //   right = preview only
  // On mobile the grid collapses to a single stacked column.
  const bodyLeft = document.createElement('div');
  bodyLeft.className = 'adv-body__left';
  bodyLeft.append(encSection, filtSection, palSection, footer);

  const bodyRight = document.createElement('div');
  bodyRight.className = 'adv-body__right';
  bodyRight.append(prevSection);

  body.append(bodyLeft, bodyRight);
  root.append(gate, body);

  // ── Pack-status sync ─────────────────────────────────────────────────────
  function syncGate(): void {
    const ui = store.getAdvancedUi();
    if (ui.pack.kind === 'idle') {
      gateBtn.textContent = 'Load advanced features';
      gateBtn.disabled = false;
      gateProgress.style.display = 'none';
      gate.style.display = '';
      body.style.display = 'none';
    } else if (ui.pack.kind === 'loading') {
      gateBtn.textContent = 'Loading…';
      gateBtn.disabled = true;
      gateProgress.style.display = '';
      gate.style.display = '';
      body.style.display = 'none';
    } else if (ui.pack.kind === 'ready') {
      gateBtn.disabled = false;
      gate.style.display = 'none';
      body.style.display = '';
    } else if (ui.pack.kind === 'error') {
      gateBtn.textContent = 'Retry — load failed';
      gateBtn.disabled = false;
      gateProgress.style.display = 'none';
      gate.style.display = '';
      body.style.display = 'none';
    }
    // Preview is always shown when the pack is ready.
    prevSection.style.display = '';
    // Show footer only when pack is ready
    footer.style.display = ui.pack.kind === 'ready' ? '' : 'none';
  }
  syncGate();
  store.subscribe(() => syncGate());

  // ── Gating actions ───────────────────────────────────────────────────────
  gateBtn.addEventListener('click', async () => {
    store.setAdvancedUi({ pack: { kind: 'loading' } });
    gateProgressFill.style.width = '0%';
    try {
      packRef = await loadAdvancedPack(({ loaded, total }) => {
        gateProgressFill.style.width = `${Math.round((loaded / total) * 100)}%`;
      });
      // Initialize defaults so encoder/format-options panels render.
      const cur = store.getGlobalDefaults();
      const patch: Partial<PerFileSettings> = {};
      if (!cur.filters) patch.filters = { ...DEFAULT_FILTERS };
      if (!cur.gif) patch.gif = { ...DEFAULT_GIF_ADVANCED };
      if (!cur.webp) patch.webp = { ...DEFAULT_WEBP_ADVANCED };
      if (!cur.png) patch.png = { ...DEFAULT_PNG_ADVANCED };
      if (!cur.jpeg) patch.jpeg = { ...DEFAULT_JPEG_ADVANCED };
      if (!cur.avif) patch.avif = { ...DEFAULT_AVIF_ADVANCED };
      if (!cur.mp4) patch.mp4 = { ...DEFAULT_MP4_ADVANCED };
      if (Object.keys(patch).length > 0) store.setGlobalDefaults(patch);
      store.setAdvancedUi({ pack: { kind: 'ready' } });
      renderAll();
    } catch (err) {
      store.setAdvancedUi({ pack: { kind: 'error', reason: (err as Error).message } });
    }
  });

  // Unload + Preview toggle were removed: the pack stays loaded for the
  // session and the preview is always rendered.

  // ── Render encoder/filter/palette/preview UI when pack is ready ──────────
  function renderAll(): void {
    if (!isPackLoaded()) return;
    renderEncoderOptions();
    renderFilters();
    renderPaletteOverrides();
    renderPreview();
  }

  // ── Encoder options (format-specific) ───────────────────────────────────
  function renderEncoderOptions(): void {
    encContainer.innerHTML = '';
    const cur = store.getGlobalDefaults();
    const fmt = cur.format;

    // Resample (moved here from simple settings per UX recommendation, but
    // only shown for lossy formats)
    if (fmt === 'jpeg' || fmt === 'webp' || fmt === 'avif') {
      const r = row('Resample');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      ['high', 'bilinear', 'nearest'].forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
        sel.appendChild(o);
      });
      sel.value = cur.resample;
      sel.addEventListener('change', () => {
        store.setGlobalDefaults({ resample: sel.value as PerFileSettings['resample'] });
      });
      r.control.appendChild(sel);
      encContainer.appendChild(r.row);
    }

    if (fmt === 'gif' || fmt === 'gif-animated') renderGifOptions(encContainer, cur.gif ?? { ...DEFAULT_GIF_ADVANCED });
    if (fmt === 'webp' || fmt === 'webp-animated') renderWebpOptions(encContainer, cur.webp ?? { ...DEFAULT_WEBP_ADVANCED });
    if (fmt === 'png') renderPngOptions(encContainer, cur.png ?? { ...DEFAULT_PNG_ADVANCED });
    if (fmt === 'jpeg') renderJpegOptions(encContainer, cur.jpeg ?? { ...DEFAULT_JPEG_ADVANCED });
    if (fmt === 'avif') renderAvifOptions(encContainer, cur.avif ?? { ...DEFAULT_AVIF_ADVANCED });
    if (fmt === 'mp4') renderMp4Options(encContainer, cur.mp4 ?? { ...DEFAULT_MP4_ADVANCED });

    // Hide the entire section when there are no controls to render
    // (e.g. format='auto' before resolve, or any format with no specific options).
    encSection.style.display = encContainer.children.length === 0 ? 'none' : '';
  }

  function renderGifOptions(parent: HTMLElement, g: GifAdvancedSettings): void {
    {
      const r = row('Transparency');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      [['off', 'Off (flatten on white)'], ['auto', 'Auto-detect from source'], ['manual', 'Manual color']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
      });
      sel.value = g.transparency;
      const colorInp = el('input', 'adv-color-input') as HTMLInputElement;
      colorInp.type = 'color';
      colorInp.value = rgbToHex(g.transparentColor ?? [255, 0, 255]);
      colorInp.style.display = g.transparency === 'manual' ? '' : 'none';
      sel.addEventListener('change', () => {
        const next: GifAdvancedSettings = { ...g, transparency: sel.value as GifAdvancedSettings['transparency'] };
        colorInp.style.display = next.transparency === 'manual' ? '' : 'none';
        store.setGlobalDefaults({ gif: next });
      });
      colorInp.addEventListener('change', () => {
        store.setGlobalDefaults({ gif: { ...g, transparentColor: hexToRgb(colorInp.value) } });
      });
      r.control.append(sel, colorInp);
      parent.appendChild(r.row);
    }
    {
      const r = row('Palette size');
      const inp = el('input', 'adv-num-input') as HTMLInputElement;
      inp.type = 'number'; inp.min = '2'; inp.max = '256'; inp.value = String(g.paletteSize);
      inp.addEventListener('change', () => {
        const v = Math.max(2, Math.min(256, Math.round(Number(inp.value))));
        inp.value = String(v);
        store.setGlobalDefaults({ gif: { ...g, paletteSize: v } });
      });
      r.control.appendChild(inp);
      parent.appendChild(r.row);
    }
    {
      const r = row('Dither');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      [['none', 'None'], ['floyd-steinberg', 'Floyd–Steinberg'], ['atkinson', 'Atkinson']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
      });
      sel.value = g.dither;
      sel.addEventListener('change', () => {
        store.setGlobalDefaults({ gif: { ...g, dither: sel.value as GifAdvancedSettings['dither'] } });
      });
      r.control.appendChild(sel);
      parent.appendChild(r.row);
    }
  }

  function renderWebpOptions(parent: HTMLElement, w: WebpAdvancedSettings): void {
    {
      const r = row('Lossless');
      const cb = el('input') as HTMLInputElement;
      cb.type = 'checkbox'; cb.className = 'rd-checkbox'; cb.checked = w.lossless;
      cb.addEventListener('change', () => store.setGlobalDefaults({ webp: { ...w, lossless: cb.checked } }));
      r.control.appendChild(cb);
      parent.appendChild(r.row);
    }
    {
      const r = row('Alpha quality');
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = '0'; s.max = '100'; s.value = String(w.alphaQuality);
      const out = el('span', 'adv-readout', String(w.alphaQuality));
      s.addEventListener('input', () => { out.textContent = s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ webp: { ...w, alphaQuality: Number(s.value) } }));
      r.control.append(s, out);
      parent.appendChild(r.row);
    }
    {
      const r = row('Method');
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = '0'; s.max = '6'; s.value = String(w.method);
      const out = el('span', 'adv-readout', String(w.method));
      s.title = 'Higher = slower + smaller file';
      s.addEventListener('input', () => { out.textContent = s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ webp: { ...w, method: Number(s.value) } }));
      r.control.append(s, out);
      parent.appendChild(r.row);
    }
    {
      const r = row('Near-lossless');
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = '0'; s.max = '100'; s.value = String(w.nearLossless);
      const out = el('span', 'adv-readout', String(w.nearLossless));
      s.title = '100 = off; lower = stronger preprocessing';
      s.addEventListener('input', () => { out.textContent = s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ webp: { ...w, nearLossless: Number(s.value) } }));
      r.control.append(s, out);
      parent.appendChild(r.row);
    }
  }

  function renderPngOptions(parent: HTMLElement, p: PngAdvancedSettings): void {
    {
      const r = row('Palette quantize');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      [['auto', 'Auto (smallest wins)'], ['on', 'On (always quantize)'], ['off', 'Off (lossless only)']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
      });
      sel.value = p.paletteQuantize;
      sel.addEventListener('change', () => store.setGlobalDefaults({ png: { ...p, paletteQuantize: sel.value as PngAdvancedSettings['paletteQuantize'] } }));
      r.control.appendChild(sel);
      parent.appendChild(r.row);
    }
    {
      const r = row('Palette size');
      const inp = el('input', 'adv-num-input') as HTMLInputElement;
      inp.type = 'number'; inp.min = '2'; inp.max = '256'; inp.value = String(p.paletteSize);
      inp.addEventListener('change', () => {
        const v = Math.max(2, Math.min(256, Math.round(Number(inp.value))));
        inp.value = String(v);
        store.setGlobalDefaults({ png: { ...p, paletteSize: v } });
      });
      r.control.appendChild(inp);
      parent.appendChild(r.row);
    }
    {
      const r = row('Interlace');
      const cb = el('input') as HTMLInputElement;
      cb.type = 'checkbox'; cb.className = 'rd-checkbox'; cb.checked = p.interlace;
      cb.title = 'Adam7 interlacing — preview reveals as image loads';
      cb.addEventListener('change', () => store.setGlobalDefaults({ png: { ...p, interlace: cb.checked } }));
      r.control.appendChild(cb);
      parent.appendChild(r.row);
    }
  }

  function renderJpegOptions(parent: HTMLElement, j: JpegAdvancedSettings): void {
    {
      const r = row('Progressive');
      const cb = el('input') as HTMLInputElement;
      cb.type = 'checkbox'; cb.className = 'rd-checkbox'; cb.checked = j.progressive;
      cb.addEventListener('change', () => store.setGlobalDefaults({ jpeg: { ...j, progressive: cb.checked } }));
      r.control.appendChild(cb);
      parent.appendChild(r.row);
    }
    {
      const r = row('Chroma subsampling');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      ['4:4:4', '4:2:2', '4:2:0'].forEach(v => {
        const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
      });
      sel.value = j.chromaSubsampling;
      sel.addEventListener('change', () => store.setGlobalDefaults({ jpeg: { ...j, chromaSubsampling: sel.value as JpegAdvancedSettings['chromaSubsampling'] } }));
      r.control.appendChild(sel);
      parent.appendChild(r.row);
    }
  }

  function renderAvifOptions(parent: HTMLElement, a: AvifAdvancedSettings): void {
    {
      const r = row('Speed');
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = '0'; s.max = '10'; s.value = String(a.speed);
      const out = el('span', 'adv-readout', String(a.speed));
      s.title = 'Higher = faster encode + larger file';
      s.addEventListener('input', () => { out.textContent = s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ avif: { ...a, speed: Number(s.value) } }));
      r.control.append(s, out);
      parent.appendChild(r.row);
    }
    {
      const r = row('Lossless');
      const cb = el('input') as HTMLInputElement;
      cb.type = 'checkbox'; cb.className = 'rd-checkbox'; cb.checked = a.lossless;
      cb.addEventListener('change', () => store.setGlobalDefaults({ avif: { ...a, lossless: cb.checked } }));
      r.control.appendChild(cb);
      parent.appendChild(r.row);
    }
  }

  function renderMp4Options(parent: HTMLElement, m: Mp4AdvancedSettings): void {
    {
      const r = row('Quality');
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = '1'; s.max = '100'; s.value = String(m.quality);
      const out = el('span', 'adv-readout', String(m.quality));
      s.title = 'Higher = bigger file. ~50 is a good starting point.';
      s.addEventListener('input', () => { out.textContent = s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ mp4: { ...m, quality: Number(s.value) } }));
      r.control.append(s, out);
      parent.appendChild(r.row);
    }
    {
      const r = row('Frame rate');
      const inp = el('input', 'adv-num-input') as HTMLInputElement;
      inp.type = 'number'; inp.min = '0'; inp.max = '60';
      inp.value = String(m.fpsOverride);
      inp.placeholder = 'auto';
      inp.title = '0 or empty = auto-pick from source frame delays. Otherwise 1..60 fps.';
      inp.addEventListener('change', () => {
        const raw = inp.value.trim();
        const v = raw === '' ? 0 : Math.max(0, Math.min(60, Math.round(Number(raw))));
        inp.value = v === 0 ? '' : String(v);
        store.setGlobalDefaults({ mp4: { ...m, fpsOverride: v } });
      });
      r.control.appendChild(inp);
      const hint = el('span', 'adv-hint', 'auto if blank');
      r.control.appendChild(hint);
      parent.appendChild(r.row);
    }
    {
      const r = row('Background');
      const ci = el('input', 'adv-color-input') as HTMLInputElement;
      ci.type = 'color';
      const h = (n: number) => n.toString(16).padStart(2, '0');
      ci.value = `#${h(m.backgroundColor[0])}${h(m.backgroundColor[1])}${h(m.backgroundColor[2])}`;
      ci.title = 'H.264 has no alpha. Transparent source pixels are flattened onto this color.';
      ci.addEventListener('change', () => {
        const v = ci.value.trim();
        const mm = /^#?([0-9a-f]{6})$/i.exec(v);
        if (!mm) return;
        const n = parseInt(mm[1], 16);
        store.setGlobalDefaults({ mp4: { ...m, backgroundColor: [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] } });
      });
      r.control.appendChild(ci);
      parent.appendChild(r.row);
    }
  }

  // ── Design filters ──────────────────────────────────────────────────────
  function renderFilters(): void {
    filtContainer.innerHTML = '';
    const cur = store.getGlobalDefaults();
    const f: AdvancedFilters = cur.filters ?? { ...DEFAULT_FILTERS };

    function addSlider(label: string, key: 'brightness' | 'contrast' | 'saturation', min: number, max: number): void {
      const r = row(label);
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = String(min); s.max = String(max); s.value = String(f[key]);
      const out = el('span', 'adv-readout', String(f[key]));
      s.addEventListener('input', () => { out.textContent = s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ filters: { ...f, [key]: Number(s.value) } }));
      r.control.append(s, out);
      filtContainer.appendChild(r.row);
    }
    addSlider('Brightness', 'brightness', -100, 100);
    addSlider('Contrast',   'contrast',   -100, 100);
    addSlider('Saturation', 'saturation', -100, 100);

    function addCheckbox(label: string, key: 'invert' | 'grayscale'): void {
      const r = row(label);
      const cb = el('input') as HTMLInputElement;
      cb.type = 'checkbox'; cb.className = 'rd-checkbox'; cb.checked = f[key];
      cb.addEventListener('change', () => store.setGlobalDefaults({ filters: { ...f, [key]: cb.checked } }));
      r.control.appendChild(cb);
      filtContainer.appendChild(r.row);
    }
    addCheckbox('Grayscale', 'grayscale');
    addCheckbox('Invert', 'invert');

    {
      const r = row('Posterize');
      const s = el('input', 'rd-slider') as HTMLInputElement;
      s.type = 'range'; s.min = '0'; s.max = '32'; s.value = String(f.posterize);
      const out = el('span', 'adv-readout', f.posterize === 0 ? 'off' : String(f.posterize));
      s.title = '0 = off, 2..32 = quantization levels';
      s.addEventListener('input', () => { out.textContent = Number(s.value) === 0 ? 'off' : s.value; });
      s.addEventListener('change', () => store.setGlobalDefaults({ filters: { ...f, posterize: Number(s.value) } }));
      r.control.append(s, out);
      filtContainer.appendChild(r.row);
    }
    {
      const r = row('Posterize source');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      [['true', 'Image palette (better)'], ['false', 'Uniform RGB']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
      });
      sel.value = String(f.posterizeFromImage);
      sel.addEventListener('change', () => store.setGlobalDefaults({ filters: { ...f, posterizeFromImage: sel.value === 'true' } }));
      r.control.appendChild(sel);
      filtContainer.appendChild(r.row);
    }
    {
      const r = row('Dither');
      const sel = el('select', 'rd-select') as HTMLSelectElement;
      [['none', 'None'], ['floyd-steinberg', 'Floyd–Steinberg'], ['ordered', 'Ordered (Bayer 4×4)']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o);
      });
      sel.value = f.dither;
      sel.addEventListener('change', () => store.setGlobalDefaults({ filters: { ...f, dither: sel.value as AdvancedFilters['dither'] } }));
      r.control.appendChild(sel);
      filtContainer.appendChild(r.row);
    }
  }

  // ── Palette overrides ───────────────────────────────────────────────────
  function getPreviewItem(): { file: File; sourceId: string } | null {
    const state = store.getState();
    const id = state.selectedSourceId;
    const src = id ? state.items.find(i => i.id === id && i.isSource) : null;
    if (src) return { file: src.file, sourceId: src.id };
    // Fallback to first source in the list, if any.
    const firstSource = state.items.find(i => i.isSource);
    if (firstSource) return { file: firstSource.file, sourceId: firstSource.id };
    return null;
  }

  function renderPaletteOverrides(): void {
    palBody.innerHTML = '';
    if (!packRef) return;
    const previewItem = getPreviewItem();
    if (!previewItem) {
      palBody.appendChild(el('p', 'adv-empty', 'Add an image to extract its palette and remap colors.'));
      return;
    }

    const cur = store.getGlobalDefaults();
    const overrides: PaletteOverride[] = cur.paletteOverrides ?? [];

    // Suggest from extracted palette
    const extractBtn = el('button', 'rd-btn rd-btn--secondary', 'Extract palette from image');
    extractBtn.type = 'button';
    extractBtn.addEventListener('click', async () => {
      try {
        const decoded = await packRef!.decode.decodeFirstFrame(previewItem.file);
        const ctx = decoded.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        if (!ctx) return;
        const id = ctx.getImageData(0, 0, decoded.width, decoded.height);
        const pal = packRef!.palette.extractPalette(id, 8);
        const newOverrides: PaletteOverride[] = pal.map(c => ({ from: c, to: c }));
        store.setGlobalDefaults({ paletteOverrides: newOverrides });
        renderPaletteOverrides();
        renderPreview();
        // Persist
        const hash = await packRef!.imageHash.hashFile(previewItem.file);
        packRef!.paletteOverrides.writeOverrides(hash, newOverrides);
      } catch (err) {
        console.error('Extract palette failed:', err);
      }
    });
    palBody.appendChild(extractBtn);

    const list = el('ul', 'adv-palette-list');
    overrides.forEach((ov, idx) => {
      const li = el('li', 'adv-palette-row');

      // Original swatch (eyedropper trigger)
      const fromBtn = el('button', 'adv-swatch adv-swatch--from') as HTMLButtonElement;
      fromBtn.type = 'button';
      fromBtn.style.background = rgbToHex(ov.from);
      fromBtn.title = `Original: ${rgbToHex(ov.from)} — click to re-pick from source`;
      fromBtn.addEventListener('click', () => {
        store.setAdvancedUi({ eyedropperActive: true, eyedropperRow: idx });
        renderPreview();
      });

      const arrow = el('span', 'adv-palette-arrow', '→');

      // Replacement swatch (color input)
      const toInput = el('input', 'adv-color-input') as HTMLInputElement;
      toInput.type = 'color';
      toInput.value = rgbToHex(ov.to);
      toInput.addEventListener('change', () => {
        const next = overrides.slice();
        next[idx] = { ...ov, to: hexToRgb(toInput.value) };
        store.setGlobalDefaults({ paletteOverrides: next });
        renderPaletteOverrides();
        renderPreview();
        persist(next);
      });

      // Reset (revert to original)
      const resetBtn = el('button', 'adv-icon-btn', '↺') as HTMLButtonElement;
      resetBtn.type = 'button';
      resetBtn.title = 'Revert this row to original color';
      resetBtn.addEventListener('click', () => {
        const next = overrides.slice();
        next[idx] = { ...ov, to: ov.from };
        store.setGlobalDefaults({ paletteOverrides: next });
        renderPaletteOverrides();
        renderPreview();
        persist(next);
      });

      // Remove
      const xBtn = el('button', 'adv-icon-btn adv-icon-btn--danger', '×') as HTMLButtonElement;
      xBtn.type = 'button';
      xBtn.addEventListener('click', () => {
        const next = overrides.slice(); next.splice(idx, 1);
        store.setGlobalDefaults({ paletteOverrides: next });
        renderPaletteOverrides();
        renderPreview();
        persist(next);
      });

      li.append(fromBtn, arrow, toInput, resetBtn, xBtn);
      list.appendChild(li);
    });
    palBody.appendChild(list);

    // Clear all
    if (overrides.length > 0) {
      const clearAll = el('button', 'adv-link', 'Clear all overrides');
      clearAll.type = 'button';
      clearAll.addEventListener('click', () => {
        store.setGlobalDefaults({ paletteOverrides: [] });
        renderPaletteOverrides();
        renderPreview();
        persist([]);
      });
      palBody.appendChild(clearAll);
    }

    async function persist(o: PaletteOverride[]): Promise<void> {
      try {
        const hash = await packRef!.imageHash.hashFile(previewItem!.file);
        packRef!.paletteOverrides.writeOverrides(hash, o);
      } catch { /* noop */ }
    }
  }

  // ── Preview with before/after slider + eyedropper ───────────────────────
  let previewRenderToken = 0;
  let previewDebounce: number | undefined;
  function renderPreview(): void {
    prevContainer.innerHTML = '';
    if (!packRef) return;
    const ui = store.getAdvancedUi();
    const item = getPreviewItem();
    if (!item) {
      prevContainer.appendChild(el('p', 'adv-empty', 'Add an image to see a preview.'));
      return;
    }

    // View selector: slider | original | side-by-side
    const viewRow = el('div', 'adv-preview__viewrow');
    const viewLabel = el('span', 'adv-preview__viewlabel', 'View:');
    const viewSel = el('select', 'rd-select adv-preview__viewsel') as HTMLSelectElement;
    [
      ['slider', 'Before / after slider'],
      ['original', 'Original size (1:1)'],
      ['side-by-side', 'Side by side'],
    ].forEach(([v, l]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = l;
      viewSel.appendChild(o);
    });
    viewSel.value = ui.previewView;
    // Original-size + side-by-side don't make sense during eyedropper mode.
    if (ui.eyedropperActive) {
      viewSel.disabled = true;
      viewSel.value = 'slider';
    }
    viewSel.addEventListener('change', () => {
      store.setAdvancedUi({ previewView: viewSel.value as import('@/lib/queue/store').PreviewView });
    });
    viewRow.append(viewLabel, viewSel);

    const wrap = el('div', 'adv-preview');
    wrap.appendChild(viewRow);

    const eyedropperBanner = el('div', 'adv-eyedropper-banner', 'Filters off — click a pixel to pick its color (Esc to cancel).');
    eyedropperBanner.style.display = ui.eyedropperActive ? '' : 'none';
    wrap.appendChild(eyedropperBanner);

    // Build the appropriate view container.
    const view = ui.eyedropperActive ? 'slider' : ui.previewView;
    const beforeCanvas = document.createElement('canvas');
    const afterCanvas = document.createElement('canvas');
    let viewport: HTMLElement;
    let slider: HTMLInputElement | null = null;

    if (view === 'slider') {
      viewport = el('div', 'adv-preview__viewport');
      const beforeWrap = el('div', 'adv-preview__before-clip');
      afterCanvas.className = 'adv-preview__layer adv-preview__after';
      beforeCanvas.className = 'adv-preview__layer adv-preview__before';
      const handle = el('div', 'adv-preview__handle');
      beforeWrap.appendChild(beforeCanvas);
      viewport.append(afterCanvas, beforeWrap, handle);
      wrap.appendChild(viewport);
      slider = el('input', 'adv-preview__slider') as HTMLInputElement;
      slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = '50';
      slider.style.display = ui.eyedropperActive ? 'none' : '';
      slider.addEventListener('input', () => {
        viewport.style.setProperty('--split', `${slider!.value}%`);
      });
      wrap.appendChild(slider);
    } else if (view === 'original') {
      // 1:1 preview at native processed dimensions; scrolls if larger than container.
      viewport = el('div', 'adv-preview__viewport adv-preview__viewport--scroll');
      afterCanvas.className = 'adv-preview__native';
      viewport.appendChild(afterCanvas);
      wrap.appendChild(viewport);
    } else {
      // Side-by-side: before above, after below, each labeled.
      viewport = el('div', 'adv-preview__sidebyside');
      const beforeBox = el('div', 'adv-preview__sbs-box');
      beforeBox.appendChild(el('span', 'adv-preview__sbs-label', 'Original'));
      beforeCanvas.className = 'adv-preview__sbs-canvas';
      beforeBox.appendChild(beforeCanvas);
      const afterBox = el('div', 'adv-preview__sbs-box');
      afterBox.appendChild(el('span', 'adv-preview__sbs-label', 'Processed'));
      afterCanvas.className = 'adv-preview__sbs-canvas';
      afterBox.appendChild(afterCanvas);
      viewport.append(beforeBox, afterBox);
      wrap.appendChild(viewport);
    }

    prevContainer.appendChild(wrap);

    const myToken = ++previewRenderToken;
    if (previewDebounce !== undefined) clearTimeout(previewDebounce);
    previewDebounce = window.setTimeout(async () => {
      const cur = store.getGlobalDefaults();
      try {
        // Original-size view requests a much larger canvas (capped to keep the
        // page responsive for very large images).
        const maxSide = view === 'original' ? 4096 : 480;
        const result = await packRef!.preview.renderPreview(item.file, cur, {
          maxSide,
          raw: ui.eyedropperActive,
        });
        if (myToken !== previewRenderToken) return;
        afterCanvas.width = result.width;
        afterCanvas.height = result.height;
        beforeCanvas.width = result.width;
        beforeCanvas.height = result.height;
        const aCtx = afterCanvas.getContext('2d');
        const bCtx = beforeCanvas.getContext('2d');
        if (aCtx && bCtx) {
          aCtx.drawImage(result.after as CanvasImageSource, 0, 0);
          bCtx.drawImage(result.before as CanvasImageSource, 0, 0);
        }

        // Eyedropper click handler
        if (ui.eyedropperActive) {
          afterCanvas.style.cursor = 'crosshair';
          beforeCanvas.style.cursor = 'crosshair';
          const onClick = (e: MouseEvent) => {
            const rect = viewport.getBoundingClientRect();
            // Map viewport→canvas coords (image fits via CSS contain-like sizing).
            const cw = beforeCanvas.width, ch = beforeCanvas.height;
            const x = ((e.clientX - rect.left) / rect.width) * cw;
            const y = ((e.clientY - rect.top) / rect.height) * ch;
            const rgb = packRef!.preview.samplePixel(result.rawSource, x, y);
            const rowIdx = store.getAdvancedUi().eyedropperRow;
            const overrides = store.getGlobalDefaults().paletteOverrides ?? [];
            if (rowIdx >= 0 && rowIdx < overrides.length) {
              const next = overrides.slice();
              next[rowIdx] = { from: rgb, to: overrides[rowIdx].to };
              store.setGlobalDefaults({ paletteOverrides: next });
              packRef!.imageHash.hashFile(item.file).then(h => packRef!.paletteOverrides.writeOverrides(h, next)).catch(() => {});
            }
            store.setAdvancedUi({ eyedropperActive: false, eyedropperRow: -1 });
            viewport.removeEventListener('click', onClick);
            renderPaletteOverrides();
            renderPreview();
          };
          viewport.addEventListener('click', onClick);
          const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              store.setAdvancedUi({ eyedropperActive: false, eyedropperRow: -1 });
              window.removeEventListener('keydown', onEsc);
              renderPreview();
            }
          };
          window.addEventListener('keydown', onEsc);
        }
      } catch (err) {
        prevContainer.textContent = `Preview error: ${(err as Error).message}`;
      }
    }, 250);
  }

  // ── Snapshot helper (drives Convert button enabled state) ──────────────
  function settingsSnapshot(): string {
    const cur = store.getGlobalDefaults();
    return JSON.stringify({
      f: cur.format, q: cur.quality,
      w: cur.width, h: cur.height, ratio: cur.maintainAspect,
      resample: cur.resample, dimUnit: cur.dimensionUnit,
      filters: cur.filters, overrides: cur.paletteOverrides,
      gif: cur.gif, webp: cur.webp, png: cur.png, jpeg: cur.jpeg, avif: cur.avif,
    });
  }

  function syncConvertButton(): void {
    if (!isPackLoaded()) return;
    const ui = store.getAdvancedUi();
    const hasItem = getPreviewItem() !== null;
    const cur = settingsSnapshot();
    const last = ui.lastConvertedSnapshot;
    const dirty = last === null || last !== cur;
    if (!hasItem) {
      convertBtn.disabled = true;
      convertBtn.textContent = 'Add an image first';
      convertBtn.classList.remove('adv-convert-btn--ready');
    } else if (!dirty) {
      convertBtn.disabled = true;
      convertBtn.textContent = 'No changes';
      convertBtn.classList.remove('adv-convert-btn--ready');
    } else {
      convertBtn.disabled = false;
      convertBtn.textContent = 'Convert with these settings';
      convertBtn.classList.add('adv-convert-btn--ready');
    }
    // Result row reflects ui.lastResult.
    const lr = ui.lastResult;
    if (lr) {
      resultRow.innerHTML = '';
      resultRow.style.display = '';
      const thumb = el('div', 'adv-result-row__thumb');
      if (lr.thumbDataUrl) {
        const img = document.createElement('img');
        img.src = lr.thumbDataUrl;
        img.alt = '';
        thumb.appendChild(img);
      }
      const meta = el('div', 'adv-result-row__meta');
      const name = el('div', 'adv-result-row__name', lr.outName);
      const size = el('div', 'adv-result-row__size', `${(lr.outSize / 1024).toFixed(1)} KB`);
      meta.append(name, size);
      const dl = el('button', 'rd-btn rd-btn--secondary adv-result-row__dl', 'Download') as HTMLButtonElement;
      dl.type = 'button';
      dl.addEventListener('click', () => {
        const item = store.getState().items.find(i => i.id === lr.itemId);
        if (!item?.result) return;
        const url = URL.createObjectURL(item.result.blob);
        const a = document.createElement('a');
        a.href = url; a.download = item.result.outName;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      resultRow.append(thumb, meta, dl);
    } else {
      resultRow.style.display = 'none';
    }
  }

  convertBtn.addEventListener('click', async () => {
    const item = getPreviewItem();
    if (!item) return;
    const sourceId = item.sourceId;
    convertBtn.disabled = true;
    convertBtn.textContent = 'Converting…';
    const newId = store.cloneItemWithDefaults(sourceId);
    if (!newId) {
      convertBtn.textContent = 'Error — could not clone';
      return;
    }
    // Wait until the new item finishes processing (status=done or error).
    const finished = await new Promise<{ ok: boolean; outName?: string; outSize?: number; blob?: Blob }>((resolve) => {
      const unsub = store.subscribe(() => {
        const i = store.getState().items.find(it => it.id === newId);
        if (!i) { unsub(); resolve({ ok: false }); return; }
        if (i.status === 'done' && i.result) {
          unsub();
          resolve({ ok: true, outName: i.result.outName, outSize: i.result.outSize, blob: i.result.blob });
        } else if (i.status === 'error') {
          unsub();
          resolve({ ok: false });
        }
      });
    });
    if (finished.ok && finished.blob && finished.outName != null && finished.outSize != null) {
      // Build a small static thumbnail. For images we use createImageBitmap;
      // for videos that throws, so we draw the first decoded frame from a
      // <video> element instead.
      let thumbUrl: string | null = null;
      try {
        thumbUrl = finished.blob.type.startsWith('video/')
          ? await captureVideoThumbnail(finished.blob, 48)
          : await captureImageThumbnail(finished.blob, 48);
      } catch { /* noop — leave thumbUrl null, result row falls back to text */ }
      store.setAdvancedUi({
        lastConvertedSnapshot: settingsSnapshot(),
        lastResult: { itemId: newId, outName: finished.outName, outSize: finished.outSize, thumbDataUrl: thumbUrl },
      });
    }
    syncConvertButton();
  });

  // ── Re-render reactively on relevant store changes ───────────────────────
  let lastSnapshot = '';
  store.subscribe(() => {
    if (!isPackLoaded()) return;
    const cur = store.getGlobalDefaults();
    const ui = store.getAdvancedUi();
    const snap = JSON.stringify({
      f: cur.format, q: cur.quality,
      filters: cur.filters, gif: cur.gif, webp: cur.webp,
      png: cur.png, jpeg: cur.jpeg, avif: cur.avif,
      overrides: cur.paletteOverrides,
      eye: ui.eyedropperActive, eyeRow: ui.eyedropperRow,
      previewView: ui.previewView,
      itemCount: store.getState().items.length,
      firstFile: store.getState().items[0]?.file?.name ?? null,
      lastResult: ui.lastResult?.itemId ?? null,
    });
    if (snap === lastSnapshot) return;
    lastSnapshot = snap;
    renderEncoderOptions();
    renderFilters();
    renderPaletteOverrides();
    renderPreview();
    syncConvertButton();
  });

  // When the selected source changes, restore that file's persisted overrides.
  let lastRestoredFor = '';
  store.subscribe(async () => {
    if (!isPackLoaded() || !packRef) return;
    const item = getPreviewItem();
    if (!item) return;
    const key = `${item.file.name}/${item.file.size}/${item.file.lastModified}`;
    if (key === lastRestoredFor) return;
    lastRestoredFor = key;
    try {
      const hash = await packRef.imageHash.hashFile(item.file);
      const persisted = packRef.paletteOverrides.readOverrides(hash);
      if (persisted && persisted.length > 0) {
        store.setGlobalDefaults({ paletteOverrides: persisted });
      }
    } catch { /* noop */ }
  });

  // If pack was already loaded (e.g. user already clicked Load this session
  // and we re-mount), render now.
  if (isPackLoaded()) {
    loadAdvancedPack().then(p => { packRef = p; renderAll(); }).catch(() => {});
  }

  return root;
}
