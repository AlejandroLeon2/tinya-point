// actualizarStock() — token-gated write, delegates to api/client.ts
// (doc/astrobase.md §3.7; contract §4.4 — server clamps stock to 0).

import { llamarApi, type ApiResult } from '../client';
import { isValidQuantity } from '../../utils/validators';
import type { DatosActualizarStock, RespuestaActualizarStock } from '../types';

export async function actualizarStock(
  data: DatosActualizarStock,
): Promise<ApiResult<RespuestaActualizarStock>> {
  // Selling 0 units is meaningless — reject before hitting the wire.
  if (!data.id || !isValidQuantity(data.cantidadVendida) || data.cantidadVendida === 0) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaActualizarStock>('actualizarStock', data);
}
