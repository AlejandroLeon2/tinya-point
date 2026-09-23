// Paints the visible cart counter from stores/cart.ts without reloading the
// page (doc/astrobase.md §3.4). Re-queries every [data-cart-badge] on each
// change — no ids, works wherever badges live (header, summary…).
// Browser-only module, loaded via an Astro <script>.

import { subscribeCart } from '../../stores/cart';

// Total = sum of quantities (a line of 6 counts as 6).
subscribeCart((items) => {
  const total = items.reduce((sum, item) => sum + item.cantidad, 0);
  for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-badge]')) {
    badge.textContent = String(total);
  }
});
