# Guía de implementación — API del POS en Google Apps Script

Esta guía **no es código para copiar y pegar**. Es el mapa de qué funciones necesitas, qué hace cada una, qué límites reales tiene el entorno hoy (2026), y cómo se ve cada request/response en JSON — para que la implementación (tuya o de un agente) tenga guardrails claros en vez de improvisar sobre la marcha.

Se apoya en las decisiones ya tomadas en la especificación del POS (login + token de sesión, Sheets como catálogo/respaldo, localStorage como fuente de verdad operativa).

---

## 1. Contexto y limitantes reales del entorno (actualizado 2026)

Antes de diseñar una sola función, estos son los techos duros de Apps Script que **condicionan** cómo se debe escribir todo lo demás:

| Límite | Cuenta gratuita (Gmail) | Cuenta Workspace |
|---|---|---|
| Tiempo máx. por ejecución | 6 minutos | 6 minutos (ya no hay 30 min en ningún plan) |
| Tiempo de ejecución total por día (triggers) | 90 minutos | 6 horas |
| Timeout de `doGet`/`doPost` en un Web App | ~30 segundos | ~30 segundos |
| Ejecuciones simultáneas (concurrentes) | ~30 | ~30 |
| Llamadas `UrlFetchApp` por día | 20,000 | 100,000 |

Consecuencias directas para este proyecto:

- **`doPost`/`doGet` deben responder rápido.** Nada de loops pesados, ni recorrer todo el Sheet fila por fila si se puede evitar — un timeout de 30s con el cajero esperando para cobrar es inaceptable. Por eso el catálogo se lee con índices livianos (ver spec, sección 9) y no se recalcula nada pesado en cada request.
- **No hay transacciones reales.** Google Sheets no tiene `BEGIN/COMMIT`. Si dos requests llegan casi al mismo tiempo (aunque en este proyecto el escenario normal es un solo dispositivo), pueden pisarse al escribir la misma fila. Por eso se necesita `LockService` alrededor de cualquier escritura (`registrarVenta`, `actualizarStock`, `login`), no solo por rigor técnico sino porque es la única herramienta de Apps Script para esto.
- **No hay websockets ni push real.** Todo es petición/respuesta. No hay forma de que Apps Script "avise" al cliente que algo cambió — el cliente siempre pregunta (polling manual al reconectar, no polling constante, por la cuota de `UrlFetch`/ejecuciones).
- **`ContentService` no permite fijar códigos de estado HTTP.** Todo request exitoso o fallido de Apps Script vuelve como HTTP 200. Por eso **todas** las respuestas de esta API llevan su propio campo `ok: true/false` — el estado HTTP no sirve para distinguir éxito de error aquí, hay que mirar el body.
- **CORS es manual y con gotchas.** Apps Script Web Apps no manejan preflight (`OPTIONS`) de forma confiable. La forma estable de evitar que el navegador dispare un preflight es que el cliente mande el `POST` con `Content-Type: text/plain;charset=utf-8` (en vez de `application/json`) y que el propio `doPost` sea quien parsee el string como JSON. Esto no es un capricho: es la forma que evita el error de CORS más común al conectar un frontend externo con Apps Script.
- **Cold start / latencia variable.** La primera llamada después de un rato de inactividad puede tardar más. El cliente no debe asumir una respuesta instantánea — de ahí que la venta se guarde primero en localStorage y el envío a Apps Script sea best-effort (ver spec, sección 6).

---

## 2. Servicios nativos de Apps Script que se usan (y para qué, exactamente)

No se necesita ninguna librería externa. Los builtins de Apps Script cubren todo el alcance:

| Servicio | Para qué se usa aquí |
|---|---|
| `SpreadsheetApp` | Leer/escribir las hojas "Productos", "Ventas", "Sesiones", "Cajas" |
| `PropertiesService` (Script Properties) | Guardar `usuario`, `clave` (o su hash) — nunca en el Sheet |
| `Utilities` | `Utilities.getUuid()` para generar tokens; `Utilities.computeDigest` si se decide hashear la clave |
| `LockService` | `getScriptLock()` alrededor de cualquier escritura para evitar carreras de escritura |
| `ContentService` | Construir la respuesta JSON final (`ContentService.createTextOutput(...).setMimeType(ContentService.MimeType.JSON)`) |
| `CacheService` (opcional) | Cachear el catálogo serializado unos minutos dentro del propio Apps Script y así no releer el Sheet completo en cada `GET ?action=productos` si hay ráfagas de requests |

No se necesita `HtmlService` (no hay UI servida desde Apps Script, el frontend vive en Astro) ni `UrlFetchApp` (no hay llamadas salientes a otros servicios).

---

## 3. Estructura del proyecto y listado de funciones

### 3.1 Punto de entrada

- **`doGet(e)`**
  Atiende únicamente lecturas públicas. Lee `e.parameter.action`. Si `action === "productos"`, delega a `obtenerProductos()`; si `action === "categorias"`, a `obtenerCategorias()`. Cualquier otro valor devuelve error de acción no soportada. No requiere token.

- **`doPost(e)`**
  Punto de entrada único para login y escrituras. Lee `e.postData.contents` (string plano, ver sección 1 sobre CORS), lo parsea con `JSON.parse`, y despacha según `body.action` a la función correspondiente. Nunca ejecuta lógica de negocio directamente aquí — solo parsea, valida forma básica del payload, y delega.

### 3.2 Router interno

- **`despacharAccion(action, body)`**
  Un `switch`/mapa de `action → función handler`. Centraliza el enrutamiento para que `doPost` no crezca con `if/else` infinitos. Acciones esperadas: `"login"`, `"registrarVenta"`, `"actualizarStock"`, `"abrirCaja"`, `"cerrarCaja"`, `"productosAdmin"`, `"crearProducto"`, `"actualizarProducto"` (contratos en §4.6–§4.10), `"crearCategoria"`, `"actualizarCategoria"`, `"borrarCategoria"` (§4.12–§4.14). Cualquier `action` no reconocida devuelve `{ ok: false, error: "accion_no_soportada" }`.

### 3.3 Autenticación

- **`manejarLogin(usuario, clave)`**
  Compara contra `PropertiesService.getScriptProperties()`. Si coincide, llama a `crearSesion()` y devuelve el token. Si no, devuelve `{ ok: false, error: "credenciales_invalidas" }` — sin dar pistas de cuál de los dos campos falló (evita facilitar fuerza bruta dirigida).

- **`crearSesion()`**
  Genera `Utilities.getUuid()`, calcula `expira = ahora + 12h`, inserta una fila en la hoja "Sesiones", y devuelve `{ token, expira }`.

- **`validarToken(token)`**
  Busca el token en la hoja "Sesiones". Devuelve un objeto simple `{ valido: boolean, motivo?: "no_encontrado" | "expirado" }`. Toda función de escritura debe llamar a esta antes de tocar datos.

- **`limpiarSesionesVencidas()`**
  Recorre la hoja "Sesiones" y borra filas con `expira < ahora`. Se llama de forma barata (por ejemplo, solo cuando ya se está iterando la hoja para `validarToken`, no como un recorrido aparte) para no sumar tiempo de ejecución innecesario.

### 3.4 Catálogo (lectura pública)

- **`obtenerProductos()`**
  Lee la hoja "Productos", filtra `activo === true`, y devuelve solo los campos livianos (`id`, `nombre`, `precio`, `categoria`, `stock`, `imagen_url`) — nunca la fila completa si hay columnas pesadas. Si `CacheService` está en uso, primero intenta leer de cache antes de tocar el Sheet.

### 3.5 Ventas y stock (escritura, requieren token)

- **`registrarVenta(token, data)`**
  1. `validarToken(token)` → si inválido, corta acá.
  2. `LockService.getScriptLock().tryLock(...)` antes de escribir.
  3. Inserta fila en "Ventas" con `data.items`, `data.total`, `data.metodo_pago`, `fecha_hora` generado en servidor (no confiar en el reloj del cliente), `id_venta` recibido del cliente (el cliente ya lo generó como uuid al cerrar la venta localmente).
  4. Libera el lock.

- **`actualizarStock(token, data)`**
  1. `validarToken(token)`.
  2. `LockService` igual que arriba — este es el punto más sensible a condiciones de carrera porque hay lectura + escritura (leer stock actual, restar, escribir).
  3. Busca la fila por `id` en "Productos" (`buscarFilaPorId`), resta `data.cantidadVendida`, nunca deja el stock en negativo (si el resultado sería negativo, se guarda en `0` y se devuelve una advertencia, no un error duro — la venta ya ocurrió físicamente, no tiene sentido bloquearla por esto).

- **`buscarFilaPorId(hoja, id)`** (helper interno)
  Recorre la hoja indicada buscando coincidencia en la columna `id`. Devuelve el número de fila o `-1`. Se usa tanto en `actualizarStock` como en cualquier futura acción sobre un producto puntual.

### 3.6 Utilidades de respuesta

- **`respuestaJson(objeto)`**
  Envuelve cualquier objeto de respuesta con `ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON)`. Todas las funciones de negocio devuelven un objeto plano; solo esta función lo convierte a la respuesta HTTP final. Esto evita repetir el boilerplate de `ContentService` en cada handler.

- **`respuestaError(codigo, mensajeInterno)`**
  Construye siempre la misma forma `{ ok: false, error: codigo }`. El `mensajeInterno` es solo para `Logger.log`, nunca se expone al cliente — evita filtrar detalles internos (nombres de hoja, stack traces) en las respuestas.

### 3.7 Categorías (plan-productos-v2.md Fase 2, D2)

- **`obtenerCategorias()`**
  Lee la hoja "Categorias" y devuelve `{ ok: true, categorias: [{ id, nombre }] }` ordenado por nombre — lectura pública vía `doGet(?action=categorias)` (§4.11), misma luz que `obtenerProductos()`.

- **`crearCategoria(token, data)`** (§4.12)
  1. `validarToken(token)` → si inválido, corta acá.
  2. Valida `nombre` no vacío (`payload_invalido`).
  3. Chequeo de duplicado case-insensitive (`categoria_duplicada`).
  4. `LockService` + `appendRow` con `id` de `Utilities.getUuid()` (mismo motivo que `crearProducto`: el alta no es un flujo offline).

- **`actualizarCategoria(token, data)`** (§4.13)
  Renombra por `id` con las mismas validaciones y **en cascada**: los productos cuya `categoria` coincida con el nombre viejo pasan al nuevo, dentro del mismo lock — ningún producto queda apuntando a un nombre inexistente.

- **`borrarCategoria(token, data)`** (§4.14)
  Borra por `id`; si algún producto la referencia → `categoria_en_uso` y la fila queda (el Sheet es la red de seguridad; la UI solo muestra el mensaje amable). `payload_invalido` si el `id` no existe. No hay soft delete: una categoría sin productos no deja trazabilidad que preservar.

- **`existeNombreEn(hoja, nombre, exceptoId)` / `categoriaEnUso(nombre)` / `renombrarCategoriaEnProductos(viejo, nuevo)`** (helpers internos)
  Duplicados case-insensitive (ignorando una fila al renombrar), uso en Productos y el cascade — todos bajo el lock del handler que los llama.

---

## 4. Mapeo de requests y responses (contrato JSON)

Esta sección es la que debe quedar fija y versionada — el frontend en Astro se escribe contra **esta forma exacta**, no contra lo que "devuelve por ahora" el script.

### 4.1 `GET ?action=productos` (pública, sin token)

**Request:** sin body, solo query string.

**Response (200, siempre):**
```json
{
  "ok": true,
  "productos": [
    {
      "id": "p001",
      "nombre": "Coca-Cola 500ml",
      "precio": 3.5,
      "categoria": "bebidas",
      "stock": 24,
      "imagen_url": "https://..."
    }
  ]
}
```

### 4.2 `POST { action: "login" }`

**Request:**
```json
{ "action": "login", "usuario": "dueño", "clave": "..." }
```

**Response — éxito:**
```json
{ "ok": true, "token": "3f2a1c9e-...", "expira": "2026-09-22T20:00:00.000Z" }
```

**Response — error:**
```json
{ "ok": false, "error": "credenciales_invalidas" }
```

### 4.3 `POST { action: "registrarVenta" }`

**Request:**
```json
{
  "action": "registrarVenta",
  "token": "3f2a1c9e-...",
  "data": {
    "id_venta": "uuid-generado-en-cliente",
    "items": [{ "id": "p001", "cantidad": 2, "precio": 3.5 }],
    "total": 7.0,
    "metodo_pago": "efectivo"
  }
}
```

**Response — éxito:**
```json
{ "ok": true }
```

**Response — token inválido/vencido:**
```json
{ "ok": false, "error": "unauthorized" }
```

### 4.4 `POST { action: "actualizarStock" }`

**Request:**
```json
{
  "action": "actualizarStock",
  "token": "3f2a1c9e-...",
  "data": { "id": "p001", "cantidadVendida": 2 }
}
```

**Response — éxito normal:**
```json
{ "ok": true, "stockRestante": 22 }
```

**Response — éxito con advertencia (stock habría quedado negativo):**
```json
{ "ok": true, "stockRestante": 0, "advertencia": "stock_insuficiente_ajustado_a_cero" }
```

### 4.5 Catálogo de códigos de error (usar siempre los mismos strings)

| `error` | Cuándo ocurre |
|---|---|
| `credenciales_invalidas` | Login con usuario/clave incorrectos |
| `unauthorized` | Token ausente, no encontrado o vencido, en cualquier acción de escritura |
| `accion_no_soportada` | `action` no reconocida por el router |
| `payload_invalido` | Falta un campo requerido en `data` o el JSON no parsea |
| `error_interno` | Cualquier excepción no controlada (se loggea el detalle real con `Logger.log`, pero el cliente solo recibe este código genérico) |
| `categoria_duplicada` | Alta o renombre de categoría con un nombre ya existente (case-insensitive) |
| `categoria_en_uso` | Borrado de categoría que al menos un producto referencia (`plan-productos-v2` §4.14) |

Definir esta tabla ahora evita que cada función invente su propio texto de error y que el frontend tenga que adivinar contra qué comparar.

### 4.6 `POST { action: "abrirCaja" }` (requiere token)

Handler: `abrirCaja(token, data)`. Inserta una fila en la hoja "Cajas" (`base.md` §2.4).

**Request:**
```json
{
  "action": "abrirCaja",
  "token": "3f2a1c9e-...",
  "data": { "id_caja": "uuid-generado-en-cliente", "fecha_día": "2026-09-23", "monto_apertura": 100.0 }
}
```

**Response — éxito:**
```json
{ "ok": true }
```

Errores: mismos códigos de §4.5 (`unauthorized`, `payload_invalido` si falta un campo o `monto_apertura < 0`).

Notas: `id_caja` lo genera el cliente (mismo motivo que `id_venta`: la apertura se guarda local primero y puede quedar en la cola offline). `fecha_hora_apertura` la genera el servidor. `fecha_día` es el día local del cliente — única fecha aportada por el cliente, porque es la clave de agrupación del historial. `LockService` alrededor de la escritura. La regla de "solo una caja abierta" se valida en el cliente sobre su estado local; el Sheet no la garantiza.

### 4.7 `POST { action: "cerrarCaja" }` (requiere token)

Handler: `cerrarCaja(token, data)`. **Upsert por `id_caja`** en "Cajas": si la fila de apertura existe la actualiza; si no, la crea. Idempotente — un reintento de `cola_sync` no duplica filas.

**Request:**
```json
{
  "action": "cerrarCaja",
  "token": "3f2a1c9e-...",
  "data": {
    "id_caja": "uuid-de-la-apertura",
    "conteo_cierre": 250.0,
    "efectivo_ventas": 140.0,
    "tarjeta_ventas": 35.0,
    "yape_plin_ventas": 10.0,
    "n_ventas": 7,
    "diferencia": -10.0
  }
}
```

**Response — éxito:**
```json
{ "ok": true }
```

Notas: `fecha_hora_cierre` la genera el servidor. Los totales por método, `n_ventas` y `diferencia` son un **snapshot** que el cliente calcula al cerrar sobre su historial local del `fecha_día` — el servidor los guarda tal cual, no los recalcula. `LockService` alrededor de la escritura.

### 4.8 `POST { action: "productosAdmin" }` (requiere token)

Handler: `productosAdmin(token)`. Devuelve el catálogo **completo, incluidos `activo: false`** — a diferencia del `GET ?action=productos` de §4.1, que filtra los inactivos (el listado de administración no sirve sin las bajas).

**Request:**
```json
{ "action": "productosAdmin", "token": "3f2a1c9e-...", "data": {} }
```

**Response — éxito:**
```json
{
  "ok": true,
  "productos": [
    {
      "id": "p001",
      "nombre": "Coca-Cola 500ml",
      "precio": 3.5,
      "categoria": "bebidas",
      "stock": 24,
      "imagen_url": "https://...",
      "activo": true
    }
  ]
}
```

### 4.9 `POST { action: "crearProducto" }` (requiere token)

Handler: `crearProducto(token, data)`.

**Request:**
```json
{
  "action": "crearProducto",
  "token": "3f2a1c9e-...",
  "data": { "nombre": "Agua 625ml", "categoria": "bebidas", "precio": 2.0, "stock": 12, "imagen_url": "https://..." }
}
```

`imagen_url` opcional; `precio ≥ 0`; `stock` entero ≥ 0 — validados también en cliente (`payload_invalido` si falta un campo requerido o el JSON no parsea).

**Response — éxito:**
```json
{ "ok": true, "id": "uuid-generado-en-servidor" }
```

El `id` lo genera el servidor con `Utilities.getUuid()` (el alta de producto no es un flujo offline). La fila se escribe con `activo: true` y requiere `LockService`.

### 4.10 `POST { action: "actualizarProducto" }` (requiere token)

Handler: `actualizarProducto(token, data)`. Edita por `id` solo los campos enviados. **La "baja" de un producto es esta misma acción con `activo: false`** — no existe (ni debe existir) una acción `eliminar`: el borrado físico rompería la trazabilidad y el soft delete ya lo respeta `obtenerProductos()` de §3.4.

**Request:**
```json
{
  "action": "actualizarProducto",
  "token": "3f2a1c9e-...",
  "data": { "id": "p001", "precio": 3.8, "activo": false }
}
```

**Response — éxito:**
```json
{ "ok": true }
```

Errores: `payload_invalido` si falta `id` o si `data` no trae ningún campo a editar.

### 4.11 `GET ?action=categorias` (pública, sin token)

**Request:** sin body, solo query string.

**Response (200, siempre):**
```json
{
  "ok": true,
  "categorias": [
    { "id": "3f2a1c9e-...", "nombre": "bebidas" }
  ]
}
```

Lista liviana (`id`, `nombre`) ordenada por nombre — alimenta el `<select>` del form de productos y la pantalla `/categorias` (`plan-productos-v2.md` Fase 2/3).

### 4.12 `POST { action: "crearCategoria" }` (requiere token)

Handler: `crearCategoria(token, data)`.

**Request:**
```json
{
  "action": "crearCategoria",
  "token": "3f2a1c9e-...",
  "data": { "nombre": "bebidas" }
}
```

**Response — éxito:**
```json
{ "ok": true, "id": "uuid-generado-en-servidor" }
```

Errores: `payload_invalido` (nombre vacío), `categoria_duplicada` (nombre ya existente, case-insensitive). `id` lo genera el servidor con `Utilities.getUuid()`; `LockService` alrededor de la escritura.

### 4.13 `POST { action: "actualizarCategoria" }` (requiere token)

Handler: `actualizarCategoria(token, data)`. Renombra por `id` y aplica el cambio **en cascada** a los productos que usaban el nombre viejo, dentro del mismo lock.

**Request:**
```json
{
  "action": "actualizarCategoria",
  "token": "3f2a1c9e-...",
  "data": { "id": "3f2a1c9e-...", "nombre": "gaseosas" }
}
```

**Response — éxito:**
```json
{ "ok": true }
```

Errores: `payload_invalido` (falta `id`/`nombre` o `id` inexistente), `categoria_duplicada`.

### 4.14 `POST { action: "borrarCategoria" }` (requiere token)

Handler: `borrarCategoria(token, data)`.

**Request:**
```json
{
  "action": "borrarCategoria",
  "token": "3f2a1c9e-...",
  "data": { "id": "3f2a1c9e-..." }
}
```

**Response — éxito:**
```json
{ "ok": true }
```

Errores: `payload_invalido` (`id` inexistente), `categoria_en_uso` (algún producto la referencia — renombralos o desactivalos antes). Sin soft delete: la fila se borra de verdad cuando está libre.

---

## 5. Guía de consumo desde el cliente (Astro)

### 5.1 Reglas generales de consumo

- **Nunca asumir el HTTP status.** Como se explicó en la sección 1, Apps Script siempre responde 200. La única señal de éxito/error es `body.ok`.
- **El `Content-Type` del `fetch` debe ser `text/plain;charset=utf-8`**, no `application/json`, para evitar el preflight CORS que Apps Script no resuelve bien. El body igual va serializado con `JSON.stringify(...)` — solo cambia la cabecera declarada, Apps Script lo parsea igual en `doPost`.
- **Un solo cliente HTTP centralizado**, no `fetch` suelto en cada componente. Toda la app debe llamar a una única función (p. ej. `llamarApi(action, data)`) que:
  1. Arma el body con `action`, `token` (leído de `localStorage` si existe) y `data`.
  2. Hace el `fetch` al Web App.
  3. Si `body.ok === false` y `error === "unauthorized"`, limpia el token guardado y redirige a login.
  4. Si falla la red (no hay respuesta en absoluto), deja la operación en `cola_sync` — nunca lanza un error visible al cajero en medio de una venta.

### 5.2 Guía rápida de consulta (qué llamar y cuándo)

| Momento en la app | Acción a invocar | Requiere token |
|---|---|---|
| Al abrir la app / refrescar catálogo (según TTL) | `GET ?action=productos` | No |
| Pantalla de login | `POST action=login` | No (es lo que produce el token) |
| Cerrar una venta | `POST action=registrarVenta` **y luego** `POST action=actualizarStock` (uno por cada ítem vendido, o batch si se decide extender el contrato) | Sí |
| Respuesta con `unauthorized` en cualquier acción | Redirigir a login, descartar token viejo | — |
| Reintento de `cola_sync` al reconectar | Repetir la(s) acción(es) pendientes en orden | Sí |
| Abrir caja | `POST action=abrirCaja` (snapshot local antes de la red) | Sí |
| Cerrar caja | `POST action=cerrarCaja` (upsert por `id_caja`) | Sí |
| Listado de administración de productos | `POST action=productosAdmin` (incluye `activo: false`) | Sí |
| Alta de producto | `POST action=crearProducto` | Sí |
| Editar producto / baja lógica | `POST action=actualizarProducto` (baja = `activo: false`) | Sí |

### 5.3 Qué NO hacer al consumir esta API

- No llamar a `GET ?action=productos` en cada tecla de búsqueda — la búsqueda es sobre el `catalogo_cache` local, no contra el Sheet (ver spec, sección 9).
- No reintentar `registrarVenta`/`actualizarStock` en loop inmediato si falla: encolar y reintentar solo con el evento `online` o al reabrir la app, para no quemar la cuota de ejecuciones ni la de `UrlFetch`.
- No guardar `usuario`/`clave` en ningún lado del cliente, ni siquiera temporalmente en una variable de módulo — solo el `token` vive en `localStorage`, como ya define la sección 3 de la especificación.
- No asumir que dos requests de escritura seguidas (`registrarVenta` + `actualizarStock`) son atómicas — si el primero tiene éxito y el segundo falla por red, la venta ya quedó registrada en el Sheet pero el stock no se descontó ahí; el diseño acepta esa inconsistencia como aceptable dado el volumen (un solo dispositivo, no hay lectura concurrente de stock en tiempo real — ver spec, sección 8).

---

## 6. Checklist antes de desplegar el Web App

*Hecho — todos verificados/hechos, deploy en producción confirmado por el dueño 23/09/2026 (`Content-Type: text/plain` verificado en `client.ts:70`; token vencido → `unauthorized` → `expirarSesion()` en `client.ts:65`).*

- [x] `usuario` y `clave` cargados en Script Properties, no en el código fuente.
- [x] Deploy configurado como "Cualquier persona con el enlace" (`Anyone`), ejecutándose como el propietario del script (no "el usuario que accede"), porque el cliente nunca inicia sesión con una cuenta de Google.
- [x] Cada función de escritura pasa por `validarToken` antes de tocar el Sheet — ninguna excepción "porque total es solo para pruebas".
- [x] `LockService` envolviendo toda escritura, especialmente `actualizarStock`.
- [x] `doGet`/`doPost` nunca dejan una excepción sin capturar — todo error cae en `respuestaError("error_interno", ...)`, nunca en una página de error HTML de Apps Script (eso rompe el `JSON.parse` del cliente).
- [x] Verificado que el cliente manda `Content-Type: text/plain` para evitar el problema de CORS/preflight.
- [x] Prueba manual de qué pasa si `expira` de una sesión ya pasó: debe devolver `unauthorized`, no un token "que sigue funcionando por las dudas".