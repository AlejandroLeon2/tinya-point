// obtenerProductos() — public catalog read, delegates to api/client.ts
// (doc/astrobase.md §3.7). No token (doc/appscriptbase.md §4.1/§5.2).
// Admin trio (plan-mejoras-2.md Fase 1, contracts §4.8–§4.10) rides the same
// single client: validate the payload first, never fetch directly, never
// auto-retry (§5.3).

import { llamarApi, llamarGet, type ApiResult } from '../client';
import {
  isNonEmpty,
  isValidImageUrl,
  isValidPrecio,
  isValidStockValue,
} from '../../utils/validators';
import type {
  DatosActualizarProducto,
  DatosCrearProducto,
  RespuestaCrearProducto,
  RespuestaOk,
  RespuestaProductos,
  RespuestaProductosAdmin,
} from '../types';

export async function obtenerProductos(): Promise<ApiResult<RespuestaProductos>> {
  return llamarGet<RespuestaProductos>('productos');
}

// §4.8 — full list INCLUDING inactive rows; the public read above never
// returns those, so the admin screen would be blind without it.
export async function productosAdmin(): Promise<ApiResult<RespuestaProductosAdmin>> {
  return llamarApi<RespuestaProductosAdmin>('productosAdmin', {});
}

// §4.9 — mirror of the server-side payload_invalido rules (§4.5) so an
// obvious mistake never pays a round trip.
export async function crearProducto(
  data: DatosCrearProducto,
): Promise<ApiResult<RespuestaCrearProducto>> {
  if (
    !isNonEmpty(data.nombre) ||
    !isNonEmpty(data.categoria) ||
    !isValidPrecio(data.precio) ||
    !isValidStockValue(data.stock) ||
    !isValidImageUrl(data.imagen_url ?? '')
  ) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaCrearProducto>('crearProducto', {
    ...data,
    imagen_url: (data.imagen_url ?? '').trim(),
  });
}

// §4.10 — partial update: id + at least one field. The logical delete (baja)
// is this same call with activo: false (plan-mejoras-2.md D2).
export async function actualizarProducto(
  data: DatosActualizarProducto,
): Promise<ApiResult<RespuestaOk>> {
  const { id, nombre, categoria, precio, stock, imagen_url, activo, marca } = data;
  const tocaAlgo =
    nombre !== undefined ||
    categoria !== undefined ||
    precio !== undefined ||
    stock !== undefined ||
    imagen_url !== undefined ||
    activo !== undefined ||
    marca !== undefined;
  if (
    !id ||
    !tocaAlgo ||
    (nombre !== undefined && !isNonEmpty(nombre)) ||
    (categoria !== undefined && !isNonEmpty(categoria)) ||
    (precio !== undefined && !isValidPrecio(precio)) ||
    (stock !== undefined && !isValidStockValue(stock)) ||
    (imagen_url !== undefined && !isValidImageUrl(imagen_url)) ||
    (activo !== undefined && typeof activo !== 'boolean') ||
    (marca !== undefined && typeof marca !== 'string')
  ) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('actualizarProducto', data);
}
