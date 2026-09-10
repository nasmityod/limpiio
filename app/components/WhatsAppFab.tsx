'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { whatsappHref } from '@/lib/mundotech-social';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

/**
 * Botón flotante de WhatsApp — el canal de venta real de la tienda.
 * Editable desde /admin/personalizar (número y mensaje precargado).
 *
 * Política de visibilidad (PRD-277):
 *   - /admin/*   → oculto (panel de operación, no canal de venta)
 *   - /checkout  → oculto (competiría con el CTA de pago; foco en conversión)
 *   - /cart      → visible (cliente aún puede tener dudas antes de decidir)
 *   - resto      → visible
 *
 * PRD-276: se eliminó setTimeout(1200 ms) que dejaba el botón invisible al
 * renderizado inicial. Ahora aparece en el primer frame con animación spring.
 */
export default function WhatsAppFab({
  phone,
  message,
}: {
  phone: string;
  message?: string;
}) {
  const prefersReduced = useReducedMotion();
  const pathname = usePathname();

  const hidden =
    !pathname ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkout');

  // En /cart hay barra de compra fija al fondo en móvil
  // (checkout sticky): subir el FAB para no tapar el CTA.
  const hasBottomBar = pathname === '/cart';

  if (hidden || !phone.trim()) return null;

  return (
    <motion.a
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 16 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      transition={prefersReduced ? reducedTransition : { type: 'spring', stiffness: 320, damping: 22, delay: 0.4 }}
      href={whatsappHref(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Escríbenos por WhatsApp al ${phone}`}
      className={`group fixed z-50 flex items-center gap-0 rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-6px_rgba(18,140,126,0.5)] hover:shadow-[0_12px_32px_-6px_rgba(18,140,126,0.6)] transition-shadow ${
        hasBottomBar
          ? 'bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+5.5rem)] lg:bottom-[max(1.25rem,env(safe-area-inset-bottom))]'
          : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]'
      }`}
      style={{
        right: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <span className="sr-only">Escríbenos por WhatsApp</span>
      <span className="flex h-[52px] w-[52px] items-center justify-center sm:h-14 sm:w-14">
        <svg viewBox="0 0 32 32" fill="currentColor" className="h-7 w-7 sm:h-[30px] sm:w-[30px]" aria-hidden="true">
          <path d="M16.04 4C9.5 4 4.2 9.3 4.2 15.83c0 2.08.55 4.12 1.6 5.92L4 28l6.42-1.68a11.8 11.8 0 0 0 5.62 1.43h.01c6.53 0 11.84-5.3 11.84-11.84C27.89 9.3 22.57 4 16.04 4Zm0 21.75h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.81 1 1.02-3.71-.24-.38a9.83 9.83 0 0 1-1.51-5.24c0-5.43 4.43-9.85 9.86-9.85a9.8 9.8 0 0 1 9.84 9.86c0 5.43-4.42 9.85-9.85 9.85Zm5.4-7.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.66.15-.2.3-.77.96-.94 1.15-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47a8.9 8.9 0 0 1-1.65-2.04c-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.6-.9-2.18-.24-.58-.49-.5-.66-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.06 2.87 1.21 3.06c.15.2 2.09 3.2 5.07 4.48.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.24-.7.24-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
        </svg>
      </span>
      <span className="hidden md:block max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:max-w-[180px] group-hover:pr-5 group-hover:opacity-100">
        Escríbenos directo
      </span>
    </motion.a>
  );
}
