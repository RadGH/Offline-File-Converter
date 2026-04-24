export function createDropZone(onFiles: (files: File[]) => void): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'drop-zone';
  zone.setAttribute('role', 'button');
  zone.setAttribute('tabindex', '0');
  zone.setAttribute('aria-label', 'Drop images here or click to browse');

  const icon = document.createElement('div');
  icon.className = 'drop-zone__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⬆';

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
