// Shared product search (owner request 2026-11-01): ONE predictable matching
// pipeline for the admin list (/productos) AND the POS catalog (/venta).
// The old Fuse-only path used threshold 0.35 across nombre+categoria+marca+
// barcode, so "aceite" fuzzy-matched "Lácteos" (acte), "Maceta" (acet) and
// "Aretes…" — noise with nothing to do with the query.
//
// Pipeline (strict first, fuzzy last resort):
//   1. Exact barcode  → only that product (unique identifier; scanners win).
//   2. Substring (case/accent-insensitive) on nombre | categoria | marca |
//      barcode (partial codes like "GRO-BRD-EGG" still land) — a product
//      named "Aceite X" in ANY category still matches.
//   3. Fallback: fuzzy ONLY on nombre, threshold 0.2, ignoreLocation —
//      typos like "lecche"/"huvos" still land on "Leche"/"Huevos". Never
//      fuzzy on categoria/marca/barcode.
//
// Naming per extras.md §7: code English, domain/UI Spanish.

import Fuse from 'fuse.js';
import { normalizeSearchQuery } from './search-normalize';
import { buscarPorBarcode } from './barcode';

/** Minimal shape both Producto (storage) and ProductoAdmin (api) satisfy. */
export interface BuscableProducto {
  nombre: string;
  categoria: string;
  marca?: string;
  barcode?: string;
}

// Fuzzy fallback: only over `nombre`. 0.2 ≈ ≤1 edit in a 5–6 letter word —
// catches typos without inventing cross-field matches.
const FUZZY_THRESHOLD = 0.2;

/**
 * Filter `productos` by a raw user query. Empty/stopword-only query →
 * the full list, in the original order.
 *
 * Order of results follows the input array (substrings keep catalog order;
 * the fuzzy fallback keeps Fuse's relevance order for typos).
 */
export function buscarProductos<T extends BuscableProducto>(
  productos: T[],
  crudo: string,
): T[] {
  const query = normalizeSearchQuery(crudo);
  if (query === '') return productos;

  // 1. Exact barcode — beats every other match (POS scan / paste del código).
  const porCodigo = buscarPorBarcode(productos, crudo);
  if (porCodigo) return [porCodigo];

  // 2. Substring over the human-readable fields (normalized both sides),
  //    plus a PARTIAL barcode (paste "GRO-BRD-EGG" finds "…-EGG-023") —
  //    still a plain contains(), never fuzzy.
  const porSubcadena = productos.filter(
    (p) =>
      normalizeSearchQuery(p.nombre).includes(query) ||
      normalizeSearchQuery(p.categoria).includes(query) ||
      normalizeSearchQuery(p.marca ?? '').includes(query) ||
      normalizeSearchQuery(p.barcode ?? '').includes(query),
  );
  if (porSubcadena.length > 0) return porSubcadena;

  // 3. Typo tolerance — nombre only, strict threshold.
  const fuse = new Fuse(productos, {
    keys: [{ name: 'nombre', getFn: (p) => normalizeSearchQuery(p.nombre) }],
    threshold: FUZZY_THRESHOLD,
    ignoreLocation: true,
  });
  return fuse.search(query).map((r) => r.item);
}
