# Guía de estilos — POS (Astro + Tailwind v4)

## 0. Para quién es esta interfaz (y por qué manda sobre el diseño)

Esta guía no es una paleta "bonita" elegida al azar: cada decisión está tomada pensando en el usuario real del sistema — una persona adulta mayor, posiblemente con visión reducida, y sin mucha cercanía con la tecnología, que va a usar esto en una tablet o celular, de pie, en medio de una venta.

Eso implica reglas no negociables por encima de cualquier preferencia estética:

- **Contraste alto siempre.** Nada de grises apagados sobre grises. Texto oscuro sólido sobre fondo claro sólido.
- **Texto grande por defecto.** La base de esta guía es 18px, no 16px. Nada de textos "pequeños y elegantes".
- **Pocos colores, con significado fijo.** Un color = una acción/estado, siempre igual en toda la app. Nunca decoración porque sí.
- **Sin depender de `:hover`.** El dispositivo principal es táctil. Todo lo importante debe verse y funcionar sin pasar el mouse por encima.
- **Botones grandes y separados.** Manos que pueden temblar o no apuntar con precisión necesitan áreas de toque generosas (mínimo 48–56px) y espacio entre botones, no elementos pegados.
- **Un solo tema, sin modo oscuro automático.** Introducir un modo oscuro que cambie solo (por `prefers-color-scheme`) es una fuente de confusión para alguien que no entiende por qué "la app cambió sola". Esta guía define **un único tema fijo**, muy legible, y ya.

Todo lo de abajo (colores, tipografía, componentes) es la implementación concreta de estos principios, no al revés. Si en algún momento tienes que elegir entre "se ve más moderno" y "se lee más fácil", gana lo segundo.

---

## 1. Setup en Astro con Tailwind v4

Tailwind v4 ya no usa `tailwind.config.js` para los tokens de diseño: se declaran directamente en CSS con `@theme`. En tu proyecto Astro:

```css
/* src/styles/global.css */
@import "tailwindcss";

@theme {
  /* ver secciones 2 y 3 */
}
```

Y lo importas una sola vez en tu layout base:

```astro
---
// src/layouts/Layout.astro
import "../styles/global.css";
---
```

Todo lo que definas dentro de `@theme` genera automáticamente clases de utilidad de Tailwind. Por eso el **nombre que le pongas a la variable es el nombre de la clase** — de ahí la importancia de la convención de nombrado de la sección 2.

---

## 2. Tokens de color

### 2.1 Convención de nombrado

Se usan **nombres semánticos**, no nombres de color crudos (nada de `azul-500` o `blue-600`). La razón: si el día de mañana cambias el tono exacto del azul, no tienes que salir a buscar y reemplazar `bg-blue-600` en 40 archivos — solo cambias el valor del token `primary` una vez, en un solo lugar.

Cada color "de marca" tiene hasta 3 variantes, siempre con el mismo patrón:

| Sufijo | Para qué sirve | Ejemplo de uso |
|---|---|---|
| `{nombre}` | El color base, para fondos o bordes | `bg-primary`, `border-primary` |
| `{nombre}-hover` | Estado presionado/activo (no hover de mouse, sino feedback táctil) | `active:bg-primary-hover` |
| `{nombre}-content` | El color de **texto/ícono** que va encima de ese fondo, ya validado con buen contraste | `text-primary-content` |

Esto evita el error típico de "puse texto gris sobre un botón azul y ahora no se lee": el color de contenido correcto ya viene emparejado con su fondo.

### 2.2 Declaración en `@theme`

```css
@theme {
  /* Base de la interfaz */
  --color-bg: #F7F5F1;          /* fondo general de la app, blanco cálido, no gris frío */
  --color-surface: #FFFFFF;      /* tarjetas, modales, barras — un nivel por encima del fondo */
  --color-border: #D8D3C8;       /* líneas divisorias, bordes de inputs */

  --color-text: #1A1A1A;         /* texto principal, casi negro */
  --color-text-muted: #4B4B46;   /* texto secundario — sigue siendo bien legible, no gris claro */

  /* Acción principal: la app tiene UN solo azul, para UNA sola idea: "acción principal" */
  --color-primary: #1C4E80;
  --color-primary-hover: #163E66;
  --color-primary-content: #FFFFFF;

  /* Confirmación / éxito: venta cerrada, guardado correcto */
  --color-success: #1F7A3D;
  --color-success-hover: #17612F;
  --color-success-content: #FFFFFF;

  /* Peligro / destructivo: eliminar, cancelar venta, error */
  --color-danger: #B3261E;
  --color-danger-hover: #8F1E18;
  --color-danger-content: #FFFFFF;

  /* Advertencia: stock bajo, sesión por vencer */
  --color-warning: #A85D00;
  --color-warning-hover: #874A00;
  --color-warning-content: #FFFFFF;
}
```

Todos estos pares fondo/texto fueron elegidos para pasar contraste alto (la mayoría por encima de 6:1, el mínimo aceptable con texto blanco), que es justo lo que le importa a alguien con visión reducida — no el gusto por el tono exacto de azul.

### 2.3 Qué significa cada color (y solo eso)

No hay una paleta decorativa aparte "para que se vea bonito". Cada color tiene un solo trabajo:

| Color | Significa | No usar para |
|---|---|---|
| `primary` | La acción principal de la pantalla ("Cobrar", "Agregar al carrito", "Guardar") | Decoración, íconos sueltos, texto normal |
| `success` | Algo se completó bien (venta registrada, sincronizado) | Botones de acción que aún no pasó nada |
| `danger` | Eliminar, cancelar, error — algo que requiere pensarlo dos veces | Advertencias que no son graves |
| `warning` | Alerta que no bloquea pero hay que mirar (stock bajo, sin conexión) | Errores reales (eso es `danger`) |
| `text-muted` | Texto secundario (subtítulos, ayuda) | Texto que el usuario necesita leer sí o sí (precio, total) |

Si una pantalla necesita "un color más", la respuesta casi siempre es: no necesita un color más, necesita mejor jerarquía con los que ya tiene (tamaño, peso de fuente, espacio).

### 2.4 Uso correcto en Tailwind (clases reales)

```html
<!-- Botón principal -->
<button class="bg-primary text-primary-content active:bg-primary-hover">
  Cobrar venta
</button>

<!-- Botón de peligro -->
<button class="bg-danger text-danger-content active:bg-danger-hover">
  Cancelar venta
</button>

<!-- Tarjeta -->
<div class="bg-surface border border-border">
  ...
</div>

<!-- Texto -->
<p class="text-text">Texto principal, siempre legible</p>
<p class="text-text-muted">Texto de apoyo, secundario</p>

<!-- Etiqueta de advertencia -->
<span class="bg-warning text-warning-content">Stock bajo</span>
```

La regla es simple: **`bg-{token}` siempre va acompañado de `text-{token}-content`**, nunca de un texto adivinado a ojo.

---

## 3. Tokens de tipografía

### 3.1 Elección de fuente (y por qué)

Se usa **una sola familia tipográfica en toda la app**: [Atkinson Hyperlegible](https://brailleinstitute.org/freefont). No es una elección "de moda" — es una fuente diseñada específicamente por el Braille Institute para maximizar la legibilidad de personas con baja visión: las letras que suelen confundirse (`I` `l` `1`, `O` `0`) se distinguen claramente incluso a tamaños pequeños o con visión reducida. Es exactamente el problema que tiene el usuario de este POS, así que no hace falta "inventar" una solución mejor.

Si no está disponible (sin internet en la primera carga, por ejemplo), cae a fuentes del sistema con buena legibilidad general, nunca a una fuente decorativa.

```css
@theme {
  --font-sans: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
}
```

Cárgala en el `<head>` de tu layout (self-hosted es preferible a depender de un CDN externo, dado que la app debe funcionar offline como PWA):

```astro
---
// En el <head> del Layout.astro
---
<link rel="preload" href="/fonts/AtkinsonHyperlegible-Regular.woff2" as="font" type="font/woff2" crossorigin>
<style>
  @font-face {
    font-family: "Atkinson Hyperlegible";
    src: url("/fonts/AtkinsonHyperlegible-Regular.woff2") format("woff2");
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: "Atkinson Hyperlegible";
    src: url("/fonts/AtkinsonHyperlegible-Bold.woff2") format("woff2");
    font-weight: 700;
    font-display: swap;
  }
</style>
```

### 3.2 Escala de tamaños

La base no es 16px (el default web típico) sino **18px**, y se sube desde ahí. Nada en la interfaz debería verse más chico que el `text-base` de esta escala — ni ayuda, ni pies de página, ni etiquetas.

```css
@theme {
  --text-base: 1.125rem;        /* 18px — piso mínimo de toda la app */
  --text-base--line-height: 1.6;

  --text-lg: 1.25rem;           /* 20px — texto de botones e inputs */
  --text-lg--line-height: 1.5;

  --text-xl: 1.5rem;            /* 24px — precios, totales, subtítulos */
  --text-xl--line-height: 1.4;

  --text-2xl: 1.875rem;         /* 30px — títulos de sección */
  --text-2xl--line-height: 1.3;

  --text-3xl: 2.25rem;          /* 36px — el total a pagar, lo más importante de la pantalla */
  --text-3xl--line-height: 1.2;
}
```

Uso:

```html
<p class="text-base text-text">Texto normal de la app</p>
<button class="text-lg">Agregar al carrito</button>
<span class="text-xl text-text-muted">Subtotal</span>
<span class="text-3xl text-primary font-bold">S/ 45.50</span>
```

### 3.3 Peso y jerarquía sin inventar tamaños nuevos

Antes de crear un tamaño de texto nuevo, prueba si el problema se resuelve con peso (`font-medium`, `font-bold`) o color (`text-text` vs `text-text-muted`). Con la escala de arriba (4 tamaños + base) alcanza para toda la app: un POS no necesita 10 niveles de jerarquía tipográfica, necesita que el total a pagar sea imposible de no ver.

---

## 4. Componentes reutilizables con `@apply`

Con Tailwind v4, `@apply` sigue funcionando igual dentro de tu CSS. Úsalo para no repetir 6 clases cada vez que pongas un botón — defines el componente una vez y lo usas por nombre.

```css
/* src/styles/global.css, debajo de @theme */

@layer components {
  .btn {
    @apply inline-flex items-center justify-center gap-2
           rounded-lg px-6 py-4 text-lg font-semibold
           min-h-14 min-w-14
           transition-colors
           focus-visible:outline focus-visible:outline-2
           focus-visible:outline-offset-2 focus-visible:outline-primary
           disabled:opacity-50 disabled:pointer-events-none;
  }

  .btn-primary {
    @apply btn bg-primary text-primary-content active:bg-primary-hover;
  }

  .btn-success {
    @apply btn bg-success text-success-content active:bg-success-hover;
  }

  .btn-danger {
    @apply btn bg-danger text-danger-content active:bg-danger-hover;
  }

  .btn-secondary {
    @apply btn bg-surface text-text border-2 border-border active:bg-bg;
  }

  .input-field {
    @apply w-full rounded-lg border-2 border-border bg-surface
           px-4 py-3 text-lg text-text
           focus-visible:outline focus-visible:outline-2
           focus-visible:outline-offset-2 focus-visible:outline-primary;
  }

  .card {
    @apply rounded-xl border border-border bg-surface p-5;
  }

  .badge-warning {
    @apply inline-block rounded-full bg-warning px-3 py-1
           text-base font-semibold text-warning-content;
  }
}
```

Uso en las páginas/componentes `.astro`:

```html
<button class="btn-primary">Cobrar venta</button>
<button class="btn-danger">Cancelar</button>
<button class="btn-secondary">Volver</button>

<input class="input-field" type="number" placeholder="Cantidad">

<div class="card">
  <p class="text-xl font-semibold text-text">Coca-Cola 500ml</p>
  <p class="text-lg text-text-muted">S/ 3.50</p>
  <span class="badge-warning">Quedan 2</span>
</div>
```

Nota el `min-h-14 min-w-14` en `.btn` (56px × 56px): ese es el tamaño mínimo real de área táctil recomendado para que alguien con motricidad reducida no falle el toque. No lo bajes "para que se vea más compacto".

---

## 5. Reglas de accesibilidad que no son opcionales

Estas no son "nice to have" para este público, son la diferencia entre que la app se pueda usar o no:

1. **Foco visible siempre.** Todo elemento interactivo necesita un `focus-visible:outline` claro (ya incluido en `.btn` e `.input-field` arriba). No lo quites por estética.
2. **Nunca solo color.** Un estado de "stock bajo" o "error" debe tener también un texto o ícono, no solo un cambio de color — alguien con baja visión de color no lo va a notar.
3. **Nada de interacciones solo-hover.** Si algo solo aparece al pasar el mouse (tooltips, menús), en una tablet táctil simplemente no existe. Todo lo importante debe ser visible por defecto o accesible con un toque.
4. **Espaciado entre botones, no solo tamaño.** Dos botones grandes pegados siguen siendo fáciles de confundir. Deja al menos `gap-3` (12px) entre elementos tocables, más en acciones destructivas (`btn-danger`) cerca de otras.
5. **Confirmar antes de destruir.** Cualquier acción con `btn-danger` (cancelar venta, eliminar producto) pide confirmación explícita — nunca un solo toque accidental borra algo.
6. **Sin modo oscuro automático.** Un solo tema, el de esta guía. Si más adelante se pide modo oscuro, debe ser una elección explícita del usuario en un ajuste, nunca algo que cambie solo porque el celular tiene el modo oscuro activado.
7. **Copys en lenguaje simple y directo.** "Cobrar venta", no "Procesar transacción". "No se pudo guardar, revisa tu conexión", no "Error 500". El usuario no tiene por qué entender jerga técnica.

---

## 6. Qué evitar explícitamente

- Grises claros sobre fondos claros ("gris sobre gris"), aunque se vea elegante en un mockup — es lo primero que alguien con baja visión deja de leer.
- Texto por debajo de `text-base` (18px) en cualquier parte de la interfaz.
- Más de los 4 colores semánticos definidos (`primary`, `success`, `danger`, `warning`) para elementos de UI. Si sientes que "falta un color", probablemente falta jerarquía, no color.
- Botones o íconos sin etiqueta de texto (un ícono de basurero solo, sin la palabra "Eliminar", es ambiguo para este público).
- Animaciones decorativas o transiciones largas — usa `transition-colors` corto y funcional, nunca movimiento que no comunique un cambio real de estado.
- Degradados, sombras suaves genéricas o bordes redondeados inconsistentes entre componentes — la superficie de la app debe sentirse plana, predecible y siempre igual a sí misma.