// Cart runtime — the client half of plan-features Fase 3:
//   - "Agregar" on catalog cards (scoped via utils/dom closestCard)
//   - cart line paint + quantity ± / remove (one delegated, data-attr listener)
//   - "Cancelar venta": only the confirm button inside ui/Modal clears the store
// All state changes go through stores/cart.ts (carrito_actual via
// utils/storage) — zero fetch, zero direct localStorage (astrobase §3.1/§3.6).
// Browser-only module, loaded via an Astro <script>.

import {
  addToCart,
  clearCart,
  removeFromCart,
  subscribeCart,
  updateCartQuantity,
} from '../../stores/cart';
import { closestCard } from '../../utils/dom';
import { formatCurrency } from '../../utils/format';
import { closeModal } from '../../utils/modal';
import type { ItemCarrito } from '../../utils/storage';
import { calcTax, calcTotal } from '../../utils/tax';

// Scoped to the cart summary section — the checkout panel on the same page
// renders its OWN CartTotals instance with the same hooks.
const summary = document.querySelector<HTMLElement>('[data-cart-summary]');
const linesEl = summary?.querySelector<HTMLElement>('[data-cart-lines]') ?? null;
const lineTemplate = document.querySelector<HTMLTemplateElement>('[data-cart-line-template]');
const subtotalEl = summary?.querySelector<HTMLElement>('[data-cart-subtotal]') ?? null;
const taxEl = summary?.querySelector<HTMLElement>('[data-cart-impuesto]') ?? null;
const totalEl = summary?.querySelector<HTMLElement>('[data-cart-total]') ?? null;
// Modal key lives in ui/CancelSale.astro — single cancel-sale instance.
const cancelTrigger =
  summary?.querySelector<HTMLElement>('[data-modal-open="cancel-sale"]') ?? null;

function paint(items: ItemCarrito[]): void {
  if (linesEl && lineTemplate) {
    linesEl.querySelectorAll('[data-cart-line]').forEach((row) => row.remove());

    for (const item of items) {
      const first = lineTemplate.content.firstElementChild;
      if (!first) continue;
      const row = first.cloneNode(true) as HTMLElement;
      row.dataset.cartLine = item.id;

      const name = row.querySelector<HTMLElement>('[data-line-name]');
      const unit = row.querySelector<HTMLElement>('[data-line-unit]');
      const qty = row.querySelector<HTMLElement>('[data-line-qty]');
      const importe = row.querySelector<HTMLElement>('[data-line-importe]');

      if (name) name.textContent = item.nombre;
      if (unit) unit.textContent = `${formatCurrency(item.precio)} c/u`;
      if (qty) qty.textContent = String(item.cantidad);
      if (importe) importe.textContent = formatCurrency(item.precio * item.cantidad);

      // Buttons are generic in the template — the label names the product.
      for (const step of row.querySelectorAll<HTMLElement>('[data-cart-qty-step]')) {
        const verb = step.getAttribute('data-cart-qty-step') === 'up' ? 'Sumar' : 'Restar';
        step.setAttribute('aria-label', `${verb} una unidad de ${item.nombre}`);
      }
      const remove = row.querySelector<HTMLElement>('[data-cart-remove]');
      if (remove) remove.setAttribute('aria-label', `Quitar ${item.nombre} del carrito`);

      linesEl.append(row);
    }

    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (taxEl) taxEl.textContent = formatCurrency(calcTax(subtotal));
    if (totalEl) totalEl.textContent = formatCurrency(calcTotal(subtotal));
  }

  // An empty cart has nothing to cancel.
  if (cancelTrigger) cancelTrigger.hidden = items.length === 0;
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  // Agregar — product data rides on the painted card's dataset (set by
  // islands/catalog.ts paintCard); quantity comes from the qty readout.
  const add = target.closest<HTMLElement>('[data-add-to-cart]');
  if (add) {
    const card = closestCard(add);
    if (!card?.dataset.productId) return;
    const precio = Number(card.dataset.productPrice);
    if (!Number.isFinite(precio)) return;

    const readout = card.querySelector<HTMLElement>('[data-qty-value]');
    const cantidad = readout ? Number(readout.textContent) : 1;
    addToCart(
      {
        id: card.dataset.productId,
        nombre: card.dataset.productName ?? '',
        precio,
        ...(card.dataset.productImage ? { imagen_url: card.dataset.productImage } : {}),
      },
      Number.isFinite(cantidad) && cantidad >= 1 ? Math.trunc(cantidad) : 1,
    );
    if (readout) readout.textContent = '1'; // ready for the next add
    return;
  }

  // Cart line quantity ± — floor at 1; removal is the explicit "Quitar".
  const step = target.closest<HTMLElement>('[data-cart-qty-step]');
  if (step) {
    const row = step.closest<HTMLElement>('[data-cart-line]');
    const id = row?.dataset.cartLine;
    const qty = row?.querySelector<HTMLElement>('[data-line-qty]');
    if (!id || !qty) return;
    const current = Number(qty.textContent);
    if (!Number.isFinite(current)) return;
    const next = current + (step.getAttribute('data-cart-qty-step') === 'up' ? 1 : -1);
    if (next < 1) return;
    updateCartQuantity(id, next);
    return;
  }

  const remove = target.closest<HTMLElement>('[data-cart-remove]');
  if (remove) {
    const id = remove.closest<HTMLElement>('[data-cart-line]')?.dataset.cartLine;
    if (id) removeFromCart(id);
    return;
  }

  // Cancel-sale confirm — sits INSIDE the modal; clears, then closes it.
  const confirm = target.closest<HTMLElement>('[data-cart-cancel-confirm]');
  if (confirm) {
    clearCart();
    const root = confirm.closest<HTMLElement>('[data-modal-root]');
    if (root) closeModal(root);
  }
});

// Immediate first paint + every store change (badge subscribes separately).
subscribeCart(paint);
