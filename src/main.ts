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
import { initTheme } from '@/lib/theme';
import { createThemeToggle } from '@/components/ThemeToggle';
import { createModal } from '@/components/Modal';
import { getAboutHTML } from '@/components/AboutContent';
import { getPrivacyHTML } from '@/components/PrivacyContent';

initTheme();
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
  <div class="rd-header__right">
    <span class="rd-header__badge">100% Local</span>
  </div>
`;
header.querySelector('.rd-header__right')?.appendChild(createThemeToggle());

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
const simpleSettings = createSimpleSettings(store, processor);
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

// ── Modal setup ───────────────────────────────────────────────────────────────

const aboutModal = createModal({ title: 'About', contentHtml: getAboutHTML() });
const privacyModal = createModal({ title: 'Privacy Notice', contentHtml: getPrivacyHTML() });

// When the about modal links to #privacy (privacy link inside about content)
aboutModal.element.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.about-privacy-link');
  if (a) {
    e.preventDefault();
    aboutModal.close();
    history.replaceState({}, '', '#privacy');
    privacyModal.open();
  }
});

function openModalForHash(hash: string): void {
  if (hash === '#about') {
    aboutModal.open();
  } else if (hash === '#privacy') {
    privacyModal.open();
  }
}

// Open modal on page load if hash present
openModalForHash(location.hash);

// Listen for future hash changes (back/forward or in-page link clicks)
window.addEventListener('hashchange', () => {
  openModalForHash(location.hash);
});

// Footer
const footer = document.createElement('footer');
footer.className = 'rd-footer';
// GitHub icon — vendored from Font Awesome Free 6.7.2 (CC BY 4.0).
const GITHUB_SVG = `<svg class="rd-footer__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/></svg>`;

footer.innerHTML = `
  <div class="rd-footer__inner">
    <p class="rd-footer__line rd-footer__privacy">Files processed in your browser · No uploads · No accounts</p>
    <div class="rd-footer__line rd-footer__line--links">
      <a href="#about" class="rd-footer__link" data-action="open-about">About</a>
      <a href="#privacy" class="rd-footer__link" data-action="open-privacy">Privacy</a>
      <a href="#" class="rd-footer__link" data-action="manage-cookies">Manage cookies</a>
    </div>
    <div class="rd-footer__line rd-footer__line--credits">
      <a href="https://radleysustaire.com/" class="rd-footer__link" target="_blank" rel="noopener noreferrer">By Radley Sustaire</a>
      <a href="https://github.com/RadGH/Offline-File-Converter" class="rd-footer__link rd-footer__link--icon" target="_blank" rel="noopener noreferrer">${GITHUB_SVG}<span>GitHub</span></a>
    </div>
  </div>
`;

footer.querySelector<HTMLAnchorElement>('[data-action="open-about"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  history.replaceState({}, '', '#about');
  aboutModal.open();
});

footer.querySelector<HTMLAnchorElement>('[data-action="open-privacy"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  history.replaceState({}, '', '#privacy');
  privacyModal.open();
});

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
