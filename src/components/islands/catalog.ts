// Catalog runtime — implements the astrobase.md §3.3 decision ("use cache or
// fetch") on the client, per option A of plan-features Fase 2 (2026-09-22):
// the shell renders at build time and THIS module paints product cards by
// cloning the ui/Card <template>>, then wires Fuse.js search, the category
// filter and the manual refresh.
//
// Rules honored here:
//   - Search NEVER calls the API (appscriptbase.md §5.3, base.md §9): it only
//     queries the in-memory index built from catalogo_cache.
//   - The only network read goes through api/actions/productos.ts.
//   - Stale cache + no refresh → never blocks: we keep selling from cache
//     (base.md §6) and reveal the extras.md §6 "actualizado hace X min" notice.
//   - No fixed ids, no globals; everything scoped to data-attribute hooks.

import Fuse from 'fuse.js';
import { obtenerProductos } from '../../api/actions/productos';
import { formatCurrency, formatNumero } from '../../utils/format';
import { resolveImageUrl } from '../../utils/cloudinary';
import {
  getCatalogoCache,
  setCatalogoCache,
  TTL_CATALOGO_MS,
  type CatalogoCache,
  type Producto,
} from '../../utils/storage';

const grid = document.querySelector<HTMLElement>('[data-catalog-grid]');
const template = document.querySelector<HTMLTemplateElement>('[data-card-template]');
const searchInput = document.querySelector<HTMLInputElement>('[data-catalog-search]');
const categorySelect = document.querySelector<HTMLSelectElement>('[data-catalog-category]');
const staleBox = document.querySelector<HTMLElement>('[data-catalog-stale]');
const staleText = document.querySelector<HTMLElement>('[data-catalog-stale-text]');
const refreshBtn = document.querySelector<HTMLButtonElement>('[data-catalog-refresh]');
const emptyCatalog = document.querySelector<HTMLElement>('[data-empty-state="empty-catalog"]');
const noResults = document.querySelector<HTMLElement>('[data-empty-state="no-results"]');
const pagination = document.querySelector<HTMLElement>('[data-catalog-pagination]');
const rangeText = document.querySelector<HTMLElement>('[data-catalog-range]');
const prevBtn = document.querySelector<HTMLButtonElement>('[data-catalog-prev]');
const nextBtn = document.querySelector<HTMLButtonElement>('[data-catalog-next]');

// Visual pagination (plan-productos-v2 D1): client-side chunks over the
// already-filtered list. No API, no storage, no server paging.
const PAGE_SIZE = 50;

if (grid && template && searchInput && categorySelect) {
  let products: Producto[] = [];
  let fuse: Fuse<Producto> | null = null;
  let page = 0;

  function buildIndex(items: Producto[]): void {
    fuse = new Fuse(items, { keys: ['nombre', 'categoria'], threshold: 0.3 });
  }

  function populateCategories(items: Producto[]): void {
    const previous = categorySelect.value;
    while (categorySelect.options.length > 0) categorySelect.remove(0);

    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'Todas las categorías';
    categorySelect.append(all);

    const categories = [...new Set(items.map((p) => p.categoria).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'es'),
    );
    for (const categoria of categories) {
      const option = document.createElement('option');
      option.value = categoria;
      option.textContent = categoria;
      categorySelect.append(option);
    }

    // Keep the cashier's filter across refreshes when the category still exists.
    const hasPrevious = Array.from(categorySelect.options).some((o) => o.value === previous);
    categorySelect.value = hasPrevious ? previous : '';
  }

  function visibleProducts(): Producto[] {
    const query = searchInput.value.trim();
    const category = categorySelect.value;

    let base = products;
    if (query && fuse) {
      const matches = new Set(fuse.search(query).map((result) => result.item));
      base = base.filter((p) => matches.has(p));
    }
    if (category) base = base.filter((p) => p.categoria === category);
    return base;
  }

  function paintCard(product: Producto): HTMLElement | null {
    const first = template.content.firstElementChild;
    if (!first) return null;
    const node = first.cloneNode(true) as HTMLElement;

    const name = node.querySelector<HTMLElement>('[data-card-name]');
    const price = node.querySelector<HTMLElement>('[data-card-price]');
    const stock = node.querySelector<HTMLElement>('[data-card-stock]');
    const img = node.querySelector<HTMLImageElement>('[data-card-img]');
    const placeholder = node.querySelector<HTMLElement>('[data-card-placeholder]');

    if (name) name.textContent = product.nombre;
    if (price) price.textContent = formatCurrency(product.precio);

    // Product data for islands/cart-actions ("Agregar") — rides on the card
    // and clones with it; no shared state between islands (astrobase §3.4).
    node.dataset.productId = product.id;
    node.dataset.productName = product.nombre;
    node.dataset.productPrice = String(product.precio);
    if (product.imagen_url) node.dataset.productImage = product.imagen_url;

    // stock 0 → visible TEXT "Agotado" (template already sets copy + tone);
    // never color alone (stilesbase §5.2).
    if (stock) stock.hidden = product.stock > 0;

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
            img.hidden = true;
            placeholder.hidden = false;
          },
          { once: true },
        );
        img.addEventListener(
          'load',
          () => {
            img.hidden = false;
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
    grid.querySelectorAll('[data-product-card]').forEach((card) => card.remove());
    const start = page * PAGE_SIZE;
    for (const product of list.slice(start, start + PAGE_SIZE)) {
      const card = paintCard(product);
      if (card) grid.append(card);
    }

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
    staleText.textContent = `Catálogo actualizado hace ${formatNumero(minutes)} min`;
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
  searchInput.addEventListener('input', () => {
    page = 0;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  });

  // New filter context → back to the first page (render clamps anyway).
  categorySelect.addEventListener('change', () => {
    page = 0;
    render();
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
