// Mobile drawer + logout for the app sidebar (doc/plan-sidebar.md Fase 3).
// Contract with LayoutApp.astro + ui/Sidebar.astro:
//   - drawer root:    data-sidebar-root     (visibility = CSS media query)
//   - open state:     data-sidebar-open     toggled HERE
//   - toggle button:  data-sidebar-toggle   (aria-expanded kept in sync)
//   - logout trigger: data-logout
//
// Why not the `hidden` attribute (modal/offline-banner contract): the drawer
// must default to hidden below `md` and visible at `md+` WITHOUT JS deciding
// the breakpoint — the media query in ui/Sidebar.astro owns that, so there is
// no pre-hydration flash and desktop is correct even if this island fails.
// Gotcha G1 still holds: show/hide via display only, never transform (a
// transform would create a containing block and break fixed descendants).
// One sidebar per page, queried by data attribute — no fixed ids, no globals.

import { logout } from '../../stores/session';

const root = document.querySelector<HTMLElement>('[data-sidebar-root]');
const toggle = document.querySelector<HTMLElement>('[data-sidebar-toggle]');

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
// page).
const logoutButton = document.querySelector<HTMLElement>('[data-logout]');
logoutButton?.addEventListener('click', () => {
	logout();
	window.location.replace('/login');
});
