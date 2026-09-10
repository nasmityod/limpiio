import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { loadExchangeRateUsdBsFromTx, roundMoney2 } from '@/lib/exchange-rate';
import type { OrderStatus } from '@/lib/definitions';
import { CheckoutError } from '@/lib/checkout-error';
import { d } from '@/lib/decimal';
import { logWarn } from '@/lib/safe-logger';
import {
  validateCouponForCheckout,
  redeemCouponInTransaction,
  revertCouponRedemptionInTransaction,
  COUPON_PER_USER_LIMIT_REASON,
  COUPON_GENERIC_INVALID_REASON,
} from '@/lib/coupons';
import { hashToken } from '@/lib/security';
import { assertProofKey } from '@/lib/r2';
import {
  loadPaymentMethodsFromTransaction,
  resolveAndValidatePaymentMethod,
  calculatePaymentDiscountCents,
  PaymentMethodValidationError,
  type PaymentMethodConfig,
  type PaymentSettingsSlice,
} from '@/lib/payment-methods';
import { resolveShippingChargeType } from '@/lib/shipping-charge';

export const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  imageUrl: z.string().optional().nullable(),
});

export const checkoutSchema = z.object({
  customerId: z.string().optional().default('guest'),
  customerName: z.string().min(1, 'El nombre del cliente es requerido.'),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  customerIdNumber: z.string().optional().nullable(),
  /**
   * PRD-128: cómo retira el cliente. Para 'tienda' el servidor reemplaza la
   * dirección por la configurada en readSettings() (nunca el copy del cliente).
   */
  shippingMethod: z.enum(['tienda', 'mrw', 'zoom', 'tealca']).optional().nullable(),
  shippingDetails: z.object({
    address: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().optional().default('N/A'),
    country: z.string().optional().default('Venezuela'),
  }),
  paymentMethodId: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9:_-]+$/, 'Método de pago inválido.'),
  paymentCurrency: z.string().trim().toUpperCase().max(10).optional().nullable(),
  paymentBank: z.string().optional().nullable(),
  paymentHolderIdNumber: z.string().optional().nullable(),
  paymentHolderPhone: z.string().optional().nullable(),
  paymentReference: z.string().optional().nullable(),
  /** SESIÓN 05: token de upload obtenido de /api/checkout/upload-session. */
  paymentUploadToken: z
    .string()
    .trim()
    .min(1, 'Token de subida requerido.')
    .optional()
    .nullable(),
  couponCode: z.string().trim().max(40).optional().nullable(),
  channel: z.enum(['web', 'whatsapp']).optional().default('web'),
  items: z
    .array(orderItemSchema)
    .min(1, 'El pedido debe tener al menos un producto.')
    .max(50, 'El pedido supera el número máximo de líneas permitidas.'),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export type CheckoutExecuteOptions = {
  /** Estado inicial del pedido (ej. verificación Binance). */
  orderStatus?: OrderStatus;
  /** Si false, no descuenta stock (modo WhatsApp). Default true. */
  deductStock?: boolean;
  /** SESIÓN 06: hash SHA-256 del token de acceso guest. Solo para pedidos sin cuenta. */
  guestAccessTokenHash?: string | null;
  /** SESIÓN 06: fecha de expiración del token guest (72h desde creación). */
  guestAccessTokenExpiresAt?: Date | null;
};

const EMPTY_PAYMENT_SETTINGS: PaymentSettingsSlice = {
  pagoMovil: { bank: '', phone: '', idNumber: '' },
  transferencia: { bank: '', accountNumber: '', accountHolder: '', rif: '' },
  binancePayId: '',
};

async function loadPaymentSettingsSliceFromTransaction(
  tx: Prisma.TransactionClient,
): Promise<PaymentSettingsSlice> {
  const record = await tx.appConfig.findUnique({
    where: { key: 'store_settings' },
  });
  if (!record) {
    return EMPTY_PAYMENT_SETTINGS;
  }
  try {
    const raw = JSON.parse(record.value) as {
      pagoMovil?: { bank?: string; phone?: string; idNumber?: string };
      transferencia?: {
        bank?: string;
        accountNumber?: string;
        accountHolder?: string;
        rif?: string;
      };
      binancePayId?: string;
    };
    return {
      pagoMovil: {
        bank: raw.pagoMovil?.bank ?? '',
        phone: raw.pagoMovil?.phone ?? '',
        idNumber: raw.pagoMovil?.idNumber ?? '',
      },
      transferencia: {
        bank: raw.transferencia?.bank ?? '',
        accountNumber: raw.transferencia?.accountNumber ?? '',
        accountHolder: raw.transferencia?.accountHolder ?? '',
        rif: raw.transferencia?.rif ?? '',
      },
      binancePayId: raw.binancePayId ?? '',
    };
  } catch {
    return EMPTY_PAYMENT_SETTINGS;
  }
}

/**
 * PRD-131: busca un pedido reciente equivalente (mismo comprador + misma
 * referencia de pago, no cancelado) para tratar reintentos/doble envío como
 * idempotentes. Una misma transferencia no puede pagar dos pedidos distintos,
 * así que la referencia funciona como clave natural de idempotencia.
 * FASE 4.1: para invitados (customerId null) la clave es (customerEmail, ref).
 * Debe ejecutarse DENTRO de la misma transacción que crea el pedido —
 * el aislamiento Serializable convierte la carrera lectura→inserción en un
 * conflicto de serialización que el caller reintenta (runCheckoutTransaction).
 * // DECISIÓN ASUMIDA (RUN-02): NO se añade índice único (customerId,
 * // paymentReference) — las referencias bancarias venezolanas (4-6 dígitos)
 * // se repiten legítimamente entre pedidos de meses distintos; un unique sin
 * // ventana temporal bloquearía compras válidas. La ventana de 24 h + SSI
 * // cubren el caso real (doble toque / retry).
 */
export async function findRecentDuplicateOrderInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    customerId: string | null;
    customerEmail?: string | null;
    paymentReference: string | null | undefined;
  },
) {
  const reference = params.paymentReference?.trim();
  if (!reference) return null;

  const hasAccount = params.customerId && params.customerId !== 'guest';
  const guestEmail = params.customerEmail?.trim().toLowerCase();
  if (!hasAccount && !guestEmail) return null;

  return tx.order.findFirst({
    where: {
      ...(hasAccount
        ? { customerId: params.customerId }
        : { customerId: null, customerEmail: { equals: guestEmail, mode: 'insensitive' } }),
      paymentReference: reference,
      status: { not: 'Cancelado' satisfies OrderStatus },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** Recalcula total en servidor, crea pedido y descuenta stock atómicamente. */
export async function executeCheckoutInTransactionWithMethod(
  tx: Prisma.TransactionClient,
  input: CheckoutInput,
  options?: CheckoutExecuteOptions,
) {
  const {
    customerId,
    customerName,
    customerEmail,
    customerPhone,
    customerIdNumber,
    shippingDetails,
    paymentMethodId,
    paymentCurrency,
    shippingMethod,
    paymentBank,
    paymentHolderIdNumber,
    paymentHolderPhone,
    paymentReference,
    paymentUploadToken,
    couponCode,
    channel,
    items,
  } = input;

  const isGuestOrder = !customerId || customerId === 'guest';
  const guestAccessTokenHash = options?.guestAccessTokenHash ?? null;
  const guestAccessTokenExpiresAt = options?.guestAccessTokenExpiresAt ?? null;
  // Solo guest orders pueden tener token; si se pasa para usuario registrado, se ignora.
  const effectiveAccessTokenHash = isGuestOrder ? guestAccessTokenHash : null;
  const effectiveAccessTokenExpiresAt = isGuestOrder ? guestAccessTokenExpiresAt : null;

  const deductStock = options?.deductStock ?? true;

  const effectiveChannel = channel ?? 'web';
  const effectivePaymentReference =
    effectiveChannel === 'whatsapp' ? null : (paymentReference ?? null);
  const effectivePaymentUploadToken =
    effectiveChannel === 'whatsapp' ? null : (paymentUploadToken ?? null);

  const productIds = [...new Set(items.map((i) => i.productId))];
  // PRD-025: se incluye isActive en la consulta para detectar productos
  // despublicados/soft-deleted y rechazar el pedido con mensaje claro.
  const dbProducts = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, stock: true, name: true, isActive: true, freeShipping: true },
  });

  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  // Cantidad TOTAL solicitada por producto (un mismo productId puede venir en
  // varias líneas; hay que sumarlas antes de comparar contra el stock).
  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + item.quantity
    );
  }

  for (const [productId, totalQty] of quantityByProduct) {
    const dbProduct = productMap.get(productId);
    if (!dbProduct) {
      throw new CheckoutError(
        'Uno de los productos de tu carrito ya no está disponible en el catálogo.',
        404
      );
    }
    // PRD-025: rechazar productos despublicados (soft-deleted) antes de descontar
    // stock o calcular totales. El mensaje nombra el producto para que el cliente
    // pueda retirarlo del carrito y completar la compra con el resto.
    if (!dbProduct.isActive) {
      throw new CheckoutError(
        `"${dbProduct.name}" ya no está disponible en el catálogo. ` +
          'Por favor retíralo de tu carrito e intenta de nuevo.',
        404
      );
    }
    // La disponibilidad de stock se valida SIEMPRE, en ambos modos.
    // En modo WhatsApp (deductStock=false) esta comprobación es informativa:
    // no descuenta nada aquí, solo evita crear pedidos que no se podrán surtir.
    // El descuento definitivo del modo WhatsApp ocurre en validateOrderPayment(),
    // que vuelve a comprobar el stock de forma atómica dentro de su transacción.
    if (dbProduct.stock < totalQty) {
      throw new CheckoutError(
        `Stock insuficiente para "${dbProduct.name}". ` +
          `Solicitado: ${totalQty}, disponible: ${dbProduct.stock}.`,
        409
      );
    }
  }

  const [paymentMethods, paymentSettings] = await Promise.all([
    loadPaymentMethodsFromTransaction(tx),
    loadPaymentSettingsSliceFromTransaction(tx),
  ]);

  let resolvedPaymentMethod: PaymentMethodConfig;
  let paymentDiscountPercent = 0;
  let resolvedPaymentCurrency: string | null = null;

  try {
    const resolved = resolveAndValidatePaymentMethod({
      methods: paymentMethods,
      paymentMethodId,
      channel: effectiveChannel,
      shippingMethod,
      paymentCurrency,
      paymentReference: effectivePaymentReference,
      paymentUploadToken: effectivePaymentUploadToken,
      settings: paymentSettings,
    });
    resolvedPaymentMethod = resolved.method;
    paymentDiscountPercent = resolved.paymentDiscountPercent;
    resolvedPaymentCurrency = resolved.resolvedPaymentCurrency;
  } catch (err) {
    if (err instanceof PaymentMethodValidationError) {
      throw new CheckoutError(err.message, 400);
    }
    throw err;
  }

  const orderStatus: OrderStatus =
    options?.orderStatus ??
    (effectiveChannel === 'web' && resolvedPaymentMethod.kind === 'BINANCE'
      ? 'Pendiente verificación Binance'
      : 'Pendiente');

  // SESIÓN 05 (CORREGIDO): validar token de upload y resolver la key desde PaymentUpload.objectKey.
  // El cliente no puede elegir paymentProofKey; la key se deriva exclusivamente en el servidor.
  let resolvedPaymentUploadId: string | null = null;
  let resolvedPaymentProofKey: string | null = null;

  const isRegisteredUser = customerId && customerId !== 'guest';

  if (effectivePaymentUploadToken?.trim()) {
    const uploadTokenHash = hashToken(effectivePaymentUploadToken.trim());

    const uploadRecord = await tx.paymentUpload.findUnique({
      where: {
        tokenHash: uploadTokenHash,
      },
      select: {
        id: true,
        objectKey: true,
        status: true,
        expiresAt: true,
        userId: true,
        orderId: true,
      },
    });

    if (!uploadRecord) {
      throw new CheckoutError('Token de subida inválido.', 400);
    }

    if (uploadRecord.status !== 'PENDING') {
      throw new CheckoutError(
        'El comprobante está siendo procesado o ya fue utilizado.',
        409,
      );
    }

    if (uploadRecord.expiresAt <= new Date()) {
      throw new CheckoutError(
        'La sesión de subida expiró. Sube nuevamente el comprobante.',
        410,
      );
    }

    if (!uploadRecord.objectKey || uploadRecord.orderId) {
      throw new CheckoutError(
        'El comprobante no está disponible para este pedido.',
        409,
      );
    }

    if (
      isRegisteredUser &&
      uploadRecord.userId &&
      uploadRecord.userId !== customerId
    ) {
      throw new CheckoutError(
        'El comprobante no pertenece a esta sesión.',
        403,
      );
    }

    assertProofKey(uploadRecord.objectKey);

    resolvedPaymentUploadId = uploadRecord.id;
    resolvedPaymentProofKey = uploadRecord.objectKey;
  }

  const rate = await loadExchangeRateUsdBsFromTx(tx);

  // Política de redondeo (PRD-201): el precio unitario se congela en Bs con 2
  // decimales y el total del pedido es EXACTAMENTE la suma de las líneas
  // (precio_línea × cantidad), acumulada en céntimos enteros para evitar
  // deriva de coma flotante. Así sum(items) === Order.total siempre.
  let subtotalBeforeDiscountCents = 0;
  let subtotalUsd = 0;
  for (const item of items) {
    const p = productMap.get(item.productId)!;
    // PRD-204: p.price es Decimal en BD — convertir a number antes de aritmética.
    const priceNum = d(p.price);
    const unitVes = roundMoney2(priceNum * rate);
    subtotalBeforeDiscountCents += Math.round(unitVes * 100) * item.quantity;
    subtotalUsd += priceNum * item.quantity;
  }
  subtotalUsd = roundMoney2(subtotalUsd);

  // Beneficio freeShipping (solo MRW): SIEMPRE se recalcula aquí, dentro de la
  // misma transacción, con los valores reales de `dbProducts`. Nunca se
  // aceptan flags del cliente — `items` (validado por orderItemSchema) no
  // tiene `freeShipping`, así que no hay nada que "confiar" del frontend.
  // Product.freeShipping = elegible para envío gratis exclusivamente por MRW.
  // ZOOM/TEALCA siempre DESTINATION_CHARGE; tienda siempre STORE_PICKUP.
  // `productIds` es el set único; cada producto pesa una vez en la regla
  // "TODOS califican" (MRW), sin importar cuántas líneas del carrito lo repitan.
  const authoritativeFreeShippingByProduct = new Map(
    dbProducts.map((p) => [p.id, p.freeShipping === true]),
  );
  const authoritativeFreeShippingFlags = productIds.map(
    (productId) => authoritativeFreeShippingByProduct.get(productId) === true,
  );
  const shippingChargeType = resolveShippingChargeType(
    shippingMethod,
    authoritativeFreeShippingFlags,
  );
  const orderHasFreeShipping = shippingChargeType === 'FREE';

  let resolvedCustomerEmail = customerEmail?.trim() || null;
  if (isRegisteredUser && !resolvedCustomerEmail) {
    const dbUser = await tx.user.findUnique({
      where: { id: customerId },
      select: { email: true },
    });
    resolvedCustomerEmail = dbUser?.email?.trim() || null;
  }

  // Cupón: validar y calcular descuento SIEMPRE en el servidor (precios de BD).
  // Si el cupón dejó de ser válido entre el carrito y el commit, se aborta el
  // pedido para no cobrar de más sin avisar al cliente (PRD-132: el canje
  // atómico posterior re-verifica maxUses dentro de esta misma transacción).
  let appliedCouponCode: string | null = null;
  let couponDiscountCents = 0;
  let couponToRedeem: {
    couponId: string;
    maxUses: number | null;
    perUserLimit: number | null;
  } | null = null;
  if (couponCode && couponCode.trim()) {
    const result = await validateCouponForCheckout(
      tx,
      couponCode,
      subtotalUsd,
      customerId ?? null,
      resolvedCustomerEmail
    );
    if (!result.ok) {
      const status = result.reason === COUPON_PER_USER_LIMIT_REASON ? 409 : 400;
      throw new CheckoutError(`Cupón no válido: ${result.reason}`, status);
    }
    couponDiscountCents = Math.min(
      Math.round(roundMoney2(result.discountUsd * rate) * 100),
      subtotalBeforeDiscountCents,
    );
    appliedCouponCode = result.coupon.code;
    couponToRedeem = {
      couponId: result.coupon.id,
      maxUses: result.coupon.maxUses,
      perUserLimit: result.coupon.perUserLimit,
    };
  }

  const paymentDiscountCents = calculatePaymentDiscountCents(
    subtotalBeforeDiscountCents,
    paymentDiscountPercent,
  );
  const finalTotalCents = Math.max(
    0,
    subtotalBeforeDiscountCents - paymentDiscountCents - couponDiscountCents,
  );

  const subtotalBeforeDiscount = subtotalBeforeDiscountCents / 100;
  const paymentDiscountBs = paymentDiscountCents / 100;
  const couponDiscountBs = couponDiscountCents / 100;
  const finalTotal = finalTotalCents / 100;

  const newOrder = await tx.order.create({
    data: {
      customer: isRegisteredUser ? { connect: { id: customerId } } : undefined,
      customerName,
      customerEmail: resolvedCustomerEmail,
      customerPhone: customerPhone ?? null,
      customerIdNumber: customerIdNumber ?? null,
      total: finalTotal,
      channel: effectiveChannel,
      stockDeducted: deductStock,
      freeShipping: orderHasFreeShipping,
      couponCode: appliedCouponCode,
      couponDiscount: couponDiscountBs > 0 ? couponDiscountBs : null,
      exchangeRateUsdBs: rate,
      status: orderStatus,
      paymentMethodId: resolvedPaymentMethod.id,
      paymentMethod: resolvedPaymentMethod.name,
      paymentCurrency: resolvedPaymentCurrency,
      subtotalBeforeDiscount,
      paymentDiscountPercent:
        paymentDiscountPercent > 0 ? paymentDiscountPercent : null,
      paymentDiscount: paymentDiscountBs > 0 ? paymentDiscountBs : null,
      paymentBank: paymentBank ?? null,
      paymentHolderIdNumber: paymentHolderIdNumber ?? null,
      paymentHolderPhone: paymentHolderPhone ?? null,
      paymentReference: effectivePaymentReference,
      paymentProofUrl: null,
      paymentProofKey: resolvedPaymentProofKey,
      // SESIÓN 06: token de acceso guest (solo para pedidos sin cuenta)
      guestAccessTokenHash: effectiveAccessTokenHash,
      guestAccessTokenExpiresAt: effectiveAccessTokenExpiresAt,
      shippingAddress: shippingDetails.address,
      shippingCity: shippingDetails.city,
      shippingState: shippingDetails.state,
      shippingZipCode: shippingDetails.zipCode,
      shippingCountry: shippingDetails.country,
      items: {
        create: items.map((item) => {
          const p = productMap.get(item.productId)!;
          const unitVes = roundMoney2(d(p.price) * rate);
          return {
            productId: item.productId,
            productName: p.name,
            quantity: item.quantity,
            price: unitVes,
            imageUrl: item.imageUrl ?? null,
            // Snapshot individual: elegible para beneficio MRW (no implica
            // que ZOOM/TEALCA sean gratis). Independiente del agregado del
            // pedido (carrito mixto: líneas true y false).
            freeShipping: p.freeShipping === true,
          };
        }),
      },
    },
    include: { items: true },
  });

  // SESIÓN 05 (CORREGIDO): vincular PaymentUpload al pedido (LINKED) con updateMany condicional.
  // Si el update falla (ya fue usado por otro pedido), revierte toda la transacción.
  if (resolvedPaymentUploadId) {
    const linked = await tx.paymentUpload.updateMany({
      where: {
        id: resolvedPaymentUploadId,
        status: 'PENDING',
        objectKey: resolvedPaymentProofKey,
        orderId: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'LINKED',
        orderId: newOrder.id,
      },
    });

    if (linked.count !== 1) {
      throw new CheckoutError(
        'El comprobante ya fue utilizado por otro pedido.',
        409,
      );
    }
  }

  // Canje atómico del cupón (incrementa usedCount respetando maxUses) tras crear
  // el pedido, dentro de la misma transacción.
  if (couponToRedeem) {
    try {
      await redeemCouponInTransaction(tx, {
        couponId: couponToRedeem.couponId,
        maxUses: couponToRedeem.maxUses,
        perUserLimit: couponToRedeem.perUserLimit,
        orderId: newOrder.id,
        userId: customerId ?? null,
        discountBs: couponDiscountBs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === COUPON_PER_USER_LIMIT_REASON) {
        throw new CheckoutError(`Cupón no válido: ${msg}`, 409);
      }
      if (msg === COUPON_GENERIC_INVALID_REASON) {
        throw new CheckoutError(`Cupón no válido: ${msg}`, 409);
      }
      throw err;
    }
  }

  // Solo descontar stock si deductStock es true (modo full).
  // En modo WhatsApp el stock se descuenta al confirmar el pago (validateOrderPayment).
  if (deductStock) {
    await deductOrderStockInTransaction(tx, items, productMap);
  }

  return { order: newOrder, paymentMethod: resolvedPaymentMethod };
}

/** Recalcula total en servidor, crea pedido y descuenta stock atómicamente. */
export async function executeCheckoutInTransaction(
  tx: Prisma.TransactionClient,
  input: CheckoutInput,
  options?: CheckoutExecuteOptions,
) {
  const { order } = await executeCheckoutInTransactionWithMethod(tx, input, options);
  return order;
}

/**
 * Descuenta el stock atómicamente por producto, con guard `stock >= cantidad`
 * para evitar condiciones de carrera con otros checkouts concurrentes.
 * Lanza CheckoutError 409 si no hay stock suficiente de algún producto.
 */
export async function deductOrderStockInTransaction(
  tx: Prisma.TransactionClient,
  items: { productId: string; quantity: number }[],
  productMap?: Map<string, { name: string }>,
): Promise<void> {
  // Cantidad TOTAL solicitada por producto (un mismo productId puede venir en
  // varias líneas; hay que sumarlas antes de comparar contra el stock).
  const quantityByProduct = new Map<string, number>();
  for (const item of items) {
    quantityByProduct.set(
      item.productId,
      (quantityByProduct.get(item.productId) ?? 0) + item.quantity
    );
  }

  for (const [productId, totalQty] of quantityByProduct) {
    const result = await tx.product.updateMany({
      where: { id: productId, stock: { gte: totalQty } },
      data: { stock: { decrement: totalQty } },
    });
    if (result.count === 0) {
      const p = productMap?.get(productId);
      throw new CheckoutError(
        p
          ? `Stock insuficiente para "${p.name}" al confirmar la compra. ` +
            `Otro pedido puede haber reservado las últimas unidades.`
          : `Stock insuficiente para el producto "${productId}" al confirmar la compra.`,
        409
      );
    }
  }
}

/**
 * Devuelve al inventario las unidades de un pedido cuyo stock fue descontado en
 * el checkout (todos los métodos descuentan stock al confirmar). Usa `updateMany`
 * por producto para no fallar si algún producto fue eliminado del catálogo.
 *
 * Debe llamarse SOLO al cancelar/eliminar un pedido cuyo inventario seguía
 * reservado (ver `shouldRestoreStockOnCancel`), para evitar restauraciones
 * duplicadas o de mercancía ya despachada.
 */
export async function restoreOrderStockInTransaction(
  tx: Prisma.TransactionClient,
  items: { productId: string; quantity: number }[]
): Promise<void> {
  for (const item of items) {
    const result = await tx.product.updateMany({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
    if (result.count === 0) {
      // PRD-218: el producto fue eliminado del catálogo — la cancelación no puede
      // devolver estas unidades. Se registra para auditoría de inventario.
      // DEPENDENCIA-05 (PRD-231): deleteProductAction debería bloquear/avisar al
      // eliminar productos con pedidos abiertos.
      logWarn('checkout_restore_stock_product_missing', {
        operation: 'restore_stock_on_cancel',
        count: item.quantity,
      });
    }
  }
}

export type CancellationEffectsOptions = {
  /**
   * Status que debe tener la fila en BD al reclamar `stockDeducted` (updateMany
   * condicional). Por defecto = `order.status`. Usar `'Cancelado'` cuando la
   * transición a Cancelado ya se hizo en la misma tx (cron / rechazo de pago).
   */
  stockClaimStatus?: OrderStatus | string;
};

/**
 * Efectos colaterales de cancelar un pedido, en UNA transacción:
 *  - reclama atómicamente `stockDeducted: true → false` y restaura inventario
 *    solo si el claim gana (idempotente ante cancelaciones concurrentes);
 *  - revierte el canje del cupón (PRD-190) de forma idempotente.
 * Usar en TODA ruta que cancele o elimine pedidos.
 */
export async function applyOrderCancellationEffectsInTransaction(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    status: OrderStatus | string;
    items: { productId: string; quantity: number }[];
    stockDeducted?: boolean | null;
  },
  options?: CancellationEffectsOptions,
): Promise<{ stockRestored: boolean }> {
  let stockRestored = false;

  // Solo restaurar stock si el estado de origen lo amerita y el pedido lo tenía
  // descontado (stockDeducted !== false). WhatsApp (false) nunca descontó.
  const shouldRestore =
    shouldRestoreStockOnCancel(order.status, 'Cancelado') &&
    order.stockDeducted !== false;

  if (shouldRestore) {
    const claimStatus = options?.stockClaimStatus ?? order.status;
    // Claim atómico: solo un caller concurrente gana stockDeducted true → false.
    const claim = await tx.order.updateMany({
      where: {
        id: order.id,
        status: claimStatus,
        stockDeducted: true,
      },
      data: {
        stockDeducted: false,
      },
    });

    if (claim.count === 1) {
      await restoreOrderStockInTransaction(tx, order.items);
      stockRestored = true;
    }
    // claim.count === 0 → reintento/concurrencia/no-op: no incrementar inventario.
  }

  await revertCouponRedemptionInTransaction(tx, order.id);
  return { stockRestored };
}

/**
 * Estados cuyo inventario sigue reservado dentro de la tienda: cancelar desde
 * aquí SÍ devuelve unidades al stock.
 */
const STOCK_RESTORABLE_FROM: readonly OrderStatus[] = [
  'Pendiente verificación Binance',
  'Pendiente',
  'En Proceso',
];

/**
 * ¿Debe restaurarse el stock al pasar `from` → `to`?
 *
 * PRD-002: SOLO se restaura cuando el pedido aún no salió de la tienda
 * (`Pendiente verificación Binance`, `Pendiente`, `En Proceso`).
 * `Enviado` NO restaura: la mercancía está en tránsito con el courier; si el
 * paquete regresa, el reingreso se hace manualmente al recibirlo.
 * `Entregado` y `Cancelado` tampoco (ya está con el cliente / idempotencia).
 */
export function shouldRestoreStockOnCancel(
  from: OrderStatus | string,
  to: OrderStatus | string
): boolean {
  return to === 'Cancelado' && STOCK_RESTORABLE_FROM.includes(from as OrderStatus);
}
