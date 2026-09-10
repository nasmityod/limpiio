'use client';

import { useState } from 'react';
import { RefreshCw, Ban, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/definitions';

const VERIFY_CONFIRM_MSG =
  'Esto vuelve a consultar a Cashea el estado real de la inicial. Si no hay evidencia de pago, el pedido queda pendiente.';
const CANCEL_CONFIRM_MSG =
  '¿Confirmas que deseas cancelar este pedido en Cashea? Se restaurará el inventario y no se puede revertir desde aquí.';

/**
 * Fase 7 — acciones admin del bloque Cashea en `/admin/orders/[id]`
 * ("Verificar ahora" / "Cancelar en Cashea"). Solo se muestran cuando el
 * pedido tiene `casheaStatus` (viene de /api/cashea/session) y nunca para
 * pedidos ya CONFIRMED/CANCELLED — la ruta correspondiente ya lo valida.
 */
export function CasheaAdminActions({
  order,
  onUpdate,
}: {
  order: Order;
  onUpdate: (o: Order) => void;
}) {
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (!order.casheaStatus) return null;

  const isFinal = order.casheaStatus === 'CONFIRMED' || order.casheaStatus === 'CANCELLED';

  const handleVerify = async () => {
    if (typeof window !== 'undefined' && !window.confirm(VERIFY_CONFIRM_MSG)) return;
    setVerifying(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/cashea-verify`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'No se pudo verificar el pedido.');
      }
      onUpdate((data as { order: Order }).order);
      const outcome = (data as { outcome?: string }).outcome;
      toast({
        title: outcome === 'confirmed' ? 'Inicial confirmada' : 'Verificación ejecutada',
        description:
          outcome === 'confirmed'
            ? 'Cashea confirmó la inicial; el pedido pasó a «En Proceso».'
            : 'Aún no hay evidencia de pago en Cashea; el pedido sigue pendiente.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo verificar',
        description: err instanceof Error ? err.message : 'Error inesperado.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = async () => {
    if (typeof window !== 'undefined' && !window.confirm(CANCEL_CONFIRM_MSG)) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/cashea/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? 'No se pudo cancelar el pedido en Cashea.');
      }
      const refreshed = await fetch(`/api/orders/${order.id}`);
      if (refreshed.ok) {
        onUpdate(await refreshed.json());
      }
      toast({ title: 'Pedido cancelado', description: 'La orden fue cancelada en Cashea y el inventario se restauró.' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cancelar',
        description: err instanceof Error ? err.message : 'Error inesperado.',
      });
    } finally {
      setCancelling(false);
    }
  };

  if (isFinal) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={verifying || cancelling}
        onClick={handleVerify}
        className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy/20 bg-navy px-3 sm:px-4 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-navy-700 active:bg-navy-800 disabled:opacity-60"
      >
        {verifying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        Verificar ahora
      </button>
      <button
        type="button"
        disabled={verifying || cancelling}
        onClick={handleCancel}
        className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 sm:px-4 text-xs sm:text-sm font-semibold text-rose-600 hover:bg-rose-50 active:bg-rose-100 disabled:opacity-60"
      >
        {cancelling ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
        Cancelar en Cashea
      </button>
    </div>
  );
}
