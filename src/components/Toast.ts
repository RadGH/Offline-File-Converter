/**
 * Toast — singleton notification system.
 * Usage: toast.info('message') / toast.error('message')
 * Auto-dismisses after 4s. Errors debounced to one per 2s.
 */

const TOAST_DURATION_MS = 4_000;
const ERROR_DEBOUNCE_MS = 2_000;

interface ToastItem {
  id: number;
  type: 'info' | 'error';
  message: string;
  el: HTMLElement;
  timer: ReturnType<typeof setTimeout>;
}

let container: HTMLElement | null = null;
let nextId = 0;
let lastErrorAt = 0;

function getContainer(): HTMLElement {
  if (!container || !document.contains(container)) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
  }
  return container;
}

function dismiss(item: ToastItem): void {
  clearTimeout(item.timer);
  item.el.classList.add('toast--hiding');
  item.el.addEventListener('animationend', () => item.el.remove(), { once: true });
  // Fallback removal if animation doesn't fire
  setTimeout(() => item.el.remove(), 400);
}

function show(type: 'info' | 'error', message: string): void {
  const c = getContainer();
  const id = nextId++;

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast__close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.textContent = '×';
  el.appendChild(closeBtn);

  c.appendChild(el);

  const item: ToastItem = {
    id,
    type,
    message,
    el,
    timer: setTimeout(() => dismiss(item), TOAST_DURATION_MS),
  };

  closeBtn.addEventListener('click', () => dismiss(item));
}

export const toast = {
  info(message: string): void {
    show('info', message);
  },
  error(message: string): void {
    const now = Date.now();
    if (now - lastErrorAt < ERROR_DEBOUNCE_MS) return;
    lastErrorAt = now;
    show('error', message);
  },
};
