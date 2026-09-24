// Delegated open/close for any ui/Modal instance (doc/astrobase.md §3.4).
// Contract (also documented in ui/Modal.astro):
//   - modal root:    data-modal-root="<key>"
//   - open trigger:  data-modal-open="<key>"
//   - close trigger: data-modal-close  (lives inside the modal)
// Focus trap + Esc live in utils/modal.ts — this file only resolves elements.
// No fixed ids: keys are data-driven from the triggering markup.

import { openModal, closeModal } from '../../../utils/modal';
import { qs } from '../../../utils/dom';

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

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
