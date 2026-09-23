// Service worker registration + non-intrusive update prompt
// (doc/extras.md §2): NEVER reload silently — a refresh mid-sale could lose
// data, so the user decides when to apply the update.

import { registerSW } from 'virtual:pwa-register';

function mostrarAvisoActualizacion(): void {
  // Guard against a second prompt if onNeedRefresh fires again.
  if (document.querySelector('[data-aviso-actualizacion]')) return;

  const aviso = document.createElement('div');
  aviso.setAttribute('data-aviso-actualizacion', '');
  aviso.setAttribute('role', 'status');
  aviso.className =
    'fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 ' +
    'border-t border-border bg-surface px-4 py-3 text-base text-text';

  const texto = document.createElement('span');
  texto.textContent = 'Hay una actualización disponible';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-primary';
  boton.textContent = 'Actualizar ahora';

  aviso.append(texto, boton);
  document.body.appendChild(aviso);

  boton.addEventListener('click', () => {
    boton.disabled = true;
    boton.textContent = 'Actualizando…';
    // Applies the waiting SW and reloads — only ever after this click.
    void aplicarActualizacion();
  });
}

const aplicarActualizacion = registerSW({
  immediate: true,
  onNeedRefresh: mostrarAvisoActualizacion,
});
