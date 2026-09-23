// registrarVenta() — token-gated write, delegates to api/client.ts
// (doc/astrobase.md §3.7; contract §4.3).

import { llamarApi, type ApiResult } from '../client';
import type { DatosRegistrarVenta, RespuestaOk } from '../types';

export async function registrarVenta(data: DatosRegistrarVenta): Promise<ApiResult<RespuestaOk>> {
  if (data.items.length === 0 || !Number.isFinite(data.total) || data.total < 0) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('registrarVenta', data);
}
