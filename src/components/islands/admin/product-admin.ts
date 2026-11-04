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

import { getCategorias } from '../../../api/actions/categorias';
import { getMarcas } from '../../../api/actions/marcas';
import {
  actualizarProducto,
  crearProducto,
  obtenerProductos,
  productosAdmin,
} from '../../../api/actions/productos';
import { subirImagenCloudinary } from '../../../api/client';
import type { ProductoAdmin } from '../../../api/types';
import { mensajeDeErrorApi } from '../../../utils/api-result';
import { resolveImageUrl } from '../../../utils/cloudinary';
import {
  cloneTemplate,
  debounce,
  delegateAction,
  qs,
  selectChip,
  setHidden,
  setText,
} from '../../../utils/dom';
import { crearFeedback } from '../../../utils/feedback';
import { createFormManager } from '../../../utils/form-manager';
import { formatCurrency } from '../../../utils/format';
import {
  limpiarErrorCampo,
  limpiarErroresForm,
  mostrarErrorCampo,
  observarCampo,
} from '../../../utils/form-errors';
import { closeModal, openModal } from '../../../utils/modal';
// product.md: presentations / price tiers / attributes domain helpers —
// validation on read, category-adapted suggestion keys, quantity label.
import {
  nuevaPresentacionId,
  ordenarTiers,
  claveAtributoPermitida,
  sugerenciasAtributos,
  type AtributosProducto,
  type Presentacion,
  type RangoPrecio,
} from '../../../utils/presentaciones';
import { getAjustes, setCatalogoCache } from '../../../utils/storage';
import { mostrarToast } from '../../../utils/toast';
import {
  isNonEmpty,
  isValidImageUrl,
  isValidPrecio,
  isValidStockValue,
} from '../../../utils/validators';
import {
  esBarcodeValido,
  hayBarcodeDuplicado,
  normalizarBarcode,
} from '../../../utils/barcode';
import { abrirEscaneoBarcode } from '../runtime/barcode-scanner';

// Local admin search (plan-reponer-buscar.md Fase 2): shared pipeline in
// utils/search.ts — same policy as the POS catalog (appscriptbase.md §5.3):
// the input handler NEVER touches the network, it only re-filters in memory.
// Owner request 2026-11-01: barcode exact → substring → fuzzy-nombre-only,
// so "aceite" no longer fuzzy-matches Lácteos/Maceta/Aretes.
import { buscarProductos } from '../../../utils/search';
import { normalizeSearchQuery } from '../../../utils/search-normalize';
import { createVoiceSearch, isSpeechSupported } from '../../../utils/speech';

const root = qs<HTMLElement>(document, '[data-productos-root]');

if (root) {
  const rowsEl = qs<HTMLElement>(root, '[data-product-rows]');
  const template = qs<HTMLTemplateElement>(root, '[data-product-row-template]');
  // Desktop (≥md): the DataTable renders ONE <table> per page — its tbody is
  // the drop zone for the ProductRowDesktop clones (ui/DataTable slot).
  const desktopTemplate = qs<HTMLTemplateElement>(
    root,
    '[data-product-row-desktop-template]',
  );
  const tbody = qs<HTMLElement>(root, 'table tbody');
  const form = qs<HTMLFormElement>(root, '[data-product-form]');
  const formTitle = qs<HTMLElement>(root, '[data-product-form-title]');
  const nombreInput = qs<HTMLInputElement>(root, '[data-product-nombre]');
  const categoriaInput = qs<HTMLSelectElement>(root, '[data-product-categoria]');
  const marcaInput = qs<HTMLSelectElement>(root, '[data-product-marca]');
  // Código de barras (plan-camara-barras): ONE input for both entry paths —
  // manual write/paste and the camera scanner (which fills it on detect).
  const barcodeInput = qs<HTMLInputElement>(root, '[data-product-barcode]');
  const barcodeScanBtn = qs<HTMLButtonElement>(root, '[data-product-barcode-scan]');
  const barcodeOk = qs<HTMLElement>(root, '[data-product-barcode-ok]');
  // product.md — section A: descripción + dynamic attributes.
  const descripcionInput = qs<HTMLTextAreaElement>(root, '[data-product-descripcion]');
  const attrContainer = qs<HTMLElement>(root, '[data-product-atributos]');
  const attrTemplate = qs<HTMLTemplateElement>(root, '[data-attribute-template]');
  const attrSuggestions = qs<HTMLElement>(root, '[data-attr-suggestions]');
  const attrChipTemplate = qs<HTMLTemplateElement>(root, '[data-attr-chip-template]');
  // product.md — section B: the three switches.
  const featuredInput = qs<HTMLInputElement>(root, '[data-product-featured]');
  const returnableInput = qs<HTMLInputElement>(root, '[data-product-returnable]');
  const availableInput = qs<HTMLInputElement>(root, '[data-product-available]');
  // product.md — section C: presentations + price tiers.
  const presContainer = qs<HTMLElement>(root, '[data-product-presentations]');
  const presEmpty = qs<HTMLElement>(root, '[data-pres-empty]');
  const presAddBtn = qs<HTMLButtonElement>(root, '[data-pres-add]');
  const presTemplate = qs<HTMLTemplateElement>(root, '[data-presentation-template]');
  const tierTemplate = qs<HTMLTemplateElement>(root, '[data-price-tier-template]');
  const precioInput = qs<HTMLInputElement>(root, '[data-product-precio]');
  const stockInput = qs<HTMLInputElement>(root, '[data-product-stock]');
  const imagenInput = qs<HTMLInputElement>(root, '[data-product-imagen]');
  const imagenFileInput = qs<HTMLInputElement>(root, '[data-product-imagen-file]');
  const imagenPreview = qs<HTMLImageElement>(root, '[data-product-imagen-preview]');
  // Camera placeholder inside the upload frame — shown ⇔ there is no photo.
  const imagenPlaceholder = qs<HTMLElement>(root, '[data-product-imagen-placeholder]');
  // Upload button copy flips with the state: Subir foto ⇄ Cambiar foto.
  const imagenLabel = qs<HTMLElement>(root, '[data-product-imagen-label]');
  const imagenQuitarBtn = qs<HTMLButtonElement>(root, '[data-product-imagen-quitar]');
  const imagenEstado = qs<HTMLElement>(root, '[data-product-imagen-estado]');
  const imagenError = qs<HTMLElement>(root, '[data-product-imagen-error]');
  const submitBtn = qs<HTMLButtonElement>(root, '[data-product-submit]');
  const cancelBtn = qs<HTMLButtonElement>(root, '[data-product-cancel]');
  const confirmDeactivateBtn = qs<HTMLButtonElement>(
    root,
    '[data-product-confirm-deactivate]',
  );
  const errorAlert = qs<HTMLElement>(root, '[data-alert="productos-error"]');
  const errorText = qs<HTMLElement>(root, '[data-alert-error-text]');
  // T3.1: guardar errors show INSIDE the drawer (the page alert may sit
  // behind the overlay); list/toggle errors stay on the page alert.
  const formAlert = qs<HTMLElement>(root, '[data-alert="productos-form-error"]');
  const formErrorText = qs<HTMLElement>(root, '[data-product-form-error-text]');
  const formModal = qs<HTMLElement>(root, '[data-modal-root="producto-form"]');
  const emptyState = qs<HTMLElement>(root, '[data-empty-state="empty-productos"]');
  // Search-with-no-hits state (plan-reponer-buscar.md Fase 2) — only the
  // query result is empty, the catalog itself may be full.
  const sinResultados = qs<HTMLElement>(root, '[data-empty-state="no-results"]');
  const searchInput = qs<HTMLInputElement>(root, '[data-product-search]');
  const voiceBtn = qs<HTMLButtonElement>(root, '[data-product-voice]');
  // Toolbar (T3.2)
  const filterWrap = qs<HTMLElement>(root, '[data-product-filter]');
  const catFilter = qs<HTMLSelectElement>(root, '[data-product-catfilter]');
  const sortSel = qs<HTMLSelectElement>(root, '[data-product-sort]');
  const countEl = qs<HTMLElement>(root, '[data-product-count]');
  const moreBtn = qs<HTMLButtonElement>(root, '[data-product-more]');

  const feedbackPage = crearFeedback(errorAlert, errorText);
  const feedbackForm = crearFeedback(formAlert, formErrorText);

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
  // P0 re-entry guard for toggle (plan-form-ux.md Fase 1): rapid double-click
  // on Restaurar/Desactivar would toggle twice.  The product form's own guard
  // lives inside createFormManager (enVuelo).
  let enviandoToggle = false;
  let subiendoImagen = false;

  // A stored URL may be dead (asset removed, typo): fall back to the upload
  // placeholder instead of leaving a broken-image glyph in the tile.
  imagenPreview?.addEventListener('error', () => {
    setHidden(imagenPreview, true);
    setHidden(imagenPlaceholder, false);
  });

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
        setText(option, nombre);
        select.append(option);
      }
      // Keep the cashier's in-progress selection when it still exists.
      const existe = Array.from(select.options).some((o) => o.value === seleccionPrevia);
      select.value = existe ? seleccionPrevia : '';
      if (select === catFilter) catFiltro = select.value;
    }
  }

  // Marca <select> (optional field): same degradation as poblarCategorias —
  // GET ?action=marcas, falling back to the brands DERIVED from the admin
  // product list when the action isn't deployed yet (or offline). Only the
  // first blank "Sin marca" option is preserved.
  async function poblarMarcas(): Promise<void> {
    if (!marcaInput) return;
    const res = await getMarcas();
    let nombres: string[];
    if (res.status === 'success') {
      nombres = res.body.marcas.map((m) => m.nombre);
    } else {
      nombres = [...new Set(productos.map((p) => p.marca ?? '').filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      );
    }

    const seleccionPrevia = marcaInput.value;
    while (marcaInput.options.length > 1) marcaInput.remove(1);
    for (const nombre of nombres) {
      const option = document.createElement('option');
      option.value = nombre;
      setText(option, nombre);
      marcaInput.append(option);
    }
    // Keep the cashier's in-progress selection when it still exists.
    const existe = Array.from(marcaInput.options).some((o) => o.value === seleccionPrevia);
    marcaInput.value = existe ? seleccionPrevia : '';
  }

  // deviation: alias descriptivo que despacha a feedbackPage (diferenciado de feedbackForm dentro del drawer)
  function mostrarOk(mensaje: string): void {
    feedbackPage.ok(mensaje);
  }

  // deviation: alias descriptivo que despacha a feedbackPage (diferenciado de feedbackForm dentro del drawer)
  function mostrarError(mensaje: string): void {
    feedbackPage.error(mensaje);
  }

  // Form error (guardar): lives INSIDE the drawer next to the fields (T3.1).
  function mostrarErrorForm(mensaje: string): void {
    feedbackForm.error(mensaje);
  }

  function ocultarAlertas(): void {
    feedbackPage.ocultar();
    feedbackForm.ocultar();
    // Inline field errors die with the alerts: edit/new mode starts clean.
    if (form) limpiarErroresForm(form);
  }

  // --- Cloudinary upload (plan-cierre.md Fase 3) -------------------------
  const MAX_IMAGEN_BYTES = 5 * 1024 * 1024; // preset also caps at 5 MB

  function sincronizarImagen(): void {
    const url = imagenInput?.value.trim() ?? '';
    if (imagenPreview) {
      imagenPreview.src = url;
      setHidden(imagenPreview, url === '');
    }
    // The frame shows EITHER the photo OR the camera placeholder.
    setHidden(imagenPlaceholder, url !== '');
    setHidden(imagenQuitarBtn, url === '');
    setText(imagenLabel, url === '' ? 'Subir foto' : 'Cambiar foto');
  }

  function mostrarErrorImagen(mensaje: string): void {
    setText(imagenError, mensaje);
    setHidden(imagenError, false);
  }

  function ocultarEstadoImagen(): void {
    setHidden(imagenEstado, true);
    setHidden(imagenError, true);
  }

  async function subirImagen(file: File): Promise<void> {
    // P0 (plan-form-ux): a second file pick while one is uploading would
    // race — last write wins over a URL the cashier never saw.
    if (subiendoImagen) return;
    subiendoImagen = true;
    if (imagenFileInput) imagenFileInput.disabled = true;
    setText(imagenEstado, 'Subiendo imagen…');
    setHidden(imagenEstado, false);
    setHidden(imagenError, true);

    try {
      const res = await subirImagenCloudinary(file);

      setHidden(imagenEstado, true);
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
        mostrarErrorImagen('No se pudo subir la imagen. Intenta de nuevo.');
      }
    } finally {
      subiendoImagen = false;
      if (imagenFileInput) imagenFileInput.disabled = false;
    }
  }

  // ── product.md: dynamic sections (attributes / presentations / tiers) ──
  // Every row is cloned from a ui/ <template> — this file owns behavior and
  // copy only, never markup classes (stilesbase gates).

  function sincronizarPresVacio(): void {
    const bloques = presContainer
      ? [...presContainer.querySelectorAll<HTMLElement>('[data-presentation]')]
      : [];
    setHidden(presEmpty, bloques.length > 0);
    // Numbered headings ("Presentación 1/2/3") keep a long form scannable and
    // stay correct after any block is removed.
    bloques.forEach((bloque, index) => {
      setText(qs<HTMLElement>(bloque, '[data-pres-title]'), `Presentación ${index + 1}`);
    });
  }

  /** One price-tier row; default min = next integer after the current max. */
  function agregarRango(bloque: HTMLElement, minQty?: number, precio?: number): void {
    if (!tierTemplate) return;
    const fila = cloneTemplate(tierTemplate);
    if (!fila) return;
    const tiersEl = qs<HTMLElement>(bloque, '[data-pres-tiers]');
    const minInput = qs<HTMLInputElement>(fila, '[data-tier-min]');
    const priceInput = qs<HTMLInputElement>(fila, '[data-tier-price]');
    if (!tiersEl || !minInput || !priceInput) return;

    let siguiente = minQty;
    if (siguiente === undefined) {
      const mins = [...tiersEl.querySelectorAll<HTMLInputElement>('[data-tier-min]')]
        .map((input) => Number(input.value))
        .filter((valor) => Number.isInteger(valor) && valor >= 1);
      siguiente = mins.length === 0 ? 1 : Math.max(...mins) + 1;
    }
    minInput.value = String(siguiente);
    if (precio !== undefined) priceInput.value = String(precio);

    // Inline errors die as soon as the user retypes (plan-form-ux Fase 1).
    observarCampo(minInput);
    observarCampo(priceInput);
    qs<HTMLButtonElement>(fila, '[data-tier-delete]')?.addEventListener('click', () => {
      fila.remove();
    });
    tiersEl.append(fila);
  }

  /**
   * One presentation block. `existente` marks a block loaded from the sheet
   * — only those ask for confirmation before being removed (product.md §2).
   */
  function agregarPresentacion(p?: Presentacion, existente = false): void {
    if (!presTemplate || !presContainer) return;
    const bloque = cloneTemplate(presTemplate);
    if (!bloque) return;
    bloque.setAttribute('data-pres-existing', existente ? 'true' : 'false');
    // Stable id for EVERY block: keep the stored one, mint a new one for a
    // fresh block (ids travel inside the JSON, product.md pres_* ids).
    bloque.setAttribute('data-pres-id', p?.id ?? nuevaPresentacionId());

    const nameInput = qs<HTMLInputElement>(bloque, '[data-pres-name]');
    const unitsInput = qs<HTMLInputElement>(bloque, '[data-pres-units]');
    const skuInput = qs<HTMLInputElement>(bloque, '[data-pres-sku]');
    if (p) {
      if (nameInput) nameInput.value = p.name;
      if (unitsInput) unitsInput.value = String(p.units);
      if (skuInput) skuInput.value = p.sku ?? '';
    }
    for (const input of [nameInput, unitsInput, skuInput]) {
      if (input) observarCampo(input);
    }

    const tiers = p?.priceTiers ? ordenarTiers(p.priceTiers) : [];
    if (tiers.length === 0) {
      agregarRango(bloque, 1); // first range always starts at quantity 1
    } else {
      for (const tier of tiers) agregarRango(bloque, tier.minQty, tier.price);
    }

    qs<HTMLButtonElement>(bloque, '[data-tier-add]')?.addEventListener('click', () => {
      agregarRango(bloque);
      const nuevos = bloque.querySelectorAll<HTMLInputElement>('[data-tier-min]');
      nuevos[nuevos.length - 1]?.focus();
    });

    // Delete: new blocks go straight out; existing ones confirm inline first.
    const confirmBox = qs<HTMLElement>(bloque, '[data-pres-confirm]');
    qs<HTMLButtonElement>(bloque, '[data-pres-delete]')?.addEventListener('click', () => {
      if (bloque.getAttribute('data-pres-existing') === 'true') {
        setHidden(confirmBox, false);
        qs<HTMLButtonElement>(confirmBox, '[data-pres-confirm-no]')?.focus();
        return;
      }
      bloque.remove();
      sincronizarPresVacio();
    });
    qs<HTMLButtonElement>(confirmBox, '[data-pres-confirm-no]')?.addEventListener('click', () => {
      setHidden(confirmBox, true);
    });
    qs<HTMLButtonElement>(confirmBox, '[data-pres-confirm-yes]')?.addEventListener('click', () => {
      bloque.remove();
      sincronizarPresVacio();
    });

    presContainer.append(bloque);
    sincronizarPresVacio();
  }

  /** One row for a fixed attribute key and its editable value. */
  function agregarAtributo(clave: string, valor = ''): void {
    if (!attrTemplate || !attrContainer) return;
    const claveCanonica = claveAtributoPermitida(clave);
    if (!claveCanonica) return;
    const yaExiste = [...attrContainer.querySelectorAll<HTMLElement>('[data-attribute-row]')]
      .some((fila) => fila.dataset.attributeKey === claveCanonica);
    if (yaExiste) return;

    const fila = cloneTemplate(attrTemplate);
    if (!fila) return;
    const valueInput = qs<HTMLInputElement>(fila, '[data-attr-value]');
    fila.dataset.attributeKey = claveCanonica;
    setText(qs<HTMLElement>(fila, '[data-attr-name]'), claveCanonica);
    if (valueInput) {
      valueInput.setAttribute('aria-label', `Valor de ${claveCanonica}`);
      valueInput.placeholder = {
        Tamaño: 'Ej. 500 ml',
        Sabor: 'Ej. Naranja',
        Envase: 'Ej. Botella',
      }[claveCanonica] ?? 'Escribe el valor';
      valueInput.value = valor;
      observarCampo(valueInput);
    }
    // The row error belongs to the value field and clears as soon as it changes.
    fila.addEventListener('input', () => {
      setHidden(qs<HTMLElement>(fila, '[data-attr-error]'), true);
      valueInput?.removeAttribute('aria-invalid');
    });
    qs<HTMLButtonElement>(fila, '[data-attr-delete]')?.addEventListener('click', () => {
      fila.remove();
      pintarSugerencias();
    });
    attrContainer.append(fila);
    pintarSugerencias();
  }

  // Only the three supported attribute keys can be added from these chips.
  function pintarSugerencias(): void {
    if (!attrSuggestions || !attrChipTemplate) return;
    attrSuggestions.replaceChildren();
    const existentes = new Set(
      [...(attrContainer?.querySelectorAll<HTMLElement>('[data-attribute-row]') ?? [])]
        .map((fila) => fila.dataset.attributeKey),
    );
    for (const sugerencia of sugerenciasAtributos(categoriaInput?.value ?? '')) {
      if (existentes.has(sugerencia)) continue;
      const chip = cloneTemplate(attrChipTemplate);
      if (!chip) continue;
      chip.dataset.attrSuggestion = sugerencia;
      setText(qs<HTMLElement>(chip, '[data-attr-suggestion-label]'), sugerencia);
      attrSuggestions.append(chip);
    }
  }

  /**
   * Read the dynamic sections on submit. Returns null (after painting the
   * first inline error) when something is invalid — guardar() then aborts
   * before any network call.
   */
  function leerExtras(): {
    featured: boolean;
    returnable: boolean;
    activo: boolean;
    atributos: AtributosProducto;
    presentaciones: Presentacion[];
  } | null {
    // ── attributes: only supported keys are serialized; values are required ──
    const atributos: AtributosProducto = {};
    const filasAttr = attrContainer
      ? [...attrContainer.querySelectorAll<HTMLElement>('[data-attribute-row]')]
      : [];
    for (const fila of filasAttr) {
      const clave = claveAtributoPermitida(fila.dataset.attributeKey ?? '');
      const valueInput = qs<HTMLInputElement>(fila, '[data-attr-value]');
      if (!clave || !valueInput) continue;
      const valor = valueInput.value.trim();
      if (valor === '') {
        mostrarErrorAtributo(fila, valueInput, `Ingresa el valor de ${clave.toLowerCase()}.`);
        return null;
      }
      if (valor.length > 128) {
        mostrarErrorAtributo(fila, valueInput, 'El valor de la característica es demasiado largo.');
        return null;
      }
      if (atributos[clave] !== undefined) {
        mostrarErrorAtributo(fila, valueInput, `Ya agregaste ${clave.toLowerCase()}.`);
        return null;
      }
      atributos[clave] = valor;
    }

    // ── presentations: name + units + ≥1 valid tier, first minQty = 1 ──────
    const bloques = presContainer
      ? [...presContainer.querySelectorAll<HTMLElement>('[data-presentation]')]
      : [];
    const presentaciones: Presentacion[] = [];
    for (const bloque of bloques) {
      const nameInput = qs<HTMLInputElement>(bloque, '[data-pres-name]');
      const unitsInput = qs<HTMLInputElement>(bloque, '[data-pres-units]');
      const skuInput = qs<HTMLInputElement>(bloque, '[data-pres-sku]');
      const errorEl = qs<HTMLElement>(bloque, '[data-pres-error]');
      if (errorEl) {
        setHidden(errorEl, true);
        setText(errorEl, '');
      }
      if (!nameInput || !unitsInput) continue;

      const nombre = nameInput.value.trim();
      if (nombre === '' || nombre.length > 64) {
        mostrarErrorCampo(nameInput, 'Ingresa el nombre de la presentación.');
        nameInput.focus();
        return null;
      }
      const unidades = Number(unitsInput.value);
      if (unitsInput.value === '' || !Number.isInteger(unidades) || unidades < 1) {
        mostrarErrorCampo(
          unitsInput,
          'Ingresa la cantidad de unidades (número entero mayor a 0).',
        );
        unitsInput.focus();
        return null;
      }

      const tierRows = [...bloque.querySelectorAll<HTMLElement>('[data-price-tier]')];
      const tiers: RangoPrecio[] = [];
      for (const fila of tierRows) {
        const minInput = qs<HTMLInputElement>(fila, '[data-tier-min]');
        const priceInput = qs<HTMLInputElement>(fila, '[data-tier-price]');
        if (!minInput || !priceInput) continue;
        const min = Number(minInput.value);
        if (minInput.value === '' || !Number.isInteger(min) || min < 1) {
          mostrarErrorCampo(minInput, 'La cantidad desde debe ser un número entero mayor a 0.');
          minInput.focus();
          return null;
        }
        const precio = Number(priceInput.value);
        if (priceInput.value === '' || !Number.isFinite(precio) || precio <= 0) {
          mostrarErrorCampo(priceInput, 'Ingresa un precio mayor a 0.');
          priceInput.focus();
          return null;
        }
        tiers.push({ minQty: min, price: precio });
      }
      if (tiers.length === 0) {
        mostrarErrorBloque(bloque, 'Agrega al menos un rango de precios.');
        qs<HTMLButtonElement>(bloque, '[data-tier-add]')?.focus();
        return null;
      }
      const minimos = tiers.map((t) => t.minQty);
      if (new Set(minimos).size !== minimos.length) {
        mostrarErrorBloque(bloque, 'No repitas la misma cantidad mínima.');
        return null;
      }
      if (Math.min(...minimos) !== 1) {
        mostrarErrorBloque(bloque, 'El primer rango debe comenzar en cantidad 1.');
        const primerMin = bloque.querySelector<HTMLInputElement>('[data-tier-min]');
        primerMin?.focus();
        return null;
      }

      const sku = (skuInput?.value ?? '').trim();
      const id = bloque.getAttribute('data-pres-id') ?? undefined;
      presentaciones.push({
        ...(id ? { id } : {}),
        name: nombre,
        units: unidades,
        ...(sku !== '' ? { sku } : {}),
        priceTiers: ordenarTiers(tiers),
      });
    }

    return {
      featured: featuredInput?.checked ?? false,
      returnable: returnableInput?.checked ?? false,
      // "Disponible" defaults to ON when the sheet has no activo column yet.
      activo: availableInput?.checked ?? true,
      atributos,
      presentaciones,
    };
  }

  /**
   * Attribute row error: ONE slot under both fields (never inserted between an
   * input and its sibling), so the pair stays aligned when a message appears.
   */
  function mostrarErrorAtributo(
    fila: HTMLElement,
    input: HTMLInputElement,
    mensaje: string,
  ): void {
    const errorEl = qs<HTMLElement>(fila, '[data-attr-error]');
    setText(errorEl, mensaje);
    setHidden(errorEl, false);
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  /** Block-level error (no single input owns the message). */
  function mostrarErrorBloque(bloque: HTMLElement, mensaje: string): void {
    const errorEl = qs<HTMLElement>(bloque, '[data-pres-error]');
    if (!errorEl) return;
    setText(errorEl, mensaje);
    setHidden(errorEl, false);
  }

  // Spanish copy per transport outcome / §4.5 code — the code itself never
  // reaches the cashier's eyes. Domain error first (same pattern as
  // categorias-admin for categoria_duplicada).
  function mensajeDeError(error: string): string {
    if (error === 'barcode_duplicado') {
      return 'Ya existe un producto con ese código de barras.';
    }
    return mensajeDeErrorApi(error, {
      payloadInvalido: 'Revisa los campos del producto.',
      fallback: 'No se pudo guardar. Intenta de nuevo.',
    });
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
      await poblarMarcas();
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
      await poblarMarcas();
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
    const nombre = qs<HTMLElement>(row, '[data-product-nombre]');
    const categoria = qs<HTMLElement>(row, '[data-product-categoria]');
    const marca = qs<HTMLElement>(row, '[data-product-marca]');
    const precio = qs<HTMLElement>(row, '[data-product-precio]');
    const stock = qs<HTMLElement>(row, '[data-product-stock]');
    const stockPlain = qs<HTMLElement>(row, '[data-product-stock-plain]');
    const low = qs<HTMLElement>(row, '[data-product-low]');
    const agotado = qs<HTMLElement>(row, '[data-product-agotado]');
    const badge = qs<HTMLElement>(row, '[data-product-badge]');
    const desactivar = qs<HTMLElement>(row, '[data-product-deactivate]');
    const restaurar = qs<HTMLElement>(row, '[data-product-restore]');
    const img = qs<HTMLImageElement>(row, '[data-product-img]');

    setText(nombre, producto.nombre);
    setText(categoria, producto.categoria);
    // Brand line: hidden ⇔ the product has none (older rows / sheet without
    // the column arrive as '' from the server).
    if (marca) {
      setText(marca, producto.marca ?? '');
      setHidden(marca, !(producto.marca ?? '').trim());
    }
    setText(precio, formatCurrency(producto.precio));
    // Mobile card carries the prefix (no column header); the desktop column
    // header already says "Stock" → plain number there.
    setText(stock, `Stock: ${producto.stock}`);
    setText(stockPlain, String(producto.stock));

    // Desktop stock tags (T3.3): umbral from ajustes.stock_alerta_min —
    // same semantics as the POS catalog (bajo: 0 < stock < umbral).
    if (low || agotado) {
      const umbral = getAjustes().stock_alerta_min;
      setHidden(low, !(producto.stock > 0 && producto.stock < umbral));
      setHidden(agotado, producto.stock !== 0);
    }

    // Admin thumbnail (plan-productos-v2.md Fase 4): single render point
    // via resolveImageUrl (same as the POS card). T4.4 fix: the img is
    // opacity-0 until `load` (display:none + lazy = nunca se descarga —
    // ver Card.astro); sin URL o con error la isla colapsa el nodo con
    // `hidden` — la fila queda sin espacio de miniatura, como siempre.
    if (img) {
      const url = resolveImageUrl(producto.imagen_url);
      if (!url) {
        setHidden(img, true);
      } else {
        setHidden(img, false);
        img.addEventListener(
          'error',
          () => {
            setHidden(img, true);
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
      setText(badge, producto.activo ? 'Activo' : 'Inactivo');
      badge.className = `inline-block rounded-full px-3 py-1 text-base font-semibold ${
        producto.activo ? BADGE_ACTIVO : BADGE_INACTIVO
      }`;
    }
    // Only the toggle that matches the current state shows (D2: low → the
    // row offers restore; high → confirm-then-deactivate).
    setHidden(desactivar, !producto.activo);
    setHidden(restaurar, producto.activo);
  }

  function render(): void {
    if (!rowsEl || !template) return;
    rowsEl.replaceChildren();
    tbody?.replaceChildren();

    // Search filter (plan-reponer-buscar.md): shared pipeline (utils/search)
    // — rebuilt call is cheap; every mutation (create/edit/restore) stays
    // searchable without extra wiring.
    const base = busqueda ? buscarProductos(productos, busqueda) : productos;

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
    setText(
      countEl,
      visibles.length === 0
        ? ''
        : `Mostrando ${Math.min(visibles.length, visibleCount)} de ${visibles.length} productos`,
    );

    const mostrados = visibles.slice(0, visibleCount);
    for (const producto of mostrados) {
      const row = cloneTemplate(template);
      if (row) {
        row.setAttribute('data-product-id', producto.id);
        paintRow(row, producto);
        rowsEl.append(row);
      }
      if (desktopTemplate && tbody) {
        const tr = cloneTemplate(desktopTemplate);
        if (tr) {
          tr.setAttribute('data-product-id', producto.id);
          paintRow(tr, producto);
          tbody.append(tr);
        }
      }
    }

    // T3.3: "Mostrar más" only when rows remain beyond the current block.
    setHidden(moreBtn, visibles.length <= visibleCount);

    setHidden(emptyState, productos.length > 0);
    setHidden(sinResultados, !(busqueda !== '' && productos.length > 0 && visibles.length === 0));
  }

  function editarProducto(id: string): void {
    const producto = productos.find((p) => p.id === id);
    if (!producto) return;
    editingId = id;
    setText(formTitle, 'Editar producto');
    setText(submitBtn, 'Guardar cambios');
    setHidden(cancelBtn, false);
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
        setText(option, producto.categoria);
        categoriaInput.append(option);
      }
      categoriaInput.value = producto.categoria;
    }
    if (precioInput) precioInput.value = String(producto.precio);
    if (stockInput) stockInput.value = String(producto.stock);
    if (marcaInput) {
      // Same legacy-value guard as the category select: a brand the sheet
      // offers but the loaded options miss never silently resets to blank.
      const marca = producto.marca ?? '';
      const existe = Array.from(marcaInput.options).some((o) => o.value === marca);
      if (marca && !existe) {
        const option = document.createElement('option');
        option.value = marca;
        setText(option, marca);
        marcaInput.append(option);
      }
      marcaInput.value = marca;
    }
    if (imagenInput) imagenInput.value = producto.imagen_url;
    // plan-camara-barras: the stored code (string, leading zeros intact) is
    // shown for editing — or an empty field for legacy products without one.
    if (barcodeInput) barcodeInput.value = producto.barcode ?? '';
    if (barcodeOk) {
      setText(barcodeOk, '');
      setHidden(barcodeOk, true);
    }
    // product.md — section A: descripción + atributos (legacy rows without
    // the fields load as '' / no rows, exactly like the other optional data).
    if (descripcionInput) descripcionInput.value = producto.descripcion ?? '';
    attrContainer?.replaceChildren();
    for (const [clave, valor] of Object.entries(producto.atributos ?? {})) {
      const clavePermitida = claveAtributoPermitida(clave);
      if (clavePermitida) agregarAtributo(clavePermitida, valor);
    }
    pintarSugerencias();
    // product.md — section B: switches mirror the stored flags.
    if (featuredInput) featuredInput.checked = producto.featured === true;
    if (returnableInput) returnableInput.checked = producto.returnable === true;
    if (availableInput) availableInput.checked = producto.activo !== false;
    // product.md — section C: rebuild the blocks; each one is marked as
    // EXISTING so deleting it asks for confirmation first.
    presContainer?.replaceChildren();
    for (const presentacion of producto.presentaciones ?? []) {
      agregarPresentacion(presentacion, true);
    }
    sincronizarPresVacio();
    ocultarAlertas();
    ocultarEstadoImagen();
    sincronizarImagen();
    // T3.1: the form lives in the drawer — open it with the edit payload.
    // Focus return to the Editar button is handled by utils/modal on close.
    if (formModal) openModal(formModal);
    nombreInput?.focus();
  }

  /**
   * Focus the name field once the drawer is actually visible. The TopBar/empty
   * CTA and modal-controller share ONE click: whichever handler runs first, the
   * rAF lands after both, so a hidden input never swallows the focus.
   */
  function enfocarNombreAlAbrir(): void {
    requestAnimationFrame(() => {
      if (formModal && !formModal.hidden) nombreInput?.focus();
    });
  }

  function modoNuevo(): void {
    editingId = null;
    form?.reset();
    setText(formTitle, 'Nuevo producto');
    setText(submitBtn, 'Guardar producto');
    setHidden(cancelBtn, true);
    if (barcodeOk) {
      setText(barcodeOk, '');
      setHidden(barcodeOk, true);
    }
    // product.md: dynamic rows are NOT reset by form.reset() — clear them
    // by hand. The switches return to their HTML defaults (available ON).
    attrContainer?.replaceChildren();
    presContainer?.replaceChildren();
    sincronizarPresVacio();
    pintarSugerencias();
    ocultarAlertas();
    ocultarEstadoImagen();
    sincronizarImagen();
  }

  type DatosForm = {
    nombre: string;
    categoria: string;
    marca: string;
    barcode: string;
    precio: number;
    stock: number;
    imagen_url: string;
    // product.md: brief description (optional, section A).
    descripcion: string;
  };

  async function guardar(datos: DatosForm): Promise<void> {
    // product.md: dynamic sections are validated HERE (they are not plain
    // inputs, so createFormManager's schema can't own them). leerExtras()
    // paints the first inline error and returns null → abort, no network.
    const extras = leerExtras();
    if (!extras) return;

    // Local duplicate pre-guard (plan-camara-barras): the loaded catalog is
    // checked BEFORE any network call — same strategy as categorias-admin's
    // categoria_duplicada pre-guard. The backend validates again (and the
    // barcode_duplicado error is mapped in mensajeDeError above).
    const barcode = normalizarBarcode(datos.barcode);
    if (hayBarcodeDuplicado(productos, barcode, editingId)) {
      mostrarErrorForm('Ya existe un producto con ese código de barras.');
      barcodeInput?.focus();
      return;
    }

    // P0 re-entry guard lives inside createFormManager (enVuelo); the button
    // disable also comes from there (submitBtn option).  We only manage the
    // dynamic text here ("Creando…" / "Guardando…").
    const idEditando = editingId;
    const esAlta = idEditando === null;
    const textoOriginal = esAlta ? 'Guardar producto' : 'Guardar cambios';
    setText(submitBtn, esAlta ? 'Creando…' : 'Guardando…');

    const payload = {
      ...datos,
      featured: extras.featured,
      returnable: extras.returnable,
      activo: extras.activo,
      atributos: extras.atributos,
      presentaciones: extras.presentaciones,
    };

    try {
      const resultado = esAlta
        ? await crearProducto(payload)
        : await actualizarProducto({ id: idEditando, ...payload });

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
      setText(submitBtn, textoOriginal);
      // modoNuevo() already reset the label on success; restore the right
      // one for the mode we are actually in after an error.
      if (editingId !== null) setText(submitBtn, 'Guardar cambios');
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

  // Declarative schema replaces leerFormulario() + the manual submit
  // listener + 5× observarCampo calls.  createFormManager handles:
  //   - submit interception + preventDefault
  //   - sequential validation with first-error focus + inline error
  //   - anti-double-submit (enVuelo) + submitBtn.disabled toggle
  //   - observarCampo auto-wiring on every field in the schema
  createFormManager<DatosForm>({
    form,
    submitBtn,
    schema: {
      nombre: {
        el: nombreInput,
        validate: isNonEmpty,
        error: 'Ingresa el nombre del producto.',
      },
      categoria: {
        el: categoriaInput,
        validate: isNonEmpty,
        error: 'Elige la categoría del producto.',
      },
      // Optional like the image: an empty select means "sin marca" and the
      // server stores '' (never a validation error).
      marca: {
        el: marcaInput,
        optional: true,
      },
      precio: {
        el: precioInput,
        // Raw emptiness first: Number('') is 0, which would pass as a valid price.
        validate: (raw) => raw !== '' && isValidPrecio(Number(raw)),
        error: 'Ingresa un precio igual o mayor a 0.',
        transform: (raw) => Number(raw),
      },
      stock: {
        el: stockInput,
        validate: (raw) => raw !== '' && isValidStockValue(Number(raw)),
        error: 'Ingresa un stock entero igual o mayor a 0.',
        transform: (raw) => Number(raw),
      },
      // plan-camara-barras: optional field — empty means "no code" and is
      // stored as '' (the string, never a number: leading zeros matter).
      barcode: {
        el: barcodeInput,
        validate: esBarcodeValido,
        error: 'El código de barras es demasiado largo o tiene caracteres no válidos.',
        transform: (raw) => normalizarBarcode(raw),
        optional: true,
      },
      imagen_url: {
        el: imagenInput,
        validate: (raw) => isValidImageUrl(raw),
        error: 'La imagen debe ser una URL que empiece con http:// o https://.',
        optional: true,
      },
      // product.md: brief optional description (textarea rides the same
      // schema — FieldRule accepts HTMLTextAreaElement).
      descripcion: {
        el: descripcionInput,
        optional: true,
      },
    },
    onSubmit: (datos) => guardar(datos),
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
      mostrarErrorImagen('Elige un archivo de imagen (JPG, PNG o WebP).');
      return;
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      mostrarErrorImagen('La imagen pesa más de 5 MB. Reduce el tamaño e intenta de nuevo.');
      return;
    }
    void subirImagen(file);
  });

  imagenQuitarBtn?.addEventListener('click', () => {
    if (imagenInput) imagenInput.value = '';
    ocultarEstadoImagen();
    sincronizarImagen();
  });

  // ── product.md: dynamic-section wiring (delegated where rows come and
  // go; per-row listeners are attached at clone time inside the builders) ──
  presAddBtn?.addEventListener('click', () => {
    agregarPresentacion();
    const bloques = presContainer?.querySelectorAll<HTMLElement>('[data-presentation]');
    bloques?.[bloques.length - 1]?.querySelector<HTMLInputElement>('[data-pres-name]')?.focus();
  });

  // Suggestion chip → add a value row for the fixed attribute key.
  attrSuggestions?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest<HTMLElement>('[data-attr-suggestion]');
    if (!chip) return;
    const clave = chip.dataset.attrSuggestion ?? '';
    if (clave === '') return;
    const filas = attrContainer
      ? [...attrContainer.querySelectorAll<HTMLElement>('[data-attribute-row]')]
      : [];
    for (const fila of filas) {
      if (fila.dataset.attributeKey === clave) {
        qs<HTMLInputElement>(fila, '[data-attr-value]')?.focus();
        return;
      }
    }
    agregarAtributo(clave);
    const nuevas = attrContainer?.querySelectorAll<HTMLElement>('[data-attribute-row]');
    nuevas?.[nuevas.length - 1]?.querySelector<HTMLInputElement>('[data-attr-value]')?.focus();
  });

  // Block-level errors (data-pres-error) clear as soon as the user edits
  // anything inside that presentation — field-level ones self-clear via
  // observarCampo.
  presContainer?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const bloque = target.closest<HTMLElement>('[data-presentation]');
    if (!bloque) return;
    const errorEl = qs<HTMLElement>(bloque, '[data-pres-error]');
    if (errorEl && !errorEl.hidden) {
      setHidden(errorEl, true);
      setText(errorEl, '');
    }
  });

  // Camera scan (plan-camara-barras Opción B): the button opens the shared
  // overlay; on a successful read the SAME input is filled (Opción A state),
  // its inline error dies and a short confirmation appears. Cancel/Escape in
  // the overlay just returns here — the form keeps whatever it had.
  barcodeScanBtn?.addEventListener('click', () => {
    abrirEscaneoBarcode({
      onLeido: (codigo) => {
        if (barcodeInput) {
          barcodeInput.value = codigo;
          limpiarErrorCampo(barcodeInput);
        }
        setText(barcodeOk, 'Código leído correctamente.');
        setHidden(barcodeOk, false);
      },
    });
  });

  // The confirmation is ephemeral: retyping anything hides it (the input
  // itself is the lasting truth).
  barcodeInput?.addEventListener('input', () => {
    setHidden(barcodeOk, true);
  });

  // ONE delegated listener for BOTH lists (mobile ul + desktop tbody): the
  // shared data-product-action attr dispatches to the right handler; the row
  // and its id are resolved inside each action.
  function rowId(trigger: HTMLElement): string | null {
    return trigger.closest<HTMLElement>('[data-product-row]')?.getAttribute('data-product-id') ?? null;
  }

  delegateAction(root, 'click', 'data-product-action', {
    edit: (trigger) => {
      const id = rowId(trigger);
      if (id) editarProducto(id);
    },
    deactivate: (trigger) => {
      // The modal itself opens via modal-controller (data-modal-open on the
      // button); remember which product the confirmation applies to.
      const id = rowId(trigger);
      if (id) pendingDeactivateId = id;
    },
    restore: (trigger) => {
      const id = rowId(trigger);
      if (id) void cambiarActivo(id, true);
    },
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
    if (target.closest('[data-product-new]')) {
      modoNuevo();
      enfocarNombreAlAbrir();
    }
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
    selectChip(filterWrap, 'data-filter-value', valor);
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
  searchInput?.addEventListener(
    'input',
    debounce(() => {
      busqueda = normalizeSearchQuery(searchInput.value);
      visibleCount = BLOQUE;
      render();
    }, 200),
  );

  // Voice search (plan-speak-search.md Fase 4): same service as the POS —
  // the mic writes into this input and dispatches `input` (D1).
  const defaultPlaceholder = searchInput?.placeholder ?? '';
  if (searchInput && voiceBtn && isSpeechSupported()) {
    setHidden(voiceBtn, false);
    const voice = createVoiceSearch({
      onText: (text) => {
        searchInput.value = text;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.focus();
      },
      onState: (state) => {
        const isListening = state === 'listening';
        const label = isListening ? 'Detener búsqueda por voz' : 'Buscar por voz';
        voiceBtn.setAttribute('aria-label', label);
        voiceBtn.setAttribute('title', label);
        voiceBtn.classList.toggle('text-danger', isListening);
        voiceBtn.classList.toggle('animate-pulse', isListening);
        voiceBtn.classList.toggle('text-text-muted', !isListening);
        searchInput.placeholder = isListening ? 'Escuchando…' : defaultPlaceholder;
      },
      onError: mostrarToast,
    });
    voiceBtn.addEventListener('click', () => {
      if (voice.getState() === 'listening') voice.cancel();
      else voice.start();
    });
  }

  // T3.3: next block of 50 (button hides itself when nothing remains).
  moreBtn?.addEventListener('click', () => {
    visibleCount += BLOQUE;
    render();
  });

  // Inline errors vanish as soon as the user retypes (plan-form-ux Fase 1)
  // — handled by createFormManager's auto-wiring (observarCampo per schema key).

  void cargar(); // first paint from the admin read (fallback keeps it usable)
}
