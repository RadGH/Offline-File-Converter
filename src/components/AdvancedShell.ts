/**
 * Two layout shells for the AdvancedPanel:
 *   - inline: disclosure beneath simple settings
 *   - dialog: side-panel modal
 *
 * The user picks via a layout toggle in the page header. Persisted to
 * localStorage so a reload restores the same layout.
 */

import type { QueueStore } from '@/lib/queue/store';
import { createAdvancedPanel } from './AdvancedPanel';

export interface AdvancedShellHandle {
  inlineMount: HTMLElement;
  ensureMounted(): void;
  openDialog(): void;
  closeDialog(): void;
}

export function createAdvancedShell(store: QueueStore): AdvancedShellHandle {
  // Single shared panel instance; reparented between inline and dialog.
  const panel = createAdvancedPanel(store);

  // ── Inline shell: disclosure ────────────────────────────────────────────
  const inlineMount = document.createElement('div');
  inlineMount.className = 'adv-inline';

  const disclosure = document.createElement('button');
  disclosure.type = 'button';
  disclosure.className = 'adv-inline__toggle';
  disclosure.innerHTML = '<span class="adv-inline__chev">▸</span> Advanced';
  inlineMount.appendChild(disclosure);

  const inlineHost = document.createElement('div');
  inlineHost.className = 'adv-inline__host';
  inlineHost.style.display = 'none';
  inlineMount.appendChild(inlineHost);

  function setInlineExpanded(open: boolean): void {
    inlineHost.style.display = open ? '' : 'none';
    disclosure.classList.toggle('adv-inline__toggle--open', open);
    const chev = disclosure.querySelector('.adv-inline__chev');
    if (chev) chev.textContent = open ? '▾' : '▸';
    if (open) {
      // Move panel into inline host
      inlineHost.appendChild(panel);
    }
  }

  disclosure.addEventListener('click', () => {
    const ui = store.getAdvancedUi();
    const open = !ui.expanded;
    store.setAdvancedUi({ expanded: open });
    if (store.getAdvancedUi().layout === 'inline') {
      setInlineExpanded(open);
    }
  });

  // ── Dialog shell ────────────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.className = 'rd-modal-backdrop adv-dialog-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'false');
  backdrop.setAttribute('aria-label', 'Advanced settings');

  const dialog = document.createElement('div');
  dialog.className = 'rd-modal adv-dialog';
  const dialogHeader = document.createElement('div');
  dialogHeader.className = 'rd-modal__header';
  const dialogTitle = document.createElement('h2');
  dialogTitle.className = 'rd-modal__title';
  dialogTitle.textContent = 'Advanced settings';
  const dialogClose = document.createElement('button');
  dialogClose.type = 'button';
  dialogClose.className = 'rd-modal__close';
  dialogClose.setAttribute('aria-label', 'Close');
  dialogClose.textContent = '×';
  dialogHeader.append(dialogTitle, dialogClose);
  const dialogBody = document.createElement('div');
  dialogBody.className = 'rd-modal__content adv-dialog__content';
  dialog.append(dialogHeader, dialogBody);
  backdrop.appendChild(dialog);

  function openDialog(): void {
    if (backdrop.parentElement) return;
    dialogBody.appendChild(panel);
    document.body.appendChild(backdrop);
    store.setAdvancedUi({ expanded: true });
  }
  function closeDialog(): void {
    if (!backdrop.parentElement) return;
    backdrop.parentElement.removeChild(backdrop);
    store.setAdvancedUi({ expanded: false });
  }
  dialogClose.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.parentElement) closeDialog();
  });

  // ── Layout sync ─────────────────────────────────────────────────────────
  function ensureMounted(): void {
    const ui = store.getAdvancedUi();
    if (ui.layout === 'inline') {
      // Close dialog if open, reparent panel into inline host
      if (backdrop.parentElement) closeDialog();
      setInlineExpanded(ui.expanded);
      disclosure.style.display = '';
    } else {
      // Hide inline disclosure entirely; dialog is opened via the header button
      disclosure.style.display = 'none';
      inlineHost.style.display = 'none';
    }
  }
  ensureMounted();
  store.subscribe(() => ensureMounted());

  return { inlineMount, ensureMounted, openDialog, closeDialog };
}
