// Paints the cola_sync indicator + permanent-error controls from
// stores/syncQueue (extras.md §6 rows 3-4): discreet pending state while
// items wait, danger alert with human Retry/Discard once something hits
// error_permanente. Updates arrive from store mutations (subscribeQueue) —
// NEVER from timers. Detail text is plain text (no HTML), Spanish, no raw
// codes (stilesbase §5.7). Browser-only module, loaded via an <script>.

import { discardFailed, retryFailed, subscribeQueue } from '../../stores/syncQueue';
import { formatFecha } from '../../utils/format';
import { closeModal, openModal } from '../../utils/modal';

const root = document.querySelector<HTMLElement>('[data-sync-root]');

if (root) {
  const pendingEl = root.querySelector<HTMLElement>('[data-sync-pending]');
  const countEl = root.querySelector<HTMLElement>('[data-sync-count]');
  const dangerEl = root.querySelector<HTMLElement>('[data-alert="sync-danger"]');
  const detailEl = root.querySelector<HTMLElement>('[data-sync-detail]');
  const retryBtn = root.querySelector<HTMLElement>('[data-sync-retry]');
  const discardBtn = root.querySelector<HTMLElement>('[data-sync-discard]');
  const confirmBtn = root.querySelector<HTMLElement>('[data-sync-confirm-discard]');
  const modal = root.querySelector<HTMLElement>('[data-modal-root="sync-detail"]');

  subscribeQueue((items) => {
    const waiting = items.filter((i) => i.estado === 'pendiente' || i.estado === 'enviando');
    const failed = items.filter((i) => i.estado === 'error_permanente');

    if (pendingEl) pendingEl.hidden = waiting.length === 0;
    if (countEl) countEl.textContent = String(waiting.length);
    if (dangerEl) dangerEl.hidden = failed.length === 0;

    // One plain line per failed item: date, what it was, how many attempts.
    if (detailEl) {
      detailEl.textContent = failed
        .map((item) => {
          const que = item.tipo === 'registrarVenta' ? 'Venta' : 'Stock';
          return `${formatFecha(item.creado)} — ${que} — intentos: ${item.intentos}`;
        })
        .join('\n');
    }
  });

  retryBtn?.addEventListener('click', () => {
    retryFailed();
  });

  // Discard is destructive → always through the confirmation modal, where
  // the detail is visible before deciding (stilesbase §5.5).
  discardBtn?.addEventListener('click', () => {
    if (modal) openModal(modal, discardBtn);
  });

  confirmBtn?.addEventListener('click', () => {
    discardFailed();
    if (modal) closeModal(modal);
  });
}
