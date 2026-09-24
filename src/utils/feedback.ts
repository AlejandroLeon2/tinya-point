// Feedback factory for alert/toast patterns (D2: caja, stock, ajustes, categorias-admin, product-admin).
// Reference: ajustes.ts:51-61, caja.ts:126-147.
// Note: caja.ts and product-admin.ts use multiple alerts (error/cierre/aviso or page/form) —
// they create one instance per alert (feedbackError, feedbackCierre…) instead of a single one.

import { mostrarToast } from './toast';

export interface FeedbackApi {
  ok(mensaje: string): void;
  error(mensaje: string): void;
  ocultar(): void;
}

export function crearFeedback(alertEl: HTMLElement | null, textEl: HTMLElement | null): FeedbackApi {
  return {
    ok(mensaje: string): void {
      // Success = ephemeral toast (refactorUI §2.3 D9 — no layout shift)
      mostrarToast(mensaje);
      if (alertEl) alertEl.hidden = true;
    },
    error(mensaje: string): void {
      if (textEl) textEl.textContent = mensaje;
      if (alertEl) alertEl.hidden = false;
    },
    ocultar(): void {
      if (alertEl) alertEl.hidden = true;
    },
  };
}
