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
import { qs, qsa, setText, setHidden } from '../../utils/dom';

const bar = qs<HTMLElement>(document, '[data-cart-bar]');
const spacer = qs<HTMLElement>(document, '[data-cart-bar-spacer]');
const barCount = qs<HTMLElement>(document, '[data-cart-bar-count]');
const barTotal = qs<HTMLElement>(document, '[data-cart-bar-total]');

// Total = sum of quantities (a line of 6 counts as 6); money total follows
// base.md math (calcTotal = subtotal + tax) so it matches the ticket.
subscribeCart((items) => {
  const count = items.reduce((sum, item) => sum + item.cantidad, 0);
  for (const badge of qsa<HTMLElement>(document, '[data-cart-badge]')) {
    setText(badge, String(count));
  }

  const isEmpty = items.length === 0;
  setHidden(bar, isEmpty);
  setHidden(spacer, isEmpty);
  setText(barCount, String(count));
  if (barTotal) {
    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    setText(barTotal, formatCurrency(calcTotal(subtotal)));
  }
});
