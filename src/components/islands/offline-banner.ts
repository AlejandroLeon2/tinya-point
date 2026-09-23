// Wires the ui/OfflineBanner visibility to the network listener in
// stores/session (doc/extras.md §6). The listener is deliberately NOT
// started at store import time — it starts HERE, when this island mounts
// (contract from doc/plan.md Fase 5 / plan-features Fase 1).
// One banner per page, queried by data attribute — no fixed ids, no globals.

import { startNetworkListener, subscribeNetworkStatus } from '../../stores/session';

const banner = document.querySelector<HTMLElement>('[data-offline-banner]');

if (banner) {
  startNetworkListener();
  // subscribeNetworkStatus fires immediately with the current status, so the
  // banner reflects a page loaded while already offline.
  subscribeNetworkStatus((status) => {
    banner.hidden = status === 'online';
  });
}
