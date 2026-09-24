// Media query helpers (D13).
// Reference: catalog, checkout, historial, sidebar use matchMedia('(min-width: 768px)').

const DESKTOP_QUERY = '(min-width: 768px)';
let desktopMq: MediaQueryList | null = null;

// Current desktop state.
export function esDesktop(): boolean {
  if (!desktopMq) desktopMq = window.matchMedia(DESKTOP_QUERY);
  return desktopMq.matches;
}

// Subscribe to desktop breakpoint changes.
export function enCambioDesktop(cb: (matches: boolean) => void): void {
  if (!desktopMq) desktopMq = window.matchMedia(DESKTOP_QUERY);
  desktopMq.addEventListener('change', (e) => cb(e.matches));
}
