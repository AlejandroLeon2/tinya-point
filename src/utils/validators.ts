// Reusable validations: non-negative quantity, non-empty login fields
// (doc/astrobase.md §3.5).

export function isValidQuantity(cantidad: number): boolean {
  return Number.isFinite(cantidad) && cantidad >= 0;
}

export function hasLoginFields(usuario: string, clave: string): boolean {
  return usuario.trim().length > 0 && clave.trim().length > 0;
}

// Product form (doc/plan-mejoras-2.md Fase 1) — shared by the admin island
// and actions/productos.ts so client and wire reject the same inputs.

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isValidPrecio(precio: number): boolean {
  return Number.isFinite(precio) && precio >= 0;
}

export function isValidStockValue(stock: number): boolean {
  return Number.isInteger(stock) && stock >= 0;
}

export function isValidImageUrl(url: string): boolean {
  const value = url.trim();
  if (value === '') return true; // optional field — empty clears the image
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
