// Mobile drawer + brand + collapse + logout for the app sidebar
// (doc/plan-sidebar.md Fase 3, refactorUI §3.2 Fase 1).
// Contract with LayoutApp.astro + ui/Sidebar.astro:
//   - drawer root:      data-sidebar-root     (visibility = CSS media query)
//   - open state:       data-sidebar-open     toggled HERE
//   - toggle button:    data-sidebar-toggle   (aria-expanded kept in sync)
//   - brand:            data-sidebar-brand    repainted from nombre_local
//   - collapse toggle:  data-sidebar-collapse-toggle (aria-pressed kept in
//     sync; the RAIL layout itself is owned by Sidebar's <style>, gated at
//     min-width:768px — the mobile drawer never collapses)
//   - collapsed state:  data-sidebar-collapse on the ROOT
//   - logout trigger:   data-logout           (ALL elements — sidebar footer
//     and the "Más" Sheet both carry it)
//
// Why not the `hidden` attribute (modal/offline-banner contract): the drawer
// must default to hidden below `md` and visible at `md+` WITHOUT JS deciding
// the breakpoint — the media query in ui/Sidebar.astro owns that, so there is
// no pre-hydration flash and desktop is correct even if this island fails.
// Gotcha G1 still holds: show/hide via display only, never transform (a
// transform would create a containing block and break fixed descendants).
// One sidebar per page, queried by data attribute — no fixed ids, no globals.

import { logout } from '../../stores/session';
import { getAjustes, setAjustes } from '../../utils/storage';

const root = document.querySelector<HTMLElement>('[data-sidebar-root]');
const toggle = document.querySelector<HTMLElement>('[data-sidebar-toggle]');

// Brand (refactorUI §3.2): default copy is the build-time fallback; when the
// cashier set a local name in Ajustes, repaint it. textContent only (§0.3).
const brand = document.querySelector<HTMLElement>('[data-sidebar-brand]');
const nombreLocal = getAjustes().nombre_local.trim();
if (brand && nombreLocal) brand.textContent = nombreLocal;

// Desktop collapse rail (refactorUI §3.2 Fase 1): preference lives inside
// the existing `ajustes` JSON — NO new localStorage key (the map caps 7).
const collapseToggle = document.querySelector<HTMLElement>('[data-sidebar-collapse-toggle]');
if (root && collapseToggle) {
  const setCollapsed = (collapsed: boolean): void => {
    root.toggleAttribute('data-sidebar-collapse', collapsed);
    collapseToggle.setAttribute('aria-pressed', String(collapsed));
  };

  setCollapsed(getAjustes().sidebar_colapsado);

  collapseToggle.addEventListener('click', () => {
    const next = !root.hasAttribute('data-sidebar-collapse');
    setCollapsed(next);
    try {
      setAjustes({ ...getAjustes(), sidebar_colapsado: next });
    } catch {
      // write() fail-softs normally; if the storage write throws the rail
      // still works for THIS page load — never block the click on it.
    }
  });
}

if (root && toggle) {
	const setOpen = (open: boolean): void => {
		root.toggleAttribute('data-sidebar-open', open);
		toggle.setAttribute('aria-expanded', String(open));
		// Keyboard: opening moves focus into the drawer (it comes BEFORE the
		// toggle in DOM order, so Tab alone would skip it); closing with focus
		// inside returns it to the toggle.
		if (open) {
			root.querySelector<HTMLElement>('a[href]')?.focus();
		} else if (root.contains(document.activeElement)) {
			toggle.focus();
		}
	};

	toggle.addEventListener('click', () => {
		setOpen(!root.hasAttribute('data-sidebar-open'));
	});

	// Esc closes the drawer only while it is open (the desktop breakpoint
	// clears the attribute via the media listener below, so this is a no-op
	// on desktop).
	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape') return;
		if (!root.hasAttribute('data-sidebar-open')) return;
		event.preventDefault();
		setOpen(false);
	});

	// Tap outside the open drawer closes it (dismiss without a backdrop).
	document.addEventListener('click', (event) => {
		if (!root.hasAttribute('data-sidebar-open')) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		if (root.contains(target) || toggle.contains(target)) return;
		setOpen(false);
	});

	// Navigating from a drawer link closes it (honest state even though the
	// cross-page links reload anyway).
	root.addEventListener('click', (event) => {
		const target = event.target;
		if (target instanceof Element && target.closest('a[href]')) setOpen(false);
	});

	// Crossing to >= md: CSS already shows the drawer; clear the stale open
	// state so shrinking back to mobile doesn't pop it open unrequested.
	const desktop = window.matchMedia('(min-width: 768px)');
	desktop.addEventListener('change', (event) => {
		if (event.matches) setOpen(false);
	});
}

// Logout: drops ONLY the token — cart and history survive
// (stores/session contract) — and lands on /login with replace(), same
// criterion as islands/route-guard.ts (Back never returns to a protected
// page). querySelectorALL (Fase 1): the sidebar footer AND the "Más" Sheet
// both expose a [data-logout] button.
document.querySelectorAll<HTMLElement>('[data-logout]').forEach((logoutButton) => {
	logoutButton.addEventListener('click', () => {
		logout();
		window.location.replace('/login');
	});
});
