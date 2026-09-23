// Shared cart state, persisted exclusively through utils/storage.ts
// (doc/astrobase.md §3.6). No fetch, no direct localStorage here.

import {
  getCarritoActual,
  setCarritoActual,
  type ItemCarrito,
} from '../utils/storage';
import { isValidQuantity } from '../utils/validators';

type CartListener = (items: ItemCarrito[]) => void;

// Module-level state only — no side effects at import time.
const listeners = new Set<CartListener>();

function persist(items: ItemCarrito[]): void {
  setCarritoActual(items);
  for (const listener of listeners) listener(items);
}

export function getCart(): ItemCarrito[] {
  return getCarritoActual();
}

export function addToCart(
  producto: { id: string; nombre: string; precio: number; imagen_url?: string },
  cantidad = 1,
): void {
  // Adding zero or a nonsensical quantity is a no-op.
  if (!isValidQuantity(cantidad) || cantidad <= 0) return;

  const items = getCarritoActual();
  const existing = items.find((item) => item.id === producto.id);
  if (existing) {
    existing.cantidad += cantidad;
  } else {
    items.push({ ...producto, cantidad });
  }
  persist(items);
}

export function removeFromCart(id: string): void {
  const items = getCarritoActual();
  if (!items.some((item) => item.id === id)) return;
  persist(items.filter((item) => item.id !== id));
}

export function updateCartQuantity(id: string, cantidad: number): void {
  if (!isValidQuantity(cantidad)) return;

  const items = getCarritoActual();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return;

  // Zero-quantity items are meaningless in a cart — remove instead.
  if (cantidad === 0) {
    items.splice(index, 1);
    persist(items);
    return;
  }

  items[index].cantidad = cantidad;
  persist(items);
}

// "Cancelar venta" confirmation — empties the whole cart in one persist
// (plan-features Fase 3).
export function clearCart(): void {
  persist([]);
}

export function subscribeCart(listener: CartListener): () => void {
  listeners.add(listener);
  // Immediate first call: subscribers (e.g. cart-badge) need an initial paint.
  listener(getCarritoActual());
  return () => {
    listeners.delete(listener);
  };
}
