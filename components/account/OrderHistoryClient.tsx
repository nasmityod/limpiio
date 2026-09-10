'use client';

import { Order, type OrderStatus } from '@/lib/definitions';
import { orderPathSegment } from '@/lib/order-ref';
import { DualOrderMoney } from '@/components/order/DualOrderMoney';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShoppingBag, ChevronRight, Package, ArrowRight, Truck, Search } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface OrderHistoryClientProps {
  orders: Order[];
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' });

// PRD-038: incluye el estado del flujo Binance; tipado contra OrderStatus (R2).
const statusConfig = {
  'Pendiente verificación Binance': { label: 'Verificando pago Binance', variant: 'warning' },
  Pendiente:    { label: 'Pendiente',  variant: 'warning' },
  'En Proceso': { label: 'En proceso', variant: 'info'    },
  Enviado:      { label: 'Enviado',    variant: 'info'    },
  Entregado:    { label: 'Entregado',  variant: 'success' },
  Cancelado:    { label: 'Cancelado',  variant: 'danger'  },
} satisfies Record<OrderStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }>;

const PROGRESS_LABELS = ['Pedido recibido', 'Pago confirmado', 'En preparación', 'En camino', 'Entregado'];

function orderStepIndex(o: Order): number {
  switch (o.status) {
    case 'Entregado':  return 4;
    case 'Enviado':    return 3;
    case 'En Proceso': return 2;
    default:           return o.paidAt ? 1 : 0;
  }
}

export default function OrderHistoryClient({ orders }: OrderHistoryClientProps) {
  const router = useRouter();
  const [guestRef, setGuestRef] = useState('');

  if (orders.length === 0) {
    return (
      <div>
        <h1 className="text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight mb-6">Mis pedidos</h1>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft px-6 py-16 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
            <ShoppingBag size={28} />
          </div>
          <h3 className="text-lg font-semibold text-navy">Aún no tienes pedidos</h3>
          <p className="text-slate-500 mt-1.5 text-sm max-w-sm mx-auto">
            Cuando hagas tu primera compra aparecerá aquí. Explora nuestro catálogo y encuentra tu próxima
            tecnología favorita.
          </p>
          <button type="button"
            onClick={() => router.push('/productos')}
            className="mt-6 inline-flex items-center gap-2 bg-navy text-white text-sm font-semibold px-5 h-11 rounded-xl hover:bg-navy-700 shadow-soft hover:shadow-card transition-all"
          >
            Explorar productos <ArrowRight size={15} />
          </button>
        </div>

        {/* PRD-092: pedidos realizados como invitado no aparecen en el historial
            de cuenta. El cliente puede consultarlos directamente por número. */}
        <div className="mt-5 bg-slate-50 rounded-2xl border border-slate-200/60 px-6 py-5">
          <p className="text-sm font-semibold text-navy mb-1 flex items-center gap-2">
            <Search size={15} className="text-slate-400" />
            ¿Compraste como invitado?
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Los pedidos realizados sin cuenta no aparecen aquí, pero puedes
            consultarlos con tu número de pedido (lo recibiste por correo).
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ref = guestRef.trim();
              if (!ref) return;
              router.push(`/account/orders/${encodeURIComponent(ref)}`);
            }}
            className="flex gap-2 max-w-sm"
          >
            <input
              type="text"
              value={guestRef}
              onChange={(e) => setGuestRef(e.target.value)}
              placeholder="Ej: 0042 o número completo"
              aria-label="Número de pedido"
              className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 min-h-[44px] text-base text-navy placeholder-slate-400 outline-none focus:border-navy focus:ring-1 focus:ring-navy/20"
            />
            <button
              type="submit"
              disabled={!guestRef.trim()}
              className="inline-flex items-center gap-1.5 bg-navy text-white text-xs font-bold px-4 rounded-xl min-h-[44px] hover:bg-navy-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Buscar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">Mis pedidos</h1>
        <span className="text-sm text-slate-500">
          {orders.length} pedido{orders.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {orders.map((order) => {
          const status =
            statusConfig[order.status as keyof typeof statusConfig] ??
            { label: order.status, variant: 'neutral' as const };
          const itemCount = order.items.reduce((acc, item) => acc + item.quantity, 0);
          const previewNames = order.items.slice(0, 2).map((i) => i.productName).join(', ');
          const hasMore = order.items.length > 2;
          const stepIdx = orderStepIndex(order);

          return (
            <button
              key={order.id}
              type="button"
              onClick={() => router.push(`/account/orders/${orderPathSegment(order.orderNumber)}`)}
              className="group w-full text-left bg-white rounded-2xl border border-slate-200/80 shadow-soft p-5 hover:shadow-card hover:border-slate-300 hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Package size={18} className="text-navy" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-sm font-semibold text-navy">
                        #{String(order.orderNumber).padStart(4, '0')}
                      </p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-1.5">{formatDate(order.createdAt)}</p>
                    <p className="text-sm text-navy mt-2.5 truncate">
                      {previewNames}
                      {hasMore ? ` · y ${order.items.length - 2} más` : ''}
                    </p>
                    <p className="text-[12px] text-slate-400 mt-0.5">
                      {itemCount} artículo{itemCount !== 1 ? 's' : ''}
                    </p>
                    {order.trackingNumber && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                        <Truck size={11} /> Tracking: {order.trackingNumber}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right leading-tight">
                    <DualOrderMoney amount={order.total} order={order} emphasis="total" />
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-navy group-hover:translate-x-1 transition-all" />
                </div>
              </div>
              {order.status !== 'Cancelado' && (
                <div className="mt-4">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-navy' : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                    {PROGRESS_LABELS[stepIdx]}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
