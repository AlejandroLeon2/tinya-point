// Configurable sales tax — ONE home for the rate (doc/base.md §7
// "impuesto configurable (ej. IGV 18%)"). Changing it never means grepping
// components: smart/CartSummary assembles the visible label from TAX_RATE
// and islands/cart-actions computes the amounts from these helpers.

export const TAX_RATE = 0.18; // IGV — Perú 18%

export function calcTax(subtotal: number): number {
  return subtotal * TAX_RATE;
}

export function calcTotal(subtotal: number): number {
  return subtotal + calcTax(subtotal);
}
