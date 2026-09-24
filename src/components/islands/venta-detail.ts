// Sale detail from the LOCAL historial (plan-mejoras-2.md Fase 3, decision
// D3; comprobante redesign T3.6): static page + ?id= because getStaticPaths
// per venta is impossible with output: "static" (gotcha G1). Zero API
// (base.md §7). Totals: the subtotal row renders ONLY when the snapshot
// carries it (gotcha G9 — sales from before Fase 3 show no subtotal, no
// migration); IGV always renders, derived from the snapshot when present and
// from total / (1 + tasa) (inverse of calcTotal) otherwise — that fallback
// uses the CURRENT configured rate (a sale closed under a previous rate
// shows its IGV re-derived with the new one; accepted, the snapshot doesn't
// store the rate — plan-productos-v2 Fase 5).
//
// T3.6 additions (refactorUI §6.2):
//   - nombre del local (ajustes.nombre_local) in the receipt header.
//   - sync pill (three states, `hidden` toggle) from cola_sync matched by
//     payload.id_venta — answers "¿esta venta ya subió?".
//   - nota discreta "Estimado con la tasa actual" visible ⇔ NO snapshot.
//   - Imprimir → window.print() (80 mm @media print sheet in global.css).
//   - unknown id hides the standalone action row (its CTA lives in the
//     EmptyState, T0.1). Hooks are data-* scoped to [data-venta-root]; item
// text always via textContent.

import { formatCurrency, formatFecha, formatHora } from '../../utils/format';
import { getAjustes, getColaSync, getHistorialVentas } from '../../utils/storage';
import { calcTax, etiquetaIgv, getTaxRate } from '../../utils/tax';

const root = document.querySelector<HTMLElement>('[data-venta-root]');

if (root) {
  const contenido = root.querySelector<HTMLElement>('[data-venta-contenido]');
  const noEncontrada = root.querySelector<HTMLElement>('[data-venta-no-encontrada]');
  const acciones = root.querySelector<HTMLElement>('[data-venta-acciones]');
  const printBtn = root.querySelector<HTMLButtonElement>('[data-venta-print]');
  const localEl = root.querySelector<HTMLElement>('[data-venta-local]');
  const syncWrap = root.querySelector<HTMLElement>('[data-venta-sync]');
  const fechaEl = root.querySelector<HTMLElement>('[data-venta-fecha]');
  const horaEl = root.querySelector<HTMLElement>('[data-venta-hora]');
  const metodoEl = root.querySelector<HTMLElement>('[data-venta-metodo]');
  const linesEl = root.querySelector<HTMLElement>('[data-venta-lines]');
  const template = root.querySelector<HTMLTemplateElement>('[data-venta-line-template]');
  const subtotalFila = root.querySelector<HTMLElement>('[data-venta-subtotal-fila]');
  const subtotalEl = root.querySelector<HTMLElement>('[data-venta-subtotal]');
  const taxLabelEl = root.querySelector<HTMLElement>('[data-venta-tax-label]');
  const igvEl = root.querySelector<HTMLElement>('[data-venta-igv]');
  const totalEl = root.querySelector<HTMLElement>('[data-venta-total]');
  const igvNota = root.querySelector<HTMLElement>('[data-venta-igv-nota]');
  // Configured IGV overwrites the build-time default label (Fase 5).
  if (taxLabelEl) taxLabelEl.textContent = etiquetaIgv();
  // Receipt header: nombre del local (T3.6) — empty ajustes keeps "Tienda".
  if (localEl) localEl.textContent = getAjustes().nombre_local || 'Tienda';

  // Spanish labels for the wire values of base.md §2.2.
  const METODO_LABEL: Record<string, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    'yape-plin': 'Yape/Plin',
  };

  const id = new URLSearchParams(window.location.search).get('id');
  const venta = id ? getHistorialVentas().find((v) => v.id_venta === id) : undefined;

  if (!venta) {
    // Missing or unknown id: hide the detail + its actions, reveal the empty
    // state (which carries its own "Volver al historial" CTA).
    if (contenido) contenido.hidden = true;
    if (acciones) acciones.hidden = true;
    if (noEncontrada) noEncontrada.hidden = false;
  } else {
    if (fechaEl) fechaEl.textContent = formatFecha(venta.fecha_hora);
    if (horaEl) horaEl.textContent = formatHora(venta.fecha_hora);
    if (metodoEl) metodoEl.textContent = METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago;

    // Sync pill (T3.6): strongest estado from cola_sync for this id_venta —
    // absent from the queue means the sale already left the device.
    if (syncWrap) {
      const item = getColaSync().find(
        (entrada) => entrada.tipo === 'registrarVenta' && entrada.payload.id_venta === venta.id_venta,
      );
      const estado = !item
        ? 'sincronizada'
        : item.estado === 'error_permanente'
          ? 'error'
          : item.estado === 'sincronizado'
            ? 'sincronizada'
            : 'pendiente';
      for (const pill of syncWrap.querySelectorAll<HTMLElement>('[data-venta-sync-state]')) {
        pill.hidden = pill.getAttribute('data-venta-sync-state') !== estado;
      }
    }

    if (linesEl && template) {
      for (const item of venta.items) {
        const first = template.content.firstElementChild;
        if (!first) continue;
        const linea = first.cloneNode(true) as HTMLElement;
        const nombre = linea.querySelector<HTMLElement>('[data-venta-nombre]');
        const cantidad = linea.querySelector<HTMLElement>('[data-venta-cantidad]');
        const importe = linea.querySelector<HTMLElement>('[data-venta-importe]');
        if (nombre) nombre.textContent = item.nombre;
        if (cantidad) cantidad.textContent = `${item.cantidad} × ${formatCurrency(item.precio)}`;
        if (importe) importe.textContent = formatCurrency(item.precio * item.cantidad);
        linesEl.append(linea);
      }
    }

    // Totals — G9: subtotal only when the snapshot has it (no assertion
    // noise: narrow once into a local const).
    const subtotal = typeof venta.subtotal === 'number' ? venta.subtotal : null;
    if (subtotalFila) subtotalFila.hidden = subtotal === null;
    if (subtotalEl && subtotal !== null) subtotalEl.textContent = formatCurrency(subtotal);
    if (igvNota) igvNota.hidden = subtotal !== null; // nota ⇔ IGV derivado (T3.6)
    if (igvEl) {
      const igv = subtotal !== null ? calcTax(subtotal) : venta.total - venta.total / (1 + getTaxRate());
      igvEl.textContent = formatCurrency(igv);
    }
    if (totalEl) totalEl.textContent = formatCurrency(venta.total);
  }

  // Imprimir (T3.6): the @media print sheet in global.css isolates this
  // receipt at 80 mm — window.print() is all the trigger needs.
  printBtn?.addEventListener('click', () => window.print());
}
