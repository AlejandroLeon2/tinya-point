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
//     the latest `ultimo_intento`/`creado`) + app version from package.json;
//   - "Limpiar caché": opens the ui/Modal confirmation, then
//     storage.limpiarCaches() (two rebuildable keys only) — still zero API:
//     the caches repopulate on the next page that needs them.

import {
  getAjustes,
  getColaSync,
  limpiarCaches,
  setAjustes,
  type Ajustes,
} from '../../../utils/storage';
import { formatHora } from '../../../utils/format';
import { isNonEmpty } from '../../../utils/validators';
import { qs, setText, setHidden } from '../../../utils/dom';
import { crearFeedback } from '../../../utils/feedback';
import { crearPendingButton } from '../../../utils/pending-button';
import { createFormManager } from '../../../utils/form-manager';
import pkg from '../../../../package.json';

const root = qs<HTMLElement>(document, '[data-ajustes-root]');

if (root) {
  const form = qs<HTMLFormElement>(root, '[data-ajustes-form]');
  const nombreInput = qs<HTMLInputElement>(root, '[data-ajustes-nombre]');
  const monedaInput = qs<HTMLInputElement>(root, '[data-ajustes-moneda]');
  const igvInput = qs<HTMLInputElement>(root, '[data-ajustes-igv]');
  const stockAlertaInput = qs<HTMLInputElement>(root, '[data-ajustes-stock-alerta]');
  const errorAlert = qs<HTMLElement>(root, '[data-alert="ajustes-error"]');
  const errorText = qs<HTMLElement>(root, '[data-ajustes-error-text]');
  const preview = qs<HTMLElement>(root, '[data-ajustes-preview]');
  const dirtyBar = qs<HTMLElement>(root, '[data-ajustes-dirty]');
  const guardarBtn = qs<HTMLButtonElement>(root, '[data-ajustes-guardar]');
  const descartarBtn = qs<HTMLButtonElement>(root, '[data-ajustes-descartar]');
  const colaEl = qs<HTMLElement>(root, '[data-ajustes-cola]');
  const ultimaSyncEl = qs<HTMLElement>(root, '[data-ajustes-ultima-sync]');
  const versionEl = qs<HTMLElement>(root, '[data-ajustes-version]');
  const limpiarCacheBtn = qs<HTMLButtonElement>(root, '[data-ajustes-limpiar-cache]');
  const confirmarLimpiarBtn = qs<HTMLButtonElement>(root, '[data-ajustes-confirmar-limpiar-cache]');
  const cacheOfflineNote = qs<HTMLElement>(root, '[data-ajustes-cache-offline]');

  // Snapshot of the values loaded at boot — the dirty bar compares against
  // THIS, never against storage (storage only changes on save).
  let cargados: Ajustes = getAjustes();

  const feedback = crearFeedback(errorAlert, errorText);
  const pendingBtn = crearPendingButton(guardarBtn, 'Guardando…');

  interface DatosAjustesForm {
    nombre: string;
    moneda: string;
    igv: number;
    stockAlerta: number;
  }

  const formManager = createFormManager<DatosAjustesForm>({
    form,
    pendingBtn,
    schema: {
      nombre: {
        el: nombreInput,
        optional: true,
      },
      moneda: {
        el: monedaInput,
        validate: isNonEmpty,
        error: 'Ingresá el símbolo de la moneda (ej: S/).',
      },
      igv: {
        el: igvInput,
        validate: (raw) => raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 100,
        error: 'Ingresá un porcentaje de IGV entre 0 y 100.',
        transform: (raw) => Number(raw),
      },
      stockAlerta: {
        el: stockAlertaInput,
        validate: (raw) =>
          raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 999,
        error: 'Ingresá un número entre 0 y 999 para la alerta de stock.',
        transform: (raw) => Math.round(Number(raw)),
      },
    },
    onSubmit: (datos) => {
      const ajustes: Ajustes = {
        nombre_local: datos.nombre,
        moneda: datos.moneda,
        igv_tasa: datos.igv,
        stock_alerta_min: datos.stockAlerta,
        sidebar_colapsado: getAjustes().sidebar_colapsado,
      };

      try {
        setAjustes(ajustes);
      } catch {
        feedback.error('No se pudieron guardar los ajustes. Intentá de nuevo.');
        return;
      }

      feedback.ok('Ajustes guardados — recargando…');
      // Reload so every already-painted price/label re-reads the new settings
      // (static HTML was built with the defaults; islands repaint on load).
      window.setTimeout(() => window.location.reload(), 900);
      return 'keep-pending';
    },
  });

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
    setHidden(dirtyBar, !hayCambios());
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
    setText(colaEl, `${cola.length} pendiente${cola.length === 1 ? '' : 's'}`);
    if (ultimaSyncEl) {
      if (cola.length === 0) {
        setText(ultimaSyncEl, 'Sin pendientes');
      } else {
        // deviation y: no last-success key — latest local attempt/creation.
        const ultima = cola.reduce((a, b) => ((b.ultimo_intento ?? b.creado) >= (a.ultimo_intento ?? a.creado) ? b : a));
        const iso = ultima.ultimo_intento ?? ultima.creado;
        setText(ultimaSyncEl, `${formatHora(iso)} (último intento)`);
      }
    }
    setText(versionEl, `v${pkg.version}`);
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
    formManager.reset();
    llenar();
    feedback.ocultar();
    nombreInput?.focus();
  });

  guardarBtn?.addEventListener('click', () => {
    // The bar lives OUTSIDE the form — hand off to the real submit path
    // (same validation + pending state as pressing Enter in a field).
    form?.requestSubmit();
  });

  // ── Limpiar caché (26/09/2026) ────────────────────────────────────────
  // The TRIGGER only opens the ui/Modal confirmation; the work runs on
  // CONFIRM. storage.limpiarCaches() drops exactly two rebuildable keys —
  // catalogo_cache + historial_cache — and never the operational ones
  // (sesion_token, ajustes, historial_ventas, cola_sync, carrito_actual).
  // Offline is guarded the way categorias-admin guards its submit: with an
  // empty catalog cache, catalog.ts init() has nothing to paint and the POS
  // can't sell until the network returns. That guard closes only the
  // avoidable window — clearing online and THEN losing the connection
  // degrades exactly like any other offline load.
  confirmarLimpiarBtn?.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    limpiarCaches();
    feedback.ok('Caché limpiada — el catálogo y el historial se vuelven a bajar solos.');
  });

  function actualizarCacheOnline(): void {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    setHidden(cacheOfflineNote, !offline);
    if (limpiarCacheBtn) limpiarCacheBtn.disabled = offline;
  }
  window.addEventListener('online', actualizarCacheOnline);
  window.addEventListener('offline', actualizarCacheOnline);
  actualizarCacheOnline();

  llenar(); // first paint from storage (defaults when absent)
  pintarSesion();
}

