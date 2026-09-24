// Paints /historial from historial_ventas — 100% local, ZERO API calls
// (plan-features Fase 5 gate; base.md §7 "del propio dispositivo"). The
// date filter compares each venta's DEVICE-LOCAL calendar day (not UTC —
// toISOString would shift sales across days) against the Desde/Hasta inputs
// and runs BEFORE grouping (plan-mejoras-2 Fase 3). Days render as native
// <details> groups: summary = fecha larga "Mié 23 sep" + "N ventas" + método
// en pill + total del día tabular + desglose por método en TEXTO (never color
// alone — stilesbase §5.2). Only TODAY'S group starts open, and only on the
// FIRST paint — later re-renders leave groups as the filter left them.
// Each venta row links to the static detail page /historial/venta/?id=
// (gotcha G1 — no getStaticPaths per venta).
//
// T3.4/T3.5 additions (refactorUI §6.1):
//   - KPI strip [data-hist-kpis] recalculated on every filter, hidden ⇔
//     historial vacío.
//   - Rango chips [data-range-value]: presets rewrite Desde/Hasta; the date
//     inputs show <md only in Personalizado, always ≥md (matchMedia — the
//     base [hidden]{display:none!important} rule beats breakpoint classes,
//     so visibility must be runtime state).
//   - Búsqueda local [data-hist-search] debounced 200 ms over
//     id_venta + método + nombres de items.
//   - Sync pill por línea [data-hist-sync]: three StatusPills toggled by
//     `hidden`, estado from cola_sync matched by payload.id_venta.
//   - Dual templates (li <md + tr ≥md) painted by ONE shared paintLine().
// Template cloning like catalog/cart: no fixed ids, everything scoped to
// data-attribute hooks inside [data-historial-root].

import { round2, totalesDelDia } from '../../../utils/caja';
import { formatCurrency, formatDiaResumen, formatHora, localDayKey } from '../../../utils/format';
import { topProductosDelDia } from '../../../utils/reportes';
import { getCajas, getColaSync, getHistorialVentas, type CajaLocal, type MetodoPago, type VentaLocal } from '../../../utils/storage';
import { qs, qsa, setText, setHidden, cloneTemplate, setPillState, selectChip, paintStat, debounce, delegateAction } from '../../../utils/dom';
import { esDesktop, enCambioDesktop } from '../../../utils/media';
import { METODO_LABEL, METODOS } from '../../../utils/metodos';

const root = qs<HTMLElement>(document, '[data-historial-root]');

if (root) {
  const daysEl = qs<HTMLElement>(root, '[data-hist-days]');
  const dayTemplate = qs<HTMLTemplateElement>(root, '[data-hist-day-template]');
  const lineTemplate = qs<HTMLTemplateElement>(root, '[data-hist-line-template]');
  const lineDesktopTemplate = qs<HTMLTemplateElement>(root, '[data-hist-line-desktop-template]');
  const fromInput = qs<HTMLInputElement>(root, '[data-hist-from]');
  const toInput = qs<HTMLInputElement>(root, '[data-hist-to]');
  const searchInput = qs<HTMLInputElement>(root, '[data-hist-search]');
  const datesWrap = qs<HTMLElement>(root, '[data-hist-dates]');
  const kpisEl = qs<HTMLElement>(root, '[data-hist-kpis]');
  const rangeGroup = qs<HTMLElement>(root, '[data-hist-range]');
  const emptyEl = qs<HTMLElement>(root, '[data-empty-state="empty-historial"]');
  const noResultsEl = qs<HTMLElement>(root, '[data-empty-state="no-date-results"]');

  type Rango = 'hoy' | 'ayer' | '7d' | 'mes' | 'personalizado';
  type EstadoSync = 'sincronizada' | 'pendiente' | 'error';

  let rango: Rango = 'personalizado';
  let busqueda = '';

  // First paint opens today's group; later re-renders (filter changes) leave
  // every group closed (plan: "open solo para el día de hoy en el primer
  // pintado").
  let primeraVez = true;

  // ── Rango presets (T3.4) ─────────────────────────────────────────────
  function rangoFechas(r: Rango): { from: string; to: string } | null {
    const hoy = new Date();
    if (r === 'hoy') {
      const k = localDayKey(hoy);
      return { from: k, to: k };
    }
    if (r === 'ayer') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const k = localDayKey(d);
      return { from: k, to: k };
    }
    if (r === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { from: localDayKey(d), to: localDayKey(hoy) };
    }
    if (r === 'mes') {
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      return { from: `${hoy.getFullYear()}-${mes}-01`, to: localDayKey(hoy) };
    }
    return null; // personalizado: inputs stay under user control
  }

  function pintarChips(): void {
    selectChip(rangeGroup, 'data-range-value', rango);
  }

  function aplicarRango(): void {
    const fechas = rangoFechas(rango);
    if (fechas && fromInput && toInput) {
      fromInput.value = fechas.from;
      toInput.value = fechas.to;
    }
    // Spec §6.1: Desde/Hasta visibles solo en Personalizado <md; siempre ≥md.
    setHidden(datesWrap, !(rango === 'personalizado' || esDesktop()));
  }

  // ── Sync state (T3.4): cola_sync → strongest estado per id_venta ────
  function estadoSyncMap(): Map<string, EstadoSync> {
    const mapa = new Map<string, EstadoSync>();
    for (const item of getColaSync()) {
      if (item.tipo !== 'registrarVenta') continue;
      const idVenta = item.payload.id_venta;
      if (typeof idVenta !== 'string') continue;
      const estado: EstadoSync =
        item.estado === 'error_permanente' ? 'error' : item.estado === 'sincronizado' ? 'sincronizada' : 'pendiente';
      const previo = mapa.get(idVenta);
      if (previo === 'error') continue;
      if (previo === 'pendiente' && estado === 'sincronizada') continue;
      mapa.set(idVenta, estado);
    }
    return mapa;
  }

  function metodoMasUsado(ventas: VentaLocal[]): MetodoPago | null {
    const conteo = new Map<MetodoPago, number>();
    for (const venta of ventas) conteo.set(venta.metodo_pago, (conteo.get(venta.metodo_pago) ?? 0) + 1);
    let mejor: MetodoPago | null = null;
    for (const [metodo, cantidad] of conteo) {
      if (!mejor || cantidad > (conteo.get(mejor) ?? 0)) mejor = metodo;
    }
    return mejor;
  }

  function visible(ventas: VentaLocal[]): VentaLocal[] {
    const from = fromInput?.value ?? '';
    const to = toInput?.value ?? '';
    const texto = busqueda;
    return ventas.filter((venta) => {
      const day = localDayKey(venta.fecha_hora);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (texto) {
        const haystack =
          `${venta.id_venta} ${METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago} ` +
          venta.items.map((item) => item.nombre).join(' ');
        if (!haystack.toLowerCase().includes(texto)) return false;
      }
      return true;
    });
  }

  // KPI strip (T3.4): values always reflect the CURRENT filter; visibility
  // reflects the whole historial (empty historial → nothing to summarize).
  function pintarKpis(ventasFiltradas: VentaLocal[], historialVacio: boolean): void {
    if (!kpisEl) return;
    setHidden(kpisEl, historialVacio);
    if (historialVacio) return;
    const n = ventasFiltradas.length;
    const total = ventasFiltradas.reduce((suma, venta) => suma + venta.total, 0);
    paintStat(qs<HTMLElement>(kpisEl, '[data-hist-kpi="ventas"]'), String(n));
    paintStat(qs<HTMLElement>(kpisEl, '[data-hist-kpi="total"]'), formatCurrency(total));
    paintStat(qs<HTMLElement>(kpisEl, '[data-hist-kpi="promedio"]'), n > 0 ? formatCurrency(total / n) : formatCurrency(0));
    const mejor = metodoMasUsado(ventasFiltradas);
    paintStat(qs<HTMLElement>(kpisEl, '[data-hist-kpi="metodo"]'), mejor ? METODO_LABEL[mejor] : '—');
  }

  // Caja del día card copy (plan-mejoras-2 Fase 4) — text-only, plan order:
  // "Apertura S/ X · Cierre S/ X · Ventas efectivo S/ Y · Diferencia S/ Z".
  // CLOSED sessions render their snapshot as-is (never recalculated, G9);
  // an OPEN session has no close snapshot yet, so Cierre/Diferencia wait and
  // efectivo comes live from the local historial of that day.
  function textoCaja(caja: CajaLocal): string {
    const partes = [`Apertura ${formatCurrency(caja.monto_apertura)}`];
    if (typeof caja.conteo_cierre === 'number') {
      partes.push(`Cierre ${formatCurrency(caja.conteo_cierre)}`);
    }
    const efectivo =
      typeof caja.efectivo_ventas === 'number'
        ? caja.efectivo_ventas
        : totalesDelDia(caja.fecha_dia).efectivo_ventas;
    partes.push(`Ventas efectivo ${formatCurrency(round2(efectivo))}`);
    if (typeof caja.diferencia === 'number') {
      partes.push(`Diferencia ${formatCurrency(caja.diferencia)}`);
    }
    return partes.join(' · ');
  }

  // Shared paint for BOTH templates (mobile li + desktop tr, T3.5): same
  // data hooks, one source of truth for row content + sync pill visibility.
  function paintLine(linea: HTMLElement, venta: VentaLocal, estados: Map<string, EstadoSync>): void {
    const hora = qs<HTMLElement>(linea, '[data-hist-hora]');
    const metodo = qs<HTMLElement>(linea, '[data-hist-metodo]');
    const items = qs<HTMLElement>(linea, '[data-hist-items]');
    const total = qs<HTMLElement>(linea, '[data-hist-total]');
    const link = qs<HTMLAnchorElement>(linea, '[data-hist-link]');

    setText(hora, formatHora(venta.fecha_hora));
    setText(metodo, METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago);
    const unidades = venta.items.reduce((suma, item) => suma + item.cantidad, 0);
    setText(items, `${unidades} ${unidades === 1 ? 'producto' : 'productos'}`);
    setText(total, formatCurrency(venta.total));
    if (link) link.href = `/historial/venta/?id=${encodeURIComponent(venta.id_venta)}`;

    const estado = estados.get(venta.id_venta) ?? 'sincronizada';
    setPillState(linea, 'data-hist-sync-state', estado);
  }

  function render(): void {
    if (!daysEl || !dayTemplate || !lineTemplate) return;
    const all = getHistorialVentas();
    const list = visible(all); // filter FIRST, then group

    // Group by device-local day (G2 — never UTC), newest day first.
    const porDia = new Map<string, VentaLocal[]>();
    for (const venta of list) {
      const dia = localDayKey(venta.fecha_hora);
      const grupo = porDia.get(dia);
      if (grupo) grupo.push(venta);
      else porDia.set(dia, [venta]);
    }
    const dias = [...porDia.keys()].sort().reverse();
    const hoy = localDayKey(new Date());
    // One read for the whole render — the card matches by fecha_dia (the
    // newest session of that day wins: setCajas prepends on apertura) and
    // the sync pills match by payload.id_venta (T3.4).
    const cajas = getCajas();
    const estados = estadoSyncMap();

    qsa(daysEl, '[data-hist-day]').forEach((day) => day.remove());

    for (const dia of dias) {
      const ventas = porDia.get(dia) ?? [];
      const day = cloneTemplate(dayTemplate);
      if (!day) continue;

      const diaEl = qs<HTMLElement>(day, '[data-hist-dia]');
      const nEl = qs<HTMLElement>(day, '[data-hist-n]');
      const totalEl = qs<HTMLElement>(day, '[data-hist-total]');
      const desgloseEl = qs<HTMLElement>(day, '[data-hist-desglose]');
      const metodoPill = qs<HTMLElement>(day, '[data-hist-metodo-pill]');
      const metodoPillTexto = qs<HTMLElement>(day, '[data-hist-metodo-pill-texto]');
      const topEl = qs<HTMLElement>(day, '[data-hist-top]');
      const topTextoEl = qs<HTMLElement>(day, '[data-hist-top-texto]');
      const cajaEl = qs<HTMLElement>(day, '[data-hist-caja]');
      const cajaTextoEl = qs<HTMLElement>(day, '[data-hist-caja-texto]');
      const linesUl = qs<HTMLElement>(day, '[data-hist-lines]');
      const tbody = qs<HTMLElement>(day, 'tbody'); // DataTable ≥md (T3.5)

      const totalDia = ventas.reduce((suma, v) => suma + v.total, 0);
      setText(diaEl, formatDiaResumen(dia)); // "Mié 23 sep" (T3.5)
      setText(nEl, `${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}`);
      setText(totalEl, formatCurrency(totalDia));
      if (desgloseEl) {
        // Per-method breakdown in TEXT — only methods with movement, the
        // words carry the meaning (§5.2: never color alone).
        setText(
          desgloseEl,
          METODOS.map((metodo) => {
            const total = ventas
              .filter((v) => v.metodo_pago === metodo)
              .reduce((suma, v) => suma + v.total, 0);
            return total > 0 ? `${METODO_LABEL[metodo]} ${formatCurrency(total)}` : '';
          })
            .filter((parte) => parte !== '')
            .join(' · '),
        );
      }
      // Método más usado del día en pill neutro (T3.5).
      const mejor = metodoMasUsado(ventas);
      setHidden(metodoPill, mejor === null);
      setText(metodoPillTexto, mejor ? METODO_LABEL[mejor] : '');

      // "Productos más vendidos" (base.md §7 / plan-cierre Fase 1) — top 3 of
      // the day's already-filtered ventas, same input as the desglose above.
      const top = topProductosDelDia(ventas);
      if (top.length > 0) {
        setText(
          topTextoEl,
          `Más vendidos: ${top
            .map((producto) => `${producto.nombre} ×${producto.unidades}`)
            .join(' · ')}`,
        );
        setHidden(topEl, false);
      } else {
        setHidden(topEl, true);
      }

      // Caja del día card: only if a local session exists for this fecha_dia
      // (newest wins — opened sessions prepend, so a reopen shows the live one).
      const caja = cajas.find((c) => c.fecha_dia === dia);
      if (caja) {
        setText(cajaTextoEl, textoCaja(caja));
        setHidden(cajaEl, false);
      } else {
        setHidden(cajaEl, true);
      }

      // Only today's group is open, only on the first paint.
      if (day instanceof HTMLDetailsElement) {
        day.open = primeraVez && dia === hoy;
      }

      for (const venta of ventas) {
        // <md card list.
        const linea = cloneTemplate(lineTemplate);
        if (linea) {
          paintLine(linea, venta, estados);
          linesUl?.append(linea);
        }
        // ≥md DataTable row (T3.5) — same paint, different template.
        const fila = cloneTemplate(lineDesktopTemplate);
        if (fila && tbody) {
          paintLine(fila, venta, estados);
          tbody.append(fila);
        }
      }

      daysEl.append(day);
    }

    setHidden(emptyEl, all.length > 0);
    setHidden(noResultsEl, !(all.length > 0 && list.length === 0));
    pintarKpis(list, all.length === 0);
    primeraVez = false;
  }

  function seleccionarRango(nuevoRango: Rango): void {
    rango = nuevoRango;
    if (rango === 'personalizado') {
      // The preset's Desde/Hasta no longer describe the range: clear them so
      // Personalizado means "todo el historial" + inputs libres para elegir.
      // (Manual date edits land in Personalizado through the input listeners
      // WITHOUT clearing — those values ARE the user's range.)
      if (fromInput) fromInput.value = '';
      if (toInput) toInput.value = '';
    }
    pintarChips();
    aplicarRango();
    render();
  }

  // ── Events (T3.4) ───────────────────────────────────────────────────
  delegateAction(rangeGroup, 'click', 'data-range-value', {
    hoy: () => seleccionarRango('hoy'),
    ayer: () => seleccionarRango('ayer'),
    '7d': () => seleccionarRango('7d'),
    mes: () => seleccionarRango('mes'),
    personalizado: () => seleccionarRango('personalizado'),
  });

  searchInput?.addEventListener(
    'input',
    debounce(() => {
      busqueda = (searchInput.value ?? '').trim().toLowerCase();
      render();
    }, 200),
  );

  for (const input of [fromInput, toInput]) {
    input?.addEventListener('change', () => {
      // Manual date edit always lands in Personalizado (the preset no longer
      // describes the range).
      if (rango !== 'personalizado') {
        rango = 'personalizado';
        pintarChips();
        aplicarRango();
      }
      render();
    });
  }

  enCambioDesktop(aplicarRango);

  pintarChips();
  aplicarRango(); // default Personalizado → inputs visible everywhere
  render(); // immediate first paint from local storage
}
