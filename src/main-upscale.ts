// Register COI service worker first — before any heavy module loads.
// This enables SharedArrayBuffer (required for ORT multi-threaded WASM) on
// GitHub Pages where custom response headers cannot be set at the server layer.
import { registerCoiServiceWorker } from '@/lib/coi';
registerCoiServiceWorker().catch(() => { /* non-fatal — WASM still works single-threaded */ });

import './styles/main-upscale.css';
import { createDropZone } from '@/components/DropZone';
import { createFileQueue } from '@/components/FileQueue';
import { createGlobalDefaults } from '@/components/GlobalDefaults';
import { createQueueControls } from '@/components/QueueControls';
import { createQueueStore } from '@/lib/queue/store';
import { createQueueProcessor } from '@/lib/queue/processor';
import { startDimensionDetection } from '@/lib/queue/detect-dimensions';
import { initUpscaleBoot } from '@/lib/queue/boot-upscale';
import { upscaleInWorker } from '@/lib/upscale/worker-client';
import { toast } from '@/components/Toast';
import { initConsent } from '@/lib/consent';
import { maybeShowConsentBanner, openConsentBanner } from '@/components/ConsentBanner';

initConsent();

const store = createQueueStore();

// Boot upscale capability detection + cache check (never triggers download)
initUpscaleBoot(store);

const processor = createQueueProcessor({
  concurrency: store.getQueueSettings().concurrency,
  store,
  upscaleServices: {
    isModelReady: () => store.getModelStatus().kind === 'ready',
    runUpscale: (blob, scale, onProgress) => {
      toast.info(`Running AI upscaler (${scale}×)… this takes 30 s–3 min.`);
      return upscaleInWorker(blob, { scale, onProgress });
    },
  },
});
startDimensionDetection(store);
if (store.getQueueSettings().mode === 'auto') processor.start();

let prevDoneCount = 0;
let prevItemCount = 0;
store.subscribe(() => {
  const { items } = store.getState();
  const doneCount = items.filter(i => i.status === 'done').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const waitingCount = items.filter(i => i.status === 'waiting').length;
  const processingCount = items.filter(i => i.status === 'processing').length;
  const totalCount = items.length;

  if (totalCount > 0 && waitingCount === 0 && processingCount === 0 && doneCount > prevDoneCount && prevItemCount > 0) {
    if (errorCount === 0) toast.info(`All ${doneCount} file${doneCount !== 1 ? 's' : ''} converted.`);
    else toast.info(`${doneCount} converted, ${errorCount} failed.`);
  }

  if (errorCount > 0) {
    const lastError = items.filter(i => i.status === 'error' && i.error).pop();
    if (lastError?.error) toast.error(`Conversion error: ${lastError.error}`);
  }

  prevDoneCount = doneCount;
  prevItemCount = totalCount;
});

const app = document.getElementById('app');
if (!app) throw new Error('#app element not found');

const hero = document.createElement('header');
hero.className = 'site-header';
hero.innerHTML = `
  <div class="site-header__bg" aria-hidden="true"></div>
  <div class="site-header__inner">
    <div class="d2-pill">
      <span class="d2-pill__dot"></span>
      Client-side conversion · No file uploads
    </div>
    <h1>
      Convert &amp; compress images
      <span class="site-header__grad">without ever leaving your browser.</span>
    </h1>
    <p class="tagline">
      Drop a file. Pick a format. Download. Every byte stays on your device.
    </p>
    <div class="site-header__chips" aria-label="Supported formats">
      <span class="d2-chip">JPEG</span>
      <span class="d2-chip">PNG</span>
      <span class="d2-chip">WebP</span>
      <span class="d2-chip">AVIF</span>
      <span class="d2-chip">HEIC</span>
      <span class="d2-chip">GIF</span>
      <span class="d2-chip">BMP</span>
    </div>
  </div>
`;

const main = document.createElement('main');
main.className = 'd2-main';
main.id = 'main';

const card = document.createElement('section');
card.className = 'd2-card';

const dropZone = createDropZone((files) => store.addFiles(files));
const fileQueue = createFileQueue(store, processor);
const queueControls = createQueueControls(store, processor);
const globalDefaults = createGlobalDefaults(store);

card.appendChild(dropZone);
card.appendChild(fileQueue);
card.appendChild(queueControls);
card.appendChild(globalDefaults);

main.appendChild(card);

const footer = document.createElement('footer');
footer.className = 'site-footer';
footer.innerHTML = `
  <div class="site-footer__inner">
    <span>Files processed in your browser · No uploads · No accounts</span>
    <nav class="site-footer__links">
      <a href="/privacy.html" class="site-footer__link">Privacy</a>
      <a href="#" class="site-footer__link" data-action="manage-cookies">Manage cookies</a>
      <a href="https://radleysustaire.com/" class="site-footer__link" target="_blank" rel="noopener noreferrer">By Radley Sustaire</a>
      <a href="https://github.com/RadGH/Offline-File-Converter" class="site-footer__link" target="_blank" rel="noopener noreferrer">GitHub</a>
    </nav>
  </div>
`;

footer.querySelector<HTMLAnchorElement>('[data-action="manage-cookies"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  openConsentBanner();
});

app.appendChild(hero);
app.appendChild(main);
app.appendChild(footer);

maybeShowConsentBanner();

// Keyboard shortcuts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  const tag = target.tagName.toLowerCase();
  const isEditable = tag === 'input' || tag === 'select' || tag === 'textarea' || target.isContentEditable;

  if (e.key === ' ' && !isEditable) {
    e.preventDefault();
    if (processor.getState().running) processor.pause();
    else processor.start();
  }

  if (e.key === 'Escape') {
    (document.activeElement as HTMLElement | null)?.blur();
  }
});

// Allow dropping files anywhere on the page
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) store.addFiles(Array.from(files));
});
