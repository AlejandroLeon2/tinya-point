// Paints /historial from historial_ventas — 100% local, ZERO API calls
// (plan-features Fase 5 gate; base.md §7 "del propio dispositivo"). The
// date filter compares each venta's DEVICE-LOCAL calendar day (not UTC —
// toISOString would shift sales across days) against the Desde/Hasta inputs
// and runs BEFORE grouping (plan-mejoras-2 Fase 3). Days render as native
// <details> groups: summary = fecha + "N ventas" + total del día + desglose
// por método en TEXTO (never color alone — stilesbase §5.2). Only TODAY'S
// group starts open, and only on the FIRST paint — later re-renders leave
// groups as the filter left them. Each venta row links to the static detail
// page /historial/venta/?id= (gotcha G1 — no getStaticPaths per venta).
// Template cloning like catalog/cart: no fixed ids, everything scoped to
// data-attribute hooks inside [data-historial-root].

import { round2, totalesDelDia } from '../../utils/caja';
import { formatCurrency, formatDia, formatHora, localDayKey } from '../../utils/format';
import { getCajas, getHistorialVentas, type CajaLocal, type MetodoPago, type VentaLocal } from '../../utils/storage';

const root = document.querySelector<HTMLElement>('[data-historial-root]');

if (root) {
  const daysEl = root.querySelector<HTMLElement>('[data-hist-days]');
  const dayTemplate = root.querySelector<HTMLTemplateElement>('[data-hist-day-template]');
  const lineTemplate = root.querySelector<HTMLTemplateElement>('[data-hist-line-template]');
  const fromInput = root.querySelector<HTMLInputElement>('[data-hist-from]');
  const toInput = root.querySelector<HTMLInputElement>('[data-hist-to]');
  const emptyEl = root.querySelector<HTMLElement>('[data-empty-state="empty-historial"]');
  const noResultsEl = root.querySelector<HTMLElement>('[data-empty-state="no-date-results"]');

  // UI labels in Spanish for the wire values of base.md §2.2.
  const METODO_LABEL: Record<MetodoPago, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    'yape-plin': 'Yape/Plin',
  };
  const METODOS: readonly MetodoPago[] = ['efectivo', 'tarjeta', 'yape-plin'];

  // First paint opens today's group; later re-renders (filter changes) leave
  // every group closed (plan: "open solo para el día de hoy en el primer
  // pintado").
  let primeraVez = true;

  function visible(ventas: VentaLocal[]): VentaLocal[] {
    const from = fromInput?.value ?? '';
    const to = toInput?.value ?? '';
    if (!from && !to) return ventas;
    return ventas.filter((venta) => {
      const day = localDayKey(venta.fecha_hora);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
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
    // newest session of that day wins: setCajas prepends on apertura).
    const cajas = getCajas();

    daysEl.querySelectorAll('[data-hist-day]').forEach((day) => day.remove());

    for (const dia of dias) {
      const ventas = porDia.get(dia) ?? [];
      const first = dayTemplate.content.firstElementChild;
      if (!first) continue;
      const day = first.cloneNode(true) as HTMLElement;

      const diaEl = day.querySelector<HTMLElement>('[data-hist-dia]');
      const nEl = day.querySelector<HTMLElement>('[data-hist-n]');
      const totalEl = day.querySelector<HTMLElement>('[data-hist-total]');
      const desgloseEl = day.querySelector<HTMLElement>('[data-hist-desglose]');
      const cajaEl = day.querySelector<HTMLElement>('[data-hist-caja]');
      const cajaTextoEl = day.querySelector<HTMLElement>('[data-hist-caja-texto]');
      const linesUl = day.querySelector<HTMLElement>('[data-hist-lines]');

      const totalDia = ventas.reduce((suma, v) => suma + v.total, 0);
      if (diaEl) diaEl.textContent = formatDia(dia);
      if (nEl) nEl.textContent = `${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}`;
      if (totalEl) totalEl.textContent = formatCurrency(totalDia);
      if (desgloseEl) {
        // Per-method breakdown in TEXT — only methods with movement, the
        // words carry the meaning (§5.2: never color alone).
        desgloseEl.textContent = METODOS.map((metodo) => {
          const total = ventas
            .filter((v) => v.metodo_pago === metodo)
            .reduce((suma, v) => suma + v.total, 0);
          return total > 0 ? `${METODO_LABEL[metodo]} ${formatCurrency(total)}` : '';
        })
          .filter((parte) => parte !== '')
          .join(' · ');
      }

      // Caja del día card: only if a local session exists for this fecha_dia
      // (newest wins — opened sessions prepend, so a reopen shows the live one).
      if (cajaEl && cajaTextoEl) {
        const caja = cajas.find((c) => c.fecha_dia === dia);
        if (caja) {
          cajaTextoEl.textContent = textoCaja(caja);
          cajaEl.hidden = false;
        } else {
          cajaEl.hidden = true;
        }
      }

      // Only today's group is open, only on the first paint.
      if (day instanceof HTMLDetailsElement) {
        day.open = primeraVez && dia === hoy;
      }

      for (const venta of ventas) {
        const lineFirst = lineTemplate.content.firstElementChild;
        if (!lineFirst) continue;
        const linea = lineFirst.cloneNode(true) as HTMLElement;

        const hora = linea.querySelector<HTMLElement>('[data-hist-hora]');
        const metodo = linea.querySelector<HTMLElement>('[data-hist-metodo]');
        const items = linea.querySelector<HTMLElement>('[data-hist-items]');
        const total = linea.querySelector<HTMLElement>('[data-hist-total]');
        const link = linea.querySelector<HTMLAnchorElement>('[data-hist-link]');

        if (hora) hora.textContent = formatHora(venta.fecha_hora);
        if (metodo) metodo.textContent = METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago;
        const unidades = venta.items.reduce((suma, item) => suma + item.cantidad, 0);
        if (items) items.textContent = `${unidades} ${unidades === 1 ? 'producto' : 'productos'}`;
        if (total) total.textContent = formatCurrency(venta.total);
        if (link) link.href = `/historial/venta/?id=${encodeURIComponent(venta.id_venta)}`;

        linesUl?.append(linea);
      }

      daysEl.append(day);
    }

    if (emptyEl) emptyEl.hidden = all.length > 0;
    if (noResultsEl) noResultsEl.hidden = !(all.length > 0 && list.length === 0);
    primeraVez = false;
  }

  for (const input of [fromInput, toInput]) {
    input?.addEventListener('change', render);
    input?.addEventListener('input', render);
  }

  render(); // immediate first paint from local storage
}
