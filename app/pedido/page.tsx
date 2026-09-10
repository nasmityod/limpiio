import type { Metadata } from 'next';
import { Suspense } from 'react';
import PedidoLookupClient from './PedidoLookupClient';

/**
 * FASE 4.2 (MEJORA 2.1): seguimiento público de pedido — el cliente (invitado
 * o registrado) consulta con número de pedido + cédula, sin iniciar sesión.
 */
export const metadata: Metadata = {
  title: 'Rastrea tu pedido',
  description:
    'Consulta el estado de tu pedido MundoTech con tu número de pedido y cédula. Sin necesidad de cuenta.',
  alternates: { canonical: '/pedido' },
  robots: { index: false, follow: false },
  /* SESIÓN 06: no cachear página de pedido que puede contener datos del comprador */
  other: {
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  },
};

export default function PedidoPage() {
  return (
    <div className="py-8 sm:py-12 max-w-4xl mx-auto w-full">
      {/* useSearchParams (prefill ?n=) exige boundary de Suspense en App Router. */}
      <Suspense fallback={null}>
        <PedidoLookupClient />
      </Suspense>
    </div>
  );
}
