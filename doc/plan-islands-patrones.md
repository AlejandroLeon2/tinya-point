# Plan — Patrones Arquitectónicos y Declaratividad en Islands

**Fecha:** 2026-09-24  
**Contexto:** Post-Fase 6 de `doc/plan-islands-organizacion.md`. Las 19 islas ya están organizadas por feature y consumen helpers SRP (`dom.ts`, `feedback.ts`, `api-result.ts`, `catalog-cache.ts`).  
**Objetivo:** Reducir código repetido, eliminar lógica procedural dispersa y estandarizar la interacción mediante 3 patrones arquitectónicos:
1. **FormManager & Schemas declarativos** (unificar validación, foco, auto-observación y estado pending).
2. **Action Dispatcher / Delegación declarativa** (reemplazar `closest()` y `switch` anidados por mapa de acciones).
3. **Diccionarios de validación y mensajes** (separar textos y reglas de negocio de la manipulación del DOM).

---

## Reglas e Invariantes Absolutas

1. **Cero regresiones de UI/UX:** El copy de errores, advertencias y placeholders se conserva **100% idéntico** byte a byte.
2. **Hooks sagrados:** Los selectores `data-*` y los contratos con los componentes `.astro` no se tocan ni se renombran.
3. **TypeScript estricto:** 0 errores de compilación (`npm run build` obligatorio al final de cada tarea).
4. **Sin commits automáticos:** El usuario realiza los commits manualmente.

---

## Fase 1 — Creación de Helpers Core

**Objetivo:** Construir los dos helpers base reutilizables en `src/utils/` antes de tocar las islas.

- [x] 1.1 Crear `src/utils/form-manager.ts`:
  - Definir tipos `FieldValidator<T>`, `FieldConfig`, `FormSchema`, `FormManagerOptions<T>`.
  - Implementar `createFormManager<T>()`:
    - Registro y auto-limpieza con `observarCampo` en todos los inputs del schema.
    - Interceptar `submit` con `event.preventDefault()`.
    - Ejecutar `limpiarErroresForm(form)`.
    - Validar campos secuencialmente; en el primer fallo: mostrar inline error (`mostrarErrorCampo`), hacer `focus()` en el campo y detener el submit.
    - Integrar control `pending` de botón (`crearPendingButton` o `submitBtn.disabled`).
    - Invocar callback tipado `onSubmit(data)` con los valores limpios y convertidos.
- [x] 1.2 Extender `src/utils/dom.ts` con helper `delegateAction`:
  - `delegateAction(container, eventName, actionAttr, handlers)`:
    - Capturar evento en el contenedor padre.
    - Buscar el trigger más cercano con `target.closest(`[${actionAttr}]`)`.
    - Extraer el tipo de acción y ejecutar el handler correspondiente pasando el elemento target y el dataset asociado.
- [x] 1.3 **Gate Fase 1:** `npm run build` verde (verificar que los nuevos helpers compilan y exportan sus tipos correctamente).

---

## Fase 2 — Estandarización de Formularios con `createFormManager`

**Objetivo:** Reemplazar el boilerplate de submit/validación manual por schemas declarativos en los formularios de la app.

- [x] 2.1 `src/components/islands/settings/ajustes.ts`:
  - Extraer schema `VALIDACIONES_AJUSTES` (nombre, moneda, igv, stock_alerta).
  - Adoptar `createFormManager` para el guardado de configuración.
  - Eliminar validaciones imperativas `if/else` y llamadas manuales a `observarCampo`.
- [x] 2.2 `src/components/islands/admin/categorias-admin.ts`:
  - Extraer schema `VALIDACION_CATEGORIA` (nombre con `isNonEmpty`).
  - Adoptar `createFormManager` para el formulario de creación/edición de categoría.
- [x] 2.3 `src/components/islands/runtime/login-form.ts`:
  - Extraer schema `VALIDACION_LOGIN` (usuario y clave).
  - Adoptar `createFormManager` para el submit de autenticación.
- [x] 2.4 `src/components/islands/caja/caja.ts`:
  - Extraer schema `VALIDACION_APERTURA` (monto inicial >= 0).
  - Adoptar `createFormManager` para el formulario de apertura de caja.
- [x] 2.5 `src/components/islands/admin/product-admin.ts`:
  - Extraer schema `VALIDACION_PRODUCTO` (nombre, categoría, precio, stock, imagen_url).
  - Migrar la validación manual de `leerDatosForm()` a `createFormManager`.
- [x] 2.6 **Gate Fase 2:** `npm run build` verde. Verificar que el foco en error y la desaparición del error al escribir sigan funcionando igual.

---

## Fase 3 — Delegación de Eventos Declarativa en Tablas y Listas

**Objetivo:** Reemplazar listeners con `closest()` y `switch` manuales por el patrón `delegateAction`.

- [x] 3.1 `src/components/islands/stock/stock.ts`:
  - Migrar el listener de la lista (`data-stock-step`) a `delegateAction` para manejar los botones de incremento/decremento y lote.
- [x] 3.2 `src/components/islands/admin/product-admin.ts`:
  - Migrar los botones de acción de fila (editar, alternar activo/inactivo, restaurar) a `delegateAction`.
- [x] 3.3 `src/components/islands/admin/categorias-admin.ts`:
  - Migrar las acciones de fila (editar nombre, abrir confirmación de borrado) a `delegateAction`.
- [x] 3.4 `src/components/islands/cart/cart-actions.ts`:
  - Migrar las acciones sobre líneas de ticket (sumar, restar, remover) a `delegateAction`.
- [x] 3.5 `src/components/islands/historial/historial.ts`:
  - Migrar las acciones de selección de detalle y navegación a `delegateAction`.
- [x] 3.6 **Gate Fase 3:** `npm run build` verde.

---

## Fase 4 — Verificación Integral, Smoke y Limpieza

**Objetivo:** Validar que todo el comportamiento interactivo se mantiene idéntico con menos líneas de código.

- [x] 4.1 `npm run build` → 0 errores de tipos o empaquetado.
- [x] 4.2 Smoke test HTTP 200 en las 9 rutas principales (`/`, `/login`, `/caja`, `/stock`, `/productos`, `/categorias`, `/historial`, `/historial/venta`, `/ajustes`).
- [ ] 4.3 Smoke funcional:
  - Login con error y con éxito.
  - Apertura/cierre de caja.
  - Creación/edición de producto en drawer.
  - Venta en POS y actualización de stock.
- [x] 4.4 Evaluación de deuda y líneas de código: `git diff --stat`.

**Gate Final:** Build verde + Smoke interactivo completo aprobado.
