# Complementos a la especificación del POS

Este documento cierra los huecos detectados sobre los documentos anteriores (especificación, guía de estilos, guía de API, arquitectura de carpetas). No repite lo ya definido ahí, solo agrega lo que faltaba para poder implementar.

---

## 1. Ciclo de vida de `cola_sync`

Cada item en `cola_sync` es un objeto con estado propio, no solo "una venta pendiente":

```json
{
  "id": "uuid",
  "tipo": "registrarVenta" | "actualizarStock",
  "payload": { ... },
  "estado": "pendiente" | "enviando" | "sincronizado" | "error_permanente",
  "intentos": 0,
  "ultimo_intento": null,
  "creado": "2026-09-22T20:00:00.000Z"
}
```

**Reglas:**

- **FIFO.** Se procesan en el orden en que se crearon, uno a la vez — nunca en paralelo (evita saturar la cuota de ejecuciones de Apps Script y mantiene el orden de las ventas).
- **Disparadores de reintento:** evento `online` del navegador, y al abrir la app (si hay conexión). Nunca polling constante en segundo plano.
- **Backoff:** 1er intento inmediato, luego espaciado creciente (ej. 5s, 30s, 2min) hasta un máximo de **5 intentos**.
- **Al agotar los 5 intentos:** el item pasa a `error_permanente`. No se sigue reintentando solo — se muestra en la UI (ver sección 6) para que el dueño decida reintentar manualmente o descartarlo. Nunca se borra en silencio.
- **Éxito:** el item se marca `sincronizado` y se remueve de la cola (no se acumula historial de sincronizados ahí — el historial real vive en `historial_ventas`).
- **La venta nunca espera a la cola.** Se guarda en `historial_ventas` al cerrar la venta, sin importar el estado de sincronización — eso ya estaba definido en la especificación original y no cambia.

---

## 2. PWA en Astro

**Paquete:** `@vite-pwa/astro`.

**Qué cachear (app shell):**
- HTML, CSS, JS de la build → precache automático (lo hace el plugin).
- Fuente Atkinson Hyperlegible → precache, porque sin ella la app pierde legibilidad offline.

**Qué NO cachear con el service worker:**
- Las llamadas a Apps Script (`GET ?action=productos`, login, ventas) — esas ya tienen su propia estrategia de cache en `localStorage` (`catalogo_cache` con TTL) definida en la especificación. Cachearlas también a nivel de service worker duplica la lógica y puede servir datos más viejos de los que el propio `catalogo_cache` ya maneja.
- Las imágenes de Cloudinary — se sirven con `stale-while-revalidate` runtime caching (ver abajo), no en el precache, porque su cantidad crece con el catálogo.

**Estrategia runtime para imágenes:**
```
strategy: "StaleWhileRevalidate"
urlPattern: /^https:\/\/res\.cloudinary\.com\//
```
Muestra la imagen cacheada al instante y la actualiza en segundo plano si cambió.

**`manifest.json` — campos obligatorios:**
- `name` / `short_name`: nombre del negocio.
- `display: "standalone"` — para que abra como app, sin barra de navegador (menos confuso para el usuario objetivo).
- `theme_color` / `background_color`: usar `--color-primary` y `--color-bg` de la guía de estilos, no colores nuevos.
- `icons`: mínimo 192px y 512px, con `purpose: "any maskable"`.

**Actualización de versión:** cuando hay una nueva build, mostrar un aviso simple y no intrusivo ("Hay una actualización disponible" + botón "Actualizar ahora") en vez de recargar solo — recargar sin avisar puede perder una venta en curso.

---

## 3. Setup inicial (checklist, en orden)

1. **Google Sheet:** crear el archivo, con 3 hojas: `Productos`, `Ventas`, `Sesiones` (columnas exactas en la especificación, sección 2).
2. **Apps Script:** desde el Sheet, `Extensiones → Apps Script`. Crear los archivos de `api/apps-script/` (sección 3.7 de la arquitectura).
3. **Script Properties:** `Configuración del proyecto → Propiedades del script` → agregar `USUARIO` y `CLAVE` (o su hash).
4. **Deploy:** `Implementar → Nueva implementación → Aplicación web`. Ejecutar como "Yo" (el dueño del script), acceso "Cualquier persona". Copiar la URL que entrega — esa es la única URL que usará el frontend.
5. **Seed del catálogo:** correr el script de una sola vez contra DummyJSON (especificación, sección 4) para llenar `Productos` con datos de prueba.
6. **Cloudinary:** crear cuenta gratuita, anotar el `cloud name`.
7. **Astro — variables de entorno** (`.env`):
   ```
   PUBLIC_API_URL=https://script.google.com/macros/s/XXXXX/exec
   PUBLIC_CLOUDINARY_CLOUD_NAME=tu-cloud-name
   ```
8. **Primer login real:** entrar a la app, loguearse con el `USUARIO`/`CLAVE` del paso 3, confirmar que el token se guarda y que el catálogo carga.
9. **Deploy a producción:** ver sección 8.

---

## 4. Imágenes con Cloudinary

**Por qué:** ni Sheets ni Drive están hechos para servir imágenes optimizadas en producción (sin resize automático, sin CDN real, URLs poco estables). Cloudinary sí, y tiene plan gratuito suficiente para un catálogo de hasta ~1000 productos.

**Qué cambia en el modelo de datos:** la columna `imagen_url` de la hoja `Productos` (especificación, sección 2.1) ahora guarda directamente la URL de Cloudinary, no una URL cualquiera.

**Flujo de subida:** el dueño sube las fotos manualmente a Cloudinary (Media Library, arrastrar y soltar — no requiere código) y pega la URL resultante en la columna `imagen_url` del Sheet. No se construye un uploader dentro de la app — es innecesario para el volumen y la audiencia de este proyecto.

**Optimización automática vía URL** (sin tocar la imagen subida): agregar transformaciones directamente en la URL que se pide, por ejemplo:
```
https://res.cloudinary.com/tu-cloud/image/upload/f_auto,q_auto,w_400/producto.jpg
```
- `f_auto`: sirve el formato más liviano que soporte el navegador.
- `q_auto`: comprime sin que se note.
- `w_400`: nunca se pide una imagen más grande de lo que la card necesita.

**Si la imagen no carga o `imagen_url` está vacía:** mostrar un placeholder fijo (ícono genérico de producto, no un ícono roto de navegador) — nunca dejar el espacio en blanco, porque en una card sin foto un usuario con baja visión puede pensar que el producto no tiene datos.

**Lazy-load:** atributo `loading="lazy"` nativo del `<img>` alcanza, no hace falta una librería aparte.

---

## 5. *(Omitido por decisión del usuario — reporte del día y export CSV quedan fuera de esta pasada)*

> **Actualización 23/09/2026:** el **export CSV sigue omitido**. La **vista en pantalla** del reporte del día (historial agrupado por día + detalle de venta + tarjeta de caja del día con apertura/cierre/efectivo/diferencia) fue pedida explícitamente por el dueño e implementada en `doc/plan-mejoras-2.md` (Fases 2–4, hecho 23/09/2026) — no levanta esta exclusión para el CSV descargable.

---

## 6. Estados de UI transversales

Estos son estados que pueden aparecer en cualquier pantalla, no solo en una — se resuelven una vez y se reutilizan.

| Estado | Cuándo aparece | Cómo se muestra | Dónde vive |
|---|---|---|---|
| **Sin conexión** | Evento `offline` del navegador | Barra fija arriba, color `warning`, texto "Sin conexión — puedes seguir vendiendo" | `components/ui/OfflineBanner.astro`, controlada por un listener en `stores/session.ts` |
| **Catálogo desactualizado** | TTL de `catalogo_cache` vencido pero sin red para refrescar | Texto pequeño no intrusivo: "Catálogo actualizado hace X min" + botón "Actualizar" | Dentro de `CatalogContainer.astro` (sección 3.3 de la arquitectura) |
| **Sincronizando** | `cola_sync` tiene items en estado `pendiente` o `enviando` | Ícono discreto en el header (ej. una nube con flecha), nunca bloquea la interacción | `components/smart/SyncStatusIndicator.astro`, lee `cola_sync` vía `utils/storage.ts` |
| **Error permanente de sync** | Un item de `cola_sync` llegó a `error_permanente` | Aviso más visible (color `danger`) con botón "Reintentar" y "Descartar" — nunca se resuelve solo | Mismo `SyncStatusIndicator`, con un `Modal.astro` para el detalle |
| **Catálogo vacío** | Primera carga, antes del seed, o el Sheet realmente no tiene productos activos | Mensaje simple + ilustración/ícono, sin tecnicismos: "Todavía no hay productos cargados" | `components/ui/EmptyState.astro`, reutilizable también para "sin resultados de búsqueda" |
| **Error genérico de acción** | Cualquier `error_interno`/`payload_invalido` de la API | Mensaje corto en lenguaje simple (ver guía de estilos, sección 5.7), nunca el código de error crudo | Toast/alerta simple con los colores `danger`/`warning` ya definidos |

Regla general: ningún estado de estos debe bloquear la venta en curso — todos son informativos, salvo la confirmación explícita antes de una acción destructiva (ya cubierta en la guía de estilos).

---

## 7. Convención de nombrado (código en inglés, dominio en español)

Se resuelve así, sin mezclar los dos criterios en el mismo lugar:

| Qué | Idioma | Ejemplo |
|---|---|---|
| Carpetas, archivos, funciones, variables de código (`utils/`, `api/`, `stores/`) | **Inglés** | `storage.ts`, `getCart()`, `formatCurrency()` |
| Nombres de componentes Astro | **Inglés** | `Card.astro`, `CatalogContainer.astro` |
| Columnas del Sheet, claves del JSON del contrato de la API, `localStorage` | **Español** (ya fijado en la especificación y la guía de API, no se toca) | `nombre`, `precio`, `catalogo_cache`, `cola_sync` |
| Texto visible al usuario (UI, mensajes de error) | **Español** | "Agregar al carrito", "Sin conexión" |

**Por qué así y no todo en un solo idioma:** el contrato de datos (Sheet + JSON) ya está escrito y documentado en español en los otros documentos — cambiarlo ahora rompe la guía de API. Lo que sí estaba indefinido era el código de infraestructura, y ese se fija en inglés porque es el estándar del ecosistema (Astro, Tailwind, librerías) con el que se integra.

**Regla práctica:** si estás nombrando algo que aparece en un JSON que viaja a Apps Script o en una columna del Sheet, va en español. Si estás nombrando una función, archivo o variable interna de JS/TS, va en inglés.

---

## 8. Deploy en Vercel (SSG)

- El proyecto se construye como **sitio estático** (SSG) — es el modo por defecto de Astro cuando no hay rutas server-rendered, y es lo que se necesita: no hay backend propio, todo el dato dinámico ya se resuelve client-side contra Apps Script.
- **No hace falta ningún adapter de Vercel para SSR** — con `output: "static"` (o el default de Astro) alcanza. Si en algún punto se agrega una ruta que necesite server, ahí sí se evalúa el adapter, no antes.
- **Build command:** `astro build` (el que detecta Vercel automáticamente al reconocer el framework).
- **Output directory:** `dist/` (default).
- **Variables de entorno:** `PUBLIC_API_URL` y `PUBLIC_CLOUDINARY_CLOUD_NAME` se configuran en el dashboard de Vercel (Project → Settings → Environment Variables), no se commitean en el repo.
- **HTTPS automático:** Vercel lo da por defecto — esto no es opcional, es requisito para que el service worker de la PWA funcione (los navegadores no registran service workers en HTTP salvo `localhost`).
- **Deploy continuo:** cada push a la rama principal dispara un build y deploy nuevo automáticamente; no hay paso manual de "subir" el sitio.
- **Dominio:** el subdominio gratuito de Vercel (`tu-proyecto.vercel.app`) es suficiente para empezar; un dominio propio es opcional y se agrega después sin cambiar nada de esta arquitectura.