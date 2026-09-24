// Small DOM helpers used by islands/ (doc/astrobase.md §3.5).

export function closestAncestor<T extends Element>(element: Element, selector: string): T | null {
  return element.closest(selector) as T | null;
}

// Used by the add-to-cart handler so each script scopes itself to ITS card —
// never a fixed id shared by every card on the page (doc/astrobase.md §3.4).
export function closestCard(element: Element): HTMLElement | null {
  return closestAncestor<HTMLElement>(element, '.card');
}

// Typed querySelector shorthand — no-op if scope is null.
export function qs<T extends Element>(scope: ParentNode | null, selector: string): T | null {
  if (!scope) return null;
  return scope.querySelector(selector) as T | null;
}

// querySelectorAll → array — no-op if scope is null.
export function qsa<T extends Element>(scope: ParentNode | null, selector: string): T[] {
  if (!scope) return [];
  return Array.from(scope.querySelectorAll(selector)) as T[];
}

// Safe textContent setter — no-op if el is null (eliminates `if (el) el.textContent = …`).
export function setText(el: HTMLElement | null | undefined, text: string): void {
  if (el) el.textContent = text;
}

// Safe hidden setter — no-op if el is null (eliminates `if (el) el.hidden = …`).
export function setHidden(el: HTMLElement | null | undefined, hidden: boolean): void {
  if (el) el.hidden = hidden;
}

// Set pill visibility by attribute: iterates [attr] within scope and hides unless attr === active.
// Used for pills that show one state at a time (D7: caja, historial, venta-detail).
export function setPillState(scope: ParentNode | null, attr: string, active: string): void {
  if (!scope) return;
  const pills = qsa<HTMLElement>(scope, `[${attr}]`);
  for (const pill of pills) {
    pill.hidden = pill.getAttribute(attr) !== active;
  }
}

// Clone a <template>'s firstElementChild — null-safe (D6: 8 islands).
export function cloneTemplate(tpl: HTMLTemplateElement | null): HTMLElement | null {
  if (!tpl) return null;
  return tpl.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
}

// Select a single chip by attribute value: sets aria-pressed="true" only on the matching chip,
// "false" on all others in the group (D8: catalog, historial, product-admin, stock).
export function selectChip(group: ParentNode | null, attr: string, value: string): void {
  if (!group) return;
  const chips = qsa<HTMLElement>(group, `[${attr}]`);
  for (const chip of chips) {
    chip.setAttribute('aria-pressed', chip.getAttribute(attr) === value ? 'true' : 'false');
  }
}

// Paint a StatCard: value always; subtext ONLY when caller passes it (undefined = leave alone).
// Reference: caja.ts:162-175 (D14: caja, historial, stock).
export function paintStat(card: HTMLElement | null, valor: string, sub?: string): void {
  if (!card) return;
  const v = qs<HTMLElement>(card, '[data-stat-value]');
  if (v) v.textContent = valor;
  if (sub === undefined) return;
  const s = qs<HTMLElement>(card, '[data-stat-sub]');
  if (!s) return;
  if (sub) {
    s.textContent = sub;
    s.hidden = false;
  } else {
    s.hidden = true;
  }
}

// Debounce utility — D9: catalog, historial, product-admin.
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

// Declarative event delegation dispatcher (plan-islands-patrones.md Fase 1).
export type ActionHandler<T extends HTMLElement = HTMLElement> = (
  el: T,
  dataset: DOMStringMap,
  event: Event,
) => void | Promise<void>;

export function delegateAction(
  container: ParentNode | null | undefined,
  eventName: string,
  actionAttr: string,
  handlers: Record<string, ActionHandler>,
): void {
  if (!container) return;
  container.addEventListener(eventName, (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const trigger = target.closest<HTMLElement>(`[${actionAttr}]`);
    if (!trigger || !container.contains(trigger)) return;
    const actionKey = trigger.getAttribute(actionAttr);
    if (!actionKey) return;
    const handler = handlers[actionKey];
    if (handler) {
      void handler(trigger, trigger.dataset, event);
    }
  });
}

