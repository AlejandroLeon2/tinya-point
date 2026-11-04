// Catalog cache helpers (D5).
// Reference: catalog.ts:265-289, stock.ts:330-355 for refreshFromApi.

import { obtenerProductos } from '../api/actions/productos';
import { setCatalogoCache } from './storage';

// Extracted identical body: fetch + map + setCache + timestamp.
// Returns true on success, false on failure. Caller handles setData/pintar/setStale.
export async function refreshCatalogoFromApi(): Promise<boolean> {
  const result = await obtenerProductos();
  if (result.status === 'success') {
    const next = {
      productos: result.body.productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria,
        precio: p.precio,
        stock: p.stock,
        imagen_url: p.imagen_url,
        // Older deployments omit it — the POS treats missing as "no code".
        ...(p.barcode !== undefined ? { barcode: p.barcode } : {}),
        // product.md extensions — same rule: absent on older deployments /
        // caches, so the card falls back to the legacy layout per field.
        ...(p.marca !== undefined ? { marca: p.marca } : {}),
        ...(p.descripcion !== undefined ? { descripcion: p.descripcion } : {}),
        ...(p.atributos !== undefined ? { atributos: p.atributos } : {}),
        ...(p.featured !== undefined ? { featured: p.featured } : {}),
        ...(p.returnable !== undefined ? { returnable: p.returnable } : {}),
        ...(p.presentaciones !== undefined ? { presentaciones: p.presentaciones } : {}),
      })),
      timestamp: Date.now(),
    };
    setCatalogoCache(next);
    return true;
  }
  return false;
}

// Calculate minutes since a timestamp (base for setStale in both islands).
export function minutosDesde(timestamp: number): number {
  return Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
}
