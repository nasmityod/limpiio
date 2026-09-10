'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Props {
  token: string;
}

export default function UnsubscribeConfirmClient({ token }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const handleConfirm = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/cart/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setStatus('done');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
        {status === 'done' ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl">
              ✓
            </div>
            <h1 className="text-lg font-semibold text-navy">Dado de baja</h1>
            <p className="text-sm text-slate-500">
              No recibirás más recordatorios de carrito abandonado de MundoTech.
            </p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 transition-colors"
            >
              Ir a la tienda
            </Link>
          </>
        ) : status === 'error' ? (
          <>
            <h1 className="text-lg font-semibold text-red-600">Algo salió mal</h1>
            <p className="text-sm text-slate-500">
              No pudimos procesar tu solicitud. El enlace puede estar expirado o ya fue usado.
            </p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 bg-slate-100 text-navy text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Volver al inicio
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-2xl">
              📧
            </div>
            <h1 className="text-lg font-semibold text-navy">¿Dejar de recibir recordatorios?</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Confirma si deseas darte de baja de los recordatorios de carrito abandonado.
              No afecta otros correos de tu pedido.
            </p>
            <button type="button"
              onClick={handleConfirm}
              disabled={status === 'loading'}
              className="w-full inline-flex items-center justify-center gap-2 bg-red-500 text-white text-sm font-semibold py-3 rounded-xl hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {status === 'loading' ? 'Procesando...' : 'Confirmar baja'}
            </button>
            <Link
              href="/"
              className="block text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              No, mantener suscripción
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
