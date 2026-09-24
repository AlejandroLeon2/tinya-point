// API result helpers (D3, D4).
// Reference: caja.ts:311-316, checkout.ts:231-233 for debeEncolar.

export interface ApiResult {
  status: string;
  error?: string;
}

// Enqueue decision: network_failure or unauthorized (api_error with error === 'unauthorized').
// Used by caja.ts and checkout.ts (D4).
export function debeEncolar(result: ApiResult): boolean {
  return (
    result.status === 'network_failure' ||
    (result.status === 'api_error' && result.error === 'unauthorized')
  );
}

// Centralized error message helper for switch-style error handling (D3).
// The `accion_no_soportada` copy is identical across 4 islands (caja, categorias-admin, product-admin, stock).
// Domain-specific errors (e.g., `categoria_en_uso`) stay as local lookups before delegating.
export interface MensajeDeErrorOpciones {
  payloadInvalido: string;
  fallback: string;
}

export function mensajeDeErrorApi(error: string, opciones: MensajeDeErrorOpciones): string {
  switch (error) {
    case 'payload_invalido':
      return opciones.payloadInvalido;
    case 'accion_no_soportada':
      return 'El servidor todavía no tiene esta función. Actualizá el despliegue de Apps Script.';
    default:
      return opciones.fallback;
  }
}
