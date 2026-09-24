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

import { formatCurrency, formatFecha, formatHora } from '../../../utils/format';
import { getAjustes, getColaSync, getHistorialVentas } from '../../../utils/storage';
import { calcTax, etiquetaIgv, getTaxRate } from '../../../utils/tax';
import { qs, setText, setHidden, cloneTemplate, setPillState } from '../../../utils/dom';
import { METODO_LABEL } from '../../../utils/metodos';

const root = qs<HTMLElement>(document, '[data-venta-root]');

if (root) {
  const contenido = qs<HTMLElement>(root, '[data-venta-contenido]');
  const noEncontrada = qs<HTMLElement>(root, '[data-venta-no-encontrada]');
  const acciones = qs<HTMLElement>(root, '[data-venta-acciones]');
  const printBtn = qs<HTMLButtonElement>(root, '[data-venta-print]');
  const localEl = qs<HTMLElement>(root, '[data-venta-local]');
  const syncWrap = qs<HTMLElement>(root, '[data-venta-sync]');
  const fechaEl = qs<HTMLElement>(root, '[data-venta-fecha]');
  const horaEl = qs<HTMLElement>(root, '[data-venta-hora]');
  const metodoEl = qs<HTMLElement>(root, '[data-venta-metodo]');
  const linesEl = qs<HTMLElement>(root, '[data-venta-lines]');
  const template = qs<HTMLTemplateElement>(root, '[data-venta-line-template]');
  const subtotalFila = qs<HTMLElement>(root, '[data-venta-subtotal-fila]');
  const subtotalEl = qs<HTMLElement>(root, '[data-venta-subtotal]');
  const taxLabelEl = qs<HTMLElement>(root, '[data-venta-tax-label]');
  const igvEl = qs<HTMLElement>(root, '[data-venta-igv]');
  const totalEl = qs<HTMLElement>(root, '[data-venta-total]');
  const igvNota = qs<HTMLElement>(root, '[data-venta-igv-nota]');
  // Configured IGV overwrites the build-time default label (Fase 5).
  setText(taxLabelEl, etiquetaIgv());
  // Receipt header: nombre del local (T3.6) — empty ajustes keeps "Tienda".
  setText(localEl, getAjustes().nombre_local || 'Tienda');

  // METODO_LABEL imported from utils/metodos (D12 — shared with historial.ts).

  const id = new URLSearchParams(window.location.search).get('id');
  const venta = id ? getHistorialVentas().find((v) => v.id_venta === id) : undefined;

  if (!venta) {
    // Missing or unknown id: hide the detail + its actions, reveal the empty
    // state (which carries its own "Volver al historial" CTA).
    setHidden(contenido, true);
    setHidden(acciones, true);
    setHidden(noEncontrada, false);
  } else {
    setText(fechaEl, formatFecha(venta.fecha_hora));
    setText(horaEl, formatHora(venta.fecha_hora));
    setText(metodoEl, METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago);

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
      setPillState(syncWrap, 'data-venta-sync-state', estado);
    }

    if (linesEl && template) {
      for (const item of venta.items) {
        const linea = cloneTemplate(template);
        if (!linea) continue;
        const nombre = qs<HTMLElement>(linea, '[data-venta-nombre]');
        const cantidad = qs<HTMLElement>(linea, '[data-venta-cantidad]');
        const importe = qs<HTMLElement>(linea, '[data-venta-importe]');
        setText(nombre, item.nombre);
        setText(cantidad, `${item.cantidad} × ${formatCurrency(item.precio)}`);
        setText(importe, formatCurrency(item.precio * item.cantidad));
        linesEl.append(linea);
      }
    }

    // Totals — G9: subtotal only when the snapshot has it (no assertion
    // noise: narrow once into a local const).
    const subtotal = typeof venta.subtotal === 'number' ? venta.subtotal : null;
    setHidden(subtotalFila, subtotal === null);
    if (subtotal !== null) setText(subtotalEl, formatCurrency(subtotal));
    setHidden(igvNota, subtotal !== null); // nota ⇔ IGV derivado (T3.6)
    if (igvEl) {
      const igv = subtotal !== null ? calcTax(subtotal) : venta.total - venta.total / (1 + getTaxRate());
      setText(igvEl, formatCurrency(igv));
    }
    setText(totalEl, formatCurrency(venta.total));
  }

  // Imprimir (T3.6): the @media print sheet in global.css isolates this
  // receipt at 80 mm — window.print() is all the trigger needs.
  printBtn?.addEventListener('click', () => window.print());
}
