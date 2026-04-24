import './styles/design2.css';
import { createDropZone } from '@/components/DropZone';
import { createFileQueue } from '@/components/FileQueue';
import { createGlobalDefaults } from '@/components/GlobalDefaults';
import { createQueueControls } from '@/components/QueueControls';
import { createQueueStore } from '@/lib/queue/store';
import { createQueueProcessor } from '@/lib/queue/processor';
import { startDimensionDetection } from '@/lib/queue/detect-dimensions';
import { toast } from '@/components/Toast';

const store = createQueueStore();
const processor = createQueueProcessor({
  concurrency: store.getQueueSettings().concurrency,
  store,
});
startDimensionDetection(store);
if (store.getQueueSettings().autoStart) processor.start();

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

// Hero
const hero = document.createElement('header');
hero.className = 'd2-hero';
hero.innerHTML = `
  <div class="d2-hero__bg" aria-hidden="true"></div>
  <div class="d2-hero__inner">
    <div class="d2-pill">
      <span class="d2-pill__dot"></span>
      100% client-side · No uploads
    </div>
    <h1 class="d2-hero__title">
      Convert &amp; compress images
      <span class="d2-hero__grad">without ever leaving your browser.</span>
    </h1>
    <p class="d2-hero__sub">
      Drop a file. Pick a format. Download. Every byte stays on your device.
    </p>
    <div class="d2-hero__chips" aria-label="Supported formats">
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
footer.className = 'd2-footer';
footer.innerHTML = `
  <div class="d2-footer__inner">
    <span>100% private · No uploads · No accounts</span>
    <nav class="d2-footer__links">
      <a href="/" class="d2-footer__link">Original design</a>
      <a href="https://radleysustaire.com/" class="d2-footer__link" target="_blank" rel="noopener">By Radley Sustaire</a>
      <a href="#" class="d2-footer__link" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </div>
`;

app.appendChild(hero);
app.appendChild(main);
app.appendChild(footer);

// Keyboard shortcuts (same as main)
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

// Full-page drag overlay
let dragCounter = 0;
const dragOverlay = document.createElement('div');
dragOverlay.className = 'drag-overlay';
dragOverlay.setAttribute('aria-hidden', 'true');
dragOverlay.innerHTML = `
  <div class="drag-overlay__inner">
    <div class="drag-overlay__icon">&#11015;</div>
    <div class="drag-overlay__text">Drop to convert</div>
  </div>
`;
document.body.appendChild(dragOverlay);

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) document.body.classList.add('dragging-over');
});
document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    document.body.classList.remove('dragging-over');
  }
});
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.body.classList.remove('dragging-over');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) store.addFiles(Array.from(files));
});
