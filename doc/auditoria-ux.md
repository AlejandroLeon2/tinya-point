# Auditoría UX — fricciones verificadas en el código

> 23/09/2026 — Pedido del dueño: "habría que hacer una auditoría en busca de
> mejoras... que todo le sea mucho más fácil al usuario". Método: revisión de
> flujos REALES en el código (no percepción). Cada fricción indica evidencia.

## Fricciones encontradas

### P1 — Repostock: hoy son 6 pasos ⭐ prioridad → ✅ implementado (plan-reponer-buscar.md, 23/09/2026)

**Flujo actual**: sidebar Productos → buscar a mano la fila (ver P2) →
botón Editar → el form entra en modo edición → campo stock → "Guardar
cambios". Todo para sumar 12 unidades.
**Evidencia**: `product-admin.ts` (form único de edición, `guardar()` →
`actualizarProducto({ id, ...datos })`); `stock.ts` hoy es 100% lectura.
**Solución**: stepper inline (−/+) o input por fila **en `/stock`** llamando a
`actualizarProducto({ id, stock })` — el contrato **ya existe y valida**
(appscriptbase §4.10, `isValidStockValue` en actions/productos.ts). Actualiza
también `catalogo_cache` para que el badge/POS queden al día.
**Impacto**: alto (uso diario del dueño) · **Esfuerzo**: medio (isla + fila).

### P2 — `/productos` admin no tiene búsqueda ni filtro ⭐ prioridad → ✅ implementado (plan-reponer-buscar.md, 23/09/2026)

**Flujo actual**: con ~194 productos, lista completa sin filtrar; buscar un
producto para editar precio/stock es scroll a ciegas.
**Evidencia**: grep de `search|buscar|filtro` en `ProductContainer.astro` y
`product-admin.ts` → 0 resultados (solo extrae distinct de categorías). El POS
(`Catalog.astro` + `islands/catalog.ts`) **sí** tiene Fuse.js con
`keys: ['nombre', 'categoria']`.
**Solución**: mismo patrón de `catalog.ts` (input + Fuse local, cero red,
corte 0.3). Copiar el debounce de 200 ms.
**Impacto**: alto · **Esfuerzo**: bajo (patrón ya existe en el repo).

### P3 — Badge de `/stock` se actualiza recién al navegar

**Evidencia**: `islands/stock-badge.ts` es cache-only por diseño
(`plan-stock.md` D3): lee `catalogo_cache` al load; si el catálogo se
refresca en ESTA página, el badge queda desactualizado hasta el próximo
navigation.
**Solución opcional**: que `stock.ts` despache un evento al refrescar y el
badge lo escuche (cambio mínimo, solo si molesta en el uso real).
**Impacto**: bajo · **Esfuerzo**: bajo.

## Lo que NO es fricción (verificado)

- **Carrito**: `CartLine.astro` ya tiene stepper −/+ por línea con
  `aria-label` — agregar/quitar cantidades es directo.
- **Búsqueda en el POS**: Fuse.js local, sin red, con debounce — funciona.
- **Categorías/Ajustes**: CRUD y form en una pantalla, sin pasos extra.
- **Caja**: apertura/cierre con modal de confirmación, resumen del día.

## Gaps funcionales (no son UX — requieren decisión/b backend)

- **Anular/void de una venta**: no existe acción ni UI (los 11 POST no la
  incluyen). Si lo querés, es un plan aparte con diseño de reverso de stock.
- **Kardex / movimientos de inventario**: fuera de alcance actual
  (`plan-mejoras-2.md`, requiere diseño propio).
- **Notificaciones de stock bajo**: fuera de alcance (`plan-stock.md`).

## Recomendación

Implementar **P1 + P2 en un mismo plan corto**: ambos son dolores diarios
verificados, usan contratos/patrones que ya existen en el repo
(`actualizarProducto`, Fuse de `catalog.ts`) y no tocan backend.
