// Media query helpers (D13).
// Reference: catalog, checkout, historial, sidebar use matchMedia('(min-width: 768px)').

const DESKTOP_QUERY = '(min-width: 768px)';
let desktopMq: MediaQueryList | null = null;

// POS ticket-as-column breakpoint (§4.2C): below 1024px the ticket is a
// bottom sheet, so F9 (charge) must stay off — the button lives in a
// hidden sheet there.
const TICKET_FIJO_QUERY = '(min-width: 1024px)';
let ticketFijoMq: MediaQueryList | null = null;

// Current desktop state.
export function esDesktop(): boolean {
  if (!desktopMq) desktopMq = window.matchMedia(DESKTOP_QUERY);
  return desktopMq.matches;
}

// True when the ticket renders as the always-visible right column (≥lg).
export function esTicketFijo(): boolean {
  if (!ticketFijoMq) ticketFijoMq = window.matchMedia(TICKET_FIJO_QUERY);
  return ticketFijoMq.matches;
}

// Subscribe to desktop breakpoint changes.
export function enCambioDesktop(cb: (matches: boolean) => void): void {
  if (!desktopMq) desktopMq = window.matchMedia(DESKTOP_QUERY);
  desktopMq.addEventListener('change', (e) => cb(e.matches));
}
