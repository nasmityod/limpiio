'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Package, Mail, Home, MessageCircle, AlertTriangle } from 'lucide-react';
import { useReducedMotion, reducedTransition } from '@/lib/motion';
import { MUNDOTECH_SOCIAL } from '@/lib/mundotech-social';
import { CASHEA_STATUS_CUSTOMER_COPY } from '@/lib/definitions';
import type { EnrichedOrder } from './page';
import { DualOrderMoney } from '@/components/order/DualOrderMoney';
import {
  getAnalyticsConsent,
  onAnalyticsConsentChange,
  trackPurchaseOnce,
} from '@/lib/ga4';
import { trackMetaPurchaseOnce } from '@/lib/meta-pixel';
import { orderShippingChargeLabelFromSnapshot } from '@/lib/shipping-charge';

interface Props {
  order: EnrichedOrder;
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function SuccessClientPage({ order }: Props) {
  const prefersReduced = useReducedMotion();
  const isWhatsAppOrder = order.channel === 'whatsapp';
  const subtotal = ('subtotalBeforeDiscount' in order && order.subtotalBeforeDiscount != null)
    ? order.subtotalBeforeDiscount
    : order.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const [analyticsConsent, setAnalyticsConsent] = useState(getAnalyticsConsent);

  useEffect(() => onAnalyticsConsentChange(setAnalyticsConsent), []);

  // FASE 4.4: purchase con dedupe por transaction_id (recargas de la página no
  // duplican). Los montos congelados en Bs se convierten a USD con la tasa del pedido.
  // Si el consentimiento aún no está granted, no marca visto y reintenta al aceptar.
  // Meta Pixel Purchase: misma conversión para campañas de FB/IG Ads.
  useEffect(() => {
    const rate = order.exchangeRateUsdBs;
    const toUsd = (amount: number) =>
      rate && rate > 0 ? Math.round((amount / rate) * 100) / 100 : amount;
    const valueUsd = toUsd(order.total);
    const items = order.items.map((i) => ({
      item_id: i.productId,
      item_name: i.productName,
      price: toUsd(i.price),
      quantity: i.quantity,
    }));
    trackPurchaseOnce({
      transactionId: String(order.orderNumber),
      value: valueUsd,
      coupon: order.couponCode ?? null,
      items,
    });
    trackMetaPurchaseOnce({
      transactionId: String(order.orderNumber),
      value: valueUsd,
      contentIds: items.map((i) => i.item_id),
      contents: items.map((i) => ({
        id: i.item_id,
        quantity: i.quantity,
        item_price: i.price,
      })),
    });
  }, [order.orderNumber, order.exchangeRateUsdBs, order.total, order.couponCode, order.items, analyticsConsent]);

  return (
    <div className="py-10 sm:py-14 max-w-3xl mx-auto">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={
          prefersReduced
            ? { visible: { transition: { staggerChildren: 0, delayChildren: 0 } } }
            : { visible: { transition: { staggerChildren: 0.08 } } }
        }
      >
        {/* Hero éxito */}
        <motion.div
          variants={fadeUp}
          className="bg-white rounded-3xl border border-slate-200/80 shadow-soft p-8 sm:p-12 text-center"
        >
          <motion.div
            initial={prefersReduced ? { opacity: 0 } : { scale: 0, rotate: -180 }}
            animate={prefersReduced ? { opacity: 1 } : { scale: 1, rotate: 0 }}
            transition={prefersReduced ? reducedTransition : { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            className="mx-auto w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lift"
          >
            <Check size={42} strokeWidth={3} />
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-6 text-3xl sm:text-4xl font-bold text-navy tracking-tight"
          >
            ¡Gracias por tu compra!
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-3 text-[15px] text-slate-500">
            {isWhatsAppOrder
              ? '¡Recibimos tu pedido! Escríbenos por WhatsApp para coordinar el pago y el envío.'
              : 'Tu pedido ha sido confirmado y se está procesando.'}
          </motion.p>
          {(order.status === 'Pendiente' || order.status === 'Pendiente verificación Binance') && (
            <motion.div
              variants={fadeUp}
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left"
            >
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-snug">
                Importante: si el pedido permanece pendiente, se cancelará automáticamente 48 horas
                después de su creación.
              </p>
            </motion.div>
          )}
          <motion.div variants={fadeUp} className="mt-5 inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-full">
            <Package size={14} className="text-navy/60" />
            <span className="text-xs text-slate-500">Pedido</span>
            <span className="font-mono text-sm font-semibold text-navy">
              #{String(order.orderNumber).padStart(4, '0')}
            </span>
          </motion.div>
        </motion.div>

        {/*
          Banner Cashea manual (coordinar por WhatsApp) — flujo ACTUAL en
          producción hoy (CASHEA_ENABLED=false): `casheaStatus` es null porque
          el pedido no pasó por /api/cashea/session. No tocar mientras el
          flag esté apagado (Fase 7, "Prohibido... con flag off la UI actual
          no cambia").
        */}
        {order.paymentMethod === 'Cashea' && !order.casheaStatus && (
          <motion.div variants={fadeUp} className="mt-6 space-y-3">
            <motion.a
              variants={fadeUp}
              href={`${MUNDOTECH_SOCIAL.whatsapp}?text=${encodeURIComponent(
                `Hola MundoTech 👋 Quiero pagar con Cashea mi pedido #${String(order.orderNumber).padStart(4, '0')}. ¿Me ayudan a coordinar el pago?`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold text-sm sm:text-base h-14 rounded-2xl shadow-soft hover:brightness-95 active:scale-[0.98] transition-all"
            >
              <MessageCircle size={18} />
              Escríbenos por WhatsApp para coordinar tu pago Cashea
            </motion.a>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Coordinamos tu compra con Cashea por WhatsApp. Pagas la inicial en tu app Cashea
              y preparamos tu envío en cuanto confirmemos el pago.
            </p>
          </motion.div>
        )}

        {/*
          Banner Cashea AUTOMÁTICO (Fase 7, punto 1): solo aparece cuando el
          pedido tiene `casheaStatus` (viene de /api/cashea/session — flujo
          con CASHEA_ENABLED=true). Copy exacto por estado — nunca afirma
          "pagado" salvo CONFIRMED (Sección 7 del documento maestro).
        */}
        {order.paymentMethod === 'Cashea' && order.casheaStatus && (
          <motion.div variants={fadeUp} className="mt-6">
            <CasheaAutomaticStatusBanner status={order.casheaStatus} />
          </motion.div>
        )}

        {/* FASE 3 / MEJORA 1.1: WhatsApp como canal #1 — botón de arranque con
            mensaje pre-llenado para recibir actualizaciones del pedido.
            Cuando el pedido es vía WhatsApp, el copy se enfoca en coordinar el pago y envío. */}
        {order.paymentMethod !== 'Cashea' && (
          <motion.a
            variants={fadeUp}
            href={`${MUNDOTECH_SOCIAL.whatsapp}?text=${encodeURIComponent(
              isWhatsAppOrder
                ? `Hola MundoTech 👋 Acabo de hacer el pedido #${String(order.orderNumber).padStart(4, '0')}. Quiero coordinar el pago y el envío.`
                : `Hola MundoTech 👋 Acabo de hacer el pedido #${String(order.orderNumber).padStart(4, '0')}. Quiero recibir las actualizaciones de mi pedido por WhatsApp.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold text-sm sm:text-base h-14 rounded-2xl shadow-soft hover:brightness-95 active:scale-[0.98] transition-all"
          >
            <MessageCircle size={18} />
            {isWhatsAppOrder ? 'Coordinar mi pago por WhatsApp' : 'Recibir actualizaciones por WhatsApp'}
          </motion.a>
        )}

        {/* FASE 4.1: registro post-compra solo vía token guest en GuestSuccessClientPage */}

        {/* Próximos pasos — condicional según canal */}
        <motion.div
          variants={fadeUp}
          className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {[
            ...(isWhatsAppOrder
              ? [
                  { icon: MessageCircle, title: 'Coordina por WhatsApp', sub: 'Te ayudamos a completar el pago' },
                  { icon: Package,       title: 'Preparamos tu pedido',  sub: 'Lo alistamos al confirmar el pago' },
                  { icon: Home,          title: 'Te mantenemos al tanto', sub: 'Recibirás novedades por WhatsApp' },
                ]
              : [
                  { icon: Mail,    title: 'Pago en revisión',     sub: 'Verificaremos tu comprobante pronto' },
                  { icon: Package, title: 'Preparando tu pedido', sub: 'Te avisaremos cuando esté listo'     },
                  { icon: Home,    title: 'Rastrea tu pedido',    sub: 'Consulta el estado en tu cuenta'     },
                ]),
          ].map((step) => (
            <div key={step.title} className="bg-white rounded-2xl border border-slate-200/80 shadow-soft p-4 text-center">
              <div className="mx-auto w-10 h-10 rounded-xl bg-brand-yellowSft text-navy flex items-center justify-center mb-2.5">
                <step.icon size={17} />
              </div>
              <p className="text-sm font-semibold text-navy">{step.title}</p>
              <p className="text-[12px] text-slate-500 mt-1 leading-snug">{step.sub}</p>
            </div>
          ))}
        </motion.div>

        {/* Resumen */}
        <motion.div
          variants={fadeUp}
          className="mt-6 bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-navy">Resumen del pedido</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3 px-5 py-3">
                <div className="relative w-14 h-14 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                  <Image
                    src={item.imageUrl || '/placeholder.png'}
                    alt={item.productName}
                    fill
                    sizes="56px"
                    className="object-contain p-1.5"
                  />
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-medium text-navy truncate">{item.productName}</p>
                  <p className="text-[12px] text-slate-500">Cantidad: {item.quantity}</p>
                </div>
                <DualOrderMoney amount={item.price * item.quantity} order={order} />
              </li>
            ))}
          </ul>

          <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500 items-start gap-3">
              <span>Subtotal</span>
              <DualOrderMoney amount={subtotal} order={order} />
            </div>
            {'paymentDiscount' in order && order.paymentDiscount != null && order.paymentDiscount > 0 ? (
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
            {'couponDiscount' in order && order.couponDiscount != null && order.couponDiscount > 0 ? (
              <div className="flex justify-between text-emerald-600 items-start gap-3">
                <span>Cupón</span>
                <span className="inline-flex items-center">−<DualOrderMoney amount={order.couponDiscount} order={order} /></span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-500">
              <span>Envío</span>
              <span className="text-emerald-700 font-medium text-right">
                {orderShippingChargeLabelFromSnapshot(order)}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2.5 mt-1.5 flex items-end justify-between gap-3">
              <span className="text-base font-semibold text-navy">Total</span>
              <DualOrderMoney amount={order.total} order={order} emphasis="total" />
            </div>
          </div>
        </motion.div>

        {/* CTAs — invitados van al seguimiento público (no tienen cuenta) */}
        <motion.div variants={fadeUp} className="mt-7 flex flex-col sm:flex-row gap-3">
          <Link
            href={order.customerId ? '/account/orders' : `/pedido?n=${order.orderNumber}`}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-navy text-white font-bold text-sm h-12 rounded-2xl hover:bg-navy-700 shadow-soft hover:shadow-card transition-all"
          >
            {order.customerId ? 'Ver mis pedidos' : 'Seguir mi pedido'} <ArrowRight size={15} />
          </Link>
          <Link
            href="/productos"
            className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-slate-200 text-navy font-semibold text-sm h-12 rounded-2xl hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            Seguir comprando
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}

const CASHEA_BANNER_TONE_STYLES: Record<'success' | 'pending' | 'error', string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  error:   'border-rose-200 bg-rose-50 text-rose-800',
};

/** Fase 7: copy por `casheaStatus` para el flujo automático — ver CASHEA_STATUS_CUSTOMER_COPY. */
function CasheaAutomaticStatusBanner({ status }: { status: NonNullable<EnrichedOrder['casheaStatus']> }) {
  const copy = CASHEA_STATUS_CUSTOMER_COPY[status];
  return (
    <div
      role="status"
      className={`rounded-2xl border p-4 sm:p-5 text-center ${CASHEA_BANNER_TONE_STYLES[copy.tone]}`}
    >
      <p className="text-sm font-bold">{copy.title}</p>
      <p className="mt-1 text-xs leading-relaxed">{copy.description}</p>
    </div>
  );
}
