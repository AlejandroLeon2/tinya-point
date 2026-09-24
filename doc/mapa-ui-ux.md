# Mapa de UI/UX por página — inventario para agentes

> **Propósito:** verdad de ground-truth sobre qué existe en cada ruta de la app, en qué orden
> DOM, qué está visible/oculto y bajo qué condición exacta, y qué gatillos (disparadores) hay —
> visibles o solo invocables por JS. Pensado para que un agente lo consuma sin leer el código.
> **Fuente:** código real del repo, verificado **23/09/2026**, **actualizado 23/09/2026 (Fase 0
> refactor UI)**, **23/09/2026 (Fase 1 refactor UI — TopBar/pills/TabBar/Sheet/toasts/sidebar
> agrupado)**, **23/09/2026 (Fase 2 refactor UI — POS `/`: ticket único, card tap-to-add,
> chips, CartBar, modales `ticket`/`venta-ok`)**, **23/09/2026 (Fase 3 refactor UI T3.1–T3.3 —
> `/productos`: drawer `producto-form`, toolbar chips/sort/contador, DataTable ≥md con
> `ProductRowDesktop`, paginación 50)** y **23/09/2026 (Fase 3 refactor UI T3.4–T3.6 —
> `/historial`: KPIs, chips de rango, búsqueda, sync pills, DataTable por día con
> `HistorialLineDesktop`; `/historial/venta`: comprobante con Imprimir/print-CSS80 mm;
> pill sync del TopBar colapsa a icono+count <sm)** y **23/09/2026 (Fase 3 refactor UI T3.7 —
> `/caja`: estado como cabecera (pill desde HH:MM/hace), sugerido = último monto, grid
> StatCard con desglose por método, diferencia en vivo en el modal, historial de cajas,
> aviso de otro día con acción directa al modal)**, **24/09/2026 (Fase 4 refactor UI T4.1–T4.2
> + T4.4 — `/login`: card centrada, `main[data-login-root]`, toggle de clave, nota offline;
> a11y: `:focus-visible` 2px global + `prefers-reduced-motion`, trap de foco filtra ocultos,
> Esc con guard en `cerrar-caja`; TopBar `flex-wrap <sm` (títulos largos bajan los pills a
> fila 2, el `h1` nunca trunca) + Menú icon-only <sm + pill caja corto <sm; DataTable columna
> Miniatura `hidden lg:table-cell` vía prop `hiddenBelowLg`)**. Si el código cambió, este mapa
> queda obsoleto: regenerar leyendo `src/pages/**`, `src/layouts/*`, `src/components/smart/*`,
> `src/components/ui/*` y los `hidden`/gatillos de `src/components/islands/*`.

---

##1. Vocabulario (leer antes que cualquier ruta)

**Visibilidad** — toda condición usa la notación ` ⇔ ` ("si y solo si"). Estados base:

| Estado | Significado |
|---|---|
| `visible` | se muestra apenas carga la página (HTML de build) |
| `oculto (hidden)` | atributo `hidden` en el HTML de build; no ocupa espacio |
| ` ⇔ <condición>` | el atributo `hidden` lo agrega/quita una isla según la condición |
| `pintado por <isla>` | el nodo arranca **vacío** en el HTML; la isla lo llena en runtime (texto vía `textContent`, nunca `innerHTML`) |
| `<template>` | **nunca visible en sí**; la isla lo `cloneNode` por cada ítem (1 clon = 1 fila/tarjeta) |

**Posición** — `flujo` = flujo normal del documento; `fixed` = anclado a la ventana (no scrollea);
`sticky` = se pega al hacer scroll; breakpoints ` <md ` (móvil, <768px) y ` ≥md ` (escritorio).

**Gatillo** — elemento con atributo `data-*` o evento (`click`, `input`, `submit`, `change`,
`online`/`offline`) que dispara comportamiento de una isla. Los gatillos **dentro de modales**
solo existen visualmente cuando el modal está abierto.

**Islas** — módulos TS en `src/components/islands/` que corren en el navegador. Astro no hidrata
nada; cada página declara sus islas con `<script>` y solo esas corren ahí. Comunicación entre
islas: DOM (`data-*`) + `localStorage` vía `utils/storage.ts` — nunca variables compartidas.

**Salida estática** (`output: "static"`) — no hay render en servidor después del build: todo lo
que aparece/desaparece en runtime es obra de las islas en el cliente.

---

##2. Chrome global — `LayoutApp.astro` (todas las rutas MENOS `/login`)

Orden DOM:

1. **Skip link** `Saltar al contenido` → `#contenido` — `sr-only`, **visible solo al recibir foco** (position absolute z-50).
2. **`<div flex>`** que contiene:
   - **Sidebar** `nav[data-sidebar-root]#sidebar-principal` **agrupado con iconos** (Fase 1, §3.2):
     - **Marca** `span[data-sidebar-brand]` — arranca "Tinya Point"; la isla `sidebar` la repinta
       con `ajustes.nombre_local` (textContent) cuando hay nombre cargado.
     - **Botón colapsar** `[data-sidebar-collapse-toggle]` — **solo ≥md** (`hidden md:inline-flex`),
       `aria-pressed` sincronizado; click alterna `data-sidebar-collapse` en el ROOT y persiste
       `ajustes.sidebar_colapsado` (**campo dentro del JSON existente — NO crea llave nueva**).
     - **≥md sin colapsar:** `sticky top-0`, `h-screen w-60`, en flujo a la izquierda.
     - **≥md colapsado (rail):** `width 4.5rem`, desaparecen `.sidebar-label` (grupo, textos y
       marca) y el badge; links centrados solo-icono; el chevron rota 180°. **<md nunca colapsa**
       (el media query min-width:768px es quien da significado al atributo).
     - **Grupos** con encabezado visible: **Operación** (Venta `/`, Historial `/historial`,
       Caja `/caja`) · **Inventario** (Productos `/productos`, Categorías `/categorias`,
       Stock `/stock`+badge) · **Sistema** (Ajustes `/ajustes`). Cada ítem = `svg[ui/Icon]` +
       texto; el activo lleva `aria-current="page"` + fondo primario (build-time por URL).
     - **<md:** `display:none` ⇔ se agrega `data-sidebar-open` → pasa a `fixed` izquierda completa,
       **z-45**, con sombra (drawer). **Nunca aplica el rail en móvil.**
     - **Badge de Stock:** `span[data-nav-badge="stock"]` arranca `hidden` — **visible ⇔**
       `catalogo_cache` tiene `>0` productos con `stock < ajustes.stock_alerta_min` (isla
       `stock-badge.ts`, **solo cache, cero red**; oculto también en rail colapsado).
     - **Pie del sidebar:** botón `Cerrar sesión[data-logout]` — **siempre visible** → isla
       `sidebar.ts` (hace `querySelectorAll('[data-logout]')`: pie del sidebar **y** Sheet "Más")
       borra el token y redirige a `/login` (carrito, historial y ajustes **sobreviven**).
   - **Columna derecha** (`flex-1 flex-col min-w-0`):
      - **TopBar** `header` **sticky top-0 z-30** (Fase 1 §3.3 + Fase 4 T4.4) —
        `flex flex-wrap … sm:flex-nowrap`, borde inferior, `bg-surface`. **Wrap <sm (T4.4):**
        títulos cortos (Venta, Caja…) mantienen la fila única del mock §3.3 (☰ Título ●Caja ⟳);
        títulos largos ("Historial de ventas", "Productos" con acción) empujan el grupo de
        pills a **fila 2** en vez de truncar el único `h1` (requisito §15 "nada se corta" a
        360 px; `PageHeader` es `flex-auto`, basis = contenido — con `flex-1` basis 0 el wrap
        nunca se activaba):
        1. **Botón Menú** `[data-sidebar-toggle]` — **solo <md** (`md:hidden`), dentro del TopBar
           (Fase 1 absorbió la fila Menú de Fase 0; mismo hook, `sidebar.ts` intacto). Click →
           alterna `data-sidebar-open` + `aria-expanded`. **T4.4: icono-only <sm** (el texto
           "Menú" es `hidden sm:inline`, nombre accesible via `aria-label="Menú"`).
       2. **`PageHeader`** — el **ÚNICO `h1` de la página** (`{title} — Tinya Point` en `<title>`;
          título por ruta: Venta / Historial de ventas / Detalle de venta / Caja / Productos /
          Categorías / Stock bajo / Ajustes). Los contenedores ya **no** renderizan `h1` (Fase 1).
        3. **Grupo de pills** (`shrink-0`), estado siempre por `hidden` + texto:
           - **Pill Caja abierta** `a[data-caja-abierta]` `pill-ok` → `/caja` — arranca `hidden`;
             **visible ⇔** `cajas` tiene una sesión `abierta` (isla `caja-status.ts`, cache-only).
             Texto **corto <sm** "Abierta" / **≥sm** "Caja abierta" + ` · desde
             <span[data-caja-hora]>` (hora pintada vía textContent, `hidden sm:inline` — T4.4
             compactación §3.3). Repinta en `caja:state-changed` (dispatch de
             `caja.ts` al abrir/cerrar) y en `focus` de la pestaña.
           - **Pill Caja cerrada** `a[data-caja-cerrada]` `pill-warn` → `/caja` — **visible ⇔** no
             hay caja abierta (estado inicial de build). Texto corto <sm "Cerrada" / ≥sm
             "Caja cerrada" (T4.4).
          - **Pill Sync** `span[data-sync-pending]` `pill-warn` (aria-label "Cola de
            sincronización pendiente") — arranca `hidden`; **visible ⇔** `cola_sync` tiene ítems
            `pendiente`/`enviando` (isla `sync-status.ts`; el contador `[data-sync-count]` se
            pinta con textContent). Texto "Sincronizando… (N)" `sm:` en adelante; **<sm colapsa
            a icono+N** (`hidden sm:inline` — T3.4/fix: el texto completo desbordaba390px).
            **Hook conservado** — solo cambió de sitio (antes era un `<p>` dentro de
            `SyncStatusIndicator`).
     - **Header slot** — todas las páginas insertan `SyncStatusIndicator`: alert `sync-danger` +
       modal `sync-detail` (ver §4).
     - **`<main id="contenido">`** — landmark único; `pb-[calc(5rem+env(safe-area-inset-bottom))]`
       **<md** para que la TabBar nunca tape el final; contenido de cada ruta acá.
     - **Footer slot** — actualmente vacío en todas las páginas.
3. **TabBar** `nav[data-tabbar]` (Fase 1, §3.4) — **fixed inferior, solo <md**, `z-40`,
   `pb-[env(safe-area-inset-bottom)]`: Venta | Historial | Caja | **Más** (4 targets ≥56 px).
   Activo = `aria-current` + `font-bold` + fondo `bg-bg` (build-time). "Más" es botón
   `data-modal-open="mas"`.
4. **Sheet "Más"** `Modal modalKey="mas" variant="sheet"` — panel inferior `max-h-[85vh]`
   z-50: links Productos / Categorías / Stock / Ajustes (activo con `aria-current`) + botón
   `data-logout`. Gatillo: TabBar "Más". Cierra con `data-modal-close`/Esc (foco+Esc del contrato).
5. **ToastRegion** `div[data-toast-region]` — **fixed right-4 top-20 z-50**, `pointer-events-none`,
   `aria-live=polite`; contiene `<template[data-toast-template]>` con el markup de `Toast`
   (clon por mensaje, autocierre 4 s — ver §4).
6. **Islas del layout** (corren en TODAS las rutas con LayoutApp): `route-guard`, `sidebar`
   (drawer + marca + colapso + logout), `stock-badge`, `modal-controller`, `sync-status`,
   `caja-status`. (`offline-banner` la declara cada página, ver §4.)

---

##3. Chrome auth — `LayoutAuth.astro` (`/login` únicamente)

Documento propio: head + body con slots, **sin sidebar, sin main de LayoutApp, sin footer**.
Isla: `route-guard` (comportamiento inverso, ver §5).

---

##4. Elementos comunes a TODAS las páginas app

Van declarados dentro de cada página, en este orden DOM: `SyncStatusIndicator` (header slot,
bajo el TopBar), `OfflineBanner` (primer hijo de `<main>`), luego el contenedor de la ruta.
Los pills de estado del TopBar y la `ToastRegion` los declara LayoutApp — van en §2.

| Elemento | Posición | Visibilidad ⇔ condición | Isla |
|---|---|---|---|
| Pill `data-sync-pending` (TopBar; texto "Sincronizando… (N)" ≥sm, icono+N <sm — T3.4) | sticky (TopBar) | ⇔ `cola_sync` tiene ítems `pendiente`/`enviando` | `sync-status.ts` |
| Alert `sync-danger` "Algunas ventas no se pudieron sincronizar" + botones `Reintentar`/`Descartar` | flujo (header slot) | ⇔ algún ítem de `cola_sync` en `error_permanente` | `sync-status.ts` |
| Modal `sync-detail` (detalle + "Sí, descartar") | **fixed inset-0 z-50** | oculto ⇔ se abre **solo** al clickear `Descartar` del alert anterior (lo abre la isla con `openModal`, no usa `data-modal-open`) | `sync-status.ts` |
| `OfflineBanner` "Sin conexión — puedes seguir vendiendo" | **en flujo** (bloque normal, `pointer-events-none`, sin fixed/z — Fase 0 refactor D7; antes era `fixed top-0 z-50`) | oculto ⇔ red **online** (arranca oculto en build; isla alterna con los eventos `online`/`offline` de `stores/session`) | `offline-banner.ts` |
| **ToastRegion** `div[data-toast-region]` + `<template[data-toast-template]>` | **fixed right-4 top-20 z-50**, `pointer-events-none`, `aria-live=polite` | región **siempre visible** (vacía); el clon de cada Toast aparece al llamar `utils/toast.ts#mostrarToast(texto)` y **se borra a los 4 s** — mensajes de ÉXITO de caja/productos/categorías/ajustes (D9: nunca desplaza contenido) | `utils/toast.ts` (invocado por las islas) |

**A11y transversal (Fase 4 T4.2/T4.4 — aplica a TODAS las rutas):**

- **`:focus-visible` 2px** (`--color-primary`, offset 2px) en **todos** los controles —
  `@layer base` de `styles/global.css`; los componentes `btn`/`input-field` lo heredan.
- **`prefers-reduced-motion: reduce`** anula **toda** animation/transition (mismo bloque base)
  — badge pop, sheet/drawer, transiciones.
- **Trap de foco** (`utils/modal.ts#openModal`): Tab envuelve dentro del modal y devuelve foco
  al gatillo; `getFocusable` **filtra elementos no visibles** (`offsetParent`/`getClientRects`)
  — sin esto un botón `hidden` dentro de la card rompía el wrap y el foco escapaba (bug real
  encontrado en T4.2). **Esc cierra salvo `cerrar-caja` con monto vacío/inválido** (guard de
  keydown capture en `caja.ts`, `stopImmediatePropagation`).
- **Landmarks:** LayoutApp tiene `main#contenido` (único) + `header` + `nav` sidebar/TabBar;
  `/login` tiene `main[data-login-root]` (ver §6.2). Lighthouse a11y **100/100** en `/` y
  `/productos/` (T4.4).
- **Toast:** `aria-live=polite` y **nunca roba foco** (se verifica con activeElement en
  `test-a11y.js`). Errores de form: `role=alert` + `aria-invalid` (ver `form-errors.ts`).

---

##5. Autenticación — `route-guard.ts` (corre en TODAS las rutas)

- Ruta **≠** `/login` y **sin** `sesion_token` en localStorage → `location.replace('/login')`.
- Ruta **=** `/login` **con** token → `location.replace('/')`.
- Requiere `localStorage` serializado en JSON (leído por `utils/storage.ts`).
- Login (`login-form.ts`): éxito en `POST action=login` → `saveSession(token)` → redirect `/`;
  fallo → mensaje en `[data-login-error]` (ver §6.2). El cliente redirige a `/login` además en
  respuestas `unauthorized` (expira sesión).

---

##6. Las9 rutas

###6.1 `/` — Venta (POS)

- **archivo:** `src/pages/index.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas de la página:** `catalog`, `cart-badge`, `cart-actions`, `modal-controller`,
  `checkout`, `offline-banner` (+ islas de chrome) — ~~`quantity-control`~~ **borrada en Fase 2**
- **fuentes de datos:** red `GET action=productos`; localStorage `catalogo_cache` (TTL 15 min),
  `carrito_actual`, `cajas`, `ajustes`

**Componentes (orden DOM dentro de `<main>`):**

1. `OfflineBanner` (§4).
2. ~~Alert `aviso-caja`~~ — **retirado en Fase 1**: el recordatorio de caja vive ahora en el
   **pill del TopBar** (§2, `caja-status.ts`); la isla `caja-banner.ts` fue **borrada**.
3. **Grid layout ≥lg** (`index.astro`): wrapper `grid lg:grid-cols-[minmax(0,1fr)_380px]
   lg:overflow-hidden lg:py-6 lg:pr-6` — catálogo (scroll propio) | ticket. **<lg:** una
   columna y el ticket vive dentro del **Sheet `ticket`** (raíz `hidden`, §9). La columna
   LayoutApp es **scroll container ≥lg** (`lg:h-screen lg:overflow-y-auto`): TopBar + banda de
   alerts quedan fuera de `main`, que absorbe el resto con flex — la página **no scrollea a
   1280×720** (criterio §4.4).
4. **Sección Catálogo** (`ui/Catalog`):
   - ~~`h1 Catálogo`~~ — **retirado en Fase 1**: el único `h1` ("Venta") lo renderiza el TopBar (§2).
   - Búsqueda `[data-catalog-search]` con **ícono** `buscar` + `Kbd F2` (≥md) — debounce 200 ms,
     Fuse local, **cero red**. **Enter con único resultado lo agrega** al ticket; **Esc** limpia;
     **F2** enfoca (≥md).
   - **Chips de categoría (Fase 2, reemplazan al select):** wrapper `[data-catalog-category]`,
     chip fijo "Todas" `[data-category-value=""] aria-pressed="true"` + chips clonados de
     `<template data-category-chip-template>` (`data-category-value` = categoría,
     `aria-pressed` = seleccionado). Clic delegado → mismo filtrado local, cero red.
   - **Caja stale** `[data-catalog-stale]` "Catálogo de hace N min" + botón
     `Actualizar[data-catalog-refresh]` — oculto ⇔ cache stale (>15 min) **y** el refresh falló.
   - **Área de vacíos:** `empty-catalog` "Todavía no hay productos cargados" con CTA
     "Ir a Productos" ⇔ 0 productos; `no-results` ⇔ hay productos y el filtro da 0. Ambos
     solo tras ocultar el **skeleton** `[data-catalog-skeleton]` (8 `Skeleton`, visible en
     build hasta el primer `render()`).
   - **Grid** `[data-catalog-grid]` — **2 col (móvil) / 3 (md) / 4 (xl)**; la isla clona
      `Card`×`template` (50/página, paginación conservada). **Card (Fase 2 + fix T4.4):**
      imagen 4:3 en `absolute inset-0` con `opacity-0` **hasta el evento `load`** (la isla
      remueve la clase y oculta el placeholder; error → sigue `opacity-0`, el ícono tapa) —
      **nunca `display:none` + `lazy`**: Chrome no descarga una lazy sin caja renderizada,
      `load` no se disparaba y el placeholder era permanente. fallback ícono,
      nombre `line-clamp-2`, precio `tabular-nums`; tag `Agotado` ⇔ stock 0;
     tag warning `Quedan N` ⇔ 0 < stock < `ajustes.stock_alerta_min`; **el overlay
     `<button data-add-to-cart aria-label="Agregar {nombre}"> absolute inset-0 z-10` es la
     tarjeta entera** (stepper y botón secundario eliminados); stock 0 → `disabled` +
     `aria-disabled="true"`.
   - **Paginación** `[data-catalog-pagination]` — oculto ⇔ ≤1 página.
5. **Ticket único** (`smart/TicketContainer.astro`, hook **nuevo** `[data-ticket]` — UN solo
   nodo para <lg sheet Y ≥lg columna, sin DOM duplicado):
   - **Modal variant `ticket`** (§9): <lg bottom sheet; ≥lg forzado estático por CSS
     (`@layer theme`: `[data-modal-root="ticket"][hidden] { display:flex !important }` ≥lg);
     `aria-modal` se repinta sobre el `[role="dialog"]` (false ≥lg / true <lg).
   - Header: `h2 "Ticket (<span data-cart-badge>)"` + **`Cancelar venta` secundario en el
     header** (`.btn-cancel-sale`, outline danger; gatillo `data-modal-open="cancel-sale"`,
     ⇔ carrito > 0) + ✕ `data-modal-close` (solo <lg). **Modal `cancel-sale` sin cambios.**
   - `ul[data-cart-lines]` — `cart-actions.ts` pinta clones de `CartLine` (nombre, unit,
     `−/qty/+` vía `data-cart-qty-step` floor 1, importe, `Quitar[data-cart-remove]`).
   - **UN solo `CartTotals`** — Subtotal / IGV (label reescrito con `ajustes.igv_tasa`) / Total.
   - Fieldset "Método de pago": radios reales `sr-only` estilizados como segmentos ≥56 px
     (`has-[:checked]:`), default **Efectivo**, íconos `tarjeta`/`celular`.
   - **Bloque efectivo** `[data-checkout-cash]` (visible ⇔ efectivo): input
     `[data-checkout-recibido]` + **montos rápidos** `[data-checkout-quick-group]`
     (clonados en runtime: `Exacto` + billetes ≥ total 10/20/50/100/200; botones
     `[data-checkout-quick]` con `data-amount`; **delegación única con `closest()`**),
     `Vuelto [data-checkout-vuelto]` ⇔ recibido ≥ total (monto
     `[data-checkout-vuelto-amount]`), `Faltan S/ X [data-checkout-faltan]` ⇔ recibido <
     total (monto `[data-checkout-faltan-amount]`) — **2 nodos distintos, nunca color solo**.
   - **Botón `Cobrar S/ {total} [data-checkout-charge]`** `min-h-16 w-full` + razón
     `aria-describedby="checkout-reason"` (id estático único): **`disabled` ⇔ carrito vacío ∨
     (efectivo ∧ recibido informado ∧ < total)** — total comparado con `money()` (round2);
     razón en `data-checkout-reason` ⇔ blocked. **F9** = cobrar (≥md).
   - `Alert checkout-error` **conservado tal cual** (payload rechazado / stock parcial).
6. **Barra de carrito móvil** (`ui/CartBar`, hooks nuevos): `[data-cart-bar]` fixed sobre la
   TabBar (`bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))]`, `z-40`, `lg:hidden`) con
   "N ítems · S/ total" (`[data-cart-bar-count]`/`[data-cart-bar-total]`) + botón
   `data-modal-open="ticket"` "Ver ticket"; spacer `[data-cart-bar-spacer] h-14 lg:hidden`
   (main conserva `pb` de TabBar). **Ambos `hidden ⇔ carrito vacío`**, pintados por
   **`cart-badge.ts`** (sin isla nueva).
7. **Modal `venta-ok`** (§9): check + "Venta registrada" + total
   (`[data-venta-ok-total]`) + **vuelto grande** (`[data-venta-ok-vuelto]`, solo si vuelto > 0)
   + acciones `Nueva venta[data-venta-ok-nueva]` (primaria → cierra + **foco al buscador**) y
   `Ver detalle[data-venta-ok-detail]` (→ `/historial/venta/?id=`); **autocierre 8 s solo si
   no hay vuelto**. **Reemplaza al `Alert checkout-success` (retirado en Fase 2).**

**Flujo de cobro (interno sin cambios):** uuid → snapshot local en `historial_ventas` →
descuento de stock en `catalogo_cache` (sin tocar timestamp) → vaciar carrito → **feedback =
modal `venta-ok`** → intento `registrarVenta` → si `network_failure`/`unauthorized` **encola**
venta + stock (FIFO) → `Alert checkout-error` solo si la API rechazó el payload.

**Gatillos JS-only (solo existen con su modal abierto o su isla viva):**
`data-cart-cancel-confirm`, `data-venta-ok-nueva`, `data-checkout-quick` (delegación),
`data-add-to-cart` (overlay de la card), `data-sync-confirm-discard`.

---

###6.2 `/login` *(actualizado Fase 4 T4.1)*

- **archivo:** `src/pages/login.astro` · **layout:** LayoutAuth (sin sidebar) · **auth:** pública
- **islas:** `login-form`, `route-guard`

**Componentes (orden DOM, T4.1 §11):**

1. **`<main data-login-root>`** — ocupa `min-h-dvh` centrado (px-4 py-10). **Es el landmark
   `main` de la página** (LayoutAuth no tiene el de LayoutApp; Lighthouse
   `landmark-one-main` pasa 100 desde Fase 4 — `div`→`main`).
2. **Card** `card max-w-[400px] p-6` con: `h1[data-login-marca]` (marca; la isla la repinta
   con `ajustes.nombre_local` vía textContent, fallback "Tinya Point" de build).
3. **Nota offline** `<p[data-login-offline]>` role=status — **oculto ⇔ hay red** (isla
   alterna `hidden` con los eventos online/offline; texto "Necesitás conexión para
   iniciar sesión").
4. **`form[data-login-form]`** (`novalidate`): label `Usuario` (input text,
   `autocomplete=username`, required) · label `Contraseña` (password, required,
   `aria-label`) con **toggle** `button[data-login-toggle]` (`aria-pressed`, texto
   Mostrar/Ocultar, dentro del campo, ≥44px) · `<p[data-login-error]>` role=alert —
   **oculto ⇔** último intento falló (isla muestra "Usuario o contraseña incorrectos." /
   fallo de red; se limpia al reintentar; **foco se mueve al input de usuario en TODOS los
   errores**) · botón `Ingresar[data-login-submit]` (submit): con pending muestra
   "Ingresando…" + `disabled` (anti doble envío). Éxito → redirect `/`.

---

###6.3 `/historial` *(actualizado Fase 3 T3.4–T3.5)*

- **archivo:** `src/pages/historial.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas:** `historial` (+ chrome) · **fuentes:** **100% local** `historial_ventas` + `cajas`
  + `cola_sync` (**cero API**)

**Componentes:**

1. `OfflineBanner` · `SyncStatusIndicator` (header).
2. ~~`h1 Historial de ventas`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. **KPIs** `div[data-hist-kpis]` `grid`2/4 cols con4 `StatCard` (`[data-hist-kpi]` =
   `ventas` · `total` · `promedio` · `metodo`; valor interno vía `[data-stat-value]`,
   pintado con textContent) — **oculto ⇔ el historial total está vacío**; los4 valores se
   recalculan en **cada** filtro (chip, fechas o búsqueda). "Método más usado" = conteo sobre
   el filtrado (empate → el primero del array); sin resultados → `—`.
4. **Chips de rango** `div[data-hist-range]` `ChipGroup` "Rango de fechas" con
   `data-range-value` = `hoy` · `ayer` · `7d` · `mes` · `personalizado` (estado en
   `aria-pressed`; `personalizado` es el default). Un preset **escribe** `Desde`/`Hasta`;
   `personalizado` los **limpia** (vuelve al rango completo). Editar fechas a mano regresa a
   `personalizado` sin borrar.
5. **Búsqueda** label "Buscar" + input `[data-hist-search]` type=search — debounce200 ms,
   match case-insensitive sobre `id_venta` + método + nombres de ítems.
6. **Filtros de fecha** `div[data-hist-dates]`: label `Desde` `[data-hist-from]` y label
   `Hasta` `[data-hist-to]` type=date (conservados de Fase 2). **Visibilidad runtime**
   (`hidden`): **siempre ≥md; <md solo con rango `personalizado`** (matchMedia
   `(min-width:768px)`, listener `change`). Evento `change` → re-filtro local.
7. `div[data-hist-days]` — vacío en build; la isla clona un `HistorialDay` por fecha local
   (más reciente arriba). Cada día (`<details>`):
   - summary: **fecha larga** `[data-hist-dia]` "Mié 23 sep" (`formatDiaResumen`) +
     "N ventas" + **pill método** `[data-hist-metodo-pill]` (método más usado del día, tono
     muted; oculto ⇔ sin ventas) + desglose por método ("Efectivo S/… · Tarjeta S/…") +
     **total día tabular** `[data-hist-total]`.
   - `<span[data-hist-top]>` "Más vendidos: A ×n · …" (top3) — oculto ⇔ el día no tiene ventas
     con unidades.
   - `div[data-hist-caja]` — oculto ⇔ **no existe** sesión de caja local para esa `fecha_dia`
     (texto: estado y diferencia de la caja de ese día).
   - `ul[data-hist-lines]` **`md:hidden`** → clones de `HistorialLine` (`<li>`): link con
     hora, método, "N productos", total + **sync pills** `span[data-hist-sync]` (3
     `StatusPill[data-hist-sync-state]` = `sincronizada`/`pendiente`/`error`, **exactamente1
     visible** vía `hidden`, estado = cola_sync matcheada por `payload.id_venta`; fuera de la
     cola → Sincronizada); **`href = /historial/venta/?id=<id_venta>`**.
   - **≥md:** `DataTable` (Hora · Método · Productos · Total · Estado) con sus filas de
     `HistorialLineDesktop` (`<tr>`, mismos hooks; UN `paintLine()` compartido), dentro de
     `div.hidden.border-t.md:block` (`md:rounded-none md:border-0 md:shadow-none` sobre el
     DataTable).
   - `details.open` = **solo el día de hoy, solo en el primer pintado**.
8. `HistorialDay`, `HistorialLine` y `HistorialLineDesktop` — **`<template>`s**, invisibles.
9. `EmptyState empty-historial` "Todavía no hay ventas" — visible ⇔ el historial total está vacío.
10. `EmptyState no-date-results` "Sin ventas en ese rango de fechas" — visible ⇔ hay ventas
    **y** el filtro (fechas o búsqueda) da0.
11. ~~Exportar CSV `data-hist-export`~~ — **no implementado** (spec lo marca opcional; sin
    checkbox en el plan).

---

###6.4 `/historial/venta/?id=<id>` — Detalle de venta / comprobante
*(actualizado Fase 3 T3.6)*

- **archivo:** `src/pages/historial/venta.astro` (ruta **estática**; el id va en query —
  `getStaticPaths` es imposible con `output:"static"`) · **layout:** LayoutApp · **auth:** protegida
- **islas:** `venta-detail` · **fuentes:** **100% local** `historial_ventas` + `cola_sync` +
  `ajustes` (**cero API**)

**Componentes:**

1. `OfflineBanner` · `SyncStatusIndicator`.
2. ~~`h1 Detalle de venta`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. `div[data-venta-contenido]` — **visible por defecto; oculto ⇔** `id` ausente/desconocido:
   - **card encabezado comprobante:** `[data-venta-local]` (nombre del local desde
     `ajustes.nombre_local`, default "Tienda", texto de build) + **sync pills**
     `span[data-venta-sync]` (3 `StatusPill[data-venta-sync-state]`, exactamente1 visible ⇔
     match en `cola_sync` por `payload.id_venta`; fuera de cola → Sincronizada) + fila
     `[data-venta-fecha]` + `[data-venta-hora]` + **método en pill** `StatusPill info`
     `[data-venta-metodo]` (pintados por isla).
   - **tabla de líneas** (card con `<table>`): thead Producto · Cantidad · Importe;
     `tbody[data-venta-lines]` → clones de `VentaLine` (`<tr>`: nombre, "N × S/precio",
     importe right tabular). `VentaLine` **`<template>`**.
   - **card totales** (filas right-aligned, tabular): fila `Subtotal[data-venta-subtotal-fila]`
     — **oculta ⇔** la venta no tiene snapshot `subtotal` (ventas antiguas, gotcha G9); fila
     IGV (label = tasa configurada en runtime, si no hay subtotal se deriva inverso con la
     tasa **actual** — limitación conocida); fila `Total` **destacada** (`border-t`,
     `text-lg`); nota discreta `<p[data-venta-igv-nota]>` "Estimado con la tasa actual" —
     **oculta ⇔** hay snapshot de subtotal (i.e. visible solo cuando el IGV es derivado).
4. `div[data-venta-no-encontrada]` — oculto ⇔ id válido; contiene `EmptyState venta-notfound`
   con **CTA slot** `Volver al historial` → `/historial`.
   - ✅ **FIX T0.1 aplicado (Fase 0):** el `EmptyState` hijo ya no recibe `hidden` en build
     (el wrapper `hidden` hace de puerta; bug de23/09/2026 resuelto).
5. `div[data-venta-acciones]` (oculto ⇔ id desconocido — la isla lo oculta, su CTA vive en
   el EmptyState): link `Volver al historial` (secundaria) + botón
   **`Imprimir[data-venta-print]`** (primaria) → `window.print()`. El `@media print`
   (`global.css`) mide **80 mm**, oculta todo el chrome (header/sidebar/tabbar/modales/
   toasts/banner/acciones) y deja tinta **solo** en `[data-venta-root]`.

---

###6.5 `/caja` — *(actualizado Fase 3 T3.7)*

- **archivo:** `src/pages/caja.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas:** `caja`, `modal-controller` (+ chrome) · **fuentes:** localStorage `cajas`,
  `historial_ventas` (snapshot de cierre); red `abrirCaja`/`cerrarCaja` con **encolado offline**
  (`cola_sync` tipos `abrirCaja`/`cerrarCaja`)

**Componentes (orden DOM):**

1. `OfflineBanner` · `SyncStatusIndicator`.
2. ~~`h1 Caja`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. **Estado como cabecera** — dos `StatusPill` que se alternan por visibilidad (§0.4):
   - `ok` `[data-caja-pill-abierta]` **visible ⇔ hay caja abierta**: ícono `clock` +
     "Caja abierta desde HH:MM" (`[data-caja-pill-hora]`, `textContent` pintado) + " (hace
     X h Y min)" (`[data-caja-pill-hace]`, `formatTranscurrido`; repinta en `focus`, sin polling).
   - `muted` `[data-caja-pill-cerrada]` **visible ⇔ NO hay caja abierta**: "Sin caja abierta".
4. **Alerts** (mutuamente excluyentes en la práctica):
   - ~~`caja-ok`~~ — **retirado en Fase 1**: el éxito ("Caja abierta.", "Caja cerrada. Cuadra.")
     ahora es **Toast** (§4) y además `caja.ts` dispatchea `caja:state-changed` para repintar el
     pill del TopBar.
   - `caja-error` (danger) — visible ⇔ fallo de API no encolable/validación.
   - `caja-aviso` (warning) "Primero cerrá la caja anterior (del D)" + **acción slot**
     `[data-caja-cerrar-anterior]` "Cerrar caja anterior" — visible ⇔ hay caja abierta
     **de otro día**; el botón hace `click()` sobre el gatillo del resumen → el modal de
     cierre se abre directo (un solo path de reset del input).
   - `caja-cierre` (warning, "Faltan/Sobran S/…") — visible ⇔ el cierre procesado detecta
     diferencia entre efectivo contado y esperado.
5. **`form[data-caja-form]`** centrado (`card mx-auto max-w-md`) — **visible ⇔ NO hay caja
   abierta**; input `inputmode="decimal"` + **sugerido** `[data-caja-sugerencias]` **visible ⇔
   no hay caja abierta Y hay cajas previas**: chip `[data-caja-sugerencia]` pintado con el
   **último monto de apertura** → el click rellena el input ("200.00") y limpia el error inline.
6. **`section[data-caja-resumen]`** — **visible ⇔ hay caja abierta**; grid
   `grid-cols-2 lg:grid-cols-4` (spec §5):
   - `StatCard` `[data-caja-stat-apertura]` — valor = monto de apertura.
   - `StatCard` `[data-caja-stat-ventas]` — valor = total del día, subtexto `[data-stat-sub]`
     = "N ventas".
   - tile propio `[data-caja-metodos]` (**no** es StatCard:3 valores) — filas
     Efectivo/Tarjeta/Yape·Plin `[data-caja-metodo-efectivo|tarjeta|yape-plin]`
     (`totalesDelDia` sobre el historial local de `fecha_dia`).
   - `StatCard` `[data-caja-stat-esperado]` **destacado** (`ring-2 ring-primary`) —
     apertura + efectivo del día.
   - botón `Cerrar caja[data-modal-open="cerrar-caja"]` — gatillo del modal de cierre.
7. **Historial de cajas** `[data-caja-historial-wrap]` **visible ⇔ hay cajas** (máx. 10:
   abierta primero, el resto por `fecha_hora_cierre` desc): título "Cajas anteriores" +
   `<template data-caja-row>` → `CajaRow` por sesión — fecha `[data-caja-row-fecha]`
   (DD/MM/YYYY), montos `[data-caja-row-montos]` ("Apertura S/ X · Cierre S/ Y") y pill de
   diferencia `[data-caja-row-diff="curso|cuadra|faltan|sobran"]` con monto
   `[data-caja-row-faltan-valor|sobran-valor]`. Misma clave `cajas` que alimenta
   `[data-hist-caja]` de `/historial` (§6.3) — sin wiring extra.
8. **Modal `cerrar-caja`** — fixed z-50, oculto hasta el gatillo. Contenido: **"Esperado: S/ X"
   `[data-caja-esperado-modal]` arriba** (pintado en `render`), label "Efectivo contado" input
   `[data-caja-conteo]`, texto de ayuda, **diferencia en vivo `[data-caja-diff]`** (recalcula
   en cada `input`; tres nodos, solo visibilidad): `Cuadra` (success) / `Faltan S/ X`
   (warning) / `Sobran S/ X` (info); error inline `[data-field-error]`, botones `Cancelar`
   (`data-modal-close`) y `Sí, cerrar[data-caja-confirmar]` — **sin** `data-modal-close`:
   input inválido **no** cierra el modal (el modal solo se cierra en cierre válido).

---

###6.6 `/productos` — Admin de productos *(actualizado Fase 3 T3.1–T3.3)*

- **archivo:** `src/pages/productos.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas:** `product-admin`, `modal-controller` (+ chrome) · **fuentes:** red
  `productosAdmin` (fallback `productos` si el backend no lo tiene) y `GET categorias`
  (fallback: categorías derivadas de la lista de productos); tras cada mutación refresca
  `catalogo_cache` (G5) · **toolbar/filtros/paginación: 100% locales, cero red**

**Componentes (orden DOM):**

1. `OfflineBanner` · `SyncStatusIndicator` · **botón `+ Nuevo producto`** en el TopBar
   (slot `page-actions` de LayoutApp): `[data-product-new][data-modal-open="producto-form"]`,
   icono `plus`, etiqueta de texto oculta <sm (en móvil queda solo el ícono, `aria-label` fijo).
2. ~~`h1 Productos`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. **Dos Alerts** (pintan `role="status"`):
   - `productos-error` (en la página) — visible ⇔ falló **carga de lista o toggle**
     (desactivar/restaurar).
   - `productos-form-error` (dentro del drawer) — visible ⇔ falló **guardar/validación**.
   - Ambos se ocultan al entrar a edición/nuevo y al tipear (`ocultarAlertas` limpia también
     errores inline). Éxitos ("Producto creado/actualizado/restaurado/desactivado") → **Toast**.
4. **Toolbar** (siempre visible; todo local):
   - Buscador `[data-product-search]` "Buscar por nombre o categoría…" — `input` con
     debounce 200 ms → Fuse local, **cero red**; nueva búsqueda reinicia el bloque de 50.
   - `ChipGroup` estado envuelto en `[data-product-filter]`, chips `data-filter-value`:
     `""` Todos (arranca `aria-pressed=true`) · `activo` · `inactivo` · `bajo`
     (0 < stock < `ajustes.stock_alerta_min`, solo activos) · `agotado` (stock 0, solo
     activos). La isla flipea `aria-pressed` (nunca clases) y re-renderiza.
   - `select [data-product-catfilter]` "Categoría" — arranca con la opción "Todas"; la isla
     lo llena junto al select del form con `GET categorias` (o derivadas).
   - `select [data-product-sort]` — `nombre` (default) · `precio` (asc) · `stock` (asc).
   - Contador `[data-product-count]` — "Mostrando X de Y productos" (X = filas del bloque
     actual, Y = total tras filtros); vacío ⇔ 0 resultados.
5. **Modal `producto-form`** — gatillo `data-modal-open="producto-form"` (TopBar y CTA del
   empty) o `openModal` directo desde `editarProducto`; variante **drawer = Sheet <md /
   Drawer ≥md**; **sin `title` propio**: el `h2` del form ("Nuevo producto" ⇔ "Editar
   producto") es el título visible y el ✕ (`data-modal-close`) siempre está. Contiene:
   - Alert `productos-form-error` (oculto ⇔ sin error de guardar).
   - **`ProductForm` tal cual** (mismos `data-product-*`, misma validación inline):
     - Título `[data-product-form-title]` — "Nuevo producto" ⇔ "Editar producto".
     - `Nombre` `[data-product-nombre]` (siempre) · `Categoría` `[data-product-categoria]`
       select (opción en blanco "Elegí una categoría"; poblado por la isla).
     - Fila `Precio (S/)` `[data-product-precio]` (number, min 0, step 0.01) y `Stock`
       `[data-product-stock]` (number, min 0, step 1).
     - Bloque `Imagen (opcional)`: preview `[data-product-imagen-preview]` **96 px**
       (oculto ⇔ sin URL) · input URL oculto `[data-product-imagen]` (porta lo que valida
       `leerFormulario`) · label-botón "Subir foto" con `input[type=file]` sr-only ·
       "Quitar imagen" ⇔ hay URL · estado "Subiendo imagen…" · error de subida role=alert.
     - Submit `[data-product-submit]` "Guardar producto" ⇔ "Guardar cambios"; durante envío
       `disabled` con "Creando…/Guardando…" (anti doble submit, cubre Enter).
     - `Cancelar [data-product-cancel]` — **visible ⇔ modo edición**; click = `modoNuevo` +
       **cierra el drawer**.
     - Validación inline: `<p data-field-error role=alert>` junto al campo + `aria-invalid`;
       desaparece al tipear. Sin `campo` → alert `productos-form-error`.
   - Éxito de guardar → **Toast** + `modoNuevo` + **cierre** (el foco vuelve al trigger).
6. `ul[data-product-rows]` — tarjetas **<md** (clase `md:hidden`); vacío en build; la isla
   clona `ProductRow` (`<template>` → `<li data-product-row data-product-id>`): miniatura
    `[data-product-img]` (`opacity-0` hasta `load` — fix T4.4 lazy+display:none; sin URL o
    error → colapsa con `hidden`) · nombre · `[data-product-precio]` ·
   `[data-product-stock]` ("Stock: N") · badge `Activo`/`Inactivo` (siempre con la palabra) ·
   botones `Editar` · `Desactivar` (⇔ activo, `data-modal-open="confirmar-desactivar"`) ·
   `Restaurar` (⇔ inactivo).
7. **DataTable ≥md** (`ui/DataTable`: wrapper `hidden md:block`, thead **sticky
   `top-[62px]`** bajo el TopBar; columnas **Miniatura `hidden lg:table-cell`** (prop
   `hiddenBelowLg` de DataTable, T4.4 — libera ~50px a 768–1023 donde la tabla min-content
   desbordaba la card sin scrollport) · Nombre(+categoría muted) · Precio ·
   Stock · Estado · Acciones; numéricas a la derecha; sin `overflow-x` para no matar el
   sticky): el `tbody` recibe clones de **`ProductRowDesktop`** (`<template>` →
   `<tr class="hidden md:table-row">`, el `td` thumb espeja con `hidden lg:table-cell`). Mismos hooks que la tarjeta, más variantes desktop:
   `[data-product-categoria]` (solo tr) · `[data-product-stock-plain]` (número pelado —
   la cabecera ya dice Stock) · tags `[data-product-low]` "Bajo" y `[data-product-agotado]`
   "Agotado" (solo tr; umbral `ajustes.stock_alerta_min`, pintados por la isla). UN
   `paintRow()` pinta ambos templates; delegación única en `root` (`closest('[data-product-row]')`).
8. Botón **`Mostrar más`** `[data-product-more]` — visible ⇔ hay más filtrados que
   `visibleCount` (bloques de **50**; `+50` por click; se oculta al agotar; reset al cambiar
   filtro/búsqueda).
9. `EmptyState empty-productos` "Todavía no hay productos" — visible ⇔ lista total = 0;
   CTA en slot `actions` = botón **`+ Nuevo producto`** (mismos hooks del de TopBar).
10. `EmptyState no-results` "Ningún producto coincide con la búsqueda." — visible ⇔ hay
    productos **y** la búsqueda actual no coincide con ninguno.
11. **Modal `confirmar-desactivar`** — oculto hasta `data-modal-open="confirmar-desactivar"`;
    `Cancelar` (`data-modal-close`) y `Sí, desactivar[data-product-confirm-deactivate]`.

**Gatillos JS-only:** `data-product-confirm-deactivate` (ejecuta la baja pendiente) ·
`data-product-new` (resetea el form a modo nuevo en el mismo click que abre el drawer) ·
`data-filter-value` (chips → filtro + reset de bloque) · `data-product-more` (+50 filas).

---

###6.7 `/categorias` — Admin de categorías *(actualizado Fase 3 T3.9)*

- **archivo:** `src/pages/categorias.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas:** `categorias-admin`, `modal-controller` (+ chrome) · **fuentes:** red
  `GET categorias` + `crearCategoria`/`renombrarCategoria`/`eliminarCategoria`
  (**sin cola offline** — editar offline falla con error visible, decisión deliberada;
  **T3.9 (23/09/2026):** además del pre-guard local, el submit queda `disabled` y se
  muestra "Necesitás conexión…" ANTES del intento) + `catalogo_cache` (solo para conteos)

**Componentes (T3.9 — 23/09/2026):**

1. `OfflineBanner` · `SyncStatusIndicator`.
2. ~~`h1 Categorías`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. `Alert categorias-error` — ⇔ fallo de la última operación. ~~`categorias-ok`~~ — **retirado
   en Fase 1**: los éxitos ("Categoría creada/renombrada/eliminada") son **Toast** (§4).
4. **`CategoriaForm` en fila (sin card)** sobre la lista — misma estructura de siempre:
   - Título span `[data-categoria-form-title]` — "Nueva categoría" ⇔ "Renombrar categoría".
   - input `[data-categoria-nombre]` — siempre.
   - Botón `Guardar categoría[data-categoria-submit]` — siempre (texto durante envío: ver
     plan-form-ux; `disabled` anti doble submit **y ⇔ sin red**).
   - Botón `Cancelar[data-categoria-cancel]` — **visible ⇔ modo renombrar**.
   - `p[data-categoria-offline]` "Necesitás conexión para modificar categorías" (warning) —
     **visible ⇔ `!navigator.onLine`**; la isla lo alterna con los eventos online/offline y
     un guard extra en `submit` tapa el envío implícito por Enter.
5. `ul[data-categoria-rows]` — vacío en build; clona `CategoriaRow`:
   - `[data-categoria-nombre]` (texto) + `span[data-categoria-count]` "N productos(s)" —
     **visible ⇔ hay `catalogo_cache`**; tally por nombre de categoría, cache-only, cero red;
     sin cache el span queda oculto.
   - `span[data-categoria-en-uso]` "En uso por N productos" (warning) — visible ⇔ conteo >0.
   - `Editar` — entra a modo renombrar en el form superior (**renombrar inline NO adoptado**,
     desviación w de la spec §8; la fila nunca lleva input propio).
   - `Eliminar[data-modal-open="confirmar-borrar-categoria"]` — **`disabled` ⇔ conteo >0**
     (pre-guard local; botón disabled ni dispara click → el modal no abre; el backend sigue
     validando `categoria_en_uso`).
6. `EmptyState empty-categorias` "Todavía no hay categorías" — visible ⇔ lista =0.
7. **Modal `confirmar-borrar-categoria`** — oculto hasta su gatillo; texto avisa que solo se
   puede eliminar si ningún producto la usa; `Cancelar` + `Sí, eliminar[data-categoria-confirm-delete]`.

---

###6.8 `/stock` — Panel de stock bajo *(actualizado Fase 3 T3.8)*

- **archivo:** `src/pages/stock.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas:** `stock` (+ chrome) · **fuentes:** `catalogo_cache` + refresh por red
  `GET action=productos`; umbral de `ajustes.stock_alerta_min`; repostock vía
  `actualizarProducto` (**sin cola offline** — fallo → revert + alert)

**Componentes (T3.8 — 23/09/2026):**

1. `OfflineBanner` · `SyncStatusIndicator`.
2. ~~`h1 Stock bajo`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. `Alert stock-warning` (warning) — oculto ⇔ sin error de repostock; `[data-stock-warning-text]`
   lleva el mensaje (revert del producto al valor anterior al fallar la actualización).
4. **KPIs** `div[data-stock-kpis]` (grid 2col→3col): `StatCard [data-stock-kpi="reponer"]`
   "Por reponer" · `[data-stock-kpi="agotados"]` "Agotados" · `[data-stock-kpi="valorizado"]`
   "Inventario valorizado" (`col-span-2` en mobile) — valor inicial "—", pintados por la isla
   vía `[data-stat-value]`; reemplazan el párrafo de stats viejo (retirado, grep0).
   Debajo: `p[data-stock-umbral]` "Mostrando productos con stock menor a N" — siempre visible,
   la isla reescribe N con el umbral.
5. Fila de encabezado: `h2 Productos por reponer` + a la derecha `p[data-stock-stale]` con
   **dos nodos** — `[data-stock-stale-text]` (muted, "Catálogo actualizado hace N min") o
   `[data-stock-stale-warn]` (warning, mismo texto cuando la caché superó el TTL) — **siempre
   visible junto a** `button Actualizar[data-stock-refresh]`; oculto solo si no hay datos.
6. **Chips de filtro** `div[data-stock-filter]` (wrapper lleva el hook; `ChipGroup` no reenvía
   rest props): `Chip [data-stock-filter-value="todos"]` "Todos los bajos" (default,
   `aria-pressed="true"`) · `"agotados"` "Solo agotados" · `"categoria"` "Por categoría";
   la isla alterna `aria-pressed` y repinta. Orden default: agotados primero, luego stock
   ascendente, luego nombre; "Por categoría" ordena por categoría → stock → nombre.
7. **`<template data-stock-row-template>`** — invisible; un clon por producto bajo umbral:
   `[data-stock-nombre]` · `[data-stock-categoria]` · `[data-stock-precio]` · stepper
   `[−][input][+]` con `data-stock-step="-1|1"` + lote `+5 +10 +24` (`data-stock-step="5|10|24"`,
   mismo debounce 500 ms; el input guarda al cambiar/Enter; límites0-9999) · tags
   `[data-stock-bajo]` (warning, `title` con el umbral; visible ⇔ 0<stock<umbral) y
   `[data-stock-agotado]` (danger; visible ⇔ stock=0).
8. `div[data-stock-list]` — vacío en build; pinta los clones. **Oculto ⇔** no hay datos o
   ningún producto bajo el umbral.
9. `EmptyState stock-ok` "Ningún producto bajo el umbral. ¡Todo en orden!" — visible ⇔ hay
   datos **y**0 productos bajo el umbral.
10. `EmptyState stock-nodata` "No se pudo cargar el catálogo. Revisá tu conexión." con botón
    `Reintentar[data-stock-refresh]` (segundo gatillo del mismo delegado) — visible ⇔
    **no hay ni cache ni fetch** (nunca inventa números).

---

###6.9 `/ajustes` *(actualizado Fase 3 T3.10)*

- **archivo:** `src/pages/ajustes.astro` · **layout:** LayoutApp · **auth:** protegida
- **islas:** `ajustes` (+ chrome) · **fuentes:** **100% local** localStorage `ajustes` +
  `cola_sync` (solo lectura para la card de sesión) + `package.json` version
  (**cero API**)

**Componentes (T3.10 — 24/09/2026):**

1. `OfflineBanner` · `SyncStatusIndicator`.
2. ~~`h1 Ajustes`~~ — **retirado en Fase 1**: el único `h1` lo renderiza el TopBar (§2).
3. `Alert ajustes-error` — ⇔ fallo al guardar. ~~`ajustes-ok`~~ — **retirado en Fase 1**: el
   éxito ("Ajustes guardados — recargando…") es **Toast** (§4).
4. **`AjustesForm` en 3 cards de sección** (`novalidate`, validación por isla con errores
   inline `form-errors.ts` + Alert para fallos):
   - **Negocio** — `h2` + desc; `Nombre del local` `[data-ajustes-nombre]` (text) con ayuda
     "Se muestra en el comprobante y el TopBar."; `Moneda (símbolo)` `[data-ajustes-moneda]`
     (text, maxlength6, default "S/") con ayuda "Se usa en precios, totales y tickets."
   - **Impuestos** — `h2` + desc; `IGV (%)` `[data-ajustes-igv]` (number0-100, step0.5,
     default18) con ayuda "Las ventas antiguas conservan su IGV original."; **preview en
     vivo** `p[data-ajustes-preview]` `S/ 100.00 = S/ 100.00 + IGV S/ 18.00` — recalculado
     en `input` con los valores TIPADOS (la moneda vacía cae a la cargada; nunca lee
     storage mientras se escribe).
   - **Inventario** — `h2` + desc; `Alerta de stock (unidades)` `[data-ajustes-stock-alerta]`
     (number0-999, default5) con ayuda "…aparecen como "Bajo"."
   - Nota final "Los cambios se aplican a precios y totales al guardar."
   - **Sin botón de submit interno** — el Guardar vive en la barra sticky (abajo).
5. **Card "Sesión y dispositivo"** (fuera del form, lecturas locales):
   - `Cola de sincronización` → `[data-ajustes-cola]` "`N pendiente(s)`" (`getColaSync().length`).
   - `Última sincronización` → `[data-ajustes-ultima-sync]` — vacío de cola: "Sin pendientes";
     con items: `formatHora(ultimo_intento ?? creado)` + "(último intento)" (**desviación y**:
     no existe key de último éxito persistido).
   - `Versión de la app` → `[data-ajustes-version]` = `v` + `package.json` version.
   - `Cerrar sesión` `[data-logout]` — manejado globalmente por `islands/sidebar.ts`.
6. **Barra sticky dirty** `div[data-ajustes-dirty]` — `fixed` abajo con
   `bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))]` (<sm, sobre el TabBar z-40) y
   `md:bottom-0`; z-30. **Visible ⇔ hay cambios sin guardar** (comparación contra el
   snapshot `cargados` tomado al load). Contenido: "Cambios sin guardar" +
   `Descartar cambios[data-ajustes-descartar]` (restaura snapshot + limpia errores) +
   `Guardar ajustes[data-ajustes-guardar]` (type=button → `form.requestSubmit()`; durante
   el guardado: `disabled` + texto "Guardando…"; se restaura en error).

---

##7. Índice de islas por página

| Isla | Dónde corre | Qué pinta / maneja |
|---|---|---|
| `route-guard` | todas (LayoutApp + LayoutAuth) | redirecciones de sesión |
| `sidebar` | todas las app | drawer móvil (`data-sidebar-open`), **marca** desde `ajustes.nombre_local`, **colapso ≥md** (`data-sidebar-collapse` + persiste `ajustes.sidebar_colapsado`), logout de **todos** los `[data-logout]` |
| `stock-badge` | todas las app | badge de stock bajo (solo cache) |
| `offline-banner` | todas las app | barra "Sin conexión" |
| `sync-status` | todas las app (TopBar + header) | pill contador de cola (`data-sync-pending`/`data-sync-count`), alert error_permanente, modal descarte |
| `caja-status` | todas las app (TopBar) | pills "Caja abierta (desde HH:MM)"/"Caja cerrada" desde `cajas` (cache-only); repinta en `caja:state-changed` + `focus` |
| `modal-controller` | todas las app (LayoutApp) | abre/cierra modales por `data-modal-open`/`data-modal-close` (foco+Esc) — incluye TabBar "Más" |
| `catalog` | `/` | tarjetas (overlay tap-to-add + tag `Quedan N`), **chips**, atajos F2/Enter/Esc, skeleton, stale, paginación, vacíos |
| ~~`quantity-control`~~ | ~~`/`~~ | **BORRADA en Fase 2** — stepper de tarjeta eliminado; la cantidad se ajusta solo en el ticket |
| `cart-badge` | `/` | número del carrito (todos los `[data-cart-badge]`) + **barra móvil** `[data-cart-bar]`/spacer (visibilidad/conteo/total) |
| `cart-actions` | `/` | líneas del **ticket**, ±/quitar, "Cancelar venta" visible⇔carrito>0, agregar (guard stock0), pop 150 ms del badge |
| `checkout` | `/` | método (segmentos), montos rápidos, vuelto/faltan (2 nodos), Cobrar (disabled+razón+F9), modal `venta-ok`, alerts, encolado |
| ~~`caja-banner`~~ | ~~`/`~~ | **BORRADA en Fase 1** — su alert `aviso-caja` lo reemplazó el pill del TopBar (`caja-status`) |
| `login-form` | `/login` | intento de login + error |
| `historial` | `/historial` | KPIs (recálculo por filtro), chips de rango + fechas (matchMedia), búsqueda200 ms, días, líneas dual (li/tr) con sync pills, top3, caja del día, vacíos |
| `venta-detail` | `/historial/venta` | comprobante desde `?id` (local, sync pills, nota IGV, Imprimir `window.print`) o estado "no encontrada" |
| `caja` | `/caja` | pill cabecera (desde HH:MM + hace), form vs resumen StatCards (apertura/ventas/desglose/esperado), sugerido = último monto, historial de cajas (template `CajaRow`), diferencia en vivo del modal, aviso otro día → modal directo; **dispatch `caja:state-changed`** + toasts de éxito |
| `product-admin` | `/productos` | lista dual (tarjetas+tabla) con `paintRow()` único, drawer `producto-form` (nuevo/editar/cerrar), toolbar local (chips/categoría/orden/contador), paginación 50, buscador Fuse, validación inline, cachear catálogo, toasts de éxito |
| `categorias-admin` | `/categorias` | lista, CRUD inline, validación, toasts de éxito, conteos cache-only + pre-guard de delete, nota offline con guard de Enter |
| `stock` | `/stock` | KPIs (reponer/agotados/valorizado), chips de filtro con aria-pressed, lista de bajos con stepper ±1 + lote `data-stock-step`, tags Bajo/Agotado, stamp de frescura muted↔warn, refresh delegado (Actualizar + Reintentar), patch local de cache G5 |
| `ajustes` | `/ajustes` | form, validación, guardado (**incluye `sidebar_colapsado`**), toast de éxito, preview en vivo, barra dirty (snapshot/descartar/requestSubmit), card Sesión y dispositivo (cola/intento/versión) |

---

##8. Capas z-index (superposición global)

`z-50` Modales + skip-link enfocado + **ToastRegion** **>** `z-45` drawer móvil **>** `z-40`
TabBar **>** `z-30` TopBar (sticky) **>** contenido de página (auto).
*(Fase 1 refactor: TopBar `z-30` y TabBar `z-40` son capas nuevas; el OfflineBanner y el botón
Menú del flujo siguen fuera de la jerarquía — el Menú ahora vive DENTRO del TopBar sticky.)*
Nunca usar `transform` en ancestros (gotcha G1: rompe `fixed` descendientes, p.ej. el modal de
sincronización).

---

##9. Claves de modal (catálogo único)

| Clave (`data-modal-open=X` ↔ `data-modal-root=X`) | Página | Gatillo visible |
|---|---|---|
| `cancel-sale` | `/` | "Cancelar venta" del **header del ticket** (⇔ carrito >0) |
| `ticket` | `/` | barra CartBar "Ver ticket" (<lg sheet; **≥lg siempre visible como columna** — el CSS fuerza `display:flex` con `hidden`) |
| `venta-ok` | `/` | automático tras cobrar (`checkout.ts`); "Nueva venta" cierra + enfoca buscador |
| `producto-form` | `/productos` | `+ Nuevo producto` (TopBar/empty CTA) y `Editar` de fila — variante **drawer** (Sheet <md / Drawer ≥md), sin `title` (el h2 del form titula), ✕ siempre |
| `confirmar-desactivar` | `/productos` | botón "Desactivar" de fila activa |
| `confirmar-borrar-categoria` | `/categorias` | botón "Eliminar" de fila |
| `cerrar-caja` | `/caja` | "Cerrar caja" del resumen (⇔ caja abierta) |
| `mas` | todas las app | TabBar "Más" (`data-modal-open="mas"`) — variant `sheet`, cierra con `data-modal-close`/Esc |
| `sync-detail` | header (todas) | **no usa `data-modal-open`** — lo abre `sync-status.ts` al clickear "Descartar" |

---

##10. Invariantes que todo agente debe respetar al modificar UI

1. `ui/` **nunca** hace `fetch`, lee `localStorage` ni importa `api/` — solo dibuja (props/slots).
2. Hooks **`data-*`** únicamente — **cero `id`** fijo en islands/listas (gate: `grep 'id="' src/components/islands` →0).
3. Texto de usuario siempre en español rioplatense en UI, **siempre vía `textContent`** (nunca `innerHTML` con datos).
4. Todo estado runtime se manipula con el atributo `hidden` (mostrar ⇔ `el.hidden = condición`), no con clases.
5. Listas = `<template>` + `cloneNode` + delegación con `closest()` (un listener por contenedor).
6. `localStorage` **solo** a través de `utils/storage.ts` (7 llaves; valores JSON).
7. Todo HTTP pasa por `src/api/client.ts`; todo `fetch(` vive ahí (gate).
8. Modales destrucción/doble confirmación → siempre `ui/Modal` + `modal-controller` (§5.5 stilesbase).
9. Accesibilidad: estados nunca solo-color (texto+tono), alerts con `role=alert`, foco visible,
   labels visibles, targets ≥56px en acciones del cajero.
10. Huecos conocidos: ~~`venta-notfound` no se muestra~~ **corregido 23/09/2026 (Fase 0 refactor,
    T0.1)**; badge del sidebar cache-only; IGV de detalle usa tasa actual si no hay snapshot.
    Además: productos con `stock === 0` tienen la tarjeta deshabilitada (`aria-disabled` +
    botones `disabled`) y un guard en `cart-actions.ts` que impide agregarlos (Fase 0, T0.2).
11. **Fase 1:** un solo `h1` por página, en el TopBar (`LayoutApp`); los contenedores no
    renderizan `h1`. Éxitos = `mostrarToast` (nunca Alerts persistentes); los errores siguen
    siendo Alerts `role=alert`. El estado de caja/pills del TopBar vive en `caja-status.ts`
    y se repinta con el evento `caja:state-changed`.
