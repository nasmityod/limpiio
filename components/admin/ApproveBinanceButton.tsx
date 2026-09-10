'use client';

import { useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/definitions';

const CONFIRM_MSG =
  '¿Confirmas que verificaste el pago en Binance? El pedido pasará directo a «En Proceso» (pago verificado) y el cliente recibirá la confirmación por correo.';

/**
 * Aprueba un pago Binance pendiente de verificación manual en UN solo paso
 * (PRD-028). Llama a POST /api/orders/[id]/approve-binance, que avanza el
 * estado a "En Proceso", sella paidAt y notifica al cliente. Solo se muestra
 * cuando el pedido está en verificación Binance.
 */
export function ApproveBinanceButton({
  order,
  onApproved,
}: {
  order: Order;
  onApproved: (o: Order) => void;
}) {
  const [pending, setPending] = useState(false);

  if (order.status !== 'Pendiente verificación Binance') return null;

  const handleApprove = async () => {
    if (typeof window !== 'undefined' && !window.confirm(CONFIRM_MSG)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/approve-binance`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? 'No se pudo aprobar el pago Binance.');
      }
      onApproved(data as Order);
      toast({
        title: 'Pago Binance verificado',
        description: 'El pedido quedó «En Proceso» y el cliente fue notificado. Ya puedes prepararlo.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo aprobar',
        description: err instanceof Error ? err.message : 'Error inesperado.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleApprove}
      className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#F0B90B]/40 bg-[#F0B90B] px-3 sm:px-4 text-xs sm:text-sm font-bold text-navy shadow-sm hover:brightness-95 active:brightness-90 disabled:opacity-60"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
      Aprobar y preparar
    </button>
  );
}
