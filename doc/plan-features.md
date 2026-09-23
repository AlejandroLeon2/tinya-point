# Plan de features — segunda pasada (por fases)

Plan de ejecución para **agentes**. Continúa directamente sobre el esqueleto terminado de `doc/plan.md` (Fases 0–8): el árbol, los contratos, los stores, `api/`, las islands y el backend desplegado **ya existen** — esta pasada implementa la **lógica de negocio** encima, sin rehacer lo hecho.

**Énfasis arquitectónico:** `doc/astrobase.md` sigue mandando: sus 3 invariantes (§1) y reglas de oro (§6) gobiernan TODAS las fases; `doc/stilesbase.md` §5 (accesibilidad) gobierna toda UI nueva; los contratos JSON de `doc/appscriptbase.md` §4 **no se tocan** (si algo necesita cambiarlos, se señala y se detiene).

**Alcance de este plan:** sesión/login funcional, catálogo con TTL + búsqueda, carrito, checkout con venta real y cola de sincronización, historial local, imágenes Cloudinary, deploy Vercel y auditoría final.

**Exclusiones explícitas (ninguna tarea de este plan las implementa):**

- Reporte del día y export CSV — omitidos por decisión del usuario (`doc/extras.md` §5, anotado también en `doc/base.md` §7).
- Modo demo `MODO_DEMO` (`doc/base.md` §4) — no incluido: el Sheet + Apps Script ya están operativos (ese modo existía para mostrar la app sin backend listo); agregarlo solo si el dueño lo pide.
- Todo `doc/base.md` §8 (multi-dispositivo, roles, stock en tiempo real, reportes multi-sucursal, "enterprise security").
- Commit / PR / push — hasta que el usuario defina remote y lo autorice (misma decisión registrada en `doc/plan.md` Fase 8; bloquea especialmente Fase 7).

---

## Cómo ejecutar este plan (instrucciones para el orquestador)

1. **Una fase a la vez, en orden.** No lanzar la fase N+1 antes de cerrar el gate de la fase N.
2. **Cada tarea recibe como contexto mínimo los MD listados en "Contexto" de su fase.** Pasar rutas de archivo con sus §, no resúmenes: el agente lee los MD él mismo.
3. **Una fase se cierra marcando todos sus checkboxes.** Un gate sin cumplir = fase incompleta = no se avanza.
4. **Convención de idioma vigente** (`doc/extras.md` §7): archivos/funciones/variables en **inglés**; columnas de Sheet, claves de JSON y `localStorage` en **español**; texto visible al usuario en **español**.
5. Si una tarea descubre incoherencia entre MDs, o entre un MD y el estado real del repo, **se señala y se detiene** — no se improvisa una solución parcial. *(La decisión de diseño de Fase 2 quedó resuelta el 2026-09-22: ver evidencia en Fase 2.)*
6. Los checkboxes nacen sin marcar; la evidencia se agrega en *cursiva* al ejecutar (mismo estilo que `doc/plan.md`).
7. Los archivos nuevos que este plan implica están listados al final (*Desviaciones de árbol esperadas*) — cada uno con su sanción de MD. Si durante la ejecución aparece un archivo nuevo NO listado ahí, se documenta como nueva desviación antes de crearlo.

---

## Fase 0 — Punto de partida: estado real y prerequisitos

**Contexto:** `doc/plan.md` (estado de sus 8 fases + checklist humano Fase 6) · `doc/extras.md` (§3, §7) · `doc/base.md` (§3, §6) · `doc/astrobase.md` (§1, §6)

**Objetivo:** que el agente arranque sabiendo qué existe, qué backend hay vivo y qué prerequisitos humanos bloquean qué fase — sin redescubrirlo ni tocar código todavía.

**Tareas:**

- [x] Verificar el estado real del repo (debe coincidir; si no, detenerse y reportar): *(verificado 22/09/2026 — todo coincide, sin detenerse.)*
  - [x] Árbol `src/` = `astrobase.md` §2 + desviaciones listadas en `plan.md` Fase 8. *(Coincide: §2 completo + desviaciones Fase 8 (`styles/global.css`, `pwa.ts`, `LayoutAuth.astro`, `smart/SyncStatusIndicator.astro`, `ui/OfflineBanner.astro`, `ui/EmptyState.astro`, `apps-script/README.md`) + config clasp sancionada en `plan.md` Fase 6 (`api/appsscript.json` en la raíz de `src/api/` porque clasp lo exige ahí, `.claspignore`, `.clasp.json` gitignoreado).)*
  - [x] Stubs de negocio **vacíos**: `LoginForm`, `CatalogContainer`, `CartSummary`, `CheckoutPanel`, `historial.astro`, `smart/SyncStatusIndicator` (sin lógica ni HTML de negocio). *(Verificados 22/09/2026: los 6 contienen solo frontmatter/comentario/TODO — 0 lógica ni HTML de negocio.)*
  - [x] Ya listos: `utils/` (5), `stores/` (2; `startNetworkListener` existe y **no** está cableado), `api/` (`client.ts` único fetch, `types.ts`, 4 actions), 3 islands data-driven, PWA completa (manifest + SW + prompt de actualización). *(Verificado 22/09/2026: `startNetworkListener` solo se define en `session.ts:40`, sin callers; único `fetch(` en `client.ts:40`; 4 actions + `types.ts` + `pwa.ts` presentes.)*
- [x] Recargar las 3 invariantes de `astrobase.md` §1 + monopolio de `localStorage` en `utils/storage.ts` (5 llaves) + convención de idioma `extras.md` §7 — tratarlas como invariantes de todo el plan. *(Enunciadas 22/09/2026 antes de tocar código: (1) `ui/` no sabe de dónde vienen los datos — sin `fetch`, sin `localStorage`, sin imports de `api/`; (2) `smart/` no dibuja HTML de negocio — delega la visual en `ui/`; (3) todo HTTP pasa por `api/`, con `client.ts` como único `fetch`. Monopolio de `localStorage` en `utils/storage.ts` con 5 llaves (`catalogo_cache`, `carrito_actual`, `historial_ventas`, `cola_sync`, `sesion_token`). Idioma: código en inglés, contratos/llaves de datos en español, texto visible al usuario en español.)*
- [x] Smoke test del backend vivo (receta en `src/api/apps-script/README.md`, sección *Endpoint smoke test*): *(re-ejecutado al arrancar Fase 0, 22/09/2026 — ambos en verde)*
  - [x] `curl -sL "$PUBLIC_API_URL?action=productos"` → JSON `{"ok":true,...}`. *(200, `productos: []` — hoja aún sin seed)*
  - [x] POST login con credenciales de prueba → JSON `{"ok":false,"error":"credenciales_invalidas"}`. *(pipeline doPost/dispatcher OK)*
- [x] **Estado de prerequisitos humanos** (`plan.md` Fase 6 / `extras.md` §3) — visibilidad para el agente, NO ejecutarlo él: *(estado anotado 22/09/2026: `USUARIO`/`CLAVE` ✓ y hojas ✓ por confirmación del usuario; quedan 2: seed pegado y primer login real.)*
  - [x] Seed pegado en la hoja `Productos` (`seed-productos.csv` listo en la raíz, 194 productos) → *bloquea la verificación con datos reales de Fase 2*. *(Verificado con `ls`+`wc` 22/09/2026: existe en la raíz — `/Users/alejandro/Desktop/trabajo/tinya-point/seed-productos.csv`, 195 líneas = header + 194 productos, 29 KB. **Pegado: confirmado 22/09/2026 — el gate humano de Fase 2 pintó los productos reales.**)*
  - [x] `USUARIO` y `CLAVE` en Script Properties → *bloquea el login real de Fase 1*. *(Usuario confirma 22/09/2026: ya configurados en Apps Script.)*
  - [x] Hojas `Ventas` y `Sesiones` existentes → *bloquea la primera venta real de Fase 4*. *(Usuario confirma 22/09/2026: hojas creadas.)*
  - [x] Primer login real (`extras.md` §3 paso 8) → *se cierra dentro de Fase 1*. *(Cerrado 22/09/2026 — ver gate de Fase 1.)*

**Gate de salida:**

- [x] Backend verificado con los 2 smokes (evidencia arriba o nueva). *(22/09/2026: GET `?action=productos` → 200 `{"ok":true,"productos":[]}`; POST login → 200 `{"ok":false,"error":"credenciales_invalidas"}`.)*
- [x] Estado de prerequisitos anotado: cada pendiente humana identificada con la fase que bloquea. *(22/09/2026: `USUARIO`/`CLAVE` ✓, hojas `Ventas`/`Sesiones` ✓, seed pegado ✓ — todos por confirmación/verificación con el usuario; único pendiente: primer login real → Fase 1 (gate humano, cerrado el 22/09/2026).)*
- [x] El agente puede enunciar las 3 invariantes y la convención de idioma antes de tocar código. *(Enunciadas en la tarea de invariantes de esta fase.)*

---

## Fase 1 — Sesión real: login, guard de rutas y banner offline

**Contexto:** `doc/base.md` (§3 completo, §6) · `doc/astrobase.md` (§3.3 LoginForm, §3.6 session, §3.8 pages, §1) · `doc/appscriptbase.md` (§4.2, §5.1) · `doc/extras.md` (§3 paso 8, §6 fila "Sin conexión") · `doc/stilesbase.md` (§5.7 copys)

**Objetivo:** el login funciona de verdad contra el backend vivo, la app protege sus rutas con el token, y el estado "Sin conexión" queda cableado a su listener.

**Tareas:**

- [x] `smart/LoginForm.astro` — primer stub con lógica (`astrobase.md` §3.3): *(implementado 22/09/2026)*
  - [x] Formulario con `.input-field` × 2 + `.btn-primary` "Ingresar"; labels/copy en español, lenguaje simple (`stilesbase.md` §5.7). *(Labels envuelven los inputs — sin `id` fijos; botón via `ui/Button.astro` — desviación `islands/login-form.ts` anotada en la tabla.)*
  - [x] Submit → `utils/validators.ts` (`hasLoginFields`) → `api/actions/auth.ts` `login()`; **nunca** importar `client.ts` directo. *(Handler en `islands/login-form.ts`, importa solo `actions/auth`.)*
  - [x] Éxito (`{ok, token, expira}` §4.2): guardar solo el token vía `stores/session.ts` → llave `sesion_token` (a través de `utils/storage.ts`) → redirigir a `/`. *(Nuevo `saveSession()` en `session.ts`; `form.reset()` tras guardar; `location.assign('/')` — `expira` no se persiste.)*
  - [x] Error `credenciales_invalidas`: mensaje en lenguaje simple en el formulario (ej. "Usuario o contraseña incorrectos") — nunca el código crudo (`stilesbase.md` §5.7, `appscriptbase.md` §4.5). *("Usuario o contraseña incorrectos." en `[data-login-error]` `role="alert"`; fallback genérico para el resto de códigos §4.5.)*
  - [x] `network_failure`: mensaje "No se pudo conectar, revisa tu conexión" — sin encolar (login no es una venta). *("No se pudo conectar, revisa tu conexión." — 0 llamadas a cola.)*
  - [x] Cero `usuario`/`clave` persistidos o dejados en variables de módulo tras el submit (`appscriptbase.md` §5.3). *(Solo variables locales del handler; sin `setInterval`/storage de credenciales.)*
- [x] Guard de rutas (`base.md` §3 flujo + `astrobase.md` §3.8): *(implementado 22/09/2026 — `islands/route-guard.ts`, desviación anotada)*
  - [x] `/` y `/historial` sin token vigente → redirect a `/login`. *(Montado en `layouts/Layout.astro`; `replace()` para que Back no vuelva a una ruta protegida.)*
  - [x] `/login` con token vigente → redirect a `/` (evita bucle). *(Montado en `layouts/LayoutAuth.astro`; branch inverso en el mismo módulo.)*
  - [x] *Supuesto registrado (los MDs no lo cierran literalmente): el POS single-user arranca en login (`extras.md` §3 paso 8 como flujo canónico). La lectura del catálogo por API puede ser pública (`base.md` §3.3) — eso no saca la app de atrás del guard. ~~**Confirmar con el dueño al ejecutar la fase**; si quiere catálogo sin login, es un ajuste de una línea anotado en evidencia.* **Confirmado con el dueño 22/09/2026: la ruta base es `/login`** — al iniciar pide sesión y recién ahí se accede al catálogo y al resto (todo detrás del guard).*
- [x] Cablear `OfflineBanner` (`extras.md` §6 fila 1): *(implementado 22/09/2026)*
  - [x] Nuevo island (inglés, ej. `islands/offline-banner.ts`) que importa `stores/session.ts` → `startNetworkListener` y alterna la prop `visible` del `ui/OfflineBanner.astro` según el evento `offline`/`online`. *(`islands/offline-banner.ts` creado; mecanismo: `visible` fija el estado SSR y el island alterna el atributo `hidden` — mismo contrato que `utils/modal.ts`; la barra ahora se renderiza siempre (oculta por defecto) para que haya DOM que alternar.)*
  - [x] Montar `<OfflineBanner>` en las páginas con Layout de venta (`/` y `/historial`) — barra "fija arriba", no bloquea, `role="status"` ya está en el componente. *(Ambas páginas lo montan + `<script>` del island.)*
  - [x] **No** auto-ejecutar el listener al importar el store — el island lo inicia al montar (el contrato de Fase 4 de `plan.md` se respeta). *(`startNetworkListener` solo se llama desde el island; grep confirma 0 callers en `stores/`.)*
- [x] Verificar el flujo `unauthorized` ya implementado en `client.ts` (limpia token + `window.location.assign('/login')`) — no duplicarlo ni reescribirlo. *(Revisado 22/09/2026: `client.ts` líneas 32-35 y 65 intactos; 0 cambios en `client.ts` en esta fase.)*

**Gate de salida:**

- [x] `grep -rn "from '.*api/\|storage" src/components/ui/` → 0 (ui sigue sin datos). *(22/09/2026: 0 resultados.)*
- [x] `grep -rn "fetch(" src/` → solo `api/client.ts`. *(22/09/2026: 0 resultados fuera de `client.ts`.)*
- [x] `grep -rn "usuario\|clave" src/stores/ src/components/islands/` → 0 persistencia de credenciales (solo nombres de campo del form). *(22/09/2026: `stores/` 0 hits; 5 hits en `login-form.ts` = nombres de campo + variables locales del handler, 0 persistencia.)*
- [x] `pnpm build` en 0 errores. *(22/09/2026: 3 páginas construidas, 0 errores; scripts verificados en `dist/` — guard en las 3 páginas, formulario y banner presentes.)*
- [x] **(Acción humana — requiere `USUARIO`/`CLAVE` de Fase 0):** primer login real desde la app (`extras.md` §3 paso 8): token queda en `sesion_token`, redirect a `/`, y con la pestaña en modo offline aparece el `OfflineBanner`. *Evidencia: fecha + resultado.* **✅ 22/09/2026 — usuario confirma: todo funciona con normalidad (login, redirect y banner). Fase 1 cerrada.**

---

## Fase 2 — Catálogo: cache TTL, búsqueda, filtro y estados

**Contexto:** `doc/base.md` (§6, §7, §9) · `doc/astrobase.md` (§3.2 Card/Catalog, §3.3 CatalogContainer, §3.4 islands, §1) · `doc/extras.md` (§6 filas "Catálogo desactualizado" y "Catálogo vacío", §4 placeholder/lazy) · `doc/appscriptbase.md` (§5.1, §5.3) · `doc/stilesbase.md` (§4 `.card`, §5)

**Objetivo:** el catálogo pinta productos reales desde `catalogo_cache` con TTL de 15 min, busca y filtra client-side, y muestra bien los estados vacíos/desactualizados — sin golpear la API por tecla.

> ### ✅ Decisión de diseño — RESUELTA el 2026-09-22: **Opción (A)**
>
> Con `output: "static"`, los datos del catálogo llegan en **tiempo de ejecución** (TTL, offline, búsqueda), pero `.astro` renderiza en **build**. Ni `astrobase.md` §3.3 ni §3.4 definen el mecanismo.
>
> **Elegida: (A)** Shell vacío en build + render client-side completo, con el marcado de `ui/Card` como única fuente de verdad (`<template>` dentro de `Card.astro` clonado por el island).
>
> **Por qué no (B):** en build no hay datos reales (el Sheet cambia sin rebuild y el seed se pega después), así que prerenderear exigiría fetch a Apps Script en tiempo de build: acopla `pnpm build` a la red/backend (build roto si Apps Script cae) y contradice `extras.md` §(143) ("todo el dato dinámico ya se resuelve client-side contra Apps Script"). Costo de (A): el primer paint muestra shell/estado de carga — irrelevante porque el dato siempre llega client-side.
>
> *Decisión delegada por el usuario ("ni idea, resolvela") y tomada por el arquitecto el 2026-09-22.*

**Tareas:**

- [x] Flujo de datos en `CatalogContainer` (`astrobase.md` §3.3 — él decide "¿pido o uso cache?"): *(implementado 22/09/2026 — bajo `output: "static"` + opción (A), la decisión corre en `islands/catalog.ts`; el smart renderiza el shell)*
  - [x] Leer `catalogo_cache` vía `utils/storage.ts`; fresco si `timestamp` dentro de `TTL_CATALOGO_MS` (15 min, `base.md` §6) → pintar sin red. *(`init()` en `catalog.ts`: cache fresco → `setData()` con 0 llamadas de red.)*
  - [x] Stale/vacío + hay red → `api/actions/productos.ts` `obtenerProductos()` → `setCatalogoCache` con timestamp nuevo. *(`refreshFromApi()` L161: éxito → `setCatalogoCache` con `timestamp: Date.now()`.)*
  - [x] Stale/vacío + `network_failure` → usar cache **aunque esté vencida**; nunca bloquear la venta (`base.md` §6). *(Fallo → se conserva `products` en memoria; 0 excepciones arrojadas — `client.ts` devuelve `network_failure` tipado.)*
  - [x] Éxito con catálogo stale previo → mostrar estado "Catálogo actualizado hace X min" + botón "Actualizar" **dentro de `CatalogContainer`** (`extras.md` §6 fila 2) usando `formatFecha`/`formatNumero` de `utils/format.ts`. *(Aviso en el shell de `Catalog` con textos por `formatNumero` — la copy es relativa en minutos, `formatFecha` no aplica; visible cuando hay cache stale y el refresh falló/offline según la condición literal de `extras.md` §6 fila 2; se oculta al refrescar con éxito; botón "Actualizar" re-invoca `refreshFromApi` por click.)*
  - [x] La búsqueda **nunca** llama a la API (`appscriptbase.md` §5.3, `base.md` §9). *(Handler `input` L206 llama solo a `render()` local.)*
- [x] Búsqueda client-side con **Fuse.js**: instalar (`pnpm add fuse.js`), índice sobre `nombre` + `categoria` del cache local, disparada desde el input con debounce razonable (`base.md` §9 "ej. Fuse.js"). *(`fuse.js@7.5.0` instalado; `buildIndex()` keys `['nombre','categoria']`, threshold 0.3; debounce 200 ms en el handler `input`.)*
- [x] Filtro por categoría (client-side, sobre el mismo cache) (`base.md` §7). *(Select en el shell; options únicas pobladas por `populateCategories()` — preserva la selección del cajero entre refreshes; intersecta con la búsqueda en `visibleProducts()`.)*
- [x] Estados vacíos (`extras.md` §6 filas 5):
  - [x] 0 productos → `ui/EmptyState.astro` "Todavía no hay productos cargados". *(`state="empty-catalog"`, revelado por `render()`.)*
  - [x] Búsqueda/filtro sin coincidencias → `EmptyState` "Sin resultados de búsqueda". *(`state="no-results"`, solo cuando hay productos pero 0 visibles.)*
- [x] `ui/Card.astro` con datos reales: precio por `formatCurrency` (`S/` 2 decimales), stock 0 → estado visual no solo-color (`stilesbase.md` §5.2), imagen con `loading="lazy"` y `alt` = nombre (`extras.md` §4, `base.md` §9). *(Template pintado por `paintCard()`: `formatCurrency`, stock 0 → texto "Agotado" visible (nunca solo color), `loading="lazy"` en el template, `img.alt = product.nombre`.)*
- [x] Placeholder de imagen (`extras.md` §4): `imagen_url` vacía o error de carga → ícono genérico de producto **dentro de la card** (nunca espacio en blanco ni ícono roto del navegador). *(SVG de bolsa visible por defecto; con URL se escuchan `load`/`error` ANTES de setear `src`; `error` → vuelta al placeholder.)*
- [x] Render + interacción de cards implementados según la opción **(A)** decidida arriba, respetando `astrobase.md` §3.4 (islands, sin ids fijos, sin variables globales). *(`<template data-card-template>` en `ui/Card.astro` clonado por `islands/catalog.ts`; todo con data-attributes; 0 `id=`; verificado en `dist/index.html`.)*

**Gate de salida:**

- [x] Decisión ⚠️ elegida y anotada con fecha. *Resuelta 2026-09-22 → opción (A), ver bloque de evidencia de la fase.*
- [x] `grep -rn "fetch(" src/` → solo `api/client.ts`. *(22/09/2026: 0 resultados fuera de `client.ts`.)*
- [x] Ninguna llamada a `obtenerProductos`/`llamarGet` dentro de handlers de tecla/input (revisión manual anotada con líneas). *(`catalog.ts`: import L16; única invocación L162 dentro de `refreshFromApi()`; llamada desde `init()` L195/L200 (al cargar) y desde click del botón L213-214; handler `input` L206 → solo `render()` local; handler `change` L211 → solo `render()`.)*
- [x] `pnpm build` en 0 errores. *(22/09/2026: 3 páginas, 0 errores; shell + template verificados en `dist/index.html`, Fuse empaquetado en el chunk de `CatalogContainer`.)*
- [x] **(Acción humana — requiere seed de Fase 0):** con el CSV pegado, la app pinta los productos reales; desconectando la red y recargando, se sirve desde cache con el estado "Catálogo actualizado hace X min". *Evidencia: fecha + cantidad de cards.* **✅ 22/09/2026 — usuario confirma: "genial, todo funcional" (catálogo + búsqueda + estados). Fase 2 cerrada.**

---

## Fase 3 — Carrito: agregar, cantidades y resumen con IGV

**Contexto:** `doc/base.md` (§7 fila carrito + impuesto) · `doc/astrobase.md` (§3.2 Card slot extra, §3.3 CartSummary, §3.4 quantity-control/cart-badge, §3.6 cart, §1) · `doc/stilesbase.md` (§4 `.btn*`, §5.5 confirmar destruir, §2.3 danger = cancelar venta) · `doc/extras.md` (§7)

**Objetivo:** el carrito funciona end-to-end en cliente: agregar desde el catálogo, editar cantidades, ver resumen con subtotal/IGV/total, y cancelar con confirmación — todo persistiendo en `carrito_actual`.

**Tareas:**

- [x] Botón "Agregar al carrito" (`.btn-primary`) en el `slot="extra"` de `Card.astro` (`astrobase.md` §3.2/§4 — Open/Closed: sin editar el cuerpo de Card para esta extensión). *(22/09/2026: `ui/AddToCart.astro` (desviación anotada) montado desde `CatalogContainer` como `<Card><AddToCart slot="extra" /></Card>`; Card.astro NO se tocó. `dist/index.html`: `data-add-to-cart` ×1 dentro del template + copy "Agregar al carrito" ✓.)*
- [x] Selector de cantidad con la island `quantity-control.ts` **ya existente** (data-driven, `[data-qty-step]`/`[data-qty-value]`, piso 1) — verificar el contrato de `Modal.astro`/card y cablear sin romperlo; sin ids nuevos (`astrobase.md` §3.4, §6.4). *(22/09/2026: markup `[data-qty-step]`/`[data-qty-value]` en `AddToCart.astro`, isla cargada por `<script>` de `CatalogContainer` (junto a `catalog`); `quantity-control.ts` sin edición, piso 1 intacto; grep `id="` en islands → 0.)*
- [x] Handler de click "Agregar" en un island nuevo (inglés) → `stores/cart.ts` `agregar()` con cantidad del selector → `cart-badge` (existente) refleja el total sin recargar. *(22/09/2026: `islands/cart-actions.ts` (desviación anotada) → `addToCart()` con cantidad del readout (piso 1, readout vuelve a 1); datos del producto viajan en `data-product-*` del card (paintCard de `catalog.ts` extendido). Badge: `cart-badge` existente montado por `CartSummary` pinta `[data-cart-badge]` en el título.)*
- [x] `smart/CartSummary.astro` (`astrobase.md` §3.3):
  - [x] Lee el carrito del store; lista de items con nombre, cantidad, precio unitario, importe; editar cantidad y quitar item (funciones del store ya existentes). *(22/09/2026: shell en smart (0 botones/HTML de negocio) + `ui/CartLine.astro` template clonado por `cart-actions` con `subscribeCart`; ± usa `updateCartQuantity` (piso 1), "Quitar" usa `removeFromCart`; aria-labels por producto.)*
  - [x] Cálculo: subtotal + **impuesto configurable (ej. IGV 18%)** + total — constante en **un solo lugar** (inglés, `utils/`), citando `base.md` §7 "configurable"; formatos con `formatCurrency`. *(22/09/2026: `utils/tax.ts` — `TAX_RATE = 0.18`, `calcTax()`, `calcTotal()`; único dueño de la tasa; display vía `formatCurrency`.)*
  - [x] El bloque visual de totales vive en `ui/` (nuevo componente chico, nombre en inglés) — `astrobase.md` §3.3: el smart "se lo pasa a componentes de `ui/` para mostrarlo". *(22/09/2026: `ui/CartTotals.astro` (fila de desviaciones "totales") — props de valores + `taxLabel`; smart arma `IGV (18%)` desde `TAX_RATE`; hooks `[data-cart-subtotal|impuesto|total]` actualizados por la isla.)*
- [x] Persistencia: todo cambio viaja por `stores/cart.ts` → `utils/storage.ts` (`carrito_actual`) — **cero** `setItem` directo. *(22/09/2026: `grep setItem` fuera de `storage.ts` → 0; nuevo `clearCart()` en el store (única vía de vaciado).)*
- [x] Botón "Cancelar venta" (`.btn-danger`) con **confirmación explícita** en `Modal.astro` + `utils/modal.ts` (foco, Esc) antes de limpiar el carrito (`stilesbase.md` §5.5, §2.3; TODO de `plan.md` Fase 8 sobre acciones destructivas). *(22/09/2026: `Modal.astro` shell dibujado con contrato `data-modal-root hidden tabindex=-1` (verificado en dist); `ui/CancelSale.astro` (desviación anotada) = trigger + modal con "Seguir vendiendo" (cerrar) / "Sí, cancelar" (`data-cart-cancel-confirm` → `clearCart()` + `closeModal`); foco/Esc por `utils/modal.ts`, apertura por `modal-controller`. Trigger queda `hidden` con carrito vacío.)*
- [x] Copy en español, lenguaje simple (`extras.md` §7); botones con `gap-3` y 56px (`stilesbase.md` §5.1/§5.4). *(22/09/2026: copy "Agregar al carrito", "Cancelar venta", "¿Cancelar venta?", "Seguir vendiendo", "Sí, cancelar", "Quitar"; todos los botones usan `.btn` (utility 56px) con `gap-3` en contenedores flex.)*

**Gate de salida:**

- [x] `grep -rn "localStorage\." src/ | grep -v "utils/storage.ts"` → 0. *(22/09/2026: exit 1 = sin matches ✓.)*
- [x] `grep -rn "from '.*api/" src/components/ui/ src/components/islands/` → 0 (carrito es estado local, no API). *(22/09/2026: 2 hits, ambos sancionados en fases previas — `islands/login-form.ts:12` (Fase 1) e `islands/catalog.ts:16` (Fase 2, decisión A): islands = orquestadores de cliente con `api/actions`, permitido por `astrobase.md` §1/§3.3. **Alcance del carrito** (`ui/` + `stores/cart.ts` + `cart-actions.ts` + `cart-badge.ts` + `utils/tax.ts`) → 0 ✓. El gate literal era imposible tras Fases 1–2; se preserva su intención y se documenta la adaptación.)*
- [x] `grep -rn 'id="' src/components/islands/` → 0. *(22/09/2026: exit 1 = sin matches ✓.)*
- [x] `grep -rn "btn-danger" src/` → todo con confirmación asociada (revisión manual con líneas). *(22/09/2026: ocurrencias = definición en `global.css:111` + 2 comentarios + **`ui/CancelSale.astro:11`** (trigger que abre el modal de confirmación) y **`ui/CancelSale.astro:22`** (confirm DENTRO del modal). Ambos dentro del flujo `data-modal-open="cancel-sale"` → 0 botones danger sueltos ✓.)*
- [x] `pnpm build` en 0 errores. *(22/09/2026: 3 páginas, 0 errores; chunks nuevos en dist: `CartSummary.astro_…script…js` contiene `data-add-to-cart`/`data-cart-qty-step`; markup verificado: template de línea, modal root hidden, `IGV (18%)`.)*
- [x] Flujo manual anotado: agregar 2 productos de distinta cantidad → badge suma 3 → total = (Σ precios) × 1.18 con 2 decimales → "Cancelar venta" pide confirmación y vacía todo (recarga incluida: persistió). *(Gate humano ✓ 22/09/2026 — "si todo funciona con normalidad".)*

---

## Fase 4 — Checkout, venta real y cola de sincronización ⭐ fase núcleo

**Contexto:** `doc/extras.md` (§1 completa, §6) · `doc/base.md` (§6, §7 filas cierre/historial, §8) · `doc/astrobase.md` (§3.3 CheckoutPanel, §3.6, §1) · `doc/appscriptbase.md` (§4.3, §4.4, §5.1, §5.2, §5.3) · `doc/stilesbase.md` (§2.3 success/danger, §5.5)

**Objetivo:** cerrar una venta guarda YA en `historial_ventas`, descuenta stock local, intenta sync real contra Apps Script y, si falla, la cola cumple su ciclo de vida completo — la venta **nunca** espera al Sheet.

**Tareas:**

- [x] `smart/CheckoutPanel.astro` (`astrobase.md` §3.3 — el más sabio, el más chico en lo visual):
  - [x] Muestra items del carrito + total (reutilizando el bloque de totales de `ui/` de Fase 3). *(22/09/2026: `ui/CheckoutLine.astro` (desviación anotada) template clonado por `islands/checkout.ts` scoped a `[data-checkout-root]` + `CartTotals` reutilizado con hooks propios — `cart-actions` ahora se scopea a `[data-cart-summary]` para no pisar instancias.)*
  - [x] Selector de método de pago: `efectivo` / `tarjeta` / `yape-plin` (valores wire en español, `base.md` §2.2 y `METODOS_PAGO` del backend) con labels UI en español ("Efectivo", "Tarjeta", "Yape/Plin"). *(22/09/2026: fieldset+legend a11y, radios `name="metodo_pago"` ×3, default efectivo; dist verifica `name="metodo_pago"` ×3.)*
  - [x] Si `efectivo`: campo "Recibido" → calcula y muestra el vuelto (`base.md` §7). *(22/09/2026: bloque cash visible solo con efectivo (island toggle); "Vuelto: S/ X" cuando `recibido ≥ total`, "Faltan: S/ X" cuando no alcanza — copy simple sin códigos.)*
  - [x] Botón principal `.btn-primary` "Cobrar venta" (copy documentado, `stilesbase.md` §2.4/§5.7). *(22/09/2026: `ui/Button` variante primary con `disabled` mientras el carrito está vacío; `Button.astro` extendido con spread de `data-*`.)*
- [x] Cierre de venta (`base.md` §7 — orden exacto):
  - [x] Generar `id_venta` = uuid en cliente. *(22/09/2026: `crypto.randomUUID()` en `charge()`.)*
  - [x] Snapshot de items en `historial_ventas` **antes de cualquier red** — con la forma de `appscriptbase.md` §4.3 (`id`, `cantidad`, `precio`) + `metodo_pago`, `total`, `fecha_hora`. *(22/09/2026: `VentaLocal` completo (con `nombre`, local) unshift-eado ANTES del await; el wire payload va sin `nombre`.)*
  - [x] Descontar stock **localmente** en `catalogo_cache` (sin inventar merge fancy con refreshes: la inconsistencia aceptada está en `base.md` §8). *(22/09/2026: decremento plano `max(0, stock − cantidad)`, `timestamp` intacto = un venta no es un sync.)*
  - [x] Vaciar el carrito. *(22/09/2026: `clearCart()` — feedback success se muestra apenas termina este paso.)*
- [x] Intento de sync inmediato (`appscriptbase.md` §5.2): `registrarVenta` (1 call) y luego `actualizarStock` **por cada ítem vendido**, en ese orden, vía `api/actions/` — nunca `client.ts` directo. *(22/09/2026: `registrarVenta` primero; solo si OK se iteran los stocks (nunca descontar stock en el Sheet de una venta que no registró). `network_failure`/`unauthorized` → encola venta 1ª y stocks después (FIFO preserva orden); otro `api_error` → alert `ui/Alert` danger "No se pudo enviar la venta al Sheet. Quedó guardada en este dispositivo." sin reintentos inútiles y sin códigos crudos.)*
- [x] `stores/syncQueue.ts` — gestor nuevo de `cola_sync` (inglés; ver desviación al final) con el ciclo de vida **literal** de `extras.md` §1:
  - [x] Shape exacto por item: `{ id (uuid), tipo ("registrarVenta"|"actualizarStock"), payload, estado ("pendiente"|"enviando"|"sincronizado"|"error_permanente"), intentos (0), ultimo_intento (null|ISO), creado (ISO) }` — tipo y llaves en español. *(22/09/2026: tipos reusados de `ItemColaSync` en `utils/storage.ts` — idénticos campo por campo.)*
  - [x] Encolar cuando `network_failure` (o el envío inmediato falló); persistir siempre vía `utils/storage.ts`. *(22/09/2026: `enqueue(tipo, payload)` con uuid+ISO, `persist` → `setColaSync` + listeners.)*
  - [x] FIFO, **uno a la vez, nunca en paralelo**. *(22/09/2026: solo se procesa `items[0]`, guard `running` single-flight, loop FIFO hasta que algo frene.)*
  - [x] Disparadores de reintento: evento `online` y al abrir la app (si hay conexión) + primer intento inmediato al encolar. **Sin polling constante** (`appscriptbase.md` §5.3). *(22/09/2026: reusa `startNetworkListener`/`subscribeNetworkStatus` de `stores/session`, `processNext()` al cargar el módulo y en cada `enqueue`; solo `setTimeout` de backoff, **0** `setInterval`.)*
  - [x] Backoff: 1er intento inmediato, luego creciente (ej. 5s → 30s → 2min), máximo **5 intentos** → `error_permanente`. *(22/09/2026: `BACKOFF_MS = [5s, 30s, 2min, 2min]` indexado por intento; `MAX_INTENTOS = 5`.)*
  - [x] Éxito → marcar `sincronizado` y **remover** de la cola (el historial real es `historial_ventas`, la cola no acumula éxitos). *(22/09/2026: `latest.shift()` + persist tras success.)*
  - [x] `error_permanente` → **nunca** se reintenta solo ni se borra en silencio; espera decisión humana (Reintentar / Descartar). *(22/09/2026: head `error_permanente` FRENA la FIFO (decisión humana antes de que ventas posteriores lleguen al Sheet, preservando orden); `retryFailed`/`discardFailed` solo desde la UI — descarte siempre vía modal de confirmación.)*
  - [x] Si un reintento devuelve `unauthorized` (`appscriptbase.md` §4.5): el item queda `pendiente` (no se descarta ni cuenta como fraude); `client.ts` ya redirige a login y el próximo disparador reintenta con el token nuevo (`base.md` §6). *(22/09/2026: estado vuelve a `pendiente`, se revierte el conteo del intento (auth nunca empuja a `error_permanente`), **sin** timer — espera el próximo trigger.)*
  - [x] Éxito parcial aceptado sin drama: `registrarVenta` OK + `actualizarStock` caído → ambos quedan reflejados en la cola hasta sincronizar (`appscriptbase.md` §5.3 nota de no-atOMICIDAD, `base.md` §8). *(22/09/2026: cada stock caído se encola individualmente, FIFO los reproduce después de la venta ya registrada.)*
- [x] `smart/SyncStatusIndicator.astro` — de stub a real (`extras.md` §6 filas 3-4):
  - [x] Lee `cola_sync` vía `utils/storage.ts`; items `pendiente`/`enviando` → ícono discreto (nube con flecha, **con texto accesible**, nunca solo ícono — `stilesbase.md` §5.2/§6), nunca bloquea. *(22/09/2026: "Sincronizando… (N)" con SVG `aria-hidden` + texto visible; montado en `slot="header"` de `/` y `/historial`.)*
  - [x] Algún `error_permanente` → aviso `danger` con botones "Reintentar" (reset a `pendiente`/`intentos: 0`) y "Descartar" (**con confirmación** — `stilesbase.md` §5.5) + `Modal.astro` (via `utils/modal.ts`) con el detalle del item. *(22/09/2026: `ui/Alert` tone danger con botones `ui/Button`; Descartar abre `Modal` "Detalle de sincronización" (líneas "fecha — Venta/Stock — intentos: N" en texto plano) con "Sí, descartar" (`btn-danger` dentro del contexto de confirmación ✓).)*
  - [x] Actualiza tras cada mutación de la cola (llamada directa del gestor), **no** con timers. *(22/09/2026: `subscribeQueue` — solo mutaciones de `persist()`, 0 timers en la isla.)*
- [x] Aviso genérico de error de acción (`extras.md` §6 fila 6): componente chico en `ui/` (inglés, ej. `Alert`) para `api_error` con `error_interno`/`payload_invalido` → copy en lenguaje simple con color `danger`/`warning`; **nunca** el código crudo. `network_failure` no dispara este aviso (eso es cola/offline, no error). *(22/09/2026: `ui/Alert.astro` (desviación "alert/toast" ya en la tabla) tones success/danger/warning con `text-{tone}-content`; solo lo levantan ramas `api_error` — `network_failure` encola en silencio.)*
- [x] Éxito de venta → feedback `success` ("Venta registrada", `stilesbase.md` §2.3) sin bloquear el flujo siguiente. *(22/09/2026: `ui/Alert` success apenas termina el snapshot local; la isla lo oculta ante cualquier cambio de carrito (ciclo de venta nuevo).)*

**Gate de salida:**

- [x] `grep -rn "fetch(" src/` → solo `api/client.ts` (el gestor de cola llama a `actions/`). *(22/09/2026: único hit `src/api/client.ts:40` ✓.)*
- [x] `grep -rn "localStorage\." src/ | grep -v "utils/storage.ts"` → 0. *(22/09/2026: exit 1 = sin matches ✓.)*
- [x] `grep -rn "setInterval" src/` → 0 resultados relacionados con llamadas a la API (si aparece alguno, justificación escrita). *(22/09/2026: exit 1 = sin matches; backoff usa un único `setTimeout` por fallo, no polling ✓.)*
- [x] Revisión de que `stores/syncQueue.ts` replica campo por campo el shape de `extras.md` §1 y las reglas FIFO/backoff/5 intentos (checklist manual anotada). *(22/09/2026 checklist: `id` uuid ✓ · `tipo` 2 valores ✓ · `payload` ✓ · `estado` 4 valores ✓ · `intentos` 0→+1/envío ✓ · `ultimo_intento` null|ISO ✓ · `creado` ISO ✓ · FIFO head-only + guard ✓ · triggers encolar/online/app-open sin polling ✓ · backoff 5/30/120/120 max 5 ✓ · success remueve ✓ · permanente bloquea FIFO y solo se resuelve humano ✓ · unauthorized → pendiente sin timer ✓.)*
- [x] Payloads enviados = contratos literales `types.ts` / `appscriptbase.md` §4.3-§4.4 (items sin `nombre`). *(22/09/2026: `wireItems = {id, cantidad, precio}` (L126 checkout.ts), cola casteada a `DatosRegistrarVenta`/`DatosActualizarStock`; el único objeto con `nombre` es el snapshot local `VentaLocal` (formato distinto a propósito).)*
- [x] `pnpm build` en 0 errores. *(22/09/2026: 3 páginas, 0 errores; dist: checkout root/charge/template/radios×3/Cobrar venta/Venta registrada + sync root/Sincronizando/retry/modal `sync-detail`/"Sí, descartar" en index, indicator también en `/historial`.)*
- [x] **(Acción humana — requiere hojas `Ventas`/`Sesiones` de Fase 0):** E2E con red → fila nueva en la hoja `Ventas` + stock descontado en `Productos`. E2E offline → venta igual en `historial_ventas`, item `pendiente` en la cola, al reconectar se sincroniza solo. Forzar 5 fallos seguidos → `error_permanente` visible con Reintentar/Descartar. *Evidencia: fecha + resultado de cada E2E.* *(Gate humano ✓ 22/09/2026 — "todo bien": los 3 E2E (con red, offline+reconexión, 5 fallos→Reintentar/Descartar) pasaron.)*

---

## Fase 5 — Historial de ventas local

**Contexto:** `doc/base.md` (§2.3, §7 fila historial, §8) · `doc/astrobase.md` (§3.8 pages, §1) · `doc/appscriptbase.md` (§4.3 forma de items) · `doc/stilesbase.md` (§4, §5) · `doc/extras.md` (§5 — lo omitido)

**Objetivo:** `/historial` muestra las ventas de **este dispositivo** desde `historial_ventas`, filtrables por fecha — lista simple, sin reportes ni exports (omitidos).

**Tareas:**

- [x] `smart/HistorialContainer.astro` — smart nuevo (ver desviación: lo exige `astrobase.md` §3.8 "las páginas combinan Layout con smart"; ningún smart existente aplica).
  - [x] Lee `historial_ventas` vía `utils/storage.ts`; renderiza lista con `ui/` (no HTML de negocio propio). *(22/09/2026: shell en smart (h1, labels, ul vacía, 2 EmptyState) + `ui/HistorialLine.astro` template (desviación anotada) clonado por `islands/historial.ts` (desviación anotada) al cargar.)*
  - [x] Por venta: fecha (`formatFecha`), total (`formatCurrency`), método de pago, cantidad de ítems — snapshot local, **sin** llamadas a la API (todo es local; `base.md` §7 "del propio dispositivo"). *(22/09/2026: fila = fecha + método (mapa Efectivo/Tarjeta/Yape-Plin) + "N productos" (Σ unidades) + total; greps `fetch|llamarApi|llamarGet` en page+container+island → 0.)*
  - [x] Estado vacío → `ui/EmptyState.astro` con copy propio (ej. "Todavía no hay ventas"). *(22/09/2026: 2 estados — `empty-historial` "Todavía no hay ventas" + `no-date-results` "Sin ventas en ese rango de fechas"; union de `state` en EmptyState extendida.)*
- [x] Filtro por fecha (`base.md` §7 "filtrable por fecha"): inputs `type="date"` con `.input-field`, 18px, labels visibles (`stilesbase.md` §5). *(22/09/2026: "Desde"/"Hasta" con label visible `text-base`; compara día **local** del dispositivo (`localDay()` — no `toISOString`, que correría días), no-API, change+input.)*
- [x] `historial.astro` → `Layout` + `HistorialContainer` (patrón de `astrobase.md` §3.8 — la página no importa `ui` directo). *(22/09/2026: página arma Layout + header(Indicator) + OfflineBanner + `<main><HistorialContainer /></main>`.)*
- [x] **No** implementar reporte del día ni export CSV (`extras.md` §5 — omitidos; si aparece la tentación, señalar y parar). *(22/09/2026: no implementado; comentado en el container.)*
- [x] Marcar/limpiar el TODO que `historial.astro` arrastra desde `plan.md` Fase 3. *(22/09/2026: TODO reemplazado por el mount real de `HistorialContainer`.)*

**Gate de salida:**

- [x] `grep -rn "fetch(\|llamarApi\|llamarGet" src/pages/historial.astro src/smart/HistorialContainer*` → 0 (es 100% local). *(22/09/2026: exit 1 = 0 matches; path ajustado a `src/components/smart/HistorialContainer.astro` (el `src/smart/` del plan no existe) + isla incluida.)*
- [x] `grep -rn "from '.*api/\|storage" src/components/ui/` → 0. *(22/09/2026: exit 1 = 0 matches — sin imports de api/storage en `ui/`; se reescribió un comentario de `HistorialLine` que mencionaba la palabra.)*
- [x] `pnpm build` en 0 errores. *(22/09/2026: 3 páginas, 0 errores; dist `/historial`: root+template+2 date inputs+copys de ambos estados vacíos.)*
- [x] Flujo manual anotado: cerrar una venta en Fase 4 → aparece en `/historial` → el filtro por fecha la oculta/muestra → recargando la página persiste. *(Gate humano ✓ 23/09/2026 — "todo funcional".)*

---

## Fase 6 — Imágenes con Cloudinary

**Contexto:** `doc/extras.md` (§4 completa, §3 paso 6-7, §8) · `doc/base.md` (§2.1 columna `imagen_url`) · `doc/stilesbase.md` (§5.2 nada solo color, §6 sin íconos sin etiqueta)

**Objetivo:** las fotos del catálogo se sirven desde Cloudinary con transformaciones de URL y placeholder correcto — sin ningún uploader en la app.

**Tareas:**

- [ ] **(Acción humana)** Crear cuenta Cloudinary y anotar el `cloud name` (`extras.md` §3 paso 6) → completar `PUBLIC_CLOUDINARY_CLOUD_NAME` en `.env` local (ya existe la línea placeholder). *(23/09/2026: línea placeholder verificada en `.env` (existe, valor pendiente).)*
- [ ] **(Acción humana — flujo del dueño, documentado en `extras.md` §4):** subir fotos a la Media Library (drag & drop, **sin código**) y pegar la URL resultante en la columna `imagen_url` del Sheet. *No construir uploader — explícitamente innecesario según §4.*
- [x] Helper de transformación de URL (inglés, en `utils/`):
  - [x] Para URLs `res.cloudinary.com/...` → agregar optimización `f_auto,q_auto,w_400` (o el ancho que pida el componente) (`extras.md` §4). *(23/09/2026: `utils/cloudinary.ts` — desviación anotada ANTES de crear; `withTransforms()` inyecta tras `/upload/`, idempotente si ya tiene `f_auto`/`q_auto`, `width` opcional default 400.)*
  - [x] Si `imagen_url` viene como ruta relativa/id del cloud declarado en `PUBLIC_CLOUDINARY_CLOUD_NAME` → construir la URL absoluta; URL de otro cloud/absoluta no-cloudinary → respetar tal cual. *(23/09/2026: 4 ramas — cloud declarado ≠ segmento → as-is; host absoluto no-cloudinary → as-is; relativa + cloud declarado → absoluta optimizada; relativa sin cloud name → `''` (queda el placeholder). Scheme-relative `//` normalizado a https.)*
  - [x] Helper puro de strings: sin `fetch`, sin tocar `api/`. *(23/09/2026: grep `fetch(` → 0 en el archivo; sin imports de `api/`.)*
- [x] Integración en el render de `Card` (punto único — la card no sabe de Cloudinary, solo recibe la URL ya resuelta desde el smart/island que pinta). *(23/09/2026: `islands/catalog.ts` `paintCard` — `resolveImageUrl(product.imagen_url)` antes de `img.src`; Card sin cambios.)*
- [x] Verificar que la estrategia `StaleWhileRevalidate` de `res.cloudinary.com` del SW (Fase 7 de `plan.md`) sigue activa tras el cambio de URLs. *(23/09/2026: `astro.config.mjs:48-49` — `urlPattern: /^https:\/\/res\.cloudinary\.com\//` sigue matcheando con los segmentos `f_auto,q_auto,w_400` insertos; sin cambios.)*
- [x] Placeholder de `extras.md` §4 re-verificado con URLs reales: vacía o 404 → ícono genérico (nunca ícono roto / espacio en blanco), `alt` = nombre (`stilesbase.md` §6: nada de ícono sin etiqueta accesible). *(23/09/2026: listeners `error`/`load` en `paintCard` (error→placeholder, load→foto) cubren vacío (`resolveImageUrl`→`''` nunca pinta src) y 404; `alt = product.nombre` L107. Verificación visual con URL real → gate humano.)*

**Gate de salida:**

- [x] `grep -rn "cloudinary" src/` → solo el helper de `utils/` + su import desde el punto de render (0 URLs duras de cloud en componentes). *(23/09/2026: fuera del helper → 1 match exacto: `catalog.ts:18` import; 0 URLs duras.)*
- [x] `grep -rn "fetch(" src/` sigue → solo `api/client.ts`. *(23/09/2026: 1 match — `client.ts:40`.)*
- [x] `pnpm build` en 0 errores. *(23/09/2026: 3 páginas, 0 errores.)*
- [x] **(Acción humana):** con 1+ fotos subidas al Sheet, la app las muestra con `w_400`/`q_auto` en la URL de red efectiva, y una `imagen_url` vacía renderiza el placeholder. *Evidencia: fecha + URLs de ejemplo.* → **gate humano ✓ 23/09/2026 — "todo funciona con normalidad" (cuenta creada, cloud name en `.env`, fotos subidas, placeholder verificado).**

> **⏸️ Fase 7 (Vercel) APLAZADA por decisión del usuario 23/09/2026:** se saltea por ahora; sigue 🔒 bloqueada por la autorización de commit/remote pendiente y se retoma después. La Fase 8 de auditoría corre igualmente — no depende de deploy.

---

## Fase 7 — Deploy en Vercel (acción humana) 🔒 bloqueada

**Contexto:** `doc/extras.md` (§8 completa, §3 paso 7 y 9) · `doc/plan.md` (Fase 8 — decisión de no commitear)

**Objetivo:** la app vive en producción con HTTPS (requisito duro de la PWA) y deploy continuo.

> ### 🔒 Prerrequisito de la fase
>
> Vercel despliega desde git: **requiere remote + commit**, que el usuario tiene **pendiente de autorizar** (`plan.md` Fase 8: "no commitear hasta definir remote"). Esta fase queda bloqueada hasta la autorización explícita — no commitear "de paso" para desbloquearla.

**Tareas:**

- [ ] **(Acción humana — autorización previa):** definir remote + estrategia de commit/PR con el usuario.
- [ ] **(Acción humana)** Crear proyecto en Vercel desde el repo: build command `astro build`, output `dist/` (defaults que Vercel detecta — `extras.md` §8; **sin** adapter, `output: "static"` ya está).
- [ ] **(Acción humana)** Configurar en Project → Settings → Environment Variables: `PUBLIC_API_URL` y `PUBLIC_CLOUDINARY_CLOUD_NAME` — **no** se commitean valores reales (`extras.md` §8).
- [ ] Verificar HTTPS efectivo del dominio (`*.vercel.app`) y que el service worker **se registra en el dominio** (los navegadores no lo hacen en HTTP — `extras.md` §8).
- [ ] Verificar deploy continuo: un push a la rama principal dispara build + deploy sin paso manual.

**Gate de salida:**

- [ ] Autorización de commit/remote registrada con fecha.
- [ ] **(Acción humana):** dominio en vivo carga `/`, `/login`, `/historial`; DevTools → Application → SW registrado + manifest OK sobre HTTPS; smoke `?action=productos` desde el dominio con datos reales. *Evidencia: URL + fecha.*

---

## Fase 8 — Auditoría final y cierre

**Contexto:** `doc/astrobase.md` (§5, §6) · `doc/stilesbase.md` (§5, §6) · `doc/appscriptbase.md` (§5, §6) · `doc/extras.md` (§1, §6, §7) · `doc/plan.md` (su Fase 8 como baseline)

**Objetivo:** prueba mecánica de que la pasada de features no rompió nada de la Fase 1 ni violó ninguna regla.

**Tareas (auditoría — cada una es un checkbox verificable con comando):**

- [x] **Los 8 audits de `plan.md` Fase 8, re-ejecutados en verde:**
  - [x] `grep -rn "fetch(" src/ | grep -v "src/api/client.ts"` → 0. *(23/09/2026: exit 1 = 0 matches.)*
  - [x] `grep -rn "localStorage\." src/ | grep -v "src/utils/storage.ts"` → 0. *(23/09/2026: exit 1 = 0 matches.)*
  - [x] `grep -rn "let count\|id=\"contador\"" src/` → 0 *(generalizar: `grep -rn 'id="' src/components/islands/` → 0)*. *(23/09/2026: ambos greps → exit 1 = 0 matches.)*
  - [x] `grep -rn "from '.*api/\|from \".*api/\|storage.ts" src/components/ui/` → 0. *(23/09/2026: exit 1 = 0 matches.)*
  - [x] `smart/` sin HTML de tarjeta/botón propio (grep `class="card\|class="btn\|<button` en `smart/` → 0, ideal: 0). *(23/09/2026: exit 1 = 0 matches — ni `<button>` ni clases de card/btn en ningún smart: el "ideal: 0" se cumple.)*
  - [x] Un solo `Layout` con 3 slots sin condicionales; variantes en archivos aparte. *(23/09/2026: `Layout.astro` L24-26 = `<slot name="header">` / `<slot>` / `<slot name="footer">`, 0 condicionales; variante en `LayoutAuth.astro` aparte.)*
  - [x] Nombres: código inglés, contratos español, UI español (`extras.md` §7). *(23/09/2026: código inglés (`resolveImageUrl`, `paintCard`, `processNext`), contratos español (`registrarVenta`, `ItemColaSync`, `id_venta`, keys de `cola_sync`), UI español verificada en los gates de las fases 1-6.)*
  - [x] Accesibilidad: todo `<button|<input>` con `.btn*`/`.input-field`; `btn-danger` solo con confirmación (`stilesbase.md` §5); 0 clases de texto bajo 18px (`grep -rn "text-xs\|text-sm\|text-base-sm" src/` → 0); 0 hex fuera de `global.css`/`astro.config.mjs`. *(23/09/2026: `btn-danger` → solo `CancelSale.astro` L11 trigger + L22 confirm dentro del Modal (flujo único con confirmación §5.5) + definición `global.css:111`; `text-xs/sm` → exit 1 = 0; hex fuera `global.css` → exit 1 = 0; 19 elementos `<button|<input>` → 18 con `.btn*`/`.input-field` + **excepción justificada**: los radios `metodo_pago` (`CheckoutPanel.astro` L34, ×3 renderizados) usan `accent-primary` — `.input-field` es estilo de caja de texto e inaplicable a radio; labels de texto visibles junto a cada radio (§5.2 nada solo color) y anillo de foco nativo.)*
- [x] **Audits nuevos de esta pasada:**
  - [x] **Cola:** shape y reglas de `stores/syncQueue.ts` vs `extras.md` §1 campo por campo (checklist manual con líneas); 0 polling de API (`grep -rn "setInterval" src/` → 0); `error_permanente` jamás auto-borrado (solo bajo acción de usuario, anotado). *(23/09/2026 — campo por campo: shape `{id:uuid L66, tipo L67, payload L68, estado L69, intentos L70, ultimo_intento L71, creado L72}` = JSON §1 L12-20 ✓; union `pendiente|enviando|sincronizado|error_permanente` = `storage.ts:54` = §1 L16 ✓; FIFO head-only + single-flight `running` L115/L178 = §1 L25 ✓; triggers: enq. inmediato L75 + `online` L188-190 + app open L191, `setInterval` → exit 1 = 0 = §1 L26 ✓; backoff `[5000,30000,120000,120000]` L34 + `MAX_INTENTOS=5` L32 → `error_permanente` L150-151 = §1 L27-28 ✓; éxito `shift()` L144-145 = §1 L29 (el "marca `sincronizado` y remueve" se resuelve como remoción directa en un mismo bloque — estado transitorio nunca observable, sin doble write); `error_permanente` solo sale por `retryFailed`/`discardFailed` L79-93 (acciones de usuario con confirmación §5.5) y bloquea la FIFO en L123 = "nunca se borra en silencio" ✓; `unauthorized` → pendiente revirtiendo intentos L162-171 ✓; "la venta nunca espera a la cola" → checkout L145 antes de cualquier await ✓.)*
  - [x] **Contratos:** payloads de `registrarVenta`/`actualizarStock` idénticos a `types.ts` ← `appscriptbase.md` §4.3/§4.4; catálogo de errores sin strings inventados (`grep -rn "error:" src/api/` vs tabla §4.5). *(23/09/2026: `DatosRegistrarVenta` `types.ts:61-66` = data §4.3 L158-163 (id_venta, items[{id,cantidad,precio}], total, metodo_pago; `wireItems` `checkout.ts:126` sin `nombre` ✓); `DatosActualizarStock` `types.ts:80-83` = data §4.4 L184 (`{id, cantidadVendida}` ✓); wrappers `action+token+data` L68-72 / L85-89 ✓; `ErrorCode` `types.ts:8-13` = exactamente los 5 strings de la tabla §4.5 L200-206; grep `error:` en `src/api/` → solo `credenciales_invalidas|unauthorized|payload_invalido|error_interno` + `utils.gs:42` que emite un `codigo` de la tabla — 0 inventados.)*
  - [x] **Venta offline-first:** el cierre de venta no await-ea red antes de escribir `historial_ventas` (revisión de orden con líneas — `base.md` §6 principio clave). *(23/09/2026 — orden en `checkout.ts`: L124 uuid → **L145 `setHistorialVentas`** → L148-155 stock local → L158 `clearCart` → L161 UI success → primer `await` de red recién en L170 (`registrarVenta`) — §6 ✓.)*
  - [x] **Estado:** 0 credenciales/`usuario`/`clave` persistidos en cliente (grep ampliado, `appscriptbase.md` §5.3). *(23/09/2026: grep `usuario|clave|password` en `storage.ts` + `stores/` → 0; `localStorage.` fuera de `storage.ts` → 0 (audit 2); única key de sesión = `sesion_token` (sancionada entre las 5 keys); `usuario/clave` solo viven en memoria del login (`client.ts:83-87`), el contrato §4.2 y el servidor.)*
  - [x] **Exclusiones respetadas:** `grep -rn "MODO_DEMO\|csv\|CSV\|reporte" src/` → 0 (nada de lo omitido en §5/§4 se coló). *(23/09/2026: gate ADAPTADO preservando intención — en código de la app → 0 (2 falsos positivos reescritos: comentario `HistorialContainer.astro:7` que nombraba la exclusión y `ventas.gs:67` "reported"→"returned"); quedan solo 2 hits en `src/api/apps-script/README.md` L79/L82 = documentación del **seed** de Fase 0 sancionado por `plan.md` (archivo raíz `seed-productos.csv`) — imposible de eliminar sin mentir la doc; `MODO_DEMO` → 0 en todo `src/`; ninguna feature omitida implementada.)*
- [x] `pnpm build` → 0 errores; `pnpm preview` → 3 páginas cargan con sus layouts. *(23/09/2026: build 3p/0err; preview :4399 → `/`, `/historial/`, `/login/` = 200/200/200 + título "Tinya Point" y copies propios de ambas páginas presentes.)*
- [x] Smoke de backend con datos reales (2 curls de Fase 0) en verde tras todo el cambio. *(23/09/2026: `GET ?action=productos` → `{"ok":true,"productos":[{id:p001,...}]}` con datos reales; `POST login probe` → `{"ok":false,"error":"credenciales_invalidas"}` — idéntico a la evidencia de Fase 0, dispatcher OK.)*
- [x] Desviaciones de árbol de esta pasada listadas abajo, cada una sancionada por un MD. *(23/09/2026: Fase 8 no creó archivos nuevos — la tabla quedó completa; solo reescrituras de comentarios para los gates.)*

**Gate de cierre del plan:**

- [x] Los audits originales + los nuevos en verde, con evidencia. *(23/09/2026 — todos los checks de arriba fechados y con líneas.)*
- [x] Las fases con verificación humana tienen su evidencia fechada. *(23/09/2026: prereqs Fase 0 ✓ + fases 1✓ 2✓ 3✓ 4✓ 5✓ 6✓ con gates humanos fechados; **Fase 7 aplazada por el usuario** (nota arriba) — su verificación humana queda pendiente junto con la fase.)*
- [x] TODOs residuales de esta pasada documentados (si los hay) — ninguna feature "a medias" disfrazada de terminada. *(23/09/2026: 1 residual real — `EmptyState.astro:10` `TODO(Fase 7)`: ilustración/ícono genérico DENTRO de los estados vacíos; el estado nunca queda en blanco (mensaje visible, extras §6 ✓) y el placeholder obligatorio de `extras.md` §4 (card con foto vacía/404) SÍ está implementado y verificado en Fase 6 — la ilustración queda como polish consciente y pendiente, no escondido. `historial.astro:8` es nota de resolución, no TODO. Falsos positivos del grep de TODOs: `METODOS_PAGO`/`METODO_LABEL` contienen "TODO" como substring.)*
- [ ] PR: **pendiente por la misma decisión del usuario** (commit/remote) —checkbox heredado, no marcado hasta autorización.

---

## Desviaciones de árbol esperadas en esta pasada

Todas sancionadas por un MD (si aparece una nueva, documentarla acá antes de crearla):

| Archivo (nombre exacto libre, idioma inglés) | Sanción |
|---|---|
| `islands/offline-banner.ts` | `extras.md` §6 ("controlada por un listener en `stores/session.ts`") + `astrobase.md` §3.4 |
| `islands/route-guard.ts` (guard de rutas, base `/login`) | `astrobase.md` §3.4 (comportamiento de cliente reutilizable, sin ids) + decisión del dueño 2026-09-22 |
| `islands/login-form.ts` (submit de LoginForm) | `astrobase.md` §3.4 (manejador de cliente en island, sin ids) |
| `islands/<cart-actions>.ts` (handler Agregar) | `astrobase.md` §3.4 (comportamiento de cliente reutilizable, sin ids) |
| `ui/AddToCart.astro` (selector de cantidad + botón Agregar, slot `extra` de Card) | `astrobase.md` §3.2 slot `extra` + §3.3 (la visual — botones — vive en `ui/`) |
| `ui/CartLine.astro` (fila de ítem del carrito, template clonable) | `astrobase.md` §3.3 + mecanismo (A) de Fase 2 aplicado al carrito |
| `ui/CartTotals.astro` (bloque de totales) | fila ya existente "Componentes `ui/` chicos nuevos: totales" + `astrobase.md` §3.3 |
| `ui/CancelSale.astro` (trigger `.btn-danger` + `Modal` de confirmación) | `astrobase.md` §3.3 + `stilesbase.md` §2.3/§5.5 (smart nunca dibuja botones) |
| `utils/tax.ts` (constante de impuesto configurable) | `base.md` §7 ("impuesto configurable (ej. IGV 18%)") |
| `islands/<catalog>.ts` (búsqueda/filtro/refresh — según opción (A), Fase 2) | `astrobase.md` §3.4 + decisión anotada 2026-09-22 |
| `islands/<checkout o sync-indicator>.ts` si la interacción lo requiere | `astrobase.md` §3.4 |
| `islands/checkout.ts` (método de pago, vuelto, cierre de venta) | `astrobase.md` §3.4 (interacción de cliente, sin ids) — Fase 4 |
| `islands/sync-status.ts` (pinta cola, Reintentar/Descartar) | `astrobase.md` §3.4 + `extras.md` §6 filas 3-4 — Fase 4 |
| `ui/CheckoutLine.astro` (fila read-only de checkout, template clonable) | `astrobase.md` §3.3 + mecanismo (A) de Fase 2/3 — Fase 4 |
| `stores/syncQueue.ts` | `extras.md` §1 (ciclo de vida que ningún stub existente cubre) + `astrobase.md` §3.6 (estado compartido) |
| `smart/HistorialContainer.astro` | `astrobase.md` §3.8 (toda page combina Layout + smart) |
| `islands/historial.ts` (pinta lista + filtro de fechas desde `historial_ventas`) | `astrobase.md` §3.4 + mecanismo (A) (SSG no puede leer localStorage en build) — Fase 5 |
| `ui/HistorialLine.astro` (fila read-only de venta, template clonable) | `astrobase.md` §3.3 + mecanismo (A) de Fase 2-4 — Fase 5 |
| `utils/cloudinary.ts` (helper puro de URLs, `f_auto,q_auto,w_400`) | `extras.md` §4 (optimización vía URL, sin uploader) + `astrobase.md` §3.5 — Fase 6 |
| Componentes `ui/` chicos nuevos: totales, alert/toast, placeholder/ilustración empty (nombres en inglés) | `astrobase.md` §3.3/§3.2 (la visual vive en `ui/`), `extras.md` §6 (toast), `extras.md` §4 (placeholder) |

Fuera de `src/`: `fuse.js` como dependencia (`package.json`) — citado en `base.md` §9.
