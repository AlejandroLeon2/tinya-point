# Hooks `data-*`: cómo se conectan el HTML y el JavaScript

Un hook `data-*` es un **atributo HTML neutro que el JavaScript usa para encontrar un elemento**. No es estilo, ni semántica, ni contenido: es la dirección de contacto entre el markup (`ui/`) y el comportamiento (`islands/`). Si un island necesita tocar un elemento del DOM, ese elemento se marca con `data-algo` y el island lo busca por ese nombre.

## Camino rápido — cómo se usa

1. **Marcás** el elemento en el componente `.astro` con un atributo `data-*`:

   ```html
   <img data-card-img class="hidden h-full w-full object-cover" alt="" />
   ```

2. **El island lo busca** con `querySelector` y lo opera:

   ```ts
   // src/components/islands/catalog/catalog.ts
   const img = node.querySelector<HTMLImageElement>('[data-card-img]');
   if (img) img.alt = product.nombre;
   ```

3. **En listas** se clona un `<template>` por cada ítem y la interacción se resuelve con **delegación de eventos**: un solo listener en el contenedor que sube desde el clic hasta el hook más cercano con `closest()`:

   ```ts
   // src/components/islands/admin/product-admin.ts
   rowsEl.addEventListener('click', (event) => {
     const row = event.target.closest('[data-product-row]');
     if (!row) return;
     const id = row.getAttribute('data-product-id');
   });
   ```

Resultado: el mismo script sirve para50 tarjetas o50 filas sin duplicar nada.

## Por qué es útil

| Problema sin hooks | Qué pasa con hooks `data-*` |
|---|---|
| Usar `id="precio"` en cada tarjeta | El HTML exige `id` único;50 tarjetas =HTML inválido. `data-card-price` se repite sin problema |
| Buscar elementos por clase CSS (`.card-title`) | Renombrar una clase por estilo rompería el JS. Los `data-*` existen **solo** para el JS: nadie los toca al refactorizar CSS |
| Compartir estado entre islands | Astro no hidrata frameworks acá; los islands no se hablan entre sí. El DOM + `localStorage` (vía `storage.ts`) son los canales oficiales |
| Variables globales (`window.count`) | Cada island es un módulo aislado: sin globals, sin orden de carga frágil, sin colisiones |

**El contraejemplo real** está documentado en `doc/astrobase.md` §3.4: el ejemplo original de `Card.astro` usaba `id="contador"` fijo y un `let count` global. Funciona con **una** card; con20 productos, las20 comparten el mismo `id` (inválido) y la misma variable (todas suman el mismo número). El patrón correcto es exactamente el de hoy: hook `data-*` + módulo que busca sus elementos **relativos al contenedor que lo dispara** (`closest()`).

## ¿Hay algo mejor?

Para este stack —**Astro estático + islands sin framework**— los `data-*` son la mejor relación simplicidad/poder. Las alternativas, con su tradeoff:

| Alternativa | Sirve cuando | Por qué no (o no todavía) acá |
|---|---|---|
| `id` + `getElementById` | Elemento único por página (p.ej. un modal raíz) | Imposible en listas repetidas (catálogo, filas) |
| Clases CSS como hook (`.js-toggle`) | — | Mezcla estilo y comportamiento; un refactor de CSS rompe comportamiento |
| Globales en `window` | — | Acoplamiento y colisiones; viola el aislamiento de islands |
| **Web Components** (`<product-row>` como custom element) | Los islands crecen y necesitan ciclo de vida propio (`connectedCallback`), estado encapsulado y reutilización entre páginas | Más poder, pero también más complejidad (shadow DOM, polyfills, curva). Candidato real **si** la UI se complica de más |
| Framework con bindings (React/Vue props) | Se adopta un framework island completo | Cambia la arquitectura entera: hidratación, bundle, y las invariantes de `astrobase.md` §1. Decisión de proyecto, no de un hook |

**Regla práctica:** si hoy resolvés con `querySelector('[data-x]')` + delegación, no hay nada mejor que esté justificado. El día que un componente acumule tanto estado que los handlers ya no entren en la isla, ahí se evalúa Web Components — no antes.

## Checklist de la casa

- [ ] Todo elemento que el JS toca tiene hook `data-*` (nombres en kebab-case, significado estable)
- [ ] Cero `id="..."` fijo dentro de islands/listas (gate automático: `grep 'id="' src/components/islands`)
- [ ] Las listas usan `<template>` + `cloneNode` + `closest()` (un listener, no uno por fila)
- [ ] Los islands **nunca** buscan por clase CSS; las clases son exclusivas de estilo
- [ ] Entre islands, el estado viaja por DOM + `storage.ts` — jamás por variables compartidas

## Referencias

- `doc/astrobase.md` §3.4 — la historia de `id="contador"` y el patrón de módulos por isla
- `src/components/islands/catalog.ts` — `paintCard()`: template + hooks de tarjeta
- `src/components/islands/product-admin.ts` — delegación con `closest('[data-product-row]')`
- Gates de invariantes en los planes: `grep 'id="' src/components/islands` →0
