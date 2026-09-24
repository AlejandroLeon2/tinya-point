// Generic open/close/focus-trap helpers shared by every modal
// (doc/astrobase.md §3.5). No markup lives here.
//
// Contract: operates on any modal root element that uses the `hidden`
// attribute; the ui/Modal.astro shell renders `hidden` + tabindex="-1" on
// its root. One modal active at a time.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ActiveModal {
  modal: HTMLElement;
  trigger: HTMLElement | null;
  onKey: (event: KeyboardEvent) => void;
}

// Module-level state only — no side effects at import time.
let active: ActiveModal | null = null;

function getFocusable(modal: HTMLElement): HTMLElement[] {
  // Visible-only: `hidden`/display:none controls (e.g. the image "Quitar"
  // button in ProductForm) match the selector but the browser does NOT
  // tabulate them — counting them breaks the first/last wrap arithmetic and
  // lets focus escape (caught by test-a11y, T4.2).
  return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
}

export function openModal(modal: HTMLElement, trigger?: HTMLElement | null): void {
  if (active) closeModal(active.modal);

  const origin =
    trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  modal.hidden = false;
  if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(modal);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusable(modal);
    if (focusable.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;

    if (event.shiftKey) {
      if (current === first || !modal.contains(current)) {
        event.preventDefault();
        last.focus();
      }
    } else if (current === last || !modal.contains(current)) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKey);
  active = { modal, trigger: origin, onKey };

  const firstFocusable = getFocusable(modal)[0];
  (firstFocusable ?? modal).focus();
}

export function closeModal(modal: HTMLElement): void {
  if (!active || active.modal !== modal) return;

  document.removeEventListener('keydown', active.onKey);
  modal.hidden = true;
  if (active.trigger && document.contains(active.trigger)) active.trigger.focus();
  active = null;
}
