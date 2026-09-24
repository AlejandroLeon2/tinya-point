// Caja pill in the LayoutApp TopBar (refactorUI §3.2 — Fase 1): paints the
// open/closed state from the LOCAL `cajas` key (utils/storage.ts), never the
// network (local first, §4.6). State = visibility of the two pill links —
// `hidden` toggling ONLY, never class toggling (§0.4). The hora text goes
// through textContent (never HTML). Repaints on the caja:state-changed event
// dispatched by islands/caja/caja.ts (open/close without reload) and on tab focus
// (sales registered elsewhere). One TopBar per page, data attributes, no ids.

import { formatHora } from '../../../utils/format';
import { getCajas } from '../../../utils/storage';
import { qs, setText, setHidden } from '../../../utils/dom';

const abiertaEl = qs<HTMLElement>(document, '[data-caja-abierta]');
const horaEl = qs<HTMLElement>(document, '[data-caja-hora]');
const cerradaEl = qs<HTMLElement>(document, '[data-caja-cerrada]');

if (abiertaEl || cerradaEl) {
  const pintar = (): void => {
    const abierta = getCajas().find((caja) => caja.estado === 'abierta') ?? null;
    setHidden(abiertaEl, abierta === null);
    setHidden(cerradaEl, abierta !== null);
    if (abierta) setText(horaEl, formatHora(abierta.fecha_hora_apertura));
  };

  pintar(); // first paint from the local key
  document.addEventListener('caja:state-changed', pintar);
  window.addEventListener('focus', pintar);
}
