// Caja screen behavior (plan-mejoras-2.md Fase 2 + refactorUI §5 / T3.7) —
// LOCAL FIRST, network second: the open/closed state always comes from the
// local `cajas` key (6th key, utils/storage.ts); the "Cajas" Sheet row is
// the backup (decision D1, base.md §2.4). Rules:
//   - Only ONE caja abierta — a client-side rule (§4.6: the Sheet does not
//     enforce it). An open session from ANOTHER day hides the apertura form
//     and shows its summary with an aviso + a direct "Cerrar caja anterior"
//     action that opens the cierre modal through the resumen trigger.
//   - Estado como cabecera (spec §5): StatusPill "Caja abierta desde HH:MM
//     (hace X h Y min)" ⇔ "Sin caja abierta" — visibility swap only.
//   - StatCard grid: Apertura · Ventas del día (S/ + N) · desglose por
//     método · Efectivo esperado (destacado). Totals per method = LOCAL
//     historial of the caja's fecha_dia (same localDayKey as /historial —
//     never UTC).
//   - Cierre modal: "Esperado" on top + live difference while typing
//     (Faltan warning / Sobran info / Cuadra success, data-caja-diff); the
//     `Sí, cerrar` button has NO data-modal-close — only a valid close
//     dismisses the modal.
//   - Apertura form: suggested amount = the last monto_apertura (chip fills
//     the input). History: 10 most recent cajas (fecha, apertura, cierre,
//     diff pill) — same `cajas` key that feeds [data-hist-caja] on day
//     cards, so no extra wiring.
//   - Money compares at 2 decimals: Math.round(x * 100) / 100 (gotcha G4).
//   - network_failure/unauthorized → cola_sync replay (new queue types);
//     api_error → simple Spanish alert, never raw codes (§5.7), no retries.
// Hooks are data-* scoped to [data-caja-root]; feedback via ui/Alert + Toast.

import { abrirCaja, cerrarCaja } from '../../api/actions/caja';
import type { DatosAbrirCaja, DatosCerrarCaja } from '../../api/types';
import { round2, totalesDelDia } from '../../utils/caja';
import {
  formatCurrency,
  formatDia,
  formatHora,
  formatTranscurrido,
  localDayKey,
} from '../../utils/format';
import {
  limpiarErrorCampo,
  limpiarErroresForm,
  mostrarErrorCampo,
  observarCampo,
} from '../../utils/form-errors';
import { closeModal } from '../../utils/modal';
import { getCajas, setCajas, type CajaLocal } from '../../utils/storage';
import { mostrarToast } from '../../utils/toast';
import { enqueue } from '../../stores/syncQueue';

const root = document.querySelector<HTMLElement>('[data-caja-root]');

if (root) {
  const formApertura = root.querySelector<HTMLFormElement>('[data-caja-form]');
  const montoInput = root.querySelector<HTMLInputElement>('[data-caja-monto]');
  const sugWrap = root.querySelector<HTMLElement>('[data-caja-sugerencias]');
  const sugBtn = root.querySelector<HTMLButtonElement>('[data-caja-sugerencia]');

  // header pill (estado como cabecera — spec §5)
  const pillAbierta = root.querySelector<HTMLElement>('[data-caja-pill-abierta]');
  const pillCerrada = root.querySelector<HTMLElement>('[data-caja-pill-cerrada]');
  const pillHora = root.querySelector<HTMLElement>('[data-caja-pill-hora]');
  const pillHace = root.querySelector<HTMLElement>('[data-caja-pill-hace]');

  const resumen = root.querySelector<HTMLElement>('[data-caja-resumen]');
  const statApertura = root.querySelector<HTMLElement>('[data-caja-stat-apertura]');
  const statVentas = root.querySelector<HTMLElement>('[data-caja-stat-ventas]');
  const statEsperado = root.querySelector<HTMLElement>('[data-caja-stat-esperado]');
  const metodoEfectivo = root.querySelector<HTMLElement>('[data-caja-metodo-efectivo]');
  const metodoTarjeta = root.querySelector<HTMLElement>('[data-caja-metodo-tarjeta]');
  const metodoYapePlin = root.querySelector<HTMLElement>('[data-caja-metodo-yape-plin]');

  const histWrap = root.querySelector<HTMLElement>('[data-caja-historial-wrap]');
  const histList = root.querySelector<HTMLElement>('[data-caja-historial]');
  const plantillaRow = root.querySelector<HTMLTemplateElement>('[data-caja-row]');

  const modalRoot = root.querySelector<HTMLElement>('[data-modal-root="cerrar-caja"]');
  const abrirModalBtn = root.querySelector<HTMLElement>('[data-modal-open="cerrar-caja"]');
  const esperadoModal = root.querySelector<HTMLElement>('[data-caja-esperado-modal]');
  const conteoInput = root.querySelector<HTMLInputElement>('[data-caja-conteo]');
  const diffBox = root.querySelector<HTMLElement>('[data-caja-diff]');
  const diffCuadra = root.querySelector<HTMLElement>('[data-caja-diff-cuadra]');
  const diffFaltan = root.querySelector<HTMLElement>('[data-caja-diff-faltan]');
  const diffFaltanValor = root.querySelector<HTMLElement>('[data-caja-diff-faltan-valor]');
  const diffSobran = root.querySelector<HTMLElement>('[data-caja-diff-sobran]');
  const diffSobranValor = root.querySelector<HTMLElement>('[data-caja-diff-sobran-valor]');
  const modalError = root.querySelector<HTMLElement>('[data-caja-modal-error]');
  const confirmarBtn = root.querySelector<HTMLButtonElement>('[data-caja-confirmar]');

  const errorAlert = root.querySelector<HTMLElement>('[data-alert="caja-error"]');
  const errorText = root.querySelector<HTMLElement>('[data-caja-error-text]');
  const avisoAlert = root.querySelector<HTMLElement>('[data-alert="caja-aviso"]');
  const avisoText = root.querySelector<HTMLElement>('[data-caja-aviso-text]');
  const btnCerrarAnterior = root.querySelector<HTMLButtonElement>('[data-caja-cerrar-anterior]');
  const cierreAlert = root.querySelector<HTMLElement>('[data-alert="caja-cierre"]');
  const cierreText = root.querySelector<HTMLElement>('[data-caja-cierre-text]');

  // §12 / T4.2 — Esc cierra cualquier modal, PERO cerrar-caja con input
  // inválido es la excepción (misma regla que el botón "Sí, cerrar": solo
  // un cierre válido descarta). Capture sobre la raíz ⇒ el handler
  // document-level de utils/modal.ts ni siquiera ve el evento; con input
  // válido el Escape burbujea y cierra con retorno de foco normal.
  modalRoot?.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      const raw = conteoInput?.value.trim() ?? '';
      const valido = raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0;
      if (valido) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  // P0 guard for the Sheet backup calls (plan-form-ux.md Fase 1).
  let enVueloCaja = false;

  function cajaAbierta(): CajaLocal | null {
    return getCajas().find((caja) => caja.estado === 'abierta') ?? null;
  }

  function esperadoDe(caja: CajaLocal): number {
    const totales = totalesDelDia(caja.fecha_dia);
    return round2(caja.monto_apertura + totales.efectivo_ventas);
  }

  function mostrarOk(texto: string): void {
    // Success = ephemeral toast (refactorUI §2.3 D9 — no layout shift) and
    // an announcement for the TopBar pill to repaint without a reload.
    if (errorAlert) errorAlert.hidden = true;
    if (cierreAlert) cierreAlert.hidden = true;
    mostrarToast(texto);
    document.dispatchEvent(new CustomEvent('caja:state-changed'));
  }

  function mostrarError(texto: string): void {
    if (cierreAlert) cierreAlert.hidden = true;
    if (errorText) errorText.textContent = texto;
    if (errorAlert) errorAlert.hidden = false;
  }

  function mostrarCierre(texto: string): void {
    if (errorAlert) errorAlert.hidden = true;
    if (cierreText) cierreText.textContent = texto;
    if (cierreAlert) cierreAlert.hidden = false;
    // The close result still updates the TopBar pill (closed state).
    document.dispatchEvent(new CustomEvent('caja:state-changed'));
  }

  function mensajeDeError(error: string): string {
    switch (error) {
      case 'payload_invalido':
        return 'Revisá los datos de la caja.';
      case 'accion_no_soportada':
        return 'El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script.';
      default:
        return 'No se pudo guardar la caja. Intentá de nuevo.';
    }
  }

  // StatCard repaint: value always; subtext ONLY when the caller passes it
  // (undefined = leave the static subtexto prop alone — T3.7).
  function pintarStat(card: HTMLElement | null, valor: string, sub?: string): void {
    if (!card) return;
    const v = card.querySelector<HTMLElement>('[data-stat-value]');
    if (v) v.textContent = valor;
    if (sub === undefined) return;
    const s = card.querySelector<HTMLElement>('[data-stat-sub]');
    if (!s) return;
    if (sub) {
      s.textContent = sub;
      s.hidden = false;
    } else {
      s.hidden = true;
    }
  }

  // Sugerido = último monto de apertura (spec §5) — visible only while the
  // form is (no open session) AND there is a previous session to remember.
  function pintarSugerencia(): void {
    if (!sugWrap || !sugBtn) return;
    const anterior = [...getCajas()].sort(
      (a, b) =>
        new Date(b.fecha_hora_apertura).getTime() - new Date(a.fecha_hora_apertura).getTime(),
    )[0];
    const mostrar = cajaAbierta() === null && anterior !== undefined;
    sugWrap.hidden = !mostrar;
    if (anterior) {
      sugBtn.textContent = formatCurrency(anterior.monto_apertura);
      sugBtn.dataset.monto = String(anterior.monto_apertura);
    }
  }

  // History: open session first, then closed by cierre desc — 10 max, rows
  // cloned from the <template> (visibility-only pill swap, §0.4).
  function pintarHistorial(): void {
    if (!histWrap || !histList || !plantillaRow) return;
    const cajas = [...getCajas()]
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado === 'abierta' ? -1 : 1;
        const ta = new Date(a.fecha_hora_cierre ?? a.fecha_hora_apertura).getTime();
        const tb = new Date(b.fecha_hora_cierre ?? b.fecha_hora_apertura).getTime();
        return tb - ta;
      })
      .slice(0, 10);
    histList.replaceChildren();
    for (const caja of cajas) {
      const fila = plantillaRow.content.cloneNode(true) as DocumentFragment;
      const fechaEl = fila.querySelector<HTMLElement>('[data-caja-row-fecha]');
      if (fechaEl) fechaEl.textContent = formatDia(caja.fecha_dia);
      const montosEl = fila.querySelector<HTMLElement>('[data-caja-row-montos]');
      if (montosEl) {
        const apertura = formatCurrency(caja.monto_apertura);
        montosEl.textContent =
          caja.estado === 'abierta'
            ? `Apertura ${apertura}`
            : `Apertura ${apertura} · Cierre ${formatCurrency(caja.conteo_cierre ?? 0)}`;
      }
      const estado =
        caja.estado === 'abierta'
          ? 'curso'
          : typeof caja.diferencia === 'number'
            ? caja.diferencia === 0
              ? 'cuadra'
              : caja.diferencia < 0
                ? 'faltan'
                : 'sobran'
            : null;
      fila.querySelectorAll<HTMLElement>('[data-caja-row-diff]').forEach((el) => {
        el.hidden = el.getAttribute('data-caja-row-diff') !== estado;
      });
      if ((estado === 'faltan' || estado === 'sobran') && typeof caja.diferencia === 'number') {
        const valorEl = fila.querySelector<HTMLElement>(
          estado === 'faltan' ? '[data-caja-row-faltan-valor]' : '[data-caja-row-sobran-valor]',
        );
        if (valorEl) valorEl.textContent = formatCurrency(Math.abs(caja.diferencia));
      }
      histList.append(fila);
    }
    histWrap.hidden = cajas.length === 0;
  }

  // Live difference inside the cierre modal (spec §5): recomputed on every
  // keystroke over the CURRENT day totals — same math as the real close.
  function pintarDiff(): void {
    const abierta = cajaAbierta();
    const raw = conteoInput?.value.trim() ?? '';
    const valido = raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0;
    if (!diffBox) return;
    if (!abierta || !valido) {
      diffBox.hidden = true;
      return;
    }
    const diferencia = round2(Number(raw) - esperadoDe(abierta));
    diffBox.hidden = false;
    if (diffCuadra) diffCuadra.hidden = diferencia !== 0;
    if (diffFaltan) diffFaltan.hidden = diferencia >= 0;
    if (diffSobran) diffSobran.hidden = diferencia <= 0;
    if (diferencia < 0 && diffFaltanValor) {
      diffFaltanValor.textContent = formatCurrency(Math.abs(diferencia));
    }
    if (diferencia > 0 && diffSobranValor) {
      diffSobranValor.textContent = formatCurrency(diferencia);
    }
  }

  function render(): void {
    const abierta = cajaAbierta();
    if (formApertura) formApertura.hidden = abierta !== null;
    if (resumen) resumen.hidden = abierta === null;
    if (pillAbierta) pillAbierta.hidden = abierta === null;
    if (pillCerrada) pillCerrada.hidden = abierta !== null;
    pintarSugerencia();
    pintarHistorial();

    if (!abierta) {
      if (avisoAlert) avisoAlert.hidden = true;
      return;
    }

    // Header pill: desde HH:MM + transcurrido (repainted on focus — no
    // polling, same rule as the "ventas del día en vivo" below).
    if (pillHora) pillHora.textContent = formatHora(abierta.fecha_hora_apertura);
    if (pillHace) {
      pillHace.textContent = `(hace ${formatTranscurrido(abierta.fecha_hora_apertura)})`;
    }

    // Only ONE open caja (client rule): another-day session blocks the form
    // and the summary offers closing it first ("Primero cerrá la caja
    // anterior" + a direct action — spec §5).
    const otroDia = abierta.fecha_dia !== localDayKey(new Date());
    if (avisoAlert) {
      avisoAlert.hidden = !otroDia;
      if (otroDia && avisoText) {
        avisoText.textContent = `Primero cerrá la caja anterior (del ${formatDia(abierta.fecha_dia)}).`;
      }
    }

    const totales = totalesDelDia(abierta.fecha_dia);
    const totalVentas = round2(
      totales.efectivo_ventas + totales.tarjeta_ventas + totales.yape_plin_ventas,
    );
    pintarStat(statApertura, formatCurrency(abierta.monto_apertura));
    pintarStat(statVentas, formatCurrency(totalVentas), `${totales.n_ventas} ventas`);
    pintarStat(statEsperado, formatCurrency(esperadoDe(abierta)));
    if (metodoEfectivo) metodoEfectivo.textContent = formatCurrency(totales.efectivo_ventas);
    if (metodoTarjeta) metodoTarjeta.textContent = formatCurrency(totales.tarjeta_ventas);
    if (metodoYapePlin) metodoYapePlin.textContent = formatCurrency(totales.yape_plin_ventas);
    if (esperadoModal) esperadoModal.textContent = formatCurrency(esperadoDe(abierta));
  }

  function debeEncolar(result: { status: string; error?: string }): boolean {
    return (
      result.status === 'network_failure' ||
      (result.status === 'api_error' && result.error === 'unauthorized')
    );
  }

  async function sincronizarAccion(
    tipo: 'abrirCaja' | 'cerrarCaja',
    payload: DatosAbrirCaja | DatosCerrarCaja,
  ): Promise<void> {
    // P0 re-entry guard (plan-form-ux.md): the local snapshot already
    // landed; a racing second call would just duplicate the Sheet backup.
    if (enVueloCaja) return;
    enVueloCaja = true;
    try {
      const resultado =
        tipo === 'abrirCaja'
          ? await abrirCaja(payload as DatosAbrirCaja)
          : await cerrarCaja(payload as DatosCerrarCaja);
      if (debeEncolar(resultado)) {
        // Spread into a plain object: enqueue() takes Record<string, unknown>
        // and interfaces have no index signature (same shape checkout enqueues).
        enqueue(tipo, { ...payload }); // offline/expired token → cola_sync replays FIFO
        return;
      }
      if (resultado.status === 'api_error') {
        // The local snapshot already saved — the Sheet backup just failed.
        mostrarError(mensajeDeError(resultado.error));
      }
    } finally {
      enVueloCaja = false;
    }
  }

  formApertura?.addEventListener('submit', (event) => {
    event.preventDefault();
    // Fresh attempt: drop stale inline errors before validating again.
    limpiarErroresForm(formApertura);
    const raw = montoInput?.value.trim() ?? '';
    // Raw emptiness first: Number('') is 0, which would pass as valid.
    if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      // P1 (plan-form-ux.md): the message lives under the field.
      if (montoInput) mostrarErrorCampo(montoInput, 'Ingresá un monto igual o mayor a 0.');
      montoInput?.focus();
      return;
    }

    const caja: CajaLocal = {
      id_caja: crypto.randomUUID(), // client id — local first, may be enqueued (§4.6)
      fecha_dia: localDayKey(new Date()),
      monto_apertura: round2(Number(raw)),
      estado: 'abierta',
      fecha_hora_apertura: new Date().toISOString(),
    };
    setCajas([caja, ...getCajas()]); // LOCAL FIRST — never wait for the Sheet
    render();
    mostrarOk('Caja abierta.');

    const payload: DatosAbrirCaja = {
      id_caja: caja.id_caja,
      fecha_día: caja.fecha_dia,
      monto_apertura: caja.monto_apertura,
    };
    void sincronizarAccion('abrirCaja', payload);
  });

  // The suggested amount fills the input and clears any stale inline error.
  sugBtn?.addEventListener('click', () => {
    const monto = Number(sugBtn.dataset.monto);
    if (montoInput && Number.isFinite(monto)) {
      montoInput.value = monto.toFixed(2);
      limpiarErrorCampo(montoInput);
    }
  });

  // Another-day aviso: go straight to the cierre modal by clicking the
  // resumen trigger — ONE reset path, and the document-level modal-controller
  // still receives the bubbling click.
  btnCerrarAnterior?.addEventListener('click', () => {
    abrirModalBtn?.click();
  });

  abrirModalBtn?.addEventListener('click', () => {
    // Fresh attempt every open: stale input/validation from a cancelled try.
    if (conteoInput) {
      conteoInput.value = '';
      limpiarErrorCampo(conteoInput);
    }
    if (modalError) modalError.hidden = true;
    pintarDiff(); // empty input → the live difference starts hidden
  });

  // Live difference while typing (spec §5) — every keystroke, no submit.
  conteoInput?.addEventListener('input', pintarDiff);

  confirmarBtn?.addEventListener('click', () => {
    const abierta = cajaAbierta();
    if (!abierta || !modalRoot) return;

    const raw = conteoInput?.value.trim() ?? '';
    if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      // P1 (plan-form-ux.md): inline under the field — visible INSIDE the
      // modal (the page-level alert sits behind the overlay anyway).
      if (conteoInput) mostrarErrorCampo(conteoInput, 'Ingresá el efectivo contado.');
      conteoInput?.focus();
      return;
    }

    const totales = totalesDelDia(abierta.fecha_dia);
    const esperado = esperadoDe(abierta);
    const contado = round2(Number(raw));
    const diferencia = round2(contado - esperado); // G4: compare at 2 decimals

    const cerrada: CajaLocal = {
      ...abierta,
      estado: 'cerrada',
      fecha_hora_cierre: new Date().toISOString(),
      conteo_cierre: contado,
      ...totales, // snapshot saved ONCE — never recalculated afterwards
      diferencia,
    };
    setCajas(getCajas().map((c) => (c.id_caja === cerrada.id_caja ? cerrada : c)));

    closeModal(modalRoot); // valid input → close, focus returns to the opener
    render();

    // Copy simple (plan: "Cuadra" / "Faltan S/ X" / "Sobran S/ X") — no codes.
    if (diferencia === 0) {
      mostrarOk('Caja cerrada. Cuadra.');
    } else if (diferencia < 0) {
      mostrarCierre(`Caja cerrada. Faltan ${formatCurrency(Math.abs(diferencia))}.`);
    } else {
      mostrarCierre(`Caja cerrada. Sobran ${formatCurrency(diferencia)}.`);
    }

    const payload: DatosCerrarCaja = {
      id_caja: cerrada.id_caja,
      conteo_cierre: contado,
      efectivo_ventas: totales.efectivo_ventas,
      tarjeta_ventas: totales.tarjeta_ventas,
      yape_plin_ventas: totales.yape_plin_ventas,
      n_ventas: totales.n_ventas,
      diferencia,
    };
    void sincronizarAccion('cerrarCaja', payload);
  });

  // "Ventas del día en vivo": recompute when the cashier comes back to the
  // tab — sales registered elsewhere land without a reload (no polling).
  window.addEventListener('focus', render);

  // Inline errors vanish as soon as the user retypes (plan-form-ux Fase 1).
  if (montoInput) observarCampo(montoInput);
  if (conteoInput) observarCampo(conteoInput);

  render(); // first paint from the local key
}
