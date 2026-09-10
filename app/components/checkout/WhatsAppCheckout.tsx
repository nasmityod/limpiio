'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Loader2, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useExchangeRate } from '@/context/ExchangeRateContext';
import ShippingForm, { type ShippingFormData, type ShippingFormHandle } from '@/app/components/checkout/ShippingForm';
import PaymentForm, { type PaymentFormHandle } from '@/app/components/checkout/PaymentForm';
import { formatCurrency } from '@/lib/utils';
import type { ShippingEstimates } from '@/lib/shipping-estimates';
import type { StoreSettings } from '@/lib/data-store';
import {
  buildPaymentDiscountPreview,
  type CheckoutPaymentMethodDto,
} from '@/lib/payment-methods';
import { zoomOffices, type ZoomOffice } from '@/lib/zoom-offices';
import { tealcaOffices, type TealcaOffice } from '@/lib/tealca-offices';
import { shippingChargeLabel } from '@/lib/shipping-charge';

interface WhatsAppCheckoutProps {
  pagoMovil: StoreSettings['pagoMovil'];
  transferencia: StoreSettings['transferencia'];
  supportPhone?: string;
  binancePayId?: string;
  binanceQrUrl?: string;
  /** Pago Móvil con los 3 datos completos (readSettings → isPagoMovilConfigured). */
  pagoMovilConfigured?: boolean;
  /** Transferencia con los 4 datos completos (readSettings → isTransferenciaConfigured). */
  transferenciaConfigured?: boolean;
  shippingEstimates?: ShippingEstimates;
  whatsappOrderPhone?: string;
  storeName?: string;
  checkoutPaymentMethods: CheckoutPaymentMethodDto[];
}

function buildAddress(shippingData: ShippingFormData): string {
  if (shippingData.shippingMethod === 'tienda') return 'Retiro en tienda';
  if (shippingData.shippingMethod === 'mrw') {
    if (shippingData.mrwOfficeManual?.trim()) {
      return `MRW — ${shippingData.mrwOfficeManual.trim()}`;
    }
    const name = shippingData.mrwOffice?.trim();
    const base = name ? `MRW — ${name}` : 'MRW';
    return base;
  }
  if (shippingData.shippingMethod === 'zoom') {
    if (shippingData.zoomOfficeManual?.trim()) {
      return `ZOOM — ${shippingData.zoomOfficeManual.trim()}`;
    }
    const name = shippingData.zoomOfficeName?.trim();
    const addr = shippingData.zoomOfficeAddress?.trim();
    const base = name ? `ZOOM — ${name}` : 'ZOOM';
    return addr ? `${base} (${addr})` : base;
  }
  if (shippingData.shippingMethod === 'tealca') {
    if (shippingData.tealcaOfficeManual?.trim()) {
      return `TEALCA — ${shippingData.tealcaOfficeManual.trim()}`;
    }
    const name = shippingData.tealcaOfficeName?.trim();
    const addr = shippingData.tealcaOfficeAddress?.trim();
    const base = name ? `TEALCA — ${name}` : 'TEALCA';
    return addr ? `${base} (${addr})` : base;
  }
  return 'MRW';
}

function buildCity(shippingData: ShippingFormData): string {
  if (shippingData.shippingMethod === 'mrw') {
    if (shippingData.mrwOfficeManual?.trim()) return shippingData.mrwState ?? shippingData.mrwOfficeManual.trim();
    return shippingData.mrwOffice ?? '';
  }
  if (shippingData.shippingMethod === 'zoom') {
    if (shippingData.zoomOfficeManual?.trim()) return shippingData.zoomState ?? shippingData.zoomOfficeManual.trim();
    const city = shippingData.zoomOfficeCity?.trim();
    if (city) return city;
    // Respaldo defensivo desde zoomOffices
    if (shippingData.zoomState && shippingData.zoomOfficeIndex) {
      try {
        const offices = (zoomOffices as Record<string, ZoomOffice[]>)[shippingData.zoomState];
        const office = offices?.[Number(shippingData.zoomOfficeIndex)];
        if (office?.city) return office.city;
      } catch { /* fallback */ }
    }
    return shippingData.zoomState || 'Venezuela';
  }
  if (shippingData.shippingMethod === 'tealca') {
    if (shippingData.tealcaOfficeManual?.trim()) return shippingData.tealcaState ?? shippingData.tealcaOfficeManual.trim();
    const city = shippingData.tealcaOfficeCity?.trim();
    if (city) return city;
    if (shippingData.tealcaState && shippingData.tealcaOfficeIndex) {
      try {
        const offices = (tealcaOffices as Record<string, TealcaOffice[]>)[shippingData.tealcaState];
        const office = offices?.[Number(shippingData.tealcaOfficeIndex)];
        if (office?.city) return office.city;
      } catch { /* fallback */ }
    }
    return shippingData.tealcaState || 'Venezuela';
  }
  return 'Barquisimeto';
}

function buildState(shippingData: ShippingFormData): string {
  if (shippingData.shippingMethod === 'mrw') return shippingData.mrwState ?? '';
  if (shippingData.shippingMethod === 'zoom') {
    if (shippingData.zoomOfficeManual?.trim()) return shippingData.zoomState ?? 'Lara';
    if (shippingData.zoomState) return shippingData.zoomState;
    if (shippingData.zoomOfficeIndex) {
      try {
        const stateKey = Object.keys(zoomOffices).find((s) =>
          (zoomOffices as Record<string, ZoomOffice[]>)[s].some(
            (o: { name: string; address: string; city: string }) =>
              o.name === shippingData.zoomOfficeName ||
              o.city === shippingData.zoomOfficeCity,
          ),
        );
        if (stateKey) return stateKey;
      } catch { /* fallback */ }
    }
    return 'Lara';
  }
  if (shippingData.shippingMethod === 'tealca') {
    if (shippingData.tealcaOfficeManual?.trim()) return shippingData.tealcaState ?? 'Lara';
    if (shippingData.tealcaState) return shippingData.tealcaState;
    if (shippingData.tealcaOfficeIndex) {
      try {
        const stateKey = Object.keys(tealcaOffices).find((s) =>
          (tealcaOffices as Record<string, TealcaOffice[]>)[s].some(
            (o: TealcaOffice) =>
              o.name === shippingData.tealcaOfficeName ||
              o.city === shippingData.tealcaOfficeCity,
          ),
        );
        if (stateKey) return stateKey;
      } catch { /* fallback */ }
    }
    return 'Lara';
  }
  return 'Lara';
}

function getShippingMethodLabel(shippingData: ShippingFormData): string {
  if (shippingData.shippingMethod === 'tienda') return 'Retiro en tienda';
  if (shippingData.shippingMethod === 'mrw') return 'MRW';
  if (shippingData.shippingMethod === 'zoom') return 'ZOOM';
  if (shippingData.shippingMethod === 'tealca') return 'TEALCA';
  return 'No especificado';
}

const WhatsAppCheckout = ({
  pagoMovil,
  transferencia,
  supportPhone,
  binancePayId,
  binanceQrUrl,
  pagoMovilConfigured = false,
  transferenciaConfigured = false,
  shippingEstimates,
  whatsappOrderPhone = '',
  storeName = 'MundoTech',
  checkoutPaymentMethods,
}: WhatsAppCheckoutProps) => {
  const { data: session } = useSession();
  const { cart, clearCart, isCartLoading, refreshCart } = useCart();
  const { rate: exchangeRate } = useExchangeRate();
  const router = useRouter();

  const shippingRef = useRef<ShippingFormHandle>(null);
  const paymentRef = useRef<PaymentFormHandle>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<CheckoutPaymentMethodDto | null>(null);
  // RUN-05: guard síncrono de reentrada
  const submittingRef = useRef(false);
  // RUN-05b: evita race condition entre clearCart() y el async import que sigue
  const orderPlacedRef = useRef(false);

  const previewDiscountPercent =
    selectedPaymentMethod?.discountEnabled === true &&
    selectedPaymentMethod.discountPercent > 0
      ? selectedPaymentMethod.discountPercent
      : 0;

  const preview = useMemo(
    () =>
      buildPaymentDiscountPreview(
        cart.map((item) => ({
          key: item.id,
          unitPriceUsd: item.price,
          quantity: item.quantity,
        })),
        previewDiscountPercent,
      ),
    [cart, previewDiscountPercent],
  );

  const previewByKey = useMemo(() => {
    const map = new Map(preview.lines.map((line) => [line.key, line]));
    return map;
  }, [preview.lines]);

  const subtotal = preview.subtotalCents / 100;
  const estimatedPaymentDiscount = preview.discountCents / 100;
  const total = preview.totalCents / 100;
  const hasPaymentDiscount = preview.discountCents > 0;

  // Al montar: refrescar carrito; si queda vacío, redirigir
  useEffect(() => {
    void refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCartLoading && cart.length === 0 && !completed && !orderPlacedRef.current) {
      router.replace('/cart');
    }
  }, [isCartLoading, cart.length, completed, router]);

  // Scroll al tope al mostrar la pantalla de éxito
  useEffect(() => {
    if (completed && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [completed]);

  const handleRealizarCompra = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsProcessing(true);
    setError(null);

    try {
      // 1. Obtener datos de envío
      const shipping = await shippingRef.current?.submit();
      if (!shipping) {
        submittingRef.current = false;
        setIsProcessing(false);
        // Hacer scroll al formulario de envío para que el usuario vea los errores
        const shippingEl = document.getElementById('whatsapp-shipping-form');
        if (shippingEl) {
          shippingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // 2. Obtener datos de pago
      const payment = paymentRef.current?.submit();
      if (!payment) {
        submittingRef.current = false;
        setIsProcessing(false);
        return;
      }

      // 3. Construir payload del pedido (misma lógica que ReviewStep.handleConfirmOrder en modo WhatsApp)
      const orderPayload = {
        customerId: session?.user?.id || 'guest',
        customerName: `${shipping.firstName} ${shipping.lastName}`,
        customerEmail: shipping.email?.trim() || session?.user?.email?.trim() || null,
        customerPhone: shipping.phoneNumber,
        customerIdNumber: shipping.idNumber,
        shippingMethod: shipping.shippingMethod,
        shippingDetails: {
          address: buildAddress(shipping),
          city: buildCity(shipping),
          state: buildState(shipping),
          zipCode: 'N/A',
          country: 'Venezuela',
        },
        paymentMethodId: payment.paymentMethodId,
        paymentCurrency: payment.paymentCurrency,
        paymentBank: payment.bank || null,
        paymentHolderIdNumber: null,
        paymentHolderPhone: null,
        paymentReference: null,
        couponCode: null,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          imageUrl: item.image || item.images?.[0] || '',
        })),
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const body = (await response.json().catch(() => ({}))) as {
        id?: string;
        orderNumber?: number;
        guestToken?: string;
        message?: string;
        error?: string;
        total?: number;
        exchangeRateUsdBs?: number | null;
        paymentMethod?: string;
        paymentCurrency?: string | null;
        paymentDiscount?: number | null;
        paymentDiscountPercent?: number | null;
        freeShipping?: boolean;
      };

      if (!response.ok) {
        if (response.status === 401) {
          setError('Tu sesión expiró mientras completabas el pedido. Inicia sesión de nuevo.');
          submittingRef.current = false;
          setIsProcessing(false);
          return;
        }
        const apiMsg = body.message ?? body.error ?? 'Error al crear el pedido.';
        console.error('[whatsapp-checkout] API error:', response.status, body);
        throw new Error(apiMsg);
      }

      // pedido creado con éxito → bloquear el redirect al carrito
      orderPlacedRef.current = true;
      clearCart();

      if (!whatsappOrderPhone) {
        // Sin número configurado: redirigir a success. El acceso guest solo
        // funciona con ?token= (guestAccessTokenHash); ?orderId= sin sesión
        // siempre rechaza (ver app/checkout/success/page.tsx).
        if (body.guestToken) {
          router.push(`/checkout/success?token=${encodeURIComponent(body.guestToken)}`);
        } else if (body.id) {
          router.push(`/checkout/success?orderId=${encodeURIComponent(body.id)}`);
        } else {
          throw new Error('El pedido se creó sin identificador de confirmación.');
        }
        return;
      }

      // Construir mensaje de WhatsApp
      const { buildWhatsAppOrderUrl } = await import('@/lib/whatsapp-order');
      const orderRef = String(body.orderNumber ?? body.id).padStart(4, '0');
      const waShippingText =
        shipping.shippingMethod === 'mrw'
          ? `${buildAddress(shipping)}${shipping.mrwState ? `, ${shipping.mrwState}` : ''}`.trim()
          : shipping.shippingMethod === 'zoom'
            ? `${buildAddress(shipping)}, ${buildCity(shipping)}, ${buildState(shipping)}`.replace(/,\s*,/g, ',').trim()
            : buildAddress(shipping);
      const serverRate = body.exchangeRateUsdBs && body.exchangeRateUsdBs > 0
        ? body.exchangeRateUsdBs
        : exchangeRate;
      const serverTotalUsd = body.total != null && serverRate > 0
        ? body.total / serverRate
        : total;
      const serverPaymentDiscountUsd =
        body.paymentDiscount != null && body.paymentDiscount > 0 && serverRate > 0
          ? body.paymentDiscount / serverRate
          : undefined;
      // Snapshot AUTORITATIVO del pedido ya creado (nunca el cálculo preliminar del cliente).
      const isStorePickupOrder = shipping.shippingMethod === 'tienda';
      const shippingChargeTextFinal = shippingChargeLabel(
        isStorePickupOrder ? 'STORE_PICKUP' : body.freeShipping ? 'FREE' : 'DESTINATION_CHARGE',
      );
      const waInput = {
        orderRef,
        customerName: `${shipping.firstName} ${shipping.lastName}`,
        idNumber: shipping.idNumber,
        phone: shipping.phoneNumber,
        address: waShippingText,
        shippingCompany: getShippingMethodLabel(shipping),
        paymentMethod: body.paymentMethod ?? 'Pago',
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          priceUsd: item.price,
        })),
        totalUsd: serverTotalUsd,
        rate: serverRate,
        paymentDiscountUsd: serverPaymentDiscountUsd,
        paymentDiscountPercent: body.paymentDiscountPercent ?? undefined,
        paymentCurrency: body.paymentCurrency ?? payment.paymentCurrency,
        shippingChargeText: shippingChargeTextFinal,
        isStorePickup: isStorePickupOrder,
      };
      const url = buildWhatsAppOrderUrl(whatsappOrderPhone, waInput);
      setWaUrl(url);
      setCompleted(true);

      // Auto-redirect a WhatsApp después de 1.5s
      setTimeout(() => {
        window.location.href = url;
      }, 1500);
    } catch (err) {
      console.error('[whatsapp-checkout] handleRealizarCompra:', err);
      if (err instanceof TypeError) {
        setError('Sin conexión con la tienda. Revisa tu internet e intenta de nuevo.');
      } else {
        setError(err instanceof Error ? err.message : 'Hubo un problema. Por favor, inténtalo de nuevo.');
      }
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  // Pantalla de éxito
  if (completed) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-16">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-5">
          <CheckCircle2 size={36} />
        </div>
        <h2 className="text-2xl font-bold text-navy mb-2">¡Pedido completado!</h2>
        <p className="text-slate-500 max-w-md mb-6">
          Te estamos redirigiendo a WhatsApp para coordinar tu pago…
        </p>
        <Loader2 size={24} className="animate-spin text-navy mb-6" />
        {waUrl && (
          <a
            href={waUrl}
            className="inline-flex items-center gap-2 bg-green-500 text-white font-semibold text-sm min-h-[52px] px-8 rounded-2xl hover:bg-green-600 active:scale-[0.98] shadow-soft hover:shadow-card transition-all"
          >
            Abrir WhatsApp
          </a>
        )}
        <p className="text-xs text-slate-400 mt-4 max-w-sm">
          Si no se abre automáticamente, haz clic en el botón de arriba para escribirnos.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-10 sm:pb-12 w-full max-w-full">
      {/* Encabezado */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] lg:w-[calc(100%+4rem)] section-band-navy mb-5 sm:mb-6 rounded-none sm:rounded-2xl overflow-hidden">
        <div className="circuit-bg" aria-hidden />
        <div className="relative px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/70">
            Finalizar <span className="text-brand-yellow">compra</span>
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-white tracking-tight">
            {storeName} — Pedido por WhatsApp
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-8 items-start">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-5 sm:space-y-6 order-2 lg:order-1">
          <div className="card-elevated p-4 sm:p-6 lg:p-8">
            <h2 className="text-xl font-semibold text-navy tracking-tight mb-6">Finalizar compra</h2>

            {/* Sección de envío */}
            <div id="whatsapp-shipping-form">
              <ShippingForm
                embedded
                ref={shippingRef}
                whatsappMode
                onFormSubmit={() => {}}
                initialData={null}
                estimates={shippingEstimates}
                productFreeShippingFlags={cart.map((item) => item.freeShipping === true)}
              />
            </div>

            {/* Separador */}
            <div className="border-t border-slate-200 my-8" />

            {/* Sección de pago */}
            <PaymentForm
              embedded
              ref={paymentRef}
              whatsappMode
              onPaymentSubmit={() => {}}
              onSelectedMethodChange={setSelectedPaymentMethod}
              pagoMovil={pagoMovil}
              transferencia={transferencia}
              binancePayId={binancePayId}
              binanceQrUrl={binanceQrUrl}
              pagoMovilConfigured={pagoMovilConfigured}
              transferenciaConfigured={transferenciaConfigured}
              checkoutPaymentMethods={checkoutPaymentMethods}
              subtotalUsd={subtotal}
              exchangeRateUsdBs={exchangeRate}
            />

            {/* Separador */}
            <div className="border-t border-slate-200 my-8" />

            {/* Botón principal */}
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 mb-4">
                <p className="text-rose-700 text-sm">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleRealizarCompra}
              disabled={isProcessing || cart.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 bg-brand-yellow text-navy font-bold text-base min-h-[56px] rounded-2xl hover:bg-[#FFE03A] active:scale-[0.98] shadow-soft hover:shadow-card transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Enviando pedido…
                </>
              ) : (
                'Realizar compra'
              )}
            </button>
          </div>
        </div>

        {/* ── Resumen del pedido ── */}
        <aside className="lg:col-span-1 order-1 lg:order-2">
          <div className="lg:sticky lg:top-[96px] space-y-4">
            <div className="card-elevated">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-navy">Tu pedido</h2>
              </div>

              <ul className="px-5 pt-5 pb-4 space-y-3 max-h-[280px] overflow-y-auto overflow-x-visible scrollbar-hide">
                {isCartLoading ? (
                  <li className="text-sm text-slate-500">Cargando…</li>
                ) : cart.length === 0 ? (
                  <li className="text-sm text-slate-500">Sin productos.</li>
                ) : (
                  cart.map((item) => {
                    const previewLine = previewByKey.get(item.id);
                    const lineOriginal = item.price * item.quantity;
                    const discountedUnitPrice =
                      hasPaymentDiscount
                        ? item.price * (1 - previewDiscountPercent / 100)
                        : item.price;
                    const lineFinal =
                      hasPaymentDiscount && previewLine
                        ? previewLine.finalCents / 100
                        : lineOriginal;

                    return (
                      <li key={item.id} className="flex items-center gap-3">
                        <div className="relative h-12 w-12 flex-shrink-0 overflow-visible">
                          <div className="relative h-12 w-12 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                            <Image
                              src={item.image || item.images?.[0] || '/placeholder-product.png'}
                              alt={item.name}
                              fill
                              sizes="48px"
                              className="object-contain p-1.5"
                            />
                          </div>
                          <span className="absolute z-10 -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-navy text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                            {item.quantity}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-navy line-clamp-1">{item.name}</p>
                          {hasPaymentDiscount ? (
                            <p
                              className="text-[11px] nums flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
                              aria-label={`Precio unitario original ${formatCurrency(item.price)}; precio con descuento ${formatCurrency(discountedUnitPrice)} c/u`}
                            >
                              <span className="text-slate-400 line-through">
                                {formatCurrency(item.price)}
                              </span>
                              <span className="text-emerald-600 font-medium">
                                {formatCurrency(discountedUnitPrice)} c/u
                              </span>
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-500 nums">
                              {formatCurrency(item.price)}
                            </p>
                          )}
                        </div>
                        {hasPaymentDiscount ? (
                          <div
                            className="text-right whitespace-nowrap"
                            aria-label={`Precio original ${formatCurrency(lineOriginal)}; precio con descuento ${formatCurrency(lineFinal)}`}
                          >
                            <p className="text-[11px] text-slate-400 line-through nums">
                              {formatCurrency(lineOriginal)}
                            </p>
                            <p className="text-sm font-semibold text-emerald-600 nums">
                              {formatCurrency(lineFinal)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-navy nums whitespace-nowrap">
                            {formatCurrency(lineOriginal)}
                          </p>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="px-5 py-4 bg-surface-muted border-t border-border space-y-2 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="text-navy font-medium nums">{formatCurrency(subtotal)}</span>
                </div>
                {hasPaymentDiscount && selectedPaymentMethod && (
                  <div className="flex justify-between text-emerald-600">
                    <span>
                      Descuento por pago en divisas ({selectedPaymentMethod.discountPercent}%)
                    </span>
                    <span className="font-medium nums">
                      −{formatCurrency(estimatedPaymentDiscount)}
                    </span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-3 mt-2 flex items-end justify-between">
                  <span className="text-base font-semibold text-navy">Total</span>
                  <span className="text-2xl font-bold text-navy nums tracking-tight">
                    {formatCurrency(total)}
                  </span>
                </div>
                {exchangeRate > 0 && selectedPaymentMethod?.currencyGroup !== 'USD' && (
                  <p className="text-right text-[12px] text-slate-500 nums">
                    ≈ Bs. {new Intl.NumberFormat('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(total * exchangeRate)}
                  </p>
                )}
                {hasPaymentDiscount && (
                  <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                    Estimado según el método seleccionado. El monto definitivo se confirma al crear el pedido.
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

            {supportPhone ? (
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
                <ShieldCheck size={11} className="text-emerald-500 flex-shrink-0" />
                ¿Dudas con tu pago? Escríbenos al {supportPhone} y te acompañamos.
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default WhatsAppCheckout;
