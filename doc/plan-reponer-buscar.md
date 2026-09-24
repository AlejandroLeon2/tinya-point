# Plan — Repostock rápido + búsqueda en Productos (quick wins UX)

> 23/09/2026 — Sale de `doc/auditoria-ux.md` (P1 + P2, elegidos por el
> dueño): "que todo le sea mucho más fácil al usuario". Cero cambios de
> backend: ambos reusan contratos/patrones existentes.

## Decisiones

- **D1 — Guardado inmediato con debounce**: el stepper −/+ de `/stock`
  actualiza optimista y llama a `actualizarProducto({ id, stock })`
  (appscriptbase §4.10 — ya existe y valida) con debounce de 500 ms para
  no disparar una llamada por click; input con `change` (blur/Enter) para
  repuestos grandes. Fallo → revert al último valor guardado + Alert.
- **D2 — La fila no desaparece al cruzar el umbral**: al subir stock ≥
  umbral la fila permanece hasta recargar (evita que el dato desaparezca
  debajo del dedo); sí se actualizan stats + badge (vía
  `catalogo_cache`, patrón G5 de `product-admin.ts`).
- **D3 — Búsqueda admin = Fuse local**: mismo patrón que
  `islands/catalog.ts` (`keys: ['nombre', 'categoria']`, threshold 0.3,
  debounce 200 ms, cero red en el handler — appscriptbase §5.3).

## Fases

- [x] **Fase 1 — Stepper de stock en `/stock`.** *✅ 23/09/2026:
  `StockContainer.astro` (fila con [−] input [+], badge "Agotado",
  aria-label por fila) + `islands/stock.ts`: debounce 500 ms con cola de
  filas pendientes, serialización anti-superposición, clamps 0–999,
  revert + Alert en fallo, actualización de `productos` en memoria y de
  `catalogo_cache` en éxito (badge al día al navegar).*
- [x] **Fase 2 — Buscador en `/productos`.** *✅ 23/09/2026: input
  `data-product-search` en `ProductContainer.astro` + Fuse en
  `product-admin.ts` (índice reconstruido en cada `render()`, filtro en
  el loop, estado vacío `no-results` solo cuando hay búsqueda y 0
  coincidencias; debounce 200 ms sin red). EmptyState union: +`empty-productos`.*
- [x] **Fase 3 — Docs + auditoría.** *✅ 23/09/2026: auditoria-ux.md P1/P2
  marcados implementados; base.md §7 actualizado; gates: build **9
  páginas**/0 · greps 0 · tsc 15 = baseline, 0 en archivos de fase.*

## Gates

1. `pnpm build` → 0 errores (9 páginas).
2. Greps estándar (fetch/client · localStorage/storage · id= · text-xs/sm ·
   ui/ sin api · hex · TODO).
3. `tsc --noEmit` → 15 = baseline, 0 en archivos de fase.
4. Checklist humano: reposter desde `/stock` con −/+, buscar "coc" en
  `/productos`, probar stepper sin conexión (debe revertir + alerta).

## Fuera de alcance (salvo orden expresa)

- Anular venta, kardex, notaciones de stock — ver `auditoria-ux.md`.
- Cola offline para ediciones de stock (hoy: alerta + revert, igual que el
  form de productos).
