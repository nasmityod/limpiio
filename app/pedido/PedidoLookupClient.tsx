'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PackageSearch, Loader2, Search } from 'lucide-react';
import { lookupPublicOrderAction } from '@/app/actions/orderLookupActions';
import type { PublicOrderLookup } from '@/lib/definitions';
import OrderDetailClient from '@/components/account/OrderDetailClient';

/**
 * FASE 4.2: formulario número de pedido + cédula → vista read-only del pedido
 * (reutiliza OrderDetailClient, la misma de "Mis pedidos"). Anti-enumeración
 * y rate limit viven en el server action.
 */
export default function PedidoLookupClient() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(searchParams.get('n') ?? '');
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrderLookup | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await lookupPublicOrderAction(orderNumber, idNumber);
      if (result.success) {
        setOrder(result.order);
      } else {
        setOrder(null);
        setError(result.message);
      }
    } catch (err) {
      console.error('[PedidoLookup]', err);
      setError('Sin conexión con la tienda. Revisa tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (order) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setOrder(null); setError(null); }}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-2 text-xs font-semibold text-slate-500 hover:text-navy transition-colors"
        >
          ← Consultar otro pedido
        </button>
        <OrderDetailClient order={order} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-soft p-6 sm:p-8">
        <div className="text-center mb-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-yellowSft text-navy">
            <PackageSearch size={26} />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-navy tracking-tight">¿Dónde está mi pedido?</h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Ingresa tu número de pedido y la cédula que usaste al comprar.
            No necesitas cuenta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="lookup-order" className="block text-sm font-semibold text-navy mb-1.5">
              Número de pedido
            </label>
            <input
              id="lookup-order"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Ej: 0042"
              required
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-navy placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-navy/40 focus:shadow-ring-navy"
            />
            <p className="mt-1 text-[11px] text-slate-400">Está en tu correo de confirmación (ej. #0042).</p>
          </div>

          <div>
            <label htmlFor="lookup-id" className="block text-sm font-semibold text-navy mb-1.5">
              Cédula de identidad
            </label>
            <input
              id="lookup-id"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="V-12345678"
              required
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-base text-navy placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-navy/40 focus:shadow-ring-navy"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[52px] rounded-2xl border border-brand-yellowDk bg-brand-yellow text-sm font-black text-navy hover:bg-[#FFE03A] active:scale-[0.99] disabled:opacity-60 shadow-soft transition-all"
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
            Consultar mi pedido
          </button>
        </form>
      </div>
    </div>
  );
}
