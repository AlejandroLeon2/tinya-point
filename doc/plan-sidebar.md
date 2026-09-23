# Plan — Navegación con sidebar (fácil acceso)

> **Qué es este documento:** plan de implementación de un **menú de navegación con sidebar** (decisión del dueño 2026-09-23: **solo sidebar, sin header propio**). Ejecutable por fases con gates, sobre el esqueleto ya terminado de `doc/plan.md` + `doc/plan-features.md`.
>
> **Contexto de specs:** `doc/astrobase.md` §2/§3.1/§3.8 · `doc/stilesbase.md` §2/§3/§5 · `doc/extras.md` §6 · `doc/base.md` §3 (rutas).

---

## 0. Diagnóstico (verificado 23/09/2026 sobre el código real)

- **No existe navegación.** `src/components/ui/Header.astro` es un stub vacío (solo comentario) y `grep -rn "<nav" src/` → 0 resultados. Entre `/` y `/historial` hoy solo se llega escribiendo la URL o con Back.
- **No está contemplado en ningún spec.** grep en `doc/`: las únicas menciones de "header" son el `<slot name="header">` del Layout y la columna `header` de las hojas Sheet. Tampoco aparece en `doc/sugerencias-mejora.md`.
- **"Todo junto":** `/` apila verticalmente `CatalogContainer` + `CartSummary` + `CheckoutPanel` en una sola columna, sin separación entre "dónde estoy" y "qué puedo hacer".
- **Rutas hoy:** `/login` (`LayoutAuth`, sin sidebar) · `/` · `/historial` (ambas con `Layout`).

## 1. Decisiones de diseño (fijadas, no se reabren en ejecución)

1. **Solo sidebar, sin header.** `Header.astro` se mantiene como stub sin usar (está en el árbol de `astrobase.md` §2 — no se borra, no se implementa).
2. **Orden lógico de uso del cajero** (de más a menos frecuente):
   1. **Venta** → `/` (donde vive el cajero casi todo el turno) — primer item, estado activo por defecto al entrar.
   2. **Historial** → `/historial` (consulta posterior a la venta).
   3. *(el array está preparado para crecer: Stock/Movimientos, Productos, Configuración cuando esas rutas existan — no se crean páginas en este plan).*
   - **Bloque inferior fijo del sidebar:** **Cerrar sesión** (`stores/session.ts` `logout()` ya existe, no hay UI que lo use hoy).
3. **Responsive:**
   - **≥ 768px:** sidebar fijo persistente, ancho 240px, **etiquetas siempre visibles** (`stilesbase.md` §5.2: nunca solo ícono; piso tipográfico 18px; targets ≥ 56px como `.btn`).
   - **< 768px:** sidebar oculto → **drawer off-canvas** con botón toggle fijo visible; se abre/cierra con `hidden` (**no** con `translate-x` — ver gotcha G1), cierra con Esc y al navegar.
4. **Estado activo sin JavaScript:** en `output: "static"` cada página renderiza con su propio `Astro.url.pathname` → `aria-current="page"` calculado en build (normalizando trailing slash igual que `route-guard.ts`).
5. **Estructura: variante de layout nueva `LayoutApp.astro`.** Precedente: `LayoutAuth.astro` — "cualquier otro layout va en un archivo aparte, nunca como un `if` dentro de este" (`astrobase.md` §3.1). **`Layout.astro` no se toca** (gate de `plan.md` Fase 8: 3 slots, 0 condicionales).
6. **`SyncStatusIndicator` y `OfflineBanner` se quedan en la columna de contenido** (slot header de siempre). Motivo: mover el indicador de sync dentro del sidebar chocaría con la gotcha G1 (su `Modal` es `fixed` y el drawer transformado rompería el posicionamiento).

## Fases

### Fase 1 — Componente visual `ui/Sidebar.astro`

- [x] Crear `src/components/ui/Sidebar.astro`: *(implementado 23/09/2026)*
  - Props: `items: { href: string; label: string }[]`, `currentPath: string`. *(frontmatter con `interface NavItem` + `Props` explícitos.)*
  - `<nav aria-label="Principal">` → `<ul>` → `<a>` por item; el activo recibe `aria-current="page"` + estilo activo. *(`aria-current={isActive ? 'page' : undefined}` — Astro lo omite en false; activo = `bg-primary font-bold` sobre `font-semibold` inactivo: fondo + peso, nunca solo color — `stilesbase.md` §5.2.)*
  - Slot `name="footer"` del sidebar para "Cerrar sesión" (quien compone — el layout — decide si lo pasa). *(`<div class="mt-auto"><slot name="footer" /></div>`.)*
  - Raíz con `data-sidebar-root` (contrato de la isla, futuro Fase 3). *(En el `<nav>`, documentado en el header del archivo.)*
- [x] Estilos con los tokens existentes (`bg-surface`, `border-border`, `text-base` piso 18px, links `min-h-14` con `focus-visible:outline-primary`). *(Clases Tailwind inline en el componente — sin clase nueva en `global.css`: la guía de estilos no define nav, no hay que replicar el patrón `@utility`.)*
- [x] Respetar la regla de admisión de `ui/`: **cero** imports de `api/`, `stores/` o `utils/storage.ts` — solo props y slots. *(El archivo no tiene ningún `import`; normalización de pathname con regex local, sin dependencias.)*

**Gate Fase 1:** `pnpm build` 0 errores ✓ *(23/09/2026: 3 páginas, "Complete!")* · `grep "fetch\|localStorage\|from '.*api/"` en `Sidebar.astro` → 0 ✓. *(Nota: el componente aún no está importado por ninguna página — la prueba de render real llega con el gate de Fase 2.)*

### Fase 2 — Layout de app `layouts/LayoutApp.astro` + migración de páginas

- [x] Crear `src/layouts/LayoutApp.astro` (variante, patrón `LayoutAuth`): mismo `<head>` que `Layout.astro` (preloads, PWA, `route-guard`), **3 slots** (`header` / default / `footer`), sin condicionales de slot. *(23/09/2026: head byte-a-byte igual al de `Layout.astro`; los 3 slots intactos; `route-guard` montado al final del `<body>`.)*
- [x] `<body>` = shell de app: `flex min-h-screen` → `<Sidebar>` (izq.) + `<div class="flex-1 min-w-0">` (col. derecha: `<slot name="header">`, `<slot />`, `<slot name="footer">`). *(`min-w-0` aplicado — gotcha G2. Sidebar además `sticky top-0 h-screen overflow-y-auto`: sticky NO crea containing block, seguro para G1.)*
- [x] Frontmatter: array `navItems` (Venta, Historial) + `currentPath = Astro.url.pathname` normalizado → props de `Sidebar`. *(`navItems` en orden de uso; la normalización de slash vive en `Sidebar.astro`, mismo criterio que `route-guard.ts`.)*
- [x] Botón **toggle del drawer** (móvil): visible solo `< md`, `aria-expanded` + `aria-controls` apuntando al sidebar. *(Decisión: vive en `LayoutApp` — **fuera** de `data-sidebar-root`, porque si fuera dentro desaparecería con el drawer y no se podría reabrir. `id="sidebar-principal"` agregado como prop opcional a `Sidebar.astro`. `z-40` (bajo banner/modales `z-50`), banda `pt-16 md:pt-0` reservada en el header slot. Comportamiento recién en Fase 3.)*
- [x] (A11y, opcional recomendado) skip-link "Saltar al contenido" al inicio del `<body>`. *(Incluido: `sr-only focus:not-sr-only` → `#contenido`.)*
- [x] Migrar `src/pages/index.astro` y `src/pages/historial.astro`: `Layout` → `LayoutApp`. **Contenido sin cambios**: siguen montando `SyncStatusIndicator slot="header"` + `OfflineBanner`. *(`historial.astro` dejó de renderizar su propio `<main>` — el landmark ahora lo posee el layout, único cambio estructural.)*
- [x] **No se toca** `login.astro` ni `LayoutAuth.astro` (el login queda fullscreen sin sidebar). *(0 cambios; verificado: `data-sidebar-root` y `data-sidebar-toggle` = 0 en `dist/login/index.html`.)*

**Gate Fase 2:** `pnpm preview` → `/` y `/historial` muestran sidebar con `aria-current` en el item correcto ✓ *(23/09/2026: `dist/index.html` = `<a href="/" aria-current="page">`, `dist/historial/index.html` = `<a href="/historial" aria-current="page">`; las 3 rutas responden 200)* · `/login` sin sidebar ✓ · route-guard sigue redirigiendo bien en las 3 rutas ✓ *(chunk `LayoutApp…index_1` = route-guard referenciado por las 2 páginas nuevas; `LayoutAuth…index_1` intacto en /login).*

### Fase 3 — Isla `islands/sidebar.ts` (drawer móvil + cerrar sesión)

- [x] Crear `src/components/islands/sidebar.ts` (módulo con nombre, sin `id=` fijos, sin variables globales — `astrobase.md` §3.4): *(implementado 23/09/2026)*
  - **Toggle drawer** (`[data-sidebar-toggle]`): **desviación documentada** — en vez del atributo `hidden`, alterna `data-sidebar-open` y la **CSS media query** de `Sidebar.astro` es quien decide el breakpoint (oculto `< md`, visible `≥ md` sin JS): cero flash pre-hidratación y desktop correcto aunque la isla no cargue. `aria-expanded` sincronizado en cada cambio; cierra con **Esc**, con click en un link del drawer y con click fuera. Al abrir mueve el foco al primer link (el sidebar va ANTES que el toggle en DOM order — Tab solo lo saltería); al cerrar con foco adentro lo devuelve al toggle. Listener `matchMedia('(min-width: 768px)')` limpia el estado al cruzar a desktop. El drawer abierto en móvil se posiciona `fixed z-45` (encima del toggle `z-40`, bajo banner/modales `z-50`) — **solo display/position, nunca transform** (G1 intacto).
  - **Cerrar sesión** (`[data-logout]`): importa `logout()` de `stores/session.ts` → `location.replace('/login')` (mismo criterio que `route-guard.ts`, sin `assign`, sin loops). Solo borra el token — carrito e historial sobreviven (contrato `session.ts`). *(Botón `btn btn-secondary w-full` "Cerrar sesión" montado por `LayoutApp` en el slot `footer` del Sidebar.)*
- [x] Montar la isla desde `LayoutApp.astro` (`<script>import '../components/islands/sidebar';</script>`). *( Después del route-guard; chunk `LayoutApp…index_2` referenciado por `/` y `/historial`.)*

**Gate Fase 3:** `grep -rn 'id="' src/components/islands/` → 0 ✓ *(23/09/2026)* · `pnpm build` 0 errores ✓ · regla del drawer presente en el HTML de build (`@media (width<=767.98px){…data-sidebar-open…}` inlineada) ✓ · `data-logout` + `aria-expanded/aria-controls` en `dist` ✓ · preview 3×200 ✓ · **gate humano mobile: abrir/cerrar con Esc, aria-expanded cambia, logout cae a `/login` y Back no vuelve a `/`** *(pendiente — requiere navegador).*

### Fase 4 — Composición y regresiones

- [x] Ancho útil de la columna de contenido: `flex-1 min-w-0` (gotcha G2) — verificar que catálogo, carrito y checkout no se compriman. *(`min-w-0` presente en `dist/index.html`; verificado 23/09/2026.)*
- [x] Verificar `OfflineBanner` (`fixed inset-x-0 top-0 z-50`): sigue cubriendo el ancho total por encima del sidebar (es una barra de estado) y **no pisa el toggle**. *(Decisión tomada: al banner se le agregó **`pointer-events-none`** — es texto puro sin contenido interactivo (`role="status"`, sin handlers) y en `top-0` a ancho completo tapaba los clicks del toggle `top-3 z-40`. Lectura literal de `extras.md` §6: la barra **nunca bloquea**. La superposición visual al toggle solo ocurre con offline activo y el botón sigue siendo cliqueable al 100%.)*
- [x] Verificar el `Modal` de `SyncStatusIndicator` (`fixed z-50`) abre bien con el sidebar presente (G1). *(Verificado por composición: el modal vive en el header slot de la **columna de contenido**, nunca dentro del sidebar; la cadena de ancestros no tiene `transform`/`filter`/`will-change` — grep en `LayoutApp.astro` + `Sidebar.astro` = 0. Capas consistente: toggle `z-40` < drawer `z-45` < banner/modales `z-50`, con el modal además después en DOM order que el drawer.)*
- [x] Flujo completo a mano: login → agregar al carrito → cobrar → ir a historial desde el sidebar → volver a Venta → logout. *(Automatizado lo posible: build 0 errores, 3×200 en preview sirviendo el `dist` actual (`data-logout` y regla del drawer verificados por HTTP), `/login` con 0 `data-sidebar-root`/`0 data-logout`. **El paso a paso en navegador queda como gate humano.**)*

**Gate Fase 4:** flujo de venta completo sin regresiones; los 3 audits de `plan.md` Fase 8 siguen en verde — único `fetch` en `client.ts` ✓, localStorage solo en `storage.ts` ✓ *(grep amplio muestra la palabra en comentarios de 7 archivos; uso real de la API `localStorage.*` = solo `storage.ts:76,88,97`)*, islands sin `id=` ✓ (+ `ui/` sin imports de `api/`/`stores/`/`storage` ✓, `Layout.astro` sin condicionales ✓).

**Decisión de cierre de fase — cerrar el drawer:** el toggle (`z-40`) queda debajo del drawer abierto (`z-45`), así que no es el affordance de cierre visible; el cierre es **Esc + click fuera del drawer + click en un link** (los tres cableados en la isla). Backdrop dedicado: opcional, no implementado.

### Fase 5 — Auditoría final

- [x] `pnpm build` → 0 errores. ✓ *(23/09/2026: 3 páginas, "Complete!")*
- [x] `pnpm preview` → `/`, `/login`, `/historial` responden 200 con el shell correcto. ✓ *(3×200; `/login` con 0 `data-sidebar-root` y 0 `data-logout`.)*
- [x] `grep -rn "<nav" src/` → `aria-label="Principal"` presente. ✓ *(1 `<nav>` en `Sidebar.astro` con el aria-label.)*
- [x] `aria-current="page"` presente en `dist/index.html` y `dist/historial/index.html` (el otro item no lo lleva). ✓ *(cada página: exactamente 1 activo = el suyo, 0 en el link contrario.)*
- [x] `grep "from '.*api/\|localStorage"` en `src/components/ui/` → 0 (incluye el Sidebar nuevo). ✓ *(0 imports de `api/` y 0 usos reales de `localStorage.*`; las menciones en comentarios de otros `ui/` no cuentan, criterio ya usado en Fase 4.)*
- [x] `Layout.astro` intacto: `grep "<if\b\|{.*&&.*slot"` → 0. ✓ *(0 condicionales, 3 slots verificados.)*
- [x] **Anotar desviaciones de árbol** respecto de `astrobase.md` §2 en la tabla de desviaciones. ✓ *(23/09/2026: anotadas en la lista master de `doc/plan.md` Fase 8 — `ui/Sidebar.astro`, `layouts/LayoutApp.astro`, `islands/sidebar.ts`, sanción = decisión del dueño 2026-09-23 + `astrobase.md` §3.1 para la variante; `Header.astro` confirmado como stub que sigue en §2.)*
- [ ] **Gate humano de accesibilidad:** tab entra al sidebar, foco visible, targets ≥ 56px, texto ≥ 18px, nada que dependa solo de hover (`stilesbase.md` §295). *(PENDIENTE — requiere navegador; ver también los gates humanos de Fase 3/4: drawer mobile, Esc, logout.)*

## Riesgos / gotchas

- **G1 — `transform` + `position: fixed`.** Un ancestro con `transform` (típico: `translate-x` para animar el drawer) crea un containing block y **rompe** el `fixed` del `Modal` de sync y del `OfflineBanner` dentro suyo. Por eso el drawer usa `hidden` (sin animación de desplazamiento) y el sync se queda en la columna de contenido.
- **G2 — `flex` + `min-width: auto`.** Los hijos de flex no se encogen debajo del contenido por defecto: sin `min-w-0` la columna principal empuja el layout en pantallas chicas.
- **G3 — trailing slash.** Normalizar `pathname` igual que `route-guard.ts` (`replace(/\/+$/,'') || '/'`) para que `/historial/` no pinte dos items activos ni ninguno.
- **G4 — PWA.** El precache (`globPatterns: **/*.{js,css,html,woff2}`) ya cubre el HTML y el JS nuevos automáticamente; verificar que la isla aparezca en el bundle de las 2 páginas.
- **G5 — duplicación de `<head>`.** `LayoutApp` suma una tercera copia del head (patrón ya aceptado con `LayoutAuth`). Un refactor a `Head.astro` compartido queda **fuera de alcance**.

## Fuera de alcance (no se toca sin decisión nueva)

| Exclusión | Motivo |
|---|---|
| Header propio de página | Decisión del dueño 2026-09-23: solo sidebar |
| Borrar `Header.astro` | Está en el árbol de `astrobase.md` §2 |
| Reorganizar la pantalla de venta (carrito como panel/ruta aparte) | Es rediseño de contenido, no de navegación — evaluar aparte |
| Rutas nuevas (stock, productos, config) | No existen páginas; el array de items queda preparado |
| Modificar `Layout.astro` o `LayoutAuth.astro` | Gates de slots intactos |
| Refactor del `<head>` compartido (G5) | Deuda aceptada, no bloquea |
