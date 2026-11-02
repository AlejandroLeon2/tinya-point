// Low-stock panel runtime (plan-stock.md Fase 2 + plan-reponer-buscar.md
// Fase 1 + refactorUI §9 / plan T3.8, owner pass 2026-11-01) — paints the
// KPI trio (Por reponer · Agotados · Inventario valorizado), filters the
// rows through chips + a categoría select + a local search (shared
// utils/search pipeline), and paginates 25/page over the REUSABLE
// DataTable (desktop tbody) + the mobile card twin. ONE row per product
// with `stock < ajustes.stock_alerta_min` (default 5).
//
// Restock controls (owner request 2026-11-01):
//   - The row's stepper is ± icon buttons + direct number entry ONLY
//     (batch +5/+10/+24 removed). Edits stay LOCAL until the row's
//     "Guardar" button (or Enter on the input) commits them — the old
//     500 ms auto-save debounce is gone.
//   - The Guardar button is disabled ⇔ input value === saved value.
//
// Rules honored here:
//   - Restock writes reuse the existing §4.10 contract
//     (`actualizarProducto({ id, stock })` — validates + clamps server-side)
//     through api/actions; no new backend. Failure → revert to the last
//     saved value + Alert (same policy as the product form: no offline
//     queue for edits). Success → toast ("Stock actualizado") via feedback.
//   - Network only via api/actions/productos.ts, cache-first with the same
//     freshness policy as islands/catalog/catalog.ts (base.md §6): fresh cache → no
//     request; stale → paint, then try to refresh; failure keeps the data.
//   - On a successful restock the in-memory list AND `catalogo_cache` are
//     patched locally (patrón G5 del admin) so POS + sidebar badge see the
//     new number on the next paint/navigation without an extra GET.
//   - Rows never repaint on save (would clobber a focused input); only the
//     KPIs and the row's own tags refresh. A row that crossed the threshold
//     stays visible until the next filter/paint — plan-reponer-buscar D2.
//   - Filter chips (spec §9): todos (DEFAULT order = agotados primero,
//     luego stock ascendente) · solo agotados. Sorting only reorders rows —
//     no focus is inside them while filtering.
//   - "Actualizado hace N min" is ALWAYS visible next to Actualizar when a
//     cache exists; stale (age ≥ TTL_CATALOGO_MS) swaps to the warning node.
//   - data-* hooks only, text via textContent; no fixed ids (astrobase §3.4).

import { actualizarProducto } from '../../../api/actions/productos';
import { formatCurrency, formatNumero } from '../../../utils/format';
import {
  getAjustes,
  getCatalogoCache,
  setCatalogoCache,
  TTL_CATALOGO_MS,
  type CatalogoCache,
  type Producto,
} from '../../../utils/storage';
import { qs, qsa, setText, setHidden, cloneTemplate, selectChip, paintStat, debounce } from '../../../utils/dom';
import { crearFeedback } from '../../../utils/feedback';
import { minutosDesde, refreshCatalogoFromApi } from '../../../utils/catalog-cache';
import { mensajeDeErrorApi } from '../../../utils/api-result';
import { buscarProductos } from '../../../utils/search';
import { normalizeSearchQuery } from '../../../utils/search-normalize';

const root = qs<HTMLElement>(document, '[data-stock-root]');

if (root) {
  const listEl = qs<HTMLElement>(root, '[data-stock-list]');
  const template = qs<HTMLTemplateElement>(root, '[data-stock-row-template]');
  const desktopTemplate = qs<HTMLTemplateElement>(root, '[data-stock-row-desktop-template]');
  const tbody = qs<HTMLElement>(root, 'table tbody');
  const tableWrap = qs<HTMLElement>(root, '[data-stock-table-wrap]');
  const umbralEl = qs<HTMLElement>(root, '[data-stock-umbral]');
  const staleBox = qs<HTMLElement>(root, '[data-stock-stale]');
  const staleText = qs<HTMLElement>(root, '[data-stock-stale-text]');
  const staleWarn = qs<HTMLElement>(root, '[data-stock-stale-warn]');
  const warningAlert = qs<HTMLElement>(root, '[data-alert="stock-warning"]');
  const warningText = qs<HTMLElement>(root, '[data-stock-warning-text]');
  const emptyOk = qs<HTMLElement>(root, '[data-empty-state="stock-ok"]');
  const emptyNoResults = qs<HTMLElement>(root, '[data-empty-state="stock-noresults"]');
  const emptyNoData = qs<HTMLElement>(root, '[data-empty-state="stock-nodata"]');
  const filtroWrap = qs<HTMLElement>(root, '[data-stock-filter]');
  const searchEl = qs<HTMLInputElement>(root, '[data-stock-search]');
  const catFilter = qs<HTMLSelectElement>(root, '[data-stock-catfilter]');
  const pagNav = qs<HTMLElement>(root, '[data-stock-pagination]');
  const pagRange = qs<HTMLElement>(root, '[data-stock-range]');
  const pagPrev = qs<HTMLButtonElement>(root, '[data-stock-prev]');
  const pagNext = qs<HTMLButtonElement>(root, '[data-stock-next]');

  // KPI cards keyed by data-stock-kpi (reponer | agotados | valorizado).
  const kpis = new Map<string, HTMLElement>();
  qsa<HTMLElement>(root, '[data-stock-kpi]').forEach((card) => {
    const key = card.dataset.stockKpi;
    if (key) kpis.set(key, card);
  });

  const feedback = crearFeedback(warningAlert, warningText);

  let productos: Producto[] = [];
  let hayDatos = false;
  let filtro: 'todos' | 'agotados' = 'todos';
  let busqueda = ''; // normalized query ('' = off)
  let catFiltro = ''; // categoría select value ('' = all)
  let page = 0;

  const PAGE_SIZE = 25; // client-side chunks over the filtered list (POS catalog pattern)
  const STOCK_MIN = 0;
  const STOCK_MAX = 9999;

  function clampStock(valor: number): number {
    if (!Number.isFinite(valor)) return STOCK_MIN;
    return Math.max(STOCK_MIN, Math.min(STOCK_MAX, Math.round(valor)));
  }

  function pintarTags(node: HTMLElement, stock: number): void {
    const umbral = getAjustes().stock_alerta_min;
    const agotado = qs<HTMLElement>(node, '[data-stock-agotado]');
    const bajo = qs<HTMLElement>(node, '[data-stock-bajo]');
    setHidden(agotado, stock !== 0);
    if (bajo) {
      setHidden(bajo, !(stock > 0 && stock < umbral));
      bajo.title = `Menos de ${formatNumero(umbral)} unidades`; // "con umbral" (spec §9)
    }
  }

  // Guardar is disabled ⇔ the input matches the last saved value.
  function actualizarBotonGuardar(row: HTMLElement, input: HTMLInputElement): void {
    const btn = qs<HTMLButtonElement>(row, '[data-stock-save]');
    if (!btn) return;
    const guardado = Number(row.dataset.stockActual);
    const valor = clampStock(Number(input.value));
    btn.disabled = !Number.isFinite(guardado) || valor === guardado;
  }

  // ONE routine for BOTH templates (mobile card / desktop tr): hooks that
  // don't exist in a template are skipped (product-admin pattern).
  function paintRow(tpl: HTMLTemplateElement, producto: Producto): HTMLElement | null {
    const node = cloneTemplate(tpl);
    if (!node) return null;

    node.dataset.productId = producto.id;
    node.dataset.stockActual = String(producto.stock);

    const nombre = qs<HTMLElement>(node, '[data-stock-nombre]');
    const categoria = qs<HTMLElement>(node, '[data-stock-categoria]');
    const precio = qs<HTMLElement>(node, '[data-stock-precio]');
    const input = qs<HTMLInputElement>(node, '[data-stock-input]');
    const guardar = qs<HTMLButtonElement>(node, '[data-stock-save]');

    setText(nombre, producto.nombre);
    setText(categoria, producto.categoria);
    setText(precio, formatCurrency(producto.precio));
    if (input) {
      input.value = String(producto.stock);
      // No fixed ids: the accessible name carries the product (astrobase §3.4).
      input.setAttribute('aria-label', `Stock de ${producto.nombre}`);
      if (guardar) {
        guardar.title = `Guardar stock de ${producto.nombre}`;
        guardar.disabled = true; // nothing dirty on a fresh row
      }
    }
    pintarTags(node, producto.stock);
    return node;
  }

  // KPIs only — deliberately does NOT touch the rows: repainting rows would
  // clobber the focused stepper input mid-repostock (plan-reponer-buscar D2).
  function pintarStats(): void {
    const umbral = getAjustes().stock_alerta_min;
    setText(umbralEl, `Mostrando productos con stock menor a ${formatNumero(umbral)}.`);
    const porReponer = productos.filter((p) => p.stock < umbral).length;
    const agotados = productos.filter((p) => p.stock === 0).length;
    const valorInventario = productos.reduce((suma, p) => suma + p.stock * p.precio, 0);
    paintStat(kpis.get('reponer') ?? null, formatNumero(porReponer));
    paintStat(kpis.get('agotados') ?? null, formatNumero(agotados));
    paintStat(kpis.get('valorizado') ?? null, formatCurrency(valorInventario));
  }

  // Categoría <select>: options derived from the cached catalog; the
  // cashier's in-progress selection survives a re-population when it still
  // exists (product-admin poblarCategorias pattern).
  function poblarCategorias(): void {
    if (!catFilter) return;
    const previa = catFilter.value;
    const nombres = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    );
    while (catFilter.options.length > 1) catFilter.remove(1);
    for (const nombre of nombres) {
      const option = document.createElement('option');
      option.value = nombre;
      setText(option, nombre);
      catFilter.append(option);
    }
    const existe = Array.from(catFilter.options).some((o) => o.value === previa);
    catFilter.value = existe ? previa : '';
    catFiltro = catFilter.value;
  }

  // Rows visible for the active filters: base = bajo bajo el umbral, then
  // search (shared pipeline) → categoría → chip, DEFAULT order = agotados
  // primero, luego stock ascendente (spec §9).
  function visibles(): Producto[] {
    const umbral = getAjustes().stock_alerta_min;
    let lista = productos.filter((p) => p.stock < umbral);
    if (busqueda) lista = buscarProductos(lista, busqueda);
    if (catFiltro) lista = lista.filter((p) => p.categoria === catFiltro);
    if (filtro === 'agotados') lista = lista.filter((p) => p.stock === 0);
    return [...lista].sort(
      (a, b) =>
        // agotados (clave 0) primero, luego el resto (clave 1)…
        Number(a.stock !== 0) - Number(b.stock !== 0) ||
        a.stock - b.stock ||
        a.nombre.localeCompare(b.nombre),
    );
  }

  function updatePagination(total: number, totalPaginas: number): void {
    if (!pagNav || !pagRange || !pagPrev || !pagNext) return;
    setHidden(pagNav, !hayDatos || totalPaginas <= 1);
    if (!hayDatos || total === 0) {
      setText(pagRange, '');
      return;
    }
    const desde = page * PAGE_SIZE + 1;
    const hasta = Math.min(total, (page + 1) * PAGE_SIZE);
    setText(pagRange, `${formatNumero(desde)}–${formatNumero(hasta)} de ${formatNumero(total)}`);
    pagPrev.disabled = page === 0;
    pagNext.disabled = page >= totalPaginas - 1;
  }

  function pintar(): void {
    pintarStats();
    const lista = visibles();

    const totalPaginas = Math.max(1, Math.ceil(lista.length / PAGE_SIZE));
    if (page > totalPaginas - 1) page = totalPaginas - 1;
    if (page < 0) page = 0;
    const pagina = lista.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (listEl && template) {
      qsa(listEl, '[data-stock-row]').forEach((row) => row.remove());
      for (const producto of pagina) {
        const row = paintRow(template, producto);
        if (row) listEl.append(row);
      }
      setHidden(listEl, !hayDatos || pagina.length === 0);
    }
    if (tbody && desktopTemplate) {
      qsa(tbody, '[data-stock-row]').forEach((row) => row.remove());
      for (const producto of pagina) {
        const row = paintRow(desktopTemplate, producto);
        if (row) tbody.append(row);
      }
    }
    // A header-only table is noise — hide the whole DataTable instead
    // (the mobile list already hides itself the same way).
    setHidden(tableWrap, !hayDatos || pagina.length === 0);
    updatePagination(lista.length, totalPaginas);

    const hayFiltroActivo = busqueda !== '' || catFiltro !== '' || filtro !== 'todos';
    setHidden(emptyOk, !(hayDatos && lista.length === 0 && !hayFiltroActivo));
    setHidden(emptyNoResults, !(hayDatos && lista.length === 0 && hayFiltroActivo));
    setHidden(emptyNoData, hayDatos);
  }

  // ── Filters: chips + categoría select + search (all local) ─────────────
  filtroWrap?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest<HTMLElement>('[data-stock-filter-value]');
    if (!chip || !filtroWrap.contains(chip)) return;
    const valor = chip.dataset.stockFilterValue;
    if (valor !== 'todos' && valor !== 'agotados') return;
    filtro = valor;
    page = 0;
    selectChip(filtroWrap, 'data-stock-filter-value', valor);
    pintar();
  });

  if (catFilter) {
    catFilter.addEventListener('change', () => {
      catFiltro = catFilter.value;
      page = 0;
      pintar();
    });
  }

  if (searchEl) {
    // Local-only, debounced — zero API calls in the handler; a new query
    // restarts at page 1 (same 200 ms debounce as the POS / admin search).
    searchEl.addEventListener(
      'input',
      debounce(() => {
        busqueda = normalizeSearchQuery(searchEl.value);
        page = 0;
        pintar();
      }, 200),
    );
  }

  // ── Pagination (client-side, catalog pattern) ──────────────────────────
  pagPrev?.addEventListener('click', () => {
    if (page > 0) {
      page -= 1;
      pintar();
    }
  });
  pagNext?.addEventListener('click', () => {
    page += 1;
    pintar(); // pintar() clamps past the last page
  });

  // ── Inline restock: LOCAL edits + explicit Guardar ─────────────────────

  // Saves are serialized screen-wide (never two writes racing); rows queued
  // while one is in flight are drained by the running flush.
  const pendientes = new Map<HTMLElement, HTMLInputElement>();
  let enVuelo = false;

  async function flush(): Promise<void> {
    if (enVuelo) return; // the in-flight flush drains anything queued behind it
    enVuelo = true;
    try {
      while (pendientes.size > 0) {
        const lote = [...pendientes.entries()];
        pendientes.clear();
        for (const [row, input] of lote) await guardarStock(row, input);
      }
    } finally {
      enVuelo = false;
    }
  }

  function solicitarGuardado(row: HTMLElement, input: HTMLInputElement): void {
    pendientes.set(row, input);
    void flush();
  }

  // network_failure is a transport condition (not an api_error.error code), handled first;
  // payload_invalido / accion_no_soportada delegate to the shared helper (D3).
  function mensajeDeError(status: string, error?: string): string {
    if (status === 'network_failure') return 'Sin conexión — no se pudo actualizar el stock.';
    return mensajeDeErrorApi(error ?? '', {
      payloadInvalido: 'Valor de stock inválido.',
      fallback: 'No se pudo actualizar el stock. Intenta de nuevo.',
    });
  }

  async function guardarStock(row: HTMLElement, input: HTMLInputElement): Promise<void> {
    const id = row.dataset.productId;
    const guardado = Number(row.dataset.stockActual ?? input.value);
    const valor = clampStock(Number(input.value));
    input.value = String(valor); // normalize what the user sees

    if (!id || !Number.isFinite(guardado) || valor === guardado) {
      actualizarBotonGuardar(row, input); // nothing dirty after all
      return;
    }

    const res = await actualizarProducto({ id, stock: valor });

    if (res.status === 'success') {
      row.dataset.stockActual = String(valor);
      pintarTags(row, valor); // truthfulness over the D2 stay-visible rule
      actualizarBotonGuardar(row, input);
      // Patch memory + catalogo_cache with the server-confirmed number
      // (G5: POS and the sidebar badge see it without an extra GET).
      productos = productos.map((p) => (p.id === id ? { ...p, stock: valor } : p));
      const cached = getCatalogoCache();
      if (cached) {
        setCatalogoCache({
          productos: cached.productos.map((p) => (p.id === id ? { ...p, stock: valor } : p)),
          timestamp: cached.timestamp,
        });
      }
      pintarStats();
      feedback.ok('Stock actualizado'); // toast + hide any stale error Alert
    } else {
      // Revert to the last server-known value so the screen never lies.
      input.value = String(guardado);
      actualizarBotonGuardar(row, input);
      feedback.error(mensajeDeError(res.status, res.status === 'api_error' ? res.error : undefined));
    }
  }

  function aplicarPaso(btn: HTMLElement, delta: number): void {
    const row = btn.closest<HTMLElement>('[data-stock-row]');
    const input = row ? qs<HTMLInputElement>(row, '[data-stock-input]') : null;
    if (!row || !input) return;
    // LOCAL only — nothing is written until Guardar.
    input.value = String(clampStock(Number(input.value) + delta));
    actualizarBotonGuardar(row, input);
  }

  // ONE delegated listener covers refresh + EVERY row control across BOTH
  // templates (± steps, Guardar, the EmptyState "Reintentar" trigger).
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('[data-stock-refresh]')) {
      void refreshFromApi(getCatalogoCache());
      return;
    }

    const stepBtn = target.closest<HTMLElement>('[data-stock-step]');
    if (stepBtn && root.contains(stepBtn)) {
      const delta = Number(stepBtn.dataset.stockStep);
      if (Number.isFinite(delta)) aplicarPaso(stepBtn, delta);
      return;
    }

    const saveBtn = target.closest<HTMLElement>('[data-stock-save]');
    if (saveBtn && root.contains(saveBtn)) {
      const row = saveBtn.closest<HTMLElement>('[data-stock-row]');
      const input = row ? qs<HTMLInputElement>(row, '[data-stock-input]') : null;
      if (row && input) solicitarGuardado(row, input);
    }
  });

  // Typing: clamp on blur/commit and recompute the Guardar dirty state —
  // the value is NOT written (owner request: explicit save only).
  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const input = target.closest<HTMLInputElement>('[data-stock-input]');
    if (!input || !root.contains(input)) return;
    const row = input.closest<HTMLElement>('[data-stock-row]');
    if (!row) return;
    input.value = String(clampStock(Number(input.value)));
    actualizarBotonGuardar(row, input);
  });

  // Enter on the stepper input = save (keyboard parity with the button).
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const input = target.closest<HTMLInputElement>('[data-stock-input]');
    if (!input || !root.contains(input)) return;
    event.preventDefault();
    const row = input.closest<HTMLElement>('[data-stock-row]');
    if (!row) return;
    input.value = String(clampStock(Number(input.value)));
    actualizarBotonGuardar(row, input);
    solicitarGuardado(row, input); // no-op inside guardarStock when not dirty
  });

  // Freshness stamp: ALWAYS shown when a timestamp exists (spec §9) —
  // muted while fresh, warning node once the cache is ≥ TTL old.
  function setStale(timestamp: number | null): void {
    if (!staleBox || !staleText) return;
    if (timestamp === null) {
      setHidden(staleBox, true);
      return;
    }
    const minutos = minutosDesde(timestamp);
    const texto = `Catálogo actualizado hace ${formatNumero(minutos)} min`;
    const viejo = Date.now() - timestamp >= TTL_CATALOGO_MS;
    if (viejo && staleWarn) {
      setText(staleText, '');
      setText(staleWarn, texto);
      setHidden(staleWarn, false);
    } else {
      setHidden(staleWarn, true);
      setText(staleText, texto);
    }
    setHidden(staleBox, false);
  }

  async function refreshFromApi(previous: CatalogoCache | null): Promise<void> {
    const ok = await refreshCatalogoFromApi();
    if (ok) {
      const fresh = getCatalogoCache();
      if (fresh) {
        productos = fresh.productos;
        hayDatos = true;
        poblarCategorias(); // refresh re-populates the categoría options
        pintar();
        setStale(fresh.timestamp); // recien sincronizado → nodo muted
      }
      return;
    }
    // Failure (offline or server): keep whatever we have — never block
    // (base.md §6). The stamp shows the age of the data we DID paint (warn
    // node when ≥ TTL); no data at all stays on "stock-nodata".
    if (previous && previous.productos.length > 0) setStale(previous.timestamp);
  }

  async function init(): Promise<void> {
    const cached = getCatalogoCache();
    const hasData = cached !== null && cached.productos.length > 0;
    const fresh = hasData && Date.now() - cached.timestamp < TTL_CATALOGO_MS;

    productos = hasData && cached ? cached.productos : [];
    hayDatos = hasData;
    poblarCategorias();
    pintar();

    if (!hasData || fresh) {
      // Fresh cache → show the stamp too (siempre visible, spec §9).
      if (fresh && cached) setStale(cached.timestamp);
      if (!hasData) await refreshFromApi(cached);
      return;
    }
    await refreshFromApi(cached);
  }

  void init();
}
