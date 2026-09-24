// Low-stock panel runtime (plan-stock.md Fase 2 + plan-reponer-buscar.md
// Fase 1 + refactorUI §9 / plan T3.8) — paints the KPI trio (Por reponer ·
// Agotados · Inventario valorizado), filters/sorts the rows through the
// chips, and ONE row per product with `stock < ajustes.stock_alerta_min`
// (default 5). Each row carries an INLINE restock stepper: optimistic
// ±/input/batch, debounced save via actualizarProducto.
//
// Rules honored here:
//   - Restock writes reuse the existing §4.10 contract
//     (`actualizarProducto({ id, stock })` — validates + clamps server-side)
//     through api/actions; no new backend. Failure → revert to the last
//     saved value + Alert (same policy as the product form: no offline
//     queue for edits).
//   - Network only via api/actions/productos.ts, cache-first with the same
//     freshness policy as islands/catalog.ts (base.md §6): fresh cache → no
//     request; stale → paint, then try to refresh; failure keeps the data.
//   - On a successful restock the in-memory list AND `catalogo_cache` are
//     patched locally (patrón G5 del admin) so POS + sidebar badge see the
//     new number on the next paint/navigation without an extra GET.
//   - Rows never repaint on save (would clobber a focused input); only the
//     KPIs and the row's own tags refresh. A row that crossed the threshold
//     stays visible until reload — plan-reponer-buscar D2.
//   - Filter chips (spec §9): todos (DEFAULT order = agotados primero,
//     luego stock ascendente) · solo agotados · por categoría. Sorting only
//     reorders/rebuilds rows — no focus is inside them while filtering.
//   - "Actualizado hace N min" is ALWAYS visible next to Actualizar when a
//     cache exists; stale (age ≥ TTL_CATALOGO_MS) swaps to the warning node.
//   - data-* hooks only, text via textContent; no fixed ids (astrobase §3.4).

import { actualizarProducto, obtenerProductos } from '../../api/actions/productos';
import { formatCurrency, formatNumero } from '../../utils/format';
import {
  getAjustes,
  getCatalogoCache,
  setCatalogoCache,
  TTL_CATALOGO_MS,
  type CatalogoCache,
  type Producto,
} from '../../utils/storage';

const root = document.querySelector<HTMLElement>('[data-stock-root]');

if (root) {
  const listEl = root.querySelector<HTMLElement>('[data-stock-list]');
  const template = root.querySelector<HTMLTemplateElement>('[data-stock-row-template]');
  const umbralEl = root.querySelector<HTMLElement>('[data-stock-umbral]');
  const staleBox = root.querySelector<HTMLElement>('[data-stock-stale]');
  const staleText = root.querySelector<HTMLElement>('[data-stock-stale-text]');
  const staleWarn = root.querySelector<HTMLElement>('[data-stock-stale-warn]');
  const warningAlert = root.querySelector<HTMLElement>('[data-alert="stock-warning"]');
  const warningText = root.querySelector<HTMLElement>('[data-stock-warning-text]');
  const emptyOk = root.querySelector<HTMLElement>('[data-empty-state="stock-ok"]');
  const emptyNoData = root.querySelector<HTMLElement>('[data-empty-state="stock-nodata"]');
  const filtroWrap = root.querySelector<HTMLElement>('[data-stock-filter]');

  // KPI cards keyed by data-stock-kpi (reponer | agotados | valorizado).
  const kpis = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-stock-kpi]').forEach((card) => {
    const key = card.dataset.stockKpi;
    if (key) kpis.set(key, card);
  });

  let productos: Producto[] = [];
  let hayDatos = false;
  let filtro: 'todos' | 'agotados' | 'categoria' = 'todos';

  const STOCK_MIN = 0;
  const STOCK_MAX = 9999;
  const DEBOUNCE_MS = 500;

  function clampStock(valor: number): number {
    if (!Number.isFinite(valor)) return STOCK_MIN;
    return Math.max(STOCK_MIN, Math.min(STOCK_MAX, Math.round(valor)));
  }

  function pintarStat(key: string, valor: string): void {
    const valueEl = kpis.get(key)?.querySelector<HTMLElement>('[data-stat-value]');
    if (valueEl) valueEl.textContent = valor;
  }

  function mostrarErrorStock(mensaje: string): void {
    if (warningText) warningText.textContent = mensaje;
    if (warningAlert) warningAlert.hidden = false;
  }

  function ocultarErrorStock(): void {
    if (warningAlert) warningAlert.hidden = true;
  }

  function pintarTags(node: HTMLElement, stock: number): void {
    const umbral = getAjustes().stock_alerta_min;
    const agotado = node.querySelector<HTMLElement>('[data-stock-agotado]');
    const bajo = node.querySelector<HTMLElement>('[data-stock-bajo]');
    if (agotado) agotado.hidden = stock !== 0;
    if (bajo) {
      bajo.hidden = !(stock > 0 && stock < umbral);
      bajo.title = `Menos de ${formatNumero(umbral)} unidades`; // "con umbral" (spec §9)
    }
  }

  function paintRow(producto: Producto): HTMLElement | null {
    if (!template) return null;
    const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
    if (!node) return null;

    node.dataset.productId = producto.id;
    node.dataset.stockActual = String(producto.stock);

    const nombre = node.querySelector<HTMLElement>('[data-stock-nombre]');
    const categoria = node.querySelector<HTMLElement>('[data-stock-categoria]');
    const precio = node.querySelector<HTMLElement>('[data-stock-precio]');
    const input = node.querySelector<HTMLInputElement>('[data-stock-input]');

    if (nombre) nombre.textContent = producto.nombre;
    if (categoria) categoria.textContent = producto.categoria;
    if (precio) precio.textContent = formatCurrency(producto.precio);
    if (input) {
      input.value = String(producto.stock);
      // No fixed ids: the accessible name carries the product (astrobase §3.4).
      input.setAttribute('aria-label', `Stock de ${producto.nombre}`);
    }
    pintarTags(node, producto.stock);
    return node;
  }

  // KPIs only — deliberately does NOT touch the rows: repainting rows would
  // clobber the focused stepper input mid-repostock (plan-reponer-buscar D2).
  function pintarStats(): void {
    const umbral = getAjustes().stock_alerta_min;
    if (umbralEl) {
      umbralEl.textContent = `Mostrando productos con stock menor a ${formatNumero(umbral)}.`;
    }
    const porReponer = productos.filter((p) => p.stock < umbral).length;
    const agotados = productos.filter((p) => p.stock === 0).length;
    const valorInventario = productos.reduce((suma, p) => suma + p.stock * p.precio, 0);
    pintarStat('reponer', formatNumero(porReponer));
    pintarStat('agotados', formatNumero(agotados));
    pintarStat('valorizado', formatCurrency(valorInventario));
  }

  // Rows visible for the active chip: base = bajo bajo el umbral; the
  // DEFAULT order puts agotados first, then stock ascending (spec §9).
  function visibles(): Producto[] {
    const umbral = getAjustes().stock_alerta_min;
    const bajos = productos.filter((p) => p.stock < umbral);
    if (filtro === 'agotados') return bajos.filter((p) => p.stock === 0);
    if (filtro === 'categoria') {
      return [...bajos].sort(
        (a, b) =>
          a.categoria.localeCompare(b.categoria) ||
          a.stock - b.stock ||
          a.nombre.localeCompare(b.nombre),
      );
    }
    return [...bajos].sort(
      (a, b) =>
        // agotados (clave 0) primero, luego el resto (clave 1)…
        Number(a.stock !== 0) - Number(b.stock !== 0) ||
        a.stock - b.stock ||
        a.nombre.localeCompare(b.nombre),
    );
  }

  function pintar(): void {
    pintarStats();
    const lista = visibles();

    if (listEl && template) {
      listEl.querySelectorAll('[data-stock-row]').forEach((row) => row.remove());
      for (const producto of lista) {
        const row = paintRow(producto);
        if (row) listEl.append(row);
      }
      listEl.hidden = !hayDatos || lista.length === 0;
    }
    if (emptyOk) emptyOk.hidden = !(hayDatos && lista.length === 0);
    if (emptyNoData) emptyNoData.hidden = hayDatos;
  }

  // ── Filter chips (spec §9) ─────────────────────────────────────────────
  filtroWrap?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chip = target.closest<HTMLElement>('[data-stock-filter-value]');
    if (!chip || !filtroWrap.contains(chip)) return;
    const valor = chip.dataset.stockFilterValue;
    if (valor !== 'todos' && valor !== 'agotados' && valor !== 'categoria') return;
    filtro = valor;
    // aria-pressed travels with static classes at markup time (Chip styles
    // it); runtime state = that attribute only (§0.4).
    filtroWrap.querySelectorAll<HTMLElement>('[data-stock-filter-value]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el === chip));
    });
    pintar();
  });

  // ── Inline restock (plan-reponer-buscar.md Fase 1) ─────────────────────

  // Pending rows keyed by node so a quick ± on DIFFERENT rows never drops
  // an earlier edit; a single timer flushes the whole batch (500 ms).
  const pendientes = new Map<HTMLElement, HTMLInputElement>();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let enVuelo = false;

  function programarGuardado(row: HTMLElement, input: HTMLInputElement): void {
    pendientes.set(row, input);
    clearTimeout(debounce);
    debounce = setTimeout(() => void flush(), DEBOUNCE_MS);
  }

  async function flush(): Promise<void> {
    if (enVuelo) return; // the in-flight save re-schedules (see guardarStock)
    const lote = [...pendientes.entries()];
    pendientes.clear();
    for (const [row, input] of lote) {
      await guardarStock(row, input);
    }
  }

  function mensajeDeError(status: string, error?: string): string {
    if (status === 'network_failure') return 'Sin conexión — no se pudo actualizar el stock.';
    if (error === 'payload_invalido') return 'Valor de stock inválido.';
    if (error === 'accion_no_soportada') {
      return 'El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script.';
    }
    // unauthorized never lands here: api/client.ts expira la sesión y
    // redirige a /login por su cuenta.
    return 'No se pudo actualizar el stock. Intentá de nuevo.';
  }

  async function guardarStock(row: HTMLElement, input: HTMLInputElement): Promise<void> {
    const id = row.dataset.productId;
    const guardado = Number(row.dataset.stockActual ?? input.value);
    const valor = clampStock(Number(input.value));
    input.value = String(valor); // normalize what the user sees

    if (!id || !Number.isFinite(guardado) || valor === guardado) return; // no-op

    if (enVuelo) {
      // Serialize: re-queue this row and try again once the current call
      // settles — never two writes racing on the same screen.
      pendientes.set(row, input);
      debounce = setTimeout(() => void flush(), DEBOUNCE_MS);
      return;
    }

    enVuelo = true;
    const res = await actualizarProducto({ id, stock: valor });
    enVuelo = false;

    if (res.status === 'success') {
      row.dataset.stockActual = String(valor);
      pintarTags(row, valor); // truthfulness over the D2 stay-visible rule
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
      ocultarErrorStock();
    } else {
      // Revert to the last server-known value so the screen never lies.
      input.value = String(guardado);
      mostrarErrorStock(mensajeDeError(res.status, res.status === 'api_error' ? res.error : undefined));
    }

    // Work queued while this save was in flight → keep going.
    if (pendientes.size > 0 && !enVuelo) {
      clearTimeout(debounce);
      debounce = setTimeout(() => void flush(), DEBOUNCE_MS);
    }
  }

  // Delegated on the list: one listener covers every row and EVERY step
  // button (−1, +1, +5, +10, +24 — batch sizes configured in markup).
  listEl?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-stock-step]');
    if (!btn || !listEl.contains(btn)) return;
    const row = btn.closest<HTMLElement>('[data-stock-row]');
    const input = row?.querySelector<HTMLInputElement>('[data-stock-input]');
    if (!row || !input) return;
    const delta = Number(btn.dataset.stockStep);
    if (!Number.isFinite(delta)) return;
    const siguiente = clampStock(Number(input.value) + delta);
    if (siguiente === Number(input.value)) return; // already at 0 / max
    input.value = String(siguiente);
    programarGuardado(row, input);
  });

  // Typing: save on change (blur/Enter) — big restocks in ONE call.
  listEl?.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    const input = target.closest<HTMLInputElement>('[data-stock-input]');
    if (!input || !listEl.contains(input)) return;
    const row = input.closest<HTMLElement>('[data-stock-row]');
    if (!row) return;
    const valor = clampStock(Number(input.value));
    input.value = String(valor);
    programarGuardado(row, input);
  });

  // Freshness stamp: ALWAYS shown when a timestamp exists (spec §9) —
  // muted while fresh, warning node once the cache is ≥ TTL old.
  function setStale(timestamp: number | null): void {
    if (!staleBox || !staleText) return;
    if (timestamp === null) {
      staleBox.hidden = true;
      return;
    }
    const minutos = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
    const texto = `Catálogo actualizado hace ${formatNumero(minutos)} min`;
    const viejo = Date.now() - timestamp >= TTL_CATALOGO_MS;
    if (viejo && staleWarn) {
      staleText.textContent = '';
      staleWarn.textContent = texto;
      staleWarn.hidden = false;
    } else {
      if (staleWarn) staleWarn.hidden = true;
      staleText.textContent = texto;
    }
    staleBox.hidden = false;
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
      productos = next.productos;
      hayDatos = true;
      pintar();
      setStale(next.timestamp); // recién sincronizado → nodo muted
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
    pintar();

    if (!hasData || fresh) {
      // Fresh cache → show the stamp too (siempre visible, spec §9).
      if (fresh && cached) setStale(cached.timestamp);
      if (!hasData) await refreshFromApi(cached);
      return;
    }
    await refreshFromApi(cached);
  }

  // Delegated: BOTH "Actualizar" and the EmptyState "Reintentar" carry
  // [data-stock-refresh] — one listener covers the two triggers.
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-stock-refresh]')) {
      void refreshFromApi(getCatalogoCache());
    }
  });

  void init();
}
