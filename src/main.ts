import './styles/main.css';
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

if (store.getQueueSettings().autoStart) {
  processor.start();
}

// ── Toast wiring: fire when a batch completes ─────────────────────────────────
let prevDoneCount = 0;
let prevItemCount = 0;

store.subscribe(() => {
  const { items } = store.getState();
  const doneCount = items.filter(i => i.status === 'done').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const waitingCount = items.filter(i => i.status === 'waiting').length;
  const processingCount = items.filter(i => i.status === 'processing').length;
  const totalCount = items.length;

  // Batch complete: all done/errored, nothing left processing/waiting
  if (
    totalCount > 0 &&
    waitingCount === 0 &&
    processingCount === 0 &&
    doneCount > prevDoneCount &&
    prevItemCount > 0
  ) {
    const successCount = doneCount;
    if (errorCount === 0) {
      toast.info(`All ${successCount} file${successCount !== 1 ? 's' : ''} converted.`);
    } else {
      toast.info(`${successCount} converted, ${errorCount} failed.`);
    }
  }

  // Error toasts (debounced inside toast.error)
  if (errorCount > 0 && items.some(i => i.status === 'error')) {
    const lastError = items.filter(i => i.status === 'error' && i.error).pop();
    if (lastError?.error) {
      toast.error(`Conversion error: ${lastError.error}`);
    }
  }

  prevDoneCount = doneCount;
  prevItemCount = totalCount;
});

// ── DOM assembly ──────────────────────────────────────────────────────────────

const app = document.getElementById('app');
if (!app) throw new Error('#app element not found');

// ── Header ────────────────────────────────────────────────────────────────────

const header = document.createElement('header');
header.className = 'site-header';
header.innerHTML = `
  <div class="site-header__inner">
    <h1>
      <svg class="site-header__lock" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
        <rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor" opacity="0.18"/>
        <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <circle cx="8" cy="11" r="1.2" fill="currentColor"/>
      </svg>
      Convert &amp; compress images in your browser.
    </h1>
    <p class="tagline">No uploads. No accounts. Your files never leave your device.</p>
    <p class="tagline tagline--formats">Supports JPEG &middot; PNG &middot; WebP &middot; AVIF &middot; HEIC &middot; GIF &middot; BMP</p>
  </div>
`;

// ── Main converter column ─────────────────────────────────────────────────────

const converterCol = document.createElement('main');
converterCol.className = 'converter-col';
converterCol.id = 'main';

const globalDefaults = createGlobalDefaults(store);
const queueControls = createQueueControls(store, processor);
const dropZone = createDropZone((files) => store.addFiles(files));
const fileQueue = createFileQueue(store, processor);

converterCol.appendChild(globalDefaults);
converterCol.appendChild(queueControls);
converterCol.appendChild(dropZone);
converterCol.appendChild(fileQueue);

// ── Footer ────────────────────────────────────────────────────────────────────

const footer = document.createElement('footer');
footer.className = 'site-footer';
footer.innerHTML = `
  <div class="site-footer__inner">
    <span class="site-footer__privacy">100% private &middot; No uploads &middot; No accounts</span>
    <div class="site-footer__links">
      <a href="#" class="site-footer__link">About</a>
      <a href="#" class="site-footer__link">GitHub</a>
    </div>
  </div>
  <details class="site-footer__shortcuts">
    <summary>Keyboard shortcuts</summary>
    <ul class="site-footer__shortcuts-list">
      <li><kbd>Space</kbd> — Start / pause the conversion queue</li>
      <li><kbd>Esc</kbd> — Close all open settings panels</li>
    </ul>
  </details>
`;

app.appendChild(header);
app.appendChild(converterCol);
app.appendChild(footer);

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  const tag = target.tagName.toLowerCase();
  const isEditable =
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea' ||
    target.isContentEditable;

  if (e.key === ' ' && !isEditable) {
    e.preventDefault();
    if (processor.getState().running) {
      processor.pause();
    } else {
      processor.start();
    }
  }

  if (e.key === 'Escape') {
    // Close all expanded settings panels
    document
      .querySelectorAll<HTMLButtonElement>('.queue-item__expand[aria-expanded="true"]')
      .forEach(btn => btn.click());
    // Blur any focused element
    (document.activeElement as HTMLElement | null)?.blur();
  }
});

// ── Full-page drag overlay ────────────────────────────────────────────────────

let dragCounter = 0;

// Ensure overlay element exists
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
  if (dragCounter === 1) {
    document.body.classList.add('dragging-over');
  }
});

document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    document.body.classList.remove('dragging-over');
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.body.classList.remove('dragging-over');

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    store.addFiles(Array.from(files));
  }
});
