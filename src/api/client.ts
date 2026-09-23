// The single fetch in the project (doc/astrobase.md §3.7, golden rule 3):
// llamarApi / llamarLogin / llamarGet all funnel through `request` below.
// Rules enforced here (doc/appscriptbase.md §1/§5.1):
//   - Content-Type text/plain;charset=utf-8 → skips the Apps Script CORS preflight.
//   - Success = body.ok, NEVER the HTTP status (Apps Script always answers 200).
//   - error "unauthorized" → clear token + redirect to /login.
//   - Network failure → network_failure result, never a thrown error:
//     the caller decides whether it belongs in cola_sync.

import { getToken, setToken } from '../utils/storage';
import type { AccionEscritura, AccionLectura, ErrorCode } from './types';

// Set in .env / Vercel dashboard (doc/extras.md §3.7). Empty at build time is
// fine: the fetch would fail and classify as network_failure, never crash.
const API_URL: string = import.meta.env.PUBLIC_API_URL ?? '';

const SERVER_CODES = new Set<ErrorCode>([
  'credenciales_invalidas',
  'unauthorized',
  'accion_no_soportada',
  'payload_invalido',
  'error_interno',
]);

// Local transport outcome — distinct from the server's ErrorCode union:
// network_failure means "no response at all", which the server can never send.
export type ApiResult<T> =
  | { status: 'success'; body: T }
  | { status: 'api_error'; error: ErrorCode }
  | { status: 'network_failure' };

function expirarSesion(): void {
  setToken(null);
  if (typeof window !== 'undefined') window.location.assign('/login');
}

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    // No response in absoluto → the caller enqueues into cola_sync; never a
    // visible error thrown at the cashier mid-sale (§5.1.4).
    return { status: 'network_failure' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Non-JSON answer (Apps Script HTML error page) → generic server error.
    return { status: 'api_error', error: 'error_interno' };
  }

  const parsed = body as { ok?: unknown; error?: unknown };

  // HTTP status is ignored on purpose — Apps Script always answers 200 (§5.1.1).
  if (parsed.ok === true) return { status: 'success', body: body as T };

  const error: ErrorCode =
    typeof parsed.error === 'string' && SERVER_CODES.has(parsed.error as ErrorCode)
      ? (parsed.error as ErrorCode)
      : 'error_interno';

  if (error === 'unauthorized') expirarSesion();

  return { status: 'api_error', error };
}

const headers = { 'Content-Type': 'text/plain;charset=utf-8' };

// POST { action, token, data } — token-gated writes (doc/base.md §3.3).
export async function llamarApi<T>(action: AccionEscritura, data: unknown): Promise<ApiResult<T>> {
  return request<T>(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, token: getToken(), data }),
  });
}

// POST { action: 'login', usuario, clave } — literal §4.2 shape (no token,
// no data wrapper; credentials travel exactly once, at login).
export async function llamarLogin<T>(usuario: string, clave: string): Promise<ApiResult<T>> {
  return request<T>(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'login', usuario, clave }),
  });
}

// GET ?action=... — public reads (§4.1), still through this single client.
export async function llamarGet<T>(accion: AccionLectura): Promise<ApiResult<T>> {
  return request<T>(`${API_URL}?action=${encodeURIComponent(accion)}`);
}
