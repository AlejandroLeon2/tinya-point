// Day-level product ranking for the "reporte del día" — base.md §7
// "productos más vendidos", plan-cierre.md Fase 1 (D1: implementar,
// decided by the owner 23/09/2026). Pure function over the day's ventas
// already grouped AND date-filtered by islands/historial.ts — same input the
// summary and per-method breakdown use, so filter and ranking can never
// disagree (plan-cierre: "calcular sobre ventas ya filtradas del grupo").
// utils/ layer: no UI, no network, no storage re-read.

import type { VentaLocal } from './storage';

export interface ProductoVendido {
  id: string;
  nombre: string;
  unidades: number;
}

export function topProductosDelDia(ventas: VentaLocal[], limite = 3): ProductoVendido[] {
  const porProducto = new Map<string, ProductoVendido>();
  for (const venta of ventas) {
    for (const item of venta.items) {
      const existente = porProducto.get(item.id);
      if (existente) {
        existente.unidades += item.cantidad;
      } else {
        porProducto.set(item.id, { id: item.id, nombre: item.nombre, unidades: item.cantidad });
      }
    }
  }
  // Units desc; ties break alphabetically so the line never flickers order
  // between renders of the same data.
  return [...porProducto.values()]
    .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre))
    .slice(0, limite);
}
