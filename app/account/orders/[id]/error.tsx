'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

/**
 * PRD-094: Error boundary para la ruta /account/orders/[id].
 * Muestra un mensaje amigable si el Server Component lanza una excepción
 * (ej: timeout BD, orden malformada) en lugar de una pantalla blanca.
 */
export default function OrderDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[OrderDetailError]', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-4">
        <AlertTriangle size={28} />
      </div>
      <h1 className="text-xl font-bold text-navy mb-2">No pudimos cargar tu pedido</h1>
      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
        Ocurrió un problema al obtener los detalles. Intenta de nuevo o vuelve a
        tu historial de pedidos.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold px-5 h-11 rounded-xl hover:bg-navy-700 shadow-soft transition-all"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 bg-slate-100 text-navy text-sm font-semibold px-5 h-11 rounded-xl hover:bg-slate-200 transition-all"
        >
          <ArrowLeft size={15} /> Mis pedidos
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-[11px] text-slate-400 font-mono">
          Referencia: {error.digest}
        </p>
      )}
    </div>
  );
}
