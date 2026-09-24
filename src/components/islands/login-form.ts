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

import { login } from '../../api/actions/auth';
import { saveSession } from '../../stores/session';
import { getAjustes } from '../../utils/storage';
import { hasLoginFields } from '../../utils/validators';

const root = document.querySelector<HTMLElement>('[data-login-root]');
const form = document.querySelector<HTMLFormElement>('[data-login-form]');

if (form && root) {
  const error = form.querySelector<HTMLElement>('[data-login-error]');
  const submit = form.querySelector<HTMLButtonElement>('[data-login-submit]');
  const usuarioInput = form.querySelector<HTMLInputElement>('input[name="usuario"]');
  const claveInput = form.querySelector<HTMLInputElement>('input[name="clave"]');
  const toggle = form.querySelector<HTMLButtonElement>('[data-login-toggle]');
  const marca = root.querySelector<HTMLElement>('[data-login-marca]');
  const offlineNote = root.querySelector<HTMLElement>('[data-login-offline]');

  // The business name is a LOCAL preference — painted at boot, no network.
  const nombreLocal = getAjustes().nombre_local.trim();
  if (marca && nombreLocal) marca.textContent = nombreLocal;

  const showError = (message: string): void => {
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
    // §11: after an error the next attempt starts at the user field.
    usuarioInput?.focus();
  };

  // §11: the offline note travels with navigator.onLine — no polling.
  const pintarOnline = (): void => {
    if (offlineNote) offlineNote.hidden = navigator.onLine;
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

  const textoOriginal = submit?.textContent ?? 'Ingresar';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (error) error.hidden = true;

    const data = new FormData(form);
    const usuario = String(data.get('usuario') ?? '');
    const clave = String(data.get('clave') ?? '');

    if (!hasLoginFields(usuario, clave)) {
      showError('Completa usuario y contraseña.');
      return;
    }

    // P0 anti double-submit (§11): pending state covers pointer AND Enter.
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Ingresando…';
    }
    const result = await login(usuario, clave);

    if (result.status === 'success') {
      saveSession(result.body.token);
      form.reset();
      window.location.assign('/');
      return; // navigation owns the pending state from here
    }

    if (submit) {
      submit.disabled = false;
      submit.textContent = textoOriginal;
    }

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
  });
}
