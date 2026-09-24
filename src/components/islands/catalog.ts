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
import { obtenerProductos } from '../../api/actions/productos';
import { formatCurrency, formatNumero } from '../../utils/format';
import { resolveImageUrl } from '../../utils/cloudinary';
import {
  getAjustes,
  getCatalogoCache,
  setCatalogoCache,
  TTL_CATALOGO_MS,
  type CatalogoCache,
  type Producto,
} from '../../utils/storage';

const grid = document.querySelector<HTMLElement>('[data-catalog-grid]');
const template = document.querySelector<HTMLTemplateElement>('[data-card-template]');
const searchInput = document.querySelector<HTMLInputElement>('[data-catalog-search]');
const categoryGroup = document.querySelector<HTMLElement>('[data-catalog-category]');
const chipTemplate = document.querySelector<HTMLTemplateElement>('[data-category-chip-template]');
const staleBox = document.querySelector<HTMLElement>('[data-catalog-stale]');
const staleText = document.querySelector<HTMLElement>('[data-catalog-stale-text]');
const refreshBtn = document.querySelector<HTMLButtonElement>('[data-catalog-refresh]');
const emptyCatalog = document.querySelector<HTMLElement>('[data-empty-state="empty-catalog"]');
const noResults = document.querySelector<HTMLElement>('[data-empty-state="no-results"]');
const skeleton = document.querySelector<HTMLElement>('[data-catalog-skeleton]');
const pagination = document.querySelector<HTMLElement>('[data-catalog-pagination]');
const rangeText = document.querySelector<HTMLElement>('[data-catalog-range]');
const prevBtn = document.querySelector<HTMLButtonElement>('[data-catalog-prev]');
const nextBtn = document.querySelector<HTMLButtonElement>('[data-catalog-next]');

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
  // Product id → painted card, so Enter-on-unique-result can click the
  // card's overlay add button (one code path for adding, guards included).
  const painted = new Map<string, HTMLElement>();

  function buildIndex(items: Producto[]): void {
    fuse = new Fuse(items, { keys: ['nombre', 'categoria'], threshold: 0.3 });
  }

  function paintChipSelection(): void {
    for (const chip of chipsEl.querySelectorAll<HTMLElement>('[data-category-value]')) {
      const value = chip.getAttribute('data-category-value') ?? '';
      chip.setAttribute('aria-pressed', String(value === selectedCategory));
    }
  }

  function populateCategories(items: Producto[]): void {
    // Keep the cashier's filter across refreshes; drop the chip if the
    // category disappeared. The static "Todas" chip (value "") never goes.
    const categories = [...new Set(items.map((p) => p.categoria).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'es'),
    );
    const hasPrevious = selectedCategory === '' || categories.includes(selectedCategory);
    if (!hasPrevious) selectedCategory = '';

    chipsEl.querySelectorAll<HTMLElement>('[data-category-value]').forEach((chip) => {
      if ((chip.getAttribute('data-category-value') ?? '') !== '') chip.remove();
    });
    for (const categoria of categories) {
      const first = chipTpl.content.firstElementChild;
      if (!first) continue;
      const chip = first.cloneNode(true) as HTMLElement;
      chip.setAttribute('data-category-value', categoria);
      const label = chip.querySelector<HTMLElement>('[data-chip-label]');
      if (label) label.textContent = categoria;
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
    const query = searchEl.value.trim();

    let base = products;
    if (query && fuse) {
      const matches = new Set(fuse.search(query).map((result) => result.item));
      base = base.filter((p) => matches.has(p));
    }
    if (selectedCategory) base = base.filter((p) => p.categoria === selectedCategory);
    return base;
  }

  function paintCard(product: Producto): HTMLElement | null {
    const first = cardTemplate.content.firstElementChild;
    if (!first) return null;
    const node = first.cloneNode(true) as HTMLElement;

    const name = node.querySelector<HTMLElement>('[data-card-name]');
    const price = node.querySelector<HTMLElement>('[data-card-price]');
    const stock = node.querySelector<HTMLElement>('[data-card-stock]');
    const low = node.querySelector<HTMLElement>('[data-card-low]');
    const addBtn = node.querySelector<HTMLButtonElement>('[data-add-to-cart]');
    const img = node.querySelector<HTMLImageElement>('[data-card-img]');
    const placeholder = node.querySelector<HTMLElement>('[data-card-placeholder]');

    if (name) name.textContent = product.nombre;
    if (price) price.textContent = formatCurrency(product.precio);
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
    if (stock) stock.hidden = product.stock > 0;

    // Low stock (< ajustes.stock_alerta_min, > 0) → warning tag "Quedan N"
    // (refactorUI §4.2D) — text + tone, painted via textContent.
    if (low) {
      const umbral = getAjustes().stock_alerta_min;
      const showLow = product.stock > 0 && product.stock < umbral;
      low.hidden = !showLow;
      if (showLow) low.textContent = `Quedan ${formatNumero(product.stock)}`;
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
            placeholder.hidden = false;
          },
          { once: true },
        );
        img.addEventListener(
          'load',
          () => {
            img.classList.remove('opacity-0');
            placeholder.hidden = true;
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
    pagination.hidden = totalPages <= 1;
    if (totalPages <= 1) return;
    const from = page * PAGE_SIZE + 1;
    const to = Math.min((page + 1) * PAGE_SIZE, total);
    rangeText.textContent = `${formatNumero(from)}–${formatNumero(to)} de ${formatNumero(total)}`;
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
    gridEl.querySelectorAll('[data-product-card]').forEach((card) => card.remove());
    painted.clear();
    const start = page * PAGE_SIZE;
    for (const product of list.slice(start, start + PAGE_SIZE)) {
      const card = paintCard(product);
      if (card) {
        gridEl.append(card);
        painted.set(product.id, card);
      }
    }

    // First real paint done → the loading skeletons have served their purpose
    // (T2.9: shown from build, never competing with the empty states).
    if (skeleton) skeleton.hidden = true;

    const isEmptyCatalog = products.length === 0;
    if (emptyCatalog) emptyCatalog.hidden = !isEmptyCatalog;
    if (noResults) noResults.hidden = !(products.length > 0 && list.length === 0);
    updatePagination(list.length, totalPages);
  }

  function setStale(timestamp: number | null): void {
    if (!staleBox || !staleText) return;
    if (timestamp === null) {
      staleBox.hidden = true;
      return;
    }
    const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
    staleText.textContent = `Catálogo de hace ${formatNumero(minutes)} min`;
    staleBox.hidden = false;
  }

  function setData(items: Producto[]): void {
    products = items;
    buildIndex(items);
    populateCategories(items);
    render();
  }

  async function refreshFromApi(previous: CatalogoCache | null): Promise<void> {
    const result = await obtenerProductos();
    if (result.status === 'success') {
      const next: CatalogoCache = {
        productos: result.body.productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria,
          precio: p.precio,
          stock: p.stock,
          imagen_url: p.imagen_url,
        })),
        timestamp: Date.now(),
      };
      setCatalogoCache(next);
      setData(next.productos);
      setStale(null);
      return;
    }
    // Failure (offline or server): keep whatever we have — never block the
    // sale (base.md §6). Stale data gets the extras.md §6 notice; no data at
    // all stays on the "Todavía no hay productos cargados" empty state.
    if (previous && previous.productos.length > 0) setStale(previous.timestamp);
    else if (skeleton) skeleton.hidden = true; // nothing to load → empties own the screen
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

  // Search: local-only debounced filter — NO api call in input/key handlers
  // (plan-features Fase 2 gate, appscriptbase.md §5.3).
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  searchEl.addEventListener('input', () => {
    page = 0;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  });

  // Keyboard/POS (§4.2D): Enter with exactly ONE visible result adds it —
  // barcode readers type + Enter; Esc clears the query.
  searchEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const only = visibleProducts();
      if (only.length === 1) {
        painted
          .get(only[0].id)
          ?.querySelector<HTMLButtonElement>('[data-add-to-cart]')
          ?.click();
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
  const desktop = window.matchMedia('(min-width: 768px)');
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'F2' || !desktop.matches) return;
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

  void init();
}
