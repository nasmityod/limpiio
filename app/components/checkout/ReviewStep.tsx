'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { Loader2, CheckCircle2, Store, Building2, Truck, CreditCard, Tag, X, LogIn } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useExchangeRate } from '@/context/ExchangeRateContext';
import { zoomOffices } from '@/lib/zoom-offices';
import { tealcaOffices, type TealcaOffice } from '@/lib/tealca-offices';
import { ShippingFormData } from './ShippingForm';
import { PaymentFormData } from './PaymentForm';
import { formatCurrency } from '@/lib/utils';
import {
  estimatePaymentDiscountUsd,
  type CheckoutPaymentMethodDto,
} from '@/lib/payment-methods';
import { stashLoginRedirectForPathname } from '@/lib/auth-path';
import { resolveShippingChargeType, shippingChargeLabel } from '@/lib/shipping-charge';
import CasheaCheckoutButton from '@/app/components/checkout/CasheaCheckoutButton';
// Import type-only: se erradica en build, nunca trae al cliente el módulo
// `lib/cashea.ts` (exclusivo de servidor — expone casheaPrivateFetch/la clave privada).
import type { CasheaPayload } from '@/lib/cashea';

/** Espejo cliente del master switch — nunca `lib/cashea-config.ts` (servidor). */
const CASHEA_AUTOMATIC_ENABLED = process.env.NEXT_PUBLIC_CASHEA_ENABLED === 'true';

type CasheaSession = {
  orderId: string;
  publicApiKey: string;
  payload: CasheaPayload;
  returnToken: string;
};

interface ReviewStepProps {
  shippingData: ShippingFormData | null;
  paymentData: PaymentFormData | null;
  checkoutPaymentMethods?: CheckoutPaymentMethodDto[];
  /** Modo WhatsApp: redirige a WhatsApp tras crear el pedido. */
  whatsappMode?: boolean;
  /** Número de WhatsApp configurado para pedidos. */
  whatsappOrderPhone?: string;
  /** Nombre de la tienda para el mensaje. */
  storeName?: string;
  /**
   * PRD-04: CheckoutFlow es el dueño del object URL de la captura del
   * comprobante. Se invoca justo antes de abandonar el checkout tras un
   * pedido exitoso para que revoque la URL y no filtre memoria.
   */
  onOrderSuccess?: () => void;
  /**
   * Fase 6: notifica al padre (CheckoutFlow) cuando se creó una sesión
   * Cashea (pedido + reserva ya en BD). Mientras esté activa, no debe
   * permitirse volver a los pasos anteriores del checkout.
   */
  onCasheaSessionActiveChange?: (active: boolean) => void;
}

/** Equivalente referencial en bolívares (PRD-022). El monto autoritativo en Bs lo congela el servidor con la tasa de BD. */
function formatBsApprox(amountUsd: number, rate: number): string {
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountUsd * rate)}`;
}

const ReviewStep = ({ shippingData, paymentData, checkoutPaymentMethods = [], whatsappMode = false, whatsappOrderPhone = '', onOrderSuccess, onCasheaSessionActiveChange }: ReviewStepProps) => {
  const { data: session } = useSession();
  const { cart, clearCart, getCartTotal, isCartLoading } = useCart();
  const { rate: exchangeRate } = useExchangeRate();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 401 a mitad del checkout (token expirado): mostrar CTA de re-login que
  // vuelve directo a /checkout — el carrito persiste en localStorage.
  const [sessionExpired, setSessionExpired] = useState(false);
  // PRD-049: si el pedido falla DESPUÉS de subir el comprobante, el reintento
  // reutiliza el token ya obtenido en vez de duplicar la imagen en R2.
  // SESIÓN 05 (CORREGIDO): el token de upload se guarda en memoria. Si el componente
  // se desmonta y pierde el token, debe solicitar una nueva upload session.
  const uploadedProofRef = useRef<{ file: File; uploadToken: string } | null>(null);
  // RUN-05 (AUDITORIA-2026-07): guard síncrono de reentrada — dos taps rápidos
  // en 4G disparaban dos POST antes de que React aplicara `disabled`.
  const submittingRef = useRef(false);

  // Cupón de descuento (validado contra el servidor).
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discountUsd, setDiscountUsd] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);

  // Fase 6: sesión Cashea (SDK oficial) — solo con NEXT_PUBLIC_CASHEA_ENABLED=true.
  const [casheaSession, setCasheaSession] = useState<CasheaSession | null>(null);
  const [casheaButtonError, setCasheaButtonError] = useState<string | null>(null);

  useEffect(() => {
    onCasheaSessionActiveChange?.(Boolean(casheaSession));
  }, [casheaSession, onCasheaSessionActiveChange]);

  // Al desmontar el paso (ej. el usuario abandona el checkout) se limpia el
  // estado de sesión para no dejar al padre "atascado" en active=true.
  useEffect(() => {
    return () => onCasheaSessionActiveChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = getCartTotal();
  // Vista PRELIMINAR (el servidor recalcula desde la BD al confirmar el pedido).
  const productFreeShippingFlags = cart.map((item) => item.freeShipping === true);
  const shippingChargeType = resolveShippingChargeType(
    shippingData?.shippingMethod,
    productFreeShippingFlags,
  );
  const shippingChargeText = shippingChargeLabel(shippingChargeType);
  const selectedPaymentMethod = checkoutPaymentMethods.find((m) => m.id === paymentData?.paymentMethodId) ?? null;
  // Flag apagado (hoy en producción): comportamiento EXACTO actual (coordinar
  // por WhatsApp, cupones permitidos, POST /api/orders). Flag encendido:
  // flujo automático con el SDK — cupones prohibidos con Cashea (Sección 1/7).
  const isCasheaAutomatic = CASHEA_AUTOMATIC_ENABLED && selectedPaymentMethod?.kind === 'CASHEA';

  // Cupones prohibidos con Cashea automático (Sección 1/7): si el usuario
  // aplicó un cupón con otro método y luego cambia a Cashea, se descarta.
  useEffect(() => {
    if (isCasheaAutomatic && appliedCoupon) {
      setAppliedCoupon(null);
      setDiscountUsd(0);
      setCouponInput('');
      setCouponMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCasheaAutomatic]);
  const estimatedPaymentDiscount =
    selectedPaymentMethod && selectedPaymentMethod.discountEnabled && selectedPaymentMethod.discountPercent > 0
      ? estimatePaymentDiscountUsd(subtotal, selectedPaymentMethod.discountPercent)
      : 0;
  const total = Math.max(0, subtotal - estimatedPaymentDiscount - discountUsd);

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponMessage(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        code?: string;
        discountUsd?: number;
        reason?: string;
      };
      if (data.valid && data.code) {
        setAppliedCoupon(data.code);
        setDiscountUsd(data.discountUsd ?? 0);
        setCouponMessage(null);
      } else {
        setAppliedCoupon(null);
        setDiscountUsd(0);
        setCouponMessage(data.reason ?? 'Cupón no válido.');
      }
    } catch {
      setCouponMessage('No se pudo validar el cupón. Intenta de nuevo.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscountUsd(0);
    setCouponInput('');
    setCouponMessage(null);
  };

  /** PRD-049 (CORREGIDO): obtiene token de upload, sube el comprobante con él y devuelve el token. */
  const uploadProofIfNeeded = async (): Promise<string | null> => {
    const file = paymentData?.proofFile ?? null;
    if (!file) return null;
    // Reutilizar token si ya se subió el mismo archivo
    if (uploadedProofRef.current?.file === file) {
      return uploadedProofRef.current.uploadToken;
    }

    // 1. Obtener token de upload session
    const sessionRes = await fetch('/api/checkout/upload-session', { method: 'POST' });
    const sessionData = (await sessionRes.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
    };
    if (!sessionRes.ok || !sessionData.token) {
      throw new Error(sessionData.error ?? 'No pudimos iniciar la sesión de subida. Intenta de nuevo.');
    }

    const uploadToken = sessionData.token;

    // 2. Subir el archivo con el token
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/checkout/upload-proof', {
      method: 'POST',
      headers: { 'x-checkout-upload-token': uploadToken },
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      uploaded?: boolean;
      error?: string;
    };
    if (!res.ok || !data.uploaded) {
      throw new Error(data.error ?? 'No pudimos subir el comprobante. Intenta de nuevo.');
    }

    uploadedProofRef.current = { file, uploadToken };
    return uploadToken;
  };

  const buildAddress = (): string => {
    if (shippingData?.shippingMethod === 'tienda') return 'Retiro en tienda';
    if (shippingData?.shippingMethod === 'mrw') {
      if (shippingData.mrwOfficeManual?.trim()) {
        return `MRW — ${shippingData.mrwOfficeManual.trim()}`;
      }
      const name = shippingData.mrwOffice?.trim();
      const base = name ? `MRW — ${name}` : 'MRW';
      return base;
    }
    if (shippingData?.shippingMethod === 'zoom') {
      if (shippingData.zoomOfficeManual?.trim()) {
        return `ZOOM — ${shippingData.zoomOfficeManual.trim()}`;
      }
      if (zoomOffice) {
        return `ZOOM — ${zoomOffice.name}${zoomOffice.address ? ` (${zoomOffice.address})` : ''}`;
      }
      return 'ZOOM';
    }
    if (shippingData?.shippingMethod === 'tealca') {
      if (shippingData.tealcaOfficeManual?.trim()) {
        return `TEALCA — ${shippingData.tealcaOfficeManual.trim()}`;
      }
      if (tealcaOffice) {
        return `TEALCA — ${tealcaOffice.name}${tealcaOffice.address ? ` (${tealcaOffice.address})` : ''}`;
      }
      return 'TEALCA';
    }
    return 'MRW';
  };

  const buildCity = (): string => {
    if (shippingData?.shippingMethod === 'mrw') {
      if (shippingData.mrwOfficeManual?.trim()) return shippingData.mrwState ?? shippingData.mrwOfficeManual.trim();
      return shippingData.mrwOffice ?? '';
    }
    if (shippingData?.shippingMethod === 'zoom') {
      if (shippingData.zoomOfficeManual?.trim()) return shippingData.zoomState ?? shippingData.zoomOfficeManual.trim();
      if (zoomOffice) return zoomOffice.city || zoomOffice.name;
      return shippingData.zoomState ?? 'Barquisimeto';
    }
    if (shippingData?.shippingMethod === 'tealca') {
      if (shippingData.tealcaOfficeManual?.trim()) return shippingData.tealcaState ?? shippingData.tealcaOfficeManual.trim();
      if (tealcaOffice) return tealcaOffice.city || tealcaOffice.name;
      return shippingData.tealcaState ?? 'Barquisimeto';
    }
    return 'Barquisimeto';
  };

  const buildState = (): string => {
    if (shippingData?.shippingMethod === 'mrw') return shippingData.mrwState ?? '';
    if (shippingData?.shippingMethod === 'zoom') {
      if (shippingData.zoomOfficeManual?.trim()) return shippingData.zoomState ?? 'Lara';
      if (zoomOffice) return shippingData.zoomState ?? 'Lara';
      return 'Lara';
    }
    if (shippingData?.shippingMethod === 'tealca') {
      if (shippingData.tealcaOfficeManual?.trim()) return shippingData.tealcaState ?? 'Lara';
      if (tealcaOffice) return shippingData.tealcaState ?? 'Lara';
      return 'Lara';
    }
    return 'Lara';
  };

  const getShippingMethodLabel = (): string => {
    if (shippingData?.shippingMethod === 'tienda') return 'Retiro en tienda';
    if (shippingData?.shippingMethod === 'mrw') return 'MRW';
    if (shippingData?.shippingMethod === 'zoom') return 'ZOOM';
    if (shippingData?.shippingMethod === 'tealca') return 'TEALCA';
    return 'No especificado';
  };

  /**
   * Fase 6: rama exclusiva para Cashea automático (NEXT_PUBLIC_CASHEA_ENABLED=true).
   * En vez de POST /api/orders, llama POST /api/cashea/session: el pedido
   * queda creado con inventario reservado y `casheaStatus=CREATED`, y la
   * respuesta trae el payload firmado en servidor para montar el botón del
   * SDK. NUNCA se marca el pedido como pagado aquí — la confirmación
   * autoritativa depende de `verifyCasheaOrder` (Fase 3/5, TODO tras
   * respuesta de Cashea, Sección 12).
   */
  const handleCasheaConfirm = async () => {
    if (submittingRef.current) return;
    if (!shippingData || !paymentData) {
      setError('Faltan datos de envío o pago.');
      return;
    }

    submittingRef.current = true;
    setIsProcessing(true);
    setError(null);
    setSessionExpired(false);
    setCasheaButtonError(null);

    try {
      const orderPayload = {
        customerId: session?.user?.id || 'guest',
        customerName: `${shippingData.firstName} ${shippingData.lastName}`,
        customerEmail: shippingData.email?.trim() || session?.user?.email?.trim() || null,
        customerPhone: shippingData.phoneNumber,
        customerIdNumber: shippingData.idNumber,
        shippingMethod: shippingData.shippingMethod,
        shippingDetails: {
          address: buildAddress(),
          city: buildCity(),
          state: buildState(),
          zipCode: 'N/A',
          country: 'Venezuela',
        },
        paymentMethodId: paymentData.paymentMethodId,
        // Cashea no acepta selección de moneda ni cupón (Sección 1/7).
        paymentCurrency: null,
        paymentBank: null,
        paymentHolderIdNumber: null,
        paymentHolderPhone: null,
        paymentReference: null,
        paymentUploadToken: null,
        couponCode: null,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          imageUrl: item.image || item.images?.[0] || '',
        })),
      };

      const response = await fetch('/api/cashea/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const body = (await response.json().catch(() => ({}))) as {
        orderId?: string;
        publicApiKey?: string;
        payload?: CasheaPayload;
        returnToken?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 401) {
          setSessionExpired(true);
          setError('Tu sesión expiró mientras completabas el pedido. Inicia sesión de nuevo: tu carrito y este pedido te esperan.');
          submittingRef.current = false;
          setIsProcessing(false);
          return;
        }
        const apiMsg = body.message ?? body.error ?? 'No pudimos iniciar tu sesión de Cashea.';
        console.error('[checkout] cashea/session API error:', response.status, body);
        throw new Error(apiMsg);
      }

      if (!body.orderId || !body.publicApiKey || !body.payload || !body.returnToken) {
        throw new Error('Respuesta incompleta al iniciar la sesión de Cashea.');
      }

      // El pedido ya quedó creado (con reserva de inventario) en el servidor
      // — igual que el resto de métodos, el carrito local se limpia aquí.
      clearCart();
      setCasheaSession({
        orderId: body.orderId,
        publicApiKey: body.publicApiKey,
        payload: body.payload,
        returnToken: body.returnToken,
      });
      submittingRef.current = false;
      setIsProcessing(false);
    } catch (err) {
      console.error('[checkout] handleCasheaConfirm:', err);
      if (err instanceof TypeError) {
        setError('Sin conexión con la tienda. Revisa tu internet e intenta de nuevo: no se creó ningún pedido.');
      } else {
        setError(err instanceof Error ? err.message : 'Hubo un problema. Por favor, inténtalo de nuevo.');
      }
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (submittingRef.current) return;
    if (!shippingData || !paymentData) {
      setError('Faltan datos de envío o pago.');
      return;
    }
    if (isCasheaAutomatic) {
      return handleCasheaConfirm();
    }

    submittingRef.current = true;
    setIsProcessing(true);
    setError(null);
    setSessionExpired(false);

    try {
      // WhatsApp: no subir comprobante
      const uploadToken = whatsappMode ? null : await uploadProofIfNeeded();

      // El servidor recalcula precios/total desde BD e ignora cualquier monto
      // del cliente; para retiro en tienda también resuelve la dirección desde
      // la configuración (PRD-128).
      const orderPayload = {
        customerId: session?.user?.id || 'guest',
        customerName: `${shippingData.firstName} ${shippingData.lastName}`,
        customerEmail: shippingData.email?.trim() || session?.user?.email?.trim() || null,
        customerPhone: shippingData.phoneNumber,
        customerIdNumber: shippingData.idNumber,
        shippingMethod: shippingData.shippingMethod,
        shippingDetails: {
          address: buildAddress(),
          city: buildCity(),
          state: buildState(),
          zipCode: 'N/A',
          country: 'Venezuela',
        },
        paymentMethodId: paymentData.paymentMethodId,
        paymentCurrency: paymentData.paymentCurrency,
        paymentBank: paymentData.bank || null,
        paymentHolderIdNumber: paymentData.holderIdNumber || null,
        paymentHolderPhone: paymentData.holderPhone || null,
        paymentReference: paymentData.referenceNumber || null,
        paymentUploadToken: uploadToken,
        couponCode: appliedCoupon || null,
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
        message?: string;
        error?: string;
        errors?: unknown;
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
          setSessionExpired(true);
          setError('Tu sesión expiró mientras completabas el pedido. Inicia sesión de nuevo: tu carrito y este pedido te esperan.');
          submittingRef.current = false;
          setIsProcessing(false);
          return;
        }
        // El middleware responde { error }; el route handler { message }.
        const apiMsg = body.message ?? body.error ?? 'Error al crear el pedido.';
        console.error('[checkout] API error:', response.status, body);
        throw new Error(apiMsg);
      }

      // PRD-180: el carrito abandonado se marca RECOVERED en el servidor
      // (POST /api/orders) — aquí ya no se invoca ninguna Server Action pública.
      clearCart();

      if (whatsappMode) {
        if (!whatsappOrderPhone) {
          // Sin número configurado: redirigir a success con aviso
          onOrderSuccess?.();
          router.push(`/checkout/success?orderId=${body.id}`);
          return;
        }

        // Construir mensaje y redirigir a WhatsApp
        const { buildWhatsAppOrderUrl } = await import('@/lib/whatsapp-order');
        const orderRef = String(body.orderNumber ?? body.id).padStart(4, '0');
        const waShippingText =
          shippingData.shippingMethod === 'mrw'
            ? `${buildAddress()}, ${buildState()}`.replace(/,\s*,/g, ',').trim()
            : shippingData.shippingMethod === 'zoom'
              ? `${buildAddress()}, ${buildCity()}, ${buildState()}`.replace(/,\s*,/g, ',').trim()
              : shippingData.shippingMethod === 'tealca'
                ? `${buildAddress()}, ${buildCity()}, ${buildState()}`.replace(/,\s*,/g, ',').trim()
                : buildAddress();
        const serverRate = body.exchangeRateUsdBs && body.exchangeRateUsdBs > 0
          ? body.exchangeRateUsdBs
          : exchangeRate;
        const serverTotalUsd = body.total != null && serverRate > 0
          ? body.total / serverRate
          : Math.max(0, subtotal - estimatedPaymentDiscount - discountUsd);
        const serverPaymentDiscountUsd =
          body.paymentDiscount != null && body.paymentDiscount > 0 && serverRate > 0
            ? body.paymentDiscount / serverRate
            : undefined;
        // Snapshot AUTORITATIVO del pedido ya creado (nunca el cálculo preliminar del cliente).
        const isStorePickupOrder = shippingData.shippingMethod === 'tienda';
        const shippingChargeTextFinal = shippingChargeLabel(
          isStorePickupOrder ? 'STORE_PICKUP' : body.freeShipping ? 'FREE' : 'DESTINATION_CHARGE',
        );
        const waInput = {
          orderRef,
          customerName: `${shippingData.firstName} ${shippingData.lastName}`,
          idNumber: shippingData.idNumber,
          phone: shippingData.phoneNumber,
          address: waShippingText,
          shippingCompany: getShippingMethodLabel(),
          paymentMethod: body.paymentMethod ?? selectedPaymentMethod?.name ?? 'Pago',
          items: cart.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            priceUsd: item.price,
          })),
          totalUsd: serverTotalUsd,
          rate: serverRate,
          paymentDiscountUsd: serverPaymentDiscountUsd,
          paymentDiscountPercent: body.paymentDiscountPercent ?? undefined,
          paymentCurrency: body.paymentCurrency ?? paymentData.paymentCurrency,
          shippingChargeText: shippingChargeTextFinal,
          isStorePickup: isStorePickupOrder,
        };
        const waUrl = buildWhatsAppOrderUrl(whatsappOrderPhone, waInput);
        onOrderSuccess?.();
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = waUrl;
        return;
      }

      onOrderSuccess?.();
      router.push(`/checkout/success?orderId=${body.id}`);
    } catch (err) {
      console.error('[checkout] handleConfirmOrder:', err);
      // Redes venezolanas: distinguir "sin conexión" (fetch lanza TypeError)
      // de un error del servidor — el mensaje crudo era "Failed to fetch".
      if (err instanceof TypeError) {
        setError('Sin conexión con la tienda. Revisa tu internet e intenta de nuevo: no se creó ningún pedido.');
      } else {
        setError(err instanceof Error ? err.message : 'Hubo un problema. Por favor, inténtalo de nuevo.');
      }
      submittingRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleRelogin = () => {
    stashLoginRedirectForPathname('/checkout');
    router.push('/login');
  };

  if (isCartLoading) {
    return <div className="py-8 text-center text-slate-500">Cargando información del carrito…</div>;
  }

  const zoomOffice = (() => {
    if (shippingData?.shippingMethod !== 'zoom') return null;
    // 1) resolver desde la lista viva por índice (selección manual siempre gana)
    if (
      shippingData.zoomState &&
      shippingData.zoomOfficeIndex !== undefined &&
      shippingData.zoomOfficeIndex !== ''
    ) {
      const offices = (zoomOffices as Record<string, { name: string; address: string; city: string }[]>)[shippingData.zoomState];
      const office = offices?.[Number(shippingData.zoomOfficeIndex)];
      if (office) return office;
    }
    // 2) fallback: snapshot de la dirección guardada
    if (shippingData.zoomOfficeName || shippingData.zoomOfficeAddress || shippingData.zoomOfficeCity) {
      return {
        name:    shippingData.zoomOfficeName ?? '',
        address: shippingData.zoomOfficeAddress ?? '',
        city:    shippingData.zoomOfficeCity ?? '',
      };
    }
    return null;
  })();

  const tealcaOffice = (() => {
    if (shippingData?.shippingMethod !== 'tealca') return null;
    if (
      shippingData.tealcaState &&
      shippingData.tealcaOfficeIndex !== undefined &&
      shippingData.tealcaOfficeIndex !== ''
    ) {
      const offices = (tealcaOffices as Record<string, TealcaOffice[]>)[shippingData.tealcaState];
      const office = offices?.[Number(shippingData.tealcaOfficeIndex)];
      if (office) return office;
    }
    if (shippingData.tealcaOfficeName || shippingData.tealcaOfficeAddress || shippingData.tealcaOfficeCity) {
      return {
        name:    shippingData.tealcaOfficeName ?? '',
        address: shippingData.tealcaOfficeAddress ?? '',
        city:    shippingData.tealcaOfficeCity ?? '',
      } as TealcaOffice;
    }
    return null;
  })();

  const ShippingIcon = shippingData?.shippingMethod === 'tienda' ? Store : shippingData?.shippingMethod === 'zoom' || shippingData?.shippingMethod === 'tealca' ? Truck : Building2;

  const isBankManual =
    selectedPaymentMethod?.kind === 'PAGO_MOVIL' ||
    selectedPaymentMethod?.kind === 'BANK_TRANSFER';

  const paymentLabel =
    selectedPaymentMethod?.kind === 'BINANCE'
      ? `${selectedPaymentMethod.name} (verificación manual)`
      : selectedPaymentMethod?.kind === 'CASHEA'
        ? isCasheaAutomatic
          ? `${selectedPaymentMethod.name} (pago con Cashea)`
          : `${selectedPaymentMethod.name} (coordinar por WhatsApp)`
        : (selectedPaymentMethod?.name ?? paymentData?.paymentMethodId ?? '—');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-navy tracking-tight">Revisión final</h2>
        <p className="text-sm text-slate-500 mt-1">Verifica tus datos antes de confirmar el pedido.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy">Productos ({cart.length})</h3>
          <span className="text-xs text-slate-500 nums">{formatCurrency(subtotal)}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {cart.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3">
              <div className="relative w-12 h-12 flex-shrink-0 bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                <Image
                  src={item.image || item.images?.[0] || '/placeholder.png'}
                  alt={item.name}
                  fill
                  sizes="48px"
                  className="object-contain p-1.5"
                />
              </div>
              <div className="flex-grow min-w-0">
                <p className="text-sm text-navy truncate">{item.name}</p>
                <p className="text-[12px] text-slate-500 nums">
                  {formatCurrency(item.price)} × {item.quantity}
                </p>
                <span
                  className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                    item.freeShipping
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-slate-500 bg-slate-50 border-slate-200'
                  }`}
                >
                  {item.freeShipping ? 'Elegible para envío gratis por MRW' : 'Cobro a destino'}
                </span>
              </div>
              <p className="text-sm font-semibold text-navy nums whitespace-nowrap">
                {formatCurrency(item.price * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShippingIcon size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-navy">
              {shippingData?.shippingMethod === 'tienda'
                ? 'Retiro en tienda'
                : shippingData?.shippingMethod === 'zoom'
                  ? 'Retiro ZOOM'
                  : shippingData?.shippingMethod === 'tealca'
                    ? 'Retiro TEALCA'
                    : 'Retiro MRW'}
            </h3>
          </div>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Nombre</dt>
              <dd className="text-navy text-right">
                {shippingData?.firstName} {shippingData?.lastName}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Cédula</dt>
              <dd className="text-navy text-right">{shippingData?.idNumber}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Celular</dt>
              <dd className="text-navy text-right">{shippingData?.phoneNumber}</dd>
            </div>
            {shippingData?.shippingMethod === 'mrw' && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Oficina</dt>
                <dd className="text-navy text-right">
                  {shippingData.mrwOfficeManual?.trim()
                    ? `${shippingData.mrwOfficeManual.trim()}, ${shippingData.mrwState}`
                    : `${shippingData.mrwOffice}, ${shippingData.mrwState}`
                  }
                </dd>
              </div>
            )}
            {shippingData?.shippingMethod === 'zoom' && (zoomOffice || shippingData.zoomOfficeManual?.trim()) && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Oficina</dt>
                <dd className="text-navy text-right">
                  {shippingData.zoomOfficeManual?.trim()
                    ? `${shippingData.zoomOfficeManual.trim()}, ${shippingData.zoomState}`
                    : zoomOffice
                      ? `${zoomOffice.name}${zoomOffice.address ? ` — ${zoomOffice.address}` : ''}${zoomOffice.city ? ` · ${zoomOffice.city}` : ''}, ${shippingData.zoomState}`
                      : shippingData.zoomState
                  }
                </dd>
              </div>
            )}
            {shippingData?.shippingMethod === 'tealca' && (tealcaOffice || shippingData.tealcaOfficeManual?.trim()) && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Oficina</dt>
                <dd className="text-navy text-right">
                  {shippingData.tealcaOfficeManual?.trim()
                    ? `${shippingData.tealcaOfficeManual.trim()}, ${shippingData.tealcaState}`
                    : tealcaOffice
                      ? `${tealcaOffice.name}${tealcaOffice.address ? ` — ${tealcaOffice.address}` : ''}${tealcaOffice.city ? ` · ${tealcaOffice.city}` : ''}, ${shippingData.tealcaState}`
                      : shippingData.tealcaState
                  }
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-slate-100">
              <dt className="text-slate-500">
                {shippingChargeType === 'STORE_PICKUP' ? 'Condición del retiro' : 'Condición del envío'}
              </dt>
              <dd className={`text-right font-semibold ${shippingChargeType === 'DESTINATION_CHARGE' ? 'text-slate-700' : 'text-emerald-700'}`}>
                {shippingChargeText}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={15} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-navy">Pago</h3>
          </div>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Método</dt>
              <dd className="text-navy font-medium text-right flex items-center justify-end gap-1">
                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                {paymentLabel}
              </dd>
            </div>
            {isBankManual && !whatsappMode && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Banco</dt>
                  <dd className="text-navy text-right">{paymentData?.bank}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Cédula titular</dt>
                  <dd className="text-navy text-right">{paymentData?.holderIdNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Teléfono</dt>
                  <dd className="text-navy text-right">{paymentData?.holderPhone}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Referencia</dt>
                  <dd className="text-navy font-mono text-right">{paymentData?.referenceNumber}</dd>
                </div>
              </>
            )}
            {selectedPaymentMethod?.kind === 'BINANCE' && !whatsappMode && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Order ID Binance</dt>
                  <dd className="text-navy font-mono text-right">{paymentData?.referenceNumber}</dd>
                </div>
                <p className="text-xs text-slate-500 pt-1 leading-relaxed">
                  Tras confirmar, reservamos tu pedido y MundoTech verificará tu pago en Binance antes de preparar el envío.
                </p>
              </>
            )}
            {selectedPaymentMethod?.kind === 'CASHEA' && (
              <p className="text-xs text-slate-500 pt-1 leading-relaxed">
                {isCasheaAutomatic
                  ? 'Serás dirigido a Cashea para completar tu compra. Reservamos tu pedido y preparamos el envío en cuanto confirmemos el pago inicial.'
                  : 'Tras confirmar, te mostraremos un botón de WhatsApp para coordinar tu pago con Cashea. Reservamos tu pedido y preparamos el envío en cuanto confirmemos el pago.'}
              </p>
            )}
          </dl>
          {!whatsappMode && paymentData?.proofPreviewUrl ? (
            <div className="mt-3">
              <p className="text-[11px] text-slate-500 mb-1.5">Captura adjunta</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={paymentData.proofPreviewUrl}
                alt="Comprobante"
                loading="lazy"
                decoding="async"
                className="w-24 h-24 object-cover rounded-xl border border-slate-200"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Cupón de descuento — no permitido con Cashea automático (Sección 1/7). */}
      {!isCasheaAutomatic && (
      <div className="rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Tag size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-navy">Cupón de descuento</h3>
        </div>

        {appliedCoupon ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span className="text-sm font-semibold text-emerald-700 font-mono truncate">
                {appliedCoupon}
              </span>
              <span className="text-xs text-emerald-600 whitespace-nowrap">
                −{formatCurrency(discountUsd)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleRemoveCoupon}
              className="inline-flex items-center gap-1 min-h-[44px] px-2 -my-2 -mr-2 text-xs font-medium text-slate-500 hover:text-rose-600 transition-colors"
            >
              <X size={14} /> Quitar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyCoupon();
                }
              }}
              placeholder="Ingresa tu código"
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="go"
              className="flex-grow min-w-0 min-h-[48px] rounded-xl border border-slate-200 px-4 text-base font-mono uppercase tracking-wide focus:border-navy focus:ring-2 focus:ring-navy/10 outline-none"
            />
            <button
              type="button"
              onClick={handleApplyCoupon}
              disabled={couponLoading || !couponInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-navy text-white text-sm font-semibold px-5 py-2.5 hover:bg-navy-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {couponLoading ? <Loader2 size={15} className="animate-spin" /> : 'Aplicar'}
            </button>
          </div>
        )}

        {couponMessage && (
          <p className="mt-2 text-xs text-rose-600">{couponMessage}</p>
        )}
      </div>
      )}

      {/* Resumen de totales — dual USD/Bs (PRD-022): el cobro real es en Bs. */}
      <div className="rounded-2xl border border-slate-200 p-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="text-navy nums">{formatCurrency(subtotal)}</span>
        </div>
        {estimatedPaymentDiscount > 0 && selectedPaymentMethod && (
          <div className="flex justify-between text-sm">
            <span className="text-emerald-600">
              Descuento por pago en divisas ({selectedPaymentMethod.discountPercent}%)
            </span>
            <span className="text-emerald-600 nums">−{formatCurrency(estimatedPaymentDiscount)}</span>
          </div>
        )}
        {discountUsd > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-emerald-600">Cupón ({appliedCoupon})</span>
            <span className="text-emerald-600 nums">−{formatCurrency(discountUsd)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Envío</span>
          <span className="text-navy nums">Gratis</span>
        </div>
        <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-100">
          <span className="text-navy">Total</span>
          <span className="text-navy nums">{formatCurrency(total)}</span>
        </div>
        {exchangeRate > 0 && selectedPaymentMethod?.currencyGroup !== 'USD' && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Total a pagar en bolívares</span>
            <span className="text-navy font-semibold nums">{formatBsApprox(total, exchangeRate)}</span>
          </div>
        )}
        {selectedPaymentMethod?.currencyGroup !== 'USD' && (
          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            El pago se realiza en bolívares. El monto definitivo se fija al confirmar y te llega por correo.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 space-y-2.5">
          <p className="text-rose-700 text-sm">{error}</p>
          {sessionExpired && (
            <button
              type="button"
              onClick={handleRelogin}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-700 active:scale-[0.98] transition-all"
            >
              <LogIn size={15} /> Iniciar sesión y volver al checkout
            </button>
          )}
        </div>
      )}

      {casheaSession ? (
        // Sesión Cashea creada (pedido + reserva ya en BD): se monta el botón
        // oficial del SDK en vez del CTA genérico. NUNCA se afirma "pagado"
        // aquí — solo `verifyCasheaOrder` (Fase 3/5) puede confirmarlo.
        <div className="rounded-2xl border border-navy/20 bg-navy/5 p-5 space-y-3">
          <p className="text-sm font-semibold text-navy">Continúa tu pago con Cashea</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tu pedido quedó reservado. Pulsa el botón para completar tu compra en Cashea; al volver
            verificaremos tu pago inicial automáticamente.
          </p>
          <CasheaCheckoutButton
            key={casheaSession.orderId}
            publicApiKey={casheaSession.publicApiKey}
            payload={casheaSession.payload}
            onError={setCasheaButtonError}
          />
          {casheaButtonError && (
            <div className="space-y-2">
              <p className="text-xs text-rose-600">{casheaButtonError}</p>
              <button
                type="button"
                onClick={() => {
                  setCasheaSession(null);
                  setCasheaButtonError(null);
                }}
                className="text-xs font-semibold text-navy underline hover:text-navy-700"
              >
                Intentar de nuevo
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 bg-white/95 backdrop-blur-sm border-t border-slate-100 sm:static sm:mx-0 sm:px-0 sm:pb-0 sm:pt-0 sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
        <button
          type="button"
          onClick={handleConfirmOrder}
          disabled={isProcessing || cart.length === 0}
          className="inline-flex w-full items-center justify-center gap-2 bg-navy text-white font-bold text-sm min-h-[52px] rounded-2xl hover:bg-navy-700 active:scale-[0.98] shadow-soft hover:shadow-card transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 size={16} className="animate-spin" /> {isCasheaAutomatic ? 'Preparando Cashea…' : 'Enviando pedido…'}
            </>
          ) : (
            <>
              {whatsappMode && !isCasheaAutomatic ? 'Enviar pedido por WhatsApp' : `Confirmar pedido — ${formatCurrency(total)}`}
              {(!whatsappMode || isCasheaAutomatic) &&
              exchangeRate > 0 &&
              selectedPaymentMethod?.currencyGroup !== 'USD'
                ? ` (≈ ${formatBsApprox(total, exchangeRate)})`
                : ''}
            </>
          )}
        </button>
        </div>
      )}
    </div>
  );
};

export default ReviewStep;
