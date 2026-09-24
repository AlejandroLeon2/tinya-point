# Plan — UX de formularios (validaciones, bloqueo de doble envío, feedback)

> 23/09/2026 — Pedido del dueño: "validaciones, bloquear campos al presionar
> enviar o guardar, o poner algo para saber que se subieron las cosas...
> pensado en la utilización real de un usuario". Auditoría inline con
> evidencia en código; el repo YA tenía los buenos patrones (login-form.ts
> bloquea + feedback de "Subiendo imagen…" + focus al campo inválido) — el
> trabajo fue aplicarlos a todos lados y sumar errores inline.

## Hallazgos de la auditoría (evidencia)

- 🔴 **Productos: doble click = producto duplicado** — `guardar()` no tenía
  `disabled` ni flag; el server NO deduplica en `crearProducto`.
- 🟡 Categorías sin bloqueo (el server salva solo el duplicado de nombre) ·
  doble confirm en eliminar.
- 🟡 Ajustes sin bloqueo durante el window de reload.
- 🟡 Caja: seguro por auto-oclusión, pero la llamada al Sheet no tenía flag.
- 🟢 Login, checkout, subida de imagen: ya correctos.
- ❌ **0 errores inline por campo en todo el repo** (solo Alert arriba).
- ✅ `inputmode`/`type=number`/`step`/`autocomplete` ya estaban bien en
  todos los inputs numéricos (P2 queda documentado, sin cambios).

## Fases

- [x] **Fase 1 — P0: bloqueo + estado pendiente.** *✅ 23/09/2026:*
  - *`product-admin.ts`: flags `enviando` / `enviandoToggle` /
    `subiendoImagen` con try/finally; botón `disabled` + "Creando…/
    Guardando…" en guardar; file input bloqueado mientras sube; cancel
    devuelve el foco al nombre.*
  - *`categorias-admin.ts`: flags `enviando` / `enviandoDelete`; botón
    `disabled` + "Creando…/Guardando…"; cancel con foco.*
  - *`caja.ts`: flag `enVueloCaja` en `sincronizarAccion` (backup al
    Sheet).*
  - *`ajustes.ts`: botón `disabled` + "Guardando…" con restore en catch.*
  - *Patrón copiado de `login-form.ts` (el que ya estaba bien).*
- [x] **Fase 2 — P1: errores inline por campo.** *✅ 23/09/2026: nuevo
  `src/utils/form-errors.ts` (`mostrarErrorCampo` con `role="alert"` +
  `aria-invalid`, `limpiarErrorCampo`, `limpiarErroresForm`,
  `observarCampo` — el error desaparece al tipear). Cableado en:
  `product-admin` (nombre/categoría/precio/stock/imagen),
  `categorias-admin` (nombre), `caja` (monto de apertura + conteo de
  cierre — dentro del modal), `ajustes` (moneda/IGV/alerta stock).
  Los errores de campo reemplazan al Alert arriba; el Alert queda para
  fallos de red/servidor. `ocultarAlertas` ahora limpia también los inline
  (entrar a editar arranca limpio).*
- [x] **Fase 3 — P2: polish de uso real.** *✅ 23/09/2026: foco al
  cancelar (productos y categorías vuelven al primer campo); file input
  bloqueado durante upload; auditoría de `inputmode`/`type`/`step`/
  `autocomplete` → ya conforme en ProductForm, CajaFormApertura, cierre de
  caja y Ajustes (sin cambios).*
- [x] **Fase 4 — Docs + auditoría final.** *✅ 23/09/2026: base.md §7
  actualizado; gates: build **9 páginas**/0 · greps 0 · tsc 15 = baseline,
  0 en archivos de fase.*

## Gates

1. `pnpm build` → 0 errores (9 páginas).
2. Greps estándar (fetch/client · localStorage/storage · id= · text-xs/sm ·
   ui/ sin api · hex · TODO).
3. `tsc --noEmit` → 15 = baseline, 0 en archivos de fase.
4. Checklist humano: doble click en "Guardar producto" (una sola creación),
   error inline en campo vacío (desaparece al tipear), "Guardando…" visible
   en Ajustes, stepper de `/stock` sigue OK.

## Fuera de alcance (salvo orden expresa)

- Cambios de validación server-side (los espejos §4.5 no cambian).
- Animaciones/transiciones en feedback (stilesbase no los define aún).
