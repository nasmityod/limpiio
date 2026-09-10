'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ShieldCheck, Lock } from 'lucide-react';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

import CheckoutStepper from '@/app/components/checkout/CheckoutStepper';
import ShippingForm, { type ShippingFormData } from '@/app/components/checkout/ShippingForm';
import PaymentForm, { type PaymentFormData } from '@/app/components/checkout/PaymentForm';
import ReviewStep from '@/app/components/checkout/ReviewStep';
import { useCart } from '@/context/CartContext';
import { useExchangeRate } from '@/context/ExchangeRateContext';
import { formatCurrency } from '@/lib/utils';
import type { StoreSettings } from '@/lib/data-store';
import type { ShippingEstimates } from '@/lib/shipping-estimates';
import type { CheckoutPaymentMethodDto } from '@/lib/payment-methods';
import { saveCartSnapshotAction } from '@/app/actions/abandonedCartActions';
import type { AbandonedCartItem } from '@/lib/definitions';
import { track, toGa4Item, ga4ItemsValue, GA4_CURRENCY } from '@/lib/ga4';

interface CheckoutFlowProps {
  pagoMovil: StoreSettings['pagoMovil'];
  transferencia: StoreSettings['transferencia'];
  /** PRD-067: teléfono de soporte desde readSettings() (R1) — sin hardcode. */
  supportPhone?: string;
  /** PRD-027/130: Binance Pay ID desde readSettings(). Vacío = método oculto. */
  binancePayId?: string;
  /** PRD-027/130: URL del QR de Binance desde readSettings(). */
  binanceQrUrl?: string;
  /** Pago Móvil con los 3 datos completos (readSettings → isPagoMovilConfigured). */
  pagoMovilConfigured?: boolean;
  /** Transferencia con los 4 datos completos (readSettings → isTransferenciaConfigured). */
  transferenciaConfigured?: boolean;
  /** MEJORA 2.3: estimados de envío (Admin → Configuración) — R1, sin hardcode. */
  shippingEstimates?: ShippingEstimates;
  /** Modo WhatsApp: si es true, el checkout recopila datos mínimos y redirige a WhatsApp. */
  whatsappMode?: boolean;
  /** Número de WhatsApp para pedidos (desde readSettings). */
  whatsappOrderPhone?: string;
  /** Nombre de la tienda para el mensaje de WhatsApp. */
  storeName?: string;
  checkoutPaymentMethods: CheckoutPaymentMethodDto[];
}

const CheckoutFlow = ({ pagoMovil, transferencia, supportPhone, binancePayId, binanceQrUrl, pagoMovilConfigured = false, transferenciaConfigured = false, shippingEstimates, whatsappMode = false, whatsappOrderPhone = '', storeName = 'MundoTech', checkoutPaymentMethods }: CheckoutFlowProps) => {
  const prefersReduced = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection]     = useState<1 | -1>(1);
  const [shippingData, setShippingData] = useState<ShippingFormData | null>(null);
  const [paymentData, setPaymentData]   = useState<PaymentFormData  | null>(null);
  // Fase 6: mientras haya una sesión Cashea activa (pedido + reserva ya en
  // BD, botón del SDK montado), no se permite volver a pasos anteriores —
  // evitaría reconstruir el pedido/pago sobre un pedido ya creado.
  const [casheaSessionActive, setCasheaSessionActive] = useState(false);

  // Object URL de la captura del comprobante: PaymentForm la crea con
  // URL.createObjectURL y la mantiene viva mientras el usuario navega entre
  // pasos (ReviewStep la muestra al volver). CheckoutFlow es el único dueño
  // del ciclo de vida real: guarda la URL vigente en un ref y la revoca al
  // desmontar el flujo o justo antes de salir tras un pedido exitoso.
  const proofPreviewUrlRef = useRef('');
  useEffect(() => {
    proofPreviewUrlRef.current = paymentData?.proofPreviewUrl ?? '';
  }, [paymentData?.proofPreviewUrl]);

  useEffect(() => {
    return () => {
      if (proofPreviewUrlRef.current) {
        URL.revokeObjectURL(proofPreviewUrlRef.current);
        proofPreviewUrlRef.current = '';
      }
    };
  }, []);

  const handleOrderSuccess = () => {
    if (proofPreviewUrlRef.current) {
      URL.revokeObjectURL(proofPreviewUrlRef.current);
      proofPreviewUrlRef.current = '';
    }
  };

  const { cart, getCartTotal, isCartLoading, refreshCart } = useCart();
  const { rate: exchangeRate } = useExchangeRate();
  const { data: session } = useSession();
  const router = useRouter();
  const subtotal = getCartTotal();
  const total    = subtotal;
  const selectedPaymentMethod =
    checkoutPaymentMethods.find((m) => m.id === paymentData?.paymentMethodId) ?? null;
  const showBsEquivalent =
    exchangeRate > 0 && selectedPaymentMethod?.currencyGroup !== 'USD';

  // PRD-061: al entrar al checkout re-validamos precio/stock contra la BD
  // (el carrito invitado vive en localStorage y puede traer precios viejos).
  useEffect(() => {
    void refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FASE 4.4: begin_checkout una vez por montaje del flujo (cuando ya hay carrito).
  const beginTrackedRef = useRef(false);
  useEffect(() => {
    if (beginTrackedRef.current || isCartLoading || cart.length === 0) return;
    beginTrackedRef.current = true;
    const items = cart.map((i) => toGa4Item(i));
    track('begin_checkout', {
      currency: GA4_CURRENCY,
      value: ga4ItemsValue(items),
      items,
    });
  }, [isCartLoading, cart]);

  // Chrome Android: un gesto hacia arriba en el tope del formulario dispara
  // pull-to-refresh y pierde el estado del checkout. Contenerlo solo aquí.
  useEffect(() => {
    const prev = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = 'contain';
    return () => {
      document.documentElement.style.overscrollBehaviorY = prev;
    };
  }, []);

  // PRD-030: sin productos no hay nada que pagar — de vuelta al carrito.
  // Solo aplica en el paso inicial: tras confirmar el pedido (ReviewStep vacía
  // el carrito antes de ir a /checkout/success) este guard ya no interfiere.
  useEffect(() => {
    if (!isCartLoading && cart.length === 0 && currentStep === 0) {
      router.replace('/cart');
    }
  }, [isCartLoading, cart.length, currentStep, router]);

  const handleShippingSubmit = (data: ShippingFormData) => {
    setShippingData(data);
    setDirection(1);
    setCurrentStep(1);

    // FASE 4.4: add_shipping_info al completar el paso de envío.
    {
      const items = cart.map((i) => toGa4Item(i));
      track('add_shipping_info', {
        currency: GA4_CURRENCY,
        value: ga4ItemsValue(items),
        shipping_tier: data.shippingMethod,
        items,
      });
    }

    // Guardar snapshot de carrito abandonado (best-effort, no bloquea el flujo)
    if (data.email && cart.length > 0) {
      const items: AbandonedCartItem[] = cart.map((item) => ({
        id:       item.id,
        name:     item.name,
        slug:     item.slug ?? item.id,
        price:    item.price,
        quantity: item.quantity,
        image:    item.image ?? item.images?.[0] ?? null,
      }));
      const userId = (session?.user as { id?: string })?.id ?? null;
      saveCartSnapshotAction(data.email.trim(), userId, items, subtotal).catch(() => {});
    }
  };

  const handlePaymentSubmit = (data: PaymentFormData) => {
    setPaymentData(data);
    setDirection(1);
    setCurrentStep(2);

    // FASE 4.4: add_payment_info al completar el paso de pago.
    const items = cart.map((i) => toGa4Item(i));
    track('add_payment_info', {
      currency: GA4_CURRENCY,
      value: ga4ItemsValue(items),
      payment_type: data.paymentMethodId,
      items,
    });
  };

  const handleBack = () => {
    setDirection(-1);
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      // initialData: al volver desde un paso posterior el formulario se
      // remonta (AnimatePresence) — sin esto el usuario perdía lo escrito.
      case 0: return (
        <ShippingForm
          onFormSubmit={handleShippingSubmit}
          initialData={shippingData}
          estimates={shippingEstimates}
          whatsappMode={whatsappMode}
          productFreeShippingFlags={cart.map((item) => item.freeShipping === true)}
        />
      );
      case 1: return (
        <PaymentForm
          onPaymentSubmit={handlePaymentSubmit}
          initialData={paymentData}
          pagoMovil={pagoMovil}
          transferencia={transferencia}
          binancePayId={binancePayId}
          binanceQrUrl={binanceQrUrl}
          pagoMovilConfigured={pagoMovilConfigured}
          transferenciaConfigured={transferenciaConfigured}
          checkoutPaymentMethods={checkoutPaymentMethods}
          subtotalUsd={subtotal}
          exchangeRateUsdBs={exchangeRate}
          shippingMethod={shippingData?.shippingMethod ?? null}
          whatsappMode={whatsappMode}
        />
      );
      case 2: return (
        <ReviewStep
          shippingData={shippingData}
          paymentData={paymentData}
          checkoutPaymentMethods={checkoutPaymentMethods}
          whatsappMode={whatsappMode}
          whatsappOrderPhone={whatsappOrderPhone}
          storeName={storeName}
          onOrderSuccess={handleOrderSuccess}
          onCasheaSessionActiveChange={setCasheaSessionActive}
        />
      );
      default: return null;
    }
  };

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] lg:w-[calc(100%+4rem)] section-band-navy mb-5 sm:mb-6 rounded-none sm:rounded-2xl overflow-hidden">
        <div className="circuit-bg" aria-hidden />
        <div className="relative px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            Finalizar <span className="text-brand-yellow">compra</span>
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-white tracking-tight">Checkout seguro</h1>
        </div>
      </div>

      <nav className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-500 mb-4 sm:mb-6" aria-label="Breadcrumb">
        <Link href="/" className="text-slate-600 hover:text-navy transition-colors">Inicio</Link>
        <ChevronRight size={12} />
        <Link href="/cart" className="text-slate-600 hover:text-navy transition-colors">Carrito</Link>
        <ChevronRight size={12} />
        <span className="text-navy font-medium">Pago</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-8 items-start">

        {/* Columna principal (debajo del resumen en móvil) */}
        <div className="lg:col-span-2 space-y-5 sm:space-y-6 order-2 lg:order-1">

          {/* Stepper */}
          <div className="card-elevated p-4 sm:p-6 lg:p-8">
            <CheckoutStepper currentStep={currentStep} />
          </div>

          {/* Step content — sin overflow-hidden: un ancestro con overflow
              recortado anula position:sticky de los CTAs de cada paso en
              móvil (quedaban "muertos" al final del formulario). */}
          <div className="card-elevated p-4 sm:p-6 lg:p-8 relative min-h-[300px]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
                transition={prefersReduced ? reducedTransition : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {renderStepContent()}
              </motion.div>
            </AnimatePresence>

            {currentStep > 0 && !casheaSessionActive && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-2 -mx-2 text-sm font-semibold text-slate-500 hover:text-navy transition-colors"
                >
                  <ChevronLeft size={15} /> Volver al paso anterior
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Resumen: primero en móvil para contexto del pedido ── */}
        <aside className="lg:col-span-1 order-1 lg:order-2">
          <div className="lg:sticky lg:top-[96px] space-y-4">
            <div className="card-elevated overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-navy">Tu pedido</h2>
              </div>

              <ul className="px-5 py-4 space-y-3 max-h-[260px] overflow-y-auto scrollbar-hide">
                {isCartLoading ? (
                  <li className="text-sm text-slate-500">Cargando…</li>
                ) : cart.length === 0 ? (
                  <li className="text-sm text-slate-500">Sin productos.</li>
                ) : (
                  cart.map((item) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <div className="relative h-12 w-12 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                        <Image
                          src={item.image || item.images?.[0] || '/placeholder-product.png'}
                          alt={item.name}
                          fill
                          sizes="48px"
                          className="object-contain p-1.5"
                        />
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                          {item.quantity}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-navy line-clamp-1">{item.name}</p>
                        <p className="text-[11px] text-slate-500 nums">{formatCurrency(item.price)}</p>
                      </div>
                      <p className="text-sm font-semibold text-navy nums whitespace-nowrap">
                        {formatCurrency(item.price * item.quantity)}
                      </p>
                    </li>
                  ))
                )}
              </ul>

              <div className="px-5 py-4 bg-surface-muted border-t border-border space-y-2 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="text-navy font-medium nums">{formatCurrency(subtotal)}</span>
                </div>
                <div className="border-t border-slate-200 pt-3 mt-2 flex items-end justify-between">
                  <span className="text-base font-semibold text-navy">Total</span>
                  <span className="text-2xl font-bold text-navy nums tracking-tight">
                    {formatCurrency(total)}
                  </span>
                </div>
                {/* Equivalente en Bs solo para métodos en bolívares (no divisas). */}
                {showBsEquivalent && (
                  <p className="text-right text-[12px] text-slate-500 nums">
                    ≈ Bs. {new Intl.NumberFormat('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(total * exchangeRate)}
                  </p>
                )}
              </div>
            </div>

            {/* Trust */}
            <div className="card-elevated p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <Lock size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">Compra protegida</p>
                <p className="text-[11px] text-slate-500">Datos cifrados · No compartimos tu información.</p>
              </div>
            </div>

            {/* PRD-067: teléfono vivo desde settings — solo se muestra si existe */}
            {supportPhone ? (
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-600 text-center">
                <ShieldCheck size={11} className="text-emerald-700 flex-shrink-0" />
                ¿Dudas con tu pago? Escríbenos al {supportPhone} y te acompañamos.
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CheckoutFlow;
