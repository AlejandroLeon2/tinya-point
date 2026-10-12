// Barcode helpers shared by the product form (product-admin), the POS
// catalog and the wire validation (api/actions/productos.ts). The code is
// ALWAYS handled as a STRING: EAN-13 starts with 0 and Number() would
// silently eat the leading zeros (restriction of plan-camara-barras).
// No format regex on purpose: internal SKUs like "BEA-ESS-001" (the
// seed column sku/codigo_barras, doc/base.md 2.1) live next to commercial
// EAN-13/EAN-8/UPC-A codes, and both must round-trip untouched.

// Length cap enforced client AND server side. Any real product code fits
// far below this; the cap only rejects paste accidents (a whole URL, etc.).
export const BARCODE_MAX_LENGTH = 64;

function esInvisible(code: number): boolean {
  // Zero-width space / non-joiner / joiner and BOM: some scanners and
  // copy/paste sources append them invisibly; dropping them keeps
  // "same code" comparisons honest.
  return code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff;
}

function esControl(code: number): boolean {
  // C0 controls + DEL: they would break the Sheet round trip.
  return code < 0x20 || code === 0x7f;
}

export function normalizarBarcode(raw: string): string {
  let limpio = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (esInvisible(code)) continue;
    limpio += ch;
  }
  return limpio.trim();
}

/**
 * Optional field: an empty value is valid (products without a barcode are
 * allowed). A filled code must survive the trim and fit the length cap, with
 * no control characters.
 */
export function esBarcodeValido(raw: string): boolean {
  const value = normalizarBarcode(raw);
  if (value === '') return true;
  if (value.length > BARCODE_MAX_LENGTH) return false;
  for (let i = 0; i < value.length; i++) {
    if (esControl(value.charCodeAt(i))) return false;
  }
  return true;
}

export interface ProductoConBarcode {
  id: string;
  barcode?: string | null;
}

/**
 * Exact-match duplicate check inside the already-loaded catalog: the local
 * pre-guard of the admin form (same strategy as categorias-admin's local
 * pre-guard for categoria_duplicada; the backend keeps validating too).
 * `excluirId` is the product being EDITED, whose own code must not collide
 * with itself.
 */
export function hayBarcodeDuplicado(
  productos: ProductoConBarcode[],
  barcode: string,
  excluirId?: string | null,
): boolean {
  const value = normalizarBarcode(barcode);
  if (value === '') return false;
  return productos.some(
    (p) =>
      p.id !== (excluirId ?? null) &&
      typeof p.barcode === 'string' &&
      normalizarBarcode(p.barcode) === value,
  );
}

/** Exact lookup by barcode inside a product list (POS scan to add to cart). */
export function buscarPorBarcode<T extends ProductoConBarcode>(
  productos: T[],
  barcode: string,
): T | undefined {
  const value = normalizarBarcode(barcode);
  if (value === '') return undefined;
  return productos.find(
    (p) => typeof p.barcode === 'string' && normalizarBarcode(p.barcode) === value,
  );
}
