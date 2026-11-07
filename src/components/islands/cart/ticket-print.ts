// Ticket preview + print (owner 2026-11-05, rediseño; ajustado 2026-11-06):
// ONE self-contained HTML document (generarHtmlTicket) serves BOTH surfaces:
//   - preview en pantalla → iframe srcdoc inside ui/TicketPreviewModal.astro
//     (LayoutApp — available on / and /historial/venta);
//   - impresión → independent popup window (window.open + document.write +
//     auto window.print() — the owner's reference pattern), @page 58 mm.
// The app DOM never receives innerHTML (§0.2): every dynamic value is
// escaped into the string, and the only write into the page is srcdoc.
// Design follows ticket.png (owner adjustments 2026-11-06): FIXED 58 mm
// width, top-left on paper (even on A4), sale id at the top, no asterisk
// separators, no dotted row rules, no decorative barcode.
// SHARED by the post-sale modal (checkout.ts) and /historial/venta
// (venta-detail.ts) — one ticket format, both buttons.

import { formatCurrency, formatFecha, formatHora } from '../../../utils/format';
import { getAjustes, type VentaLocal } from '../../../utils/storage';
import { calcTax, etiquetaIgv, getTaxRate } from '../../../utils/tax';
import { METODO_LABEL } from '../../../utils/metodos';
import { qs } from '../../../utils/dom';
import { openModal } from '../../../utils/modal';

// Escape for string-built HTML (§0.2 — no innerHTML on the app DOM; this
// string goes to srcdoc / document.write, never to querySelector paths).
function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function filaTotal(label: string, valor: string, extra = ''): string {
  return `<div class="tk-fila${extra}"><span>${esc(label)}</span><span class="tk-num">${esc(valor)}</span></div>`;
}

// Full ticket document. autoPrint=true appends the popup's self-print
// script (load → window.print(), afterprint → window.close()) — the
// preview iframe passes false and prints via its own button instead.
export function generarHtmlTicket(venta: VentaLocal, autoPrint = false): string {
  const a = getAjustes();

  // ── Cabecera ────────────────────────────────────────────────────────────
  // Logo solo cuando existe en Ajustes (ticket.png es solo texto; sin logo
  // la cabecera queda idéntica al diseño de referencia).
  const logo = a.logo.trim()
    ? `<img class="tk-logo" src="${esc(a.logo.trim())}" alt="" />`
    : '';
  const nombre = esc(a.nombre_local || 'Tienda');
  const detalle = [a.ruc.trim(), a.direccion.trim(), a.telefono.trim()]
    .filter((valor) => valor !== '')
    .map((valor) => `<p class="tk-sub">${esc(valor)}</p>`)
    .join('');

  // ── Líneas ──────────────────────────────────────────────────────────────
  const lineas = venta.items
    .map(
      (item) => `<tr>
          <td>${esc(item.nombre)}<span class="tk-cant">${item.cantidad} × ${esc(formatCurrency(item.precio))}</span></td>
          <td class="tk-num">${esc(formatCurrency(item.precio * item.cantidad))}</td>
        </tr>`,
    )
    .join('');

  // ── Totales (G9 parity with venta-detail.ts) ────────────────────────────
  // Subtotal ONLY when the snapshot carries it (older sales lack it — no
  // migration); IGV from the snapshot when present, otherwise derived from
  // total with the CURRENT rate (accepted limitation, same as detail).
  const subtotal = typeof venta.subtotal === 'number' ? venta.subtotal : null;
  const igv = subtotal !== null ? calcTax(subtotal) : venta.total - venta.total / (1 + getTaxRate());
  const filas: string[] = [];
  if (subtotal !== null) filas.push(filaTotal('Subtotal', formatCurrency(subtotal)));
  filas.push(filaTotal(etiquetaIgv(), formatCurrency(igv)));

  // Cash rows ⇔ efectivo sale (checkout only computes recibido for cash);
  // every other method shows its label instead — image's Cash/Change block.
  const filasPago: string[] = [];
  if (typeof venta.recibido === 'number') {
    filasPago.push(filaTotal('Efectivo', formatCurrency(venta.recibido)));
    filasPago.push(filaTotal('Vuelto', formatCurrency(venta.vuelto ?? 0)));
  } else {
    filasPago.push(filaTotal('Método', METODO_LABEL[venta.metodo_pago] ?? venta.metodo_pago));
  }

  const script = autoPrint
    ? `<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 300);
  });
  window.onafterprint = function () { window.close(); };
<\/script>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket ${esc(venta.id_venta.slice(0, 8))}</title>
<style>
  /* NO size here on purpose: a single length (size:58mm) makes Chrome a
     SQUARE 58x58mm page → the ~150mm ticket split across 3 cut sheets
     (owner report 2026-11-06); size:"58mm auto" is silently DROPPED by
     Chrome. The 58mm width comes from .tk below — independent of paper —
     and margin pins it top-left on any sheet (3mm left so the ink never
     touches the paper edge — owner request 2026-11-06). */
  @page { margin: 0 0 0 3mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 10px 6px;
    background: #fff;
    color: #111;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Fixed 58 mm — never width:100% (owner 2026-11-06: on paper it must not
     stretch to A4). Centered on screen (preview), flush top-left in print. */
  .tk { width: 58mm; max-width: 100%; margin: 0 auto; }
  .tk-center { text-align: center; }
  .tk-logo { display: block; width: 48px; height: 48px; margin: 0 auto 4px; object-fit: contain; }
  .tk-nombre { margin: 0; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
  .tk-sub { margin: 1px 0 0; font-size: 11px; }
  .tk-titulo { margin: 6px 0 2px; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  th { padding: 2px 0 3px; font-size: 10px; font-weight: 700; text-align: left; text-transform: uppercase; border-bottom: 1px solid #111; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 3px 0; vertical-align: top; font-size: 11px; }
  .tk-cant { display: block; color: #555; font-size: 10px; }
  .tk-num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tk-totales { margin-top: 6px; padding: 6px 0; border-top: 1px dashed #999; border-bottom: 1px dashed #999; }
  .tk-fila { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
  .tk-total { margin-top: 4px; padding-top: 4px; border-top: 1px solid #111; font-size: 15px; font-weight: 700; }
  .tk-fecha { margin: 8px 0 0; text-align: center; font-size: 10px; color: #444; }
  .tk-gracias { margin: 6px 0 0; text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .tk-id { margin: 4px 0 0; text-align: center; font-size: 10px; letter-spacing: 0.15em; color: #555; }
  /* Paper: no page margin, no centering — the ticket sticks to the
     top-left corner even when the dialog prints on A4. */
  @media print { body { padding: 0; } .tk { margin: 0; } }
</style>
</head>
<body>
  <div class="tk">
    <div class="tk-center">
      ${logo}
      <p class="tk-nombre">${nombre}</p>
      ${detalle}
      <p class="tk-id">N° ${esc(venta.id_venta.slice(0, 8))}</p>
    </div>
    <div class="tk-titulo">Ticket de venta</div>
    <table>
      <thead><tr><th>Descripción</th><th>Precio</th></tr></thead>
      <tbody>${lineas}</tbody>
    </table>
    <div class="tk-totales">
      ${filas.join('\n      ')}
      ${filaTotal('Total', formatCurrency(venta.total), ' tk-total')}
      ${filasPago.join('\n      ')}
    </div>
    <div class="tk-center">
      <p class="tk-fecha">${esc(formatFecha(venta.fecha_hora))} ${esc(formatHora(venta.fecha_hora))}</p>
      <p class="tk-gracias">Gracias por la compra</p>
    </div>
  </div>
${script}
</body>
</html>`;
}

// ── Impresión (patrón window.open del código de referencia del owner) ─────
// Independent document → its own @page 58 mm, no dependence on the app's
// @media print sheet. Popup blockers allow window.open from this click
// gesture; if one still blocks, say so instead of failing silently.
export function abrirImpresionTicket(venta: VentaLocal): void {
  const win = window.open('', '_PRINT', 'height=600,width=800');
  if (!win) {
    window.alert(
      'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.',
    );
    return;
  }
  win.document.open();
  win.document.write(generarHtmlTicket(venta, true));
  win.document.close();
}

// ── Preview en pantalla ────────────────────────────────────────────────────
// Fills the TicketPreviewModal iframe (LayoutApp) with the SAME document
// the popup prints — one renderer, zero drift between preview and paper.
let ventaPreview: VentaLocal | null = null;

export function abrirPreviewTicket(venta: VentaLocal): void {
  const root = qs<HTMLElement>(document, '[data-modal-root="ticket-preview"]');
  if (!root) return;
  ventaPreview = venta;

  const frame = qs<HTMLIFrameElement>(root, '[data-ticket-preview-frame]');
  if (frame) {
    // onload fires after the current task — the modal is already open by
    // then, so scrollHeight measures the real (visible) iframe width.
    frame.onload = () => {
      const doc = frame.contentDocument;
      if (doc?.body) frame.style.height = `${doc.body.scrollHeight}px`;
    };
    frame.srcdoc = generarHtmlTicket(venta, false);
  }
  openModal(root);
}

// "Imprimir" inside the preview modal → the popup. Wired once at module
// load (Astro module scripts run after DOM parse; the modal lives in
// LayoutApp, so the button exists on every app page).
const previewPrintBtn = qs<HTMLButtonElement>(document, '[data-ticket-preview-print]');
previewPrintBtn?.addEventListener('click', () => {
  if (ventaPreview) abrirImpresionTicket(ventaPreview);
});
