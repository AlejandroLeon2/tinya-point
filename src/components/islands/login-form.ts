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

import { login } from '../../api/actions/auth';
import { saveSession } from '../../stores/session';
import { hasLoginFields } from '../../utils/validators';

const form = document.querySelector<HTMLFormElement>('[data-login-form]');

if (form) {
  const error = form.querySelector<HTMLElement>('[data-login-error]');
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  const showError = (message: string): void => {
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  };

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

    if (submit) submit.disabled = true;
    const result = await login(usuario, clave);
    if (submit) submit.disabled = false;

    if (result.status === 'success') {
      saveSession(result.body.token);
      form.reset();
      window.location.assign('/');
      return;
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
