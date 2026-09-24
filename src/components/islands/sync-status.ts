// Paints the cola_sync indicator + permanent-error controls from
// stores/syncQueue (extras.md §6 rows 3-4): discreet pending state while
// items wait, danger alert with human Retry/Discard once something hits
// error_permanente. Updates arrive from store mutations (subscribeQueue) —
// NEVER from timers. Detail text is plain text (no HTML), Spanish, no raw
// codes (stilesbase §5.7). Browser-only module.
//
// refactorUI Fase 1 split: the PENDING pill lives in the LayoutApp TopBar
// (document level — this module loads on every LayoutApp page), while the
// danger alert + detail modal stay inside SyncStatusIndicator's root.
// Contract: [data-sync-pending]/[data-sync-count] anywhere in the document;
// everything else scoped to [data-sync-root].

import { discardFailed, retryFailed, subscribeQueue } from '../../stores/syncQueue';
import { formatFecha } from '../../utils/format';
import { closeModal, openModal } from '../../utils/modal';
import { qs, setText, setHidden } from '../../utils/dom';

const pendingEl = qs<HTMLElement>(document, '[data-sync-pending]');
const countEl = qs<HTMLElement>(document, '[data-sync-count]');

const root = qs<HTMLElement>(document, '[data-sync-root]');
const dangerEl = qs<HTMLElement>(root, '[data-alert="sync-danger"]');
const detailEl = qs<HTMLElement>(root, '[data-sync-detail]');
const retryBtn = qs<HTMLElement>(root, '[data-sync-retry]');
const discardBtn = qs<HTMLElement>(root, '[data-sync-discard]');
const confirmBtn = qs<HTMLElement>(root, '[data-sync-confirm-discard]');
const modal = qs<HTMLElement>(root, '[data-modal-root="sync-detail"]');

if (pendingEl || dangerEl) {
  subscribeQueue((items) => {
    const waiting = items.filter((i) => i.estado === 'pendiente' || i.estado === 'enviando');
    const failed = items.filter((i) => i.estado === 'error_permanente');

    setHidden(pendingEl, waiting.length === 0);
    setText(countEl, String(waiting.length));
    setHidden(dangerEl, failed.length === 0);

    // One plain line per failed item: date, what it was, how many attempts.
    if (detailEl) {
      setText(
        detailEl,
        failed
          .map((item) => {
            const que = item.tipo === 'registrarVenta' ? 'Venta' : 'Stock';
            return `${formatFecha(item.creado)} — ${que} — intentos: ${item.intentos}`;
          })
          .join('\n'),
      );
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
