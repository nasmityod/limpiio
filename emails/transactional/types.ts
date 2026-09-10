export type OrderConfirmationLineItem = {
  name: string;
  slug: string;
  image: string | null;
  priceUsd: number;
  quantity: number;
  variations?: Record<string, string> | string | null;
};

/**
 * Payload único para confirmación de pedido + envío por Resend.
 * Montos primarios en USD; tasa convierte a Bs.S para vista dual.
 * PRD-202: subtotalBs / shippingBs / totalBs son los montos Bs congelados
 * del pedido (calculados una sola vez con la tasa del momento de creación).
 * Cuando están presentes la plantilla los muestra directamente sin recalcular.
 */
export type OrderConfirmationPayload = {
  id: string;
  orderNumber: number;
  customerName: string;
  email: string;
  createdAt: Date;
  status: string;
  items: OrderConfirmationLineItem[];
  subtotalUsd: number;
  shippingUsd: number;
  totalUsd: number;
  /** PRD-202: monto Bs congelado al crear el pedido (sin conversión posterior). */
  subtotalBs?: number;
  /** PRD-202: envío en Bs congelado (0 para envío gratuito). */
  shippingBs?: number;
  /** PRD-202: total en Bs congelado al crear el pedido. */
  totalBs?: number;
  exchangeRateUsdBs: number | null;
  /** Descuento por pago en divisas (USD). */
  paymentDiscountUsd?: number;
  paymentDiscountPercent?: number;
  /** Descuento por pago en divisas (Bs congelado). */
  paymentDiscountBs?: number;
  /** Descuento de cupón (USD). */
  couponDiscountUsd?: number;
  /** Descuento de cupón (Bs congelado). */
  couponDiscountBs?: number;
  /** Moneda elegida al pagar (p. ej. USD). Null si no aplica. */
  paymentCurrency?: string | null;
  paymentMethod: string;
  paymentBank?: string | null;
  paymentReference?: string | null;
  shippingAddress: string;
  shippingCity: string;
  shippingState: string;
  shippingZipCode: string;
  shippingCountry: string;
  customerPhone?: string | null;
  /** Ej. MRW, Zoom — en checkout suele ser null y se muestra texto neutro. */
  shippingMethod?: string | null;
  /** Snapshot: Order.freeShipping=true solo si fue MRW + todos elegibles (FREE). STORE_PICKUP no es envío. */
  freeShipping?: boolean;
  /** SESIÓN 06: token de acceso guest (raw, una sola vez). Null para pedidos autenticados. */
  guestToken?: string | null;
};
