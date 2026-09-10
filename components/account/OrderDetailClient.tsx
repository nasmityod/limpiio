'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft, Truck, MapPin, CreditCard, CheckCircle2, Package, Send, Home,
  ExternalLink, Copy, Check, Camera, Store, Building2, MessageCircle,
} from 'lucide-react';
import { EnrichedOrder } from '@/app/account/orders/[id]/page';
import type { PublicOrderLookup } from '@/lib/definitions';
import { MUNDOTECH_SOCIAL } from '@/lib/mundotech-social';
import { Badge } from '@/components/ui/Badge';
import { getOrderDualMoney, hasFrozenBsPricing } from '@/lib/order-pricing';
import { DualOrderMoney } from '@/components/order/DualOrderMoney';
import type { OrderStatus } from '@/lib/definitions';

interface OrderDetailClientProps {
  order: EnrichedOrder | PublicOrderLookup;
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('es-VE', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

// PRD-038: cubre TODOS los estados de OrderStatus (incluido el flujo Binance) —
// el tipo viene de lib/definitions.ts (R2), sin strings sueltos sin cubrir.
const statusConfig = {
  'Pendiente verificación Binance': { label: 'Verificando pago Binance', variant: 'warning' },
  Pendiente:    { label: 'Pendiente',  variant: 'warning' },
  'En Proceso': { label: 'En proceso', variant: 'info'    },
  Enviado:      { label: 'Enviado',    variant: 'info'    },
  Entregado:    { label: 'Entregado',  variant: 'success' },
  Cancelado:    { label: 'Cancelado',  variant: 'danger'  },
} satisfies Record<OrderStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'neutral' }>;

const timelineSteps = [
  { id: 'received',  label: 'Pedido recibido', icon: CheckCircle2 },
  { id: 'paid',      label: 'Pago confirmado', icon: CreditCard   },
  { id: 'preparing', label: 'En preparación',  icon: Package      },
  { id: 'shipped',   label: 'En camino',       icon: Send         },
  { id: 'delivered', label: 'Entregado',       icon: Home         },
];

// Mapea estado + paidAt al índice del paso alcanzado. 'En Proceso' implica pago
// confirmado (índice 2). Si el pago ya se validó (paidAt) pero el estado sigue
// 'Pendiente', mostramos al menos 'Pago confirmado'.
const currentTimelineStep = (o: { status: OrderStatus; paidAt?: string | null }): number => {
  switch (o.status) {
    case 'Entregado':  return 4;
    case 'Enviado':    return 3;
    case 'En Proceso': return 2;
    default:           return o.paidAt ? 1 : 0;
  }
};

export default function OrderDetailClient({ order }: OrderDetailClientProps) {
  const router = useRouter();
  const [trackingCopied, setTrackingCopied] = useState(false);
  const subtotal = order.subtotalBeforeDiscount ?? order.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const pickupAddress = order.shippingDetails.address ?? '';
  const isStorePickup = pickupAddress.startsWith('Retiro en tienda');
  const isMrwPickup = pickupAddress.startsWith('Retiro en Oficina MRW');
  const isZoomPickup = pickupAddress.startsWith('Retiro en Oficina ZOOM');
  const isTealcaPickup = pickupAddress.startsWith('Retiro en Oficina TEALCA');
  const deliveryTitle = isStorePickup
    ? 'Retiro en tienda'
    : isMrwPickup
      ? 'Retiro en oficina MRW'
      : isZoomPickup
        ? 'Retiro en oficina ZOOM'
        : isTealcaPickup
          ? 'Retiro en oficina TEALCA'
          : 'Envío';
  const DeliveryIcon = isStorePickup ? Store : isMrwPickup ? Building2 : isZoomPickup || isTealcaPickup ? Truck : Truck;
  const isCasheaPending =
    order.paymentMethod === 'Cashea' &&
    !order.paidAt &&
    order.status !== 'Cancelado';
  const casheaWhatsappHref = `${MUNDOTECH_SOCIAL.whatsapp}?text=${encodeURIComponent(
    `Hola MundoTech 👋 Quiero pagar con Cashea mi pedido #${String(order.orderNumber).padStart(4, '0')}. ¿Me ayudan a coordinar el pago?`
  )}`;
  const status =
    statusConfig[order.status as keyof typeof statusConfig] ??
    { label: order.status, variant: 'neutral' as const };
  const currentStepIdx = currentTimelineStep(order);
  const isCancelled = order.status === ('Cancelado' satisfies OrderStatus);
  const hasTracking = !!(order.trackingNumber || order.trackingCarrier || order.trackingUrl || order.trackingPhotoUrl);

  const copyTrackingNumber = async () => {
    if (!order.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(order.trackingNumber);
      setTrackingCopied(true);
      window.setTimeout(() => setTrackingCopied(false), 2000);
    } catch (err) {
      // PRD-275: sin catch mudo — el clipboard puede fallar (permisos/HTTP).
      console.error('[OrderDetailClient] No se pudo copiar el tracking:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy transition-colors mb-3"
            >
              <ArrowLeft size={13} /> Volver
            </button>
            <h1 className="text-2xl md:text-[1.75rem] font-bold text-navy tracking-tight">
              Pedido #{String(order.orderNumber).padStart(4, '0')}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">Realizado el {formatDate(order.createdAt)}</p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-3">
            <Badge variant={status.variant} size="lg">{status.label}</Badge>
          </div>
        </div>

        {/* Timeline visual */}
        {!isCancelled && (
          <div className="mt-7 pt-6 border-t border-slate-100">
            <div className="relative flex items-start justify-between">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200 -z-10" />
              <div
                className="absolute top-4 left-4 h-0.5 bg-navy -z-10 transition-all duration-700"
                style={{
                  width: `calc(${(currentStepIdx / (timelineSteps.length - 1)) * 100}% - 32px * ${currentStepIdx / (timelineSteps.length - 1)})`,
                }}
              />
              {timelineSteps.map((step, idx) => {
                const isComplete = idx < currentStepIdx;
                const isActive   = idx === currentStepIdx;
                return (
                  <div key={step.id} className="flex flex-col items-center text-center w-1/5">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isComplete || isActive
                          ? 'bg-navy text-white shadow-soft'
                          : 'bg-white border-2 border-slate-200 text-slate-300'
                      } ${isActive ? 'ring-4 ring-navy/10' : ''}`}
                    >
                      <step.icon size={15} />
                    </div>
                    <p className={`mt-2 text-[11px] font-semibold leading-tight px-0.5 ${isComplete || isActive ? 'text-navy' : 'text-slate-400'}`}>
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
            {order.status === 'Pendiente verificación Binance' && (
              <p className="mt-5 text-center text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Estamos verificando tu pago en Binance. Te avisaremos apenas se confirme.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Tracking visible al cliente cuando el admin lo registra ───────── */}
      {hasTracking && !isCancelled && (
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl border-2 border-amber-200 shadow-soft p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-11 h-11 rounded-xl bg-brand-yellow text-navy flex items-center justify-center flex-shrink-0">
              <Truck size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-navy">Tu pedido está en camino</h2>
              {order.shippedAt && (
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Enviado el {formatDate(order.shippedAt)}
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {order.trackingCarrier && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Empresa de envío</dt>
                <dd className="text-sm font-semibold text-navy mt-1">{order.trackingCarrier}</dd>
              </div>
            )}
            {order.trackingNumber && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Número de seguimiento</dt>
                <dd className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-base font-bold text-navy break-all">{order.trackingNumber}</span>
                  <button
                    type="button"
                    onClick={copyTrackingNumber}
                    aria-label="Copiar número de seguimiento"
                    className="min-h-[44px] inline-flex items-center gap-1 px-2.5 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white active:bg-slate-100"
                  >
                    {trackingCopied
                      ? <><Check size={12} className="text-green-600" /> Copiado</>
                      : <><Copy size={12} /> Copiar</>}
                  </button>
                </dd>
              </div>
            )}
            {order.trackingUrl && (
              <div className="sm:col-span-2">
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 bg-navy text-white text-sm font-bold rounded-xl active:bg-navy/80 hover:bg-navy/90 transition-colors w-full sm:w-auto"
                >
                  Rastrear envío <ExternalLink size={14} />
                </a>
              </div>
            )}
            {order.trackingPhotoUrl && (
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  <Camera size={11} /> Comprobante de envío
                </dt>
                <a href={order.trackingPhotoUrl} target="_blank" rel="noreferrer" className="block max-w-sm">
                  <Image
                    src={order.trackingPhotoUrl}
                    alt="Foto de la guía de envío"
                    width={400}
                    height={500}
                    className="w-full h-auto rounded-xl border border-slate-200 shadow-soft"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5 text-center">Toca para ver completa</p>
                </a>
              </div>
            )}
          </dl>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Productos */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-navy">Artículos ({order.items.length})</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-4 px-6 py-4">
                <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0">
                  <Image
                    src={item.imageUrl || '/placeholder-product.png'}
                    alt={item.productName}
                    fill
                    sizes="64px"
                    className="object-contain p-1.5"
                  />
                </div>
                <div className="flex-grow min-w-0">
                  <Link
                    href={`/product/${item.productSlug}`}
                    className="block text-sm font-medium text-navy hover:text-navy/80 transition-colors truncate"
                  >
                    {item.productName}
                  </Link>
                  <p className="text-[11px] text-slate-500 nums mt-0.5 leading-snug">
                    {hasFrozenBsPricing(order) ? (
                      <>
                        {getOrderDualMoney(item.price, order).bs}
                        <span className="text-slate-400"> · </span>
                        {getOrderDualMoney(item.price, order).usd}
                        <span className="text-slate-400"> c/u</span>
                        <span> × {item.quantity}</span>
                      </>
                    ) : (
                      <>
                        {getOrderDualMoney(item.price, order).usd} c/u × {item.quantity}
                      </>
                    )}
                  </p>
                </div>
                <DualOrderMoney amount={item.price * item.quantity} order={order} />
              </li>
            ))}
          </ul>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500 items-start gap-3">
              <span>Subtotal</span>
              <DualOrderMoney amount={subtotal} order={order} />
            </div>
            {order.paymentDiscount != null && order.paymentDiscount > 0 ? (
              <div className="flex justify-between text-emerald-600 items-start gap-3">
                <span>
                  Descuento por pago en divisas
                  {order.paymentDiscountPercent != null && order.paymentDiscountPercent > 0
                    ? ` (${order.paymentDiscountPercent}%)`
                    : ''}
                </span>
                <span className="inline-flex items-center">−<DualOrderMoney amount={order.paymentDiscount} order={order} /></span>
              </div>
            ) : null}
            {order.couponDiscount != null && order.couponDiscount > 0 ? (
              <div className="flex justify-between text-emerald-600 items-start gap-3">
                <span>Cupón {order.couponCode}</span>
                <span className="inline-flex items-center">−<DualOrderMoney amount={order.couponDiscount} order={order} /></span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-500">
              <span>Envío</span>
              <span className="text-emerald-600 font-medium">Gratis</span>
            </div>
            <div className="border-t border-slate-200 pt-2.5 mt-1.5 flex items-end justify-between gap-3">
              <span className="text-base font-semibold text-navy">Total</span>
              <DualOrderMoney amount={order.total} order={order} emphasis="total" />
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-3">
              <DeliveryIcon size={15} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-navy">{deliveryTitle}</h3>
            </div>
            <p className="text-sm font-semibold text-navy">{order.customerName}</p>
            <p className="text-sm text-slate-600 mt-1">{order.shippingDetails.address}</p>
            <p className="text-[13px] text-slate-500 mt-0.5 flex items-center gap-1">
              <MapPin size={12} className="text-slate-400" />
              {order.shippingDetails.city}, {order.shippingDetails.state}
              {order.shippingDetails.zipCode !== 'N/A' && ` · ${order.shippingDetails.zipCode}`}
            </p>
            <p className="text-[13px] text-slate-500">{order.shippingDetails.country}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={15} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-navy">Pago</h3>
            </div>
            <p className="text-sm text-navy font-medium">{order.paymentMethod}</p>
            {isCasheaPending && (
              <div className="mt-3 space-y-2">
                <a
                  href={casheaWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold text-sm h-11 rounded-xl shadow-soft hover:brightness-95 active:scale-[0.98] transition-all"
                >
                  <MessageCircle size={16} />
                  Coordinar pago por WhatsApp
                </a>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Escríbenos por WhatsApp para coordinar tu pago con Cashea. Preparamos tu
                  envío en cuanto confirmemos el pago.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
