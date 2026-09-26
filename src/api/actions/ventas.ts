// Ventas actions — token-gated calls that delegate to api/client.ts
// (doc/astrobase.md §3.7; contracts §4.3 write, §4.15 read).

import { llamarApi, type ApiResult } from '../client';
import type { DatosRegistrarVenta, RespuestaHistorialVentas, RespuestaOk } from '../types';

export async function registrarVenta(data: DatosRegistrarVenta): Promise<ApiResult<RespuestaOk>> {
  if (data.items.length === 0 || !Number.isFinite(data.total) || data.total < 0) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('registrarVenta', data);
}

// historialVentas() — §4.15, the ONLY read of the sales log. It is a POST
// (token stays out of the URL) and returns the WHOLE Sheet: the caller
// merges it into the local historial, it never replaces that list
// (utils/historial-sync.ts).
export async function historialVentas(): Promise<ApiResult<RespuestaHistorialVentas>> {
  return llamarApi<RespuestaHistorialVentas>('historialVentas', {});
}
