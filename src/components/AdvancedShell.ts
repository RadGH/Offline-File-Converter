/**
 * Side-panel dialog shell for the AdvancedPanel.
 *
 * Per UX decision: the user picked the dialog over the inline accordion. The
 * inline variant has been removed. The advanced panel always lives in this
 * side-panel dialog.
 */

import type { QueueStore } from '@/lib/queue/store';
import { createAdvancedPanel } from './AdvancedPanel';

export interface AdvancedShellHandle {
  openDialog(): void;
  closeDialog(): void;
}

export function createAdvancedShell(store: QueueStore): AdvancedShellHandle {
  const panel = createAdvancedPanel(store);

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
  dialogBody.appendChild(panel);

  dialog.append(dialogHeader, dialogBody);
  backdrop.appendChild(dialog);

  function openDialog(): void {
    if (backdrop.parentElement) return;
    document.body.appendChild(backdrop);
    store.setAdvancedUi({ dialogOpen: true });
  }
  function closeDialog(): void {
    if (!backdrop.parentElement) return;
    backdrop.parentElement.removeChild(backdrop);
    store.setAdvancedUi({ dialogOpen: false });
  }
  dialogClose.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDialog(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && backdrop.parentElement) closeDialog();
  });

  return { openDialog, closeDialog };
}
