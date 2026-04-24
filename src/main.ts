import './styles/main.css';
import { createDropZone } from '@/components/DropZone';
import { createFileQueue } from '@/components/FileQueue';
import { createGlobalDefaults } from '@/components/GlobalDefaults';
import { createQueueControls } from '@/components/QueueControls';
import { createQueueStore } from '@/lib/queue/store';
import { createQueueProcessor } from '@/lib/queue/processor';
import { startDimensionDetection } from '@/lib/queue/detect-dimensions';

const store = createQueueStore();

const processor = createQueueProcessor({
  concurrency: store.getQueueSettings().concurrency,
  store,
});

startDimensionDetection(store);

if (store.getQueueSettings().autoStart) {
  processor.start();
}

const app = document.getElementById('app');
if (!app) throw new Error('#app element not found');

const header = document.createElement('header');
header.className = 'site-header';
header.innerHTML = `
  <h1>Offline Image Converter</h1>
  <p class="tagline">Convert &amp; compress images in your browser. Files never leave your device.</p>
`;

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

const footer = document.createElement('footer');
footer.className = 'site-footer';
footer.innerHTML = `<p>100% private &mdash; No uploads. No accounts. Files never leave your device.</p>`;

app.appendChild(header);
app.appendChild(converterCol);
app.appendChild(footer);
