// Day-level caja math shared by islands/caja.ts (screen) and
// islands/historial.ts (day card) — plan-mejoras-2.md Fase 4. ONE home for
// the 2-decimal money rounding (gotcha G4) and the per-method totals over
// the LOCAL historial of a fecha_dia (same localDayKey day rule as
// /historial, gotcha G2). utils/ layer: pure logic over storage/format —
// no UI, no network.

import { localDayKey } from './format';
import { getHistorialVentas, type MetodoPago } from './storage';

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface TotalesDia {
  n_ventas: number;
  efectivo_ventas: number;
  tarjeta_ventas: number;
  yape_plin_ventas: number;
}

export function totalesDelDia(fechaDia: string): TotalesDia {
  const delDia = getHistorialVentas().filter(
    (venta) => localDayKey(venta.fecha_hora) === fechaDia,
  );
  const porMetodo = (metodo: MetodoPago): number =>
    round2(
      delDia
        .filter((venta) => venta.metodo_pago === metodo)
        .reduce((suma, venta) => suma + venta.total, 0),
    );
  return {
    n_ventas: delDia.length,
    efectivo_ventas: porMetodo('efectivo'),
    tarjeta_ventas: porMetodo('tarjeta'),
    yape_plin_ventas: porMetodo('yape-plin'),
  };
}
