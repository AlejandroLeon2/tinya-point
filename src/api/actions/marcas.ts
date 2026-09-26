// Brands CRUD — mirror of actions/categorias.ts: delegates to the single
// client (doc/astrobase.md §3.7), validates the payload before the round
// trip (§4.5 mirrors), never fetch directly, never auto-retry (§5.3).

import { llamarApi, llamarGet, type ApiResult } from '../client';
import { isNonEmpty } from '../../utils/validators';
import type {
  DatosActualizarMarca,
  DatosBorrarMarca,
  RespuestaCrearMarca,
  RespuestaMarcas,
  RespuestaOk,
} from '../types';

// Public read, no token: feeds the product form select and this page.
export async function getMarcas(): Promise<ApiResult<RespuestaMarcas>> {
  return llamarGet<RespuestaMarcas>('marcas');
}

// Mirror of the server-side payload_invalido rule.
export async function crearMarca(nombre: string): Promise<ApiResult<RespuestaCrearMarca>> {
  const limpio = nombre.trim();
  if (!isNonEmpty(limpio)) return { status: 'api_error', error: 'payload_invalido' };
  return llamarApi<RespuestaCrearMarca>('crearMarca', { nombre: limpio });
}

// Rename by id (the server cascades to products under one lock).
export async function actualizarMarca(data: DatosActualizarMarca): Promise<ApiResult<RespuestaOk>> {
  const limpio = data.nombre.trim();
  if (!data.id || !isNonEmpty(limpio)) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('actualizarMarca', { id: data.id, nombre: limpio });
}

// May answer marca_en_uso; the island turns it into Spanish copy.
export async function borrarMarca(data: DatosBorrarMarca): Promise<ApiResult<RespuestaOk>> {
  if (!data.id) return { status: 'api_error', error: 'payload_invalido' };
  return llamarApi<RespuestaOk>('borrarMarca', data);
}
