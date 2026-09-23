// Non-blocking "no caja abierta" banner on the POS home (extras.md §6):
// visible ONLY when no local session is open — a reminder with a link to
// /caja, never a gate; the cashier can sell with or without an open caja
// (plan-mejoras-2.md Fase 2). Pure local read, zero API calls.

import { getCajas } from '../../utils/storage';

const aviso = document.querySelector<HTMLElement>('[data-alert="aviso-caja"]');

if (aviso) {
  aviso.hidden = getCajas().some((caja) => caja.estado === 'abierta');
}
