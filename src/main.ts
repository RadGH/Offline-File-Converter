import './styles/main.css';

import { createDropZone } from '@/components/DropZone';
import { createFileQueue } from '@/components/FileQueue';
import { createQueueControls } from '@/components/QueueControls';
import { createSimpleSettings } from '@/components/SimpleSettings';
import { createQueueStore } from '@/lib/queue/store';
import { createQueueProcessor } from '@/lib/queue/processor';
import { startDimensionDetection } from '@/lib/queue/detect-dimensions';
import { toast } from '@/components/Toast';
import { initConsent } from '@/lib/consent';
import { maybeShowConsentBanner, openConsentBanner } from '@/components/ConsentBanner';

initConsent();

const store = createQueueStore();

// No upscale services — this entry intentionally omits AI upscaling.
const processor = createQueueProcessor({
  concurrency: store.getQueueSettings().concurrency,
  store,
});

startDimensionDetection(store);
if (store.getQueueSettings().mode === 'auto') processor.start();

// ── Toast wiring for batch completion ────────────────────────────────────────
let prevDoneCount = 0;
let prevItemCount = 0;

store.subscribe(() => {
  const { items } = store.getState();
  const doneCount = items.filter(i => i.status === 'done').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const waitingCount = items.filter(i => i.status === 'waiting').length;
  const processingCount = items.filter(i => i.status === 'processing').length;
  const totalCount = items.length;

  if (
    totalCount > 0 &&
    waitingCount === 0 &&
    processingCount === 0 &&
    doneCount > prevDoneCount &&
    prevItemCount > 0
  ) {
    if (errorCount === 0) {
      toast.info(`All ${doneCount} file${doneCount !== 1 ? 's' : ''} converted.`);
    } else {
      toast.info(`${doneCount} converted, ${errorCount} failed.`);
    }
  }

  if (errorCount > 0) {
    const lastError = items.filter(i => i.status === 'error' && i.error).pop();
    if (lastError?.error) toast.error(`Conversion error: ${lastError.error}`);
  }

  prevDoneCount = doneCount;
  prevItemCount = totalCount;
});

// ── Build DOM ─────────────────────────────────────────────────────────────────

const app = document.getElementById('app');
if (!app) throw new Error('#app element not found');

// Header
const header = document.createElement('header');
header.className = 'rd-header';
header.innerHTML = `
  <div class="rd-header__brand">
    <span class="rd-header__logo">Image Converter</span>
    <span class="rd-header__tagline">files stay on your device</span>
  </div>
  <span class="rd-header__badge">100% Local</span>
`;

// Main grid
const main = document.createElement('main');
main.className = 'rd-main';
main.id = 'main';

// Left panel: drop zone + settings
const left = document.createElement('div');
left.className = 'rd-left';

// Drop zone card
const dropCard = document.createElement('div');
dropCard.className = 'rd-card';
const dropCardTitle = document.createElement('p');
dropCardTitle.className = 'rd-card__title';
dropCardTitle.textContent = 'Add images';
const dropZone = createDropZone((files) => store.addFiles(files));
dropCard.appendChild(dropCardTitle);
dropCard.appendChild(dropZone);

// Settings card
const settingsCard = document.createElement('div');
settingsCard.className = 'rd-card';
const settingsCardTitle = document.createElement('p');
settingsCardTitle.className = 'rd-card__title';
settingsCardTitle.textContent = 'Settings';
const simpleSettings = createSimpleSettings(store);
settingsCard.appendChild(settingsCardTitle);
settingsCard.appendChild(simpleSettings);

left.appendChild(dropCard);
left.appendChild(settingsCard);

// Right panel: queue
const right = document.createElement('div');
right.className = 'rd-right';

const queueCard = document.createElement('div');
queueCard.className = 'rd-queue-card';

const queueHeader = document.createElement('div');
queueHeader.className = 'rd-queue-header';

const queueTitle = document.createElement('span');
queueTitle.className = 'rd-queue-header__title';
queueTitle.textContent = 'Queue';

queueHeader.appendChild(queueTitle);

const fileQueue = createFileQueue(store, processor);
const queueControls = createQueueControls(store, processor);

queueCard.appendChild(queueHeader);
queueCard.appendChild(fileQueue);
queueCard.appendChild(queueControls);

right.appendChild(queueCard);

main.appendChild(left);
main.appendChild(right);

// Footer
const footer = document.createElement('footer');
footer.className = 'rd-footer';
footer.innerHTML = `
  <div class="rd-footer__inner">
    <span>Files processed in your browser · No uploads · No accounts</span>
    <a href="/privacy.html" class="rd-footer__link">Privacy</a>
    <a href="#" class="rd-footer__link" data-action="manage-cookies">Manage cookies</a>
    <a href="https://radleysustaire.com/" class="rd-footer__link" target="_blank" rel="noopener">By Radley Sustaire</a>
    <a href="https://github.com/RadGH/Offline-File-Converter" class="rd-footer__link" target="_blank" rel="noopener">GitHub</a>
  </div>
`;

footer.querySelector<HTMLAnchorElement>('[data-action="manage-cookies"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  openConsentBanner();
});

app.appendChild(header);
app.appendChild(main);
app.appendChild(footer);

maybeShowConsentBanner();

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  const tag = target.tagName.toLowerCase();
  const isEditable =
    tag === 'input' || tag === 'select' || tag === 'textarea' || target.isContentEditable;

  if (e.key === ' ' && !isEditable) {
    e.preventDefault();
    if (processor.getState().running) processor.pause();
    else processor.start();
  }

  if (e.key === 'Escape') {
    (document.activeElement as HTMLElement | null)?.blur();
  }
});

// ── Drag-anywhere ─────────────────────────────────────────────────────────────
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) store.addFiles(Array.from(files));
});
