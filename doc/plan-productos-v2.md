# Plan: paginación, categorías, cards y settings (productos v2)

**Creado:** 23/09/2026 · **Ruta:** modelo MD por fases (igual que `plan-cierre.md`).
**Motivo:** SDD pedido y aceptado, pero el dispatch de sub-agentes está caído
(`Cannot connect to API`); el dueño eligió avanzar con el modelo MD.

## Decisiones ya saldadas

- **D1 — Paginación: SOLO VISUAL, sin cambios de API.** Partir el catálogo en
  páginas de 50 productos en el cliente. Fuente: `catalogo_cache`, sin nuevas
  claves de localStorage. *(base.md §9; decisión del dueño 23/09/2026.)*
- **D2 — Categorías con CRUD = hoja nueva `Categorias` en el Sheet + acciones
  nuevas en Apps Script** (SÍ toca API y docs espejo). *(decisión del dueño
  23/09/2026.)*
- **D3 — Cards admin:** las cards del POS ya muestran imagen; el pedido se
  refiere a las **filas/lista admin en `/productos`**, que hoy no muestran
  foto. *(asunción confirmada implícitamente — relevar en Fase 4.)*
- **D4 — Settings:** alcance **pendiente** de definir con el dueño al llegar
  a Fase 5. Opciones ofrecidas: datos del negocio · IGV configurable ·
  herramientas de datos (export CSV / limpiar caché) · estado del sistema.

## Fases

- [x] **Fase 0 — Docs de decisión.** Anotar D1/D2/D3 en `doc/base.md` (§9
  paginación ya prevista) y D2 en `doc/appscriptbase.md` (hoja nueva).
  *✅ 23/09/2026: base.md §9 (D1), §2.5 hoja Categorias (D2), §7 (CRUD
  categorías + foto admin + settings); appscriptbase.md §3.2 acciones
  planeadas (D2).*
- [x] **Fase 1 — Paginación visual (50/página).** Grid del catálogo en `/`
  paginado en el cliente: botones Anterior/Siguiente, indicador
  "N–M de T", reset a página 1 al cambiar filtro o búsqueda. Sin API, sin
  storage, sin `id=` fijos en islas, targets táctiles, foco visible, sin
  `text-xs`/`text-sm`.
  *✅ 23/09/2026: `Catalog.astro` +nav con range `aria-live`; `catalog.ts`
  `PAGE_SIZE=50`, clamp de página, reset en filtro/búsqueda, botones
  deshabilitados en extremos. Gates: build 6 páginas/0 · greps 0/0/0/0/0/0 ·
  tsc 15 = baseline exacto (12/2/1), 0 en archivos de fase.*
- [x] **Fase 2 — CRUD de categorías (Sheet + API).** Hoja `Categorias`
  (`id`, `nombre`) en el Sheet; acciones nuevas en `Code.gs`
  (`categorias` GET + crear/actualizar/borrar con token); `client.ts`
  agrega las funciones; **espejos**: `doc/astrobase.md` §3.2 (acciones) y
  §4.5 (errores — incl. `categoria_en_uso`) + schema de hoja en los docs que
  correspondan; UI admin de categorías (página o sección, ver D-C2 al
  llegar). Borrar solo si ningún producto la usa.
  *✅ 23/09/2026: D-C2 = **página /categorias nueva** con ítem en sidebar
  (decisión del dueño). `categorias.gs` nuevo (obtener/crear/actualizar con
  cascade a Productos + borrar con guard `categoria_en_uso`); `Code.gs`
  doGet +3 casos (11 POST); `types.ts` +2 ErrorCode/+3 escritura/+1 lectura;
  `client.ts` +2 SERVER_CODES; `actions/categorias.ts`; página
  `categorias.astro` + `CategoriaContainer` + `CategoriaForm` + `CategoriaRow`
  + isla `categorias-admin.ts`; sidebar +Categorías. Espejos:
  appscriptbase §3.1/§3.2 (11=11)/§3.7 nuevo/§4.5 (7=7=7)/§4.11–§4.14;
  base.md §2.5 → implementada. Gates: build **7 páginas**/0 · greps 0/0/0/0/
  0/0/0 · tsc 15 = baseline (12/2/1), 0 en archivos de fase.
  **Paso humano pendiente:** crear hoja `Categorias` (headers `id`,
  `nombre`) en el Sheet + `clasp push` + despliegue nuevo de Apps Script —
  sin eso /categorias responde `accion_no_soportada`.*
- [x] **Fase 3 — Form de productos conectado a categorías.** El input
  `categoría` de `ProductForm.astro` pasa a `<select>` poblado desde
  `GET categorias`, con fallback al patrón existente (distinct de productos
  si el endpoint no está desplegado). Sin clave de storage nueva.
  *✅ 23/09/2026: input → `<select>` con opción en blanco; `poblarCategorias()`
  en `product-admin.ts` (GET con fallback a distinct de `productosAdmin`,
  preserva selección en curso); editar producto con categoría legacy la
  inyecta como opción; copy "Elegí la categoría del producto.".
  Gates: build 7/0 · greps 0 · tsc = baseline (0 en archivos de fase).*
- [ ] **Fase 4 — Foto en filas admin de `/productos`.** Thumbnail con
  `resolveImageUrl` + lazy en `ProductRow` (o su contenedor), degradando a
  placeholder si no hay imagen.
- [x] **Fase 5 — Apartado Settings.** Primero definir alcance con el dueño
  (D4), implementar, y actualizar docs si nace contrato nuevo.
  *✅ 23/09/2026: D4 = **datos del negocio + IGV configurable** (dueño eligió;
  descartó estado del sistema y herramientas de datos). Llave `ajustes`
  (7ma) en `storage.ts` con defaults y validación campo a campo; `tax.ts`
  ahora lee `getAjustes().igv_tasa` (`getTaxRate`/`etiquetaIgv`, default 18);
  `formatCurrency` lee `ajustes.moneda` (default S/); las 3 etiquetas IGV
  bakeadas en frontmatter (CartSummary/CheckoutPanel/VentaDetailContainer)
  pasan a render por isla con default de build; página `/ajustes` (form
  nombre/moneda/IGV + reload al guardar) + item "Ajustes" en sidebar;
  docs: base.md §2.3 (+ajustes, 7ma llave) y §7 (alcance D4).
  Gates: build **8 páginas**/0 · greps 0 · tsc 15 = baseline, 0 en archivos
  de fase · `TAX_RATE` → 0 referencias.*
- [x] **Fase 6 — Auditoría final + gates humanos.** Ver Gates.
  *✅ 23/09/2026: auditoría completa verde — build **8 páginas**/0 · greps
  todos 0 (fetch/localStorage/id/text/hex/TODO) · tsc 15 = baseline (12/2/1),
  0 en archivos de fase · espejos: POST `case '` 11 = §3.2 (11) · GET = 2
  (productos, categorías) · `ErrorCode` 7 = `SERVER_CODES` 7 = §4.5 (7) ·
  `doGet action ===` 2 (+1 falso positivo por `''`) · `KEY_` 7 = base.md
  §2.3 (7) · `TAX_RATE` → 0.
  **Gates humanos pendientes (dueño):** (a) crear hoja `Categorias`
  (`id`, `nombre`) + `clasp push` + redeploy del backend; (b) checklist en
  vivo: paginación con ~194 productos, CRUD de categorías, select de
  categoría en el form, thumbnail en filas admin, `/ajustes` (IGV/moneda).

## Gates (cada fase)

1. `pnpm build` → 0 errores.
2. Greps: `fetch` solo `src/api/client.ts` · `localStorage.` solo
   `src/utils/storage.ts` · `id="` en islas → 0 · `text-xs|text-sm` → 0 ·
   `ui/` sin imports de `api/` `stores/` `storage/` · hex → 0 fuera
   `global.css` · `\bTODO\b` en `src/` → 0.
3. Contratos espejados: acciones nuevas en Code.gs = filas de §3.2;
   errores = filas de §4.5 (los conteos de Fase 2 reemplazan los de
   `plan-cierre.md`: POST 8 → 11 con las 3 de categorías, GET +1 = 2).
4. `pnpm exec tsc --noEmit` → 15 errores = baseline (12/2/1), 0 en archivos
   de fase.
5. Checklist humano del dueño al cerrar (Fase 6).

## Fuera de alcance (salvo orden expresa)

- Export CSV de historial (base.md §7 lo tiene aplazado; D4 podría
  levantarlo — si elige esa opción de Settings, anotarlo acá).
- MODO_DEMO, CI, backdrop de drawer, refactor de Head.astro.
- Paginación server-side / cambios de `getProductos`.
