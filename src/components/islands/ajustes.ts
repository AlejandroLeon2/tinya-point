// Settings behavior (plan-productos-v2.md Fase 5, D4): fill the form from
// getAjustes() and persist with setAjustes() — the ONLY writer of the
// `ajustes` localStorage key besides storage.ts itself. Local-only page:
// zero fetch, zero api imports. On success the page reloads so every
// already-painted label (IGV %, currency symbols) re-reads the new rate —
// the build-time defaults in static HTML are overwritten by their islands
// on the next load. Hooks are data-* only; no auto-retries needed (no net).
//
// T3.10 (refactorUI §10):
//   - live preview "S/ 118.00 = S/ 100.00 + IGV S/ 18.00" from the TYPED
//     moneda/tasa (storage only supplies the fallback while editing);
//   - sticky dirty bar: visible ⇔ the form differs from the snapshot taken
//     at load; Guardar → form.requestSubmit(), Descartar → restore snapshot;
//   - "Sesión y dispositivo": cola_sync length + last local attempt
//     (deviation y — no persisted last-SUCCESS key exists, so the stamp is
//     the latest `ultimo_intento`/`creado`) + app version from package.json.

import {
  limpiarErroresForm,
  mostrarErrorCampo,
  observarCampo,
} from '../../utils/form-errors';
import { getAjustes, getColaSync, setAjustes, type Ajustes } from '../../utils/storage';
import { formatHora } from '../../utils/format';
import { mostrarToast } from '../../utils/toast';
import { isNonEmpty } from '../../utils/validators';
import pkg from '../../../package.json';

const root = document.querySelector<HTMLElement>('[data-ajustes-root]');

if (root) {
  const form = root.querySelector<HTMLFormElement>('[data-ajustes-form]');
  const nombreInput = root.querySelector<HTMLInputElement>('[data-ajustes-nombre]');
  const monedaInput = root.querySelector<HTMLInputElement>('[data-ajustes-moneda]');
  const igvInput = root.querySelector<HTMLInputElement>('[data-ajustes-igv]');
  const stockAlertaInput = root.querySelector<HTMLInputElement>('[data-ajustes-stock-alerta]');
  const errorAlert = root.querySelector<HTMLElement>('[data-alert="ajustes-error"]');
  const errorText = root.querySelector<HTMLElement>('[data-ajustes-error-text]');
  const preview = root.querySelector<HTMLElement>('[data-ajustes-preview]');
  const dirtyBar = root.querySelector<HTMLElement>('[data-ajustes-dirty]');
  const guardarBtn = root.querySelector<HTMLButtonElement>('[data-ajustes-guardar]');
  const descartarBtn = root.querySelector<HTMLButtonElement>('[data-ajustes-descartar]');
  const colaEl = root.querySelector<HTMLElement>('[data-ajustes-cola]');
  const ultimaSyncEl = root.querySelector<HTMLElement>('[data-ajustes-ultima-sync]');
  const versionEl = root.querySelector<HTMLElement>('[data-ajustes-version]');

  // Snapshot of the values loaded at boot — the dirty bar compares against
  // THIS, never against storage (storage only changes on save).
  let cargados: Ajustes = getAjustes();

  function mostrarOk(mensaje: string): void {
    // Success = ephemeral toast (refactorUI §2.3 D9 — no layout shift);
    // errors keep the persistent Alert below.
    mostrarToast(mensaje);
    if (errorAlert) errorAlert.hidden = true;
  }

  function mostrarError(mensaje: string): void {
    if (errorText) errorText.textContent = mensaje;
    if (errorAlert) errorAlert.hidden = false;
  }

  function actuales(): Ajustes {
    return {
      nombre_local: nombreInput?.value.trim() ?? '',
      moneda: monedaInput?.value.trim() ?? '',
      igv_tasa: Number(igvInput?.value),
      stock_alerta_min: Math.round(Number(stockAlertaInput?.value)),
      // Preserve the sidebar rail preference — full save of the Ajustes
      // interface; dropping it would reset the collapsed rail every time.
      sidebar_colapsado: getAjustes().sidebar_colapsado,
    };
  }

  function hayCambios(): boolean {
    const a = actuales();
    return (
      a.nombre_local !== cargados.nombre_local ||
      a.moneda !== cargados.moneda ||
      a.igv_tasa !== cargados.igv_tasa ||
      a.stock_alerta_min !== cargados.stock_alerta_min
    );
  }

  function pintarSuciedad(): void {
    if (dirtyBar) dirtyBar.hidden = !hayCambios();
  }

  // Live preview from the TYPED values; falls back to the loaded moneda
  // while the field is empty (the format never renders bare numbers).
  function pintarPreview(): void {
    if (!preview) return;
    const moneda = monedaInput?.value.trim() || cargados.moneda || 'S/';
    const tasaRaw = igvInput?.value ?? '';
    const tasa = tasaRaw === '' ? cargados.igv_tasa : Number(tasaRaw);
    const tasaValida = Number.isFinite(tasa) && tasa >= 0 && tasa <= 100 ? tasa : cargados.igv_tasa;
    const base = 100;
    const igv = (base * tasaValida) / 100;
    preview.textContent = `${moneda} ${base.toFixed(2)} = ${moneda} ${base.toFixed(2)} + IGV ${moneda} ${igv.toFixed(2)}`;
  }

  function pintarSesion(): void {
    const cola = getColaSync();
    if (colaEl) {
      colaEl.textContent = `${cola.length} pendiente${cola.length === 1 ? '' : 's'}`;
    }
    if (ultimaSyncEl) {
      if (cola.length === 0) {
        ultimaSyncEl.textContent = 'Sin pendientes';
      } else {
        // deviation y: no last-success key — latest local attempt/creation.
        const ultima = cola.reduce((a, b) => ((b.ultimo_intento ?? b.creado) >= (a.ultimo_intento ?? a.creado) ? b : a));
        const iso = ultima.ultimo_intento ?? ultima.creado;
        ultimaSyncEl.textContent = `${formatHora(iso)} (último intento)`;
      }
    }
    if (versionEl) versionEl.textContent = `v${pkg.version}`;
  }

  function llenar(): void {
    cargados = getAjustes();
    if (nombreInput) nombreInput.value = cargados.nombre_local;
    if (monedaInput) monedaInput.value = cargados.moneda;
    if (igvInput) igvInput.value = String(cargados.igv_tasa);
    if (stockAlertaInput) stockAlertaInput.value = String(cargados.stock_alerta_min);
    pintarPreview();
    pintarSuciedad();
  }

  // One delegated listener covers dirty-tracking + the live preview.
  form?.addEventListener('input', () => {
    pintarSuciedad();
    pintarPreview();
  });

  descartarBtn?.addEventListener('click', () => {
    form?.reset(); // back to the DOM defaults, then refill from the snapshot
    llenar();
    if (form) limpiarErroresForm(form);
    if (errorAlert) errorAlert.hidden = true;
    nombreInput?.focus();
  });

  guardarBtn?.addEventListener('click', () => {
    // The bar lives OUTSIDE the form — hand off to the real submit path
    // (same validation + pending state as pressing Enter in a field).
    form?.requestSubmit();
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    // Fresh attempt: drop stale inline errors before validating again.
    limpiarErroresForm(form);

    const nombre = nombreInput?.value.trim() ?? '';
    const moneda = monedaInput?.value.trim() ?? '';
    const igvRaw = igvInput?.value.trim() ?? '';
    const stockAlertaRaw = stockAlertaInput?.value.trim() ?? '';

    if (!isNonEmpty(moneda)) {
      // P1 (plan-form-ux.md): the message lives under the field.
      if (monedaInput) mostrarErrorCampo(monedaInput, 'Ingresá el símbolo de la moneda (ej: S/).');
      monedaInput?.focus();
      return;
    }
    // Raw emptiness first: Number('') is 0, which would pass as valid.
    const igv = Number(igvRaw);
    if (igvRaw === '' || !Number.isFinite(igv) || igv < 0 || igv > 100) {
      if (igvInput) mostrarErrorCampo(igvInput, 'Ingresá un porcentaje de IGV entre 0 y 100.');
      igvInput?.focus();
      return;
    }
    const stockAlerta = Number(stockAlertaRaw);
    if (
      stockAlertaRaw === '' ||
      !Number.isFinite(stockAlerta) ||
      stockAlerta < 0 ||
      stockAlerta > 999
    ) {
      if (stockAlertaInput) {
        mostrarErrorCampo(stockAlertaInput, 'Ingresá un número entre 0 y 999 para la alerta de stock.');
      }
      stockAlertaInput?.focus();
      return;
    }

    const ajustes: Ajustes = {
      nombre_local: nombre,
      moneda,
      igv_tasa: igv,
      stock_alerta_min: Math.round(stockAlerta),
      sidebar_colapsado: getAjustes().sidebar_colapsado,
    };

    // P0 (plan-form-ux.md): block re-entry + pending state while the save
    // and the reload window run — pattern of login-form.ts.
    if (guardarBtn) {
      guardarBtn.disabled = true;
      guardarBtn.textContent = 'Guardando…';
    }
    try {
      setAjustes(ajustes);
    } catch {
      // write() fail-softs internally, but never leave the button stuck.
      if (guardarBtn) {
        guardarBtn.disabled = false;
        guardarBtn.textContent = 'Guardar ajustes';
      }
      mostrarError('No se pudieron guardar los ajustes. Intentá de nuevo.');
      return;
    }

    mostrarOk('Ajustes guardados — recargando…');
    // Reload so every already-painted price/label re-reads the new settings
    // (static HTML was built with the defaults; islands repaint on load).
    window.setTimeout(() => window.location.reload(), 900);
  });

  // Inline errors vanish as soon as the user retypes (plan-form-ux Fase 1).
  if (monedaInput) observarCampo(monedaInput);
  if (igvInput) observarCampo(igvInput);
  if (stockAlertaInput) observarCampo(stockAlertaInput);

  llenar(); // first paint from storage (defaults when absent)
  pintarSesion();
}
