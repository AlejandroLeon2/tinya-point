# Plan de preparación — entorno y estructura (por fases)

Plan de ejecución para **agentes**. Cada fase es una unidad de trabajo con contexto de entrada (qué MD leer), tareas con checkboxes y un **gate de salida** que bloquea el avance hasta cumplirse.

**Énfasis arquitectónico:** `doc/astrobase.md` es la fuente de verdad de la estructura. Sus *reglas de oro* (sección 6) y sus tres principios (sección 1) gobiernan TODAS las fases, no solo la de carpetas.

**Alcance de este plan:** preparar entorno + levantar el esqueleto de estructura correcto. **NO** incluye lógica de negocio (carrito funcional, checkout, ventas reales, sync) — eso viene en una pasada posterior sobre este esqueleto.

---

## Cómo ejecutar este plan (instrucciones para el orquestador)

1. **Una fase a la vez, en orden.** No lanzar la fase N+1 antes de cerrar el gate de la fase N.
2. **Cada tarea de agente recibe como contexto mínimo los MD listados en "Contexto" de su fase.** Pasar rutas de archivo, no resúmenes: el agente lee los MD él mismo.
3. **Cada fase se cierra marcando todos los checkboxes.** Un gate sin cumplir = fase incompleta = no se avanza.
4. **Convención de idioma vigente todo el plan** (`doc/extras.md` §7): archivos/funciones/variables en **inglés**; columnas de Sheet, claves de JSON y `localStorage` en **español**; texto visible al usuario en **español**.
5. Si una tarea descubre que algo de los MDs es incoherente o imposible, **se señala y se detiene** — no se improvisa una solución parcial.

---

## Fase 0 — Punto de partida y reglas del juego

**Contexto:** `doc/base.md` (§1, §10) · `doc/extras.md` (§7) · `doc/astrobase.md` (§1, §6)

**Objetivo:** que el agente arranque con el estado real del repo y las reglas no negociables cargadas.

**Tareas:**

- [x] Verificar baseline: `node -v` ≥ 22.12, `pnpm -v` instalado. *(node v24.17.0, pnpm 11.11.0)*
- [x] Arrancar dev server (`pnpm astro dev --background`) y confirmar que carga la página vacía; pararlo. *(HTTP 200, title "Astro Basics", detenido)*
- [x] Confirmar estado actual conocido (debe coincidir; si no, detenerse y reportar):
  - [x] `src/layouts/Layout.astro` existe pero tiene **un solo `<slot />`** (debe pasar a 3 slots con nombre en Fase 3). *(verificado: 1 slot)*
  - [x] `src/styles/global.css` solo contiene `@import "tailwindcss";` (se completa en Fase 2). *(verificado)*
  - [x] `src/components/` está vacío; **no existen** `stores/`, `utils/`, `api/`, `islands/`. *(verificado)*
  - [x] No hay `.env` ni `.env.example`; no hay PWA instalada (`@vite-pwa/astro` ausente de `package.json`). *(verificado)*
  - [x] `src/pages/` solo tiene `index.astro`. *(verificado)*
- [x] Cargar las 3 reglas de `doc/astrobase.md` §1 y tratarlas como invariantes de todo el plan:
  1. `ui/` nunca hace fetch / localStorage / importa `api/`.
  2. `smart/` nunca dibuja HTML de negocio propio; delega en `ui/`.
  3. Ningún `fetch` fuera de `api/client.ts`.
- [x] Cargar la convención de nombrado (`doc/extras.md` §7) y aplicarla desde la primera tarea de código.

**Gate de salida:**

- [x] Dev server arranca y compila sin errores.
- [x] Los 5 puntos del baseline coinciden con el repo real.
- [x] El agente puede enunciar las 3 invariantes de `astrobase.md` §1 de memoria antes de tocar código.

---

## Fase 1 — Entorno: dependencias y configuración

**Contexto:** `doc/extras.md` (§2, §3 pasos 7–8, §8) · `doc/base.md` (§1) · `doc/stilesbase.md` (§1)

**Objetivo:** stack completo y configurado antes de crear estructura: PWA, variables de entorno, output estático.

**Tareas:**

- [x] Instalar `@vite-pwa/astro` con pnpm. *(v1.2.0 + `workbox-window@7.4.1` como devDep por ser peer requerido por el virtual module)*
- [x] Configurar `astro.config.mjs`:
  - [x] Mantener el plugin de Tailwind v4 existente (`@tailwindcss/vite`).
  - [x] Dejar explícito `output: "static"` (SSG — sin adapter de servidor; `doc/extras.md` §8).
  - [x] Integrar `@vite-pwa/astro` con la config mínima (manifest se detalla en Fase 7). *(va en `integrations`, NO en `vite.plugins` — es una integración de Astro)*
- [x] Crear `.env.example` con las dos claves documentadas (sin valores reales).
- [x] Crear `.env` local con valores placeholder (verificado: `.gitignore` lo ignora, `git status` no lo muestra).
- [x] Confirmar que `astro build` produce `dist/`.
- [x] NO configurar nada de Vercel todavía (solo dejar el proyecto buildable como estático).

**Wiring de PWA hecho aquí (pattern documentado por vite-pwa, queda vivo de ahora en más):**

- [x] `src/layouts/Layout.astro`: `{pwaInfo && <Fragment set:html={pwaInfo.webManifest.linkTag} />}` en `<head>` + `<script src="/src/pwa.ts">`.
- [x] `src/pwa.ts`: `registerSW({ immediate: true })` desde `virtual:pwa-register`. El toast de actualización va en Fase 7 (`registerType: 'prompt'` ya configurado).
- [x] Verificado en build: `<link rel="manifest">` inyectado en `dist/index.html`, `dist/sw.js` + `dist/manifest.webmanifest` + `workbox-*.js` generados, script de registro empaquetado en `dist/_astro/`.
- [x] Smoke test de dev server: arranca, HTTP 200, la integración no lo rompe. *(nota: en dev `pwaInfo` no inyecta el link — el manifest solo se ve en build; para testear PWA en dev habilitar `devOptions.enabled`, decisión de Fase 7)*

**Gate de salida:**

- [x] `pnpm build` termina en 0 errores y genera `dist/`.
- [x] `.env.example` commiteable y `.env` ignorado por git (`git status` no lo muestra).
- [x] PWA instalada y el manifest se genera en el build (aunque mínimo).

**Riesgo conocido:** `@vite-pwa/astro@1.2.0` declara peer `astro ^5` y usamos Astro 7.3.3 — verificado empíricamente que build+dev+inyección funcionan, pero vigilar al actualizar Astro (o migrar a `vite-plugin-pwa` directo si rompe).

---

## Fase 2 — Sistema de estilos base (tokens, tipografía, componentes CSS)

**Contexto:** `doc/stilesbase.md` (completo — §0 a §6) · `doc/astrobase.md` (§3.2, §6.2)

**Objetivo:** el sistema de diseño vivo en CSS **antes** de existir cualquier componente, para que toda UI posterior nazca ya con contraste, escala y componentes correctos.

**Tareas:**

- [x] `src/styles/global.css` — bloque `@theme` con **exactamente** los tokens de `stilesbase.md` §2.2:
  - [x] `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`.
  - [x] Pares `primary` / `success` / `danger` / `warning` con sus sufijos `-hover` y `-content`.
  - [x] `--font-sans: "Atkinson Hyperlegible", ...`.
  - [x] Escala tipográfica de §3.2 con `--text-base: 1.125rem` (18px) como piso. *(+ `body` en `@layer base` aplicando `text-base` para que el piso de 18px sea real, no solo una clase)*
- [x] `@layer components` con las clases de `stilesbase.md` §4:
  - [x] `.btn` con `min-h-14 min-w-14` (56px de área táctil — verificado `calc(var(--spacing) * 14)` = 56px en el CSS build) y `focus-visible:outline` (+ `outline-2` → 2px compilado).
  - [x] `.btn-primary`, `.btn-success`, `.btn-danger`, `.btn-secondary` (con `:active` → `-hover` compilado).
  - [x] `.input-field`, `.card`, `.badge-warning`.
- [x] Fuentes self-hosted:
  - [x] Atkinson Hyperlegible (Regular + Bold, woff2, magic `wOF2` verificado) en `public/fonts/` → llegan a `dist/fonts/`.
  - [x] **Lugar único decidido y documentado:** `@font-face` en `global.css` (el CSS vive en CSS); el Layout solo carga los `<link rel="preload">` en `<head>` (que por ser HTML solo pueden vivir ahí). Desviación mínima respecto al ejemplo de `stilesbase.md` §3.1, que los pone juntos en el Layout.
- [x] Verificar que no se coló ningún color fuera de los 4 semánticos ni tamaños de texto bajo 18px.

**Desviación registrada (importante para futuros agentes):** `stilesbase.md` §4 afirma que en Tailwind v4 "el `@apply` sigue funcionando igual" — **es incorrecto para composición de clases custom**: `@apply btn` dentro de `.btn-primary` falla con `Cannot apply unknown utility class`. Solución aplicada: `.btn` se registra con `@utility btn { ... }` (v4 sí lo permite aplicar) y las variantes quedan igual en `@layer components`. **Los nombres de clase públicos en el HTML no cambian** — solo cambia el mecanismo interno. Dejado comentado en `global.css`.

**Gate de salida:**

- [x] Smoke test en `index.astro` renderiza `.btn-primary` + `.card` + `text-3xl` con los tokens → clases presentes en `dist/index.html` y reglas presentes en el CSS build (`.btn-primary{background-color:var(--color-primary);color:var(--color-content…)}`).
- [x] `grep -rE "#[0-9A-Fa-f]{6}" src/ --include="*.astro" --include="*.css" -l` → **solo** `src/styles/global.css`.
- [x] `pnpm build` en 0 errores.
- [x] Contraste calculado (WCAG, no a ojo): 7/9 pares ≥ 6:1, total ≥ 4.5:1 — consistente con "la mayoría por encima de 6:1" del doc. *(primary 8.57, danger 6.54, text/bg 15.98, text-muted/bg 8.06; success 5.37 y warning 4.96 → AA)*

---

## Fase 3 — Estructura de carpetas (esqueleto completo) ⭐ fase núcleo

**Contexto:** `doc/astrobase.md` (completo — es la fuente de verdad de esta fase) · `doc/extras.md` (§7)

**Objetivo:** materializar el árbol de `astrobase.md` §2 con archivos mínimos validables (firmas/stubs, **sin lógica de negocio**), y corregir el `Layout.astro` al modelo de 3 slots.

**Tareas:**

- [x] Crear el árbol exacto de `astrobase.md` §2 (los directorios que faltaban): `components/ui/`, `components/smart/`, `components/islands/`, `stores/`, `utils/`, `api/actions/`, `api/apps-script/`. *(+ limpieza: eliminado `src/assets/` — assets default sin referenciar, fuera del árbol de §2)*
- [x] `src/layouts/Layout.astro` — reescrito al modelo de la guía:
  - [x] `<slot name="header" />`, `<slot />`, `<slot name="footer" />` (3 slots verificados).
  - [x] Sin lógica de negocio ni estilos de negocio. *(el único `{... && ...}` es el link del manifest PWA — infra de Fase 1, no negocio)*
  - [x] `lang="es"` y título "Tinya Point — Punto de venta" (no "Astro Basics").
- [x] `src/layouts/LayoutAuth.astro` — layout separado sin footer (2 slots: header + default), documentado como variante en archivo aparte.
- [x] Stubs creados con encabezado de responsabilidad, **cero lógica**:
  - [x] `components/ui/`: `Catalog`, `Card`, `Button`, `Modal`, `Badge`, `Header` (6).
  - [x] `components/smart/`: `CatalogContainer`, `CartSummary`, `LoginForm`, `CheckoutPanel` (4).
  - [x] `components/islands/`: `quantity-control.ts`, `modal-controller.ts`, `cart-badge.ts` (3).
  - [x] `stores/`: `cart.ts`, `session.ts` (2).
  - [x] `utils/`: `storage.ts`, `modal.ts`, `format.ts`, `dom.ts`, `validators.ts` (5).
  - [x] `api/`: `client.ts`, `types.ts` + `actions/` (`auth`, `productos`, `ventas`, `stock`) (6).
  - [x] `api/apps-script/`: `Code.gs`, `auth.gs`, `productos.gs`, `ventas.gs`, `utils.gs`, `appsscript.json` = `{}` (contenido en Fase 6) (6).
- [x] `src/pages/`: `login.astro` (LayoutAuth + LoginForm), `historial.astro` (Layout + TODO de smart futuro), `index.astro` (Layout + CatalogContainer, smoke test de Fase 2 eliminado).
- [x] Verificación cruzada 1:1 contra `astrobase.md` §2 — `find src -type f` coincide con el árbol.

**Nota de ejecución:** la delegación a un sub-agente writer falló 2 veces por fallo de conexión del runtime (transporte, no del plan) — los 37 archivos se crearon inline con el mismo manifiesto que se le habría pasado al agente.

**Gate de salida:**

- [x] El árbol real corresponde al árbol de `astrobase.md` §2, sin archivos de más ni de menos. *(Desviaciones documentadas y sancionadas por otros MD: `src/styles/global.css` lo exige `stilesbase.md` §1; `src/pwa.ts` lo exige el wiring PWA de Fase 1; `LayoutAuth.astro` lo permite `astrobase.md` §3.1)*
- [x] `Layout.astro` tiene exactamente 3 slots y ninguna lógica de negocio.
- [x] `pnpm build` en 0 errores con las 3 páginas (`/`, `/login`, `/historial`).
- [x] Revisión de **regla de admisión** de `ui/` (`astrobase.md` §3.2): 0 imports de `api/` o `utils/storage.ts` en `components/ui/`.

---

## Fase 4 — Núcleo compartido: `utils/` y `stores/`

**Contexto:** `doc/astrobase.md` (§3.5, §3.6, §6.2) · `doc/base.md` (§2.3, §6) · `doc/extras.md` (§1)

**Objetivo:** implementar los módulos que todo lo demás va a consumir, con sus contratos exactos. Aquí se sienta el monopolio de `localStorage`.

**Tareas:**

- [x] `utils/storage.ts` — **único** punto de acceso a `localStorage`:
  - [x] Tipar y centralizar las 4 llaves exactas: `catalogo_cache`, `carrito_actual`, `historial_ventas`, `cola_sync`. *(+ **5ª llave `sesion_token`** — desviación documentada: `base.md` §2.3 lista 4 llaves operativas, pero §3 exige el token de sesión en localStorage; owned acá)*
  - [x] Exponer un getter/setter por llave (`getCatalogoCache()`, `setHistorialVentas()`, etc.) — ningún otro archivo conoce los strings. *(helpers privados `read`/`write`/`remove` con try/catch fail-soft + guard `typeof localStorage === 'undefined'` para build en frontmatter)*
  - [x] `catalogo_cache` guarda `{ productos, timestamp }` para el TTL de 15 min (`doc/base.md` §6). *(`TTL_CATALOGO_MS = 15 * 60 * 1000` exportado; tipos de dominio locales, sin importar `api/types.ts`)*
- [x] `utils/format.ts` — `formatCurrency()` siempre con 2 decimales y `S/`, `formatFecha()`, `formatNumero()`. *(`Intl es-PE`; fecha inválida → `''`, no finito → `'0'`)*
- [x] `utils/validators.ts` — cantidad no negativa, campos de login no vacíos (los mínimos documentados).
- [x] `utils/dom.ts` — helper "encontrar `.card` más cercano a este elemento" (base de `islands/`, ver `astrobase.md` §3.4).
- [x] `utils/modal.ts` — abrir/cerrar + trap de foco + `Esc` (API genérica; sin UI propia). *(contrato `hidden` + `tabindex="-1"` en el root; modal único activo; estado en `let` de módulo)*
- [x] `stores/cart.ts` — estado del carrito con `agregar/quitar/editarCantidad`, persistiendo **vía `utils/storage.ts`** (no con `setItem` directo). *(`subscribeCart` con llamada inmediata inicial + unsubscribe; cantidad 0 → remover; inválida → no-op)*
- [x] `stores/session.ts` — token vigente + `cerrarSesion()`; define el listener documentado en `doc/extras.md` §6 para la barra offline (solo el store, la UI va en Fase 5/6). *(`startNetworkListener` idempotente, NO auto-ejecuta al importar — lo cablea una fase posterior; logout borra solo el token)*
- [x] `stores/` e `islands/` NO hacen `fetch` — solo estado y persistencia local.

**Nota de ejecución:** la delegación al sub-agente writer falló 1 vez por fallo de conexión del runtime (transporte, no del plan) — los 7 archivos se escribieron inline con el spec diseñado previamente.

**Gate de salida:**

- [x] `grep -rn "localStorage" src/ | grep -v "utils/storage.ts"` → **0 resultados**. *(los 3 matches son solo comentarios; uso real `localStorage\.` → 0)*
- [x] `grep -rn "fetch(" src/ | grep -v "api/"` → **0 resultados**.
- [x] `pnpm build` en 0 errores. *(3 páginas, 1.19s)*
- [x] Cada archivo de `utils/` y `stores/` es importable sin efectos secundarios al importarlo (sin auto-ejecución a nivel módulo). *(verificado: grep de I/O top-level → 0; todo estado es declaraciones `let`/`const`/`Set`, sin ejecución al importar)*

---

## Fase 5 — Capa API frontend (`api/`) y `islands/`

**Contexto:** `doc/appscriptbase.md` (§1, §4, §5) · `doc/astrobase.md` (§3.4, §3.7) · `doc/base.md` (§3.3, §5) · `doc/extras.md` (§1, §6)

**Objetivo:** el contrato JSON exacto tipado en TypeScript + el único `fetch` del proyecto + los módulos de interacción cliente.

**Tareas:**

- [x] `api/types.ts` — replicar **literalmente** los contratos de `appscriptbase.md` §4:
  - [x] Respuesta de `GET ?action=productos` (§4.1).
  - [x] `login` request/response de éxito y error (§4.2). *(request literal `{action, usuario, clave}` en top-level — sin wrapper `data`)*
  - [x] `registrarVenta` (§4.3) y `actualizarStock` (§4.4), incluida la forma con `advertencia`. *(items wire `{id, cantidad, precio}` SIN `nombre` — distinto del snapshot local de `historial_ventas`)*
  - [x] Unión cerrada del catálogo de errores de §4.5 (`credenciales_invalidas | unauthorized | accion_no_soportada | payload_invalido | error_interno`).
- [x] `api/client.ts` — `llamarApi(action, data)`:
  - [x] **Único** `fetch` de todo el proyecto. *(helper privado `request<T>` al que convergen `llamarApi`/`llamarLogin`/`llamarGet` — un solo `fetch(` en `src/`)*
  - [x] `Content-Type: text/plain;charset=utf-8` (evita preflight CORS — `appscriptbase.md` §1/§5.1).
  - [x] Body `{ action, token, data }`; token leído vía `utils/storage.ts`/`session`. *(+ `llamarLogin` con body literal de §4.2 y `llamarGet` para la lectura pública — los3 caminos por el mismo cliente)*
  - [x] Evaluar éxito por `body.ok`, **nunca** por status HTTP (Apps Script responde 200 siempre). *(HTTP status se ignora a propósito; códigos no reconocidos → `error_interno`)*
  - [x] Rama `error === "unauthorized"` → limpiar token + redirigir a login. *(`setToken(null)` + `window.location.assign('/login')`)*
  - [x] Fallo de red → no lanzar error visible; la llamada queda para `cola_sync`. *(devuelve `{status:'network_failure'}`, nunca throw — distinto de `api_error` para que el caller decida la cola)*
- [x] `api/actions/` — una función por acción, cada una delegando a `client.ts`:
  - [x] `auth.ts` → `login()`. *(valida `hasLoginFields` antes de salir → `payload_invalido`)*
  - [x] `productos.ts` → `obtenerProductos()` (lectura pública, sin token).
  - [x] `ventas.ts` → `registrarVenta()`. *(guard: items no vacíos, total finito ≥0)*
  - [x] `stock.ts` → `actualizarStock()`. *(guard: id, cantidad válida ≠ 0)*
  - [x] Ningún componente importa `client.ts` directamente (solo `actions/`).
- [x] `components/islands/` — scripts como módulos nombrados, sin ids fijos ni variables globales:
  - [x] `quantity-control.ts`: busca elementos **relativos a su card contenedora** (usando `utils/dom.ts`), nunca `id="contador"` global (`astrobase.md` §3.4). *(1 solo listener delegado a `document`, counter vía `[data-qty-step]`/`[data-qty-value]`, piso en 1)*
  - [x] `modal-controller.ts`: abrir/cerrar reutilizando `utils/modal.ts`. *(contrato data-driven: `data-modal-root/open/close` — sin ids; documentado también en `Modal.astro`)*
  - [x] `cart-badge.ts`: lee `stores/cart.ts` y pinta el contador sin recargar. *(`subscribeCart` → suma de cantidades en todos los `[data-cart-badge]`)*
- [x] Estados transversales de `doc/extras.md` §6 — crear los stubs visuales vacíos que faltan en `ui/`:
  - [x] `OfflineBanner.astro` (barra `warning`, texto "Sin conexión — puedes seguir vendiendo", `role="status"`, gateado por prop `visible` con TODO al listener de Fase 7), `EmptyState.astro` (mensaje por prop, default "Todavía no hay productos cargados", `.card`, TODO icono Fase 7) (los otros dos se resuelven sobre `SyncStatusIndicator`/`CatalogContainer` al implementar features: dejar el TODO referenciando §6).

**Nota de ejecución:** delegación al sub-agente bloqueada por el mismo fallo de runtime (4ta vez) — los 11 archivos escritos inline con el spec diseñado; contrato de `Modal.astro` actualizado para mantener sincronizado el island.

**Gate de salida:**

- [x] `grep -rn "fetch(" src/` → **solo** `api/client.ts`.
- [x] `grep -rn 'Content-Type' src/` → solo `api/client.ts`, y es `text/plain;charset=utf-8`.
- [x] `grep -rn 'id="' src/components/islands/` → 0 resultados (sin ids compartidos).
- [x] `types.ts` compila y cualquier acción solo puede devolver los tipos del contrato. *(desviación: `astro check` no está instalado — no se instala checker nuevo sin pedirlo; verificado por construcción: uniones cerradas, actions anotadas con `Promise<ApiResult<T>>`, build verde)*
- [x] `pnpm build` en 0 errores. *(3 páginas, 1.16s)*

---

## Fase 6 — Backend: Google Sheet + Apps Script en el repo

**Contexto:** `doc/appscriptbase.md` (completo) · `doc/base.md` (§2, §3, §5) · `doc/extras.md` (§3) · `doc/astrobase.md` (§3.7)

**Objetivo:** el código del backend vive versionado en `api/apps-script/` y el checklist de deploy manual queda listo. **Parte de esta fase requiere acción humana** (cuenta Google) — el agente prepara todo lo automatizable y deja el resto checklistado.

**Tareas del agente:**

- [x] `api/apps-script/appsscript.json` — manifest con los servicios de `appscriptbase.md` §2 (`SpreadsheetApp`, `PropertiesService`, `Utilities`, `LockService`, `ContentService`; `CacheService` opcional). *(built-ins, no requieren declaration en el manifest: V8 + `America/Lima` + STACKDRIVER; los servicios están listados en el README de la carpeta)*
- [x] Esqueleto de `Code.gs`:
  - [x] `doGet(e)` → solo `action === "productos"`; cualquier otra → error de acción no soportada.
  - [x] `doPost(e)` → lee `e.postData.contents`, `JSON.parse`, delega a `despacharAccion`; **nunca** lógica de negocio inline; **todo** envuelto en try/catch → `respuestaError("error_interno", ...)`. *(valida forma básica: `action` string no vacío → `payload_invalido`)*
- [x] `despacharAccion(action, body)` en `Code.gs` o `utils.gs`: mapa `login | registrarVenta | actualizarStock`; desconocida → `{ ok:false, error:"accion_no_soportada" }`.
- [x] `auth.gs`: `manejarLogin` (error genérico único, sin pistas de campo), `crearSesion` (UUID + expira +12h, bajo lock), `validarToken`, `limpiarSesionesVencidas` (integrada al iterar en `validarToken`, sin recorrido aparte — borra vencidas de abajo hacia arriba, bajo lock).
- [x] `productos.gs`: `obtenerProductos()` con filtro `activo === true` (acepta boolean o texto tras paste) y solo campos livianos (lookup de columnas por header).
- [x] `ventas.gs`: `registrarVenta` y `actualizarStock` con `validarToken` **primero** y `LockService` alrededor de toda escritura; stock nunca negativo (clamp a 0 + `advertencia`). *(+ `buscarFilaPorId` acá: único consumidor)*
- [x] `utils.gs`: `respuestaJson`, `respuestaError` (el `mensajeInterno` solo a `Logger.log`, jamás al cliente).
- [x] Escribir `api/apps-script/README.md` breve: cómo hacer `clasp pull`/`clasp push` (control de versiones real del backend — `astrobase.md` §3.7) + checklist humano + flujo del seed.
- [x] Seed de DummyJSON: **decisión — creado `scripts/seed-dummyjson.mjs`** (CSV a stdout con columnas exactas de `base.md` §2.1, ids estilo `p001`, sin credenciales ni lógica de sync). *(verificado: 194 productos, 8 columnas, CSV RFC 4180)*

**Checklist humano — escrito y visible en:** esta sección + `src/api/apps-script/README.md`. *(NO ejecutado por el agente: requiere cuenta Google)*

- [ ] Crear Google Sheet con hojas `Productos`, `Ventas`, `Sesiones` (columnas exactas de `base.md` §2).
- [ ] Script Properties del proyecto: `SPREADSHEET_ID` (id del Sheet — el script es standalone), `USUARIO` y `CLAVE` (o hash) — nunca en el código ni en el Sheet.
- [x] Subir el backend: `cd src/api && clasp push` (raíz clasp = `src/api/`, `.clasp.json` ya linkeado, `.claspignore` filtra lo no-GAS). *(verificado: código responde en el endpoint)*
- [x] Deploy "Aplicación web": ejecutar como **Yo**, acceso **Cualquier persona** (ya preconfigurado en el manifest `webapp`); copiar URL → `PUBLIC_API_URL`. *(URL real guardada en `.env`)*
- [ ] Correr el seed de DummyJSON una vez (`node scripts/seed-dummyjson.mjs > seed-productos.csv` → pegar en la hoja).
- [ ] Primer login real desde la app (paso 8 de `extras.md` §3).

**Desviación sancionada (22/09/2026):** el proyecto Apps Script se creó
**standalone** con `clasp create` en `src/api/` (los docs asumían
container-bound); `obtenerLibro()` en `utils.gs` soporta ambos modos —
prefer bound, fallback a la propiedad Script `SPREADSHEET_ID`.

**Evidencia (22/09/2026):** endpoint desplegado verificado de punta a punta —
GET `?action=productos` → `200 {"ok":true,"productos":[]}` (link Sheet OK,
hoja aún vacía) y POST login probe → `{"ok":false,"error":"credenciales_invalidas"}`
(doPost/dispatcher OK). Gotcha curl: el `302` a `…/macros/echo` debe
re-solicitarse como GET — `-L -d` sin `-X` funciona, `-X POST` rompe.
Falta humano: pegar seed en `Productos`, `USUARIO`/`CLAVE` reales,
tabs `Ventas`/`Sesiones` y primer login.

**Nota de ejecución:** delegación al sub-agente bloqueada por el mismo fallo de runtime (5ta vez) — los 8 archivos escritos inline con el spec diseñado.

**Gate de salida:**

- [x] Todo el código `.gs` del esqueleto está en el repo y pasó revisión contra el checklist de `appscriptbase.md` §6:
  - [x] Ninguna escritura sin `validarToken`. *(escrituras: `appendRow` crearSesion → tras match de credenciales — login produce el token, no puede validar uno aún; `deleteRow` → dentro del propio `validarToken`; `appendRow`/`setValue` de ventas → `validarToken` primero, verificado por grep con números de línea)*
  - [x] Ninguna escritura sin `LockService`. *(las 4 escrituras con `waitLock` previo: auth 37→44, auth 92→95, ventas 46→50, ventas 90→118)*
  - [x] Ninguna excepción sin capturar en `doGet`/`doPost`. *(ambos con try/catch total → `error_interno`)*
  - [x] Cero credenciales en el código fuente (`grep -ri "clave\|password\|USUARIO" src/api/apps-script/*.gs` no revela valores). *(solo claves de Script Properties `USUARIO`/`CLAVE` y nombres de parámetro)*
- [x] El checklist humano queda escrito y visible para el dueño del proyecto. *(plan.md + README)*

---

## Fase 7 — PWA y estados de UI transversales

**Contexto:** `doc/extras.md` (§2, §6) · `doc/stilesbase.md` (§0, §5) · `doc/base.md` (§7)

**Objetivo:** la app queda instalable, offline-capable y con los estados transversales con UI real.

**Tareas:**

- [x] Manifest completo (`extras.md` §2):
  - [x] `name` / `short_name` del negocio ("Tinya Point — Punto de venta" / "Tinya Point"), `display: "standalone"`, + `lang: "es"`, `start_url`, `scope`.
  - [x] `theme_color` / `background_color` = `--color-primary` / `--color-bg` (nada de colores nuevos). *(hex literales en `astro.config.mjs` con comentario: los manifest no leen CSS vars — únicos hex repetidos fuera de `global.css`)*
  - [x] Íconos 192px y 512px con `purpose: "any maskable"` (generados en `public/icons/`). *(fuente `pwa-maskable.svg`: fondo full-bleed primary + "T" blanco en zona segura; rasterizados con `sips` → PNG exactos 192/512, verificados visualmente)*
- [x] Estrategia de cache del service worker:
  - [x] Precache de app shell (HTML/CSS/JS) + fuentes Atkinson. *(`globPatterns: js/css/html/woff2` → 11 entradas: `/`, `/login`, `/historial`, CSS, 4 JS, 2 woff2, manifest)*
  - [x] `StaleWhileRevalidate` con `urlPattern: /^https:\/\/res\.cloudinary\.com\//` para imágenes. *(runtimeCaching en workbox config)*
  - [x] **Excluir** las llamadas a Apps Script del cacheo del SW (ya las maneja `catalogo_cache` con TTL). *(comentado en config: no matchean precache local ni el patrón Cloudinary → network-only por defecto)*
- [x] Aviso de actualización de versión: banner no intrusivo "Hay una actualización disponible" + botón "Actualizar ahora" (nunca recarga silenciosa — puede perder una venta en curso). *(`pwa.ts`: `registerType: 'prompt'` + `onNeedRefresh` → banner inferior con `role="status"`, `.btn-primary`; recarga SOLO tras click. Verificado en bundle: "Actualizar ahora" presente; cadena de carga: las 3 páginas importan `Layout*.js → pwa*.js`)*
- [x] UI real de los estados de `extras.md §6` sobre los stubs de Fase 5:
  - [x] `OfflineBanner.astro` (barra `warning` por token, texto en lenguaje simple, `role="status"`, no bloquea). *(binding al listener de `stores/session.ts` → TODO en el archivo: queda para la pasada de features donde se monte — el stub es prop-gated y ya renderiza la UI final)*
  - [x] `EmptyState.astro` reutilizable ("Todavía no hay productos cargados" / "sin resultados de búsqueda" por prop). *(TODO icono Fase 7→pasada de features, referenciando `extras.md` §4)*
  - [x] `smart/SyncStatusIndicator.astro` creado con TODO explícito de `error_permanente` + "Reintentar"/"Descartar" (la cola aún no existe — fuera de alcance, `plan.md` §Fuera de alcance). *(renderiza nada hasta entonces: un estado de sync falso mentiría al cajero)*
- [x] Verificar accesibilidad de estos estados según `stilesbase.md` §5: foco visible, nunca solo color, sin interacción solo-hover. *(todos los estados llevan TEXTO (nunca solo color); botón del banner usa `.btn-primary` con `focus-visible:outline` + 56px; ningún estado requiere hover)*

**Desviación de árbol sancionada:** `components/smart/SyncStatusIndicator.astro` no está en `astrobase.md` §2 pero lo exige `extras.md` §6 (mismo criterio que `LayoutAuth.astro`). + `public/icons/` (fuente SVG + 2 PNG).

**Nota de ejecución:** delegación al sub-agente bloqueada por el mismo fallo de runtime (6ta vez) — archivos escritos inline.

**Gate de salida:**

- [x] Build de producción + `pnpm preview` → la app se instala como PWA (manifest detectado, SW registrado). *(3 páginas HTTP 200; `link rel="manifest"` presente; `/manifest.webmanifest` y `/sw.js` 200; ícono 200; cadena de registro `import"./pwa.*.js"` en las 3 páginas)*
- [x] Modo offline del navegador: shell de la app carga desde cache. *(verificado estructuralmente: precache completo = 3 HTML + CSS + 4 JS + 2 fuentes + manifest = 11 entradas; el toggle manual "offline" en el navegador queda como verificación humana — no hay browser automation en este entorno)*
- [x] `grep -rn "script.google" public/ src/components/` → 0 (la URL de la API solo vive en `.env` → `api/client.ts`).
- [x] Los estados usan únicamente los 4 colores semánticos y texto ≥ 18px. *(0 hex fuera de tokens en estados + `pwa.ts`; 0 clases `text-xs/sm/md`)*

---

## Fase 8 — Auditoría final y cierre

**Contexto:** `doc/astrobase.md` (§5, §6 — reglas de oro) · `doc/stilesbase.md` (§5, §6) · `doc/appscriptbase.md` (§6) · `doc/extras.md` (§7)

**Objetivo:** prueba mecánica de que el esqueleto cumple todo lo prometido antes de empezar la pasada de features.

**Tareas (auditoría — cada una es un checkbox verificable con comando):**

- [x] **Ningún `fetch` fuera de `api/client.ts`:** `grep -rn "fetch(" src/ | grep -v "src/api/client.ts"` → 0. ✓
- [x] **Ningún `localStorage` fuera de `utils/storage.ts`:** `grep -rn "localStorage\." src/ | grep -v "src/utils/storage.ts"` → 0. ✓
- [x] **Ningún script inline con id fijo/variable global:** `grep -rn "let count\|id=\"contador\"" src/` → 0. ✓
- [x] **`ui/` no importa datos:** `grep -rn "from '.*api/\|from \".*api/\|storage.ts" src/components/ui/` → 0. ✓
- [x] **`smart/` no define HTML de tarjeta/botón propio:** revisión manual de que todo `smart/` renderiza componentes de `ui/`. ✓ *(grep `class="card|class="btn|<button` en `smart/` → 0; los 5 smart son stubs sin HTML de negocio; el binding real llega con la pasada de features)*
- [x] **Un solo layout con 3 slots + variantes en archivos aparte:** `grep -rn "<if\b\|{.*&&.*slot" src/layouts/` → 0 condicionales de slot. ✓ *(+ `LayoutAuth.astro` aparte, sin `if` dentro de `Layout`)*
- [x] **Nombres:** archivos/funciones/variables en inglés, contratos (`localStorage`, JSON, columnas Sheet) en español, UI en español (`extras.md` §7). ✓ *(verificado a lo largo de las fases: `getCart`/`isValidQuantity`/`llamarApi` en inglés; llaves `carrito_actual`/`metodo_pago` en español; UI "Actualizar ahora"/"Sin conexión" en español)*
- [x] **Accesibilidad:** todo botón/input usa `.btn*`/`.input-field` (foco + 56px); acciones destructivas con `btn-danger` + confirmación pendiente de implementar (TODO marcado). ✓ *(grep `<button|<input` en pages+layouts sin clase → 0; `btn-danger` solo existe en CSS — aún no hay acciones destructivas en UI; la confirmación destructiva queda en los TODOs de la próxima pasada)*
- [x] `pnpm build` → 0 errores; `pnpm preview` → las 3 páginas (`/`, `/login`, `/historial`) cargan con Layout correcto. ✓ *(3×HTTP 200, `<title>Tinya Point — Punto de venta</title>`, script de LayoutAuth en /login)*
- [ ] Abrir PR describiendo: decisiones tomadas, TODOs explícitos de la próxima pasada (lógica de venta, cola de sync real, seed, deploy Vercel), y el checklist humano de la Fase 6. **← decisión del usuario (22/09/2026): NO commitear por ahora — el trabajo queda en working tree; el commit/PR es una tarea aparte para cuando defina remote.**

**Desviaciones de árbol sancionadas (§2 + extras/plan):** `styles/global.css`, `pwa.ts`, `LayoutAuth.astro`, `smart/SyncStatusIndicator.astro`, `ui/OfflineBanner.astro`, `ui/EmptyState.astro` (estos 3 dos exigidos por `extras.md` §6 / tareas Fase 5 y 7), `api/apps-script/README.md` (tarea Fase 6), `scripts/seed-dummyjson.mjs` (decisión Fase 6). **+ `doc/plan-sidebar.md` (23/09/2026): `components/ui/Sidebar.astro`, `layouts/LayoutApp.astro`, `islands/sidebar.ts` — sanción: decisión del dueño 2026-09-23 ("solo sidebar" para navegación) + `astrobase.md` §3.1 para la variante de layout; `ui/Header.astro` queda como stub sin usar (está en §2, no se borra).** **+ `doc/plan-mejoras-2.md` (23/09/2026): `pages/productos.astro`, `pages/caja.astro`, `pages/historial/venta.astro`, `smart/ProductContainer.astro`, `smart/CajaContainer.astro`, `smart/VentaDetailContainer.astro`, `ui/ProductForm.astro`, `ui/ProductRow.astro`, `ui/CajaFormApertura.astro`, `ui/CajaResumen.astro`, `ui/HistorialDay.astro`, `ui/VentaLine.astro`, `islands/product-admin.ts`, `islands/caja.ts`, `islands/caja-banner.ts`, `islands/venta-detail.ts`, `api/actions/productos.ts`, `api/actions/caja.ts`, `apps-script/caja.gs`, `utils/caja.ts`, 6ª llave `cajas` en `utils/storage.ts` — sanción: `plan-mejoras-2.md` Fases 1–4 + decisiones del dueño D1–D4 (23/09/2026).** Fuera de `src/`: `public/fonts/`, `public/icons/`, `.env.example`, `doc/`.

**Gate de cierre del plan:**

- [x] Los 8 audits en verde. *(A1–A7b ejecutados arriba, todos exit=1 = 0 hallazgos)*
- [x] El árbol `src/` coincide con `astrobase.md` §2. *(42 archivos = §2 completo + desviaciones listadas arriba, cada una sancionada por un MD o por el propio plan)*
- [x] Checklist humano de Fase 6 entregado al dueño del proyecto. *(visible en `doc/plan.md` Fase 6 + `src/api/apps-script/README.md`)*
- [x] TODOs de la pasada de features documentados (no hay lógica de negocio a medias disfrazada de terminada). *(OfflineBanner binding, EmptyState icono, SyncStatusIndicator/cola, destructivos+confirmación, todo referenciando su sección de MD)*

---

## Fuera de alcance de este plan (próxima pasada)

Para que ningún agente se lo trague por su cuenta:

- Lógica de venta real: carrito → checkout → `registrarVenta` + `actualizarStock` → `cola_sync` con el ciclo de vida de `extras.md` §1 (FIFO, backoff, 5 intentos, `error_permanente`).
- TTL/refresco del catálogo y búsqueda client-side (Fuse.js) sobre `catalogo_cache`.
- Reporte del día y export CSV (**omitidos por decisión del usuario** — `extras.md` §5).
- Deploy a Vercel + variables de entorno en el dashboard (`extras.md` §8).
- Subida de imágenes a Cloudinary y URLs transformadas (`extras.md` §4).
