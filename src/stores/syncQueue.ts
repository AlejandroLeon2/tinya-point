// cola_sync lifecycle — literal doc/extras.md §1, field by field:
//   - Shape: { id, tipo, payload, estado, intentos, ultimo_intento, creado }
//     (Spanish keys — wire/data contract stays Spanish, extras.md §7).
//   - FIFO, ONE at a time, never parallel (preserves sale order + Apps Script
//     execution quota).
//   - Triggers: immediate first attempt at enqueue, the browser `online`
//     event, and app open — NO constant polling (appscriptbase.md §5.3).
//   - Backoff: 5s → 30s → 2min → 2min, max 5 attempts → error_permanente.
//   - Success → mark sincronizado and REMOVE (history lives in
//     historial_ventas; the queue never accumulates successes).
//   - error_permanente → never retried alone, never silently deleted: strict
//     FIFO blocks behind it until the human retries or discards it (§6).
//   - unauthorized → item stays pendiente (not discarded, not fraud) and the
//     next trigger retries with the fresh token (client.ts already redirected
//     to login). Other api_error → error_permanente (retrying the same
//     rejected payload is pointless — human decides).
// Persist exclusively via utils/storage.ts (cola_sync). This manager is the
// only non-island caller of api/actions/ — allowed explicitly by the
// plan-features Fase 4 gate ("el gestor de cola llama a actions/").

import { actualizarStock } from '../api/actions/stock';
import { abrirCaja, cerrarCaja } from '../api/actions/caja';
import type { ApiResult } from '../api/client';
import type {
  DatosAbrirCaja,
  DatosActualizarStock,
  DatosCerrarCaja,
  DatosRegistrarVenta,
} from '../api/types';
import { registrarVenta } from '../api/actions/ventas';
import { startNetworkListener, subscribeNetworkStatus } from './session';
import { getColaSync, setColaSync, type ItemColaSync } from '../utils/storage';

type QueueListener = (items: ItemColaSync[]) => void;

// Module-level state only — listeners + a single-flight guard.
const listeners = new Set<QueueListener>();
const MAX_INTENTOS = 5;
// Wait BACKOFF_MS[n - 1] after attempt n fails (extras.md §1: 5s, 30s, 2min…).
const BACKOFF_MS = [5_000, 30_000, 120_000, 120_000];

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  const items = getColaSync();
  for (const listener of listeners) listener(items);
}

function persist(items: ItemColaSync[]): void {
  setColaSync(items);
  notify();
}

// SyncStatusIndicator subscribes here — updates come from store mutations,
// never from timers (extras.md §6).
export function subscribeQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(getColaSync()); // immediate first paint
  return () => {
    listeners.delete(listener);
  };
}

// First attempt is immediate; subsequent retries are scheduled from failures.
export function enqueue(
  tipo: ItemColaSync['tipo'],
  payload: Record<string, unknown>,
): void {
  const items = getColaSync();
  items.push({
    id: crypto.randomUUID(),
    tipo,
    payload,
    estado: 'pendiente',
    intentos: 0,
    ultimo_intento: null,
    creado: new Date().toISOString(),
  });
  persist(items);
  void processNext();
}

// Human decision — "Reintentar" on error_permanente items (extras.md §6).
export function retryFailed(): void {
  const items = getColaSync().map((item) =>
    item.estado === 'error_permanente'
      ? { ...item, estado: 'pendiente' as const, intentos: 0, ultimo_intento: null }
      : item,
  );
  persist(items);
  void processNext();
}

// Human decision — "Descartar", only ever called AFTER an explicit
// confirmation in the UI (stilesbase §5.5). Never automatic, never silent.
export function discardFailed(): void {
  persist(getColaSync().filter((item) => item.estado !== 'error_permanente'));
}

function send(item: ItemColaSync): Promise<ApiResult<unknown>> {
  // `as unknown as` — Record<string, unknown> has no declared overlap with
  // the specific payload shapes (the queue stores them type-erased on purpose).
  switch (item.tipo) {
    case 'registrarVenta':
      return registrarVenta(item.payload as unknown as DatosRegistrarVenta);
    case 'actualizarStock':
      return actualizarStock(item.payload as unknown as DatosActualizarStock);
    case 'abrirCaja':
      return abrirCaja(item.payload as unknown as DatosAbrirCaja);
    default:
      // cerrarCaja — the union has exactly four members.
      return cerrarCaja(item.payload as unknown as DatosCerrarCaja);
  }
}

function scheduleRetry(attemptos: number): void {
  if (timer !== null) return; // one pending backoff at a time
  const index = Math.min(Math.max(attemptos - 1, 0), BACKOFF_MS.length - 1);
  timer = setTimeout(() => {
    timer = null;
    void processNext();
  }, BACKOFF_MS[index]);
}

// Strict FIFO: the FIRST array item is the head. error_permanente heads
// block the whole queue (human decision before later sales reach the Sheet —
// order of ventas matters). Single-flight via `running`.
async function processNext(): Promise<void> {
  if (running) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return; // wait for 'online'
  running = true;
  try {
    for (;;) {
      const items = getColaSync();
      const head = items[0];
      if (!head) break;
      if (head.estado === 'error_permanente') break; // human decision blocks FIFO
      if (head.estado === 'enviando') head.estado = 'pendiente'; // crash recovery

      // Head is pendiente — mark enviando BEFORE the network call.
      const inFlight: ItemColaSync = {
        ...head,
        estado: 'enviando',
        intentos: head.intentos + 1,
        ultimo_intento: new Date().toISOString(),
      };
      items[0] = inFlight;
      persist(items);

      const result = await send(inFlight);

      // Re-read: the UI may have mutated the queue while the call ran.
      const latest = getColaSync();
      const current = latest[0];
      if (!current || current.id !== inFlight.id) continue;

      if (result.status === 'success') {
        latest.shift(); // success = remove (never accumulates here)
        persist(latest);
        continue; // FIFO: next item immediately, still one at a time
      }

      if (result.status === 'network_failure') {
        if (current.intentos >= MAX_INTENTOS) {
          current.estado = 'error_permanente';
          persist(latest);
          break;
        }
        current.estado = 'pendiente';
        persist(latest);
        scheduleRetry(current.intentos);
        break;
      }

      // api_error:
      if (result.error === 'unauthorized') {
        // Stays pendiente — not discarded, not fraud (plan Fase 4). Unwind
        // the attempt count so auth failures never drive items to
        // error_permanente; client.ts already redirected to login and the
        // next trigger (login → reopen, or `online`) retries with the new token.
        current.estado = 'pendiente';
        current.intentos = Math.max(0, current.intentos - 1);
        persist(latest);
        break;
      }
      // payload_invalido / error_interno / etc: poison item — human decides.
      current.estado = 'error_permanente';
      persist(latest);
      break;
    }
  } finally {
    running = false;
  }
}

// Triggers, wired once when the module first loads on the client (the import
// happens from islands/checkout.ts and islands/sync-status.ts — exactly the
// "client-side entry point" stores/session anticipated): `online` event +
// app open with a connection. No polling anywhere (appscriptbase.md §5.3).
if (typeof window !== 'undefined') {
  startNetworkListener();
  subscribeNetworkStatus((status) => {
    if (status === 'online') void processNext();
  });
  void processNext();
}
