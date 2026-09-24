# Plan — Panel de stock bajo (alerta de inventario)

> Pedido del dueño 23/09/2026: "un dashboard donde se vea los productos con
> stock bajo o menores a 5". Elegido por el dueño vía pregunta: **página
> `/stock` + umbral en Ajustes + badge en el menú** (opción recomendada).

## Decisiones

- **D1 — Umbral configurable**: `ajustes.stock_alerta_min` (7ma llave ya
  existente, default **5**, rango 0–999). NO es una hoja nueva en Sheets:
  igual que nombre/moneda/IGV, es config del dispositivo en localStorage
  (base.md §2.3). Cambiarlo no requiere redeploy.
- **D2 — Solo lectura**: el panel nunca muta stock. Reponer = editar el
  producto en `/productos` (kardex/movimientos de stock queda fuera —
  plan-mejoras-2.md, "requiere diseño propio").
- **D3 — Badge cache-only**: `islands/stock-badge.ts` corre en todas las
  páginas sin red: lee `catalogo_cache` al load. Sin cache → pastilla
  oculta; nunca inventa un conteo. El próximo navigation lo pinta al día.

## Fases

- [x] **Fase 1 — Umbral en Ajustes.** *✅ 23/09/2026: `storage.ts`
  `stock_alerta_min` (default 5, validación 0–999 + Math.round);
  campo "Alerta de stock (unidades)" en `AjustesForm.astro`; fill +
  validación en `islands/ajustes.ts`.*
- [x] **Fase 2 — Página `/stock`.** *✅ 23/09/2026: `pages/stock.astro` +
  `smart/StockContainer.astro` (stats: N por reponer + inventario
  valorizado, aviso "menor a X", stale notice, botón Actualizar) +
  `islands/stock.ts` (cache-first mismo patrón de `catalog.ts`, filas
  ordenadas peor-primero, 0 → "Agotado" con texto+tono, estados
  `stock-ok`/`stock-nodata` agregados al union de `EmptyState`).*
- [x] **Fase 3 — Badge en el sidebar.** *✅ 23/09/2026: `NavItem.badge` +
  pastilla `data-nav-badge="stock"` (oculta por defecto, sr-only para
  lectores de pantalla) en `Sidebar.astro`; item "Stock" entre Categorías
  y Ajustes en `LayoutApp.astro`; `islands/stock-badge.ts` cache-only.*
- [x] **Fase 4 — Docs + auditoría.** *✅ 23/09/2026: base.md §2.3
  (ajustes incluye stock_alerta_min) y §7 (panel /stock + badge);
  gates: build **9 páginas**/0 · greps 0 · tsc 15 = baseline, 0 en
  archivos de fase.*

## Gates

1. `pnpm build` → 0 errores (9 páginas).
2. Greps estándar: `fetch` solo `client.ts` · `localStorage.` solo
   `storage.ts` · `id="` islands → 0 · `text-xs|text-sm` → 0 · `ui/` sin
   api/stores/storage · hex → 0 · `TODO` → 0.
3. `tsc --noEmit` → 15 = baseline (12/2/1), 0 en archivos de fase.
4. Checklist humano del dueño: ver umbral configurable en `/ajustes`,
   fila "Agotado" en rojo con texto, badge con conteo, y que `/stock`
   funcione offline desde cache.

## Fuera de alcance (salvo orden expresa)

- Notificaciones push/email de stock bajo.
- Kardex / movimientos de inventario (entrada, merma, reposición).
- Multi-dispositivo: el stock es best-effort entre dispositivos
  (base.md §7 — no se promete consistencia fuerte).
