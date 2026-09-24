# Plan: reorganización de `src/components/islands/` (Opción C)

> **Audiencia:** agente ejecutor. Este documento es un plan operativo, no una discusión.
> **Objetivo:** reducir duplicación y mejorar legibilidad de las 19 islas (~4.000 líneas)
> mediante (1) una capa de utilidades SRP y (2) carpetas por feature. **Cero cambio de
> comportamiento.** Cada fase es un work-unit independiente con gate de verificación.
> **Estrategia de entrega:** `delivery_strategy: single-pr` (refactor sin cambios de
> funcionalidad; si el forecast supera 400 líneas cambiar a cadena — ver Fase 6).

---

## 0. Contexto para el agente

- **Stack:** Astro 7 (`output: static`), TypeScript strict (`astro/tsconfigs/strict`), Tailwind 4, Fuse.js. Node ≥ 22.12.
- **Sin suite de tests ni linter.** La verificación es: `npm run build` + greps estructurales + smoke manual (Fase 5).
- **Las islas se importan como side-effect scripts** desde `<script>` en `.astro`
  (layouts, pages y smart containers). Mover un archivo **exige** actualizar esos imports.
- **Convención del proyecto (obligatoria, ver `doc/astrobase.md` §3.4/§3.5):**
  - Hooks `data-*` únicos, **nunca ids fijos**, **nunca globals**.
  - Escritura de usuario/texto siempre vía `textContent`, **jamás `innerHTML`**.
  - Visibilidad vía atributo `hidden` (o `data-*` cuando el breakpoint CSS decide), **no toggling de clases** para estado.
  - Delegación de eventos (`closest()` + listener único en el contenedor).
  - Estado local primero (`utils/storage.ts`, `stores/*`), red después.
- **Archivos de contrato a respetar:** `doc/astrobase.md`, `doc/data-hooks.md` (lista de hooks), `doc/stilesbase.md` §5.7 (copy español, nunca códigos crudos).

### Invariantes de este refactor (NO violar)

1. Ningún selector `data-*` cambia de nombre. Ningún hook se renombra.
2. Ninguna isla cambia su lógica de negocio (validación, órdenes de sync, cola, storage).
3. Los comentarios que explican **por qué** se conservan; solo se actualiza la ruta si el archivo se mueve.
4. Un solo archivo se modifica por commit dentro de una fase de adopción (bisectable).
5. No se introducen dependencias nuevas.
6. No se crean clases con estado compartido entre islas (decisión Opción C: funciones SRP).

---

## Inventario de duplicación (hallazgos verificados, base del plan)

| # | Duplicación | Archivos afectados |
|---|---|---|
| D1 | Boilerplate `document.querySelector<T>('[data-x-root]')` + `if (root) {…}` y consultas descendentes (~150+) | todas |
| D2 | `mostrarOk` / `mostrarError` / `ocultarAlertas` | ajustes, caja, categorias-admin, product-admin, stock |
| D3 | `mensajeDeError` (switch con `payload_invalido` / `accion_no_soportada` / default) | caja, categorias-admin, product-admin, stock |
| D4 | `debeEncolar` / `shouldEnqueue` (network_failure/unauthorized → cola) | caja, checkout |
| D5 | `setStale` + `refreshFromApi` (cache-first + "actualizado hace X min") | catalog, stock |
| D6 | Clonado de `<template>` (`content.firstElementChild.cloneNode`) | catalog, cart-actions, categorias-admin, product-admin, stock, historial, venta-detail, caja |
| D7 | Visibilidad de pills por atributo (`pill.hidden = attr !== estado`) | caja, historial, venta-detail |
| D8 | Selección exclusiva de chips (`aria-pressed`) | catalog, historial, product-admin, stock |
| D9 | Debounce 200 ms de búsqueda | catalog, historial, product-admin |
| D10 | Guard de reentrada + pending state en botón (`enviando`, "Guardando…") | login-form, ajustes, categorias-admin, product-admin, caja, stock |
| D11 | `round2` re-implementado como `money()` local | checkout (existe en `utils/caja.ts`) |
| D12 | `METODO_LABEL` (Record) | historial, venta-detail |
| D13 | `matchMedia('(min-width: 768px)')` | catalog, checkout, historial, sidebar |
| D14 | Pintado de StatCard (`[data-stat-value]` / `[data-stat-sub]`) | caja (`pintarStat`), historial (`setValor`), stock (`pintarStat`) |

---

## Fase 0 — Baseline e invariantes

**Objetivo:** tener un punto de referencia verificado antes de tocar nada.

- [ ] 0.1 Ejecutar `npm run build` y confirmar que pasa. Si FALLA, detener: el baseline está roto, reportar y no continuar.
- [ ] 0.2 Registrar el inventario de partida (guardar salida como referencia):
  - [ ] `rg -c "querySelector" src/components/islands/` (total por archivo).
  - [ ] `rg -l "mostrarOk|mostrarError" src/components/islands/`.
  - [ ] `rg -l "shouldEnqueue|debeEncolar" src/components/islands/`.
- [ ] 0.3 Confirmar que `src/utils/dom.ts` existe (11 líneas, solo lo usa `cart-actions.ts`) — será el núcleo expandido.
- [ ] 0.4 No crear commits en esta fase (solo verificación).

**Gate Fase 0:** build verde + inventario registrado. Sin gate → no avanzar.

---

## Fase 1 — Capa utilitaria (crear utilidades, NO tocar islas aún)

**Objetivo:** crear las utilidades SRP en `src/utils/`. Riesgo cero: nada las importa todavía.
**Regla:** funciones y factories ligeras, **no clases con estado de dominio**. Cero dependencias nuevas.

### 1A. `src/utils/dom.ts` (extender el existente; conservar `closestAncestor` y `closestCard`)

- [ ] 1.1 `qs<T extends Element>(scope: ParentNode, selector: string): T | null` — querySelector tipado sin repetir `<T>` en cada llamada.
- [ ] 1.2 `qsa<T extends Element>(scope: ParentNode, selector: string): T[]` — querySelectorAll → array (facilita for-of/loops).
- [ ] 1.3 `setText(el: HTMLElement | null | undefined, text: string): void` — no-op si `el` es null (elimina los ~cientos de `if (el) el.textContent = …`).
- [ ] 1.4 `setHidden(el: Element | null | undefined, hidden: boolean): void` — no-op si null (elimina `if (el) el.hidden = …`).
- [ ] 1.5 `setPillState(scope: ParentNode, attr: string, active: string): void` — itera `[attr]` dentro de `scope` y aplica `el.hidden = getAttribute(attr) !== active` (D7: caja, historial, venta-detail).
- [ ] 1.6 `cloneTemplate(tpl: HTMLTemplateElement | null): HTMLElement | null` — `content.firstElementChild?.cloneNode(true)` con null-safe (D6: 8 islas).
- [ ] 1.7 `selectChip(group: ParentNode, attr: string, value: string): void` — pone `aria-pressed="true"` solo en el chip cuyo atributo `attr` === `value`, resto `"false"` (D8: catalog, historial, product-admin, stock).
- [ ] 1.8 `paintStat(card: HTMLElement | null, valor: string, sub?: string): void` — pinta `[data-stat-value]`; si `sub !== undefined` pinta `[data-stat-sub]` y alterna su `hidden` según sub vacío (D14: lógica ya existe en `caja.ts:162-175`, tomarla como referencia).
- [ ] 1.9 `debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void` — D9.

### 1B. `src/utils/feedback.ts` (nuevo)

- [ ] 1.10 `crearFeedback(alertEl: HTMLElement | null, textEl: HTMLElement | null)` → `{ ok(mensaje: string): void; error(mensaje: string): void; ocultar(): void }`.
  - `ok`: `mostrarToast(mensaje)` + `alertEl.hidden = true`.
  - `error`: `textEl.textContent = mensaje` + `alertEl.hidden = false`.
  - `ocultar`: `alertEl.hidden = true`.
  - Comportamiento de referencia: `ajustes.ts:51-61`, `caja.ts:126-147` (caja tiene variantes — ver 1B-nota).

> **Nota 1B:** `caja.ts` maneja tres alertas (error/cierre/aviso) y `product-admin.ts` dos (página/form). Esas islas usarán **una instancia por alerta** (`feedbackError`, `feedbackCierre`…) en vez de una sola. No generalizar más allá de eso.

### 1C. `src/utils/api-result.ts` (nuevo)

- [ ] 1.11 `debeEncolar(result: { status: string; error?: string }): boolean` — exactamente la lógica de `caja.ts:311-316` / `checkout.ts:231-233` (D4).
- [ ] 1.12 `mensajeDeErrorApi(error: string, opciones: { payloadInvalido: string; fallback: string }): string` — centraliza el case `accion_no_soportada` (copy idéntico en 4 islas: "El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script."), devuelve `payloadInvalido` para `payload_invalido` y `fallback` para el resto (D3). El copy por isla sigue viviendo en la isla.

### 1D. `src/utils/catalog-cache.ts` (nuevo)

- [ ] 1.13 `refreshCatalogoFromApi(): Promise<boolean>` — extraer el cuerpo idéntico de `catalog.ts:265-289` y `stock.ts:330-355` (map a `CatalogoCache`, `setCatalogoCache`, devuelve `true` en éxito) (D5). **Atención:** el manejo de fallback/stale difiere entre islas; solo extraer lo idéntico (fetch + map + setCache + flag). El llamador conserva su lógica de `setStale`.
- [ ] 1.14 `minutosDesde(timestamp: number): number` — `Math.max(1, Math.round((Date.now() - timestamp) / 60_000))` (base común de `setStale` en ambas islas).

### 1E. `src/utils/media.ts` (nuevo)

- [ ] 1.15 `esDesktop(): boolean` y `enCambioDesktop(cb: (matches: boolean) => void): void` — envuelven `matchMedia('(min-width: 768px)')` (D13: catalog, checkout, historial, sidebar).

### 1F. `src/utils/pending-button.ts` (nuevo)

- [ ] 1.16 `crearPendingButton(btn: HTMLButtonElement | null, textoPendiente: string)` → `{ iniciar(): boolean; finalizar(): void }`.
  - `iniciar()`: devuelve `false` si ya está en vuelo; si no, `btn.disabled = true`, `btn.textContent = textoPendiente`, marca flag interno.
  - `finalizar()`: `btn.disabled = false` y restaura el `textContent` original capturado al crear la factory.
  - Cubre D10. El flag de reentrada de **requests** (`enviando`) puede vivir dentro de la factory (es el mismo concepto) — decidir en la adopción por isla, sin cambiar comportamiento.

### 1G. `src/utils/metodos.ts` (nuevo)

- [ ] 1.17 Exportar `METODO_LABEL: Record<MetodoPago, string>` y `METODOS: readonly MetodoPago[]` — copiar la definición de `historial.ts:50-55` (D12).

**Gate Fase 1:** `npm run build` en verde. Ningún archivo de `islands/` modificado (grep: `git diff --stat src/components/islands/` vacío).
**Commit sugerido:** `refactor(utils): add SRP dom/feedback/api-result/cache/media/pending helpers`

---

## Fase 2 — Adopción mecánica de utilidades DOM (isla por isla)

**Objetivo:** reemplazar los patrones D1/D2/D6/D7/D8/D9/D13/D14 por helpers de la Fase 1.
**Orden:** de menor a mayor riesgo (archivos chicos primero). **Un archivo = un commit** (invariante 4).
**Regla por archivo:** tras editar, releer el diff completo y verificar que solo cambió la mecánica, no la lógica.

Orden de ejecución (checkboxes en orden):

- [ ] 2.1 `caja-status.ts` (27 líneas) — `qs`/`setText`/`setHidden`.
- [ ] 2.2 `stock-badge.ts` (27) — ídem.
- [ ] 2.3 `offline-banner.ts` (18) — `setHidden`.
- [ ] 2.4 `cart-badge.ts` (36) — `qs`/`qsa`/`setText`/`setHidden`.
- [ ] 2.5 `sync-status.ts` (63) — `qs`/`setText`/`setHidden`.
- [ ] 2.6 `route-guard.ts` (19) — sin cambios DOM; revisar y marcar N/A si no aplica.
- [ ] 2.7 `modal-controller.ts` (28) — `qs`/`setPillState` no aplica; solo `qs`.
- [ ] 2.8 `login-form.ts` (113) — `crearFeedback` no aplica (patrón propio `showError`); usar `qs`/`setText`/`setHidden`/`crearPendingButton` donde calce sin cambiar copy ni foco.
- [ ] 2.9 `sidebar.ts` (120) — `qs`/`qsa`/`esDesktop`; conservar tabs/indentación existentes por archivo.
- [ ] 2.10 `venta-detail.ts` (121) — `qs`/`cloneTemplate`/`setPillState` (D7).
- [ ] 2.11 `cart-actions.ts` (166) — `qs`/`cloneTemplate`/`setText`/`setHidden`.
- [ ] 2.12 `ajustes.ts` (226) — `qs`/`setText`/`setHidden`/`crearFeedback`/`crearPendingButton` (D2, D10).
- [ ] 2.13 `categorias-admin.ts` (314) — `qs`/`cloneTemplate`/`selectChip` no aplica (no tiene chips)/`crearFeedback`/`crearPendingButton`/`debounce` no aplica (sin búsqueda).
- [ ] 2.14 `stock.ts` (386) — `qs`/`cloneTemplate`/`selectChip` (D8)/`paintStat` (D14)/`crearFeedback`/`crearPendingButton`/`minutosDesde`.
- [ ] 2.15 `historial.ts` (388) — `qs`/`cloneTemplate`/`setPillState`/`selectChip`/`debounce`/`paintStat`/`esDesktop`/`METODO_LABEL` importado (1G).
- [ ] 2.16 `catalog.ts` (373) — `qs`/`cloneTemplate`/`selectChip`/`debounce`/`esDesktop`/`setHidden`/`setText`.
- [ ] 2.17 `checkout.ts` (311) — `qs`/`setHidden`/`setText`/`esDesktop`; **borrar `money()` local y usar `round2` de `utils/caja.ts`** (D11 — mismo `Math.round(x*100)/100`).
- [ ] 2.18 `caja.ts` (468) — `qs`/`cloneTemplate`/`setPillState`/`paintStat`/`crearFeedback` (instancias error/cierre)/`crearPendingButton`.
- [ ] 2.19 `product-admin.ts` (755) — `qs`/`cloneTemplate`/`selectChip`/`paintStat` no aplica (no usa StatCard)/`crearFeedback` (página + form)/`crearPendingButton`/`debounce`.

**Gate Fase 2:** para cada commit: `npm run build` verde.
**Gate global Fase 2:**
- [ ] 2.G1 `rg -c "if \([a-zA-Z]+\) [a-zA-Z]+\.textContent" src/components/islands/` → ~0 restantes.
- [ ] 2.G2 `rg -c "cloneNode" src/components/islands/` → solo `cloneTemplate` (o 0 llamadas directas).
- [ ] 2.G3 `git diff --stat src/components/islands/` revisado: solo mecánica, sin cambios de lógica.
- [ ] 2.G4 `npm run build` verde.
**Commit sugerido (uno por isla):** `refactor(islands): adopt dom/feedback helpers in <isla>`

---

## Fase 3 — Deduplicación de lógica de dominio

**Objetivo:** eliminar D2-completo, D3, D4, D5, D12 ya extraídos en Fase 1 — ahora conectando las islas a esas utilidades donde la Fase 2 no alcanzó, y unificando copias restantes.
**Riesgo medio:** toca lógica de decisión (cola de sync, errores, cache). Requiere lectura cuidadosa.

- [ ] 3.1 `caja.ts` + `checkout.ts`: reemplazar `debeEncolar`/`shouldEnqueue` locales por `debeEncolar` de `utils/api-result.ts` (D4). Verificar que `checkout.ts` reutiliza el helper **antes** de cada `enqueue` y en el loop de stock.
- [ ] 3.2 `caja.ts`, `categorias-admin.ts`, `product-admin.ts`, `stock.ts`: reemplazar switches `mensajeDeError` por `mensajeDeErrorApi(error, { payloadInvalido, fallback })`. El copy específico de cada dominio (`categoria_en_uso`, etc.) **queda como lookup local** antes de delegar. Texto de fallback por isla: conservar el actual, byte a byte.
- [ ] 3.3 `catalog.ts` + `stock.ts`: el fetch+map+`setCatalogoCache` pasa a `refreshCatalogoFromApi()` (D5). Cada isla conserva su `setStale`/pintado de fallback sobre el resultado.
- [ ] 3.4 `venta-detail.ts`: importar `METODO_LABEL` de `utils/metodos.ts`, borrar el Record local (D12). Verificar que el tipo `MetodoPago` cubre el acceso.
- [ ] 3.5 Búsqueda de restos: `rg -n "mostrarOk|mostrarError\b" src/components/islands/` → toda isla con `crearFeedback` no debe redefinirlas. Las que queden (por variantes propias justificadas) documentar con un comentario `// deviation: <motivo>`.
- [ ] 3.6 Verificar que **ningún** `messageDeErrorApi` perdió copy: diff de strings (`git diff -U0 | rg "^\+.*'No se|^\+.*Revis"`) — todo string nuevo debe ser idéntico al viejo salvo el centralizado `accion_no_soportada`.

**Gate Fase 3:**
- [ ] 3.G1 `rg -l "shouldEnqueue|function debeEncolar" src/components/islands/` → vacío (solo la importación de `utils/api-result.ts`).
- [ ] 3.G2 `npm run build` verde.
- [ ] 3.G3 Smoke razonado: leer `checkout.charge()` completo y confirmar orden idéntico de encolado (venta primero, stock por ítem, FIFO).
**Commit sugerido:** `refactor(islands): centralize enqueue decision, api error copy and catalog refresh`

---

## Fase 4 — Reorganización en carpetas por feature

**Objetivo:** agrupar por elemento/feature y separar controladores globales. **Solo `git mv` + actualizar imports** (ninguna lógica cambia).

### 4A. Estructura destino

```
src/components/islands/
├── cart/        cart-actions.ts, cart-badge.ts, checkout.ts      (ticket: TicketContainer)
├── caja/        caja.ts, caja-status.ts
├── stock/       stock.ts, stock-badge.ts
├── catalog/     catalog.ts
├── admin/       product-admin.ts, categorias-admin.ts
├── historial/   historial.ts, venta-detail.ts
├── settings/    ajustes.ts
└── runtime/     modal-controller.ts, route-guard.ts, offline-banner.ts,
                 sync-status.ts, sidebar.ts, login-form.ts
```

### 4B. Mover archivos

- [ ] 4.1 Crear directorios y ejecutar los `git mv` de 4A (19 archivos).

### 4C. Actualizar imports de entrada (mapa completo verificado — TODOS los puntos)

**Layouts:**
- [ ] 4.2 `src/layouts/Layout.astro` → `route-guard` (runtime)
- [ ] 4.3 `src/layouts/LayoutAuth.astro` → `route-guard` (runtime)
- [ ] 4.4 `src/layouts/LayoutApp.astro` → `route-guard`, `sidebar`, `stock-badge`, `modal-controller`, `sync-status`, `caja-status` (6 imports)

**Pages:**
- [ ] 4.5 `src/pages/index.astro` → `offline-banner`
- [ ] 4.6 `src/pages/caja.astro` → `offline-banner`
- [ ] 4.7 `src/pages/ajustes.astro` → `offline-banner`
- [ ] 4.8 `src/pages/stock.astro` → `offline-banner`
- [ ] 4.9 `src/pages/productos.astro` → `offline-banner`
- [ ] 4.10 `src/pages/categorias.astro` → `offline-banner`
- [ ] 4.11 `src/pages/historial.astro` → `offline-banner`
- [ ] 4.12 `src/pages/historial/venta.astro` → `offline-banner` (relativo `../../`)

**Smart containers:**
- [ ] 4.13 `smart/CajaContainer.astro` → `caja/caja`, `runtime/modal-controller`
- [ ] 4.14 `smart/CategoriaContainer.astro` → `admin/categorias-admin`, `runtime/modal-controller`
- [ ] 4.15 `smart/ProductContainer.astro` → `admin/product-admin`, `runtime/modal-controller`
- [ ] 4.16 `smart/StockContainer.astro` → `stock/stock`
- [ ] 4.17 `smart/HistorialContainer.astro` → `historial/historial`
- [ ] 4.18 `smart/VentaDetailContainer.astro` → `historial/venta-detail`
- [ ] 4.19 `smart/LoginForm.astro` → `runtime/login-form`
- [ ] 4.20 `smart/TicketContainer.astro` → `cart/cart-badge`, `cart/cart-actions`, `runtime/modal-controller`, `cart/checkout`
- [ ] 4.21 `smart/AjustesContainer.astro` → `settings/ajustes`
- [ ] 4.22 `smart/CatalogContainer.astro` → `catalog/catalog`

### 4D. Imports relativos internos entre islas

- [ ] 4.23 Las islas solo importan `../../api`, `../../utils`, `../../stores` → al bajar un nivel (subcarpeta) quedan `../../../api` etc. Corregir **cada** import en los 19 archivos (`rg "^import .*from '\.\./\.\./" src/components/islands/` y validar nivel).
- [ ] 4.24 Actualizar rutas en comentarios solo donde referencien el archivo movido (ej. `islands/caja.ts` → `islands/caja/caja.ts`) en los .astro tocados y en las propias islas. **No** reescribir docs históricos (`doc/*.md` de planes pasados se dejan como archivo histórico).

### 4E. Verificación de la reorganización

- [ ] 4.25 `rg -n "components/islands/[a-z-]+\.ts" src/` → 0 resultados (ninguna ruta plana residual).
- [ ] 4.26 `npm run build` verde (Vite falla si algún import quedó mal).
- [ ] 4.27 `git status` confirma 19 renames detectados como tal.

**Commit sugerido:** `refactor(islands): group files into feature folders`

---

## Fase 5 — Verificación final y smoke

**Objetivo:** probar que el comportamiento es idéntico al baseline. Sin suite de tests, el smoke es obligatorio.

- [ ] 5.1 `npm run build` → verde.
- [ ] 5.2 Smoke por página (`npm run dev` o `astro dev --background` y verificar):
  - [ ] 5.3 `/login`: login ok + error de credenciales + toggle contraseña + foco tras error + offline note.
  - [ ] 5.4 `/` (POS): búsqueda (debounce + Enter con resultado único + Esc), chips de categoría, F2, agregar al carrito (badge pop + CartBar), ± cantidad, cancelar venta (modal), cobrar con efectivo (recibido < total bloquea; Exacto; vuelto), F9, modal venta-ok (autoclose 8s sin vuelto).
  - [ ] 5.5 `/caja`: abrir caja (validación monto), sugerencia, cerrar (diferencia en vivo Faltan/Sobran/Cuadra), Escape con input inválido NO cierra el modal, pill TopBar se repinta sin reload (`caja:state-changed`), focus de pestaña repinta.
  - [ ] 5.6 `/stock`: KPIs, chips de filtro, stepper ± (debounce 500 ms), revert en error, aviso stale.
  - [ ] 5.7 `/productos`: alta/edición (drawer), validación inline, desactivar con modal, restore, toolbar (búsqueda/chips/orden/contador), "Mostrar más", subida de imagen.
  - [ ] 5.8 `/categorias`: alta/rename/delete con pre-guard local de uso.
  - [ ] 5.9 `/historial`: rango chips, búsqueda, filtro fechas, KPIs, pills de sync, `<details>` de día, doble template li/tr.
  - [ ] 5.10 `/historial/venta/?id=…`: comprobante, IGV con/sin subtotal, sync pill, imprimir, id desconocido → empty state.
  - [ ] 5.11 `/ajustes`: dirty bar, preview IGV, guardar (reload), descartar.
  - [ ] 5.12 Global: sidebar (drawer móvil, collapse rail persistido, Esc, tap outside, logout), offline-banner, sync-status (retry/discard modal), route-guard (Back no vuelve a ruta protegida).
- [ ] 5.13 Grep final de deuda: `rg -c "document.querySelector" src/components/islands/` — registrar el antes/después (debe bajar fuerte; no debe ser 0: sigue habiendo consultas puntuales legítimas).
- [ ] 5.14 Actualizar `doc/data-hooks.md` solo si algún hook cambió de archivo anfitrión (no de nombre).

**Gate Fase 5:** build verde + todos los smoke en ✅. Cualquier regresión → revertir el commit de la isla culpable (invariante 4 hace esto barato) y reintentar.

---

## Fase 6 — Delivery

- [ ] 6.1 Evaluar tamaño: `git diff --stat main...HEAD`. Si > 400 líneas cambiadas, encadenar PRs por fase (Fase 1-2 / Fase 3 / Fase 4-5) — el `delivery_strategy` canónico es `single-pr` hasta que el forecast lo contradiga.
- [ ] 6.2 Commits convencionales sin atribución AI (regla del repo).
- [ ] 6.3 Descripción del PR: enlazar este plan, marcar checkboxes completados, listar smoke ejecutado.

---

## Cheat-sheet del agente

| Regla | Detalle |
|---|---|
| Orden | 0 → 1 → 2 → 3 → 4 → 5 → 6. No saltar gates. |
| Granularidad | 1 archivo = 1 commit en Fase 2. |
| Verificación mínima por commit | `npm run build` |
| Prohibido | renombrar hooks `data-*`, `innerHTML`, clases para estado, ids fijos, globals, dependencias nuevas, tocar lógica de negocio |
| Si dudas del comportamiento | el texto/string/orden de la versión vieja gana byte a byte |
| Rollback | `git revert` del commit de la isla individual |
| Dudas de diseño fuera de este plan | detenerse y reportar, no improvisar |
