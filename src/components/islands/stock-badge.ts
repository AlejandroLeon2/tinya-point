// Low-stock badge in the sidebar (plan-stock.md Fase 3) — reveals the pill
// next to "Stock" with the number of products under the configured
// threshold (ajustes.stock_alerta_min, default 5).
//
// Cache-only on purpose: ZERO network from this island (it runs on every
// app page). It reads whatever `catalogo_cache` holds at load — any catalog
// refresh (POS catalog, /stock page) updates the cache, and the NEXT
// navigation repaints the badge. No cache → the pill simply stays hidden;
// it never invents a count. Text via textContent only; data-* hooks only.

import { formatNumero } from '../../utils/format';
import { getAjustes, getCatalogoCache } from '../../utils/storage';

const badge = document.querySelector<HTMLElement>('[data-nav-badge="stock"]');
const countEl = badge?.querySelector<HTMLElement>('[data-nav-badge-count]');

if (badge && countEl) {
  const cached = getCatalogoCache();
  if (cached && cached.productos.length > 0) {
    const umbral = getAjustes().stock_alerta_min;
    const bajos = cached.productos.filter((p) => p.stock < umbral).length;
    if (bajos > 0) {
      countEl.textContent = formatNumero(bajos);
      badge.hidden = false;
    }
  }
}
