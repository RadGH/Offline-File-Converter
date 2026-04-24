import './styles/main.css';
import { createAdSlot } from '@/components/AdSlot';
import { createDropZone } from '@/components/DropZone';
import { createFileQueue } from '@/components/FileQueue';
import { createQueueStore } from '@/lib/queue/store';

const store = createQueueStore();

const app = document.getElementById('app');
if (!app) throw new Error('#app element not found');

// Header
const header = document.createElement('header');
header.className = 'site-header';
header.innerHTML = `
  <h1>Offline Image Converter</h1>
  <p class="tagline">Convert &amp; compress images in your browser. Files never leave your device.</p>
`;

// Top banner ad
const topBanner = createAdSlot({ slot: 'top-banner', size: '728x90' });

// Main content wrapper (flex row: converter + sidebar)
const contentWrapper = document.createElement('div');
contentWrapper.className = 'content-wrapper';

// Converter column
const converterCol = document.createElement('main');
converterCol.className = 'converter-col';
converterCol.id = 'main';

const dropZone = createDropZone((files) => store.addFiles(files));
const fileQueue = createFileQueue(store);

converterCol.appendChild(dropZone);
converterCol.appendChild(fileQueue);

// Sidebar ad
const sidebar = createAdSlot({ slot: 'sidebar', size: '300x600' });

contentWrapper.appendChild(converterCol);
contentWrapper.appendChild(sidebar);

// Bottom banner ad
const bottomBanner = createAdSlot({ slot: 'bottom-banner', size: '728x90' });

// Footer
const footer = document.createElement('footer');
footer.className = 'site-footer';
footer.innerHTML = `<p>100% private &mdash; No uploads. No accounts. Files never leave your device.</p>`;

app.appendChild(header);
app.appendChild(topBanner);
app.appendChild(contentWrapper);
app.appendChild(bottomBanner);
app.appendChild(footer);
