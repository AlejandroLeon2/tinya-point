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
const sheetOpenFrames = new WeakMap<HTMLElement, number>();
const sheetCloseTimers = new WeakMap<HTMLElement, number>();
const sheetCloseCleanups = new WeakMap<HTMLElement, () => void>();

function isMobileTicketSheet(modal: HTMLElement): boolean {
  return (
    modal.dataset.modalVariant === 'ticket' &&
    window.matchMedia('(max-width: 1023.98px)').matches
  );
}

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

  const isTicketSheet = isMobileTicketSheet(modal);
  sheetCloseCleanups.get(modal)?.();
  const closeTimer = sheetCloseTimers.get(modal);
  if (closeTimer !== undefined) window.clearTimeout(closeTimer);
  sheetCloseTimers.delete(modal);
  const openFrame = sheetOpenFrames.get(modal);
  if (openFrame !== undefined) window.cancelAnimationFrame(openFrame);

  const origin =
    trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  if (isTicketSheet) modal.dataset.sheetState = 'closed';
  modal.hidden = false;
  if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');

  if (isTicketSheet) {
    void modal.offsetHeight;
    const frame = window.requestAnimationFrame(() => {
      sheetOpenFrames.delete(modal);
      if (!modal.hidden && modal.dataset.sheetState === 'closed') {
        modal.dataset.sheetState = 'mid';
      }
    });
    sheetOpenFrames.set(modal, frame);
    const toggle = modal.querySelector<HTMLElement>('[data-ticket-sheet-toggle]');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Expandir ticket');
    if (toggle) toggle.title = 'Expandir ticket';
  }

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
  const openFrame = sheetOpenFrames.get(modal);
  if (openFrame !== undefined) {
    window.cancelAnimationFrame(openFrame);
    sheetOpenFrames.delete(modal);
  }

  const restoreFocus = active.trigger;
  active = null;
  if (isMobileTicketSheet(modal) && modal.dataset.sheetState !== 'closed') {
    const dialog = modal.querySelector<HTMLElement>('[role="dialog"]');
    let finished = false;
    let closeTimer = 0;
    const cleanup = (): void => {
      dialog?.removeEventListener('transitionend', onTransitionEnd);
      window.clearTimeout(closeTimer);
      sheetCloseTimers.delete(modal);
      sheetCloseCleanups.delete(modal);
    };
    const finish = (): void => {
      if (finished) return;
      finished = true;
      cleanup();
      modal.hidden = true;
      if (restoreFocus && document.contains(restoreFocus) && !active) restoreFocus.focus();
    };
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.target === dialog && event.propertyName === 'transform') finish();
    };

    dialog?.addEventListener('transitionend', onTransitionEnd);
    sheetCloseCleanups.set(modal, cleanup);
    modal.dataset.sheetState = 'closed';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
    } else {
      closeTimer = window.setTimeout(finish, 400);
      sheetCloseTimers.set(modal, closeTimer);
    }
  } else {
    modal.hidden = true;
    if (restoreFocus && document.contains(restoreFocus)) restoreFocus.focus();
  }
}
