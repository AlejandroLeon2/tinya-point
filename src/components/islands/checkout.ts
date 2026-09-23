// Checkout runtime — closes a sale following the EXACT base.md §7 order:
//   1. id_venta = client uuid
//   2. snapshot into historial_ventas BEFORE any network
//   3. discount stock locally in catalogo_cache (accepted inconsistency in
//      base.md §8 — no fancy merge, the sync timestamp stays untouched)
//   4. clear the cart
//   5. immediate sync attempt via api/actions: registrarVenta FIRST, then
//      actualizarStock per sold item (appscriptbase.md §5.2, in that order);
//      network_failure/unauthorized → enqueue into cola_sync via the store;
//      other api_error → simple Spanish alert, never a raw code (§5.7),
//      and no pointless retries of a rejected payload.
// The sale NEVER waits on the Sheet (base.md §6) — success feedback shows as
// soon as step 4 completes. Payment method + cash change are pure client UI.
// Browser-only module, loaded via an Astro <script>.

import type { DatosRegistrarVenta } from '../../api/types';
import { actualizarStock } from '../../api/actions/stock';
import { registrarVenta } from '../../api/actions/ventas';
import { clearCart, getCart, subscribeCart } from '../../stores/cart';
import { enqueue } from '../../stores/syncQueue';
import { formatCurrency } from '../../utils/format';
import {
  getCatalogoCache,
  getHistorialVentas,
  setCatalogoCache,
  setHistorialVentas,
  type ItemVenta,
  type VentaLocal,
} from '../../utils/storage';
import { calcTax, calcTotal, etiquetaIgv } from '../../utils/tax';
import type { MetodoPago } from '../../utils/storage';

const root = document.querySelector<HTMLElement>('[data-checkout-root]');

if (root) {
  const linesEl = root.querySelector<HTMLElement>('[data-checkout-lines]');
  const template = root.querySelector<HTMLTemplateElement>('[data-checkout-line-template]');
  const subtotalEl = root.querySelector<HTMLElement>('[data-cart-subtotal]');
  const taxEl = root.querySelector<HTMLElement>('[data-cart-impuesto]');
  const totalEl = root.querySelector<HTMLElement>('[data-cart-total]');
  const taxLabelEl = root.querySelector<HTMLElement>('[data-cart-tax-label]');
  // Configured IGV overwrites the build-time default label (Fase 5) — once
  // at startup: the rate only changes via /ajustes, which reloads the page.
  if (taxLabelEl) taxLabelEl.textContent = etiquetaIgv();
  const cashBlock = root.querySelector<HTMLElement>('[data-checkout-cash]');
  const recibidoInput = root.querySelector<HTMLInputElement>('[data-checkout-recibido]');
  const vueltoEl = root.querySelector<HTMLElement>('[data-checkout-vuelto]');
  const chargeBtn = root.querySelector<HTMLButtonElement>('[data-checkout-charge]');
  const successEl = root.querySelector<HTMLElement>('[data-alert="checkout-success"]');
  const errorEl = root.querySelector<HTMLElement>('[data-alert="checkout-error"]');

  function selectedMethod(): MetodoPago {
    const checked = root.querySelector<HTMLInputElement>('input[name="metodo_pago"]:checked');
    return (checked?.value as MetodoPago | undefined) ?? 'efectivo';
  }

  function cartTotal(): number {
    return getCart().reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  }

  function renderChange(): void {
    if (!cashBlock || !recibidoInput || !vueltoEl) return;
    const isCash = selectedMethod() === 'efectivo';
    cashBlock.hidden = !isCash;
    if (!isCash) return;

    const raw = recibidoInput.value.trim();
    if (raw === '') {
      vueltoEl.hidden = true;
      return;
    }
    const recibido = Number(raw);
    if (!Number.isFinite(recibido)) {
      vueltoEl.hidden = true;
      return;
    }
    const diff = recibido - cartTotal();
    vueltoEl.hidden = false;
    // Same simple Spanish either direction — the cashier needs the gap, fast.
    vueltoEl.textContent =
      diff >= 0 ? `Vuelto: ${formatCurrency(diff)}` : `Faltan: ${formatCurrency(-diff)}`;
  }

  // Paint read-only rows + totals scoped to THIS checkout instance (the cart
  // summary on the same page owns its own instance of the same hooks).
  function paint(items: ReturnType<typeof getCart>): void {
    if (linesEl && template) {
      linesEl.querySelectorAll('[data-checkout-line]').forEach((row) => row.remove());
      for (const item of items) {
        const first = template.content.firstElementChild;
        if (!first) continue;
        const row = first.cloneNode(true) as HTMLElement;

        const name = row.querySelector<HTMLElement>('[data-checkout-name]');
        const qty = row.querySelector<HTMLElement>('[data-checkout-qty]');
        const unit = row.querySelector<HTMLElement>('[data-checkout-unit]');
        const importe = row.querySelector<HTMLElement>('[data-checkout-importe]');

        if (name) name.textContent = item.nombre;
        if (qty) qty.textContent = String(item.cantidad);
        if (unit) unit.textContent = formatCurrency(item.precio);
        if (importe) importe.textContent = formatCurrency(item.precio * item.cantidad);

        linesEl.append(row);
      }

      const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
      if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
      if (taxEl) taxEl.textContent = formatCurrency(calcTax(subtotal));
      if (totalEl) totalEl.textContent = formatCurrency(calcTotal(subtotal));
    }

    if (chargeBtn) chargeBtn.disabled = items.length === 0;
    // A cart change starts a fresh sale cycle — stale feedback would lie.
    if (successEl) successEl.hidden = true;
    if (errorEl) errorEl.hidden = true;
    renderChange();
  }

  async function charge(): Promise<void> {
    const items = getCart();
    if (items.length === 0) return;

    if (successEl) successEl.hidden = true;
    if (errorEl) errorEl.hidden = true;

    // 1. Client-generated uuid.
    const idVenta = crypto.randomUUID();
    const metodo = selectedMethod();
    const wireItems = items.map((item) => ({ id: item.id, cantidad: item.cantidad, precio: item.precio }));
    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const total = calcTotal(subtotal);

    // 2. Local snapshot BEFORE any network — with `nombre` (local history) —
    //    while the wire payload below stays nombre-less (appscriptbase §4.3).
    const localItems: ItemVenta[] = items.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precio: item.precio,
    }));
    const ventaLocal: VentaLocal = {
      id_venta: idVenta,
      fecha_hora: new Date().toISOString(),
      items: localItems,
      subtotal, // local-only snapshot for /historial/venta detail (Fase 3, G9)
      total,
      metodo_pago: metodo,
    };
    setHistorialVentas([ventaLocal, ...getHistorialVentas()]); // newest first

    // 3. Local stock discount — plain decrement, no merge games (base.md §8).
    const cache = getCatalogoCache();
    if (cache) {
      for (const item of items) {
        const product = cache.productos.find((p) => p.id === item.id);
        if (product) product.stock = Math.max(0, product.stock - item.cantidad);
      }
      setCatalogoCache(cache); // timestamp untouched: a sale is not a sync
    }

    // 4. Empty the cart — the sale already happened locally.
    clearCart();

    // Success feedback the moment step 4 lands — never blocks the next sale.
    if (successEl) successEl.hidden = false;

    // 5. Immediate sync attempt: registrarVenta FIRST, then stock per item.
    const payload: DatosRegistrarVenta = {
      id_venta: idVenta,
      items: wireItems,
      total,
      metodo_pago: metodo,
    };
    const ventaResult = await registrarVenta(payload);

    const shouldEnqueue = (result: { status: string; error?: string }): boolean =>
      result.status === 'network_failure' ||
      (result.status === 'api_error' && result.error === 'unauthorized');

    if (ventaResult.status === 'success') {
      for (const wireItem of wireItems) {
        const stockPayload = { id: wireItem.id, cantidadVendida: wireItem.cantidad };
        const stockResult = await actualizarStock(stockPayload);
        if (shouldEnqueue(stockResult)) {
          enqueue('actualizarStock', stockPayload);
        } else if (stockResult.status === 'api_error') {
          if (errorEl) errorEl.hidden = false; // partial acceptance, §5.3
        }
      }
      return;
    }

    if (shouldEnqueue(ventaResult)) {
      // Sale did not reach the Sheet: enqueue venta FIRST, then its stock
      // updates — strict FIFO replays them in the same order later.
      enqueue('registrarVenta', payload);
      for (const wireItem of wireItems) {
        enqueue('actualizarStock', { id: wireItem.id, cantidadVendida: wireItem.cantidad });
      }
      return;
    }

    // api_error (payload_invalido / error_interno): simple copy, no codes,
    // no pointless retries — the sale itself is already safe locally.
    if (errorEl) errorEl.hidden = false;
  }

  chargeBtn?.addEventListener('click', () => {
    void charge();
  });

  for (const radio of root.querySelectorAll<HTMLInputElement>('input[name="metodo_pago"]')) {
    radio.addEventListener('change', renderChange);
  }
  recibidoInput?.addEventListener('input', renderChange);

  // Immediate first paint + every cart change (badge/totals elsewhere update
  // through their own subscriptions).
  subscribeCart(paint);
}
