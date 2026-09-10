'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Proveedor global de animaciones: respeta la preferencia del usuario
 * (prefers-reduced-motion) y la comunica a todos los componentes framer-motion
 * del árbol. Esto garantiza que cualquier animación sin manejo explícito de
 * reduced motion herede el comportamiento correcto.
 *
 * Colocar dentro de AuthProvider (donde ya hay 'use client' suficiente)
 * para cubrir todos los componentes cliente que usan framer-motion.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
