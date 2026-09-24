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
// The sale NEVER waits on the Sheet (base.md §6) — the venta-ok confirmation
// shows as soon as step 4 completes. Payment method + cash change are pure
// client UI.
//
// refactorUI §4.2A/E/F (Fase 2): the ticket is ONE node — lines and totals
// belong to cart-actions; THIS island owns only the payment half: method,
// recibido + quick amounts, vuelto/faltan, charge button (+reason), the
// venta-ok modal, errors and the queue. The internal sale flow is UNCHANGED.
// Browser-only module, loaded via an Astro <script>.

import type { DatosRegistrarVenta } from '../../api/types';
import { actualizarStock } from '../../api/actions/stock';
import { registrarVenta } from '../../api/actions/ventas';
import { clearCart, getCart, subscribeCart } from '../../stores/cart';
import { enqueue } from '../../stores/syncQueue';
import { formatCurrency } from '../../utils/format';
import { openModal, closeModal } from '../../utils/modal';
import {
  getCatalogoCache,
  getHistorialVentas,
  setCatalogoCache,
  setHistorialVentas,
  type ItemVenta,
  type VentaLocal,
} from '../../utils/storage';
import { calcTotal } from '../../utils/tax';
import type { MetodoPago } from '../../utils/storage';

const root = document.querySelector<HTMLElement>('[data-checkout-root]');

if (root) {
  const cashBlock = root.querySelector<HTMLElement>('[data-checkout-cash]');
  const recibidoInput = root.querySelector<HTMLInputElement>('[data-checkout-recibido]');
  const quickGroup = root.querySelector<HTMLElement>('[data-checkout-quick-group]');
  const vueltoEl = root.querySelector<HTMLElement>('[data-checkout-vuelto]');
  const vueltoAmountEl = root.querySelector<HTMLElement>('[data-checkout-vuelto-amount]');
  const faltanEl = root.querySelector<HTMLElement>('[data-checkout-faltan]');
  const faltanAmountEl = root.querySelector<HTMLElement>('[data-checkout-faltan-amount]');
  const chargeBtn = root.querySelector<HTMLButtonElement>('[data-checkout-charge]');
  const reasonEl = root.querySelector<HTMLElement>('[data-checkout-reason]');
  const errorEl = root.querySelector<HTMLElement>('[data-alert="checkout-error"]');

  // Sale-closure modal (§4.2F) — lives outside the ticket section but in
  // the same page; queried globally (no ids, §0.2).
  const ventaOkRoot = document.querySelector<HTMLElement>('[data-modal-root="venta-ok"]');
  const ventaOkTotal = document.querySelector<HTMLElement>('[data-venta-ok-total]');
  const ventaOkVuelto = document.querySelector<HTMLElement>('[data-venta-ok-vuelto]');
  const ventaOkVueltoAmount = document.querySelector<HTMLElement>('[data-venta-ok-vuelto-amount]');
  const ventaOkNueva = document.querySelector<HTMLButtonElement>('[data-venta-ok-nueva]');
  const ventaOkDetail = document.querySelector<HTMLAnchorElement>('[data-venta-ok-detail]');

  const desktop = window.matchMedia('(min-width: 768px)');
  // Money = 2 decimals. Without this, Exacto (11.68) < raw total (11.682)
  // kept the charge button disabled — comparisons and snapshots use money().
  const money = (value: number): number => Math.round(value * 100) / 100;
  let autoCloseTimer: ReturnType<typeof setTimeout> | undefined;
  let lastTotal = 0;

  function selectedMethod(): MetodoPago {
    const checked = root!.querySelector<HTMLInputElement>('input[name="metodo_pago"]:checked');
    return (checked?.value as MetodoPago | undefined) ?? 'efectivo';
  }

  function cartSubtotal(): number {
    return getCart().reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  }

  function receivedAmount(): number | null {
    const raw = recibidoInput?.value.trim() ?? '';
    if (raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  // Quick amounts (§4.2E): "Exacto" + the useful bills ≥ total. Rebuilt on
  // every cart change; static labels only (textContent, never innerHTML).
  function paintQuickAmounts(total: number): void {
    if (!quickGroup) return;
    const bills = [10, 20, 50, 100, 200].filter((bill) => bill >= total);
    quickGroup.replaceChildren();
    const options: { amount: number; label: string }[] = [
      { amount: total, label: 'Exacto' },
      ...bills.map((bill) => ({ amount: bill, label: formatCurrency(bill) })),
    ];
    for (const option of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pill pill-muted';
      btn.setAttribute('data-checkout-quick', '');
      btn.setAttribute('data-amount', option.amount.toFixed(2));
      btn.textContent = option.label;
      quickGroup.append(btn);
    }
  }

  function updateChargeState(): void {
    if (!chargeBtn || !reasonEl) return;
    const items = getCart();
    const total = money(calcTotal(cartSubtotal()));
    chargeBtn.textContent = `Cobrar ${formatCurrency(total)}`;

    let blocked = items.length === 0;
    let reason = '';
    if (!blocked && selectedMethod() === 'efectivo') {
      const recibido = receivedAmount();
      if (recibido !== null && recibido < total) {
        blocked = true;
        reason = `Faltan ${formatCurrency(total - recibido)} para poder cobrar.`;
      }
    }
    chargeBtn.disabled = blocked;
    reasonEl.textContent = reason || 'Faltan S/ 0.00 para poder cobrar.';
    reasonEl.hidden = reason === '';
  }

  function renderChange(): void {
    const isCash = selectedMethod() === 'efectivo';
    if (cashBlock) cashBlock.hidden = !isCash;
    const total = money(calcTotal(cartSubtotal()));

    if (vueltoEl) vueltoEl.hidden = true;
    if (faltanEl) faltanEl.hidden = true;
    if (isCash) {
      const recibido = receivedAmount();
      if (recibido !== null) {
        const diff = recibido - total;
        if (diff >= 0) {
          if (vueltoEl) vueltoEl.hidden = false;
          if (vueltoAmountEl) vueltoAmountEl.textContent = formatCurrency(diff);
        } else {
          if (faltanEl) faltanEl.hidden = false;
          if (faltanAmountEl) faltanAmountEl.textContent = formatCurrency(-diff);
        }
      }
    }
    updateChargeState();
  }

  // Sale-closure confirmation (§4.2F) — replaces the old success Alert.
  function showVentaOk(total: number, change: number, idVenta: string): void {
    if (!ventaOkRoot) return;
    if (ventaOkTotal) ventaOkTotal.textContent = formatCurrency(total);
    const showChange = change > 0;
    if (ventaOkVuelto) ventaOkVuelto.hidden = !showChange;
    if (ventaOkVueltoAmount && showChange) {
      ventaOkVueltoAmount.textContent = formatCurrency(change);
    }
    if (ventaOkDetail) {
      ventaOkDetail.setAttribute('href', `/historial/venta/?id=${encodeURIComponent(idVenta)}`);
    }
    openModal(ventaOkRoot);
    // Autoclose 8s ONLY when there is no change waiting to be read.
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    if (!showChange) {
      autoCloseTimer = setTimeout(() => {
        if (ventaOkRoot && !ventaOkRoot.hidden) closeModal(ventaOkRoot);
      }, 8000);
    }
  }

  async function charge(): Promise<void> {
    const items = getCart();
    if (items.length === 0) return;

    if (errorEl) errorEl.hidden = true;

    // 1. Client-generated uuid.
    const idVenta = crypto.randomUUID();
    const metodo = selectedMethod();
    const wireItems = items.map((item) => ({ id: item.id, cantidad: item.cantidad, precio: item.precio }));
    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const total = money(calcTotal(subtotal));
    const recibido = metodo === 'efectivo' ? receivedAmount() : null;
    const change = recibido !== null && recibido >= total ? recibido - total : 0;

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

    // Confirmation the moment step 4 lands — never blocks the next sale
    // (this replaced the old success Alert — §4.2F).
    showVentaOk(total, change, idVenta);

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

  // Quick amounts — ONE delegated listener with closest() (§4.2E).
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const quick = target.closest<HTMLElement>('[data-checkout-quick]');
    if (!quick || !recibidoInput) return;
    const amount = quick.getAttribute('data-amount');
    if (amount === null) return;
    recibidoInput.value = amount;
    renderChange();
  });

  // venta-ok actions: "Nueva venta" closes and focuses the catalog search
  // (next sale starts typing — §4.2F); "Ver detalle" is a plain link.
  ventaOkNueva?.addEventListener('click', () => {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    if (ventaOkRoot) closeModal(ventaOkRoot);
    const search = document.querySelector<HTMLInputElement>('[data-catalog-search]');
    search?.focus();
    search?.select();
  });

  // F9 = charge (desktop only, §4.2E).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'F9' || !desktop.matches) return;
    event.preventDefault();
    if (chargeBtn && !chargeBtn.disabled) chargeBtn.click();
  });

  // Immediate first paint + every cart change (badge/totals elsewhere update
  // through their own subscriptions).
  subscribeCart((items) => {
    const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    lastTotal = money(calcTotal(subtotal));
    paintQuickAmounts(lastTotal);
    // A cart change starts a fresh sale cycle — stale feedback would lie.
    if (errorEl) errorEl.hidden = true;
    renderChange();
  });
}
