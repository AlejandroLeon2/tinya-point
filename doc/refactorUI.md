# Plan de rediseño UI/UX — POS + inventario + historial

> **Destinatario:** agente de código que modificará el repo.
> **Base:** `MAPA_UI_UX` (inventario verificado 23/09/2026). Este documento **no lo reemplaza**: define el estado objetivo y el orden de trabajo.
> **Objetivo:** que la app se sienta como un POS profesional: cobrar en pocos toques, información de caja/sync siempre a la vista, administración de inventario densa y clara, y coherencia visual en todas las rutas.

---

## 0. Reglas no negociables (heredadas de los invariantes del mapa)

Todo cambio debe respetarlas. Si un rediseño choca con alguna, se adapta el rediseño, no la regla.

1. `ui/` solo dibuja: **cero** `fetch`, `localStorage` o imports de `api/`.
2. Hooks solo con `data-*`. **Cero `id`** nuevos en islands/listas.
3. Texto de usuario en español rioplatense, siempre vía `textContent`.
4. Estado runtime = atributo `hidden` (`el.hidden = condición`), no clases.
5. Listas = `<template>` + `cloneNode` + delegación con `closest()`.
6. `localStorage` solo vía `utils/storage.ts`. Todo HTTP solo en `src/api/client.ts`.
7. Salida `static`: nada de render en servidor; todo lo dinámico lo hacen las islas.
8. Modales de destrucción/confirmación siempre con `ui/Modal` + `modal-controller`.
9. Accesibilidad: estado nunca solo por color, `role=alert` en alerts, foco visible, labels visibles, **targets ≥ 56 px** en acciones del cajero.
10. Nada de `transform` en ancestros de elementos `fixed` (gotcha G1).
11. **Conservar todos los `data-*` existentes.** Si un hook cambia de lugar, se mueve el elemento, no se renombra el hook. Los hooks nuevos van listados en cada sección.

---

## 1. Diagnóstico (problemas reales detectados en el mapa)

| # | Problema | Dónde | Impacto |
|---|---|---|---|
| D1 | Catálogo, carrito y cobro están **apilados verticalmente** en una sola columna | `/` | El cajero hace scroll entre buscar, ver ticket y cobrar. Es el flujo más frecuente y el más lento. |
| D2 | **Duplicación**: `CartLine` y `CheckoutLine` pintan lo mismo; hay **dos `CartTotals`** | `/` | Ruido visual, doble mantenimiento, confusión. |
| D3 | Categoría es un `select`; el stepper `−/1/+` en cada tarjeta añade 3 controles por producto | `/` | Más toques que un POS típico (tap = agregar). |
| D4 | Efectivo: solo un input numérico; no hay montos rápidos | `/` | Cobro lento con teclado móvil. |
| D5 | Post-cobro: solo un Alert "Venta registrada" que desaparece al cambiar carrito | `/` | Falta cierre claro de la transacción (vuelto grande, "Nueva venta"). |
| D6 | Estado de caja solo como alert **en `/`** ("No hay caja abierta") | global | El cajero no sabe si tiene caja abierta desde otras pantallas. |
| D7 | `OfflineBanner` es `fixed top-0 z-50` full-width y el botón Menú es `fixed left-3 top-3` | móvil | Se superponen en la esquina superior izquierda. Además el header reserva `pt-16` vacío. |
| D8 | Sidebar plano de 7 ítems sin agrupar ni iconos | global | Mezcla operación diaria con administración. En móvil exige abrir drawer para todo. |
| D9 | Alerts persistentes `*-ok` empujan el contenido | todas | Layout shift, se quedan hasta la siguiente acción. |
| D10 | `/productos`: el formulario ocupa la parte superior **siempre**; la lista queda abajo | `/productos` | Con 200 productos hay que scrollear para ver la lista; editar = scroll arriba. |
| D11 | `/historial` no ofrece resumen ni atajos de fecha; ventas sin estado de sync | `/historial` | No responde "¿cuánto vendí hoy/esta semana?" ni "¿esto ya se sincronizó?". |
| D12 | `venta-notfound` no se muestra (bug confirmado) | `/historial/venta` | Espacio en blanco. **Fix trivial, hacer en Fase 0.** |
| D13 | Stock: sin filtros ni orden por urgencia; sin reposición rápida por lotes | `/stock` | Agotados y bajos mezclados. |
| D14 | Sin sistema de diseño explícito (tokens, densidad, jerarquía) | todas | Inconsistencia de espaciados, tamaños, botones. |

---

## 2. Sistema de diseño (aplicar primero, transversal)

Definir/normalizar en el CSS base (Tailwind config o tokens en `:root`). No inventar valores sueltos por página.

### 2.1 Tokens
- **Color semántico** (no por página): `primary`, `success`, `warning`, `danger`, `info`, `surface`, `surface-alt`, `border`, `text`, `text-muted`. Contraste AA mínimo. Estados siempre con **texto + ícono + tono**.
- **Escala de espaciado**: 4 / 8 / 12 / 16 / 24 / 32. Prohibido `px` arbitrarios fuera de la escala.
- **Radios**: 8 (controles), 12 (cards), 9999 (chips/badges).
- **Tipografía**: una sola familia sans del sistema. Escala: 12 / 14 / 16 / 20 / 24 / 32. Cifras con `font-variant-numeric: tabular-nums` en **todo importe, cantidad y stock**.
- **Elevación**: 3 niveles (card, dropdown/drawer, modal). Sin sombras decorativas.
- **Targets**: botones de acción del cajero ≥ 56 px de alto; controles de admin ≥ 44 px.

### 2.2 Componentes `ui/` a crear o unificar
Todos puros (props/slots), sin lógica.

| Componente | Uso | Notas |
|---|---|---|
| `PageHeader` | título de página + acciones a la derecha + slot de estado | reemplaza el `h1` suelto de cada ruta |
| `StatCard` | KPI (etiqueta, valor grande, delta/subtexto) | historial, caja, stock |
| `Chip` / `ChipGroup` | filtros exclusivos (categoría, rango de fechas, estado) | `role=radiogroup` o `aria-pressed` |
| `StatusPill` | Caja abierta/cerrada, Sync, Online/Offline, Activo/Inactivo | ícono + texto + tono |
| `Toast` + `ToastRegion` | reemplaza Alerts `*-ok` | `aria-live=polite`, autocierre 4 s, no desplaza layout |
| `Alert` | queda **solo** para errores y advertencias persistentes | `role=alert` |
| `Drawer` (lateral) y `Sheet` (inferior) | variantes de `ui/Modal` | mismo foco/Esc vía `modal-controller` |
| `DataTable` | tabla ≥md; colapsa a lista de tarjetas <md | encabezado sticky, columnas numéricas alineadas a la derecha |
| `Skeleton` | carga de catálogo/listas | evita pantalla vacía o flash de EmptyState |
| `EmptyState` | agregar **CTA** opcional (ej. "Crear producto") | hoy solo informa |
| `Kbd` | mostrar atajo (`F2`, `F9`) | solo ≥md |

### 2.3 Feedback
- Éxito de mutación → `Toast`. Error o estado que requiere acción → `Alert` inline.
- Carga → `Skeleton`; nunca mostrar `EmptyState` hasta confirmar que no hay datos (evita el parpadeo "Todavía no hay productos").

---

## 3. Chrome global (`LayoutApp.astro`)

### 3.1 Estructura objetivo

```
≥md (escritorio/tablet)
┌───────────┬──────────────────────────────────────────────────────┐
│ Sidebar   │ TopBar: [Título]   [● Caja abierta 08:12] [Sync] [Red]│
│ (agrupado)├──────────────────────────────────────────────────────┤
│           │ <main id="contenido">                                │
│           │                                                      │
└───────────┴──────────────────────────────────────────────────────┘

<md (móvil)
┌──────────────────────────────┐
│ TopBar: ☰  Título   ●Caja ⟳  │  ← sticky top, en flujo (sin pt-16 vacío)
├──────────────────────────────┤
│ <main>                       │
├──────────────────────────────┤
│ TabBar: Venta|Historial|Caja|Más │ ← fixed bottom, targets 56px
└──────────────────────────────┘
```

### 3.2 Sidebar agrupado con iconos
- **Operación:** Venta `/`, Historial `/historial`, Caja `/caja`
- **Inventario:** Productos `/productos`, Categorías `/categorias`, Stock `/stock` (badge conservado)
- **Sistema:** Ajustes `/ajustes`
- Encabezado con nombre del local (`ajustes.nombre`, leído por isla). Pie: `Cerrar sesión[data-logout]` (sin cambios).
- Cada ítem: ícono SVG inline + texto. `aria-current="page"` se mantiene.
- **Colapsable a rail de iconos** entre `md` y `lg` (ahorra ancho en tablets, que es el dispositivo típico de POS). Hook nuevo: `data-sidebar-collapse` (persistir preferencia con `utils/storage.ts`, dentro de la llave existente `ajustes` o vía un campo nuevo dentro de ese JSON: **no crear llave nueva**, el mapa limita a 7).

### 3.3 TopBar (reemplaza el "header slot")
Contiene, de izquierda a derecha: botón Menú (solo <md), título de la página (`PageHeader`), y **a la derecha un grupo de `StatusPill`**:

| Pill | Hook | Visible ⇔ | Fuente |
|---|---|---|---|
| Caja | `[data-topbar-caja]` | siempre; texto "Caja abierta · desde 08:12" o "Caja cerrada" (tono warning + link a `/caja`) | `cajas` (nueva isla `caja-status.ts`, cache-only) |
| Sync | `[data-sync-pending]` (se conserva) | cola con ítems | `sync-status.ts` |
| Red | `[data-net-status]` | siempre; "En línea" / "Sin conexión" | eventos `online/offline` |

Con esto:
- **Se elimina** el `aviso-caja` como bloque en `/` (queda absorbido por el pill; en `/` el pill "Caja cerrada" es además botón hacia `/caja`).
- **`OfflineBanner` pasa de `fixed` a franja en flujo** bajo el TopBar (`hidden ⇔ online`). Resuelve D7. Mantener texto "Sin conexión — puedes seguir vendiendo".
- El alert `sync-danger` (error_permanente) **se conserva** como Alert en flujo debajo del TopBar (es accionable). El modal `sync-detail` no cambia.

### 3.4 Bottom TabBar móvil
- 4 destinos: Venta, Historial, Caja, **Más** (abre `Sheet` con Productos, Categorías, Stock, Ajustes, Cerrar sesión).
- Reemplaza el botón `Menú[data-sidebar-toggle]` flotante y el drawer en móvil. El drawer puede eliminarse; si se prefiere conservarlo, que sea solo el contenido del `Sheet` "Más".
- Reservar `padding-bottom` en `<main>` con `env(safe-area-inset-bottom)` para que la barra no tape contenido.
- z-index: TabBar `z-40`; Sheets/Modales `z-50` (sin tocar la jerarquía del §8 del mapa).

---

## 4. `/` Venta (POS) — prioridad máxima

### 4.1 Layout objetivo

```
≥lg (≈1024px+)
┌──────────────────────────────────────┬────────────────────────┐
│ [🔎 Buscar producto…      F2]        │  TICKET                │
│ (Todas)(Bebidas)(Snacks)(Lácteos)… →  │  ───────────────────── │
│                                      │  2 × Gaseosa      S/ 6 │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │  1 × Pan          S/ 1 │
│ │card│ │card│ │card│ │card│          │  ───────────────────── │
│ └────┘ └────┘ └────┘ └────┘          │  Subtotal    S/ 6.00   │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐          │  IGV 18%     S/ 1.08   │
│ │card│ │card│ │card│ │card│          │  TOTAL       S/ 7.08   │
│ └────┘ └────┘ └────┘ └────┘          │  ○Efectivo ○Tarjeta ○Yape│
│   ‹ 1–24 de 80 ›                     │  Recibido [ 10.00 ]     │
│                                      │  [S/ exacto][10][20][50]│
│                                      │  Vuelto  S/ 2.92        │
│                                      │  [   COBRAR  F9   ]     │
└──────────────────────────────────────┴────────────────────────┘
   catálogo: ~62% (scroll propio)          ticket: ~38%, sticky, alto = viewport

<lg (móvil / tablet vertical)
┌──────────────────────────────┐
│ búsqueda + chips             │
│ grid 2 col (3 en tablet)     │
│                              │
├──────────────────────────────┤
│ 🛒 3 ítems · S/ 7.08  [Ver ticket ▲] │ ← barra fija sobre TabBar
└──────────────────────────────┘
  toca la barra → Sheet inferior con el ticket completo + pago + COBRAR
```

### 4.2 Cambios concretos

**A. Unificar carrito + cobro en un solo panel "Ticket".**
- Un único contenedor `[data-ticket]` (nuevo) con: encabezado "Ticket (`[data-cart-badge]`)", lista de líneas, totales, pago, botón cobrar.
- **Eliminar** el bloque duplicado `CheckoutLine` + segundo `CartTotals`. `checkout.ts` deja de pintar líneas: solo maneja método de pago, recibido/vuelto, botón, alerts y encolado. `cart-actions.ts` sigue pintando las líneas (`ul[data-cart-lines]`).
- Se conservan: `data-cart-lines`, `data-cart-badge`, `data-cart-qty-step`, `data-cart-remove`, `data-cart-cancel-confirm`, `data-checkout-root`, `data-checkout-charge`, `data-checkout-cash`, `data-checkout-recibido`, `data-checkout-vuelto`. Se retiran `data-checkout-lines` y el template `CheckoutLine` (verificar con grep que nada más los use).
- **Un solo `CartTotals`**, con el total en tamaño grande (32 px, tabular).

**B. Layout de dos columnas.**
- Contenedor de la página: `grid lg:grid-cols-[1fr_380px]`. Ticket: `lg:sticky lg:top-[topbar] lg:h-[calc(100vh-topbar)]`, con la lista de líneas como zona scrolleable interna y el bloque de pago/cobrar **anclado abajo del panel**.
- Catálogo con scroll propio en escritorio para que el ticket nunca salga de vista.

**C. Móvil: barra de carrito + Sheet.**
- Barra fija `[data-cart-bar]` (nueva): "N ítems · Total" + botón "Ver ticket". `hidden ⇔ carrito vacío` (lo controla `cart-badge.ts` o `cart-actions.ts`, sin isla nueva si es posible).
- El Sheet abre con `data-modal-open="ticket"`; `data-modal-root="ticket"`. **Agregar `ticket` al catálogo de claves de modal (§9 del mapa).** Contiene el mismo panel Ticket (no se duplica el DOM: en <lg el panel *es* el contenido del Sheet; en ≥lg es la columna. Usar un único nodo y CSS responsive; si el `Modal` impide eso, renderizar el panel una sola vez dentro del Sheet y dejar en ≥lg el Sheet estilizado como columna fija).

**D. Catálogo.**
- **Categorías como `ChipGroup` horizontal** con scroll-x (reemplaza el `select[data-catalog-category]`). Mantener el hook `data-catalog-category` en el contenedor y `data-category-value` en cada chip; la isla sigue derivando categorías de `productos` en memoria. Primer chip fijo "Todas".
- **Tap en la tarjeta = agregar 1 unidad.** El stepper `−/1/+` de la tarjeta se elimina del flujo principal (cantidad se ajusta en el ticket, donde ya existe `data-cart-qty-step`). Si se quiere conservar cantidad previa, moverlo a "mantener pulsado" **no**: es poco descubrible. Decisión: **eliminar** `quantity-control` de la tarjeta y de la página.
  - Tarjeta = botón completo (`data-add-to-cart` pasa a ser el `<button>` que envuelve la tarjeta, con `aria-label="Agregar {nombre}"`). Feedback: micro-animación de 150 ms en el badge del ticket (sin `transform` en ancestros de `fixed`) y `Toast` opcional desactivado por defecto.
  - `stock === 0`: tarjeta `disabled`, ribbon/tag "Agotado" (texto + tono). Hoy se puede agregar un agotado: **bloquearlo**.
  - Stock bajo (`< ajustes.stock_alerta_min`): tag "Quedan N" (warning).
- Tarjeta: imagen 4:3 arriba (fallback a ícono, ya existe), nombre en 2 líneas máx con `line-clamp`, precio en negrita tabular. Sin bordes pesados; hover/focus visibles.
- **Búsqueda**: input grande con ícono, `Kbd F2` para enfocar, `Esc` limpia. **Enter con un único resultado lo agrega al ticket** (flujo teclado/lector de código de barras que emula teclado). Nuevo comportamiento en `catalog.ts`.
- Paginación: mantener; en escritorio pasar a **scroll dentro del panel + "Cargar más"** solo si el rendimiento lo permite; si no, conservar paginación.
- `Skeleton` de 8 tarjetas mientras hay `catalogo_cache` en carga; `empty-catalog` solo tras confirmar 0 productos, con CTA "Ir a Productos" → `/productos`.
- La caja "stale" se convierte en un aviso compacto dentro del TopBar/Catálogo ("Catálogo de hace N min · Actualizar"), sin ocupar bloque completo.

**E. Cobro.**
- Métodos de pago como **botones segmentados grandes** (radios reales por accesibilidad, estilizados como botones ≥56 px): Efectivo (default) / Tarjeta / Yape·Plin, con ícono.
- Efectivo: debajo del input `[data-checkout-recibido]`, fila de **montos rápidos**: `Exacto` (= total), y billetes sugeridos (siguiente múltiplo útil: 10/20/50/100/200 mayores o iguales al total). Hook nuevo `data-checkout-quick` con `data-amount`; delegación única con `closest()`. Tap → setea el input y recalcula vuelto.
- Vuelto en tamaño destacado (24–32 px, tono success). Si recibido < total: mensaje "Faltan S/ X" (warning, texto + tono).
- Botón **Cobrar venta** de 64 px, ancho completo, con el total dentro ("Cobrar S/ 7.08"). Deshabilitado ⇔ carrito vacío **o** (efectivo y recibido informado y < total). Mostrar razón en `aria-describedby`.
- Atajos (solo ≥md): `F2` buscar, `F9` cobrar, `Esc` cerrar sheet/modal. Mostrar `Kbd` junto al control. Nueva utilidad en `checkout.ts`/`catalog.ts`, sin isla nueva.

**F. Cierre de venta.**
- Reemplazar `Alert checkout-success` por un **modal/sheet de confirmación** `venta-ok` (clave nueva en el catálogo de modales): check grande, "Venta registrada", total, **vuelto (grande)**, y dos acciones: `Nueva venta` (primaria, cierra y enfoca la búsqueda) y `Ver detalle` (→ `/historial/venta/?id=`). Se autocierra a los 8 s *solo si no hay vuelto que mostrar*; con vuelto, espera acción.
- Conservar `Alert checkout-error` tal cual (es accionable).
- El flujo interno de cobro (uuid → snapshot → stock local → vaciar carrito → `registrarVenta` → encolar) **no cambia**.

**G. Cancelar venta.**
- Botón `Cancelar venta` pasa a texto/ícono secundario en el encabezado del ticket (danger outline), no en el cuerpo. Mismo modal `cancel-sale`.

### 4.3 Hooks nuevos en `/`
`data-ticket`, `data-cart-bar`, `data-checkout-quick`, `data-category-value`, `data-net-status` (global), modales `ticket` y `venta-ok`.

### 4.4 Criterios de aceptación
- Cobrar una venta de 3 productos en efectivo exacto: **≤ 6 toques** desde catálogo vacío (3 taps productos + Exacto + Cobrar + Nueva venta).
- En 1280×720 el ticket y el botón Cobrar son visibles sin scroll de página.
- No hay ninguna línea de carrito duplicada en el DOM.
- Producto con stock 0 no puede agregarse.
- Lighthouse a11y ≥ 95; navegación completa por teclado.

---

## 5. `/caja`

**Objetivo:** que sea la pantalla de control del turno, no solo un formulario.

- **Estado como cabecera:** `StatusPill` grande "Caja abierta desde 08:12 (hace 3 h 20 min)" o "Sin caja abierta".
- **Sin caja abierta:** formulario de apertura centrado, input de monto con teclado numérico (`inputmode="decimal"`), montos sugeridos = último monto de apertura. Mantener `form[data-caja-form]`.
- **Con caja abierta:** grid de `StatCard`:
  - Apertura · Ventas del día (cantidad y S/) · **Desglose por método** (Efectivo / Tarjeta / Yape·Plin) · **Efectivo esperado** (destacado).
  - Mantener `section[data-caja-resumen]` como contenedor.
- **Modal `cerrar-caja` mejorado:** mostrar "Esperado: S/ X" arriba; al tipear "Efectivo contado" calcular en vivo la **diferencia** con texto y tono (`Faltan` warning / `Sobran` info / `Cuadra` success). El botón `Sí, cerrar` sigue sin `data-modal-close` (solo cierra en cierre válido).
- **Historial de cajas** (lista debajo, 5–10 más recientes, desde `cajas`): fecha, apertura, cierre, diferencia con StatusPill. Alimenta también `[data-hist-caja]` de `/historial`.
- Alerts `caja-ok` → `Toast`. `caja-aviso`, `caja-error`, `caja-cierre` se mantienen como Alerts.
- Si hay caja de otro día abierta (`caja-aviso`): mostrarlo como Alert con botón "Cerrar caja anterior" que abre el modal directamente.

Hooks nuevos: `data-caja-metodos` (desglose), `data-caja-historial` con template `CajaRow`, `data-caja-diff` (diferencia en vivo dentro del modal).

---

## 6. `/historial` y detalle

### 6.1 Historial
- **Resumen del período filtrado** (`StatCard` ×4, calculados localmente): Ventas (N), Total (S/), Ticket promedio, Método más usado. Hook `data-hist-kpis`. Se recalculan en cada cambio de filtro. Ocultos ⇔ historial vacío.
- **Atajos de rango** con `ChipGroup`: `Hoy` · `Ayer` · `7 días` · `Este mes` · `Personalizado` (muestra Desde/Hasta). Hook `data-hist-range` + `data-range-value`. Los inputs de fecha existentes se conservan (visibles solo en "Personalizado" en <md; siempre en ≥md).
- **Estado de sincronización por venta:** `StatusPill` en cada `HistorialLine` — "Sincronizada" / "Pendiente" / "Error" (según `cola_sync`). Hook `data-hist-sync`. Permite responder "¿esto ya subió?".
- **Búsqueda** por número/producto/método (local): input `[data-hist-search]`.
- Días: se mantiene `<details>`; hacer el *summary* más legible (fecha larga "Mié 23 sep", total del día a la derecha en tabular, método en `StatusPill` neutros).
- ≥md: cada día lista sus ventas en `DataTable` (Hora · Método · Productos · Total · Estado); <md: tarjetas.
- Acción **Exportar CSV** del rango (`data-hist-export`): genera Blob en cliente, cero API. Opcional, fase 3.

### 6.2 Detalle de venta
- **Fix D12 (Fase 0):** quitar `hidden` al `EmptyState` hijo en `VentaDetailContainer.astro:49`. Añadir CTA "Volver al historial".
- Rediseñar como **comprobante**: encabezado (nombre del local, fecha, hora, método, `StatusPill` de sync), tabla de líneas, totales alineados a la derecha, total destacado.
- Acciones: `Volver al historial` (secundaria), `Imprimir` (`window.print()` con hoja `@media print` de ancho 80 mm, solo el comprobante). Hook `data-venta-print`.
- Mantener la limitación conocida del IGV derivado; añadir nota discreta "Estimado con la tasa actual" cuando no hay snapshot (hoy es silencioso).

---

## 7. `/productos`

**Objetivo:** vista de inventario densa; el formulario deja de robar el espacio.

- **Layout:** `PageHeader` con botón primario **`+ Nuevo producto`** (abre el formulario en `Drawer` lateral ≥md y en `Sheet` pantalla completa <md). El `ProductForm` se reutiliza **tal cual** (mismos `data-product-*`, misma validación inline) dentro del contenedor overlay. Nueva clave de modal `producto-form`.
- **Barra de herramientas:** buscador `[data-product-search]` (conservar) + `ChipGroup` de estado (Todos · Activos · Inactivos · Stock bajo · Agotados) + `select` de categoría + orden (Nombre / Precio / Stock). Filtros locales, cero red. Hooks: `data-product-filter`, `data-product-sort`.
- **Lista ≥md como `DataTable`:** Miniatura · Nombre (+ categoría en texto muted) · Precio · Stock (con tag si bajo/agotado) · Estado · Acciones (`Editar`, `Desactivar`/`Restaurar`). Encabezado sticky, columnas numéricas a la derecha. <md: tarjetas actuales (`ProductRow` como template sigue siendo la fuente; ajustar el template para que sirva a ambos layouts con CSS, o crear `ProductRowDesktop` y ocultar por breakpoint con clases `hidden md:table-row`, **nota**: esto es estilo estático, permitido; el estado runtime sigue por `hidden`).
- **Contador:** "Mostrando X de Y productos" (`data-product-count`).
- Editar = abre el mismo Drawer con datos; al guardar: `Toast` "Producto actualizado" y cierre. `Alert productos-error` se mantiene dentro del Drawer y como Alert de página según el caso.
- Preview de imagen 96 px en el form; "Subir foto" con arrastrar/soltar en ≥md (opcional).
- Paginación o virtualización simple si > 100 filas (render por bloques de 50 con "Mostrar más").
- `empty-productos` con CTA `+ Nuevo producto`.

---

## 8. `/categorias`

- Mismo patrón que Productos: **lista a la izquierda/arriba + alta rápida en línea** (input + botón en una fila sobre la lista, no en card aparte). `CategoriaForm` puede permanecer; solo compactarlo a una fila.
- Cada fila muestra **cantidad de productos** ("12 productos"), derivada de `catalogo_cache` (cache-only, sin red; si no hay cache, omitir el dato). Hook `data-categoria-count`.
- Renombrar **inline**: `Editar` convierte el nombre en input dentro de la fila (Enter guarda, Esc cancela). Si complica la isla, conservar el modo actual (formulario superior) y dejarlo como mejora opcional.
- `Eliminar` deshabilitado con tooltip/texto "En uso por N productos" cuando el conteo local > 0 (prevención, el backend sigue validando). Mantener modal `confirmar-borrar-categoria`.
- `categorias-ok` → `Toast`. Mantener aviso "sin cola offline" cuando esté sin conexión: mostrar el botón de guardar `disabled` + texto "Necesitás conexión para modificar categorías" (mejor que fallar después).

---

## 9. `/stock`

- **KPI superiores** (`StatCard`): Por reponer (N) · Agotados (N) · Inventario valorizado (S/). Hook `data-stock-kpis`. Reemplaza el párrafo `[data-stock-stats]` (o lo alimenta).
- **Filtros:** `ChipGroup` Todos los bajos · Solo agotados · Por categoría. Orden por defecto: **agotados primero, luego por stock ascendente**. Hook `data-stock-filter`.
- **Fila de reposición:** además del stepper ±1, botones **`+5` `+10` `+24`** (configurables) para reposiciones en lote (`data-stock-step` con `data-step="10"`, mismo debounce 500 ms). Tag "Agotado" ya existe; añadir "Bajo" (warning) con el umbral.
- Barra de estado: "Actualizado hace N min" siempre visible junto al botón `Actualizar`, en lugar de solo cuando falla (mantener el estado stale con tono warning).
- Alert `stock-warning` se mantiene (error de reposición, con revert).
- `stock-ok` con ilustración simple (ícono) y `stock-nodata` con botón `Reintentar` (gatillo = `data-stock-refresh`).

---

## 10. `/ajustes`

- **Agrupar en secciones** (cada una una card con título y descripción): *Negocio* (nombre, moneda), *Impuestos* (IGV %), *Inventario* (alerta de stock).
- Cada campo con **texto de ayuda** contextual (ej. "Se muestra en el comprobante y el TopBar"; "Las ventas antiguas conservan su IGV original").
- **Barra de guardado sticky** abajo (`Guardar ajustes` + "Descartar cambios") visible solo ⇔ hay cambios sin guardar (`hidden` por comparación con valores cargados). Hook `data-ajustes-dirty`.
- Sección informativa "Sesión y dispositivo": estado de cola de sincronización (N pendientes), última sincronización, versión de la app, botón `Cerrar sesión`. Lectura local únicamente.
- Vista previa en vivo del formato de moneda y de un total de ejemplo ("S/ 118.00 = S/ 100.00 + IGV S/ 18.00").
- `ajustes-ok` → `Toast`.

---

## 11. `/login`

- Layout centrado con tarjeta (ancho máx. 400 px), logo/nombre del negocio arriba.
- Botón mostrar/ocultar contraseña (`data-login-toggle`, texto "Mostrar"/"Ocultar", `aria-pressed`).
- `Ingresar` con estado de carga ("Ingresando…", `disabled`) para evitar doble envío.
- `[data-login-error]` conservado; enfocar el input de usuario tras error.
- Indicador de red: si está offline, mensaje "Necesitás conexión para iniciar sesión".

---

## 12. Accesibilidad y rendimiento (transversal)

- Foco: `focus-visible` con anillo de 2 px de alto contraste en **todos** los controles.
- Orden de tabulación coherente con el orden visual (el ticket viene después del catálogo en DOM; en móvil el Sheet atrapa foco).
- `Sheet/Drawer/Modal`: foco atrapado, `Esc` cierra (salvo `cerrar-caja` con input inválido), devuelve foco al gatillo.
- `Toast` no roba foco; `aria-live=polite`. Errores: `role=alert`.
- Respetar `prefers-reduced-motion` (sin animaciones de escala/slide).
- `prefers-color-scheme`: tokens preparados para tema oscuro; implementación completa opcional (Fase 3).
- Imágenes de producto: `loading="lazy"`, dimensiones fijas para evitar layout shift.
- Cero dependencias nuevas salvo que sean imprescindibles (Fuse ya existe). Íconos: SVG inline en `ui/Icon`.

---

## 13. Plan de ejecución por fases

Cada fase debe terminar con build verde, el gate de invariantes en verde (`grep 'id="' src/components/islands` → 0; todo `fetch(` solo en `src/api/client.ts`) y el mapa de UI actualizado.

### Fase 0 — Correcciones rápidas (½ día)
1. Fix `venta-notfound` (D12).
2. Impedir agregar productos con `stock === 0` en `catalog.ts`/`cart-actions.ts`.
3. Reemplazar `OfflineBanner` fixed por franja en flujo; quitar el `pt-16` vacío (D7).

### Fase 1 — Fundaciones (1–2 días)
1. Tokens + componentes `PageHeader`, `StatCard`, `Chip/ChipGroup`, `StatusPill`, `Toast/ToastRegion`, `Skeleton`, `Icon`, variantes `Drawer/Sheet` de `Modal`.
2. TopBar con pills (caja, sync, red) + nueva isla `caja-status.ts`.
3. Sidebar agrupado con iconos y colapso; TabBar móvil + Sheet "Más".
4. Migrar Alerts `*-ok` a `Toast` en todas las páginas.

### Fase 2 — POS (2–3 días) — mayor retorno
1. Layout de dos columnas y panel Ticket único (eliminar duplicación de líneas/totales).
2. Chips de categoría; tap-para-agregar; retirar `quantity-control`.
3. Cobro: métodos segmentados, montos rápidos, vuelto destacado, botón con total.
4. Modal `venta-ok`; barra de carrito + Sheet móvil (`ticket`).
5. Atajos F2/F9, Enter agrega único resultado.

### Fase 3 — Administración e historial (2–3 días)
1. `/productos`: Drawer/Sheet para el form, DataTable, filtros y orden.
2. `/historial`: KPIs, chips de rango, estado de sync, búsqueda; detalle como comprobante + imprimir.
3. `/caja`: resumen con desglose, diferencia en vivo, historial de cajas.
4. `/stock`: KPIs, filtros, reposición en lote.
5. `/categorias` y `/ajustes`: mejoras del §8 y §10.

### Fase 4 — Pulido (1 día)
Login, tema oscuro opcional, exportar CSV, revisión de a11y, `prefers-reduced-motion`, prueba en dispositivos reales (tablet 10", móvil 360 px, escritorio 1280+).

---

## 14. Actualizaciones obligatorias del mapa al terminar cada fase

- §2 (chrome): TopBar, TabBar, nuevo sidebar.
- §4 (comunes): pills, Toast, OfflineBanner en flujo.
- §6.x: cada ruta con su nuevo orden DOM, hooks y condiciones ` ⇔ `.
- §7: quitar `quantity-control`; añadir `caja-status` y las islas nuevas.
- §9: claves de modal nuevas → `ticket`, `venta-ok`, `producto-form`.
- §10.10: retirar el hueco de `venta-notfound` una vez corregido.
- Cambiar la fecha de verificación.

---

## 15. Definición de "terminado"

- [ ] Ninguna regla del §0 violada (revisar con los gates y revisión manual).
- [ ] Todos los `data-*` previos siguen existiendo, salvo los retirados explícitamente (`data-checkout-lines`, `data-quantity*` de la tarjeta).
- [ ] Flujo de venta offline → encolado → sincronización sigue funcionando sin cambios de lógica.
- [ ] Sin layout shift al aparecer confirmaciones (Toast, no Alert).
- [ ] Móvil 360 px: nada se corta, nada se superpone, TabBar y barra de carrito no tapan contenido.
- [ ] Mapa de UI/UX actualizado y coherente con el código.