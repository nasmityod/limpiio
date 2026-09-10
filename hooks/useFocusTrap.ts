'use client';

import { useEffect, useRef, useCallback, useId, type RefObject } from 'react';
import {
  defaultIsVisible,
  isFocusableElement,
  type FocusTrapVisibilityStrategy,
} from '@/lib/focus-trap-utils';

/**
 * Selector CSS para elementos enfocables dentro de un contenedor.
 * Incluye targets de 44px (min-height/min-width en los botones del proyecto).
 */
const FOCUSABLE =
  'a[href], button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])';

interface TrapStackEntry {
  id: string;
  container: HTMLElement;
  previouslyFocused: Element | null;
}

let trapStack: TrapStackEntry[] = [];

/** Solo para pruebas — vacía el stack global entre casos. */
export function resetFocusTrapStackForTests(): void {
  trapStack = [];
}

interface UseFocusTrapOptions {
  /** Ref del contenedor del diálogo */
  containerRef: RefObject<HTMLElement | null>;
  /** Diálogo abierto */
  enabled: boolean;
  /**
   * Si true, el foco inicial va al último elemento (`default: first`).
   * Se usa en acciones destructivas: el botón peligroso NO recibe foco
   * por defecto (se enfoca "Cancelar" que está al final).
   */
  focusLast?: boolean;
  /**
   * Callback al presionar Escape.
   * Opcional: el hook maneja el evento y llama onClose si existe.
   */
  onClose?: () => void;
  /**
   * Si true (default), el foco se devuelve al trigger al cerrar.
   */
  restoreFocus?: boolean;
  /**
   * Estrategia de visibilidad para filtrar focusables.
   * Por defecto usa computedStyle/getClientRects (browser).
   * En JSDOM inyectar `jsdomFocusTrapVisibility`.
   */
  isVisible?: FocusTrapVisibilityStrategy;
}

/**
 * Hook de focus trap universal para diálogos modales.
 *
 * - Guarda el elemento que tenía el foco antes de abrir.
 * - Enfoca el primer (o último) elemento enfocable dentro del contenedor.
 * - Escucha Tab/Shift+Tab en el contenedor y cicla dentro.
 * - Escucha Escape globalmente y llama onClose (solo el overlay superior).
 * - Al cerrar, restaura el foco al trigger si sigue conectado y enfocable.
 * - Soporta stack de overlays (varios traps anidados) con id único por instancia.
 * - No añade listeners duplicados (cleanup en el return).
 * - Si el contenedor no tiene elementos enfocables, enfoca el propio contenedor.
 */
export function useFocusTrap({
  containerRef,
  enabled,
  focusLast = false,
  onClose,
  restoreFocus = true,
  isVisible = defaultIsVisible,
}: UseFocusTrapOptions) {
  const trapId = useId();
  const previousFocusRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const getFocusables = useCallback(() => {
    const el = containerRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
  }, [containerRef, isVisible]);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement;
    previousFocusRef.current = previouslyFocused;

    trapStack = trapStack.filter((entry) => entry.id !== trapId);
    trapStack.push({ id: trapId, container, previouslyFocused });

    const focusables = getFocusables();
    const target = focusLast ? focusables[focusables.length - 1] : focusables[0];

    let addedTabindex = false;
    if (target) {
      target.focus({ preventScroll: true });
    } else {
      if (!container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
        addedTabindex = true;
      }
      container.focus({ preventScroll: true });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const top = trapStack[trapStack.length - 1];
      if (!top || top.id !== trapId) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = getFocusables();
      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      trapStack = trapStack.filter((entry) => entry.id !== trapId);

      if (addedTabindex) {
        container.removeAttribute('tabindex');
      }

      const prev = previousFocusRef.current;
      if (
        restoreFocus &&
        prev instanceof HTMLElement &&
        prev.isConnected &&
        isFocusableElement(prev, isVisible)
      ) {
        // preventScroll: sin esto, restaurar el foco al trigger reintroduce
        // el mismo salto de scroll que useBodyScrollLock acaba de corregir
        // al cerrar el overlay (ver hooks/useBodyScrollLock.ts).
        prev.focus({ preventScroll: true });
      }
    };
  }, [enabled, containerRef, focusLast, getFocusables, restoreFocus, isVisible, trapId]);
}

export default useFocusTrap;
