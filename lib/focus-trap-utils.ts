/**
 * Utilidades puras para focus trap (visibilidad y foco restaurable).
 * Sin dependencias de React — testeable en Vitest y reutilizable en el hook.
 */

export type FocusTrapVisibilityStrategy = (element: HTMLElement) => boolean;

/**
 * Visibilidad real en browser: excluye hidden, aria-hidden, display/visibility
 * y elementos sin layout (getClientRects vacío).
 */
export function defaultIsVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.hasAttribute('hidden')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  return element.getClientRects().length > 0;
}

/**
 * Estrategia para JSDOM: offsetParent y getClientRects suelen fallar;
 * basta con que el nodo esté conectado al documento.
 */
export const jsdomFocusTrapVisibility: FocusTrapVisibilityStrategy = (element) =>
  element.isConnected;

/**
 * Indica si un elemento puede recibir foco al restaurar (post-cierre de overlay).
 */
export function isFocusableElement(
  element: HTMLElement,
  isVisible: FocusTrapVisibilityStrategy = defaultIsVisible,
): boolean {
  if (!isVisible(element)) return false;
  if (element.hasAttribute('disabled')) return false;

  const tabIndex = element.tabIndex;
  if (tabIndex >= 0) return true;

  const tag = element.tagName;
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    return true;
  }
  if (tag === 'A') {
    const href = (element as HTMLAnchorElement).href;
    return typeof href === 'string' && href.length > 0;
  }

  return false;
}
