/**
 * Generic modal component.
 *
 * Usage:
 *   const m = createModal({ title: 'About', contentHtml: '<p>…</p>' });
 *   m.open();
 *   m.close();
 */

export interface ModalOptions {
  title: string;
  contentHtml: string;
  onClose?: () => void;
}

export interface ModalHandle {
  open(): void;
  close(): void;
  element: HTMLElement;
}

/**
 * Returns a modal handle. The backdrop is created once and reused;
 * calling open() appends it to <body>, close() removes it.
 */
export function createModal(options: ModalOptions): ModalHandle {
  const { title, contentHtml, onClose } = options;

  // Trap/restore focus -------------------------------------------------------
  let previousFocus: HTMLElement | null = null;

  // Build DOM ----------------------------------------------------------------
  const backdrop = document.createElement('div');
  backdrop.className = 'rd-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', title);

  const modal = document.createElement('div');
  modal.className = 'rd-modal';

  const header = document.createElement('div');
  header.className = 'rd-modal__header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'rd-modal__title';
  titleEl.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'rd-modal__close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="20" y1="4" x2="4" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'rd-modal__content';
  content.innerHTML = contentHtml;

  modal.appendChild(header);
  modal.appendChild(content);
  backdrop.appendChild(modal);

  // Focus trap ---------------------------------------------------------------
  function getFocusable(): HTMLElement[] {
    return Array.from(
      modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Close handlers -----------------------------------------------------------
  function close(): void {
    if (!backdrop.parentElement) return;
    backdrop.parentElement.removeChild(backdrop);
    backdrop.removeEventListener('keydown', onKeydown);
    // Restore hash cleanly
    if (location.hash) {
      history.replaceState({}, '', location.pathname + location.search);
    }
    // Restore focus
    previousFocus?.focus();
    onClose?.();
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    trapFocus(e);
  }

  closeBtn.addEventListener('click', close);

  backdrop.addEventListener('click', (e) => {
    // Close only if clicking the backdrop itself, not the modal card
    if (e.target === backdrop) close();
  });

  // Open ---------------------------------------------------------------------
  function open(): void {
    if (backdrop.parentElement) return; // already open
    previousFocus = document.activeElement as HTMLElement | null;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('keydown', onKeydown);
    // Focus the close button on open
    requestAnimationFrame(() => {
      closeBtn.focus();
    });
  }

  return { open, close, element: backdrop };
}
