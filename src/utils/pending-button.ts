// Pending button factory (D10).
// Reference: login-form, ajustes, categorias-admin, product-admin, caja, stock.
// Covers re-entry guard + pending state (disabled + "Guardando…" text).

export interface PendingButtonApi {
  iniciar(): boolean; // returns false if already in-flight
  finalizar(): void;
}

export function crearPendingButton(btn: HTMLButtonElement | null, textoPendiente: string): PendingButtonApi {
  let textoOriginal = btn?.textContent ?? '';
  let enVuelo = false;

  return {
    iniciar(): boolean {
      if (enVuelo || !btn) return false;
      enVuelo = true;
      btn.disabled = true;
      btn.textContent = textoPendiente;
      return true;
    },
    finalizar(): void {
      if (!btn) return;
      enVuelo = false;
      btn.disabled = false;
      btn.textContent = textoOriginal;
    },
  };
}
