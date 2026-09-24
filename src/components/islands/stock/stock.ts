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
//     freshness policy as islands/catalog/catalog.ts (base.md §6): fresh cache → no
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
import { qs, qsa, setText, setHidden, cloneTemplate, selectChip, paintStat, delegateAction } from '../../../utils/dom';
import { crearFeedback } from '../../../utils/feedback';
import { minutosDesde, refreshCatalogoFromApi } from '../../../utils/catalog-cache';
import { mensajeDeErrorApi } from '../../../utils/api-result';

const root = qs<HTMLElement>(document, '[data-stock-root]');

if (root) {
  const listEl = qs<HTMLElement>(root, '[data-stock-list]');
  const template = qs<HTMLTemplateElement>(root, '[data-stock-row-template]');
  const umbralEl = qs<HTMLElement>(root, '[data-stock-umbral]');
  const staleBox = qs<HTMLElement>(root, '[data-stock-stale]');
  const staleText = qs<HTMLElement>(root, '[data-stock-stale-text]');
  const staleWarn = qs<HTMLElement>(root, '[data-stock-stale-warn]');
  const warningAlert = qs<HTMLElement>(root, '[data-alert="stock-warning"]');
  const warningText = qs<HTMLElement>(root, '[data-stock-warning-text]');
  const emptyOk = qs<HTMLElement>(root, '[data-empty-state="stock-ok"]');
  const emptyNoData = qs<HTMLElement>(root, '[data-empty-state="stock-nodata"]');
  const filtroWrap = qs<HTMLElement>(root, '[data-stock-filter]');

  // KPI cards keyed by data-stock-kpi (reponer | agotados | valorizado).
  const kpis = new Map<string, HTMLElement>();
  qsa<HTMLElement>(root, '[data-stock-kpi]').forEach((card) => {
    const key = card.dataset.stockKpi;
    if (key) kpis.set(key, card);
  });

  const feedback = crearFeedback(warningAlert, warningText);

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

  function paintRow(producto: Producto): HTMLElement | null {
    const node = cloneTemplate(template);
    if (!node) return null;

    node.dataset.productId = producto.id;
    node.dataset.stockActual = String(producto.stock);

    const nombre = qs<HTMLElement>(node, '[data-stock-nombre]');
    const categoria = qs<HTMLElement>(node, '[data-stock-categoria]');
    const precio = qs<HTMLElement>(node, '[data-stock-precio]');
    const input = qs<HTMLInputElement>(node, '[data-stock-input]');

    setText(nombre, producto.nombre);
    setText(categoria, producto.categoria);
    setText(precio, formatCurrency(producto.precio));
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
    setText(umbralEl, `Mostrando productos con stock menor a ${formatNumero(umbral)}.`);
    const porReponer = productos.filter((p) => p.stock < umbral).length;
    const agotados = productos.filter((p) => p.stock === 0).length;
    const valorInventario = productos.reduce((suma, p) => suma + p.stock * p.precio, 0);
    paintStat(kpis.get('reponer') ?? null, formatNumero(porReponer));
    paintStat(kpis.get('agotados') ?? null, formatNumero(agotados));
    paintStat(kpis.get('valorizado') ?? null, formatCurrency(valorInventario));
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
      qsa(listEl, '[data-stock-row]').forEach((row) => row.remove());
      for (const producto of lista) {
        const row = paintRow(producto);
        if (row) listEl.append(row);
      }
      setHidden(listEl, !hayDatos || lista.length === 0);
    }
    setHidden(emptyOk, !(hayDatos && lista.length === 0));
    setHidden(emptyNoData, hayDatos);
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
    selectChip(filtroWrap, 'data-stock-filter-value', valor);
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

  // network_failure is a transport condition (not an api_error.error code), handled first;
  // payload_invalido / accion_no_soportada delegate to the shared helper (D3).
  function mensajeDeError(status: string, error?: string): string {
    if (status === 'network_failure') return 'Sin conexión — no se pudo actualizar el stock.';
    return mensajeDeErrorApi(error ?? '', {
      payloadInvalido: 'Valor de stock inválido.',
      fallback: 'No se pudo actualizar el stock. Intentá de nuevo.',
    });
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
      feedback.ocultar();
    } else {
      // Revert to the last server-known value so the screen never lies.
      input.value = String(guardado);
      feedback.error(mensajeDeError(res.status, res.status === 'api_error' ? res.error : undefined));
    }

    // Work queued while this save was in flight → keep going.
    if (pendientes.size > 0 && !enVuelo) {
      clearTimeout(debounce);
      debounce = setTimeout(() => void flush(), DEBOUNCE_MS);
    }
  }

  function aplicarPaso(btn: HTMLElement, delta: number): void {
    const row = btn.closest<HTMLElement>('[data-stock-row]');
    const input = qs<HTMLInputElement>(row, '[data-stock-input]');
    if (!row || !input) return;
    const siguiente = clampStock(Number(input.value) + delta);
    if (siguiente === Number(input.value)) return; // already at 0 / max
    input.value = String(siguiente);
    programarGuardado(row, input);
  }

  // Delegated on the list: one listener covers every row and EVERY step
  // button (−1, +1, +5, +10, +24 — batch sizes configured in markup).
  delegateAction(
    listEl,
    'click',
    'data-stock-step',
    new Proxy(
      {
        '-1': (btn) => aplicarPaso(btn, -1),
        '1': (btn) => aplicarPaso(btn, 1),
        '5': (btn) => aplicarPaso(btn, 5),
        '10': (btn) => aplicarPaso(btn, 10),
        '24': (btn) => aplicarPaso(btn, 24),
      },
      {
        get: (target, prop: string) => {
          if (prop in target) return target[prop as keyof typeof target];
          const delta = Number(prop);
          return Number.isFinite(delta) ? (btn: HTMLElement) => aplicarPaso(btn, delta) : undefined;
        },
      },
    ),
  );

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
