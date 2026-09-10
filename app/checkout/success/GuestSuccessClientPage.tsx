'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Check, ArrowRight, Package, Mail, Home, MessageCircle } from 'lucide-react';
import { useReducedMotion, reducedTransition } from '@/lib/motion';
import { MUNDOTECH_SOCIAL } from '@/lib/mundotech-social';
import type { GuestOrderConfirmation } from '@/lib/definitions';
import { GuestOrderItem } from '@/lib/definitions';
import { DualOrderMoney } from '@/components/order/DualOrderMoney';
import GuestAccountCard from './GuestAccountCard';
import { shippingChargeLabel } from '@/lib/shipping-charge';

interface Props {
  order: GuestOrderConfirmation;
  guestToken: string;
}

const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function GuestSuccessClientPage({ order, guestToken }: Props) {
  const prefersReduced = useReducedMotion();
  const subtotal = order.subtotalBeforeDiscount ?? order.items.reduce((acc: number, item: GuestOrderItem) => acc + item.price * item.quantity, 0);
  const orderNumberPadded = String(order.orderNumber).padStart(4, '0');

  return (
    <div className="py-10 sm:py-14 max-w-3xl mx-auto" data-noindex="true">
      <meta name="robots" content="noindex, nofollow" />
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
            Tu pedido ha sido confirmado y se está procesando.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-5 inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-full">
            <Package size={14} className="text-navy/60" />
            <span className="text-xs text-slate-500">Pedido</span>
            <span className="font-mono text-sm font-semibold text-navy">
              #{orderNumberPadded}
            </span>
          </motion.div>
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
            {order.items.map((item: GuestOrderItem, idx: number) => (
              <li key={idx} className="flex items-center gap-3 px-5 py-3">
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
            <div className="flex justify-between text-slate-500">
              <span>Envío</span>
              <span className="text-emerald-700 font-medium text-right">
                {shippingChargeLabel(
                  order.storePickup
                    ? 'STORE_PICKUP'
                    : order.freeShipping
                      ? 'FREE'
                      : 'DESTINATION_CHARGE',
                )}
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2.5 mt-1.5 flex items-end justify-between gap-3">
              <span className="text-base font-semibold text-navy">Total</span>
              <DualOrderMoney amount={order.total} order={order} emphasis="total" />
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <GuestAccountCard guestToken={guestToken} />
        </motion.div>

        {/* WhatsApp CTA */}
        <motion.a
          variants={fadeUp}
          href={`${MUNDOTECH_SOCIAL.whatsapp}?text=${encodeURIComponent(
            `Hola MundoTech 👋 Acabo de hacer el pedido #${orderNumberPadded}. Quiero recibir las actualizaciones de mi pedido por WhatsApp.`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold text-sm sm:text-base h-14 rounded-2xl shadow-soft hover:brightness-95 active:scale-[0.98] transition-all"
        >
          <MessageCircle size={18} />
          Recibir actualizaciones por WhatsApp
        </motion.a>

        {/* Próximos pasos */}
        <motion.div
          variants={fadeUp}
          className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {[
            { icon: Mail,    title: 'Pago en revisión',     sub: 'Verificaremos tu comprobante pronto' },
            { icon: Package, title: 'Preparando tu pedido', sub: 'Te avisaremos cuando esté listo'     },
            { icon: Home,    title: 'Rastrea tu pedido',    sub: `Usa #${orderNumberPadded} + tu cédula en mundotechve.com/pedido` },
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

        {/* CTAs */}
        <motion.div variants={fadeUp} className="mt-7 flex flex-col sm:flex-row gap-3">
          <Link
            href={`/pedido?n=${order.orderNumber}`}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-navy text-white font-bold text-sm h-12 rounded-2xl hover:bg-navy-700 shadow-soft hover:shadow-card transition-all"
          >
            Seguir mi pedido <ArrowRight size={15} />
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
