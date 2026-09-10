'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { MapPin, ShieldCheck } from 'lucide-react';
import { whatsappHref } from '@/lib/mundotech-social';
import Logo from '@/components/Logo';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

export type AuthSplitVariant = 'login' | 'register' | 'recovery';

interface AuthSplitLayoutProps {
  variant: AuthSplitVariant;
  breadcrumbLast: string;
  children: React.ReactNode;
}

/**
 * Layout de autenticación "letrero de tienda": una sola tarjeta centrada.
 * La banda superior reproduce la fachada real de MundoTech (navy + logo
 * amarillo + CONECTADOS CONTIGO) y el pie ancla la cuenta a un lugar físico
 * verificable. Sin split-layout con ilustración — ese es el patrón que
 * cualquier generador escupe por defecto.
 */
const COPY: Record<AuthSplitVariant, { tagline: string }> = {
  login: {
    tagline:
      'Pedidos, garantías y favoritos — el mismo trato del mostrador, desde tu casa.',
  },
  register: {
    tagline:
      'Crea tu cuenta para comprar más rápido y seguir tus pedidos paso a paso.',
  },
  recovery: {
    tagline:
      'Te enviamos un enlace seguro de un solo uso. Tu cuenta queda protegida.',
  },
};

export default function AuthSplitLayout({
  variant,
  breadcrumbLast,
  children,
}: AuthSplitLayoutProps) {
  const prefersReduced = useReducedMotion();
  const { tagline } = COPY[variant];
  const waHref = whatsappHref(
    '0412-1471338',
    'Hola MundoTech, necesito ayuda con mi cuenta en la página web.',
  );

  return (
    <div className="w-full">
      <nav className="text-sm text-slate-500 mb-5" aria-label="Migas de pan">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <li>
            <Link href="/" className="font-medium text-slate-600 hover:text-navy transition-colors">
              Inicio
            </Link>
          </li>
          <li className="text-slate-300" aria-hidden>
            /
          </li>
          <li>
            <span className="text-slate-600">Cuenta</span>
          </li>
          <li className="text-slate-300" aria-hidden>
            /
          </li>
          <li className="font-semibold text-navy">{breadcrumbLast}</li>
        </ol>
      </nav>

      <div className="mx-auto w-full max-w-[30rem]">
        <motion.div
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-3xl border border-border bg-white shadow-card"
        >
          {/* Banda-letrero: la fachada de la tienda */}
          <div className="relative bg-black px-6 py-6 sm:px-8 sm:py-7 border-b-[3px] border-brand-yellow" data-logo-surface="dark">
            <div className="absolute inset-0 circuit-bg opacity-40" aria-hidden />
            <div className="relative">
              <Logo variant="dark" size="lg" href="/" />
              <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.24em] text-brand-yellow">
                Conectados Contigo
              </p>
              <p className="mt-2.5 max-w-sm text-[12.5px] leading-relaxed text-white/70">
                {tagline}
              </p>
            </div>
          </div>

          {/* Formulario */}
          <div className="p-6 sm:p-8">{children}</div>

          {/* Pie verificable: esta cuenta pertenece a una tienda real */}
          <div className="border-t border-border bg-surface-muted px-6 py-4 sm:px-8">
            <div className="flex flex-col gap-2 text-[12px] text-slate-500">
              <span className="inline-flex items-start gap-2">
                <MapPin size={13} className="mt-0.5 flex-shrink-0 text-brand-yellowDk" aria-hidden />
                Tienda física: Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001.
              </span>
              <span className="inline-flex items-start gap-2">
                <ShieldCheck size={13} className="mt-0.5 flex-shrink-0 text-brand-yellowDk" aria-hidden />
                Mismo usuario para la web y para tus garantías en tienda.
              </span>
            </div>
          </div>
        </motion.div>

        <p className="mt-4 text-center text-[12px] text-slate-600">
          ¿Trancado con algo?{' '}
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-navy underline decoration-brand-yellow decoration-2 underline-offset-2"
          >
            Escríbenos por WhatsApp
          </a>{' '}
          y te ayudamos al toque.
        </p>
      </div>
    </div>
  );
}
