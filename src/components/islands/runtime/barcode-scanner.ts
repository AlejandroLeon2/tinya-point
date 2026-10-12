// Barcode scanner runtime (plan-camara-barras Fase 1): camera reading via
// @zxing/browser — 100% on-device, no external API ever sees a frame
// (restriction §5). Client-only module: imported by islands through Astro
// <script> bundles, NEVER from frontmatter (SSR guard: getUserMedia and the
// video element only exist in the browser).
//
// Contract with ui/BarcodeScanner.astro (data-* hooks, invariant 5):
//   root:   [data-barcode-scanner]   hidden overlay, z-60 (ABOVE the utils/
//           modal z-50 world: the scanner opens over the product DRAWER, so
//           it cannot ride utils/modal — one active modal at a time, and the
//           drawer must stay open underneath). It owns its own Escape/Tab
//           handling in CAPTURE phase so the drawer's trap never sees them.
//   video:  [data-barcode-scanner-video]
//   status: [data-barcode-scanner-status]  aria-live, "Buscando código…"
//   error:  [data-barcode-scanner-error]   role=alert, friendly Spanish copy
//   close:  [data-barcode-scanner-close]   "Cancelar" + the "✕"
//   retry:  [data-barcode-scanner-retry]   revealed after a start failure
//
// Lifecycle: abrirEscaneoBarcode({ onLeido }) -> getUserMedia (rear camera,
// ideal) -> continuous decode -> on FIRST result: stop tracks, close overlay,
// deliver the raw text. Cancel / Escape / start error / pagehide all stop
// the tracks — the camera is NEVER left running behind a closed overlay.
// Formats: EAN-13, EAN-8 and UPC-A first (commercial products), then
// CODE_128/UPC-E for internal SKU labels. The 1D-only reader keeps the PWA
// bundle small — product codes are 1D, 2D (QR/Aztec) would be dead weight.

import type { IScannerControls } from '@zxing/browser';
import type { DecodeHintType } from '@zxing/library';
import { normalizarBarcode } from '../../../utils/barcode';
import { qs, setHidden, setText } from '../../../utils/dom';

export interface OpcionesEscaneoBarcode {
  /** Called ONCE with the raw decoded text after a successful read. */
  onLeido: (codigo: string) => void;
}

// Module-level state only — no side effects at import time beyond querying
// the page's own overlay (the ui/BarcodeScanner contract).
const root = qs<HTMLElement>(document, '[data-barcode-scanner]');
const video = qs<HTMLVideoElement>(root, '[data-barcode-scanner-video]');
const statusEl = qs<HTMLElement>(root, '[data-barcode-scanner-status]');
const errorEl = qs<HTMLElement>(root, '[data-barcode-scanner-error]');
const retryBtn = qs<HTMLButtonElement>(root, '[data-barcode-scanner-retry]');

let controls: IScannerControls | null = null;
let onLeido: ((codigo: string) => void) | null = null;
let triggerAnterior: HTMLElement | null = null;
let cerrado = true;
// Session token: bumped on every open AND close. An in-flight iniciarCamara
// compares it after each await — closing while the camera is still starting
// used to leave the stream running forever (controls not assigned yet).
let sesion = 0;

// Spanish copy, simple words, never raw exception names (stilesbase 5.7).
function mensajeDeFallo(error: unknown): string {
  const nombre = error instanceof DOMException ? error.name : '';
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia) {
    return 'La cámara necesita una conexión segura (HTTPS) para funcionar.';
  }
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No se pudo usar la cámara: el permiso fue denegado. Revisa los permisos del navegador.';
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
    return 'No se encontró una cámara disponible en este dispositivo.';
  }
  if (nombre === 'NotReadableError' || nombre === 'AbortError') {
    return 'La cámara está ocupada por otra aplicación. Cierra la aplicación e intenta de nuevo.';
  }
  return 'No se pudo abrir la cámara. Intenta de nuevo.';
}

function mostrarError(mensaje: string): void {
  setText(errorEl, mensaje);
  setHidden(errorEl, false);
  setHidden(statusEl, true);
  setHidden(retryBtn, false);
}

function ocultarError(): void {
  setHidden(errorEl, true);
  setHidden(retryBtn, true);
}

/** Stop the camera tracks and detach the preview — safe to call twice. */
function detenerCamara(): void {
  if (controls) {
    // zxing's stop() ends the decode loop AND disposes the MediaStream
    // tracks + clears the video srcObject (BrowserCodeReader.scan).
    controls.stop();
    controls = null;
  }
  // Belt and suspenders: a close can RACE the start (see `sesion`), in which
  // case zxing already attached a live stream to the preview but never
  // returned its controls — stop those tracks by hand or the camera light
  // stays on behind a hidden overlay.
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) track.stop();
  }
  if (video) video.srcObject = null;
}

function cerrarEscanner(): void {
  if (cerrado) return;
  cerrado = true;
  sesion++; // invalidate any in-flight iniciarCamara
  detenerCamara();
  ocultarError();
  setHidden(statusEl, true);
  if (root) root.hidden = true;
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('pagehide', onSalirDePagina);
  onLeido = null;
  // Focus returns to the button that opened the scanner (same contract as
  // utils/modal close) — but only if it is still on the page.
  if (triggerAnterior && document.contains(triggerAnterior)) triggerAnterior.focus();
  triggerAnterior = null;
}

function entregar(codigo: string): void {
  const callback = onLeido;
  // Close FIRST: it stops the tracks and detaches the callback, so a slow
  // final frame can never fire a second delivery.
  cerrarEscanner();
  callback?.(codigo);
}

function onSalirDePagina(): void {
  // Navigation / tab switch: never leave a live camera behind. Full close
  // (not just detenerCamara) so an in-flight iniciarCamara is invalidated
  // too — bfcache can resume the page AFTER the pending await resolves.
  cerrarEscanner();
}

// Capture phase: Escape cancels the SCAN (not the drawer underneath) and Tab
// stays trapped inside the scanner overlay — the drawer's utils/modal keydown
// listener must never see either key while this overlay is on top.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focoVisible(): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    cerrarEscanner();
    return;
  }
  if (event.key !== 'Tab' || !root) return;
  const foco = focoVisible();
  if (foco.length === 0) return;
  const primero = foco[0];
  const ultimo = foco[foco.length - 1];
  const actual = document.activeElement;
  if (event.shiftKey) {
    if (actual === primero || !root.contains(actual)) {
      event.preventDefault();
      event.stopPropagation();
      ultimo.focus();
    }
    return;
  }
  if (actual === ultimo || !root.contains(actual)) {
    event.preventDefault();
    event.stopPropagation();
    primero.focus();
  }
}

async function iniciarCamara(): Promise<void> {
  if (!video || !root) return;
  const miSesion = ++sesion; // supersede any previous in-flight start (retry)
  ocultarError();
  setText(errorEl, '');
  setHidden(statusEl, false);
  setText(statusEl, 'Preparando la cámara…');

  try {
    // Dynamic import: zxing (~500 kB) joins the network ONLY when the cashier
    // actually taps the scan button — the PWA shell never pays for it, and
    // the "Preparando la cámara…" status covers the download on first use.
    const [{ BrowserMultiFormatOneDReader }, zxing] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    if (miSesion !== sesion) return; // closed while downloading zxing
    const { BarcodeFormat, DecodeHintType } = zxing;

    // Formats first: EAN-13/EAN-8/UPC-A (commercial), then CODE_128/UPC-E
    // (internal SKU labels). The 1D-only reader skips QR/Aztec dead weight.
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.CODE_128,
      BarcodeFormat.UPC_E,
    ]);

    const reader = new BrowserMultiFormatOneDReader(hints, {
      delayBetweenScanAttempts: 150,
    });
    const nuevosControles = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      video,
      (resultado, _error, controles) => {
        if (!resultado) return; // NotFoundException: keep scanning quietly
        const codigo = normalizarBarcode(resultado.getText());
        // Stop on the spot so the stream dies even if entregar() misbehaves.
        controles?.stop();
        if (codigo === '') return;
        entregar(codigo);
      },
    );
    if (miSesion !== sesion) {
      // Closed while getUserMedia was negotiating: kill the stream we just
      // received — this was the leak that left the camera light on.
      nuevosControles.stop();
      detenerCamara();
      return;
    }
    controls = nuevosControles;
    setText(statusEl, 'Busca el código de barras y centra el código en el marco.');
  } catch (error) {
    if (miSesion !== sesion) return; // superseded; the new start owns the UI
    detenerCamara();
    mostrarError(mensajeDeFallo(error));
  }
}

/**
 * Open the shared scanner overlay and deliver the first successfully read
 * barcode through `onLeido`. A no-op when the page has no
 * ui/BarcodeScanner instance (contract guard — the same way every island
 * guards its own hooks).
 */
export function abrirEscaneoBarcode(opciones: OpcionesEscaneoBarcode): void {
  if (!root || !video) return;
  if (!cerrado) return; // already open — one scanner at a time
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    // Secure-context guard: show the friendly message INSIDE the overlay so
    // the cashier still gets instructions instead of a silent no-op.
    cerrado = false;
    triggerAnterior =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.hidden = false;
    mostrarError(mensajeDeFallo(null));
    document.addEventListener('keydown', onKeydown, true);
    return;
  }

  cerrado = false;
  onLeido = opciones.onLeido;
  triggerAnterior =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.hidden = false;
  setHidden(statusEl, false);
  setText(statusEl, 'Preparando la cámara…');
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('pagehide', onSalirDePagina);
  // First visible control is the "✕" close — same first-focus rule as
  // utils/modal open (the retry button only exists after a failure).
  focoVisible()[0]?.focus();
  void iniciarCamara();
}

// Declarative wiring for the overlay's own buttons (one listener per hook).
root?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-barcode-scanner-close]')) cerrarEscanner();
  if (target.closest('[data-barcode-scanner-retry]')) void iniciarCamara();
});
