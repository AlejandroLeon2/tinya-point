// login() — one business action, delegates to api/client.ts
// (doc/astrobase.md §3.7). Components import THIS file, never client.ts.

import { llamarLogin, type ApiResult } from '../client';
import { hasLoginFields } from '../../utils/validators';
import type { RespuestaLoginOk } from '../types';

export async function login(usuario: string, clave: string): Promise<ApiResult<RespuestaLoginOk>> {
  // Payload sanity before going out (§3.7: actions own their validation).
  if (!hasLoginFields(usuario, clave)) {
    return { status: 'api_error', error: 'payload_invalido' };
  }
  return llamarLogin<RespuestaLoginOk>(usuario, clave);
}
