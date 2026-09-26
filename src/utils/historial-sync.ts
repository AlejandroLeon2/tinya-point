// Read-through + merge for the sales history (appscriptbase.md §4.15).
//
// The local list is ALWAYS the first paint — no spinner, no blank frame, no
// "esperando datos". A background call then refreshes it from the Sheet and
// the two sources are MERGED, never replaced:
//
//   - union by `id_venta` — NOTHING local is ever deleted. A sale still in
//     cola_sync, or one whose sync failed permanently, must survive a read;
//   - the API is the truth for what it records: existence, `total`,
//     `metodo_pago` and `items`;
//   - local fills what the Sheet does NOT store: `subtotal`, the product
//     name as it looked at sale time (fallback only — the server resolves
//     current names from Productos) and `fecha_hora`.
//
// `fecha_hora` keeps the LOCAL value when we have one, deliberately: the
// Sheet logs the ARRIVAL time (server clock, §4.3), so a sale queued offline
// for days would otherwise jump to its sync day and appear under the wrong
// date in the day grouping.
//
// Freshness: the response is stamped in `historial_cache` (TTL_HISTORIAL_MS)
// so reopening /historial does not call the API again inside the window.

import { historialVentas } from '../api/actions/ventas';
import type { VentaServidor } from '../api/types';
import { METODOS } from './metodos';
import {
  getHistorialCache,
  getHistorialVentas,
  setHistorialCache,
  setHistorialVentas,
  TTL_HISTORIAL_MS,
  type ItemVenta,
  type VentaLocal,
} from './storage';

export type EstadoHistorial = 'cache' | 'ok' | 'offline' | 'sin_soporte' | 'error';

export interface ResultadoHistorial {
  estado: EstadoHistorial;
  cambio: boolean; // the local list changed → repaint
  nuevas: number;
}

export interface MergeHistorial {
  ventas: VentaLocal[];
  cambio: boolean;
  nuevas: number;
}

const SIN_CAMBIO = { cambio: false, nuevas: 0 } as const;

function esMetodo(valor: string): valor is VentaLocal['metodo_pago'] {
  return (METODOS as readonly string[]).includes(valor);
}

/**
 * Merge the Sheet's rows into the local list — pure, no I/O.
 * @param local device-local ventas (newest first, richer: nombre/subtotal)
 * @param servidor rows returned by historialVentas()
 */
export function mezclarHistorial(local: VentaLocal[], servidor: VentaServidor[]): MergeHistorial {
  const porId = new Map<string, VentaLocal>();
  for (const venta of local) porId.set(venta.id_venta, venta);

  let nuevas = 0;
  let modificadas = 0;

  for (const remota of servidor) {
    const previa = porId.get(remota.id_venta);
    if (!previa) {
      porId.set(remota.id_venta, aVentaLocal(remota, null));
      nuevas++;
      continue;
    }
    const fusion = aVentaLocal(remota, previa);
    if (difiere(previa, fusion)) modificadas++;
    porId.set(fusion.id_venta, fusion);
  }

  const ventas = [...porId.values()].sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  return { ventas, cambio: nuevas > 0 || modificadas > 0, nuevas };
}

/**
 * One remote row as a VentaLocal, carrying over everything the local copy
 * has that the Sheet cannot know about. `previa` is null for a sale this
 * device never saw (another device, or a cleared cache).
 */
function aVentaLocal(remota: VentaServidor, previa: VentaLocal | null): VentaLocal {
  const itemsLocales = previa?.items ?? [];

  const items: ItemVenta[] = (remota.items ?? []).map((item) => ({
    id: item.id,
    // Server name wins (current catalog name); the local name fills the gap.
    nombre: (item.nombre ?? '').trim() || itemsLocales.find((local) => local.id === item.id)?.nombre || '',
    cantidad: Number(item.cantidad),
    precio: Number(item.precio),
  }));
  // A malformed `items` cell degrades to [] server-side — that must never
  // wipe the items we already have.
  const itemsFinales = items.length === 0 && itemsLocales.length > 0 ? itemsLocales : items;

  const totalRemoto = Number(remota.total);
  const fecha = String(remota.fecha_hora ?? '').trim();

  const venta: VentaLocal = {
    id_venta: remota.id_venta,
    // Keep the sale instant when known (see header) — otherwise the server's.
    fecha_hora: previa?.fecha_hora || fecha,
    items: itemsFinales,
    total: Number.isFinite(totalRemoto) ? totalRemoto : (previa?.total ?? 0),
    metodo_pago: esMetodo(remota.metodo_pago)
      ? remota.metodo_pago
      : (previa?.metodo_pago ?? 'efectivo'),
  };
  // Local-only snapshot (gotcha G9) — the Sheet never carries it.
  if (previa?.subtotal !== undefined) venta.subtotal = previa.subtotal;
  return venta;
}

/** Field-wise difference — drives whether the island needs to repaint. */
function difiere(a: VentaLocal, b: VentaLocal): boolean {
  if (a.total !== b.total || a.metodo_pago !== b.metodo_pago) return true;
  if (a.fecha_hora !== b.fecha_hora) return true;
  if (a.items.length !== b.items.length) return true;
  for (let i = 0; i < a.items.length; i++) {
    const x = a.items[i];
    const y = b.items[i];
    if (x.id !== y.id || x.cantidad !== y.cantidad || x.precio !== y.precio || x.nombre !== y.nombre) {
      return true;
    }
  }
  return false;
}

/**
 * Refresh the local historial from the Sheet, honoring the cache TTL.
 * Never throws, never blocks the caller's first paint, never empties the
 * list — the worst case is `estado: 'offline' | 'sin_soporte' | 'error'`
 * with `cambio: false`, i.e. "keep showing what you already have".
 * @param opciones.forzar skip the TTL (used when a sale is missing locally)
 */
export async function sincronizarHistorial(
  opciones?: { forzar?: boolean },
): Promise<ResultadoHistorial> {
  const forzar = opciones?.forzar === true;

  if (!forzar) {
    const cache = getHistorialCache();
    if (cache && Date.now() - cache.timestamp < TTL_HISTORIAL_MS) {
      return { estado: 'cache', ...SIN_CAMBIO };
    }
  }
  // Explicit `=== false`: an engine that does not expose onLine should still
  // be allowed to try the network instead of silently reporting offline.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { estado: 'offline', ...SIN_CAMBIO };
  }

  const resultado = await historialVentas();

  if (resultado.status === 'success') {
    const { ventas, cambio, nuevas } = mezclarHistorial(getHistorialVentas(), resultado.body.ventas);
    if (cambio) setHistorialVentas(ventas);
    setHistorialCache({ timestamp: Date.now() });
    return { estado: 'ok', cambio, nuevas };
  }

  if (resultado.status === 'network_failure') {
    return { estado: 'offline', ...SIN_CAMBIO };
  }

  // The server DID answer → the data did not change. Stamp the cache anyway:
  // a backend that predates §4.15 (accion_no_soportada) would otherwise be
  // re-hit on every page view, and a transient error deserves the same
  // cooldown instead of a request per navigation.
  setHistorialCache({ timestamp: Date.now() });
  return {
    estado: resultado.error === 'accion_no_soportada' ? 'sin_soporte' : 'error',
    ...SIN_CAMBIO,
  };
}
