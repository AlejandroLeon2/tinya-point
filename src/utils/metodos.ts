// Payment method constants (D12).
// Reference: historial.ts:50-55.

import type { MetodoPago } from './storage';

export const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  'yape-plin': 'Yape/Plin',
};

export const METODOS: readonly MetodoPago[] = ['efectivo', 'tarjeta', 'yape-plin'] as const;
