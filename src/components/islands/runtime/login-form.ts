// LoginForm submit flow: validate → api/actions/auth.login() → store the
// token via stores/session → redirect to / (doc/astrobase.md §3.3,
// plan-features Fase 1). Scoped queries on the single form — no fixed ids,
// no module-level state.
//
// Credentials exist ONLY inside this handler's stack frame: they are never
// written to storage, never kept in module variables, and form.reset()
// drops them from the fields once the token is stored (doc/appscriptbase.md
// §5.3). Raw error codes (§4.5) never reach the cashier — only plain
// Spanish copy (doc/stilesbase.md §5.7).
//
// T4.1 (refactorUI §11): business-name h1 from `ajustes.nombre_local`,
// password visibility toggle (text + aria-pressed only), offline note
// (visible ⇔ sin red), "Ingresando…" pending state, and focus back to the
// user field after ANY error (validation or auth).

import { login } from '../../../api/actions/auth';
import { saveSession } from '../../../stores/session';
import { getAjustes } from '../../../utils/storage';
import { hasLoginFields } from '../../../utils/validators';
import { qs, setText, setHidden } from '../../../utils/dom';
import { crearPendingButton } from '../../../utils/pending-button';
import { createFormManager, type SubmitResult } from '../../../utils/form-manager';

const root = qs<HTMLElement>(document, '[data-login-root]');
const form = qs<HTMLFormElement>(document, '[data-login-form]');

if (form && root) {
  const error = qs<HTMLElement>(form, '[data-login-error]');
  const submit = qs<HTMLButtonElement>(form, '[data-login-submit]');
  const usuarioInput = qs<HTMLInputElement>(form, 'input[name="usuario"]');
  const claveInput = qs<HTMLInputElement>(form, 'input[name="clave"]');
  const toggle = qs<HTMLButtonElement>(form, '[data-login-toggle]');
  const marca = qs<HTMLElement>(root, '[data-login-marca]');
  const offlineNote = qs<HTMLElement>(root, '[data-login-offline]');

  // The business name is a LOCAL preference — painted at boot, no network.
  const nombreLocal = getAjustes().nombre_local.trim();
  if (nombreLocal) setText(marca, nombreLocal);

  const showError = (message: string): void => {
    setText(error, message);
    setHidden(error, false);
    // §11: after an error the next attempt starts at the user field.
    usuarioInput?.focus();
  };

  // §11: the offline note travels with navigator.onLine — no polling.
  const pintarOnline = (): void => {
    setHidden(offlineNote, navigator.onLine);
  };
  window.addEventListener('online', pintarOnline);
  window.addEventListener('offline', pintarOnline);
  pintarOnline();

  // §11: show/hide the password — state lives in type + text + aria-pressed,
  // never in a class (§0.4). The input keeps its accessible name via
  // aria-label while the visible label is a span (no fixed ids).
  toggle?.addEventListener('click', () => {
    if (!claveInput || !toggle) return;
    const mostrando = claveInput.type === 'password';
    claveInput.type = mostrando ? 'text' : 'password';
    toggle.textContent = mostrando ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(mostrando));
  });

  const pendingBtn = crearPendingButton(submit, 'Ingresando…');

  // Schema without validators — the login form uses its own block-level
  // error (data-login-error) with hasLoginFields; the Astro template has no
  // inline error support per field.  createFormManager still provides:
  // submit interception, anti-double-submit, observarCampo auto-wiring, and
  // the 'keep-pending' sentinel for the navigation case.
  createFormManager<{ usuario: string; clave: string }>({
    form,
    pendingBtn,
    schema: {
      usuario: { el: usuarioInput },
      clave: { el: claveInput },
    },
    onSubmit: async (datos): Promise<SubmitResult> => {
      setHidden(error, true);

      if (!hasLoginFields(datos.usuario, datos.clave)) {
        showError('Completa usuario y contraseña.');
        return;
      }

      const result = await login(datos.usuario, datos.clave);

      if (result.status === 'success') {
        saveSession(result.body.token);
        form.reset();
        window.location.assign('/');
        return 'keep-pending'; // navigation owns the pending state from here
      }

      // Errors finalize normally (form-manager handles pendingBtn.finalizar).

      if (result.status === 'network_failure') {
        // Login is not a sale — nothing gets queued (plan-features Fase 1).
        showError('No se pudo conectar, revisa tu conexión.');
        return;
      }

      if (result.error === 'credenciales_invalidas') {
        showError('Usuario o contraseña incorrectos.');
        return;
      }

      showError('No se pudo iniciar sesión, intenta de nuevo.');
    },
  });
}

