'use client';

import { useTransition } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { validateOrderPayment } from '@/app/actions/orderActions';
import type { Order } from '@/lib/definitions';

const CONFIRM_MSG =
  '¿Estás seguro de que deseas marcar este pedido como pagado? Esto notificará al cliente.';

export function ValidatePaymentAdminButton({
  order,
  onValidated,
}: {
  order: Order;
  onValidated: (o: Order) => void;
}) {
  const [pending, startTransition] = useTransition();

  if (order.status !== 'Pendiente') return null;

  const handleValidate = () => {
    if (typeof window !== 'undefined' && !window.confirm(CONFIRM_MSG)) return;

    startTransition(async () => {
      const result = await validateOrderPayment(order.id);

      if (result.success) {
        onValidated(result.order);
        toast({ title: 'Pago validado', description: result.message });
      } else {
        toast({
          variant: 'destructive',
          title: 'No se pudo validar',
          description: result.message,
        });
      }
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleValidate}
      className="touch-manipulation select-none min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60"
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
      Validar pago
    </button>
  );
}
