// Paints the visible cart counter from stores/cart.ts without reloading the
// page (doc/astrobase.md §3.4). Re-queries every [data-cart-badge] on each
// change — no ids, works wherever badges live (ticket header…).
//
// refactorUI §4.2C (Fase 2): this island ALSO owns the mobile CartBar —
// "N ítems · S/ total" + visibility ⇔ cart not empty (bar AND its in-flow
// spacer), no dedicated island (the plan asked for exactly that: controlled
// by cart-badge/cart-actions, zero new islands).
// Browser-only module, loaded via an Astro <script>.

import { subscribeCart } from '../../stores/cart';
import { formatCurrency } from '../../utils/format';
import { calcTotal } from '../../utils/tax';

const bar = document.querySelector<HTMLElement>('[data-cart-bar]');
const spacer = document.querySelector<HTMLElement>('[data-cart-bar-spacer]');
const barCount = document.querySelector<HTMLElement>('[data-cart-bar-count]');
const barTotal = document.querySelector<HTMLElement>('[data-cart-bar-total]');

// Total = sum of quantities (a line of 6 counts as 6); money total follows
// base.md math (calcTotal = subtotal + tax) so it matches the ticket.
subscribeCart((items) => {
  const count = items.reduce((sum, item) => sum + item.cantidad, 0);
  for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-badge]')) {
    badge.textContent = String(count);
  }

  const isEmpty = items.length === 0;
  if (bar) bar.hidden = isEmpty;
  if (spacer) spacer.hidden = isEmpty;
  if (barCount) barCount.textContent = String(count);
  if (barTotal) {
    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    barTotal.textContent = formatCurrency(calcTotal(subtotal));
  }
});
