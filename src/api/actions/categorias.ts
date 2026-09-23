// Categorías CRUD — delegates to the single client (doc/astrobase.md §3.7),
// contracts doc/appscriptbase.md §4.11–§4.14 (plan-productos-v2.md Fase 2).
// Validate the payload before the round trip (§4.5 mirrors), never fetch
// directly, never auto-retry (§5.3).

import { llamarApi, llamarGet, type ApiResult } from '../client';
import { isNonEmpty } from '../../utils/validators';
import type {
  DatosActualizarCategoria,
  DatosBorrarCategoria,
  RespuestaCategorias,
  RespuestaCrearCategoria,
  RespuestaOk,
} from '../types';

// §4.11 — public read, no token: feeds the product form select and this page.
export async function getCategorias(): Promise<ApiResult<RespuestaCategorias>> {
  return llamarGet<RespuestaCategorias>('categorias');
}

// §4.12 — mirror of the server-side payload_invalido rule.
export async function crearCategoria(nombre: string): Promise<ApiResult<RespuestaCrearCategoria>> {
  const limpio = nombre.trim();
  if (!isNonEmpty(limpio)) return { status: 'api_error', error: 'payload_invalido' };
  return llamarApi<RespuestaCrearCategoria>('crearCategoria', { nombre: limpio });
}

// §4.13 — rename by id (the server cascades to products under one lock).
export async function actualizarCategoria(
  data: DatosActualizarCategoria,
): Promise<ApiResult<RespuestaOk>> {
  const limpio = data.nombre.trim();
  if (!data.id || !isNonEmpty(limpio)) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarApi<RespuestaOk>('actualizarCategoria', { id: data.id, nombre: limpio });
}

// §4.14 — may answer categoria_en_uso; the island turns it into Spanish copy.
export async function borrarCategoria(data: DatosBorrarCategoria): Promise<ApiResult<RespuestaOk>> {
  if (!data.id) return { status: 'api_error', error: 'payload_invalido' };
  return llamarApi<RespuestaOk>('borrarCategoria', data);
}
