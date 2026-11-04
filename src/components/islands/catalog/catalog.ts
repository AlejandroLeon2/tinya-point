// Catalog runtime — implements the astrobase.md §3.3 decision ("use cache or
// fetch") on the client, per option A of plan-features Fase 2 (2026-09-22):
// the shell renders at build time and THIS module paints product cards by
// cloning the ui/Card <template>, then wires the shared product search
// (utils/search.ts), the filter DROPDOWNS, the presentation pills, the manual
// refresh and the POS shortcuts.
//
// Rules honored here:
//   - Search NEVER calls the API (appscriptbase.md §5.3, base.md §9): it only
//     queries the in-memory index built from catalogo_cache.
//   - The only network read goes through api/actions/productos.ts.
//   - Stale cache + no refresh → never blocks: we keep selling from cache
//     (base.md §6) and reveal the extras.md §6 "actualizado hace X min" notice.
//   - No fixed ids, no globals; everything scoped to data-attribute hooks.
//   - Filters are LOCAL dropdowns over the loaded products: categoría, marca,
//     atributo and the attribute VALUE (revealed while a key is selected).
//   - Presentation pills: the card shows one pill per available presentation
//     ("Unidad", "Paquete x12", …) and the selected pill drives the displayed
//     price. Only the card's add BUTTON adds to the cart — the whole-card
//     trigger was removed (owner request 2026-11-04).
//     Enter with a UNIQUE result adds it (barcode readers emulate keyboards).

import { formatCurrency, formatNumero } from '../../../utils/format';
import { resolveImageUrl } from '../../../utils/cloudinary';
import { opcionesPresentacion } from '../../../utils/presentaciones';
import {
  getAjustes,
  getCatalogoCache,
  TTL_CATALOGO_MS,
  type CatalogoCache,
  type Producto,
} from '../../../utils/storage';
import {
  closestCard,
  qs,
  qsa,
  setText,
  setHidden,
  cloneTemplate,
  debounce,
} from '../../../utils/dom';
import { esDesktop } from '../../../utils/media';
import { refreshCatalogoFromApi } from '../../../utils/catalog-cache';
// Shared product search (owner request 2026-11-01): barcode exact →
// substring (nombre/categoria/marca) → fuzzy nombre-only. Same pipeline
// as /productos (utils/search.ts) so both screens stay in sync.
import { buscarProductos } from '../../../utils/search';
import { createVoiceSearch, isSpeechSupported, type VoiceSearch } from '../../../utils/speech';
import { mostrarToast } from '../../../utils/toast';
// Camera scan needs a STRICT exact-code lookup (agregarPorBarcode) — the
// shared pipeline's barcode step uses this same helper underneath.
import { buscarPorBarcode } from '../../../utils/barcode';
import { addToCart } from '../../../stores/cart';
import { abrirEscaneoBarcode } from '../runtime/barcode-scanner';

const grid = qs<HTMLElement>(document, '[data-catalog-grid]');
const template = qs<HTMLTemplateElement>(document, '[data-card-template]');
const presTemplate = qs<HTMLTemplateElement>(document, '[data-card-pres-template]');
const searchInput = qs<HTMLInputElement>(document, '[data-catalog-search]');
// Filter dropdowns (owner request 2026-11-04) — native <select>s, filled by
// this island from the already-loaded catalog (zero network).
const categoriaSelect = qs<HTMLSelectElement>(document, '[data-catalog-filter="categoria"]');
const marcaSelect = qs<HTMLSelectElement>(document, '[data-catalog-filter="marca"]');
const atributoSelect = qs<HTMLSelectElement>(document, '[data-catalog-filter="atributo"]');
const valorSelect = qs<HTMLSelectElement>(document, '[data-catalog-filter="valor"]');
const valorWrap = qs<HTMLElement>(document, '[data-catalog-valor-wrap]');
const clearFiltersBtn = qs<HTMLButtonElement>(document, '[data-catalog-clear]');
const staleBox = qs<HTMLElement>(document, '[data-catalog-stale]');
const staleText = qs<HTMLElement>(document, '[data-catalog-stale-text]');
const refreshBtn = qs<HTMLButtonElement>(document, '[data-catalog-refresh]');
const emptyCatalog = qs<HTMLElement>(document, '[data-empty-state="empty-catalog"]');
const noResults = qs<HTMLElement>(document, '[data-empty-state="no-results"]');
const skeleton = qs<HTMLElement>(document, '[data-catalog-skeleton]');
const voiceBtn = qs<HTMLButtonElement>(document, '[data-catalog-voice]');
const voiceStatus = qs<HTMLElement>(document, '[data-catalog-voice-status]');
const pagination = qs<HTMLElement>(document, '[data-catalog-pagination]');
const rangeText = qs<HTMLElement>(document, '[data-catalog-range]');
const prevBtn = qs<HTMLButtonElement>(document, '[data-catalog-prev]');
const nextBtn = qs<HTMLButtonElement>(document, '[data-catalog-next]');
// plan-camara-barras: camera scan trigger + the "code not found" recovery.
const scanBtn = qs<HTMLButtonElement>(document, '[data-catalog-scan]');
const barcodeAlert = qs<HTMLElement>(document, '[data-alert="barcode-notfound"]');
const barcodeAlertText = qs<HTMLElement>(document, '[data-barcode-notfound-text]');
const barcodeSearchBtn = qs<HTMLButtonElement>(document, '[data-barcode-notfound-search]');

// Visual pagination (plan-productos-v2 D1): client-side chunks over the
// already-filtered list. No API, no storage, no server paging.
const PAGE_SIZE = 50;

/**
 * Paint a card's selected presentation: flip aria-pressed on every pill,
 * rewrite the price and keep the add button in sync with the stock that the
 * chosen presentation consumes. Runtime only touches attributes + text
 * (§0.4: never classes).
 */
function aplicarPresentacion(card: HTMLElement, index: number): void {
  const pills = qsa<HTMLButtonElement>(card, '[data-pres-pill]');
  const activa = pills[index] ?? pills[0];
  if (!activa) return;

  pills.forEach((pill, i) => pill.setAttribute('aria-pressed', i === index ? 'true' : 'false'));

  const precio = Number(activa.dataset.presPrice);
  if (Number.isFinite(precio)) {
    setText(qs<HTMLElement>(card, '[data-card-price]'), formatCurrency(precio));
  }

  const unidades = Math.max(1, Number(activa.dataset.presUnits) || 1);
  const stock = Number(card.dataset.productStock);
  const nombre = card.dataset.productName ?? '';
  const presentacion = (activa.dataset.presName ?? '').trim();

  const addBtn = qs<HTMLButtonElement>(card, '[data-add-to-cart]');
  if (!addBtn) return;
  const disponible = stock > 0 && stock >= unidades;
  addBtn.disabled = !disponible;
  addBtn.setAttribute(
    'aria-label',
    presentacion !== '' ? `Agregar ${nombre} · ${presentacion}` : `Agregar ${nombre}`,
  );
  addBtn.title = disponible ? 'Agregar al carrito' : 'Stock insuficiente';
}

// Aliases keep the guard's narrowing inside every closure below (the
// baseline TS18047s this rewrite eliminates).
if (
  grid &&
  template &&
  searchInput &&
  categoriaSelect &&
  marcaSelect &&
  atributoSelect &&
  valorSelect
) {
  const gridEl = grid;
  const cardTemplate = template;
  const searchEl = searchInput;
  const categoriaEl = categoriaSelect;
  const marcaEl = marcaSelect;
  const atributoEl = atributoSelect;
  const valorEl = valorSelect;

  let products: Producto[] = [];
  let page = 0;
  // Active filters — '' = "Todas/Todos". Attribute value only applies while
  // its key is selected (the value dropdown is hidden otherwise).
  let selectedCategory = '';
  let selectedMarca = '';
  let selectedAtributo = '';
  let selectedValor = '';
  // plan-camara-barras: last code the camera read — the "Buscar por código"
  // recovery drops it into the search input.
  let ultimoBarcode = '';

  /** Trimmed, non-empty, accent-aware sorted unique list. */
  function unicos(valores: (string | undefined)[]): string[] {
    return [...new Set(valores.map((valor) => (valor ?? '').trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'es'),
    );
  }

  /**
   * Rebuild a filter <select>'s options, keeping the current selection when
   * it still exists. Returns the effective value (reset to '' when it does
   * not) so the caller can store it back.
   */
  function llenarSelect(
    select: HTMLSelectElement,
    placeholder: string,
    valores: string[],
    actual: string,
  ): string {
    const vigente = valores.includes(actual) ? actual : '';
    select.replaceChildren();
    const primera = document.createElement('option');
    primera.value = '';
    primera.textContent = placeholder;
    select.append(primera);
    for (const valor of valores) {
      const option = document.createElement('option');
      option.value = valor;
      option.textContent = valor;
      select.append(option);
    }
    // Assigned AFTER the options exist — value reconstruction drops otherwise.
    select.value = vigente;
    return vigente;
  }

  // Values for the selected attribute key, restricted to the products that
  // pass the category/brand filters (no empty combos in the dropdown).
  function populateValores(): void {
    if (selectedAtributo === '') {
      selectedValor = '';
      llenarSelect(valorEl, 'Todos', [], '');
      setHidden(valorWrap, true);
      return;
    }
    const valores = unicos(
      products
        .filter((p) => selectedCategory === '' || p.categoria === selectedCategory)
        .filter((p) => selectedMarca === '' || (p.marca ?? '') === selectedMarca)
        .map((p) => p.atributos?.[selectedAtributo]),
    );
    selectedValor = llenarSelect(valorEl, 'Todos', valores, selectedValor);
    valorEl.disabled = valores.length === 0;
    setHidden(valorWrap, false);
  }

  function updateClearButton(): void {
    setHidden(
      clearFiltersBtn,
      selectedCategory === '' &&
        selectedMarca === '' &&
        selectedAtributo === '' &&
        selectedValor === '',
    );
  }

  // Rebuild every dropdown from the loaded products. The cashier's filters
  // survive a refresh; a filter whose value disappeared is dropped.
  function populateFilters(items: Producto[]): void {
    selectedCategory = llenarSelect(
      categoriaEl,
      'Todas',
      unicos(items.map((p) => p.categoria)),
      selectedCategory,
    );
    selectedMarca = llenarSelect(
      marcaEl,
      'Todas',
      unicos(items.map((p) => p.marca)),
      selectedMarca,
    );
    selectedAtributo = llenarSelect(
      atributoEl,
      'Todos',
      unicos(items.flatMap((p) => Object.keys(p.atributos ?? {}))),
      selectedAtributo,
    );
    populateValores();
    updateClearButton();
  }

  function visibleProducts(): Producto[] {
    const crudo = searchEl.value.trim();
    // Shared pipeline (utils/search): exact barcode wins (beats the filters —
    // a code is a unique identifier). Otherwise substring on
    // nombre/categoria/marca, then a strict fuzzy fallback on nombre.
    let base = buscarProductos(products, crudo);
    if (selectedCategory !== '') base = base.filter((p) => p.categoria === selectedCategory);
    if (selectedMarca !== '') base = base.filter((p) => (p.marca ?? '') === selectedMarca);
    if (selectedAtributo !== '') {
      base = base.filter((p) => {
        const valor = p.atributos?.[selectedAtributo];
        if (valor === undefined) return false;
        return selectedValor === '' || valor === selectedValor;
      });
    }
    return base;
  }

  function paintCard(product: Producto): HTMLElement | null {
    const node = cloneTemplate(cardTemplate);
    if (!node) return null;

    const name = qs<HTMLElement>(node, '[data-card-name]');
    const category = qs<HTMLElement>(node, '[data-card-category]');
    const price = qs<HTMLElement>(node, '[data-card-price]');
    const stock = qs<HTMLElement>(node, '[data-card-stock]');
    const low = qs<HTMLElement>(node, '[data-card-low]');
    const img = qs<HTMLImageElement>(node, '[data-card-img]');
    const placeholder = qs<HTMLElement>(node, '[data-card-placeholder]');
    const presWrap = qs<HTMLElement>(node, '[data-card-presentaciones]');

    // Title (product.md): "Marca · descripción", falling back to the plain
    // nombre when neither exists — textContent only, never innerHTML.
    const marca = (product.marca ?? '').trim();
    const base = (product.descripcion ?? '').trim() || product.nombre;
    setText(name, marca !== '' ? `${marca} · ${base}` : base);

    // Category tag: hidden ⇔ the product has none (legacy rows arrive as '').
    if (category) {
      const cat = (product.categoria ?? '').trim();
      setText(category, cat);
      setHidden(category, cat === '');
    }

    // Product data for islands/cart (the add BUTTON + pills) — rides on the
    // card and clones with it; no shared state between islands (astrobase §3.4).
    node.dataset.productId = product.id;
    node.dataset.productName = product.nombre;
    node.dataset.productPrice = String(product.precio);
    node.dataset.productStock = String(product.stock);
    if (product.imagen_url) node.dataset.productImage = product.imagen_url;

    // Presentation pills (owner request 2026-11-04): one per available
    // presentation + the guaranteed base "Unidad"; the base pill starts
    // selected and its price wins by default (aplicarPresentacion below).
    const opciones = opcionesPresentacion(product.precio, product.presentaciones);
    if (presWrap && presTemplate) {
      for (const opcion of opciones) {
        const pill = cloneTemplate(presTemplate) as HTMLButtonElement | null;
        if (!pill) continue;
        pill.dataset.presName = opcion.label;
        pill.dataset.presUnits = String(opcion.units);
        pill.dataset.presPrice = String(opcion.price);
        setText(qs<HTMLElement>(pill, '[data-pres-label]'), opcion.label);
        // A x12 pack needs 12 units in stock — the pill stays visible but
        // cannot be picked when there are not enough.
        if (product.stock < opcion.units) {
          pill.disabled = true;
          pill.title = 'Stock insuficiente';
        }
        presWrap.append(pill);
      }
      // Default = base (units 1) pill; if stock cannot cover it, the first
      // option that fits (stock 0 leaves everything disabled anyway).
      const baseIndex = Math.max(
        0,
        opciones.findIndex((opcion) => opcion.units === 1),
      );
      const baseFits = product.stock >= (opciones[baseIndex]?.units ?? 1);
      const selectedIndex = baseFits
        ? baseIndex
        : Math.max(
            0,
            opciones.findIndex((opcion) => product.stock >= opcion.units),
          );
      aplicarPresentacion(node, selectedIndex);
    }

    // stock 0 → visible TEXT "Agotado" (template already sets copy + tone);
    // never color alone (stilesbase §5.2).
    setHidden(stock, product.stock > 0);

    // Low stock (< ajustes.stock_alerta_min, > 0) → warning tag "Quedan N"
    // (refactorUI §4.2D) — text + tone, painted via textContent.
    if (low) {
      const umbral = getAjustes().stock_alerta_min;
      const showLow = product.stock > 0 && product.stock < umbral;
      setHidden(low, !showLow);
      if (showLow) setText(low, `Quedan ${formatNumero(product.stock)}`);
    }

    // stock 0 → the card announces it; aplicarPresentacion already disabled
    // the add button (and every pill, since stock < units).
    if (product.stock === 0) node.setAttribute('aria-disabled', 'true');

    if (img && placeholder) {
      img.alt = product.nombre;
      // Single render point for image URLs: resolveImageUrl (Fase 6) turns
      // the raw Sheet value into an optimized Cloudinary URL here, so the
      // ui/Card stays cloud-agnostic and only ever receives a final src.
      const url = resolveImageUrl(product.imagen_url);
      if (url) {
        // Listeners BEFORE src so cached images still fire (extras.md §4):
        // any load error falls back to the generic product icon.
        img.addEventListener(
          'error',
          () => {
            img.classList.add('opacity-0');
            setHidden(placeholder, false);
          },
          { once: true },
        );
        img.addEventListener(
          'load',
          () => {
            img.classList.remove('opacity-0');
            setHidden(placeholder, true);
          },
          { once: true },
        );
        img.src = url;
      }
    }

    return node;
  }

  function updatePagination(total: number, totalPages: number): void {
    if (!pagination || !rangeText || !prevBtn || !nextBtn) return;
    // One page (or nothing) → the controls only add noise.
    setHidden(pagination, totalPages <= 1);
    if (totalPages <= 1) return;
    const from = page * PAGE_SIZE + 1;
    const to = Math.min((page + 1) * PAGE_SIZE, total);
    setText(rangeText, `${formatNumero(from)}–${formatNumero(to)} de ${formatNumero(total)}`);
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= totalPages - 1;
  }

  function render(): void {
    const list = visibleProducts();

    // Clamp first: a narrower filter or a refresh may have shrunk the list
    // under the cashier's current page.
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    page = Math.min(Math.max(page, 0), totalPages - 1);

    // Remove only previously painted cards — template and coexistents stay.
    qsa(gridEl, '[data-product-card]').forEach((card) => card.remove());
    const start = page * PAGE_SIZE;
    for (const product of list.slice(start, start + PAGE_SIZE)) {
      const card = paintCard(product);
      if (card) gridEl.append(card);
    }

    // First real paint done → the loading skeletons have served their purpose
    // (T2.9: shown from build, never competing with the empty states).
    setHidden(skeleton, true);

    const isEmptyCatalog = products.length === 0;
    setHidden(emptyCatalog, !isEmptyCatalog);
    setHidden(noResults, !(products.length > 0 && list.length === 0));
    updatePagination(list.length, totalPages);
  }

  function setStale(timestamp: number | null): void {
    if (!staleBox || !staleText) return;
    if (timestamp === null) {
      setHidden(staleBox, true);
      return;
    }
    const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
    setText(staleText, `Catálogo de hace ${formatNumero(minutes)} min`);
    setHidden(staleBox, false);
  }

  function setData(items: Producto[]): void {
    products = items;
    populateFilters(items);
    render();
  }

  async function refreshFromApi(previous: CatalogoCache | null): Promise<void> {
    const ok = await refreshCatalogoFromApi();
    if (ok) {
      const fresh = getCatalogoCache();
      if (fresh) setData(fresh.productos);
      setStale(null);
      return;
    }
    // Failure (offline or server): keep whatever we have — never block the
    // sale (base.md §6). Stale data gets the extras.md §6 notice; no data at
    // all stays on the "Todavía no hay productos cargados" empty state.
    if (previous && previous.productos.length > 0) setStale(previous.timestamp);
    else setHidden(skeleton, true); // nothing to load → empties own the screen
  }

  async function init(): Promise<void> {
    const cached = getCatalogoCache();
    const hasData = cached !== null && cached.productos.length > 0;
    const fresh = hasData && Date.now() - cached.timestamp < TTL_CATALOGO_MS;

    setData(hasData && cached ? cached.productos : []);
    if (!hasData || fresh) {
      // Fresh cache → paint with zero network (base.md §6).
      if (fresh && cached) setStale(null);
      if (!hasData) await refreshFromApi(cached);
      return;
    }

    // Stale cache: paint immediately from cache, then try to refresh.
    await refreshFromApi(cached);
  }

  // Voice search (plan-speak-search.md Fase 3): the mic only WRITES into
  // this same input and dispatches `input` — one search path for both (D1).
  let voice: VoiceSearch | null = null;
  const defaultPlaceholder = searchEl.placeholder;
  if (voiceBtn && isSpeechSupported()) {
    setHidden(voiceBtn, false);
    voice = createVoiceSearch({
      onText: (text) => {
        searchEl.value = text;
        searchEl.dispatchEvent(new Event('input', { bubbles: true }));
        searchEl.focus();
      },
      onState: (state) => {
        const isListening = state === 'listening';
        const label = isListening ? 'Detener búsqueda por voz' : 'Buscar por voz';
        voiceBtn.setAttribute('aria-label', label);
        voiceBtn.setAttribute('title', label);
        voiceBtn.classList.toggle('text-danger', isListening);
        voiceBtn.classList.toggle('animate-pulse', isListening);
        voiceBtn.classList.toggle('text-text-muted', !isListening);
        searchEl.placeholder = isListening ? 'Escuchando…' : defaultPlaceholder;
        setHidden(voiceStatus, !isListening);
      },
      onError: mostrarToast,
    });
    voiceBtn.addEventListener('click', () => {
      if (voice?.getState() === 'listening') voice.cancel();
      else voice?.start();
    });
  }

  // Search: local-only debounced filter — NO api call in input/key handlers
  // (plan-features Fase 2 gate, appscriptbase.md §5.3).
  searchEl.addEventListener(
    'input',
    debounce(() => {
      page = 0;
      render();
    }, 200),
  );

  // Keyboard/POS (§4.2D): Enter with exactly ONE visible result adds it —
  // barcode readers type + Enter; Esc clears the query.
  searchEl.addEventListener('keydown', (event) => {
    // Listening first (plan-speak-search.md §Behavior): Esc cancels WITHOUT
    // clearing; Enter stops the session instead of adding a card.
    if (event.key === 'Escape' && voice?.getState() === 'listening') {
      event.preventDefault();
      voice.cancel();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (voice?.getState() === 'listening') {
        voice.stop();
        return;
      }
      // Add the UNIQUE result directly (same guards/toast the camera path
      // uses). Clicking a painted card raced the 200 ms input debounce — a
      // wedge scanner types the code + Enter in well under that, so the card
      // wasn't painted yet and Enter silently did nothing.
      const only = visibleProducts();
      if (only.length === 1) {
        agregarAlCarrito(only[0]);
        // Clear the query: a wedge keeps its buffer otherwise and the NEXT
        // scan concatenates onto the previous code ("775…17" + "775…18"),
        // which never matches anything.
        searchEl.value = '';
        page = 0;
        render();
      }
      return;
    }
    if (event.key === 'Escape' && searchEl.value !== '') {
      event.preventDefault();
      searchEl.value = '';
      page = 0;
      render();
    }
  });

  // F2 → focus search (desktop only, §4.2E).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'F2' || !esDesktop()) return;
    event.preventDefault();
    searchEl.focus();
    searchEl.select();
  });

  // ── Filters: four local dropdowns, one render each (zero network) ──────
  categoriaEl.addEventListener('change', () => {
    selectedCategory = categoriaEl.value;
    page = 0;
    // A narrower category may remove the current attribute value — rebuild
    // the value list before painting.
    populateValores();
    updateClearButton();
    render();
  });

  marcaEl.addEventListener('change', () => {
    selectedMarca = marcaEl.value;
    page = 0;
    populateValores();
    updateClearButton();
    render();
  });

  atributoEl.addEventListener('change', () => {
    selectedAtributo = atributoEl.value;
    selectedValor = '';
    page = 0;
    populateValores();
    updateClearButton();
    render();
  });

  valorEl.addEventListener('change', () => {
    selectedValor = valorEl.value;
    page = 0;
    updateClearButton();
    render();
  });

  clearFiltersBtn?.addEventListener('click', () => {
    selectedCategory = '';
    selectedMarca = '';
    selectedAtributo = '';
    selectedValor = '';
    populateFilters(products);
    page = 0;
    render();
    searchEl.focus();
  });

  // Presentation pills — ONE delegated listener. Picking a pill re-prices
  // the card; it NEVER adds to the cart (the add button owns that).
  gridEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const pill = target.closest<HTMLButtonElement>('[data-pres-pill]');
    if (!pill || pill.disabled || !gridEl.contains(pill)) return;
    const card = closestCard(pill);
    if (!card) return;
    const pills = qsa<HTMLButtonElement>(card, '[data-pres-pill]');
    const index = pills.indexOf(pill);
    if (index >= 0) aplicarPresentacion(card, index);
  });

  prevBtn?.addEventListener('click', () => {
    page -= 1;
    render();
  });

  nextBtn?.addEventListener('click', () => {
    page += 1;
    render();
  });

  refreshBtn?.addEventListener('click', () => {
    void refreshFromApi(getCatalogoCache());
  });

  // ── plan-camara-barras: camera scan → cart ────────────────────────────
  // The read code is looked up by EXACT barcode match (utils/barcode) over
  // the already-loaded cache — zero network. A hit adds through the SAME
  // store the cards use (stores/cart → subscribeCart repaints ticket+badge);
  // a miss reveals the recovery alert (search it here / register it in
  // /productos). The camera itself is owned by the shared runtime island.
  function ocultarAlertaBarcode(): void {
    setHidden(barcodeAlert, true);
  }

  // Shared add path for BOTH entry points: the camera scan and Enter on a
  // unique search result. Same guard as the card's add button: agotado never
  // enters the cart, even through a barcode.
  function agregarAlCarrito(producto: Producto): void {
    if (producto.stock === 0) {
      mostrarToast(`"${producto.nombre}" está agotado.`);
      return;
    }
    addToCart(
      {
        // Same line key the card's base pill uses ("{id}::Unidad"): a scan
        // and a click must land on the SAME ticket line, not create two.
        id: `${producto.id}::Unidad`,
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        presentacion: 'Unidad',
        ...(producto.imagen_url ? { imagen_url: producto.imagen_url } : {}),
      },
      1,
    );
    mostrarToast(`Agregado: ${producto.nombre}`);
  }

  function agregarPorBarcode(codigo: string): void {
    const producto = buscarPorBarcode(products, codigo);
    if (!producto) {
      ultimoBarcode = codigo;
      setText(
        barcodeAlertText,
        `No encontramos ningún producto con el código "${codigo}". Si ya existe, actualiza el catálogo; si es nuevo, crea el producto.`,
      );
      setHidden(barcodeAlert, false);
      return;
    }
    ocultarAlertaBarcode();
    agregarAlCarrito(producto);
  }

  scanBtn?.addEventListener('click', () => {
    ocultarAlertaBarcode();
    abrirEscaneoBarcode({ onLeido: agregarPorBarcode });
  });

  // Recovery actions on the not-found alert: drop the code into the search
  // input (the exact-match branch in visibleProducts takes over), or go
  // register the product — the link navigates, this only clears the alert.
  barcodeSearchBtn?.addEventListener('click', () => {
    searchEl.value = ultimoBarcode;
    searchEl.dispatchEvent(new Event('input', { bubbles: true }));
    searchEl.focus();
  });
  qs<HTMLElement>(document, '[data-barcode-notfound-register]')?.addEventListener(
    'click',
    ocultarAlertaBarcode,
  );

  void init();
}
