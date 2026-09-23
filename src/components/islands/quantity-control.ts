// Per-card quantity controls. ONE delegated document-level listener resolves
// the counter RELATIVE TO THE TRIGGERING CARD (utils/dom closestCard) — never
// fixed ids or module globals, so any number of cards coexist on one page
// (doc/astrobase.md §3.4). Browser-only module, loaded via an Astro <script>.

import { closestCard } from '../../utils/dom';
import { isValidQuantity } from '../../utils/validators';

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const step = target.closest<HTMLElement>('[data-qty-step]');
  if (!step) return;

  const card = closestCard(step);
  if (!card) return;

  const readout = card.querySelector<HTMLElement>('[data-qty-value]');
  if (!readout) return;

  const current = Number(readout.textContent);
  if (!isValidQuantity(current)) return;

  const delta = step.getAttribute('data-qty-step') === 'up' ? 1 : -1;
  const next = current + delta;
  // The counter picks the quantity to ADD — 0 and below make no sense here.
  // Removing an item from the cart is stores/cart.ts' job, not the counter's.
  if (next < 1) return;

  readout.textContent = String(next);
});
