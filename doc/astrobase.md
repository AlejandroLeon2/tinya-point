# Arquitectura de carpetas — POS en Astro (slots + SOLID + Smart/Dumb)

Esta guía describe **dónde va cada cosa y por qué**, no cómo escribirla. Está pensada para que un agente (o cualquier persona) implemente los componentes ya sabiendo en qué carpeta viven, qué responsabilidad tienen y qué no deben hacer.

Parte de un ejemplo ya definido (`Layout.astro` → `Catalog.astro` → `Card.astro` con slots nombrados y slot por defecto). Esa arquitectura de slots es el esqueleto de composición; lo que agrega esta guía es dónde se ubica cada pieza y cómo se separan responsabilidades alrededor de ella.

---

## 1. Principio general

Tres reglas gobiernan toda la estructura:

1. **Los componentes que se ven (`ui/`) no saben de dónde vienen los datos.** Reciben props y slots, listo. Nunca hacen `fetch`, nunca tocan `localStorage`, nunca importan nada de `api/`.
2. **Los componentes que orquestan (`smart/`) no dibujan nada por sí mismos.** Piden datos, arman el estado, y se lo pasan a los componentes de `ui/` — la parte visual siempre vive en `ui/`, nunca duplicada dentro de un `smart/`.
3. **Toda petición HTTP pasa por `api/`.** Ningún componente, smart o dumb, escribe un `fetch(...)` suelto. Si `api/` no tiene la función que se necesita, se agrega ahí — nunca se inventa una llamada aparte "por rapidez".

Esto es, en el fondo, la separación **Smart (contenedor) / Dumb (presentacional)** aplicada a Astro, sostenida por el principio de **inversión de dependencias** de SOLID: los componentes visuales dependen de una forma de datos (props), no de la fuente concreta de esos datos (Apps Script, localStorage, lo que sea).

---

## 2. Árbol de carpetas

```
src/
├── layouts/
│   └── Layout.astro
│
├── components/
│   ├── ui/
│   │   ├── Catalog.astro
│   │   ├── Card.astro
│   │   ├── Button.astro
│   │   ├── Modal.astro
│   │   ├── Badge.astro
│   │   └── Header.astro
│   │
│   ├── smart/
│   │   ├── CatalogContainer.astro
│   │   ├── CartSummary.astro
│   │   ├── LoginForm.astro
│   │   └── CheckoutPanel.astro
│   │
│   └── islands/
│       ├── quantity-control.ts
│       ├── modal-controller.ts
│       └── cart-badge.ts
│
├── stores/
│   ├── cart.ts
│   └── session.ts
│
├── utils/
│   ├── storage.ts
│   ├── modal.ts
│   ├── format.ts
│   ├── dom.ts
│   └── validators.ts
│
├── api/
│   ├── client.ts
│   ├── actions/
│   │   ├── auth.ts
│   │   ├── productos.ts
│   │   ├── ventas.ts
│   │   └── stock.ts
│   ├── types.ts
│   └── apps-script/
│       ├── Code.gs
│       ├── auth.gs
│       ├── productos.gs
│       ├── ventas.gs
│       ├── utils.gs
│       └── appsscript.json
│
└── pages/
    ├── index.astro
    ├── login.astro
    └── historial.astro
```

---

## 3. Qué va en cada carpeta y por qué

### 3.1 `layouts/Layout.astro`

Es exactamente el `Layout.astro` del ejemplo: `<slot name="header" />`, `<slot />`, `<slot name="footer" />`. No lleva lógica, no lleva estilos de negocio, no sabe qué va a mostrar. Su único trabajo es la estructura `<html><body>` y los tres huecos de composición. Cualquier otro layout (por ejemplo uno para la pantalla de login, sin footer) va en un archivo aparte dentro de la misma carpeta (`LayoutAuth.astro`), nunca como un `if` dentro de este.

### 3.2 `components/ui/` — componentes "dumb" (presentacionales)

Regla de admisión a esta carpeta: **si el componente necesita datos, se los tienen que pasar por props o slots; si no se los pasan, no los tiene.** Nada de `import` desde `api/` o `utils/storage.ts` aquí dentro.

- **`Catalog.astro`** — el de la especificación: un `<section>` con título y un `<slot />` por defecto donde entran las `Card`. No sabe cuántas cards hay, ni de dónde salieron.
- **`Card.astro`** — recibe `nombre`, `img`, `desc`, `precio` por props, y expone el `slot="extra"` para que quien la use agregue cosas encima (un contador, un badge de "poco stock", lo que sea) sin tocar el archivo de `Card.astro`. Esto es directamente el principio **Open/Closed** de SOLID: `Card` está *cerrada a modificación* (no se edita su código para cada caso de uso nuevo) pero *abierta a extensión* (vía el slot).
- **`Button.astro`, `Badge.astro`, `Modal.astro` (shell visual), `Header.astro`** — piezas visuales reutilizables de la guía de estilos anterior, convertidas en componentes. `Modal.astro` aquí es solo el *marco* visual (overlay, caja, botón de cerrar); la lógica de abrir/cerrar vive en `utils/modal.ts` (sección 3.5), nunca dentro del `.astro`.

### 3.3 `components/smart/` — componentes "contenedores"

Estos sí importan de `api/` y `stores/`. Su trabajo es **buscar datos, transformarlos a la forma que las piezas de `ui/` esperan, y renderizarlas** — nunca definen su propio HTML de tarjeta o botón, siempre delegan en `ui/`.

- **`CatalogContainer.astro`** — llama a `api/actions/productos.ts` (o lee `catalogo_cache` de `localStorage` vía `utils/storage.ts` si ya está fresco), y renderiza `<Catalog>` pasándole una `<Card>` por producto. Es el punto donde vive la decisión "¿pido al Sheet o uso cache?" — ese conocimiento no debe filtrarse a `Catalog.astro` ni a `Card.astro`.
- **`CartSummary.astro`** — lee el carrito desde `stores/cart.ts`, calcula subtotal/impuesto/total, y se lo pasa a componentes de `ui/` para mostrarlo. No sabe nada de cómo se guarda el carrito internamente, solo consume el store.
- **`LoginForm.astro`** — arma el formulario visual con piezas de `ui/`, pero la llamada real de login vive en `api/actions/auth.ts`; este componente solo la invoca y reacciona al resultado (guardar token, redirigir, mostrar error).
- **`CheckoutPanel.astro`** — orquesta el cierre de venta: junta los datos del carrito, llama a `api/actions/ventas.ts` y `api/actions/stock.ts`, actualiza `historial_ventas` vía `utils/storage.ts`, y limpia el carrito en `stores/cart.ts`. Es el componente más "sabio" de toda la app — y por eso mismo el más chico posible en lo visual: delega todo el dibujo a `ui/`.

### 3.4 `components/islands/` — comportamiento interactivo del lado del cliente

Astro no hidrata nada por defecto; cualquier interacción real (un contador, abrir un modal, sumar cantidad) necesita un script que corra en el navegador. Esta carpeta guarda **esos scripts como módulos con nombre**, en vez de scripts sueltos pegados con `<script slot="extra">` dentro de cada componente.

Esto es importante porque el ejemplo original de `Card.astro` mete un contador con una variable `let count` global y un `id="contador"` fijo. Eso funciona para **una** card en la página, pero en cuanto el catálogo pinta 20 productos, las 20 comparten el mismo `id` (inválido en HTML) y la misma variable `count` (todas suman al mismo número). La forma correcta es que cada instancia de `Card` que necesite un contador importe `islands/quantity-control.ts`, y ese módulo busque sus propios elementos **relativos a la card que lo contiene** (por ejemplo, subiendo desde el botón que disparó el evento hasta su contenedor `.card` más cercano), nunca por un `id` fijo compartido. Así el mismo script sirve para todas las cards sin que se pisen entre sí.

- **`quantity-control.ts`** — la lógica de sumar/restar cantidad dentro de una card, escrita una sola vez y reutilizada.
- **`modal-controller.ts`** — abrir/cerrar cualquier `Modal.astro`, con manejo de foco y tecla `Esc` (importante para la guía de accesibilidad ya definida).
- **`cart-badge.ts`** — actualiza el contador visible del carrito cuando cambia `stores/cart.ts`, sin recargar la página.

### 3.5 `utils/` — lógica compartida que no es interactividad de UI

Todo lo que hoy se repetiría copiado y pegado entre componentes va acá, sin excepción:

- **`storage.ts`** — el único lugar que sabe los nombres exactos de las llaves de `localStorage` (las 8 de `base.md` §2.3) y expone funciones para leer/escribir cada una. Ningún otro archivo del proyecto escribe `localStorage.setItem` directamente — así, si el día de mañana cambia el nombre de una llave o se agrega versionado, se cambia en un solo lugar.
- **`modal.ts`** — funciones genéricas de abrir/cerrar/trap de foco reutilizadas por cualquier modal de la app (confirmar cancelación de venta, ver detalle de producto, etc.), para no reescribir la misma lógica de accesibilidad en cada modal nuevo.
- **`format.ts`** — formateo de moneda, fechas y números (por ejemplo, precios siempre con 2 decimales y el símbolo `S/`), para que no haya una card con `$12` y otra con `S/ 12.00`.
- **`dom.ts`** — helpers pequeños de selección/eventos usados por los módulos de `islands/` (por ejemplo, "encuentra el `.card` más cercano a este elemento").
- **`validators.ts`** — validaciones simples reutilizadas (cantidad no negativa, campos de login no vacíos, etc.).

### 3.6 `stores/` — estado compartido entre componentes

Como los componentes de Astro se hidratan de forma aislada (cada isla es independiente), el carrito o la sesión no pueden vivir solo "en memoria de un componente" si otro componente en otra parte de la página necesita leerlo (por ejemplo, `CartSummary` y el botón "Agregar" de cada `Card` no son el mismo componente). Por eso el estado compartido se centraliza en `stores/` en vez de resolverse a punta de props entre componentes que ni siquiera son hermanos directos.

- **`cart.ts`** — estado del carrito actual, con funciones para agregar/quitar/editar cantidad, siempre respaldadas por `utils/storage.ts` para persistir en `localStorage`.
- **`session.ts`** — token actual, si hay sesión vigente, y la función para cerrarla.

### 3.7 `api/` — toda petición HTTP centralizada

- **`client.ts`** — la única función que hace `fetch` de verdad en todo el proyecto (`llamarApi(action, data)` de la guía anterior). Sabe el `Content-Type` correcto para evitar el problema de CORS con Apps Script, arma el body con el token vigente, y detecta `unauthorized` para limpiar la sesión.
- **`actions/`** — una función por acción de negocio (`login()`, `obtenerProductos()`, `registrarVenta()`, `actualizarStock()`), cada una llamando internamente a `client.ts`. Los componentes `smart/` importan de aquí, nunca de `client.ts` directamente — así cada acción puede tener su propia validación de payload antes de salir, sin ensuciar el cliente genérico.
- **`types.ts`** — las formas exactas de request/response definidas en la guía de la API (los mismos JSON documentados ahí), para que cualquier cambio en el contrato se note en un solo archivo.
- **`apps-script/`** — el código fuente de Apps Script (`Code.gs`, `auth.gs`, `productos.gs`, `categorias.gs`, `marcas.gs`, `ventas.gs`, `caja.gs`, `utils.gs`, `appsscript.json`) vive **dentro del mismo repositorio**, aunque no se compile con Astro. Esto no es solo orden: es lo que permite tener control de versiones real del backend (vía `clasp push`/`clasp pull`) en vez de que el código de Apps Script exista únicamente pegado en el editor web de Google, sin historial ni respaldo. (El esquema de las hojas — `crearHojas()`/`estadoSetup()` — vive aparte en `setup/setup.gs`, que no es parte del router.)

### 3.8 `pages/`

Las páginas reales de Astro (`index.astro`, `login.astro`, `historial.astro`) son las únicas que combinan `Layout` con componentes `smart/`. Una página nunca importa un componente de `ui/` directamente si existe un `smart/` equivalente que ya sabe conseguirle los datos — así se evita que la lógica de "cómo consigo el catálogo" quede duplicada en dos páginas distintas.

---

## 4. Cómo encaja el ejemplo dado en esta arquitectura

| Pieza del ejemplo | Carpeta destino | Nota |
|---|---|---|
| `Layout.astro` | `layouts/` | Sin cambios de fondo, es la base de todo |
| `Catalog.astro` | `components/ui/` | Sigue siendo puramente presentacional |
| `Card.astro` | `components/ui/` | Igual, pero el contador del `slot="extra"` se implementa con `islands/quantity-control.ts`, no con un script suelto con variable global |
| El armado de `<Catalog><Card /></Catalog>` con datos reales | `components/smart/CatalogContainer.astro` | Este es el que falta en el ejemplo: alguien tiene que decidir *qué* cards pintar, y ese "alguien" no debe ser la página ni el propio `Catalog.astro` |
| El `<script slot="extra">` con `let count` | se reemplaza por `islands/quantity-control.ts` | Mismo comportamiento visible, pero sin colisión entre cards ni variables globales |

---

## 5. SOLID aplicado a esta arquitectura, en una línea cada uno

- **Single Responsibility**: `Card` dibuja una card, `Catalog` organiza el layout, `CatalogContainer` consigue los datos — nunca las tres cosas en un mismo archivo.
- **Open/Closed**: el `slot="extra"` de `Card` es la vía para agregar comportamiento nuevo (contador, badge, etiqueta de oferta) sin editar `Card.astro` cada vez.
- **Liskov Substitution**: cualquier cosa que se use como `slot="header"` del `Layout`, o cualquier `Card` distinta que respete las mismas props, debe poder reemplazar a la actual sin romper el layout que la envuelve.
- **Interface Segregation**: los props de cada componente son específicos y chicos (`nombre`, `img`, `desc`, `precio` en `Card`, no un objeto `config` gigante con veinte campos opcionales que la mayoría de usos ni llena).
- **Dependency Inversion**: los componentes de `ui/` dependen de props (una abstracción), no de `fetch` ni de `localStorage` (los detalles concretos); esos detalles quedan encapsulados en `api/` y `utils/storage.ts`.

---

## 6. Reglas de oro para quien implemente los componentes

1. Si un componente en `components/ui/` necesita importar algo de `api/` o `utils/storage.ts`, es la señal de que en realidad pertenece a `components/smart/`.
2. Si dos componentes distintos repiten la misma lógica de `localStorage`, de modal, o de formateo, esa lógica sale de ahí y entra a `utils/`.
3. Ningún `fetch` fuera de `api/client.ts`.
4. Ningún script interactivo pegado inline dentro de un `.astro` que dependa de variables globales o de un `id` fijo — todo comportamiento de cliente reutilizable vive en `components/islands/` y se escribe pensando en que va a existir más de una instancia del componente en la misma página a la vez.
5. El código de Apps Script vive versionado en `api/apps-script/` dentro del repo, no solo en el editor web de Google.