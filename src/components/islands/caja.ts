// Caja screen behavior (plan-mejoras-2.md Fase 2) — LOCAL FIRST, network
// second: the open/closed state always comes from the local `cajas` key
// (6th key, utils/storage.ts); the "Cajas" Sheet row is the backup
// (decision D1, base.md §2.4). Rules:
//   - Only ONE caja abierta — a client-side rule (§4.6: the Sheet does not
//     enforce it). An open session from ANOTHER day hides the apertura form
//     and shows its summary with an aviso: the cashier closes it first.
//   - Totals per method at close are a SNAPSHOT over the LOCAL historial of
//     the caja's fecha_dia (same localDayKey as /historial — never UTC).
//   - Money compares at 2 decimals: Math.round(x * 100) / 100 (gotcha G4).
//   - network_failure/unauthorized → cola_sync replay (new queue types);
//     api_error → simple Spanish alert, never raw codes (§5.7), no retries.
// Hooks are data-* scoped to [data-caja-root]; feedback only via ui/Alert.

import { abrirCaja, cerrarCaja } from '../../api/actions/caja';
import type { DatosAbrirCaja, DatosCerrarCaja } from '../../api/types';
import { round2, totalesDelDia } from '../../utils/caja';
import { formatCurrency, formatDia, formatHora, localDayKey } from '../../utils/format';
import { closeModal } from '../../utils/modal';
import { getCajas, setCajas, type CajaLocal } from '../../utils/storage';
import { enqueue } from '../../stores/syncQueue';

const root = document.querySelector<HTMLElement>('[data-caja-root]');

if (root) {
  const formApertura = root.querySelector<HTMLFormElement>('[data-caja-form]');
  const montoInput = root.querySelector<HTMLInputElement>('[data-caja-monto]');
  const resumen = root.querySelector<HTMLElement>('[data-caja-resumen]');
  const resumenApertura = root.querySelector<HTMLElement>('[data-caja-monto-apertura]');
  const resumenHora = root.querySelector<HTMLElement>('[data-caja-hora-apertura]');
  const resumenVentas = root.querySelector<HTMLElement>('[data-caja-n-ventas]');
  const resumenEsperado = root.querySelector<HTMLElement>('[data-caja-esperado]');

  const modalRoot = root.querySelector<HTMLElement>('[data-modal-root="cerrar-caja"]');
  const abrirModalBtn = root.querySelector<HTMLElement>('[data-modal-open="cerrar-caja"]');
  const conteoInput = root.querySelector<HTMLInputElement>('[data-caja-conteo]');
  const modalError = root.querySelector<HTMLElement>('[data-caja-modal-error]');
  const confirmarBtn = root.querySelector<HTMLButtonElement>('[data-caja-confirmar]');

  const okAlert = root.querySelector<HTMLElement>('[data-alert="caja-ok"]');
  const okText = root.querySelector<HTMLElement>('[data-caja-ok-text]');
  const errorAlert = root.querySelector<HTMLElement>('[data-alert="caja-error"]');
  const errorText = root.querySelector<HTMLElement>('[data-caja-error-text]');
  const avisoAlert = root.querySelector<HTMLElement>('[data-alert="caja-aviso"]');
  const avisoText = root.querySelector<HTMLElement>('[data-caja-aviso-text]');
  const cierreAlert = root.querySelector<HTMLElement>('[data-alert="caja-cierre"]');
  const cierreText = root.querySelector<HTMLElement>('[data-caja-cierre-text]');

  function cajaAbierta(): CajaLocal | null {
    return getCajas().find((caja) => caja.estado === 'abierta') ?? null;
  }

  function mostrarOk(texto: string): void {
    if (errorAlert) errorAlert.hidden = true;
    if (cierreAlert) cierreAlert.hidden = true;
    if (okText) okText.textContent = texto;
    if (okAlert) okAlert.hidden = false;
  }

  function mostrarError(texto: string): void {
    if (okAlert) okAlert.hidden = true;
    if (cierreAlert) cierreAlert.hidden = true;
    if (errorText) errorText.textContent = texto;
    if (errorAlert) errorAlert.hidden = false;
  }

  function mostrarCierre(texto: string): void {
    if (okAlert) okAlert.hidden = true;
    if (errorAlert) errorAlert.hidden = true;
    if (cierreText) cierreText.textContent = texto;
    if (cierreAlert) cierreAlert.hidden = false;
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

  function render(): void {
    const abierta = cajaAbierta();
    if (formApertura) formApertura.hidden = abierta !== null;
    if (resumen) resumen.hidden = abierta === null;

    if (!abierta) {
      if (avisoAlert) avisoAlert.hidden = true;
      return;
    }

    // Only ONE open caja (client rule): another-day session blocks the form
    // and the summary offers closing it first ("Primero cerrá la caja anterior").
    const otroDia = abierta.fecha_dia !== localDayKey(new Date());
    if (avisoAlert) {
      avisoAlert.hidden = !otroDia;
      if (otroDia && avisoText) {
        avisoText.textContent = `Primero cerrá la caja anterior (del ${formatDia(abierta.fecha_dia)}).`;
      }
    }

    const totales = totalesDelDia(abierta.fecha_dia);
    if (resumenApertura) resumenApertura.textContent = formatCurrency(abierta.monto_apertura);
    if (resumenHora) resumenHora.textContent = formatHora(abierta.fecha_hora_apertura);
    if (resumenVentas) resumenVentas.textContent = String(totales.n_ventas);
    if (resumenEsperado) {
      resumenEsperado.textContent = formatCurrency(
        round2(abierta.monto_apertura + totales.efectivo_ventas),
      );
    }
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
  }

  formApertura?.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = montoInput?.value.trim() ?? '';
    // Raw emptiness first: Number('') is 0, which would pass as valid.
    if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      mostrarError('Ingresá un monto igual o mayor a 0.');
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

  abrirModalBtn?.addEventListener('click', () => {
    // Fresh attempt every open: stale input/validation from a cancelled try.
    if (conteoInput) conteoInput.value = '';
    if (modalError) modalError.hidden = true;
  });

  confirmarBtn?.addEventListener('click', () => {
    const abierta = cajaAbierta();
    if (!abierta || !modalRoot) return;

    const raw = conteoInput?.value.trim() ?? '';
    if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      // Validation INSIDE the modal — the page alert sits behind the overlay.
      if (modalError) {
        modalError.textContent = 'Ingresá el efectivo contado.';
        modalError.hidden = false;
      }
      conteoInput?.focus();
      return;
    }

    const totales = totalesDelDia(abierta.fecha_dia);
    const esperado = round2(abierta.monto_apertura + totales.efectivo_ventas);
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

  render(); // first paint from the local key
}
