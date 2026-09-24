// Route guard for the static site (doc/astrobase.md §3.4, doc/base.md §3).
// Base decision (owner, 2026-09-22): the app STARTS at /login — every other
// route sits behind the guard, and /login bounces already-authenticated
// users to / so the form never loops.
//
// Runs client-side because output: "static" has no server middleware.
// location.replace (not assign) so Back never returns to a protected page.
// Pathname decides the branch, stores/session decides auth — no fixed ids,
// no globals (golden rule 4).

import { isAuthenticated } from '../../../stores/session';

const path = window.location.pathname.replace(/\/+$/, '') || '/';

if (path === '/login') {
  if (isAuthenticated()) window.location.replace('/');
} else if (!isAuthenticated()) {
  window.location.replace('/login');
}
