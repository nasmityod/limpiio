'use client';

import { useEffect } from 'react';

let lockCount = 0;
let prevOverflow = '';
let prevPaddingRight = '';
let prevPosition = '';
let prevTop = '';
let prevWidth = '';
let lockedScrollY = 0;

/**
 * En dev, React Strict Mode desmonta/remonta efectos en <50 ms. Guardamos el
 * scroll pendiente con timestamp para que el remount lo reutilice, pero un
 * valor viejo (p. ej. tras HMR o navegación) no pise el scroll real.
 */
let pendingScrollRestore: { y: number; at: number } | null = null;

const PENDING_RESTORE_MAX_MS = 50;

function readScrollY(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function restoreScrollPosition(y: number) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  });
}

/**
 * Scroll-lock del body con contador compartido: varios overlays (drawer de
 * categorías, carrito, filtros, modales) pueden abrirse/cerrarse en cualquier
 * orden sin dejar el scroll bloqueado ni liberarlo antes de tiempo — el bug
 * clásico de `body.style.overflow = ''` pisando el lock de otro drawer.
 *
 * En iOS Safari, `overflow: hidden` en el body no basta: el fondo sigue
 * haciendo scroll con gestos táctiles. Por eso el lock fija el body con
 * `position: fixed` en la posición actual y lo restaura (incluido el
 * scrollY) al liberar. Compensa el scrollbar añadiendo paddingRight para
 * evitar salto de layout al ocultar la barra de scroll de escritorio.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    if (lockCount === 0) {
      const pending = pendingScrollRestore;
      if (pending && Date.now() - pending.at < PENDING_RESTORE_MAX_MS) {
        lockedScrollY = pending.y;
      } else {
        lockedScrollY = readScrollY();
      }
      pendingScrollRestore = null;

      prevOverflow = document.body.style.overflow;
      prevPaddingRight = document.body.style.paddingRight;
      prevPosition = document.body.style.position;
      prevTop = document.body.style.top;
      prevWidth = document.body.style.width;

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.width = '100%';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        const y = lockedScrollY;
        pendingScrollRestore = { y, at: Date.now() };
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
        document.body.style.position = prevPosition;
        document.body.style.top = prevTop;
        document.body.style.width = prevWidth;
        restoreScrollPosition(y);
      }
    };
  }, [locked]);
}

export function resetBodyScrollLockForTests() {
  lockCount = 0;
  lockedScrollY = 0;
  pendingScrollRestore = null;
  prevOverflow = '';
  prevPaddingRight = '';
  prevPosition = '';
  prevTop = '';
  prevWidth = '';
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
}

export default useBodyScrollLock;
