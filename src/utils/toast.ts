// Toast runtime (refactorUI §2.3 — Fase 1): islands report SUCCESS through
// this helper instead of persistent `*-ok` alerts (D9 — no layout shift).
// Contract with ui/ToastRegion: one [data-toast-region] with one
// [data-toast-template] per page (LayoutApp renders them). Clone → set text
// via textContent (never innerHTML, §0.3) → auto-remove after 4 s (§2.2).
// Errors and actionable states stay on ui/Alert — this is success only.

const DURACION_MS = 4000;

export function mostrarToast(mensaje: string): void {
  const region = document.querySelector<HTMLElement>('[data-toast-region]');
  const template = document.querySelector<HTMLTemplateElement>('[data-toast-template]');
  if (!region || !template) return;

  const first = template.content.firstElementChild;
  if (!first) return;
  const toast = first.cloneNode(true) as HTMLElement;

  const texto = toast.querySelector<HTMLElement>('[data-toast-text]');
  if (texto) texto.textContent = mensaje;

  region.append(toast);
  window.setTimeout(() => toast.remove(), DURACION_MS);
}
