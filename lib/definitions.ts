// ─────────────────────────────────────────────────────────────
// ESPECIFICACIONES TÉCNICAS DE PRODUCTO
// ─────────────────────────────────────────────────────────────
import { isStorePickupOrderAddress } from '@/lib/shipping-charge';

export interface ProductSpec {
  name:  string;
  value: string;
}

/** Valida y convierte el campo Json? de Prisma a ProductSpec[]. Devuelve [] si el valor no es válido. */
export function parseProductSpecs(raw: unknown): ProductSpec[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is ProductSpec =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as ProductSpec).name  === 'string' &&
      typeof (s as ProductSpec).value === 'string' &&
      (s as ProductSpec).name.trim()  !== '' &&
      (s as ProductSpec).value.trim() !== '',
  );
}

// ─────────────────────────────────────────────────────────────
// CARRITO
// ─────────────────────────────────────────────────────────────

/** Ítem de carrito tal como lo devuelve la API /api/cart (con datos de producto enriquecidos). */
export interface CartItemAPI {
  /** ID del registro CartItem en BD. */
  id: string;
  productId: string;
  quantity: number;
  name: string;
  slug: string | null;
  price: number;
  originalPrice: number | null;
  stock: number;
  category: string;
  brand: string | null;
  images: string[];
  /** true = elegible para envío gratis exclusivamente por MRW; false = sin beneficio MRW. */
  freeShipping: boolean;
}

// ─────────────────────────────────────────────────────────────
// PEDIDOS
// ─────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'Pendiente verificación Binance'
  | 'Pendiente'
  | 'En Proceso'
  | 'Enviado'
  | 'Entregado'
  | 'Cancelado';

/** Valores válidos para actualización manual de estado (excluye Binance que tiene ruta propia). */
export const VALID_ORDER_STATUSES: OrderStatus[] = [
  'Pendiente',
  'En Proceso',
  'Enviado',
  'Entregado',
  'Cancelado',
];

// ─────────────────────────────────────────────────────────────
// CASHEA (Fase 7 — ver docs/ENTREGABLE-CLIENTE/integracion-cashea.md
// Sección 6: máquina de estados `casheaStatus`)
// ─────────────────────────────────────────────────────────────

/** Espejo del enum Prisma `CasheaStatus` (prisma/schema.prisma, Fase 2). */
export type CasheaOrderStatus =
  | 'CREATED'
  | 'REDIRECTED'
  | 'RETURNED'
  | 'VERIFYING'
  | 'CONFIRMED'
  | 'CANCEL_PENDING'
  | 'CANCELLED'
  | 'FAILED'
  | 'EXPIRED';

/** Etiquetas admin (panel `/admin/orders/[id]`) para cada estado de la máquina Cashea. */
export const CASHEA_STATUS_ADMIN_LABELS: Record<CasheaOrderStatus, string> = {
  CREATED: 'Creado (reserva activa, sin redirigir aún)',
  REDIRECTED: 'Redirigido a Cashea',
  RETURNED: 'Retornó de Cashea (sin verificar)',
  VERIFYING: 'Verificando pago…',
  CONFIRMED: 'Inicial confirmada',
  CANCEL_PENDING: 'Cancelación en curso',
  CANCELLED: 'Cancelado',
  FAILED: 'Falló la creación/redirección',
  EXPIRED: 'Reserva vencida (pendiente de recuperación manual)',
};

/**
 * Copy orientado al cliente para la página de éxito (Fase 7, punto 1):
 * NUNCA afirma "pagado" salvo en `CONFIRMED` — la URL de retorno no es
 * prueba de pago (Sección 7 del documento maestro).
 */
export const CASHEA_STATUS_CUSTOMER_COPY: Record<
  CasheaOrderStatus,
  { title: string; description: string; tone: 'success' | 'pending' | 'error' }
> = {
  CREATED: {
    title: 'Pedido creado',
    description: 'Tu pedido quedó registrado. Completa el pago con Cashea para continuar.',
    tone: 'pending',
  },
  REDIRECTED: {
    title: 'Redirigido a Cashea',
    description: 'Te enviamos a Cashea para completar el pago de tu inicial.',
    tone: 'pending',
  },
  RETURNED: {
    title: 'Verificando tu pago',
    description: 'Estamos verificando tu pago inicial con Cashea. Te avisaremos por correo en cuanto se confirme.',
    tone: 'pending',
  },
  VERIFYING: {
    title: 'Verificando tu pago',
    description: 'Estamos verificando tu pago inicial con Cashea. Te avisaremos por correo en cuanto se confirme.',
    tone: 'pending',
  },
  CONFIRMED: {
    title: 'Pago inicial confirmado',
    description: 'Confirmamos tu pago inicial con Cashea. Tu pedido ya está en preparación.',
    tone: 'success',
  },
  CANCEL_PENDING: {
    title: 'Cancelando pedido',
    description: 'Estamos procesando la cancelación de este pedido.',
    tone: 'pending',
  },
  CANCELLED: {
    title: 'Pedido cancelado',
    description: 'Este pedido fue cancelado. Si fue un error, contáctanos por WhatsApp.',
    tone: 'error',
  },
  FAILED: {
    title: 'No pudimos iniciar el pago',
    description: 'Hubo un problema al iniciar tu pago con Cashea. Escríbenos por WhatsApp para completar tu compra.',
    tone: 'error',
  },
  EXPIRED: {
    title: 'Tiempo de pago vencido',
    description: 'El tiempo para completar tu pago con Cashea venció. Escríbenos por WhatsApp para continuar con tu pedido.',
    tone: 'pending',
  },
};

// ─────────────────────────────────────────────────────────────
// RESEÑAS
// ─────────────────────────────────────────────────────────────
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const VALID_REVIEW_STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export interface Review {
  id:               string;
  productId:        string;
  productName?:     string;
  userId:           string | null;
  authorName:       string;
  rating:           number;
  title?:           string | null;
  comment:          string;
  status:           ReviewStatus;
  verifiedPurchase: boolean;
  adminReply?:      string | null;
  photos:           string[];
  createdAt:        string;
}

export interface ReviewSummary {
  average: number;
  count:   number;
  /** Distribución por estrella: índice 0 = 1★ … índice 4 = 5★. */
  breakdown: [number, number, number, number, number];
}

// ─────────────────────────────────────────────────────────────
// CUPONES
// ─────────────────────────────────────────────────────────────
export type CouponDiscountType = 'PERCENT' | 'FIXED';

export const VALID_COUPON_TYPES: CouponDiscountType[] = ['PERCENT', 'FIXED'];

export interface Coupon {
  id:            string;
  code:          string;
  description?:  string | null;
  discountType:  CouponDiscountType;
  discountValue: number;
  minPurchase:   number;
  maxDiscount?:  number | null;
  maxUses?:      number | null;
  usedCount:     number;
  perUserLimit?: number | null;
  startsAt?:     string | null;
  expiresAt?:    string | null;
  active:        boolean;
  createdAt:     string;
}

// ─────────────────────────────────────────────────────────────
// CARRITO ABANDONADO
// ─────────────────────────────────────────────────────────────
export type AbandonedCartStatus =
  | 'PENDING'
  | 'EMAILED_24H'
  | 'EMAILED_72H'
  | 'RECOVERED'
  | 'OPTED_OUT';

/** Estados en los que el carrito todavía puede recibir un email de recuperación. */
export const ABANDONED_CART_EMAILABLE_STATUSES: AbandonedCartStatus[] = ['PENDING', 'EMAILED_24H'];

export interface AbandonedCartItem {
  id:       string;
  name:     string;
  slug:     string;
  price:    number;
  quantity: number;
  image:    string | null;
}

// ─────────────────────────────────────────────────────────────
// RESTOCK
// ─────────────────────────────────────────────────────────────
export interface RestockSubscription {
  id:         string;
  email:      string;
  productId:  string;
  notifiedAt: string | null;
  createdAt:  string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface OrderItem {
  id?:         string;
  productId:   string;
  productName: string;
  quantity:    number;
  price:       number;
  imageUrl?:   string;
  /** Snapshot: elegible para beneficio MRW al crear el pedido. Nunca se recalcula. */
  freeShipping: boolean;
}

export interface ShippingDetails {
  address:  string;
  city:     string;
  state:    string;
  zipCode:  string;
  country:  string;
}

/** Canal de origen del pedido para el sistema de checkout. */
export type OrderChannel = 'web' | 'whatsapp';

/** Tipo de pedido normalizado para toda la UI — compatible con el modelo Prisma Order. */
export interface Order {
  id:              string;
  orderNumber:     number;
  createdAt:       string;
  customerId:      string | null;
  customerName:    string;
  customerEmail?:  string | null;
  customerPhone?:  string | null;
  customerIdNumber?: string | null;
  items:           OrderItem[];
  total:           number;
  /** Si existe, `total` y precios de ítems están en Bs. (tasa al comprar). Si no, legado en USD. */
  exchangeRateUsdBs?: number | null;
  status:          OrderStatus;
  shippingDetails: ShippingDetails;
  paymentMethod:   string;
  /** ID estable del método de pago (snapshot). Null en pedidos antiguos. */
  paymentMethodId?:          string | null;
  /** Subtotal de líneas en Bs antes de descuentos. Null = legacy. */
  subtotalBeforeDiscount?:   number | null;
  /** Porcentaje de descuento por divisas congelado al crear. Null si no aplicó. */
  paymentDiscountPercent?:   number | null;
  /** Monto del descuento por divisas en Bs. Null si no aplicó. */
  paymentDiscount?:          number | null;
  /** Moneda elegida (p. ej. USD en efectivo). Null si no aplica. */
  paymentCurrency?:          string | null;
  paymentBank?:              string | null;
  paymentHolderIdNumber?:    string | null;
  paymentHolderPhone?:       string | null;
  paymentReference?:         string | null;
  paymentProofUrl?:          string | null;
  /** SESIÓN 04: key del objeto en bucket privado R2. Null = registro legacy con URL pública. */
  paymentProofKey?:          string | null;
  trackingNumber?:           string | null;
  trackingCarrier?:          string | null;
  trackingPhotoUrl?:         string | null;
  trackingUrl?:              string | null;
  shippedAt?:                string | null;
  /** ISO: validación de pago (admin). Null en pedidos antiguos o aún pendientes. */
  paidAt?:                   string | null;
  /** Código de cupón aplicado (mayúsculas). Null si no se usó cupón. */
  couponCode?:               string | null;
  /** Descuento del cupón en Bs (misma moneda que `total`). */
  couponDiscount?:           number | null;
  /** Email del admin que validó/rechazó el pago (auditoría). */
  paymentVerifiedBy?:        string | null;
  /** Motivo de rechazo del pago, si aplica. */
  paymentRejectionReason?:   string | null;
  notes?:          string | null;
  channel?:        OrderChannel | null;
  /**
   * true = las unidades continúan descontadas/reservadas.
   * false = no fueron descontadas o ya fueron liberadas al cancelar.
   */
  stockDeducted?:  boolean | null;
  /**
   * Snapshot calculado por el servidor al crear el pedido (lib/checkout-order.ts):
   * true SOLO si el método era MRW y TODOS los productos calificaban para
   * envío gratis por MRW en ese momento. ZOOM/TEALCA nunca quedan true.
   * Retiro en tienda siempre false (no es envío). Nunca se recalcula —
   * pedidos históricos no cambian si un producto cambia su beneficio después.
   */
  freeShipping:    boolean;
  /**
   * Campos Cashea (Fase 2/7). `null` en pedidos no-Cashea o en pedidos Cashea
   * manuales (coordinados por WhatsApp, sin flujo automático — hoy siempre,
   * mientras CASHEA_ENABLED=false). Solo el flujo automático de
   * `lib/cashea-session.ts` / `lib/cashea-reconcile.ts` los completa.
   */
  casheaStatus?:                 CasheaOrderStatus | null;
  casheaOrderId?:                string | null;
  casheaInitialAmount?:          number | null;
  casheaCurrency?:               string | null;
  casheaReservationExpiresAt?:   string | null;
  casheaRedirectedAt?:           string | null;
  casheaReturnedAt?:             string | null;
  casheaConfirmedAt?:            string | null;
  casheaCancelledAt?:            string | null;
  casheaLastResponseCode?:       string | null;
  casheaAttemptCount?:           number | null;
}

// ─────────────────────────────────────────────────────────────
// LIBRO DE DIRECCIONES
// ─────────────────────────────────────────────────────────────

export type ShippingMethod = 'tienda' | 'mrw' | 'zoom' | 'tealca';

export interface SavedAddress {
  id:             string;
  userId:         string;
  alias:          string;
  firstName:      string;
  lastName:       string;
  idNumber:       string;
  phoneNumber:    string;
  shippingMethod: ShippingMethod;
  mrwState?:      string | null;
  mrwOffice?:     string | null;
  officeAddress?: string | null;
  officeCity?:    string | null;
  isDefault:      boolean;
  createdAt:      string;
}

export interface SavedAddressInput {
  alias:          string;
  firstName:      string;
  lastName:       string;
  idNumber:       string;
  phoneNumber:    string;
  shippingMethod: ShippingMethod;
  mrwState?:      string | null;
  mrwOffice?:     string | null;
  officeAddress?: string | null;
  officeCity?:    string | null;
  isDefault?:     boolean;
}

/** SESIÓN 06: DTO mínimo de confirmación de pedido para invitados.
 *  NO incluye id, cédula, referencia, dirección, comprobante, email completo ni teléfono completo. */
export interface GuestOrderConfirmation {
  orderNumber: number;
  createdAt: string;
  items: GuestOrderItem[];
  total: number;
  /** null = legado en USD. Si presente, total y precios de ítems están en Bs. */
  exchangeRateUsdBs?: number | null;
  status: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subtotalBeforeDiscount?: number | null;
  paymentDiscountPercent?: number | null;
  paymentDiscount?: number | null;
  paymentCurrency?: string | null;
  /** Canal de origen: 'web' | 'whatsapp'. */
  channel?: string | null;
  freeShipping: boolean;
  /** Snapshot no-PII: retiro en tienda (derivado de la dirección al crear el DTO). */
  storePickup: boolean;
}

export interface GuestOrderItem {
  productName: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

/** Consulta pública /pedido: allowlist sin proof, referencia, titular de pago ni contacto. */
export interface PublicOrderLookupItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  imageUrl?: string;
  productSlug: string;
  freeShipping: boolean;
}

export interface PublicOrderLookup {
  orderNumber: number;
  createdAt: string;
  customerName: string;
  items: PublicOrderLookupItem[];
  total: number;
  exchangeRateUsdBs?: number | null;
  status: OrderStatus;
  shippingDetails: ShippingDetails;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subtotalBeforeDiscount?: number | null;
  paymentDiscountPercent?: number | null;
  paymentDiscount?: number | null;
  paymentCurrency?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingPhotoUrl?: string | null;
  trackingUrl?: string | null;
  shippedAt?: string | null;
  paidAt?: string | null;
  couponCode?: string | null;
  couponDiscount?: number | null;
  channel?: OrderChannel | null;
  freeShipping: boolean;
}

import { d, dn } from '@/lib/decimal';

type DecimalLike = { toNumber(): number } | number;

/** Mapea un registro Prisma (con items incluidos) al tipo Order de la UI. */
export function prismaOrderToOrder(o: {
  id: string;
  orderNumber: number;
  createdAt: Date;
  customerId: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerIdNumber?: string | null;
  total: DecimalLike;
  status: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subtotalBeforeDiscount?: DecimalLike | null;
  paymentDiscountPercent?: DecimalLike | null;
  paymentDiscount?: DecimalLike | null;
  paymentCurrency?: string | null;
  paymentBank?: string | null;
  paymentHolderIdNumber?: string | null;
  paymentHolderPhone?: string | null;
  paymentReference?: string | null;
  paymentProofUrl?: string | null;
  paymentProofKey?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingPhotoUrl?: string | null;
  trackingUrl?: string | null;
  shippedAt?: Date | null;
  paidAt?: Date | null;
  couponCode?: string | null;
  couponDiscount?: DecimalLike | null;
  paymentVerifiedBy?: string | null;
  paymentRejectionReason?: string | null;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingZipCode: string;
  shippingCountry: string;
  exchangeRateUsdBs?: DecimalLike | null;
  notes?: string | null;
  channel?: string | null;
  /** true = unidades aún descontadas/reservadas; false = no descontadas o ya liberadas. */
  stockDeducted?: boolean | null;
  freeShipping?: boolean | null;
  casheaStatus?: string | null;
  casheaOrderId?: string | null;
  casheaInitialAmount?: DecimalLike | null;
  casheaCurrency?: string | null;
  casheaReservationExpiresAt?: Date | null;
  casheaRedirectedAt?: Date | null;
  casheaReturnedAt?: Date | null;
  casheaConfirmedAt?: Date | null;
  casheaCancelledAt?: Date | null;
  casheaLastResponseCode?: string | null;
  casheaAttemptCount?: number | null;
  items: { id: string; productId: string; productName: string; quantity: number; price: DecimalLike; imageUrl?: string | null; freeShipping?: boolean | null }[];
}): Order {
  return {
    id:              o.id,
    orderNumber:     o.orderNumber,
    createdAt:       o.createdAt.toISOString(),
    customerId:      o.customerId,
    customerName:    o.customerName,
    customerEmail:   o.customerEmail,
    customerPhone:   o.customerPhone,
    customerIdNumber: o.customerIdNumber,
    // PRD-204: convertir Decimal → number en la frontera BD→UI
    total:           d(o.total),
    exchangeRateUsdBs: dn(o.exchangeRateUsdBs),
    status:          o.status as OrderStatus,
    paymentMethod:   o.paymentMethod,
    paymentMethodId:          o.paymentMethodId ?? null,
    subtotalBeforeDiscount:   dn(o.subtotalBeforeDiscount),
    paymentDiscountPercent:   dn(o.paymentDiscountPercent),
    paymentDiscount:          dn(o.paymentDiscount),
    paymentCurrency:          o.paymentCurrency ?? null,
    paymentBank:              o.paymentBank,
    paymentHolderIdNumber:    o.paymentHolderIdNumber,
    paymentHolderPhone:       o.paymentHolderPhone,
    paymentReference:         o.paymentReference,
    paymentProofUrl:          o.paymentProofUrl,
    paymentProofKey:          o.paymentProofKey ?? null,
    trackingNumber:           o.trackingNumber  ?? null,
    trackingCarrier:          o.trackingCarrier ?? null,
    trackingPhotoUrl:         o.trackingPhotoUrl ?? null,
    trackingUrl:              o.trackingUrl    ?? null,
    shippedAt:                o.shippedAt ? o.shippedAt.toISOString() : null,
    paidAt:                   o.paidAt ? o.paidAt.toISOString() : null,
    couponCode:               o.couponCode ?? null,
    couponDiscount:           dn(o.couponDiscount),
    paymentVerifiedBy:        o.paymentVerifiedBy ?? null,
    paymentRejectionReason:   o.paymentRejectionReason ?? null,
    notes:           o.notes,
    channel:         (o.channel as OrderChannel | null) ?? 'web',
    stockDeducted:   o.stockDeducted ?? true,
    freeShipping:    o.freeShipping === true,
    casheaStatus:               (o.casheaStatus as CasheaOrderStatus | null) ?? null,
    casheaOrderId:              o.casheaOrderId ?? null,
    casheaInitialAmount:        dn(o.casheaInitialAmount),
    casheaCurrency:             o.casheaCurrency ?? null,
    casheaReservationExpiresAt: o.casheaReservationExpiresAt ? o.casheaReservationExpiresAt.toISOString() : null,
    casheaRedirectedAt:         o.casheaRedirectedAt ? o.casheaRedirectedAt.toISOString() : null,
    casheaReturnedAt:           o.casheaReturnedAt ? o.casheaReturnedAt.toISOString() : null,
    casheaConfirmedAt:          o.casheaConfirmedAt ? o.casheaConfirmedAt.toISOString() : null,
    casheaCancelledAt:          o.casheaCancelledAt ? o.casheaCancelledAt.toISOString() : null,
    casheaLastResponseCode:     o.casheaLastResponseCode ?? null,
    casheaAttemptCount:         o.casheaAttemptCount ?? null,
    shippingDetails: {
      address:  o.shippingAddress,
      city:     o.shippingCity,
      state:    o.shippingState,
      zipCode:  o.shippingZipCode,
      country:  o.shippingCountry,
    },
    items: o.items.map(i => ({
      id:          i.id,
      productId:   i.productId,
      productName: i.productName,
      quantity:    i.quantity,
      price:       d(i.price),
      imageUrl:    i.imageUrl ?? undefined,
      freeShipping: i.freeShipping === true,
    })),
  };
}

/** SESIÓN 06: mapea un pedido Prisma al DTO mínimo de confirmación guest.
 *  Solo expone datos necesarios para la pantalla de éxito post-checkout.
 *  NO serializa: customerIdNumber, paymentReference, shippingDetails,
 *  paymentProofUrl, paymentProofKey, customerEmail, customerPhone. */
export function toGuestOrderConfirmationDto(o: {
  id: string;
  orderNumber: number;
  createdAt: Date;
  total: DecimalLike;
  status: string;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subtotalBeforeDiscount?: DecimalLike | null;
  paymentDiscountPercent?: DecimalLike | null;
  paymentDiscount?: DecimalLike | null;
  paymentCurrency?: string | null;
  exchangeRateUsdBs?: DecimalLike | null;
  channel?: string | null;
  freeShipping?: boolean | null;
  shippingAddress?: string | null;
  items: { productName: string; quantity: number; price: DecimalLike; imageUrl?: string | null }[];
}): GuestOrderConfirmation {
  return {
    orderNumber:     o.orderNumber,
    createdAt:       o.createdAt.toISOString(),
    freeShipping:    o.freeShipping === true,
    storePickup:     isStorePickupOrderAddress(o.shippingAddress),
    total:           d(o.total),
    exchangeRateUsdBs: dn(o.exchangeRateUsdBs),
    status:          o.status,
    paymentMethod:   o.paymentMethod,
    paymentMethodId: o.paymentMethodId ?? null,
    subtotalBeforeDiscount: dn(o.subtotalBeforeDiscount),
    paymentDiscountPercent: dn(o.paymentDiscountPercent),
    paymentDiscount: dn(o.paymentDiscount),
    paymentCurrency: o.paymentCurrency ?? null,
    channel:         o.channel ?? null,
    items: o.items.map(i => ({
      productName: i.productName,
      quantity:    i.quantity,
      price:       d(i.price),
      imageUrl:    i.imageUrl ?? undefined,
    })),
  };
}

/** Mapea Order enriquecido a DTO público de consulta (sin PII de pago). */
export function toPublicOrderLookupDto(order: {
  orderNumber: number;
  createdAt: string;
  customerName: string;
  total: number;
  exchangeRateUsdBs?: number | null;
  status: OrderStatus;
  shippingDetails: ShippingDetails;
  paymentMethod: string;
  paymentMethodId?: string | null;
  subtotalBeforeDiscount?: number | null;
  paymentDiscountPercent?: number | null;
  paymentDiscount?: number | null;
  paymentCurrency?: string | null;
  trackingNumber?: string | null;
  trackingCarrier?: string | null;
  trackingPhotoUrl?: string | null;
  trackingUrl?: string | null;
  shippedAt?: string | null;
  paidAt?: string | null;
  couponCode?: string | null;
  couponDiscount?: number | null;
  channel?: OrderChannel | null;
  freeShipping?: boolean | null;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    imageUrl?: string;
    productSlug: string;
    freeShipping?: boolean | null;
  }[];
}): PublicOrderLookup {
  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: order.customerName,
    total: order.total,
    exchangeRateUsdBs: order.exchangeRateUsdBs ?? null,
    status: order.status,
    shippingDetails: order.shippingDetails,
    paymentMethod: order.paymentMethod,
    paymentMethodId: order.paymentMethodId ?? null,
    subtotalBeforeDiscount: order.subtotalBeforeDiscount ?? null,
    paymentDiscountPercent: order.paymentDiscountPercent ?? null,
    paymentDiscount: order.paymentDiscount ?? null,
    paymentCurrency: order.paymentCurrency ?? null,
    trackingNumber: order.trackingNumber ?? null,
    trackingCarrier: order.trackingCarrier ?? null,
    trackingPhotoUrl: order.trackingPhotoUrl ?? null,
    trackingUrl: order.trackingUrl ?? null,
    shippedAt: order.shippedAt ?? null,
    paidAt: order.paidAt ?? null,
    couponCode: order.couponCode ?? null,
    couponDiscount: order.couponDiscount ?? null,
    channel: order.channel ?? null,
    freeShipping: order.freeShipping === true,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      imageUrl: item.imageUrl,
      productSlug: item.productSlug,
      freeShipping: item.freeShipping === true,
    })),
  };
}
