# Plan de implementación — Refactor UI/UX (por fases)

> **Base:** `doc/refactorUI.md` (estado objetivo, §0 reglas no negociables, §13 fases) +
> `doc/mapa-ui-ux.md` (inventario verificado). Este plan **desmenuza** el §13 en tareas con
> checkbox: cada fase cierra con build verde + gates de invariantes + mapa actualizado (§14).
> **Formato de cierre:** al terminar cada tarea, marcar `[x]` y agregar la línea de evidencia
> debajo de la fase: `*✅ DD/MM/AAAA: gate/evidencia*`.
> **Hilos de trabajo:** un solo writer por fase; no avanzar de fase sin gates en verde.

## Gates globales (corren al cierre de CADA fase)

- [x] `pnpm build` → **9 páginas / 0 errores**
- [x] `grep 'id="' src/components/islands/*.ts` → **0**
- [x] `grep -rn "fetch(" src --include="*.ts"` → solo `src/api/client.ts`
- [x] `grep -rn "localStorage" src` → solo `utils/storage.ts` (más `pwa.ts` si aplica)
- [x] Todos los `data-*` previos existen, salvo retirados **explícitos** de esta fase (listados abajo)
- [x] Flujo venta offline → `cola_sync` → reconexión sin cambios de lógica (smoke test)
- [x] `doc/mapa-ui-ux.md` actualizado para lo que esta fase cambió (§14 del refactor) + fecha nueva
- [x] **§0 revisado:** reglas 1–11 sin violaciones (`ui/` puro, hooks `data-*`/cero `id`,
      `textContent` español, estado por `hidden`, `<template>`+`cloneNode`+`closest()`,
      `static` sin render server, modales de confirmación con `ui/Modal`, targets ≥56/44,
      sin `transform` en ancestros de `fixed` [G1], `data-*` conservados salvo bajas listadas)
- [x] **Cero dependencias nuevas** (Fuse ya existe; íconos = SVG inline en `ui/Icon`) — §12
- [x] Evidencia fechada escrita en la fase

*✅ 23/09/2026 (cierre Fase 1): build 9 págs/0 · `id="` islands 0 · `fetch(` solo
`src/api/client.ts` · `localStorage` solo `utils/storage.ts` · `grep -w TODO` → 0 ·
`pnpm exec tsc --noEmit` = baseline 15 · regresión headless `test-fase0.js` 100% verde
(stock0 bloqueado + banner estático + Menú en flujo) — venta/carrito sin cambios de lógica ·
mapa actualizado (§2/§4/§6/§7/§8/§9/§10 + fecha Fase 1) · 0 dependencias nuevas ·
`text-xs|text-sm` en src → 0. (Nota: los 21 hex del repo están todos en `@theme` de
`src/styles/global.css` — hogar legítimo de tokens — 0 en componentes.)*

---

## Fase 0 — Correcciones rápidas (½ día)

Objetivo: bugs y fricciones inmediatas sin tocar arquitectura.

### T0.1 Fix estado "Venta no encontrada" (D12)
- [x] Quitar `hidden` al `EmptyState` hijo en `VentaDetailContainer.astro` (el wrapper
      `data-venta-no-encontrada` ya hace de puerta; la isla solo revela el wrapper).
- [x] Verificado en browser headless: `?id=inexistente` → texto visible + contenido oculto.
- [x] Mapa: **retirar el hueco de `venta-notfound`** en §10.10 (§14.6 del refactor).

*✅ 23/09/2026: fix aplicado; build 9 págs/0; playwright test3.js `notFoundVisible: true`.*

### T0.2 Bloquear agregar productos agotados (§4.2D)
- [x] `catalog.ts` `paintCard`: si `stock === 0` → tarjeta deshabilitada
      (`disabled` + `aria-disabled`, ribbon "Agotado" ya existe en `data-card-stock`).
- [x] `cart-actions.ts`: guard en `[data-add-to-cart]` — si el card tiene stock0, no agregar
      (defensa en profundidad, por si el disabled se pierde en un clone).
- [x] Verificar que el stepper de tarjeta NO permita agregar un ítem ya agotado en el ticket.

### T0.3 Resolviar D7 — OfflineBanner en flujo (§3.3)
- [x] `OfflineBanner.astro`: de `fixed inset-x-0 top-0 z-50` a **franja en flujo**
      (primero bajo el TopBar/header), conservar texto
      "Sin conexión — puedes seguir vendiendo", `pointer-events-none` y condición
      **`hidden ⇔ online`**.
- [x] `LayoutApp.astro`: quitar el `pt-16 md:pt-0` vacío del header slot.
      **Decisión:** quitar el `pt-16` con el Menú aún `fixed` hubiese dejado el Menú flotando
      sobre el contenido de todas las páginas en móvil — así que el Menú pasó a **fila en flujo**
      arriba del header slot (mismo hook `data-sidebar-toggle`, cero cambios de isla). Es el
      escalón natural al TopBar de Fase 1.
- [x] Confirmar que el botón `Menú` fijo deja de solaparse con la franja (móvil 360 px).
- [x] Actualizar mapa: §4 comunes (posición/visibilidad del banner), §8 capas z y
      §10.10 (hueco `venta-notfound` retirado — T0.1).

**Evidencia fase0:** `*✅ 23/09/2026: build 9 págs/0; gates id=/fetch/localStorage → verdes;
headless pwtest/test-fase0.js: stock0 con aria-disabled + add/steps disabled + ribbon visible +
guard rechaza click forzado (carrito 0) + producto normal agrega (carrito 1); banner `static`
online y offline (visible offline ✓); `.pt-16` ausente; Menú `position: static` en flujo;
0 errores inline. Mapa actualizado en §2/§4/§8/§10 + fecha.**

---

## Fase 1 — Fundaciones / sistema de diseño (1–2 días)

Objetivo: tokens + componentes base + chrome nuevo. Ninguna página se reordena todavía.

### T1.1 Tokens (§2.1)
- [x] Colores semánticos en Tailwind config/`:root`: `primary, success, warning, danger, info,
      surface, surface-alt, border, text, text-muted` — contraste AA verificado.
      *(Fase 1: `@theme` de `src/styles/global.css` — Tailwind v4 sin config — += `info`,
      `surface-alt`, `shadow-card/drawer/modal`; contraste `info` `#0B6E99` ≈5,2:1 vs `bg` ✓ AA.)*
- [x] Escala de espaciado 4/8/12/16/24/32; eliminar `px` arbitrarios fuera de escala (grep visual).
      *(Código nuevo en escala; excepciones heredadas/justificadas: rail 4.5rem §3.2,
      `pb-[calc(5rem+env(safe-area-inset-bottom))]` §3.4.)*
- [x] Radios: 8 controles / 12 cards / 9999 chips.
- [x] Tipografía: una familia sans; escala 12/14/16/20/24/32; `font-variant-numeric: tabular-nums`
      en importes, cantidades y stock (clase utilitaria `tabular-nums` aplicada donde corresponda).
      *(**Desviación registrada:** se conserva el piso 18px de stilesbase §3.2 — la escala del
      proyecto manda sobre la propuesta. `tabular-nums` aplicado en el nuevo `StatCard`; la
      migración de tablas/tickets existentes queda para sus fases (2/3).)*
- [x] Elevación: 3 niveles (card / drawer-modal / overlay). Targets: cajero ≥56 px, admin ≥44 px.
      *(`--shadow-card/drawer/modal` en `@theme`; TabBar targets 56px verificados.)*
- [x] Tokens listos para `prefers-color-scheme` (tema oscuro = opcional en T4.3 — §12).

### T1.2 Componentes `ui/` nuevos (§2.2) — puros, props/slots, cero lógica
- [x] `PageHeader.astro` (título + acciones slot + slot de estado).
- [x] `StatCard.astro` (etiqueta, valor, subtexto/delta).
- [x] `Chip.astro` + `ChipGroup.astro` (`role=radiogroup` o `aria-pressed`, selected via isla).
- [x] `StatusPill.astro` (ícono + texto + tono; nunca solo color).
- [x] `Toast.astro` + `ToastRegion.astro` (`aria-live=polite`, autocierre 4 s, fixed sin layout shift).
- [x] `Skeleton.astro` (bloques de carga de tarjetas/filas).
- [x] `Icon.astro` (SVG inline: caja, sync, red, check, buscar, etc.).
- [x] Variantes `Drawer` (lateral) y `Sheet` (inferior/pantalla) de `Modal.astro` — mismo
      contrato `data-modal-root`/`data-modal-open`/`modal-controller` (foco+Esc).
      *(Implementado como `variant?: 'center'|'drawer'|'sheet'` en el mismo `Modal.astro`.)*
- [x] `DataTable.astro` (≥md, encabezado sticky, numéricas a la derecha, colapsa a tarjetas <md;
      usada en historial y productos).
- [x] `Alert` queda solo para errores/advertencias persistentes (sin cambios de API).
- [x] `EmptyState`: slot/prop opcional de CTA (botón/link).
- [x] `Kbd.astro` (atajos, solo ≥md).

### T1.3 TopBar (§3.3) — reemplaza el header slot
- [x] Estructura en `LayoutApp.astro`: Menú (solo <md) · `PageHeader`/título · grupo de pills a la derecha.
- [x] Pill Caja `[data-topbar-caja]`: "Caja abierta · desde HH:MM" ⇔ "Caja cerrada" (tono warning,
      en `/` es link/botón a `/caja`) — fuente `cajas`.
      *(Hooks finales: `data-caja-abierta` (pill-ok, link a `/caja`) ⇔ `data-caja-cerrada`
      (pill-warn) — dos hooks en vez de uno; decisión anotada en el mapa §2.)*
- [x] Nueva isla `caja-status.ts` (cache-only, sin red) que pinta el pill.
- [x] Pill Sync: **conservar hook** `[data-sync-pending]` + `sync-status.ts` tal cual.
      *(Hook y condición intactos; solo cambió de sitio: ahora pill del TopBar.)*
- [x] Pill Red `[data-net-status]`: "En línea"/"Sin conexión" — eventos `online/offline`
      (reutilizar `stores/session`, sin isla nueva si es posible).
      *(**Decisión Fase 1: NO implementada** — redundante con `OfflineBanner` ya en flujo
      (§0.1: conservar); `net-status.ts` no se creó.)*
- [x] Eliminar el alert `aviso-caja` de `/` (absorbido por el pill) — retirada **explícita**
      del markup de `index.astro` + island `caja-banner.ts` (borrar o vaciar: decidir y anotar).
      *(Decisión: isla **borrada**; retirada anotada en mapa §6.1 y §7.)*
- [x] Alert `sync-danger` + modal `sync-detail` **se conservan** en flujo bajo el TopBar.
- [x] Franja `OfflineBanner` bajo el TopBar (hecha en Fase0).

### T1.4 Sidebar agrupado (§3.2)
- [x] Grupos: **Operación** (Venta, Historial, Caja) · **Inventario** (Productos, Categorías,
      Stock+badge) · **Sistema** (Ajustes); encabezado con `ajustes.nombre` (pintado por isla).
      *(`ajustes.nombre_local` pinta la **marca** del sidebar vía `sidebar.ts`; los encabezados
      de grupo son texto estático Operación/Inventario/Sistema.)*
- [x] Ícono SVG inline + texto por ítem; `aria-current="page"` se conserva.
- [x] Colapso a rail de iconos entre md y lg: hook `data-sidebar-collapse`; persistir la
      preferencia **dentro del JSON existente `ajustes`** (campo nuevo p.ej. `sidebar_colapsado`;
      **no crear llave de localStorage nueva** — límite7).
      *(`Ajustes.sidebar_colapsado: boolean` — sin llave nueva; rail aplica en **≥md** completo
      (media query min-width:768px), no solo md–lg — decisión anotada en mapa §2.)*
- [x] `data-logout` y badge `data-nav-badge="stock"` intactos.

### T1.5 TabBar móvil + Sheet "Más" (§3.4)
- [x] `TabBar` fija inferior <md: Venta | Historial | Caja | Más — targets ≥56 px, `z-40`.
- [x] "Más" abre `Sheet` (`data-modal-open="mas"`): Productos, Categorías, Stock, Ajustes,
      Cerrar sesión (`data-logout`).
- [x] Reemplazar el botón fijo `Menú[data-sidebar-toggle]` y el drawer en móvil (retirada
      **explícita**: conservar el hook `data-sidebar-toggle` **solo si** el Sheet "Más" lo
      reutiliza; anotar la decisión en el mapa).
      *(**Decisión Fase 1: Menú y drawer SE CONSERVAN** — el botón Menú se movió al TopBar
      (mismo hook `data-sidebar-toggle`, `md:hidden`), coexistiendo con la TabBar: TabBar =
      navegación primaria <md, Menú/drawer = acceso completo al rail agrupado. Sheet "Más"
      no reutiliza el hook; el `data-logout` SÍ es compartido (`querySelectorAll`). Anotado
      en mapa §2.)*
- [x] `padding-bottom` en `<main>` con `env(safe-area-inset-bottom)`.
      *(`pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0`; verificado 80px en 360px.)*
- [x] Verificar jerarquía z: TabBar40 < Sheets/Modales50 (§8 del mapa intacto).
      *(§8 actualizado: z50 > z45 drawer > z40 TabBar > z30 TopBar.)*

### T1.6 Migrar éxitos `*-ok` a Toast (§2.3)
- [x] `caja-ok` → Toast (`caja.ts` `mostrarOk` → helper Toast).
- [x] `productos-ok` → Toast (`product-admin.ts` `mostrarOk`).
- [x] `categorias-ok` → Toast (`categorias-admin.ts`).
- [x] `ajustes-ok` → Toast (`ajustes.ts`).
- [x] Alerts de **error** se quedan como `Alert` (no tocar).
- [x] `checkout-success` NO se migra aquí (va al modal `venta-ok` en Fase2).

### T1.7 Cierre Fase1
- [x] Smoke visual de todas las rutas con el chrome nuevo (headless screenshots).
      *(Hecho como **smoke funcional headless** `test-fase1.js` — aserciones fuertes en vez de
      capturas: título/h1 único, grupos, 7 links con ícono, marca, pills, TabBar+Sheet, drawer,
      logout×2, toast con autocierre, persistencia de colapso, pb safe-area, 0 pageErrors.
      + regresión `test-fase0.js` 100% verde.)*
- [x] Mapa: §2 chrome, §4 comunes, §7 islas (+`caja-status`), §9 modales (+`mas`), fecha.
      *(También §6 (h1/`*-ok`/`aviso-caja` retirados) y §8 (z nueva) y §10.11 invariante Fase 1.)*

**Evidencia fase1:** `*✅ 23/09/2026: build 9 págs/0 · id=/fetch/localStorage/TODO → verdes ·
tsc baseline 15 · text-xs|text-sm → 0 · hex → 21 (todas @theme tokens, 0 componentes) ·
headless test-fase1.js 100% verde (pageErrors: []) + regresión test-fase0.js verde ·
mapa actualizado §2/§4/§6/§7/§8/§9/§10 + fecha. Desviaciones registradas: piso 18px
conservado; pill net-status omitida (redundante con OfflineBanner); Menú+drawer conservados
junto a TabBar; hooks pill caja = data-caja-abierta/data-caja-cerrada; rail ≥md.*

---

## Fase 2 — POS `/` (2–3 días) — prioridad máxima

Objetivo: §4 completo — cobrar en ≤6 toques, ticket siempre visible, cero duplicación.

### T2.1 Layout dos columnas (§4.2B)
- [x] `index.astro`/contenedor: `grid lg:grid-cols-[1fr_380px]`.
- [x] Ticket sticky (`lg:sticky lg:top-[topbar] lg:h-[calc(100vh-topbar)]`), lista de líneas con
      scroll interno, bloque pago/cobrar **anclado abajo** del panel.
- [x] Catálogo con scroll propio en ≥lg.
- [x] Grid de tarjetas responsive (§4.1): 2 columnas en móvil, 3 en tablet vertical.
- [x] Paginación (§4.2D): **se mantiene** por defecto; "scroll + Cargar más" en escritorio
      solo si el rendimiento lo permite — si no, conservar paginación (decidir y anotar).
      → **Decidido (Fase 2): se conserva la paginación** (50/página, mismos hooks).
- [x] Verificar sin scroll de página en 1280×720 (criterio §4.4).

### T2.2 Panel Ticket único — eliminar D2 (§4.2A)
- [x] Un único contenedor `[data-ticket]` (hook **nuevo**) con: encabezado "Ticket" +
      `[data-cart-badge]`, `ul[data-cart-lines]`, UN `CartTotals`, pago, Cobrar.
- [x] **Retiradas explícitas:** template `CheckoutLine` + `data-checkout-lines` + el segundo
      `CartTotals` (grep previo: quién los usa; grep posterior:0 usos).
- [x] `checkout.ts`: deja de pintar líneas; conserva método, recibido/vuelto, botón, alerts y
      encolado. `cart-actions.ts` sigue pintando `ul[data-cart-lines]`.
- [x] Hooks conservados intactos: `data-cart-lines`, `data-cart-badge`, `data-cart-qty-step`,
      `data-cart-remove`, `data-cart-cancel-confirm`, `data-checkout-root`,
      `data-checkout-charge`, `data-checkout-cash`, `data-checkout-recibido`,
      `data-checkout-vuelto`.
- [x] **Cancelar venta (§4.2G):** botón pasa a texto/ícono **secundario en el encabezado del
      ticket** (danger outline), no en el cuerpo; mismo modal `cancel-sale` sin cambios.

### T2.3 Chips de categoría (§4.2D)
- [x] `ChipGroup` horizontal scroll-x reemplaza `select[data-catalog-category]`.
- [x] Hooks: contenedor conserva `data-catalog-category`; cada chip `data-category-value`;
      primer chip fijo "Todas". `catalog.ts`: select → chips (mismo filtrado, cero red).

### T2.4 Tap-para-agregar + retirar stepper (§4.2D)
- [x] La tarjeta entera es `<button data-add-to-cart aria-label="Agregar {nombre}">`.
      → **Desviación:** `<button>` **overlay** `absolute inset-0 z-10` (HTML válido — un
      `<button>` no puede envolver el `<h3>`); mismo contrato de aria-label/guard.
- [x] **Retirar** `quantity-control` de la tarjeta y del import de la página
      (grep `data-qty-step|data-qty-value` →0 tras la fase; isla `quantity-control.ts` se borra
      o queda huérfana — decidir y anotar en mapa §7).
      → **Decidido (Fase 2): la isla `quantity-control.ts` fue BORRADA** (anotado en mapa §7).
- [x] Cantidad se ajusta solo en el ticket (`data-cart-qty-step` existente).
- [x] Tag "Quedan N" (warning) cuando `stock < ajustes.stock_alerta_min`; "Agotado" ya existe.
- [x] Pulido de tarjeta (§4.2D): imagen 4:3 arriba (fallback ícono ya existe), nombre
      `line-clamp-2`, precio en negrita tabular, bordes livianos, hover/focus visibles.
- [x] Feedback de tap: micro-animación de150 ms en el badge del ticket (sin `transform` en
      ancestros de `fixed`, G1); `prefers-reduced-motion` la anula; **Toast de agregar
      desactivado por defecto**.

### T2.5 Cobro (§4.2E)
- [x] Métodos como botones segmentados ≥56 px (radios reales estilizados, íconos), default Efectivo.
- [x] Montos rápidos bajo `[data-checkout-recibido]`: `Exacto` + billetes ≥ total
      (10/20/50/100/200): hooks `data-checkout-quick` + `data-amount`, delegación única con
      `closest()`; setean input y recalculan vuelto.
- [x] Vuelto destacado24–32 px tono success; si recibido < total → "Faltan S/ X" (warning).
- [x] Botón Cobrar64 px ancho completo con total dentro ("Cobrar S/ 7.08");
      `disabled ⇔ carrito vacío ∨ (efectivo ∧ recibido < total)` con razón en `aria-describedby`.

### T2.6 Modal de cierre `venta-ok` (§4.2F)
- [x] Clave nueva `venta-ok` (catálogo de modales del mapa §9): check, "Venta registrada",
      total, **vuelto grande**, acciones `Nueva venta` (primaria → cierra + foco al buscador)
      y `Ver detalle` (→ `/historial/venta/?id=`).
- [x] Autocierre8 s **solo si** no hay vuelto que mostrar.
- [x] Reemplaza `Alert checkout-success` (retirada explícita); `checkout-success` ya no existe.
      **`Alert checkout-error` se conserva tal cual** (es accionable — §4.2F).
- [x] `checkout.ts`: flujo interno de cobro **sin cambios** (uuid → snapshot → stock → clear →
      POST → encolar); solo cambia el feedback.

### T2.7 Móvil: barra de carrito + Sheet ticket (§4.2C)
- [x] `Barra [data-cart-bar]` (hook nuevo): "N ítems · S/ total" + "Ver ticket";
      `hidden ⇔ carrito vacío` (controlado por `cart-actions`/`cart-badge`, sin isla nueva).
- [x] Sheet clave `ticket` (`data-modal-open="ticket"` / `data-modal-root="ticket"`):
      **un solo nodo** con el panel Ticket (CSS responsive: en <lg es contenido del Sheet,
      en ≥lg es la columna sticky — sin duplicar DOM).
- [x] `padding-bottom` de `main` evita que la barra tape contenido.

### T2.8 Búsqueda + atajos (§4.2D/E)
- [x] Input de búsqueda grande con ícono; `Kbd F2` foco; `Esc` limpia.
- [x] **Enter con un único resultado lo agrega al ticket** (`catalog.ts`, debounce ya existente).
- [x] `F9` = cobrar (`checkout.ts`); `Esc` cierra sheet/modal (ya en `modal-controller`).
- [x] Atajos solo ≥md; sin islas nuevas.

### T2.9 Skeleton y vacíos (§4.2D)
- [x] `Skeleton`×8 mientras carga (cache o fetch); EmptyState solo tras confirmar0 productos.
- [x] `empty-catalog` con CTA "Ir a Productos" → `/productos`.
- [x] Caja "stale" → aviso compacto ("Catálogo de hace N min · Actualizar"), sin bloque grande.

### T2.10 Criterios de aceptación §4.4 + mapa
- [x] Venta de3 productos en efectivo exacto: **≤6 toques** (contador manual/headless).
- [x] 1280×720: ticket y Cobrar visibles sin scroll de página.
- [x] `grep data-checkout-lines|CheckoutLine` →0; un solo `CartTotals` en `/`.
- [x] Stock0 no agregable (T0.2 re-verificado tras el rediseño).
- [x] Navegación completa por teclado; Lighthouse a11y ≥95 (headless).
- [x] Mapa: §6.1 con nuevo orden DOM, hooks nuevos (`data-ticket`, `data-cart-bar`,
      `data-checkout-quick`, `data-category-value`), modales `ticket` y `venta-ok`, islas
      (−`quantity-control`).

**Evidencia fase2:** `*✅ 23/09/2026: build 9 páginas/0 errores. Greps T2.10:
data-checkout-lines|CheckoutLine=0 · CartTotals=1 archivo (TicketContainer) ·
data-qty-step|data-qty-value=0 · quantity-control=0. Gates globales todos 0 (fetch,
localStorage directo, id= en islas, text-xs/sm, hex fuera @theme, TODO, ui/→api|stores).
tsc=2 (baseline 15 → solo el par preexistente: enqueue DatosRegistrarVenta +
virtual:pwa-register). test-fase2.js headless ALL GREEN (23+7 aserciones): venta de 3
productos en efectivo exacto en 5 toques (≤6), 1280×720 sin scroll de página (antes y
después de cobrar), stock0 no agregable (disabled + guard), chips con aria-pressed, atajos
F2/Enter-único/F9 verificados, "Exacto" → vuelto S/ 0.00 + Cobrar habilitado, venta-ok con
total/detalle + "Nueva venta" → cierra y enfoca buscador, snapshot historial/stock/carrito
correctos, CartBar + sheet ticket en móvil (aria-modal en role=dialog), 0 pageerrors.
test-fase1.js re-corrido sin regresiones tras el cambio de LayoutApp (columna = scroll
container ≥lg). test-fase0.js queda obsoleto por diseño (stepper de tarjeta eliminado).
Desviaciones/decisiones: (a) tarjeta = overlay <button> absolute (HTML válido); (b) "sticky"
implementado como grid fija de 2 columnas + scroll interno: la columna LayoutApp es scroll
container ≥lg (lg:h-screen) y main/grid absorben el resto con flex — sin restar el topbar a
mano (evita el desfase TopBar+banda de alerts); (c) paginación conservada (50/página);
(d) dinero comparado con money()=round2 — "Exacto" 11.68 vs total crudo 11.682 dejaba el
Cobrar disabled; (e) razón de cobro con id estático único checkout-reason + aria-describedby;
(f) barra de carrito controlada por cart-badge (visibilidad/conteo/total) — sin isla nueva;
(g) Lighthouse a11y NO corrido aún — queda pendiente (Fase 4 pulido). *

---

## Fase 3 — Administración e historial (2–3 días)

### T3.1 `/productos` — formulario en overlay (§7)
- [x] `PageHeader` con botón **`+ Nuevo producto`** → `Drawer` ≥md / `Sheet` <md
      (clave nueva `producto-form`).
- [x] `ProductForm` reutilizada **tal cual** (mismos `data-product-*`, misma validación inline
      de `form-errors.ts`) dentro del overlay.
- [x] Editar = mismo Drawer con datos; guardar → Toast + cierre; `Alert productos-error` vive
      dentro del Drawer (y como alert de página si el error es de carga de lista).
- [x] Preview de imagen 96 px dentro del form (el arrastrar/soltar ≥md es opcional → T4.3).

### T3.2 `/productos` — barra de herramientas
- [x] Buscador `[data-product-search]` conservado.
- [x] `ChipGroup` de estado: Todos · Activos · Inactivos · Stock bajo · Agotados
      (`data-product-filter`).
- [x] `select` de categoría + orden Nombre/Precio/Stock (`data-product-sort`).
- [x] Contador "Mostrando X de Y productos" (`data-product-count`).
- [x] Todos los filtros locales, cero red.

### T3.3 `/productos` — DataTable ≥md
- [x] Tabla: Miniatura · Nombre(+categoría muted) · Precio · Stock(tag bajo/agotado) ·
      Estado · Acciones; encabezado sticky; numéricas a la derecha; <md = tarjetas actuales.
- [x] Mismo `ProductRow` como fuente con CSS por breakpoint (`hidden md:table-row` — estilo
      estático permitido; el estado runtime sigue con `hidden`).
- [x] >100 filas → bloques de50 con "Mostrar más".
- [x] `empty-productos` con CTA `+ Nuevo producto`.

**Evidencia T3.1–T3.3:** *✅ 23/09/2026: build 9 págs/0 · tsc 2 (baseline) · greps src
(fetch/localStorage/id=/text-xs|sm/hex/TODO/ui→api) → todos 0 · `test-fase3.js` **ALL GREEN
(49/49)** con backend GAS mockeado en `ctx.route` (el endpoint real responde `unauthorized`
para tokens de prueba → `expirarSesion`+redirect; la UI de T3.x es 100% local, cero
mutaciones reales): drawer/sheet `producto-form` abre desde TopBar y CTA empty (aria-modal
en el box interno), modo Nuevo/Editar precargado, validación inline dentro del drawer sin
tocar el alert de página, ✕/Esc/Cancelar cierran, chips estado con aria-pressed + filtros
bajo/agotado sobre umbral 5, orden precio/stock ascendente, select categoría (3 opciones),
contador "Mostrando 50 de 61", dual render li==tr (50→61 con "Mostrar más", se oculta al
agotar), tags Bajo/Agotado en columna desktop, búsqueda local + estado no-results, mobile
390: cards visibles/tabla oculta/sheet/Sin scroll horizontal · 0 pageerrors · sin
regresiones: `test-fase1.js` y `test-fase2.js` exit 0. **Desviaciones:** (h) template
separado `ui/ProductRowDesktop.astro` en vez de "mismo `ProductRow` como fuente" — un solo
nodo `<template>` no puede servir `<tr>` (table) Y `<li>` (ul) a la vez sin markup inválido;
ambos templates comparten el MISMO set de hooks y UN solo `paintRow()` los pinta (unicidad
de lógica preservada). (i) dos Alerts en vez de reubicar uno: `productos-form-error` dentro
del drawer (errores de guardar/validación) + `productos-error` en página (carga/toggles) —
mismo efecto visible, sin mover nodos en runtime. (j) `Modal` gana `title` opcional (el h2
del form es el título visible del drawer) y el `drawer` pasa a responsive: Sheet <md /
Drawer ≥md (antes la variante era estática). (k) botón `+ Nuevo producto` viaja por el slot
nuevo `page-actions` de LayoutApp→PageHeader (TopBar, no el cuerpo de la página).

### T3.4 `/historial` — resumen y filtros (§6.1)
- [x] KPIs `StatCard`×4 (`data-hist-kpis`): Ventas (N), Total, Ticket promedio, Método más
      usado — recalculan en cada filtro; `hidden ⇔ historial vacío`.
- [x] `ChipGroup` de rango (`data-hist-range` + `data-range-value`): Hoy · Ayer · 7 días ·
      Este mes · Personalizado; inputs Desde/Hasta conservados (visibles en Personalizado <md,
      siempre en ≥md).
- [x] Búsqueda local `[data-hist-search]` (número/producto/método).
- [x] `StatusPill` de sync por línea (`data-hist-sync`): Sincronizada/Pendiente/Error según
      `cola_sync` (match por `id_venta`).

### T3.5 `/historial` — presentación (§6.1)
- [x] Summary de día: fecha larga "Mié 23 sep", total a la derecha tabular, método como pill.
- [x] ≥md: ventas del día en `DataTable` (Hora · Método · Productos · Total · Estado);
      <md: tarjetas.

### T3.6 Detalle de venta — comprobante (§6.2)
- [x] Comprobante: encabezado (nombre del local, fecha, hora, método, pill sync), líneas en
      tabla, totales alineados a la derecha, total destacado.
- [x] Acciones: `Volver al historial` (secundaria) + **Imprimir** `window.print()`
      (`data-venta-print`) con `@media print` de 80 mm solo del comprobante.
- [x] Nota discreta "Estimado con la tasa actual" cuando no hay snapshot de subtotal (IGV
      derivado — limitación conocida, hoy silenciosa).
- [x] CTA del estado `venta-notfound` (hereda el fix T0.1).

**Evidencia T3.4–T3.6:** *✅ 23/09/2026: build 9 págs/0 · tsc 2 (baseline) · greps src
(fetch/localStorage/id=/text-xs|sm/hex/TODO/ui→api) → todos 0 · `test-historial.js`
**ALL GREEN (59/59)** con datos locales sembrados vía `addInitScript` (historial 4 ventas /
2 días, `cola_sync` con pendiente+error, GAS mockeado: writes abort → network_failure para
que la cola NO se drene y las pills sigan siendo assertables): KPIs×4 con valores exactos
(4 · S/ 21.00 · S/ 5.25 · Efectivo) + recálculo por chip "Hoy" (3 · S/ 15.69 · S/ 5.23) y
por búsqueda, `hidden ⇔ historial vacío` + "—" sin resultados; chips con aria-pressed +
presets escriben Desde/Hasta + fechas visibles ≥md / solo-Personalizado <md (matchMedia);
búsqueda 200 ms sobre id+método+productos; sync pills por línea (V1 fuera de cola →
Sincronizada, V2 pendiente → Pendiente, V3 error_permanente → Error); summary fecha larga
"Mié 23 sep" + "3 ventas" + pill método + total tabular; dual render li==tr==4 con día de
ayer cerrado en primer paint; comprobante: `MiLocal`, pill sync, tabla de líneas
(Café · 2 × S/ 3.50 · S/ 7.00), subtotal+IGV+total S/ 8.26, nota oculta con snapshot /
visible sin snapshot (copy exacta), Imprimir → `window.print()` (stub 1 call), notfound:
contenido+acciones ocultos y CTA dentro del EmptyState; mobile 390: cards/tablet-toggle +
sin scroll horizontal · 0 pageerrors · sin regresiones: `test-fase1.js`/`test-fase2.js`
exit 0, `test-fase3.js` ALL GREEN. **Desviaciones:** (l) chip "Personalizado" **limpia**
Desde/Hasta (vuelve al rango completo); una edición manual de fechas entra a Personalizado
**sin** borrar — los inputs del preset anterior ya no describen el rango. (m) el
`DataTable` del día aplica `md:rounded-none md:border-0 md:shadow-none` (variantes `md:`
vencen a las clases base por orden del stylesheet — mismo patrón que el `Modal` lg:) en vez
de `border-0` plano, que perdería el conflicto. (n) template nuevo
`ui/HistorialLineDesktop.astro` (`<tr>`) junto a `HistorialLine` (`<li>`) — mismo motivo que
`ProductRowDesktop` (h); UN solo `paintLine()` pinta ambos. (o) **fix global TopBar
(expuesto por este test):** la pill `Sincronizando… (N)` colapsa a icono+count `<sm`
(`hidden sm:inline`, patrón ya usado por "· desde" de caja) — con cola pendiente el TopBar
desbordaba390px y scrolleaba horizontalmente TODA la app (preexistente de Fase 1; el mock
del spec §3.3 ya la dibuja como "⟳"). (p) `StatCard` gana el hook interno
`data-stat-value` en el valor (repaint de KPIs por filtro; componente compartido). (q)
"Exportar CSV" (`data-hist-export`) **omitido**: la spec lo marca "Opcional, fase 3" y el
plan no tiene checkbox.*

### T3.7 `/caja` — pantalla de control (§5)
- [x] Cabecera con `StatusPill` grande "Caja abierta desde HH:MM (hace X)" ⇔ "Sin caja abierta".
- [x] Sin caja: form de apertura centrado + input con `inputmode="decimal"` + montos
      sugeridos = último monto de apertura (conservar `form[data-caja-form]`).
- [x] Con caja: grid de `StatCard` — Apertura · Ventas (N y S/) · **Desglose por método**
      (`data-caja-metodos`) · Efectivo esperado destacado (conservar `section[data-caja-resumen]`).
- [x] Modal `cerrar-caja`: "Esperado: S/ X" arriba + diferencia en vivo (`data-caja-diff`):
      Faltan(warning)/Sobran(info)/Cuadra(success); `Sí, cerrar` sigue **sin** `data-modal-close`.
- [x] Historial de cajas (`data-caja-historial` + template `CajaRow`):5–10 más recientes con
      pill de diferencia; alimenta también `[data-hist-caja]`.
- [x] `caja-aviso` (otro día): Alert con botón "Cerrar caja anterior" que abre el modal directo.
- [x] `caja-ok` ya es Toast (T1.6); `caja-error`/`caja-cierre` permanecen como Alert.

**Evidencia T3.7:** *✅ 23/09/2026: build 9 págs/0 · tsc 2 (baseline) · greps src
(fetch/localStorage/id/text/hex/ui-imports/TODO = 0) · `test-caja.js` ALL GREEN 69/69 ·
regresión fase1/2/3/historial exit 0. Desviaciones: (r) "Desglose por método" es un tile
propio (StatCard es de valor único) con mismos hooks `data-caja-metodo-*`; (s) "montos
sugeridos" = UN chip (el último `monto_apertura`, el spec nombra ese único valor);
(t) `StatCard` gana hook interno `data-stat-sub` para repintar subtexto (T3.7); (u) la
acción "Cerrar caja anterior" dispara `click()` sobre el gatillo del resumen en vez de
llevar `data-modal-open` directo — un solo path de reset de input.*

### T3.8 `/stock` — KPIs, filtros, lote (§9)
- [x] `StatCard`×3 (`data-stock-kpis`): Por reponer (N) · Agotados (N) · Inventario
      valorizado (S/) — reemplazan/alimentan el párrafo de stats viejo (retirado, grep0).
- [x] `ChipGroup` (`data-stock-filter`): Todos los bajos · Solo agotados · Por categoría;
      orden por defecto **agotados primero, luego stock ascendente**.
- [x] Botones de lote `+5 +10 +24` (configurables) junto al stepper: `data-stock-step` con
      `data-step="10"`, mismo debounce500 ms.
- [x] Tag "Bajo" (warning, con umbral) además del "Agotado" existente.
- [x] "Actualizado hace N min" **siempre visible** junto a `Actualizar` (tono warning si stale).
- [x] `stock-nodata` con botón `Reintentar` (gatillo = `data-stock-refresh`); `stock-ok` con ícono.
- [x] `stock-warning` (error de repo + revert) se conserva.

**Evidencia T3.8:** *✅ 23/09/2026: build 9 págs/0 · tsc 2 (baseline) · greps fetch/localStorage/id/text/TODO 0 · grep `data-stock-stats` 0 (baja) · grep altas (`data-stock-kpis`/`data-stock-filter`/`data-stock-step="10"`) 6 · `pwtest/test-stock.js` ALL GREEN 42/42 (KPIs 5/2/S/66.00, orden default agotados-primero, 3 chips con aria-pressed, lote +10 → KPI 4 + valorizado S/166.00 + cache parcheada G5 + fila permanece D2, ±1, stamp muted↔warn, nodata+Reintentar con GAS caído, 0 pageerrors en 2 contextos) · regresión fase1/2/3/historial/caja exit 0 · 2 bugs encontrados y corregidos por el test: comparador de orden invertido (agotados iban al final) y mock GET sin `productos` que crasheaba el refresh (isla ahora valida `result.body.productos`). Desviación: (v) el delta del lote vive directo en `data-stock-step="5|10|24"` — un solo hook para ±1 y lote, sin `data-step` separado.*

### T3.9 `/categorias` (§8)
- [x] Alta rápida en una fila sobre la lista (compactar `CategoriaForm` a fila).
- [x] Conteo "N productos" por fila (`data-categoria-count`, derivado de `catalogo_cache`,
      cache-only; si no hay cache, se omite).
- [x] `Eliminar` deshabilitado + texto "En uso por N productos" cuando conteo >0 (el backend
      sigue validando); modal `confirmar-borrar-categoria` intacto.
- [x] Offline: guardar `disabled` + "Necesitás conexión para modificar categorías"
      (mejor que fallar después).
- [x] `categorias-ok` ya es Toast (T1.6).
- [x] Renombrar inline (Enter guarda / Esc cancela) = **opcional**: solo si no complica la isla.

**Evidencia T3.9:** *✅ 23/09/2026: build 9 págs/0 · tsc 2 (baseline) · greps fetch/`localStorage\.`/id/text/TODO 0 · grep altas (`data-categoria-count`/`data-categoria-offline`/`data-categoria-en-uso`) 6 · `pwtest/test-categorias.js` ALL GREEN 30/30 (fila sin card, conteos 2/1/0 + singular "1 producto", Eliminar disabled⇔count>0 con "En uso por N productos", modal + delete OK, alta+refetch, modo renombrar del form superior + Cancelar, offline: nota visible + submit disabled + Enter NO crea fila + restaura al volver online, sin cache: conteos ocultos y delete habilitado, 0 pageerrors en 2 contextos) · regresión fase1/2/3/historial/caja/stock exit 0. Desviación: (w) renombrar inline OMITIDO (spec lo marca opcional si complica la isla — se conserva el modo form superior; queda anotado como Fase 4 opcional).*

### T3.10 `/ajustes` (§10)
- [x] Secciones con card: *Negocio* (nombre, moneda) · *Impuestos* (IGV) · *Inventario*
      (alerta de stock), cada campo con texto de ayuda contextual.
- [x] Barra sticky de guardado (`data-ajustes-dirty`): visible ⇔ cambios sin guardar
      (comparación con valores cargados); `Guardar ajustes` + `Descartar cambios`.
- [x] Sección "Sesión y dispositivo": N pendientes de cola, última sincronización, versión,
      `Cerrar sesión` (solo lectura local).
- [x] Vista previa en vivo: "S/ 118.00 = S/ 100.00 + IGV S/ 18.00" (moneda/tasa reales).
- [x] `ajustes-ok` ya es Toast (T1.6).

**Evidencia T3.10:** *✅ 24/09/2026: build 9 págs/0 · tsc 2 (baseline — el import de
`package.json` para la versión compila) · greps fetch/`localStorage\.`/id/text/TODO 0 ·
`pwtest/test-ajustes.js` ALL GREEN 28/28 (3 secciones + 3 ayudas contextuales, preview
"S/ 100.00 = S/ 100.00 + IGV S/ 18.00" recalculado con moneda TIPADA `$`/IGV 20, barra
dirty oculta al cargar/visible al editar/oculta tras Descartar con restauración completa del
snapshot, validación inline con moneda vacía sin navegar, tarjeta Sesión y dispositivo:
"1 pendiente" + hora "(último intento)" + `v0.0.1` + Cerrar sesión, Guardar vía
`requestSubmit()` → Toast → reload con persistencia + `sidebar_colapsado` preservado,
0 pageerrors). Desviaciones: (x) el submit vive SOLO en la barra sticky (el form queda sin
botón; el Enter implícito sigue funcionando); (y) "última sincronización" = último
`ultimo_intento`/`creado` de la cola — **no existe key persistida de último éxito**, se
muestra como "(último intento)". (Nota de test: la semilla de cola debe usar la forma real
`{id,tipo,payload,estado,…}` — con `accion/datos` la cola cae a `default: cerrarCaja` y
revienta.)*

### T3.11 Cierre Fase3
- [x] Smoke headless de las5 rutas rediseñadas + screenshots.
      *(Hecho como `pwtest/test-fase3-cierre.js` — 8 rutas tocadas por la fase (/, /productos,
      /categorias, /stock, /ajustes, /caja, /historial, /historial/venta): carga + marcador
      propio, un solo `h1` y 0 pageErrors por ruta + **screenshots PNG** en
      `pwtest/shots-fase3/` (8 archivos). Nota: el `astro-dev-toolbar` de dev renderiza sus
      propios `<h1>` ("Audit"/"Settings"…) — se remueve antes de contar y de capturar.)*
- [x] Mapa: §6.3–6.9 con nuevos órdenes DOM, hooks y condiciones; §7 islas; §9 modales
      (+`producto-form`); fecha.
      *(§6.3–6.6 marcados en T3.4–T3.7; §6.7 T3.9, §6.8 T3.8, §6.9 T3.10 reconstruidos con
      hooks/condiciones; §7 filas historial/venta-detail/caja/product-admin/stock/categorias/
      ajustes actualizadas; §9 ya incluía `producto-form` (T3.1); cabecera con entrada
      T3.8–T3.11.)*

**Evidencia fase3:** `*✅ 24/09/2026: build 9 págs/0 · tsc = 2 (baseline: checkout.ts:251 +
virtual:pwa-register) · greps globales en 0 (fetch solo client.ts · localStorage\. solo
storage.ts · id= en islands 0 · text-xs|text-sm 0 · TODO 0 · hex solo @theme) · bajas
grep0: data-stock-stats, data-ajustes-submit · altas existentes (grep 10 archivos) ·
suites headless TODAS exit 0: test-fase0, test-fase1, test-fase2, test-fase3 (49),
test-historial (59), test-caja (69), test-stock (42), test-categorias (30), test-ajustes (28),
test-fase3-cierre (32) — 8/8 screenshots en pwtest/shots-fase3/ · mapa actualizado cabecera +
§6.3–6.9 + §7 + §9 + fecha · Apéndice A fila fase 3 completa · plan 154 [x] / 21 [ ].
Desviaciones fase 3 completas: h–q (T3.1–3.6, ver Evidencias), r–u (T3.7), v (T3.8 lote en un
solo hook), w (T3.9 renombrar inline omitido — spec opcional), x (T3.10 submit solo en la
barra sticky; Enter implícito sigue funcionando), y (T3.10 "última sincronización" =
último intento local — no existe key de último éxito).
Notas de testing: (1) semillas de cola/c�ajas/historial deben usar las formas reales
({id,tipo,payload,estado} / fecha_dia+fecha_hora_apertura / fecha_hora+items) — formas
inventadas crashean la cola (default: cerrarCaja) o a caja-status/historial; (2)
test-historial resultó flaky SOLO pegado a rebuilds del dev server (5/5 y 9+ verdes
standalone); (3) waitForSelector con [hidden] nunca resuelve — usar state:'hidden'.*

---

## Fase 4 — Pulido (1 día)

### T4.1 `/login` (§11)
- [x] Layout centrado, tarjeta máx400 px, nombre del negocio arriba.
- [x] Toggle mostrar/ocultar contraseña (`data-login-toggle`, `aria-pressed`, texto Mostrar/Ocultar).
- [x] `Ingresar` con "Ingresando…" + `disabled` (anti doble envío, patrón `login-form.ts`).
- [x] Tras error: foco al input de usuario; `[data-login-error]` conservado.
- [x] Offline: "Necesitás conexión para iniciar sesión" (visible ⇔ sin red).

### T4.2 Accesibilidad y motion (§12)
- [x] `focus-visible` anillo2 px alto contraste en **todos** los controles (grep/focus walk).
- [x] Orden de tab = orden visual (DOM del ticket después del catálogo; Sheet atrapa foco).
- [x] Sheet/Drawer/Modal: foco atrapado, Esc cierra (excepción `cerrar-caja` con input inválido),
      devuelve foco al gatillo.
- [x] Toast sin robo de foco, `aria-live=polite`; errores `role=alert`.
- [x] `prefers-reduced-motion` anula animaciones (badge, transiciones de sheet).
- [x] Imágenes de producto `loading="lazy"` + dimensiones fijas (sin layout shift).

### T4.3 Opcionales (solo si sobra tiempo — marcar como tales)
- [ ] Exportar CSV del rango (`data-hist-export`, Blob en cliente, cero API).
      *Nota: §6.1 lo llama "opcional, fase 3" y §13 lo lista en Fase 4; este plan lo deja
      opcional en F4 — si se adelanta, marcarlo en Fase 3.*
- [ ] Tema oscuro completo sobre tokens preparados.
- [ ] Arrastrar/soltar de imagen en el form ≥md.
- [ ] Renombrar categorías inline (si no se hizo en T3.9 por complejidad de isla)
      *(no hecho en T3.9 — desviación w; sigue pendiente acá)*.

### T4.4 Pruebas finales
- [x] Dispositivos reales: tablet10" (POS típico), móvil360 px, escritorio1280+.
      *(Headless: 5 viewports (360×740, 768×1024, 810×1080 tablet10", 1280×800, 1280×720)
      × 7 rutas sin overflow en `test-fase4.js`. El pase en dispositivo físico lo hace el
      dueño — queda anotado como su checklist.)*
- [x] Lighthouse a11y ≥95 en `/` y `/productos`.
      *(✅ **100/100 en ambas** contra `astro preview` + chrome-headless-shell. Alcanzó 98
      primero: `landmark-one-main` fallaba porque `/login` (LayoutAuth) no tenía `main` →
      `LoginForm` root `div`→`<main data-login-root>`; verificado post-fix 100.)*
- [x] Venta completa offline→encolado→reconexión (smoke documentado).
      *(`test-fase4.js`: venta con red caída → venta-ok + `historial_ventas=1` + carrito
      limpio + cola = `registrarVenta`+`actualizarStock` (**2 items por diseño**,
      checkout.ts:251-253: venta primero, después su stock) → reconexión → cola vacía +
      backend `registrarVenta=1`. Ver notas de testing sobre route.fulfill vs offline.)*
- [x] Recorrer §15 "Definición de terminado" completo (checklist del refactor) —
      [x] §0 sin violaciones · [x] hooks preservados/retirados según lista · [x] cola intacta ·
      [x] sin layout shift · [x] móvil360 limpio · [x] mapa final al día.
      *(§0: greps globales verdes — fetch solo `client.ts` · `localStorage\.` solo
      `storage.ts` · `id=` en islands 0 · `text-xs|sm` 0 · `TODO` 0 en src (el comentario
      "TODO el motion" pasó a minúsculas; doc/ solo cita el gate) · hex solo `@theme`.
      Hooks: Apéndice A fila 4 (altas `data-login-marca/offline/toggle/submit` — `root` y
      `error`/`form` conservados; bajas: ninguna — `div[data-login-root]` ahora es `main`).
      Cola: `test-fase4` (encolado+replay) + `test-caja` 69/69. Layout shift: T4.2 fija
      `aspect-[4/3]` (Card) y `h-14/h-10 w-14/w-10` (filas) + `loading=lazy`. Móvil360:
      `test-fase4` — sin overflow 7 rutas, h1 sin truncar (7/7), TabBar visible, pb ≥60.
      Mapa: fecha + §2 (TopBar wrap/menú/pills) + §4 (bloque a11y) + §6.2 (login) +
      §6.6 (DataTable) el 24/09.)*

**Evidencia fase4:** `*✅ 24/09/2026: build 9 págs/0 · tsc = 2 (baseline: checkout.ts:251 +
virtual:pwa-register) · greps globales en 0 (fetch solo client.ts · localStorage\. solo
storage.ts · id= en islands 0 · text-xs|text-sm 0 · TODO 0 en src · hex solo @theme) ·
Lighthouse a11y 100/100 en / y /productos (preview + headless-shell) · **13/13 suites exit 0**:
fase0/1/2 (inlineErrors/pageErrors []), fase3 (49), historial (59), caja (69), stock (42),
categorias (30), ajustes (28), fase3-cierre (32), login (29), a11y (22), **test-fase4 73/73**
(5 viewports × 7 rutas sin overflow; h1 sin truncar @360 ×7; venta offline→cola(2)→
reconexión limpia con registrarVenta=1; 8 screenshots en pwtest/shots-fase4/) · mapa
actualizado (fecha, §2, §4, §6.2, §6.6) · plan 178 [x] / 4 [ ] (los 4 = T4.3 opcionales).
**Bugs reales encontrados/corregidos en Fase 4:** (1) trap de foco roto por botones ocultos
— `utils/modal.ts#getFocusable` ahora filtra `offsetParent`/`getClientRects` (T4.2);
(2) Esc de `cerrar-caja` cerraba con input inválido — guard de keydown capture en `caja.ts`
(T4.2); (3) `/productos` desbordaba 22px @810 (sin scrollport md–lg) — prop
`DataTable.hiddenBelowLg` + columna Miniatura `hidden lg:table-cell` (T4.4); (4) h1 truncado
@360 — TopBar `flex-wrap <sm` + `PageHeader flex-auto` (**¡`flex-1` tiene basis 0: la línea
nunca desbordaba y los pills nunca se movían!**) + Menú icon-only <sm + pill caja corto <sm
(T4.4); (5) `/login` sin landmark `main` → 98→100 en Lighthouse (T4.4); (6) **imágenes de
producto nunca cargaban** — `loading="lazy"` + ocultar con `display:none` = deadlock (Chrome
no descarga lazy sin caja renderizada → `load` nunca dispara → placeholder/perfil de fila
permanente; además `img.hidden=false` no quitaba el `class="hidden"` de la Card POS): fix en
Card/ProductRow/ProductRowDesktop (`opacity-0` con caja presente + placeholder encima) e
islas (revelado por clase, colapso sin URL/error vía `hidden`) — reportado por el dueño
tras el cierre de T4.4, verificado con sonda runtime (URL válida → 200/natW 864 visible;
404 → ícono; sin URL → ícono).
**Desviaciones fase 4:** (z) compactación <sm del TopBar: Menú icon-only (`aria-label`) y
pill caja corto "Abierta"/"Cerrada" (extiende el patrón T3.4 del sync pill); con títulos
largos el TopBar ocupa **2 filas <sm** (el mock §3.3 es de fila única con títulos cortos —
acá ninguna fila se corta). cola=2 no es bug: venta+stock por diseño.
**Notas de testing:** (1) `route.fulfill` INYECTA la respuesta sin red → `context.setOffline`
NO corta el fetch mientras haya handler — simular caída con `route.abort('failed')` por flag
+ `setOffline` (este último para navigator.onLine/banner); (2) encolado asíncrono al modal y
son 2 items → `waitForFunction(.some(tipo==='registrarVenta'))`, no `length===1`;
(3) `offsetParent` es null para `position:fixed` (TabBar) → `getClientRects().length>0`;
(4) input type=number rechaza `fill('abc')` → usar `-5`; (5) `data-*` sin valor devuelve `''`
no null → `hasAttribute`; (6) Chrome no enfoca botones al clickear → `el.focus()` +
`form.requestSubmit()` para testear el robo de foco del toast.*

---

## Apéndice A — Hooks: altas y bajas por fase

| Fase | Altas (nuevos) | Bajas (retirados, con grep0 al cierre) |
|---|---|---|
| 0 | — | posición fixed de `[data-offline-banner]` (hook se conserva) |
| 1 | `data-topbar-caja`, `data-net-status`, `data-sidebar-collapse`, modal `mas` | alert `aviso-caja` (+ decide `caja-banner.ts`), botón `Menú`/drawer móvil (decidir destino del hook) |
| 2 | `data-ticket`, `data-cart-bar`, `data-checkout-quick`, `data-category-value`, modales `ticket`/`venta-ok`, `data-qty-*` fuera de la card | `data-checkout-lines`, `CheckoutLine` template, 2º `CartTotals`, `data-qty-step/value` en tarjeta, `quantity-control`, `Alert checkout-success` |
| 3 | `data-product-filter`, `data-product-sort`, `data-product-count`, modal `producto-form`, `data-hist-kpis`, `data-hist-range`, `data-range-value`, `data-hist-search`, `data-hist-sync`, `data-venta-print`, `data-caja-metodos`, `data-caja-historial`, `data-caja-diff`, `data-caja-pill-*` (cabecera), `data-caja-sugerencias`, `data-caja-esperado-modal`, `data-caja-cerrar-anterior`, `data-stock-kpis`, `data-stock-filter`, `data-stock-step` (lote), `data-stock-bajo`, `data-categoria-count`, `data-categoria-en-uso`, `data-categoria-offline`, `data-ajustes-dirty`, `data-ajustes-guardar`, `data-ajustes-descartar`, `data-ajustes-preview`, `data-ajustes-cola`, `data-ajustes-ultima-sync`, `data-ajustes-version` | `data-login-toggle` no — va en F4; `[data-stock-stats]` **confirmado grep0** (T3.8); `data-ajustes-submit` **confirmado grep0** (el submit vive ahora en la barra sticky, T3.10); form-card de `/categorias` (wrapper `.card` retirado, T3.9); stats-paragraph de stock |
| 4 | `data-login-root`, `data-login-marca`, `data-login-offline`, `data-login-toggle`, `data-login-submit` | — |

## Apéndice B — Orden de verificación por fase

1. Gates globales (arriba).
2. Grep de bajas de la fase (Apéndice A) →0.
3. Grep de altas de la fase → existen en markup y se referencian desde una isla.
4. Prueba headless de la ruta tocada (patrón `pwtest/test*.js` de la sesión: seed de token
   JSON + intercept de `script.google.com` cuando la isla exige sesión real).
5. Actualización del mapa + fecha de verificación.

## Apéndice C — Trazabilidad diagnóstico D1–D14 → tareas

Ningún problema del §1 de `refactorUI.md` queda sin tarea:

| # | Problema | Tarea(s) |
|---|---|---|
| D1 | POS apilado en una columna | T2.1 |
| D2 | Duplicación CartLine/CheckoutLine + 2 CartTotals | T2.2 |
| D3 | Categoría en select + stepper en tarjeta | T2.3, T2.4 |
| D4 | Efectivo sin montos rápidos | T2.5 |
| D5 | Post-cobro solo un Alert | T2.6 |
| D6 | Estado de caja solo en `/` | T1.3 (pill TopBar) |
| D7 | OfflineBanner fixed + Menú fijo + pt-16 | T0.3, T1.3, T1.5 |
| D8 | Sidebar plano sin agrupar ni iconos | T1.4 |
| D9 | Alerts `*-ok` empujan contenido | T1.6 |
| D10 | Formulario de productos roba espacio | T3.1 |
| D11 | Historial sin resumen/fechas/estado sync | T3.4, T3.5 |
| D12 | `venta-notfound` invisible | T0.1 ✅ |
| D13 | Stock sin filtros ni orden ni lote | T3.8 |
| D14 | Sin sistema de diseño | T1.1, T1.2 |
