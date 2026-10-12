// Catalog runtime — implements the astrobase.md §3.3 decision ("use cache or
// fetch") on the client, per option A of plan-features Fase 2 (2026-09-22):
// the shell renders at build time and THIS module paints product cards by
// cloning the ui/Card <template>>, then wires Fuse.js search, the category
// CHIPS, the manual refresh and the POS shortcuts (refactorUI §4.2D).
//
// Rules honored here:
//   - Search NEVER calls the API (appscriptbase.md §5.3, base.md §9): it only
//     queries the in-memory index built from catalogo_cache.
//   - The only network read goes through api/actions/productos.ts.
//   - Stale cache + no refresh → never blocks: we keep selling from cache
//     (base.md §6) and reveal the extras.md §6 "actualizado hace X min" notice.
//   - No fixed ids, no globals; everything scoped to data-attribute hooks.
//   - Fase 2: the whole card is the add button (aria-label "Agregar X");
//     the quantity stepper was deleted — quantity lives in the ticket only.
//     Enter with a UNIQUE result adds it (barcode readers emulate keyboards).

import Fuse from 'fuse.js';
import { formatCurrency, formatNumero } from '../../../utils/format';
import { resolveImageUrl } from '../../../utils/cloudinary';
import {
  getAjustes,
  getCatalogoCache,
  TTL_CATALOGO_MS,
  type CatalogoCache,
  type Producto,
} from '../../../utils/storage';
import { qs, qsa, setText, setHidden, cloneTemplate, selectChip, debounce } from '../../../utils/dom';
import { esDesktop } from '../../../utils/media';
import { refreshCatalogoFromApi } from '../../../utils/catalog-cache';
import { normalizeSearchQuery } from '../../../utils/search-normalize';
import { createVoiceSearch, isSpeechSupported, type VoiceSearch } from '../../../utils/speech';
import { mostrarToast } from '../../../utils/toast';
import { buscarPorBarcode } from '../../../utils/barcode';
import { addToCart } from '../../../stores/cart';
import { abrirEscaneoBarcode } from '../runtime/barcode-scanner';

const grid = qs<HTMLElement>(document, '[data-catalog-grid]');
const template = qs<HTMLTemplateElement>(document, '[data-card-template]');
const searchInput = qs<HTMLInputElement>(document, '[data-catalog-search]');
const categoryGroup = qs<HTMLElement>(document, '[data-catalog-category]');
const chipTemplate = qs<HTMLTemplateElement>(document, '[data-category-chip-template]');
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

// Aliases keep the guard's narrowing inside every closure below (the
// baseline TS18047s this rewrite eliminates).
if (grid && template && searchInput && categoryGroup && chipTemplate) {
  const gridEl = grid;
  const cardTemplate = template;
  const searchEl = searchInput;
  const chipsEl = categoryGroup;
  const chipTpl = chipTemplate;

  let products: Producto[] = [];
  let fuse: Fuse<Producto> | null = null;
  let page = 0;
  let selectedCategory = '';
  // plan-camara-barras: last code the camera read — the "Buscar por código"
  // recovery drops it into the search input.
  let ultimoBarcode = '';

  function buildIndex(items: Producto[]): void {
    fuse = new Fuse(items, {
      keys: [
        { name: 'nombre', getFn: (p) => normalizeSearchQuery(p.nombre) },
        { name: 'categoria', getFn: (p) => normalizeSearchQuery(p.categoria) },
        // plan-camara-barras: a full or partial code also filters the grid
        // (same normalized form the query goes through below).
        { name: 'barcode', getFn: (p) => normalizeSearchQuery(p.barcode ?? '') },
      ],
      threshold: 0.35,
    });
  }

  function paintChipSelection(): void {
    selectChip(chipsEl, 'data-category-value', selectedCategory);
  }

  function populateCategories(items: Producto[]): void {
    // Keep the cashier's filter across refreshes; drop the chip if the
    // category disappeared. The static "Todas" chip (value "") never goes.
    const categories = [...new Set(items.map((p) => p.categoria).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'es'),
    );
    const hasPrevious = selectedCategory === '' || categories.includes(selectedCategory);
    if (!hasPrevious) selectedCategory = '';

    qsa<HTMLElement>(chipsEl, '[data-category-value]').forEach((chip) => {
      if ((chip.getAttribute('data-category-value') ?? '') !== '') chip.remove();
    });
    for (const categoria of categories) {
      const chip = cloneTemplate(chipTpl);
      if (!chip) continue;
      chip.setAttribute('data-category-value', categoria);
      const label = qs<HTMLElement>(chip, '[data-chip-label]');
      setText(label, categoria);
      chipsEl.append(chip);
    }
    paintChipSelection();
  }

  function setCategory(value: string): void {
    selectedCategory = value;
    paintChipSelection();
    page = 0;
    render();
  }

  function visibleProducts(): Producto[] {
    const crudo = searchEl.value.trim();
    const query = normalizeSearchQuery(crudo);

    // Exact barcode match wins over fuzzy name results (plan-camara-barras):
    // keyboard scanners (wedge) type the full code + Enter, and the
    // "Buscar por código" recovery action lands here too. One visible result
    // → the Enter handler below adds it through the SAME add path the
    // camera uses. The exact code also BEATS the category chip: a code is a
    // unique identifier, and the camera path ignores the chip too — showing
    // "Sin resultados" here while the scan would add it was inconsistent.
    const porCodigo = buscarPorBarcode(products, crudo);
    if (porCodigo) return [porCodigo];

    let base = products;
    if (query && fuse) {
      const matches = new Set(fuse.search(query).map((result) => result.item));
      base = base.filter((p) => matches.has(p));
    }
    if (selectedCategory) base = base.filter((p) => p.categoria === selectedCategory);
    return base;
  }

  function paintCard(product: Producto): HTMLElement | null {
    const node = cloneTemplate(cardTemplate);
    if (!node) return null;

    const name = qs<HTMLElement>(node, '[data-card-name]');
    const price = qs<HTMLElement>(node, '[data-card-price]');
    const stock = qs<HTMLElement>(node, '[data-card-stock]');
    const low = qs<HTMLElement>(node, '[data-card-low]');
    const addBtn = qs<HTMLButtonElement>(node, '[data-add-to-cart]');
    const img = qs<HTMLImageElement>(node, '[data-card-img]');
    const placeholder = qs<HTMLElement>(node, '[data-card-placeholder]');

    setText(name, product.nombre);
    setText(price, formatCurrency(product.precio));
    // The overlay button carries the accessible name (§4.2D).
    if (addBtn) addBtn.setAttribute('aria-label', `Agregar ${product.nombre}`);

    // Product data for islands/cart-actions ("Agregar") — rides on the card
    // and clones with it; no shared state between islands (astrobase §3.4).
    node.dataset.productId = product.id;
    node.dataset.productName = product.nombre;
    node.dataset.productPrice = String(product.precio);
    node.dataset.productStock = String(product.stock);
    if (product.imagen_url) node.dataset.productImage = product.imagen_url;

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

    // stock 0 → the add overlay is disabled too (refactorUI §4.2D,
    // plan-refactor-ui T0.2): no click, no focus; the card announces it via
    // aria-disabled. cart-actions.ts keeps a second guard on the same value.
    if (product.stock === 0) {
      node.setAttribute('aria-disabled', 'true');
      if (addBtn) addBtn.disabled = true;
    }

    if (img && placeholder) {
      img.alt = product.nombre;
      // Single render point for image URLs: resolveImageUrl (Fase 6) turns
      // the raw Sheet value into an optimized Cloudinary URL here, so the
      // ui/Card stays cloud-agnostic and only ever receives a final src.
      const url = resolveImageUrl(product.imagen_url);
      if (url) {
        // Listeners BEFORE src so cached images still fire (extras.md §4):
        // any load error falls back to the generic product icon (the img
        // stays opacity-0 so its alt never bleeds through the placeholder).
        // T4.4 fix: reveal via CLASS, not the `hidden` property — the img
        // is hidden-by-opacity now (see Card.astro), and `img.hidden=false`
        // never touched `class="hidden"` anyway (dead code before this).
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
    buildIndex(items);
    populateCategories(items);
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
      // uses). Clicking the painted card raced the 200 ms input debounce —
      // a wedge scanner types the code + Enter in well under that, so the
      // card wasn't painted yet and Enter silently did nothing.
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

  // Category chips — one delegated listener (§0.5), same filtering as the
  // old select, zero network.
  chipsEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest<HTMLElement>('[data-category-value]');
    if (!chip || !chipsEl.contains(chip)) return;
    setCategory(chip.getAttribute('data-category-value') ?? '');
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
  // unique search result. Same guard as the card overlay (plan-refactor-ui
  // T0.2): agotado never enters the cart, even through a barcode.
  function agregarAlCarrito(producto: Producto): void {
    if (producto.stock === 0) {
      mostrarToast(`"${producto.nombre}" está agotado.`);
      return;
    }
    addToCart(
      {
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
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
