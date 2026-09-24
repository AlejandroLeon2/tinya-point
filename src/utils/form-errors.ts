// Inline field-level validation errors (plan-form-ux.md Fase 1) — the
// message travels NEXT TO its input instead of only in the page-level
// Alert, so the cashier never has to scan the page for "what failed".
// Presentation + a11y state live HERE; the Spanish copy comes from each
// island (it already owns every user-facing string, stilesbase §5.7).
//
// Accessibility: role="alert" announces the message when it appears, and
// aria-invalid marks the input — no fixed ids needed (astrobase §3.4).

export function mostrarErrorCampo(input: HTMLElement, mensaje: string): void {
  limpiarErrorCampo(input);
  const p = document.createElement('p');
  p.setAttribute('data-field-error', '');
  p.setAttribute('role', 'alert');
  p.className = 'text-base font-semibold text-danger';
  p.textContent = mensaje;
  input.insertAdjacentElement('afterend', p);
  input.setAttribute('aria-invalid', 'true');
}

export function limpiarErrorCampo(input: HTMLElement): void {
  // The error <p> is inserted directly after the input — remove it and any
  // consecutive duplicates (defensive), never unrelated siblings.
  let hermano = input.nextElementSibling;
  while (hermano?.matches('[data-field-error]')) {
    const siguiente = hermano.nextElementSibling;
    hermano.remove();
    hermano = siguiente;
  }
  input.removeAttribute('aria-invalid');
}

/** Reset every inline error inside a form (call at submit start / edit mode). */
export function limpiarErroresForm(form: HTMLElement): void {
  form.querySelectorAll('[data-field-error]').forEach((nodo) => nodo.remove());
  form.querySelectorAll('[aria-invalid]').forEach((nodo) =>
    nodo.removeAttribute('aria-invalid'),
  );
}

/** Clear a field's error as soon as the user starts fixing it. */
export function observarCampo(input: HTMLElement): void {
  input.addEventListener('input', () => limpiarErrorCampo(input));
}
