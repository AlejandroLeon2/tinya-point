// Delegated open/close for any ui/Modal instance (doc/astrobase.md §3.4).
// Contract (also documented in ui/Modal.astro):
//   - modal root:    data-modal-root="<key>"
//   - open trigger:  data-modal-open="<key>"
//   - close trigger: data-modal-close  (lives inside the modal)
// Focus trap + Esc live in utils/modal.ts — this file only resolves elements.
// No fixed ids: keys are data-driven from the triggering markup.

import { openModal, closeModal } from '../../../utils/modal';
import { qs } from '../../../utils/dom';

const ticketSheet = qs<HTMLElement>(document, '[data-modal-variant="ticket"]');
const ticketSheetToggle = ticketSheet?.querySelector<HTMLElement>('[data-ticket-sheet-toggle]');

if (ticketSheet && ticketSheetToggle) {
  const setFull = (full: boolean): void => {
    ticketSheet.dataset.sheetState = full ? 'full' : 'mid';
    ticketSheetToggle.setAttribute('aria-expanded', String(full));
    ticketSheetToggle.setAttribute(
      'aria-label',
      full ? 'Reducir ticket' : 'Expandir ticket',
    );
    ticketSheetToggle.title = full ? 'Reducir ticket' : 'Expandir ticket';
  };

  let pointerStartY: number | null = null;
  let suppressClick = false;

  ticketSheetToggle.addEventListener('click', (event) => {
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    setFull(ticketSheet.dataset.sheetState !== 'full');
  });

  ticketSheetToggle.addEventListener('pointerdown', (event) => {
    pointerStartY = event.clientY;
    ticketSheetToggle.setPointerCapture(event.pointerId);
  });

  ticketSheetToggle.addEventListener('pointerup', (event) => {
    if (pointerStartY === null) return;
    const delta = pointerStartY - event.clientY;
    pointerStartY = null;
    if (Math.abs(delta) < 36) return;

    event.preventDefault();
    suppressClick = true;
    requestAnimationFrame(() => {
      suppressClick = false;
    });

    if (delta > 0) {
      setFull(true);
    } else if (ticketSheet.dataset.sheetState === 'full') {
      setFull(false);
    } else {
      closeModal(ticketSheet);
    }
  });

  ticketSheetToggle.addEventListener('pointercancel', () => {
    pointerStartY = null;
  });
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const ticketBackdrop = target.closest<HTMLElement>(
    '[data-modal-root][data-modal-variant="ticket"]',
  );
  if (ticketBackdrop && target === ticketBackdrop) {
    closeModal(ticketBackdrop);
    return;
  }

  const opener = target.closest<HTMLElement>('[data-modal-open]');
  if (opener) {
    const key = opener.getAttribute('data-modal-open');
    const modal = key ? qs<HTMLElement>(document, `[data-modal-root="${key}"]`) : null;
    if (modal) openModal(modal, opener);
    return;
  }

  const closer = target.closest<HTMLElement>('[data-modal-close]');
  if (closer) {
    const modal = closer.closest<HTMLElement>('[data-modal-root]');
    if (modal) closeModal(modal);
  }
});
