// Admin catalog behavior (doc/plan-mejoras-2.md Fase 1, refactorizado por
// doc/refactorUI.md Fase 3 §7/T3.1–T3.3): list via productosAdmin() with
// fallback to the public read when that action isn't deployed yet; in-page
// create/edit (gotcha G1 — no navigation/query params, /productos is ONE
// static page) inside the `producto-form` Drawer/Sheet; logical delete via
// activo: false (D2) behind the confirm modal (stilesbase §5.5); restore
// direct; and an IMMEDIATE catalogo_cache refresh after every successful
// mutation (gotcha G5 — never wait the 15-minute TTL, or the POS sells
// stale products).
// Fase 3 (T3.2–T3.3): local toolbar — search + estado chips + categoría +
// orden + counter, zero network (appscriptbase §5.3); BOTH lists (mobile
// cards + desktop table rows) painted from their templates by ONE
// paintRow(); >100 rows paginate in blocks of 50 via "Mostrar más".
// Hooks are data-* only (invariant 5); user-entered text always goes
// through textContent — product names never become HTML. Copy is simple
// Spanish, never raw error codes (stilesbase §5.7); no auto-retries (§5.3).

import {
  actualizarProducto,
  crearProducto,
  obtenerProductos,
  productosAdmin,
} from '../../api/actions/productos';
import { getCategorias } from '../../api/actions/categorias';
import { subirImagenCloudinary } from '../../api/client';
import type { ProductoAdmin } from '../../api/types';
import { resolveImageUrl } from '../../utils/cloudinary';
import { formatCurrency } from '../../utils/format';
import {
  limpiarErroresForm,
  mostrarErrorCampo,
  observarCampo,
} from '../../utils/form-errors';
import { closeModal, openModal } from '../../utils/modal';
import {
  isNonEmpty,
  isValidImageUrl,
  isValidPrecio,
  isValidStockValue,
} from '../../utils/validators';
import { getAjustes, setCatalogoCache } from '../../utils/storage';
import { mostrarToast } from '../../utils/toast';

// Local admin search (plan-reponer-buscar.md Fase 2): Fuse over the loaded
// list — same policy as the POS catalog (appscriptbase.md §5.3): the input
// handler NEVER touches the network, it only re-filters in memory.
import Fuse from 'fuse.js';

const root = document.querySelector<HTMLElement>('[data-productos-root]');

if (root) {
  const rowsEl = root.querySelector<HTMLElement>('[data-product-rows]');
  const template = root.querySelector<HTMLTemplateElement>('[data-product-row-template]');
  // Desktop (≥md): the DataTable renders ONE <table> per page — its tbody is
  // the drop zone for the ProductRowDesktop clones (ui/DataTable slot).
  const desktopTemplate = root.querySelector<HTMLTemplateElement>(
    '[data-product-row-desktop-template]',
  );
  const tbody = root.querySelector<HTMLElement>('table tbody');
  const form = root.querySelector<HTMLFormElement>('[data-product-form]');
  const formTitle = root.querySelector<HTMLElement>('[data-product-form-title]');
  const nombreInput = root.querySelector<HTMLInputElement>('[data-product-nombre]');
  const categoriaInput = root.querySelector<HTMLSelectElement>('[data-product-categoria]');
  const precioInput = root.querySelector<HTMLInputElement>('[data-product-precio]');
  const stockInput = root.querySelector<HTMLInputElement>('[data-product-stock]');
  const imagenInput = root.querySelector<HTMLInputElement>('[data-product-imagen]');
  const imagenFileInput = root.querySelector<HTMLInputElement>('[data-product-imagen-file]');
  const imagenPreview = root.querySelector<HTMLImageElement>('[data-product-imagen-preview]');
  const imagenQuitarBtn = root.querySelector<HTMLButtonElement>('[data-product-imagen-quitar]');
  const imagenEstado = root.querySelector<HTMLElement>('[data-product-imagen-estado]');
  const imagenError = root.querySelector<HTMLElement>('[data-product-imagen-error]');
  const submitBtn = root.querySelector<HTMLButtonElement>('[data-product-submit]');
  const cancelBtn = root.querySelector<HTMLButtonElement>('[data-product-cancel]');
  const confirmDeactivateBtn = root.querySelector<HTMLButtonElement>(
    '[data-product-confirm-deactivate]',
  );
  const errorAlert = root.querySelector<HTMLElement>('[data-alert="productos-error"]');
  const errorText = root.querySelector<HTMLElement>('[data-alert-error-text]');
  // T3.1: guardar errors show INSIDE the drawer (the page alert may sit
  // behind the overlay); list/toggle errors stay on the page alert.
  const formAlert = root.querySelector<HTMLElement>('[data-alert="productos-form-error"]');
  const formErrorText = root.querySelector<HTMLElement>('[data-product-form-error-text]');
  const formModal = root.querySelector<HTMLElement>('[data-modal-root="producto-form"]');
  const emptyState = root.querySelector<HTMLElement>('[data-empty-state="empty-productos"]');
  // Search-with-no-hits state (plan-reponer-buscar.md Fase 2) — only the
  // query result is empty, the catalog itself may be full.
  const sinResultados = root.querySelector<HTMLElement>('[data-empty-state="no-results"]');
  const searchInput = root.querySelector<HTMLInputElement>('[data-product-search]');
  // Toolbar (T3.2)
  const filterWrap = root.querySelector<HTMLElement>('[data-product-filter]');
  const catFilter = root.querySelector<HTMLSelectElement>('[data-product-catfilter]');
  const sortSel = root.querySelector<HTMLSelectElement>('[data-product-sort]');
  const countEl = root.querySelector<HTMLElement>('[data-product-count]');
  const moreBtn = root.querySelector<HTMLButtonElement>('[data-product-more]');

  // Badge tones (stilesbase §2): success = active, warning = inactive
  // attention — always paired with the word itself, never color alone (§5.2).
  const BADGE_ACTIVO = 'bg-success text-success-content';
  const BADGE_INACTIVO = 'bg-warning text-warning-content';

  // T3.3: pagination block (>100 rows → "Mostrar más" in blocks of 50).
  const BLOQUE = 50;

  let productos: ProductoAdmin[] = [];
  let editingId: string | null = null;
  let pendingDeactivateId: string | null = null;
  // Current admin search query (plan-reponer-buscar.md Fase 2) — set by the
  // debounced input handler, applied inside render().
  let busqueda = '';
  // Toolbar state (T3.2): all local, cero red.
  let filtro: '' | 'activo' | 'inactivo' | 'bajo' | 'agotado' = '';
  let catFiltro = '';
  let orden: 'nombre' | 'precio' | 'stock' = 'nombre';
  let visibleCount = BLOQUE;
  // P0 re-entry guards (plan-form-ux.md Fase 1): the disabled button stops
  // pointer double-clicks, these flags also cover Enter-key implicit
  // submission while a request is already in flight (duplicate product).
  let enviando = false;
  let enviandoToggle = false;
  let subiendoImagen = false;

  // Categoría <select>s (plan-productos-v2.md Fase 3 + toolbar T3.2): options
  // come from the public GET ?action=categorias; when that action isn't
  // deployed yet (or offline) fall back to the categories DERIVED from the
  // admin product list — same degradation strategy as the productosAdmin
  // fallback below. Only the first blank/Todas option is preserved.
  async function poblarCategorias(): Promise<void> {
    const res = await getCategorias();
    let nombres: string[];
    if (res.status === 'success') {
      nombres = res.body.categorias.map((c) => c.nombre);
    } else {
      nombres = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      );
    }

    for (const select of [categoriaInput, catFilter]) {
      if (!select) continue;
      const seleccionPrevia = select.value;
      while (select.options.length > 1) select.remove(1);
      for (const nombre of nombres) {
        const option = document.createElement('option');
        option.value = nombre;
        option.textContent = nombre;
        select.append(option);
      }
      // Keep the cashier's in-progress selection when it still exists.
      const existe = Array.from(select.options).some((o) => o.value === seleccionPrevia);
      select.value = existe ? seleccionPrevia : '';
      if (select === catFilter) catFiltro = select.value;
    }
  }

  function mostrarOk(mensaje: string): void {
    // Success = ephemeral toast (refactorUI §2.3 D9 — never shifts layout);
    // errors keep the persistent Alert right below.
    mostrarToast(mensaje);
    if (errorAlert) errorAlert.hidden = true;
  }

  // Page-level error (cargar / toggles): the drawer may be closed.
  function mostrarError(mensaje: string): void {
    if (errorText) errorText.textContent = mensaje;
    if (errorAlert) errorAlert.hidden = false;
  }

  // Form error (guardar): lives INSIDE the drawer next to the fields (T3.1).
  function mostrarErrorForm(mensaje: string): void {
    if (formErrorText) formErrorText.textContent = mensaje;
    if (formAlert) formAlert.hidden = false;
  }

  function ocultarAlertas(): void {
    if (errorAlert) errorAlert.hidden = true;
    if (formAlert) formAlert.hidden = true;
    // Inline field errors die with the alerts: edit/new mode starts clean.
    if (form) limpiarErroresForm(form);
  }

  // --- Cloudinary upload (plan-cierre.md Fase 3) -------------------------
  const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // preset also caps at 5 MB

  function sincronizarImagen(): void {
    const url = imagenInput?.value.trim() ?? '';
    if (imagenPreview) {
      imagenPreview.src = url;
      imagenPreview.hidden = url === '';
    }
    if (imagenQuitarBtn) imagenQuitarBtn.hidden = url === '';
  }

  function mostrarErrorImagen(mensaje: string): void {
    if (!imagenError) return;
    imagenError.textContent = mensaje;
    imagenError.hidden = false;
  }

  function ocultarEstadoImagen(): void {
    if (imagenEstado) imagenEstado.hidden = true;
    if (imagenError) imagenError.hidden = true;
  }

  async function subirImagen(file: File): Promise<void> {
    // P0 (plan-form-ux): a second file pick while one is uploading would
    // race — last write wins over a URL the cashier never saw.
    if (subiendoImagen) return;
    subiendoImagen = true;
    if (imagenFileInput) imagenFileInput.disabled = true;
    if (imagenEstado) {
      imagenEstado.textContent = 'Subiendo imagen…';
      imagenEstado.hidden = false;
    }
    if (imagenError) imagenError.hidden = true;

    try {
      const res = await subirImagenCloudinary(file);

      if (imagenEstado) imagenEstado.hidden = true;
      if (res.status === 'success') {
        if (imagenInput) imagenInput.value = res.url;
        sincronizarImagen();
        return;
      }
      // Simple Spanish, never the raw failure (stilesbase §5.7).
      if (res.status === 'network_failure') {
        mostrarErrorImagen('Sin conexión — no se pudo subir la imagen.');
      } else if (res.status === 'not_configured') {
        mostrarErrorImagen('La subida de imágenes no está configurada en este entorno.');
      } else {
        mostrarErrorImagen('No se pudo subir la imagen. Intentá de nuevo.');
      }
    } finally {
      subiendoImagen = false;
      if (imagenFileInput) imagenFileInput.disabled = false;
    }
  }

  // Spanish copy per transport outcome / §4.5 code — the code itself never
  // reaches the cashier's eyes.
  function mensajeDeError(error: string): string {
    switch (error) {
      case 'payload_invalido':
        return 'Revisá los campos del producto.';
      case 'accion_no_soportada':
        return 'El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script.';
      default:
        return 'No se pudo guardar. Intentá de nuevo.';
    }
  }

  async function refrescarCachePos(): Promise<void> {
    // G5: push a fresh public catalog into catalogo_cache right after any
    // successful mutation — the POS sees it without waiting the TTL.
    const res = await obtenerProductos();
    if (res.status === 'success') {
      setCatalogoCache({ productos: res.body.productos, timestamp: Date.now() });
    }
  }

  async function cargar(): Promise<void> {
    const res = await productosAdmin();
    if (res.status === 'success') {
      productos = res.body.productos;
      await poblarCategorias();
      render();
      return;
    }

    // Fallback (plan Fase 1): the admin action may not exist on the live
    // endpoint yet (owner hasn't re-deployed) — degrade to the public actives
    // list instead of breaking the screen.
    const publico = await obtenerProductos();
    if (publico.status === 'success') {
      productos = publico.body.productos.map((p) => ({ ...p, activo: true }));
      await poblarCategorias();
      render();
      return;
    }

    // Load failed entirely: leave whatever options the selects already have —
    // wiping them would break a form the cashier may be filling right now.
    render();
    mostrarError(
      publico.status === 'network_failure'
        ? 'No hay conexión y no se pudo cargar el catálogo.'
        : 'No se pudo cargar el catálogo de productos.',
    );
  }

  // ONE paint routine for BOTH templates (mobile li / desktop tr): hooks
  // that don't exist in a template are simply skipped.
  function paintRow(row: HTMLElement, producto: ProductoAdmin): void {
    const nombre = row.querySelector<HTMLElement>('[data-product-nombre]');
    const categoria = row.querySelector<HTMLElement>('[data-product-categoria]');
    const precio = row.querySelector<HTMLElement>('[data-product-precio]');
    const stock = row.querySelector<HTMLElement>('[data-product-stock]');
    const stockPlain = row.querySelector<HTMLElement>('[data-product-stock-plain]');
    const low = row.querySelector<HTMLElement>('[data-product-low]');
    const agotado = row.querySelector<HTMLElement>('[data-product-agotado]');
    const badge = row.querySelector<HTMLElement>('[data-product-badge]');
    const desactivar = row.querySelector<HTMLElement>('[data-product-deactivate]');
    const restaurar = row.querySelector<HTMLElement>('[data-product-restore]');
    const img = row.querySelector<HTMLImageElement>('[data-product-img]');

    if (nombre) nombre.textContent = producto.nombre;
    if (categoria) categoria.textContent = producto.categoria;
    if (precio) precio.textContent = formatCurrency(producto.precio);
    // Mobile card carries the prefix (no column header); the desktop column
    // header already says "Stock" → plain number there.
    if (stock) stock.textContent = `Stock: ${producto.stock}`;
    if (stockPlain) stockPlain.textContent = String(producto.stock);

    // Desktop stock tags (T3.3): umbral from ajustes.stock_alerta_min —
    // same semantics as the POS catalog (bajo: 0 < stock < umbral).
    if (low || agotado) {
      const umbral = getAjustes().stock_alerta_min;
      if (low) low.hidden = !(producto.stock > 0 && producto.stock < umbral);
      if (agotado) agotado.hidden = producto.stock !== 0;
    }

    // Admin thumbnail (plan-productos-v2.md Fase 4): single render point
    // via resolveImageUrl (same as the POS card). T4.4 fix: the img is
    // opacity-0 until `load` (display:none + lazy = nunca se descarga —
    // ver Card.astro); sin URL o con error la isla colapsa el nodo con
    // `hidden` — la fila queda sin espacio de miniatura, como siempre.
    if (img) {
      const url = resolveImageUrl(producto.imagen_url);
      if (!url) {
        img.hidden = true;
      } else {
        img.hidden = false;
        img.addEventListener(
          'error',
          () => {
            img.hidden = true;
          },
          { once: true },
        );
        img.addEventListener(
          'load',
          () => {
            img.classList.remove('opacity-0');
          },
          { once: true },
        );
        img.src = url;
      }
    }
    if (badge) {
      badge.textContent = producto.activo ? 'Activo' : 'Inactivo';
      badge.className = `inline-block rounded-full px-3 py-1 text-base font-semibold ${
        producto.activo ? BADGE_ACTIVO : BADGE_INACTIVO
      }`;
    }
    // Only the toggle that matches the current state shows (D2: low → the
    // row offers restore; high → confirm-then-deactivate).
    if (desactivar) desactivar.hidden = !producto.activo;
    if (restaurar) restaurar.hidden = producto.activo;
  }

  function render(): void {
    if (!rowsEl || !template) return;
    rowsEl.replaceChildren();
    tbody?.replaceChildren();

    // Search filter (plan-reponer-buscar.md): index rebuilt here so every
    // mutation (create/edit/restore) is searchable without extra wiring.
    const consulta = busqueda.trim();
    let fuse: Fuse<ProductoAdmin> | null = null;
    if (consulta) {
      fuse = new Fuse(productos, { keys: ['nombre', 'categoria'], threshold: 0.3 });
    }
    const base = consulta && fuse ? fuse.search(consulta).map((r) => r.item) : productos;

    // Estado chips (T3.2): "bajo"/"agotado" reason about LIVE products only
    // (an inactive product's stock doesn't need attention on this screen).
    const umbral = getAjustes().stock_alerta_min;
    let filtrados = base;
    if (filtro === 'activo') filtrados = base.filter((p) => p.activo);
    else if (filtro === 'inactivo') filtrados = base.filter((p) => !p.activo);
    else if (filtro === 'bajo')
      filtrados = base.filter((p) => p.activo && p.stock > 0 && p.stock < umbral);
    else if (filtro === 'agotado') filtrados = base.filter((p) => p.activo && p.stock === 0);

    if (catFiltro) filtrados = filtrados.filter((p) => p.categoria === catFiltro);

    const visibles = [...filtrados].sort((a, b) => {
      if (orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
      // precio: cheaper first; stock: low first (reposición urgente first).
      if (orden === 'precio') return a.precio - b.precio;
      return a.stock - b.stock;
    });

    // Counter (T3.2): honest numbers — rows actually shown vs. the filtered
    // universe; hidden when there's nothing to count (empty states speak).
    if (countEl) {
      countEl.textContent =
        visibles.length === 0
          ? ''
          : `Mostrando ${Math.min(visibles.length, visibleCount)} de ${visibles.length} productos`;
    }

    const mostrados = visibles.slice(0, visibleCount);
    for (const producto of mostrados) {
      const first = template.content.firstElementChild;
      if (first) {
        const row = first.cloneNode(true) as HTMLElement;
        row.setAttribute('data-product-id', producto.id);
        paintRow(row, producto);
        rowsEl.append(row);
      }
      if (desktopTemplate && tbody) {
        const firstTr = desktopTemplate.content.firstElementChild;
        if (firstTr) {
          const tr = firstTr.cloneNode(true) as HTMLElement;
          tr.setAttribute('data-product-id', producto.id);
          paintRow(tr, producto);
          tbody.append(tr);
        }
      }
    }

    // T3.3: "Mostrar más" only when rows remain beyond the current block.
    if (moreBtn) moreBtn.hidden = visibles.length <= visibleCount;

    if (emptyState) emptyState.hidden = productos.length > 0;
    if (sinResultados) {
      sinResultados.hidden = !(consulta !== '' && productos.length > 0 && visibles.length === 0);
    }
  }

  function editarProducto(id: string): void {
    const producto = productos.find((p) => p.id === id);
    if (!producto) return;
    editingId = id;
    if (formTitle) formTitle.textContent = 'Editar producto';
    if (submitBtn) submitBtn.textContent = 'Guardar cambios';
    if (cancelBtn) cancelBtn.hidden = false;
    if (nombreInput) nombreInput.value = producto.nombre;
    if (categoriaInput) {
      // Legacy products may carry a category the select doesn't offer yet
      // (created before Fase 3, or missing from the sheet): inject it so the
      // value never silently resets to blank while editing.
      const existe = Array.from(categoriaInput.options).some(
        (o) => o.value === producto.categoria,
      );
      if (producto.categoria && !existe) {
        const option = document.createElement('option');
        option.value = producto.categoria;
        option.textContent = producto.categoria;
        categoriaInput.append(option);
      }
      categoriaInput.value = producto.categoria;
    }
    if (precioInput) precioInput.value = String(producto.precio);
    if (stockInput) stockInput.value = String(producto.stock);
    if (imagenInput) imagenInput.value = producto.imagen_url;
    ocultarAlertas();
    ocultarEstadoImagen();
    sincronizarImagen();
    // T3.1: the form lives in the drawer — open it with the edit payload.
    // Focus return to the Editar button is handled by utils/modal on close.
    if (formModal) openModal(formModal);
    nombreInput?.focus();
  }

  function modoNuevo(): void {
    editingId = null;
    form?.reset();
    if (formTitle) formTitle.textContent = 'Nuevo producto';
    if (submitBtn) submitBtn.textContent = 'Guardar producto';
    if (cancelBtn) cancelBtn.hidden = true;
    ocultarAlertas();
    ocultarEstadoImagen();
    sincronizarImagen();
  }

  type DatosForm = {
    nombre: string;
    categoria: string;
    precio: number;
    stock: number;
    imagen_url: string;
  };

  function leerFormulario():
    | { ok: true; datos: DatosForm }
    | { ok: false; mensaje: string; campo: HTMLInputElement | HTMLSelectElement | null } {
    const nombre = nombreInput?.value.trim() ?? '';
    const categoria = categoriaInput?.value.trim() ?? '';
    const precioRaw = precioInput?.value.trim() ?? '';
    const stockRaw = stockInput?.value.trim() ?? '';
    const imagen = imagenInput?.value.trim() ?? '';

    if (!isNonEmpty(nombre)) {
      return { ok: false, mensaje: 'Ingresá el nombre del producto.', campo: nombreInput ?? null };
    }
    if (!isNonEmpty(categoria)) {
      return {
        ok: false,
        mensaje: 'Elegí la categoría del producto.',
        campo: categoriaInput ?? null,
      };
    }
    // Raw emptiness first: Number('') is 0, which would pass as a valid price.
    if (precioRaw === '' || !isValidPrecio(Number(precioRaw))) {
      return {
        ok: false,
        mensaje: 'Ingresá un precio igual o mayor a 0.',
        campo: precioInput ?? null,
      };
    }
    if (stockRaw === '' || !isValidStockValue(Number(stockRaw))) {
      return {
        ok: false,
        mensaje: 'Ingresá un stock entero igual o mayor a 0.',
        campo: stockInput ?? null,
      };
    }
    if (!isValidImageUrl(imagen)) {
      return {
        ok: false,
        mensaje: 'La imagen debe ser una URL que empiece con http:// o https://.',
        campo: imagenInput ?? null,
      };
    }

    return {
      ok: true,
      datos: {
        nombre,
        categoria,
        precio: Number(precioRaw),
        stock: Number(stockRaw),
        imagen_url: imagen,
      },
    };
  }

  async function guardar(datos: DatosForm): Promise<void> {
    // P0 re-entry guard + pending state (plan-form-ux.md Fase 1, pattern of
    // login-form.ts): double submit would create a DUPLICATE product — the
    // server does not dedupe crearProducto. Enter-to-submit is covered by
    // the flag even if a browser skips the disabled button.
    if (enviando) return;
    enviando = true;
    const idEditando = editingId;
    const esAlta = idEditando === null;
    const textoOriginal = esAlta ? 'Guardar producto' : 'Guardar cambios';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = esAlta ? 'Creando…' : 'Guardando…';
    }

    try {
      const resultado = esAlta
        ? await crearProducto(datos)
        : await actualizarProducto({ id: idEditando, ...datos });

      if (resultado.status === 'success') {
        mostrarOk(esAlta ? 'Producto creado.' : 'Producto actualizado.');
        modoNuevo();
        // T3.1: success closes the drawer (focus returns to the opening
        // trigger via utils/modal) — no more rapid-entry focus on the
        // now-hidden form.
        if (formModal) closeModal(formModal);
        await cargar();
        await refrescarCachePos();
        return;
      }
      if (resultado.status === 'network_failure') {
        mostrarErrorForm('Sin conexión — no se pudo guardar el producto.');
        return;
      }
      mostrarErrorForm(mensajeDeError(resultado.error));
    } finally {
      enviando = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = textoOriginal;
      }
      // modoNuevo() already reset the label on success; restore the right
      // one for the mode we are actually in after an error.
      if (editingId !== null && submitBtn) submitBtn.textContent = 'Guardar cambios';
    }
  }

  async function cambiarActivo(id: string, activo: boolean): Promise<void> {
    // P0: rapid double-click on Restaurar/Desactivar would toggle twice
    // (net zero + confusing error from the second in-flight call).
    if (enviandoToggle) return;
    enviandoToggle = true;
    try {
      const resultado = await actualizarProducto({ id, activo });
      if (resultado.status === 'success') {
        mostrarOk(activo ? 'Producto restaurado.' : 'Producto desactivado.');
        await cargar();
        await refrescarCachePos();
        return;
      }
      if (resultado.status === 'network_failure') {
        mostrarError('Sin conexión — no se pudo actualizar el producto.');
        return;
      }
      mostrarError(mensajeDeError(resultado.error));
    } finally {
      enviandoToggle = false;
    }
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    // Fresh attempt: drop stale inline errors before validating again.
    limpiarErroresForm(form);
    const lectura = leerFormulario();
    if (!lectura.ok) {
      // P1 (plan-form-ux.md): the message goes NEXT TO the offending field
      // (role="alert" + aria-invalid), not only to the form-level Alert.
      if (lectura.campo) {
        mostrarErrorCampo(lectura.campo, lectura.mensaje);
        lectura.campo.focus();
      } else {
        mostrarErrorForm(lectura.mensaje);
      }
      return;
    }
    void guardar(lectura.datos);
  });

  cancelBtn?.addEventListener('click', () => {
    // T3.1: cancel inside the drawer = reset to "nuevo" AND close it.
    modoNuevo();
    if (formModal) closeModal(formModal);
  });

  imagenFileInput?.addEventListener('change', () => {
    const file = imagenFileInput.files?.[0];
    // Clear immediately so picking the SAME file again still fires change.
    imagenFileInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      mostrarErrorImagen('Elegí un archivo de imagen (JPG, PNG o WebP).');
      return;
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      mostrarErrorImagen('La imagen pesa más de 5 MB. Reducí el tamaño e intentá de nuevo.');
      return;
    }
    void subirImagen(file);
  });

  imagenQuitarBtn?.addEventListener('click', () => {
    if (imagenInput) imagenInput.value = '';
    ocultarEstadoImagen();
    sincronizarImagen();
  });

  // ONE delegated listener for BOTH lists (mobile ul + desktop tbody): the
  // shared data-product-row / data-product-id hooks are identical.
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const row = target.closest<HTMLElement>('[data-product-row]');
    if (!row) return;
    const id = row.getAttribute('data-product-id');
    if (!id) return;

    if (target.closest('[data-product-edit]')) {
      editarProducto(id);
      return;
    }
    if (target.closest('[data-product-deactivate]')) {
      // The modal itself opens via modal-controller (data-modal-open on the
      // button); remember which product the confirmation applies to.
      pendingDeactivateId = id;
      return;
    }
    if (target.closest('[data-product-restore]')) {
      void cambiarActivo(id, true);
    }
  });

  confirmDeactivateBtn?.addEventListener('click', () => {
    if (pendingDeactivateId) void cambiarActivo(pendingDeactivateId, false);
    pendingDeactivateId = null;
  });

  // "+ Nuevo producto" lives in the TopBar (page-actions slot) and in the
  // empty state — BOTH are OUTSIDE/inside root but never inside a row, so
  // this runs at document level. modal-controller opens the drawer on the
  // same click (data-modal-open); this handler only resets the form so the
  // drawer always starts in "nuevo" mode.
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-product-new]')) modoNuevo();
  });

  // Estado chips (T3.2): exclusive selection, aria-pressed flips, local only.
  filterWrap?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest<HTMLElement>('[data-filter-value]');
    if (!chip) return;
    const valor = chip.getAttribute('data-filter-value') ?? '';
    filtro = valor as typeof filtro;
    visibleCount = BLOQUE;
    filterWrap
      .querySelectorAll<HTMLElement>('[data-filter-value]')
      .forEach((c) =>
        c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'),
      );
    render();
  });

  // Categoría / orden selects (T3.2): local re-render, zero network.
  catFilter?.addEventListener('change', () => {
    catFiltro = catFilter.value;
    visibleCount = BLOQUE;
    render();
  });
  sortSel?.addEventListener('change', () => {
    orden = (sortSel.value as 'nombre' | 'precio' | 'stock') || 'nombre';
    render();
  });

  // Admin search (plan-reponer-buscar.md Fase 2): local-only, debounced —
  // zero API calls in the handler (appscriptbase.md §5.3), same 200 ms
  // debounce as the POS search. A new query restarts the 50-row block.
  let debounceBusqueda: ReturnType<typeof setTimeout> | undefined;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceBusqueda);
    debounceBusqueda = setTimeout(() => {
      busqueda = searchInput.value;
      visibleCount = BLOQUE;
      render();
    }, 200);
  });

  // T3.3: next block of 50 (button hides itself when nothing remains).
  moreBtn?.addEventListener('click', () => {
    visibleCount += BLOQUE;
    render();
  });

  // Inline errors vanish as soon as the user retypes (plan-form-ux Fase 1).
  if (nombreInput) observarCampo(nombreInput);
  if (categoriaInput) observarCampo(categoriaInput);
  if (precioInput) observarCampo(precioInput);
  if (stockInput) observarCampo(stockInput);
  if (imagenInput) observarCampo(imagenInput);

  void cargar(); // first paint from the admin read (fallback keeps it usable)
}
