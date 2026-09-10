'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** Breakpoint `md` de Tailwind — el mismo que usaba `md:hidden` / `hidden md:block`. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

type Listener = () => void;

/**
 * Suscripción compartida a `matchMedia`: un único MediaQueryList para toda la
 * aplicación, no uno por componente. Con varias tablas en pantalla eso evita
 * registrar N listeners equivalentes.
 */
let sharedQuery: MediaQueryList | null = null;
const listeners = new Set<Listener>();

function ensureQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!sharedQuery) {
    sharedQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    sharedQuery.addEventListener('change', () => {
      for (const listener of listeners) listener();
    });
  }
  return sharedQuery;
}

function subscribe(listener: Listener): () => void {
  ensureQuery();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return ensureQuery()?.matches ?? false;
}

/** Durante SSR/hidratación asumimos móvil (mobile-first, igual que el CSS). */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * `true` cuando el viewport está en el breakpoint `md` o superior.
 *
 * Por qué existe: `DataTable` renderizaba SIEMPRE la lista móvil **y** la tabla
 * de escritorio, ocultando una de las dos con Tailwind. `md:hidden` es CSS: no
 * evita que React construya el árbol, ni que el navegador cree los nodos DOM.
 * Con 500 filas eso son ~1 000 representaciones por render (ver RC-03 de la
 * auditoría de rendimiento del Panel Admin).
 *
 * `useSyncExternalStore` con `getServerSnapshot` es la forma soportada por React
 * de leer un valor que difiere entre servidor y cliente: hidrata con el valor de
 * servidor y re-renderiza inmediatamente después con el real, sin desajustes de
 * hidratación (a diferencia de leer `window.matchMedia` durante el render).
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Variante con media query arbitraria para casos puntuales. Mantiene la misma
 * semántica SSR (`false` en servidor).
 */
export function useMediaQuery(query: string): boolean {
  const subscribeTo = useCallback(
    (listener: Listener) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    },
    [query],
  );
  const snapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribeTo, snapshot, getServerSnapshot);
}
