# Plan de cierre — últimos pendientes

> **Origen:** auditoría docs-vs-código del 23/09/2026. Cubre lo único que quedó
> abierto tras `plan.md`, `plan-features.md`, `plan-sidebar.md` y
> `plan-mejoras-2.md` (este último **COMPLETO** el 23/09/2026).
>
> **Confirmado por el dueño 23/09/2026:** gate de accesibilidad del sidebar,
> checklists humanos de setup backend (`plan.md` Fase 6 / `appscriptbase.md` §6)
> y commit/remote/Vercel ya están hechos — solo falta anotarlos en los docs
> (Fase 0). El upload de imágenes **sí va**: Cloudinary desde el formulario de
> productos (cambia la decisión "sin uploader" de `extras.md` §4 — pedido
> explícito del dueño 23/09/2026).

---

## Fase 0 — Actualizar docs con lo ya hecho (mecánico)

- [x] `doc/plan.md` Fase 6: tildar con fecha las 4 acciones humanas pendientes
      (hojas `Productos`/`Ventas`/`Sesiones`, Script Properties, seed, primer
      login) + el checkbox de PR/remote de Fase 8 (L339) — remote
      `origin/main` sincronizado verificado 23/09/2026. *Hecho 23/09/2026.*
- [x] `doc/appscriptbase.md` §6: tildar el checklist de deploy (los 7 puntos —
      `Content-Type: text/plain` verificado en `client.ts:70`, flujo de token
      vencido → `expirarSesion()` verificado en `client.ts:65`). *Hecho 23/09/2026.*
- [x] `doc/plan-sidebar.md` L86: tildar el gate humano de accesibilidad
      (firmado por el dueño 23/09/2026). *Hecho 23/09/2026.*
- [x] `doc/plan-features.md`: tildar Fase 7 (commit/remote L283, Vercel
      L284–L287, gates L291–L292, PR L328) con fecha; el paso 251 (subida
      manual de fotos) **se reemplaza** por la decisión nueva de Fase 3 de
      este plan — anotar en vez de tildar. *Hecho 23/09/2026 (250 tildado:
      cloud name real en `.env`; 251 tildado como "resuelto por vía
      alternativa"; URL de evidencia de L292 pendiente de anotar por el dueño).*
- [x] `doc/extras.md` §4: anotar el cambio de decisión —
      *"23/09/2026: el dueño pide uploader de imágenes en el form de
      productos (Cloudinary unsigned upload) — antes 'sin uploader'; ver
      `plan-cierre.md` Fase 3."* *Hecho 23/09/2026.*

**Gate Fase 0:** `grep -n "\[ \]" doc/plan.md doc/plan-features.md doc/plan-sidebar.md doc/appscriptbase.md`
→ solo quedan sin tildar las tareas de ESTE plan. *✅ CERRADO 23/09/2026 —
grep exit=1 (0 matches) en los 4 docs; `extras.md`/`base.md` sin checkboxes
pendientes.*

---

## Fase 1 — "Productos más vendidos" del día

**Contexto:** `base.md` §7 promete *"Reporte básico del día: total vendido,
número de ventas, productos más vendidos"* — los dos primeros existen (Fase 3
de `plan-mejoras-2`), este es el único gap real de promesa sin cumplir.

- [x] **D1 — confirmar con el dueño:** ¿se implementa o se tacha la promesa en
      `base.md` §7? *(si el dueño la tacha, esta fase se elimina y el resto
      del plan sigue igual)* — *→ Respondida: **IMPLEMENTAR** — "vamos con la
      fase 1", dueño 23/09/2026.*
- [x] Helper `topProductosDelDia(fechaDia, limite)` en `src/utils/` (casa
      propia, p. ej. `utils/reportes.ts` — **no** meterlo en `caja.ts` que es
      de caja): agrupa unidades por producto sobre `historial_ventas` del día
      (mismo `localDayKey` que todo el reporte, G2), ordena por unidades desc,
      top 3. *Hecho 23/09/2026: `src/utils/reportes.ts` nuevo —
      `topProductosDelDia(ventas, limite = 3)`. **Desviación de firma
      anotada:** recibe el array de `ventas` ya filtrado del grupo (no
      `fechaDia`) según la 4.ª tarea de esta fase ("calcular sobre ventas ya
      filtradas") — evita re-leer storage y garantiza que top y desglose
      hablen del mismo conjunto. Orden: unidades desc, empate alfabético.*
- [x] Render **texto** dentro del grupo `<details>` del día en
      `islands/historial.ts` (junto al desglose por método): "Más vendidos:
      Producto A ×3 · Producto B ×2 · …" — solo productos con movimiento,
      nunca solo color (stilesbase §5.2). *Hecho 23/09/2026: línea dentro
      del `<summary>` bajo el row principal (visible también colapsado, junto
      al desglose), hook `[data-hist-top]` hidden por defecto; se oculta si
      el día no tiene productos.*
- [x] Refrescar el texto en cada `render()` (el filtro de fechas no cambia el
      grupo, pero sí el conjunto de ventas → calcular sobre `ventas` ya
      filtradas del grupo, como el desglose). *Hecho — se recalcula en cada
      `render()` sobre `ventas` del grupo (mismo origen que el desglose).*

**Gate Fase 1:** `pnpm build` 0 errores · en `/historial` el día abierto
muestra top 3 correcto (verificar a mano con 2 ventas del mismo producto) ·
día sin repetidos muestra solo lo existente · invariantes verdes.
*✅ Automatizado 23/09/2026: build **6 páginas / 0 errores**; invariantes
fetch→0 · localStorage→0 · id="→0 · text-xs|sm→0; `tsc` 0 errores en
`reportes.ts`/`historial.ts` (baseline 15 preexistentes intacto);
`grep TODO` real = solo EmptyState (los otros 10 hits son el substring
"TODO" dentro de `METODOS` — falso positivo). **Pendiente del dueño:** verificación
visual con 2 ventas del mismo producto.*

---

## Fase 2 — Icono del EmptyState

**Contexto:** `extras.md` §6 exige *"Mensaje simple + ilustración/ícono —
nunca dejar el espacio en blanco"*; `EmptyState.astro:10` todavía tenía el
`TODO(Fase 7)`.

- [x] Quitar el TODO y agregar un **SVG inline** de ícono genérico de
      producto (caja/paquete), `currentColor` + `text-text-muted` — **sin**
      nuevos colores, sin imports (ui/ = solo props, astrobase §3.2).
      *Hecho 23/09/2026: SVG de caja/paquete (2 paths, stroke 1.5,
      `aria-hidden` + `focusable="false"` — el `<p>` ya dice el mensaje).*
- [x] Mantener `gap-2`/`p-8` existentes; ícono arriba del `<p>`. *Hecho —
      ícono `h-10 w-10` sobre el `<p>`, clases intactas.*

**Gate Fase 2:** `pnpm build` 0 errores · `grep -rn "TODO" src/` → **0** ·
estados vacíos (`empty-catalog`, `no-results`, `empty-historial`,
`venta-notfound`) muestran ícono + mensaje. *✅ Automatizado 23/09/2026:
build 6 páginas/0 errores; `grep -w TODO` → **0** (primera vez sin TODOs
reales en `src/`; ojo: `METODOS` contiene el substring "TODO" — grep usa
`\bTODO\b`); `text-xs|sm` → 0; hex → 0; `EmptyState` sin imports ✓; tsc sin
errores. **Pendiente del dueño:** ver los 5 estados vacíos con ícono en
navegador.*

---

## Fase 3 — Upload a Cloudinary desde el form de productos

**Contexto:** pedido explícito del dueño 23/09/2026 (cambia `extras.md` §4).
Cloudinary **unsigned upload** desde el navegador — sin backend propio, sin
exponer secretos.

- [x] Crear **upload preset sin firmar** en el dashboard de Cloudinary
      (Acciones → Upload → Add upload preset → Signing Mode: *Unsigned*,
      carpeta `productos`, formato imagen, límite de tamaño p. ej. 5MB).
      *← gate humano (dueño, 1 min).* **Hecho 23/09/2026: preset
      `productos-unsigned` (Unsigned, type:upload, overwrite:false,
      unique-filename:false) creado por el dueño.**
- [x] `.env` / `.env.example`: `PUBLIC_CLOUDINARY_UPLOAD_PRESET` (el cloud
      name ya está: `dlxh4jrix`). *Hecho — ambos archivos con
      `PUBLIC_CLOUDINARY_UPLOAD_PRESET=productos-unsigned` / placeholder.*
- [x] `subirImagenCloudinary(file)` **dentro de `api/client.ts`** — el monopolio
      del `fetch` es total: `POST https://api.cloudinary.com/v1_1/{cloud}/upload`
      con `FormData` (`file` + `upload_preset`). **Gotcha:** `client.ts` manda
      `text/plain` para Apps Script; Cloudinary necesita `multipart/form-data`
      → usar `FormData` sin forzar Content-Type (el browser pone el boundary).
      *Hecho — `subirImagenCloudinary` exportada en `client.ts`: FormData sin
      header Content-Type, `response.ok` chequeado (Cloudinary sí usa HTTP
      status real, a diferencia de Apps Script), devuelve
      `success/api_error/network_failure/not_configured`.*
- [x] `ProductForm.astro`: campo de archivo (`.btn-secondary` "Subir imagen" +
      `<input type="file" accept="image/*" hidden>` con label accesible),
      preview de la imagen, estado "Subiendo…" y mensaje de error en
      lenguaje simple (`danger`), botón "Quitar imagen" que limpia
      `imagen_url`. La URL resultante (`secure_url`) llena el hidden
      `imagen_url` que ya guarda el form. *Hecho — label-button con
      `focus-within` ring y input `sr-only` (teclado ✓), preview `h-32 w-32`,
      `<p aria-live="polite">` de estado + `<p role="alert">` de error
      (copy simple: sin conexión / no configurada / error genérico / tipo /
      5MB), botón "Quitar imagen" toggled por la URL presente. El input URL
      sigue existiendo como hidden — `leerFormulario()` y `isValidImageUrl`
      sin cambios.*
- [x] `islands/product-admin.ts`: orquestar upload → esperar URL → continuar
      con `crearProducto`/`actualizarProducto` (la acción no se dispara hasta
      tener la URL o el usuario cancela). *Hecho — upload dispara solo al
      elegir el archivo (change → valida tipo/≤5MB → `subirImagen` → setea la
      URL); el submit guarda con la URL ya puesta o vacía (producto sin foto
      sigue funcionando, G-UP3); `sincronizarImagen()` en editar/nuevo/
      quitar; se limpia el file input para poder re-elegir el mismo archivo.*
- [x] Editar producto existente con imagen: preview de la actual; subir una
      nueva la reemplaza (Cloudinary borra/ignora la vieja — aceptado, no hay
      destroy en plano gratuito sin back-end; anotar). *Hecho — preview al
      editar; subir una nueva reemplaza la URL (la vieja queda huérfana en
      Cloudinary — aceptado y anotado).*

**Gotchas / riesgos:**
- **G-UP1 — preset público:** cualquiera con el preset puede subir. Aceptado
  para single-user (mismo threat model de `base.md` §8); reforzar con
  límites del preset (tamaño/formato/carpeta). **Nunca** subir `api_secret`.
- **G-UP2 — CORS:** verificar en el primer test real que Cloudinary acepta el
  POST desde el origin; si falla, configurar CORS en el dashboard de
  Cloudinary (Allow origin de Vercel/localhost) — sin tocar la app.
  *(Pendiente del primer test del dueño.)*
- **G-UP3 — no romper el alta sin imagen:** el form debe funcionar igual si
  el usuario no sube nada (`imagen_url` vacío → placeholder, que ya existe).
  *Cubierto: `imagen_url` vacío pasa `isValidImageUrl` como antes.*

**Gate Fase 3:** subir una foto real desde el form → aparece en preview →
guardar → el producto creado/editado muestra la imagen optimizada en el POS
(URL `res.cloudinary.com` con transformaciones `w_400`) · error de red
muestra mensaje sin romper el form · invariantes verdes.
*✅ Automatizado 23/09/2026: build 6 páginas/0 errores; invariantes
fetch→0 (el nuevo fetch vive en `client.ts` ✓) · localStorage→0 · id="→0 ·
text-xs|sm→0; `ProductForm` solo importa `Button` (ui/ ✓); tsc 0 errores en
`client.ts`/`product-admin.ts`. **Pendiente del dueño (G-UP2 + prueba de
vuelo):** subir foto real desde el form y verla en el POS.*

---

## Fase 4 — Auditoría final del cierre

- [x] Invariantes estándar: fetch solo `client.ts` · `localStorage.*` solo
      `storage.ts` (6 llaves) · `id="` en islands → 0 · `text-xs|text-sm` → 0 ·
      ui/ sin imports api/stores/storage · hex → 0 fuera de
      `global.css`/`astro.config.mjs` · `Layout.astro` sin condicionales ·
      contratos `types.ts` ↔ `appscriptbase.md` ↔ `Code.gs` espejados.
      *✅ 23/09/2026: 0·0·6·0·0·0·0·0 respectivamente; espejos: 7 escrituras
      + login + productos = 8 cases `Code.gs` = 8 acciones §3.2; 5
      `ErrorCode` = 5 filas §4.5.*
- [x] `grep -rn "TODO" src/` → 0. *✅ `\bTODO\b` → 0 (con `grep -w`/`\b` —
      `METODOS` contiene el substring).*
- [x] `pnpm build` → 0 errores (6 páginas + cualquier página nueva).
      *✅ 6 páginas / 0 errores.*
- [x] `pnpm exec tsc --noEmit` → 0 errores en archivos de este plan
      (baseline preexistente: catalog.ts 12 / checkout.ts 2 / pwa.ts 1).
      *✅ total 15 = baseline exacto (12/2/1), distribución intacta.*
- [x] Actualizar desviaciones de árbol nuevas (si las hay) en
      `doc/plan.md` Fase 8. *✅ anotado: `utils/reportes.ts` (plan-cierre
      Fase 1) + nota de archivos modificados por la Fase 3.*

**Gate Fase 4:** todos los greps en verde + build limpio. *✅ CERRADO
23/09/2026 — 8 invariantes 0/0/0/0/0/0/0/0, contratos espejados, build 6
páginas/0, tsc = baseline.*

---

## Fase 5 — Gates humanos del dueño

- [x] D1 respondido (productos más vendidos: sí/no). *SÍ — 23/09/2026.*
- [x] Preset de Cloudinary creado (Fase 3). *`productos-unsigned` — 23/09/2026.*
- [x] Prueba de vuelo completa: subir imagen desde el form → crear producto →
      verlo en el POS con foto → top 3 de productos más vendidos en
      `/historial` → estados vacíos con ícono. *✅ dueño 23/09/2026: "todo
      salió bien y está funcional" + "se ve lo de más vendidos y los demás
      también" (G-UP2 CORS verificado en vivo).*
- [x] Accesibilidad spot: foco visible en el botón de upload, targets 56px,
      texto 18px, nada solo-hover. *✅ confirmado por el dueño 23/09/2026.*

**Gate de cierre del plan:** auditoría en verde + checklist humano firmado.
*✅ **CERRADO 23/09/2026** — auditoría 8 invariantes verdes + build 6
páginas/0 + tsc baseline; checklist humano firmado por el dueño.*

---

**PLAN COMPLETO 23/09/2026** — Fases 0–5 cerradas con evidencia.

---

## Fuera de alcance de este plan

- **Paginación/virtualización** (`base.md` §9): queda pendiente solo si algún
  día el catálogo pasa de ~1000 productos (hoy: 194 seed).
- **CI** (`.github/workflows`): no existe; agregarlo es decisión del dueño si
  quiere checks automáticos en el push — no prometido en ningún doc.
- Export CSV · MODO_DEMO · backdrop del drawer · refactor `Head.astro`
  compartido — exclusiones ya anotadas en sus planes.
