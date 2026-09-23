// Settings behavior (plan-productos-v2.md Fase 5, D4): fill the form from
// getAjustes() and persist with setAjustes() — the ONLY writer of the
// `ajustes` localStorage key besides storage.ts itself. Local-only page:
// zero fetch, zero api imports. On success the page reloads so every
// already-painted label (IGV %, currency symbols) re-reads the new rate —
// the build-time defaults in static HTML are overwritten by their islands
// on the next load. Hooks are data-* only; no auto-retries needed (no net).

import { getAjustes, setAjustes, type Ajustes } from '../../utils/storage';
import { isNonEmpty } from '../../utils/validators';

const root = document.querySelector<HTMLElement>('[data-ajustes-root]');

if (root) {
  const form = root.querySelector<HTMLFormElement>('[data-ajustes-form]');
  const nombreInput = root.querySelector<HTMLInputElement>('[data-ajustes-nombre]');
  const monedaInput = root.querySelector<HTMLInputElement>('[data-ajustes-moneda]');
  const igvInput = root.querySelector<HTMLInputElement>('[data-ajustes-igv]');
  const okAlert = root.querySelector<HTMLElement>('[data-alert="ajustes-ok"]');
  const errorAlert = root.querySelector<HTMLElement>('[data-alert="ajustes-error"]');
  const okText = root.querySelector<HTMLElement>('[data-ajustes-ok-text]');
  const errorText = root.querySelector<HTMLElement>('[data-ajustes-error-text]');

  function mostrarOk(mensaje: string): void {
    if (okText) okText.textContent = mensaje;
    if (okAlert) okAlert.hidden = false;
    if (errorAlert) errorAlert.hidden = true;
  }

  function mostrarError(mensaje: string): void {
    if (errorText) errorText.textContent = mensaje;
    if (errorAlert) errorAlert.hidden = false;
    if (okAlert) okAlert.hidden = true;
  }

  function llenar(): void {
    const ajustes = getAjustes();
    if (nombreInput) nombreInput.value = ajustes.nombre_local;
    if (monedaInput) monedaInput.value = ajustes.moneda;
    if (igvInput) igvInput.value = String(ajustes.igv_tasa);
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();

    const nombre = nombreInput?.value.trim() ?? '';
    const moneda = monedaInput?.value.trim() ?? '';
    const igvRaw = igvInput?.value.trim() ?? '';

    if (!isNonEmpty(moneda)) {
      mostrarError('Ingresá el símbolo de la moneda (ej: S/).');
      monedaInput?.focus();
      return;
    }
    // Raw emptiness first: Number('') is 0, which would pass as valid.
    const igv = Number(igvRaw);
    if (igvRaw === '' || !Number.isFinite(igv) || igv < 0 || igv > 100) {
      mostrarError('Ingresá un porcentaje de IGV entre 0 y 100.');
      igvInput?.focus();
      return;
    }

    const ajustes: Ajustes = {
      nombre_local: nombre,
      moneda,
      igv_tasa: igv,
    };
    setAjustes(ajustes);

    mostrarOk('Ajustes guardados — recargando…');
    // Reload so every already-painted price/label re-reads the new settings
    // (static HTML was built with the defaults; islands repaint on load).
    window.setTimeout(() => window.location.reload(), 900);
  });

  llenar(); // first paint from storage (defaults when absent)
}
