// Configurable sales tax — ONE home for the rate (doc/base.md §7
// "impuesto configurable (ej. IGV 18%)"). Since plan-productos-v2.md Fase 5
// (D4) the rate lives in localStorage `ajustes.igv_tasa` (percentage points,
// default 18) — changing it never means grepping components: islands read
// through these helpers, and BUILD-time callers (static frontmatter labels)
// get the default because localStorage doesn't exist there (storage.ts guard).

import { getAjustes } from './storage';

// Fraction (0.18) derived from the configured percentage points (18).
export function getTaxRate(): number {
  return getAjustes().igv_tasa / 100;
}

// Visible label "IGV (18%)" — build renders the default, islands overwrite
// with the configured value at runtime.
export function etiquetaIgv(): string {
  return `IGV (${Math.round(getTaxRate() * 100)}%)`;
}

export function calcTax(subtotal: number): number {
  return subtotal * getTaxRate();
}

export function calcTotal(subtotal: number): number {
  return subtotal + calcTax(subtotal);
}
