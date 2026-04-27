export function createDropZone(onFiles: (files: File[]) => void): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'drop-zone';
  zone.setAttribute('role', 'button');
  zone.setAttribute('tabindex', '0');
  zone.setAttribute('aria-label', 'Drop images here or click to browse');

  const icon = document.createElement('div');
  icon.className = 'drop-zone__icon';
  icon.setAttribute('aria-hidden', 'true');
  // Font Awesome Pro 6.7.2 — regular/cloud-arrow-up
  icon.innerHTML = `<svg viewBox="0 0 640 512" width="40" height="32" fill="currentColor" aria-hidden="true"><path d="M354.9 121.7c13.8 16 36.5 21.1 55.9 12.5c8.9-3.9 18.7-6.2 29.2-6.2c39.8 0 72 32.2 72 72c0 4-.3 7.9-.9 11.7c-3.5 21.6 8.1 42.9 28.1 51.7C570.4 276.9 592 308 592 344c0 46.8-36.6 85.2-82.8 87.8c-.6 0-1.3 .1-1.9 .2l-3.3 0-360 0c-53 0-96-43-96-96c0-41.7 26.6-77.3 64-90.5c19.2-6.8 32-24.9 32-45.3l0-.2c0-66.3 53.7-120 120-120c36.3 0 68.8 16.1 90.9 41.7zM512 480l0-.2c71.4-4.1 128-63.3 128-135.8c0-55.7-33.5-103.7-81.5-124.7c1-6.3 1.5-12.8 1.5-19.3c0-66.3-53.7-120-120-120c-17.4 0-33.8 3.7-48.7 10.3C360.4 54.6 314.9 32 264 32C171.2 32 96 107.2 96 200l0 .2C40.1 220 0 273.3 0 336c0 79.5 64.5 144 144 144l320 0 40 0 8 0zM223 255c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l39-39L296 384c0 13.3 10.7 24 24 24s24-10.7 24-24l0-134.1 39 39c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-80-80c-9.4-9.4-24.6-9.4-33.9 0l-80 80z"/></svg>`;

  const text = document.createElement('p');
  text.className = 'drop-zone__text';
  text.textContent = 'Drop images here';

  const sub = document.createElement('p');
  sub.className = 'drop-zone__sub';
  sub.textContent = 'or click to browse · supports JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP';

  // Hidden file input
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/*,.heic,.heif';
  input.className = 'drop-zone__input';
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;

  zone.appendChild(icon);
  zone.appendChild(text);
  zone.appendChild(sub);
  zone.appendChild(input);

  function handleFiles(files: FileList | null): void {
    if (!files || files.length === 0) return;
    onFiles(Array.from(files));
  }

  // Click to browse
  zone.addEventListener('click', (e) => {
    if (e.target !== input) input.click();
  });

  // Keyboard activation
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  input.addEventListener('change', () => {
    handleFiles(input.files);
    input.value = '';
  });

  // Drag and drop
  zone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    zone.classList.add('drop-zone--over');
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drop-zone--over');
  });

  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget as Node)) {
      zone.classList.remove('drop-zone--over');
    }
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drop-zone--over');
    handleFiles(e.dataTransfer?.files ?? null);
  });

  // Document-level paste (Ctrl+V / Cmd+V) while zone is in DOM
  function onPaste(e: ClipboardEvent): void {
    if (!document.contains(zone)) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) onFiles(imageFiles);
  }

  document.addEventListener('paste', onPaste);

  // Clean up paste listener when zone is removed from DOM
  const cleanupObserver = new MutationObserver(() => {
    if (!document.contains(zone)) {
      document.removeEventListener('paste', onPaste);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });

  return zone;
}
