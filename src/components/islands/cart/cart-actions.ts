// Cart runtime — the client half of plan-features Fase 3, updated by
// refactorUI Fase 2 (§4.2A/D) and the POS redesign (2026-11-04):
//   - "Agregar" is the card's BUTTON only (the whole-card trigger is gone);
//     the selected presentation pill decides price + units per line, and the
//     quantity is ALWAYS 1 (it is adjusted in the ticket lines only).
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
  getCart,
  removeFromCart,
  subscribeCart,
  updateCartQuantity,
} from '../../../stores/cart';
import { closestAncestor, closestCard, qs, qsa, setText, setHidden, cloneTemplate, delegateAction } from '../../../utils/dom';
import { formatCurrency } from '../../../utils/format';
import { closeModal } from '../../../utils/modal';
import { mostrarToast } from '../../../utils/toast';
import type { ItemCarrito } from '../../../utils/storage';
import { calcTax, calcTotal, etiquetaIgv } from '../../../utils/tax';

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

// ── Auto-scroll the line that just gained units ───────────────────────────
// The ticket appends new lines at the END, usually below the scroll zone: the
// cashier had to hunt for the product they just added (owner report
// 2026-11-04). After each paint the changed line is revealed with
// `block:'nearest'`, which is a no-op when it is already visible.
let paintedItems: ItemCarrito[] = [];
let scrollArmed = false;

function changedLineId(previous: ItemCarrito[], next: ItemCarrito[]): string | null {
  for (const item of next) {
    const before = previous.find((old) => old.id === item.id);
    if (!before || item.cantidad > before.cantidad) return item.id;
  }
  return null;
}

function revealRow(row: HTMLElement): void {
  // Deferred to a microtask, NOT a frame: when a line is added while the
  // payment step is open, checkout.ts returns to step 1 in the SAME store
  // notification, and the modal controller reveals the sheet in the same
  // click dispatch. A microtask runs after all of them and before paint.
  // `block:'nearest'` scrolls only the ticket's own list and is a no-op when
  // the row is already visible; instant (not smooth) so rapid adds keep up.
  queueMicrotask(() => {
    row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function paint(items: ItemCarrito[]): void {
  const changed = scrollArmed ? changedLineId(paintedItems, items) : null;
  paintedItems = items.map((item) => ({ ...item }));
  // Never scroll on the first paint: a cart restored from localStorage must
  // not move the page when the POS loads.
  scrollArmed = true;

  if (linesEl && lineTemplate) {
    linesEl.querySelectorAll('[data-cart-line]').forEach((row) => row.remove());

    for (const item of items) {
      const row = cloneTemplate(lineTemplate);
      if (!row) continue;
      row.dataset.cartLine = item.id;

      const name = qs<HTMLElement>(row, '[data-line-name]');
      const unit = qs<HTMLElement>(row, '[data-line-unit]');
      // The quantity is an <input> (editable) — assigning .value, never text:
      // textContent on an input never reaches the field the user sees/edits.
      const qty = qs<HTMLInputElement>(row, '[data-line-qty]');
      const importe = qs<HTMLElement>(row, '[data-line-importe]');

      setText(name, item.nombre);
      // A pack line names its presentation so the price never looks wrong
      // ("Paquete x12 · S/ 50.00 c/u"); unit lines keep the short label.
      const unidades = Math.max(1, item.unidades ?? 1);
      const presentacion = (item.presentacion ?? '').trim();
      const precioLinea = `${formatCurrency(item.precio)} c/u`;
      setText(unit, unidades > 1 && presentacion !== '' ? `${presentacion} · ${precioLinea}` : precioLinea);
      if (qty) qty.value = String(item.cantidad);
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

    if (changed) {
      const row = qs<HTMLElement>(linesEl, `[data-cart-line="${CSS.escape(changed)}"]`);
      if (row) revealRow(row);
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

  // Agregar — product data rides on the painted card's dataset and on the
  // SELECTED presentation pill (both set by islands/catalog/catalog.ts).
  // Only this button adds (owner request 2026-11-04) and it always adds ONE
  // line unit of the chosen presentation (§4.2D — no stepper).
  const add = target.closest<HTMLElement>('[data-add-to-cart]');
  if (add) {
    const card = closestCard(add);
    if (!card?.dataset.productId) return;
    const stock = Number(card.dataset.productStock);
    // Defense in depth (refactorUI §4.2D, plan-refactor-ui T0.2): an agotado
    // must NEVER enter the cart, even if a clone lost its disabled state.
    if (!Number.isFinite(stock) || stock === 0) return;

    const pill = qs<HTMLElement>(card, '[data-pres-pill][aria-pressed="true"]');
    const unidades = Math.max(1, Number(pill?.dataset.presUnits) || 1);
    const presentacion = (pill?.dataset.presName ?? '').trim();
    const precio = Number(pill?.dataset.presPrice ?? card.dataset.productPrice);
    if (!Number.isFinite(precio) || precio <= 0) return;

    // A x12 pack consumes 12 units — never let it oversell the shelf.
    if (stock < unidades) {
      mostrarToast(`No hay stock suficiente de "${card.dataset.productName ?? ''}".`);
      return;
    }

    const productoId = card.dataset.productId;
    // Two presentations of the same product are two lines: the id is the
    // LINE key, productoId is what the sale + stock payloads use.
    addToCart(
      {
        id: presentacion !== '' ? `${productoId}::${presentacion}` : productoId,
        productoId,
        nombre: card.dataset.productName ?? '',
        precio,
        ...(presentacion !== '' ? { presentacion } : {}),
        ...(unidades > 1 ? { unidades } : {}),
        ...(card.dataset.productImage ? { imagen_url: card.dataset.productImage } : {}),
      },
      1,
    );
    popBadges();
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

// <lg the ticket is a CLOSED bottom sheet while selling, so the added line
// cannot be revealed at add time. Opening it jumps to the last line — where
// the most recent add landed (same owner report: no hunting for the product).
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('[data-modal-open="ticket"]')) return;
  const rows = qsa<HTMLElement>(linesEl, '[data-cart-line]');
  const last = rows[rows.length - 1];
  if (last) revealRow(last);
});

// Cart lines action dispatcher: stepper ± and remove delegated on the lines container.
delegateAction(linesEl, 'click', 'data-cart-action', {
  'step-up': (trigger) => {
    const row = trigger.closest<HTMLElement>('[data-cart-line]');
    const id = row?.dataset.cartLine;
    const qty = qs<HTMLInputElement>(row, '[data-line-qty]');
    if (!id || !qty) return;
    const current = Number(qty.value);
    if (!Number.isFinite(current)) return;
    updateCartQuantity(id, current + 1);
  },
  'step-down': (trigger) => {
    const row = trigger.closest<HTMLElement>('[data-cart-line]');
    const id = row?.dataset.cartLine;
    const qty = qs<HTMLInputElement>(row, '[data-line-qty]');
    if (!id || !qty) return;
    const current = Number(qty.value);
    if (!Number.isFinite(current) || current <= 1) return;
    updateCartQuantity(id, current - 1);
  },
  remove: (trigger) => {
    const id = trigger.closest<HTMLElement>('[data-cart-line]')?.dataset.cartLine;
    if (id) removeFromCart(id);
  },
});

// ── Editable quantity (CartLine input) ────────────────────────────────────
// The store repaint recreates every line, so committing on each keystroke
// would destroy the input mid-typing. The value is committed on `change`
// (blur or Enter); paint() then rewrites importe and totals from the store.
const MAX_CANTIDAD = 9999;

function qtyInputOf(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof HTMLInputElement)) return null;
  return target.matches('[data-line-qty]') ? target : null;
}

// Digits only while typing (no "e", signs or pasted text).
linesEl?.addEventListener('input', (event) => {
  const input = qtyInputOf(event.target);
  if (!input) return;
  const digits = input.value.replace(/\D/g, '').slice(0, String(MAX_CANTIDAD).length);
  if (input.value !== digits) input.value = digits;
});

// Enter commits immediately (blur fires `change`) instead of doing nothing.
linesEl?.addEventListener('keydown', (event) => {
  const input = qtyInputOf(event.target);
  if (!input || event.key !== 'Enter') return;
  event.preventDefault();
  input.blur();
});

// Select the current number on focus: typing replaces it in one go.
linesEl?.addEventListener('focusin', (event) => {
  qtyInputOf(event.target)?.select();
});

linesEl?.addEventListener('change', (event) => {
  const input = qtyInputOf(event.target);
  if (!input) return;
  const row = input.closest<HTMLElement>('[data-cart-line]');
  const id = row?.dataset.cartLine;
  if (!id) return;

  const cantidad = Number(input.value);
  const actual = getCart().find((item) => item.id === id)?.cantidad;
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    // Empty/invalid: restore the stored quantity instead of dropping the line.
    input.value = String(actual ?? 1);
    return;
  }
  if (cantidad === actual) {
    input.value = String(cantidad); // normalize "01" → "1"
    return;
  }
  updateCartQuantity(id, Math.min(cantidad, MAX_CANTIDAD));
});

// Immediate first paint + every store change (badge subscribes separately).
subscribeCart(paint);
