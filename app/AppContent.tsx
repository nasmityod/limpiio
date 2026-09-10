'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { APP_CHUNK_RELOAD_KEY, clearChunkReloadFlag } from '@/lib/chunk-load-error';
import { useCart } from "../context/CartContext";
import Navbar, { type NavbarContact } from "../components/Navbar";

// PERF-02 (AUDITORIA-2026-07): el drawer (framer-motion + next/image) va en un
// chunk aparte y solo se descarga tras la primera apertura del carrito.
const CartDrawer = dynamic(() => import("../components/CartDrawer"), { ssr: false });

/**
 * Shell mínimo del cliente: solo gestiona la apertura del carrito
 * y renderiza Navbar + CartDrawer en rutas públicas.
 * En /admin/* ocultamos navbar y carrito (el admin usa su propio shell).
 * Los datos de contacto llegan del servidor (readSettings) — regla R1:
 * nada de teléfonos ni emails hardcodeados en componentes de UI.
 */
export default function AppContent({ contact }: { contact: NavbarContact }) {
  const { openCart, isCartOpen, announcement } = useCart();
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin') ?? false;

  // Monta el drawer solo cuando se necesita por primera vez (y ya no se desmonta,
  // para conservar la animación de cierre).
  const [cartMounted, setCartMounted] = useState(false);
  useEffect(() => {
    if (isCartOpen) setCartMounted(true);
  }, [isCartOpen]);

  useEffect(() => {
    if (isAdmin) return;
    const id = requestAnimationFrame(() => {
      if (!document.querySelector('[data-app-error]')) {
        clearChunkReloadFlag(APP_CHUNK_RELOAD_KEY);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isAdmin, pathname]);

  if (isAdmin) return null;

  return (
    <>
      <Navbar onCartClick={openCart} contact={contact} />
      {cartMounted && <CartDrawer />}
      {/* SESIÓN 24: región aria-live global para anuncios del carrito.
          role="status" + aria-live="polite" + aria-atomic="true" asegura
          que lectores de pantalla anuncien el contenido completo al cambiar,
          sin interrumpir otras tareas. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
    </>
  );
}
