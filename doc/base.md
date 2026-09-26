# Especificación: Punto de Venta (POS) — Astro + Google Sheets

## Contexto del proyecto

Sistema de punto de venta para **negocio pequeño atendido por una sola persona** (bodega, tienda de barrio, emprendimiento). No es multi-cajero, no es multi-sucursal. El objetivo es que esa persona pueda vender rápido, ver su stock, y llevar un registro, sin pagar hosting de base de datos ni mantener un backend tradicional.

**No hay backend propio ni base de datos.** Se usa:
- **Google Sheets** como almacén de catálogo (y respaldo de ventas)
- **Google Apps Script** como capa de API sobre ese Sheet
- **Astro (PWA)** como frontend, con **localStorage** como fuente de verdad operativa del día a día

Este documento define arquitectura, alcance y lo que NO se debe intentar implementar, para evitar sobre-ingeniería.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Astro (modo estático o `hybrid`, no server puro) |
| PWA / offline | `@vite-pwa/astro` |
| Fuente de catálogo | Google Sheets |
| "API" sobre Sheets | Google Apps Script (Web App, `doGet`/`doPost`) |
| Cache operativo | `localStorage` del navegador |
| Datos de prueba iniciales | DummyJSON (`/products`), usado solo para poblar el Sheet una vez, no en producción |

No usar Tina CMS: asume un editor de contenido dedicado, lo cual no aplica cuando el dueño del negocio es también el cajero y prefiere una hoja de cálculo que ya sabe usar.

---

## 2. Modelo de datos

### 2.1 Google Sheet — hoja "Productos" (catálogo maestro)

| Columna | Tipo | Notas |
|---|---|---|
| id | string | único, no editable por UI |
| nombre | string | |
| categoria | string | |
| marca | string | opcional — vocabulario controlado por la hoja "Marcas" |
| precio | number | |
| stock | number | se actualiza vía Apps Script al vender |
| sku / codigo_barras | string | opcional |
| imagen_url | string | opcional |
| activo | boolean | para ocultar sin borrar |

### 2.2 Google Sheet — hoja "Ventas" (log de respaldo, append-only)

| Columna | Tipo | Notas |
|---|---|---|
| fecha_hora | datetime | |
| id_venta | string | generado en cliente (uuid) |
| items | string (JSON) | snapshot de productos vendidos |
| total | number | |
| metodo_pago | string | efectivo / tarjeta / yape-plin |
| sincronizado | boolean | control interno |

Esta hoja es **respaldo/reporte**, no la fuente de verdad operativa de la venta en curso (esa es localStorage). Desde `appscriptbase.md` §4.15 es además la fuente de **lectura** de `/historial`: el cliente la mergea con su lista local (unión por `id_venta`, nada local se borra — ver §6 y §7).

### 2.3 localStorage (cliente)

- `catalogo_cache`: array de productos + `timestamp` de última sincronización
- `carrito_actual`: items en la venta en curso
- `historial_ventas`: ventas cerradas localmente (+ las que trae el merge con el Sheet, §4.15)
- `cola_sync`: ventas/movimientos de stock pendientes de enviar al Sheet (para modo offline)
- `cajas`: sesiones de caja — **6ta llave**, `plan-mejoras-2.md` Fase 2 (detalle en §2.4)
- `ajustes`: datos del negocio (nombre, moneda, tasa de IGV, umbral de alerta de stock) — **7ma llave**, agregada por `plan-productos-v2.md` Fase 5 (D4) y ampliada por `plan-stock.md` Fase 1; defaults aplicados cuando no existe
- `historial_cache`: solo `timestamp` de la última lectura del historial desde el Sheet — **8ma llave**, agregada por la §4.15. No guarda datos (viven en `historial_ventas`), solo frescura: mientras `ahora − timestamp < 5 min` (`TTL_HISTORIAL_MS`) /historial no vuelve a llamar a la API

Única función de mantenimiento de este bloque: **`storage.limpiarCaches()`** — borra SOLO las dos cachés rebuildables (`catalogo_cache` + `historial_cache`); su único llamante es el botón "Limpiar caché" de `/ajustes` (con confirmación en modal y guardia offline). Las demás llaves son **estado**, no caché, y no se borran desde ninguna UI.

### 2.4 Google Sheet — hoja "Cajas" (sesiones de apertura/cierre)

Nueva en `plan-mejoras-2.md` (Fase 0/2, decisión D1). Una fila por sesión de caja: se inserta al abrir y se actualiza al cerrar.

| Columna | Tipo | Notas |
|---|---|---|
| id_caja | string | uuid **generado en cliente** (mismo motivo que `id_venta`: la apertura se guarda local primero y puede encolarse offline); el cierre hace **upsert** por este id |
| fecha_día | string | día local `YYYY-MM-DD` **aportado por el cliente** — clave de agrupación del historial (única fecha que no genera el servidor) |
| fecha_hora_apertura | datetime | generado en servidor (`America/Lima`, no confiar en el reloj del cliente) |
| fecha_hora_cierre | datetime | generado en servidor |
| monto_apertura | number | efectivo con que se abre la caja (≥ 0) |
| conteo_cierre | number | efectivo físico contado al cerrar |
| efectivo_ventas | number | snapshot de totales del día por método, calculado en cliente al cierre y guardado tal cual |
| tarjeta_ventas | number | idem |
| yape_plin_ventas | number | idem |
| n_ventas | number | cantidad de ventas del `fecha_día` |
| diferencia | number | `conteo_cierre − (monto_apertura + efectivo_ventas)` |

Mismo patrón que "Ventas": la fuente operativa vive en localStorage (llave `cajas`, `plan-mejoras-2.md` Fase 2) y la fila del Sheet es respaldo/reporte con sync offline-first.

### 2.5 Google Sheet — hoja "Categorias" *(plan-productos-v2.md Fase 2, implementada 23/09/2026 — requiere crear la hoja + redeploy del backend)*

| Columna | Tipo | Notas |
|---|---|---|
| id | string | uuid generado en servidor |
| nombre | string | único (case-insensitive) |

CRUD con token; borrar solo si ningún producto la usa (`categoria_en_uso`). El filtro del catálogo sigue derivándose de los productos; el form de productos pasa a `<select>` alimentado por esta hoja.

### 2.6 Google Sheet — hoja "Marcas" *(espejo de "Categorias", implementada 25/09/2026 — requiere crear la hoja + redeploy del backend)*

| Columna | Tipo | Notas |
|---|---|---|
| id | string | uuid generado en servidor |
| nombre | string | único (case-insensitive) |

CRUD con token; borrar solo si ningún producto la usa (`marca_en_uso`); renombrar hace cascada a `Productos.marca`. El `<select>` de marca del form de productos se alimenta de esta hoja (con fallback derivado de los productos). La lectura pública es `GET ?action=marcas`.

---

## 3. Autenticación local (single-user)

No hay sistema de usuarios en un backend tradicional, pero Apps Script sí puede actuar como un **backend ligero de autenticación**: valida credenciales y emite tokens de sesión, en vez de que el cliente guarde o reenvíe cualquier secreto. Esto es preferible a un esquema de secreto compartido (hash estático o HMAC), porque en ambos casos el secreto vive también en el cliente y es extraíble inspeccionando el código en ejecución. Aquí, el cliente nunca conoce el secreto real: solo maneja un token temporal sin valor una vez expirado.

### 3.1 Flujo

1. El dueño define `usuario` + `clave` una sola vez. La `clave` (o su hash) se guarda **solo en Apps Script**, en Script Properties — nunca en el cliente ni en el Sheet en texto plano.

2. **Login**: el cliente envía `usuario` + `clave` por HTTPS a Apps Script (`POST ?action=login`, body `{ usuario, clave }`). Esto viaja una sola vez, no en cada request.

3. Apps Script valida las credenciales contra lo guardado en Script Properties. Si son correctas:
   - Genera un **token temporal** (`Utilities.getUuid()`)
   - Lo guarda en una hoja "Sesiones" del Sheet junto con su fecha de expiración (ej. `ahora + 12 horas`)
   - Devuelve el token al cliente

4. El cliente guarda **solo ese token** en `localStorage` (nunca la clave, nunca un secreto derivado de ella).

5. En cada request posterior (lectura sensible o escritura), el cliente envía el token en el body: `{ action, token, data }`.

6. Apps Script, en cada request, busca el token en la hoja "Sesiones":
   - Si no existe → rechaza (`{ ok: false, error: 'unauthorized' }`)
   - Si existe pero está vencido → rechaza y el cliente debe volver a hacer login
   - Si existe y está vigente → ejecuta la acción normalmente

7. El cliente detecta un `unauthorized` en la respuesta y redirige a la pantalla de login (el token guardado en localStorage se descarta).

### 3.2 Hoja "Sesiones" (nueva, en el mismo Sheet)

| Columna | Tipo | Notas |
|---|---|---|
| token | string | UUID generado por Apps Script |
| creado | datetime | |
| expira | datetime | ej. creado + 12h |

Apps Script debe además limpiar sesiones vencidas periódicamente (ej. al ejecutar cualquier acción, borrar filas con `expira < ahora`) para que la hoja no crezca indefinidamente.

### 3.3 Qué cambia en el contrato de requests

- **Login** (una sola vez, no en cada acción): `POST { action: "login", usuario, clave }` → responde `{ ok: true, token, expira }`
- **Toda acción posterior** (lectura sensible o escritura): `POST { action, token, data }` — ya no se envía usuario/clave, ya no se calcula ninguna firma en cliente
- Las rutas de **lectura no sensible** (catálogo público) pueden seguir sin token, igual que antes

### 3.4 Por qué esto sí resuelve el problema y HMAC/hash estático no

- En HMAC o hash estático, el **secreto compartido vive en el cliente** (para poder firmar o generar el hash ahí mismo) — cualquiera que inspeccione el código en ejecución o la memoria del navegador puede extraerlo, y con eso falsificar requests indefinidamente.
- Con login + token de sesión, la `clave` real **nunca sale de Apps Script**. Lo único expuesto en el cliente es un token temporal, aleatorio, sin relación matemática con la clave, y que expira solo — si se filtra, el daño está acotado en el tiempo y se puede invalidar borrando esa fila de la hoja "Sesiones".
- El servidor (Apps Script) es quien decide si un token es válido, no una comparación que el cliente podría replicar conociendo el algoritmo.

### 3.5 Qué NO se debe hacer aquí

- No guardar la `clave` en el Sheet en texto plano — solo en Script Properties, y idealmente hasheada ahí también.
- No omitir la limpieza de sesiones vencidas — la hoja "Sesiones" no debe crecer sin control.
- No asumir que esto es un JWT real: no está firmado criptográficamente, es un UUID validado por lookup en una hoja. Funciona para este volumen (una persona, pocas sesiones), pero no escala a muchos usuarios concurrentes — Sheets no está pensado como almacén de sesiones de alto tráfico.
- No transmitir `usuario`/`clave` salvo en el login inicial; en el resto de requests solo debe viajar el `token`.

---

## 4. Datos mock para la demo (poblado inicial y modo demo)

**DummyJSON** (`https://dummyjson.com/products`) se usa en dos momentos distintos, y no hay que confundirlos:

1. **Seed único del Sheet** (una sola vez, antes de tener datos reales): un script (Node, o incluso pegar el JSON transformado a mano) trae productos de DummyJSON y llena la hoja "Productos" del Sheet con nombre, precio, categoría, imagen y stock inicial. Después de esto, DummyJSON ya no se vuelve a tocar — el Sheet es la fuente real desde ese punto.

2. **Modo demo de la app** (para mostrar el POS sin depender de que el Sheet/Apps Script ya estén configurados): un modo alterno donde el catálogo se trae directo de DummyJSON en vivo (fetch client-side a `dummyjson.com/products`), sin pasar por Apps Script ni Sheets, para poder enseñar el flujo de venta/carrito/checkout funcionando de inmediato. Este modo debe estar claramente separado del modo real (ej. flag `MODO_DEMO=true` en config), porque en modo demo **no tiene sentido intentar sincronizar ventas a ningún lado** — el checkout en modo demo solo debe guardar en localStorage y no llamar a Apps Script en absoluto.

No usar DummyJSON como reemplazo del Sheet en producción: es solo para poblar inicialmente o para la demo aislada.

---

## 5. Apps Script — diseño de la "API"

Un solo Web App. Las rutas de **lectura** se simulan con query param `action` (van en la URL, no son sensibles). El **login** y las rutas de **escritura** reciben todo en el **body** del POST (ver sección 3) — nunca como query params, para no exponer credenciales ni tokens en URLs/logs.

**Lectura (sin token):**
- `GET ?action=productos` → devuelve catálogo completo (o solo campos livianos: id, nombre, precio, categoria, stock, imagen — no cargar objetos pesados si el sheet crece).

**Autenticación:**
- `POST { action: "login", usuario, clave }` → valida contra Script Properties; si coincide, genera un token (`Utilities.getUuid()`), lo registra en la hoja "Sesiones" con su expiración, y responde `{ ok: true, token, expira }`.

**Escritura (requiere token vigente):**
- `POST { action: "registrarVenta", token, data }` → valida el token contra la hoja "Sesiones"; si está vigente, agrega fila a hoja "Ventas"
- `POST { action: "actualizarStock", token, data }` → valida el token; si está vigente, busca fila por `id` y resta cantidad vendida

`doPost(e)` debe leer `e.postData.contents`, parsear el JSON, y despachar según `action`:
- Si `action === "login"`: comparar `usuario`/`clave` contra lo guardado en Script Properties y, si coincide, generar y registrar el token antes de responder.
- Para cualquier otra acción (`registrarVenta`, `actualizarStock`, etc.): buscar el `token` recibido en la hoja "Sesiones", verificar que exista y no esté vencido, aprovechar el paso para limpiar sesiones vencidas, y solo entonces ejecutar la lógica correspondiente. Si el token no existe o venció, responder `{ ok: false, error: 'unauthorized' }` sin tocar el Sheet de datos.

Consideraciones a implementar:
- Deploy como "Anyone with the link" para permitir fetch sin auth de Google
- Manejar CORS explícitamente en la respuesta (Apps Script requiere workaround, no es automático)
- Cuota de ejecuciones de Google: no diseñar para requests frecuentes; el cliente cachea y no debe golpear el endpoint en cada interacción de UI
- `usuario` y la `clave` (o su hash) se guardan en Script Properties del proyecto de Apps Script — nunca hardcodeados en el código fuente, nunca en el Sheet en texto plano, nunca en el cliente

---

## 6. Flujo de sincronización (offline-first)

```
Catálogo:
Sheet → Apps Script (GET) → fetch cliente → localStorage (con TTL, ej. 15 min)
Si no hay red: usar cache existente, aunque esté vencido. No bloquear la venta.

Venta:
Usuario cierra venta → se guarda YA en localStorage (fuente de verdad inmediata)
                     → se intenta enviar a Apps Script (registrarVenta + actualizarStock, con el token de sesión)
                     → si falla (sin red, o token vencido → re-login): queda en "cola_sync"
                     → reintentar cola_sync cuando vuelva la conexión (ej. evento 'online', o al abrir la app)

Historial (lectura, appscriptbase.md §4.15):
Pintar YA desde `historial_ventas` (sin spinner, sin "esperando datos")
       → en background, si `historial_cache` venció (TTL 5 min) y hay red: POST historialVentas
       → MERGE por `id_venta` (nunca reemplazar): el Sheet manda en total / metodo_pago / items;
         lo local conserva subtotal, nombres al momento de la venta y fecha_hora
       → repintar SOLO si el merge cambió algo; grupos abiertos se preservan
       → sin red / backend sin §4.15 / error: se queda lo local, se estampa la caché y no se martilla
```

Principio clave: **la venta nunca depende de que el Sheet responda**. El Sheet es respaldo/consulta, no bloqueante.

---

## 7. Alcance funcional (qué SÍ construir)

- Catálogo con búsqueda y filtro por categoría (client-side, sobre el cache local)
- Carrito: agregar/quitar producto, editar cantidad, ver subtotal
- Cálculo de total con impuesto configurable (ej. IGV 18%)
- Registro de método de pago (efectivo con cálculo de vuelto, tarjeta, yape/plin como simple etiqueta)
- Cierre de venta: descuenta stock localmente, guarda en historial local, intenta sync a Sheet
- Historial de ventas: pinta **desde el dispositivo** (agrupado por día con desglose por método, filtrable por fecha, con detalle de cada venta en su ruta) y **mergea en background** el log del Sheet (`appscriptbase.md` §4.15) — la primera respuesta es siempre local, no hay espera visible *(26/09/2026: antes decía "del propio dispositivo" con gate de cero API; el Sheet es ahora la fuente de lectura y lo local sigue siendo la fuente de escritura, ver §6)*
- Reporte básico del día: total vendido, número de ventas, productos más vendidos — **calculado solo sobre datos locales de ese dispositivo** *(23/09/2026: la vista en pantalla —historial agrupado por día + apertura/cierre de caja— pasa a `plan-mejoras-2.md` Fases 2–4 por pedido explícito del dueño e **implementada el mismo día** (historial por día + tarjeta de caja del día); **"productos más vendidos" queda pendiente de decisión del dueño** — no estaba en los 3 pedidos que cubre ese plan; ver `extras.md` §5)*
- Export manual de historial local a CSV (respaldo ante borrado de caché) *(sigue fuera de esta pasada — `extras.md` §5)*
- Funcionamiento offline vía PWA: la venta debe poder completarse sin internet
- Gestión de categorías con CRUD propio (hoja "Categorias") y el form de productos conectado a ella *(D2/D3, `plan-productos-v2.md`)*
- Foto en las filas del listado admin de `/productos` (thumbnail; el POS ya muestra imagen) *(D3, `plan-productos-v2.md` Fase 4)*
- Ajustes (`/ajustes`): nombre del local, moneda y IGV configurable *(D4, `plan-productos-v2.md` Fase 5 — el impuesto de §7 "configurable" ahora es dato, no constante)*
- Panel de stock bajo (`/stock`): productos con stock < umbral (default 5, configurable en `/ajustes`), inventario valorizado, badge con el conteo en el sidebar y **repostock inline** (stepper −/+ con guardado inmediato) *(pedido del dueño + `plan-stock.md` / `plan-reponer-buscar.md`)*
- Búsqueda por nombre/categoría en `/productos` (admin) — Fuse local, sin red *(mejora UX de `auditoria-ux.md` P2, `plan-reponer-buscar.md`)*
- UX de formularios: errores **inline bajo cada campo** (`role="alert"` + `aria-invalid`), bloqueo de doble envío con estado "Guardando…/Creando…" en todos los submits, file input bloqueado durante upload y foco de vuelta al cancelar *(auditoría de uso real, `plan-form-ux.md` — patrón base: `login-form.ts`)*

---

## 8. Explícitamente fuera de alcance (NO implementar)

Estas cosas requieren backend real y no se deben simular como si funcionaran de verdad:

- **Multi-dispositivo / multi-cajero simultáneo**: no hay manejo de concurrencia. Un solo dispositivo activo a la vez.
- **Stock en tiempo real entre dispositivos**: el stock del Sheet puede quedar desincronizado si hay más de un dispositivo vendiendo; no se debe prometer consistencia fuerte.
- **Autenticación de usuarios/roles**: no hay login de cajero vs admin.
- **Reportes consolidados multi-sucursal**: no existe agregación entre dispositivos.
- **Persistencia garantizada**: localStorage puede borrarse (limpieza de navegador, modo incógnito); por eso existe el export a CSV como mitigación, no como solución completa.
- **Login como seguridad de nivel enterprise**: el esquema de login + token de la sección 3 evita que la `clave` real viva o viaje en el cliente, y acota el daño de un token filtrado a su ventana de expiración (invalidable borrando la fila en "Sesiones"). Pero el token sigue guardado en `localStorage`, que es legible por cualquier script que corra en esa página (una dependencia comprometida, un XSS); el diseño tampoco incluye cookies `HttpOnly`, rotación de tokens ni límite de intentos de login (rate limiting). Es suficiente para el riesgo real de este caso de uso (un solo dispositivo, un solo usuario del negocio) — no se debe vender como protección ante un atacante con capacidad de ejecutar código en el navegador del cliente.

Si el agente detecta que una tarea requiere resolver alguno de estos puntos, debe señalarlo en vez de intentar una solución parcial que aparente funcionar.

---

## 9. Escalabilidad (hasta ~1000 productos)

- No cargar el catálogo completo con todos los campos en cada fetch: usar un índice liviano (id, nombre, precio, categoría, imagen) para listar/buscar, y solo pedir detalle completo si se necesita
- Búsqueda client-side con índice simple (ej. Fuse.js) sobre el catálogo cacheado, no contra el Sheet en cada tecla
- Paginación o virtualización de listas en UI si se renderizan los 1000 a la vez *(decidido 23/09/2026 — D1 de `plan-productos-v2.md`: paginación **solo visual** de 50/página en el cliente, sin cambios de API)*
- Imágenes con lazy-load

---

## 10. Resumen de decisiones (por qué, en una línea cada una)

- **Sheets en vez de Tina**: el usuario final es el mismo cajero, no un editor de contenido dedicado; Sheets ya lo conoce y no requiere flujo de build/deploy para reflejar cambios.
- **Apps Script en vez de backend propio**: gratis, sin infraestructura, suficiente para el volumen de un negocio pequeño.
- **localStorage como fuente de verdad operativa**: la venta no puede depender de la disponibilidad ni velocidad de Google Sheets.
- **Sync eventual, no en tiempo real**: aceptable porque es un solo dispositivo/usuario; evita la complejidad de resolver conflictos de escritura concurrente.
- **PWA**: el negocio debe poder seguir vendiendo sin internet; solo el catálogo requiere red para actualizarse.
- **Login + token de sesión en vez de firma HMAC con secreto compartido**: evita que cualquier secreto viva en el cliente — Apps Script actúa como backend ligero de autenticación, y la hoja "Sesiones" funciona como almacén de tokens con expiración; suficiente para un solo usuario, sin requerir cuenta de Google ni backend propio.
- **DummyJSON solo para seed y modo demo**: mantiene la demo mostrable de inmediato sin depender de que el Sheet ya esté configurado, sin mezclarse con el flujo de datos reales.