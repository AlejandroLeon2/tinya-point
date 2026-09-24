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
