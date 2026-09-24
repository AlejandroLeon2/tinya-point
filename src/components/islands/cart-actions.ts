// Cart runtime — the client half of plan-features Fase 3, updated by
// refactorUI Fase 2 (§4.2A/D):
//   - "Agregar" on catalog cards (scoped via utils/dom closestCard); the
//     whole card is the trigger and the quantity is ALWAYS 1 — the per-card
//     stepper was deleted (quantity is adjusted in the ticket lines only).
//   - cart line paint + quantity ± / remove (one delegated, data-attr
//     listener) — lines + totals live in the ONE ticket node (data-ticket).
//   - "Cancelar venta": only the confirm button inside ui/Modal clears the
//     store.
//   - 150ms badge pop on add (skipped under prefers-reduced-motion; the
//     badge is NOT an ancestor of anything fixed — G1 safe).
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
import { closestAncestor, closestCard, qs, qsa, setText, setHidden, cloneTemplate } from '../../utils/dom';
import { formatCurrency } from '../../utils/format';
import { closeModal } from '../../utils/modal';
import type { ItemCarrito } from '../../utils/storage';
import { calcTax, calcTotal, etiquetaIgv } from '../../utils/tax';

// Scoped to the single ticket node (Fase 2): lines, totals, cancel trigger
// and checkout all share it — there is no second totals block anymore.
const ticket = qs<HTMLElement>(document, '[data-ticket]');
const linesEl = qs<HTMLElement>(ticket, '[data-cart-lines]');
const lineTemplate = qs<HTMLTemplateElement>(document, '[data-cart-line-template]');
const subtotalEl = qs<HTMLElement>(ticket, '[data-cart-subtotal]');
const taxEl = qs<HTMLElement>(ticket, '[data-cart-impuesto]');
const totalEl = qs<HTMLElement>(ticket, '[data-cart-total]');
const taxLabelEl = qs<HTMLElement>(ticket, '[data-cart-tax-label]');
// Configured IGV overwrites the build-time default label (Fase 5) — once at
// startup: the rate only changes via /ajustes, which reloads the page.
setText(taxLabelEl, etiquetaIgv());
// Modal key lives in ui/CancelSale.astro — single cancel-sale instance.
const cancelTrigger = qs<HTMLElement>(ticket, '[data-modal-open="cancel-sale"]');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Micro-feedback on add (§4.2D): a 150ms pop on every visible badge —
// element.animate, no CSS class churn, anula'd by reduced-motion.
function popBadges(): void {
  if (reduceMotion.matches) return;
  for (const badge of qsa<HTMLElement>(document, '[data-cart-badge]')) {
    badge.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.35)' },
        { transform: 'scale(1)' },
      ],
      { duration: 150, easing: 'ease-out' },
    );
  }
}

function paint(items: ItemCarrito[]): void {
  if (linesEl && lineTemplate) {
    linesEl.querySelectorAll('[data-cart-line]').forEach((row) => row.remove());

    for (const item of items) {
      const row = cloneTemplate(lineTemplate);
      if (!row) continue;
      row.dataset.cartLine = item.id;

      const name = qs<HTMLElement>(row, '[data-line-name]');
      const unit = qs<HTMLElement>(row, '[data-line-unit]');
      const qty = qs<HTMLElement>(row, '[data-line-qty]');
      const importe = qs<HTMLElement>(row, '[data-line-importe]');

      setText(name, item.nombre);
      setText(unit, `${formatCurrency(item.precio)} c/u`);
      setText(qty, String(item.cantidad));
      setText(importe, formatCurrency(item.precio * item.cantidad));

      // Buttons are generic in the template — the label names the product.
      for (const step of qsa<HTMLElement>(row, '[data-cart-qty-step]')) {
        const verb = step.getAttribute('data-cart-qty-step') === 'up' ? 'Sumar' : 'Restar';
        step.setAttribute('aria-label', `${verb} una unidad de ${item.nombre}`);
      }
      const remove = qs<HTMLElement>(row, '[data-cart-remove]');
      if (remove) remove.setAttribute('aria-label', `Quitar ${item.nombre} del carrito`);

      linesEl.append(row);
    }

    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    setText(subtotalEl, formatCurrency(subtotal));
    setText(taxEl, formatCurrency(calcTax(subtotal)));
    setText(totalEl, formatCurrency(calcTotal(subtotal)));
  }

  // An empty cart has nothing to cancel.
  setHidden(cancelTrigger, items.length === 0);
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  // Agregar — product data rides on the painted card's dataset (set by
  // islands/catalog.ts paintCard). The trigger is the card's overlay button
  // and always adds ONE unit (§4.2D — no stepper).
  const add = target.closest<HTMLElement>('[data-add-to-cart]');
  if (add) {
    const card = closestCard(add);
    if (!card?.dataset.productId) return;
    // Defense in depth (refactorUI §4.2D, plan-refactor-ui T0.2): an agotado
    // must NEVER enter the cart, even if a clone lost its disabled state.
    if (Number(card.dataset.productStock) === 0) return;
    const precio = Number(card.dataset.productPrice);
    if (!Number.isFinite(precio)) return;

    addToCart(
      {
        id: card.dataset.productId,
        nombre: card.dataset.productName ?? '',
        precio,
        ...(card.dataset.productImage ? { imagen_url: card.dataset.productImage } : {}),
      },
      1,
    );
    popBadges();
    return;
  }

  // Cart line quantity ± — floor at 1; removal is the explicit "Quitar".
  const step = target.closest<HTMLElement>('[data-cart-qty-step]');
  if (step) {
    const row = step.closest<HTMLElement>('[data-cart-line]');
    const id = row?.dataset.cartLine;
    const qty = qs<HTMLElement>(row, '[data-line-qty]');
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
    const root = closestAncestor<HTMLElement>(confirm, '[data-modal-root]');
    if (root) closeModal(root);
  }
});

// Immediate first paint + every store change (badge subscribes separately).
subscribeCart(paint);
