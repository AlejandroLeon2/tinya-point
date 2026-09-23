// Small DOM helpers used by islands/ (doc/astrobase.md §3.5).

export function closestAncestor<T extends Element>(element: Element, selector: string): T | null {
  return element.closest(selector) as T | null;
}

// Used by quantity-control.ts so each script scopes itself to ITS card —
// never a fixed id shared by every card on the page (doc/astrobase.md §3.4).
export function closestCard(element: Element): HTMLElement | null {
  return closestAncestor<HTMLElement>(element, '.card');
}
