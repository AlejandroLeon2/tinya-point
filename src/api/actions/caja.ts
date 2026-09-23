// abrirCaja() / cerrarCaja() — token-gated writes, delegate to api/client.ts
// (doc/astrobase.md §3.7; contracts §4.6/§4.7). Payload validation mirrors the
// server rules BEFORE the request leaves (plan-mejoras-2.md Fase 2, pattern
// of actions/ventas.ts).

import { llamarApi, type ApiResult } from '../client';
import type { DatosAbrirCaja, DatosCerrarCaja, RespuestaOk } from '../types';

export async function abrirCaja(data: DatosAbrirCaja): Promise<ApiResult<RespuestaOk>> {
  if (
    !data.id_caja ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_día) ||
    !Number.isFinite(data.monto_apertura) ||
    data.monto_apertura < 0
  ) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('abrirCaja', data);
}

export async function cerrarCaja(data: DatosCerrarCaja): Promise<ApiResult<RespuestaOk>> {
  const numeros = [
    data.conteo_cierre,
    data.efectivo_ventas,
    data.tarjeta_ventas,
    data.yape_plin_ventas,
    data.diferencia,
  ];
  if (
    !data.id_caja ||
    numeros.some((n) => !Number.isFinite(n)) ||
    !Number.isInteger(data.n_ventas) ||
    data.n_ventas < 0
  ) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('cerrarCaja', data);
}
