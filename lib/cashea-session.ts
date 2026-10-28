/**
 * lib/cashea-session.ts — lógica reutilizable de POST /api/cashea/session
 * (Fase 4, ver "Fase 4 — Endpoint backend de creación de sesión Cashea" en
 * docs/cashea-orquestacion.md).
 *
 * El guard del flag (`CASHEA_ENABLED` → 404 si está apagado) y los guards de
 * seguridad compartidos con el checkout actual (CSRF/origen, rate limit,
 * autenticación) viven en la ruta `app/api/cashea/session/route.ts` — este
 * módulo asume que ya se validó que Cashea está habilitado y que hay una
 * sesión autenticada real (Cashea NUNCA permite invitados, en ningún modo —
 * Sección 1/7 del documento maestro).
 *
 * Reutiliza EXACTAMENTE la misma transacción Serializable y el mismo cálculo
 * autoritativo de precios/stock de `lib/checkout-order.ts` — solo añade los
 * campos Cashea (`casheaStatus`, reserva, token) con un `update` adicional
 * dentro de la misma transacción, sin tocar la lógica base del checkout.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  checkoutSchema,
  executeCheckoutInTransactionWithMethod,
  type CheckoutInput,
} from '@/lib/checkout-order';
import { CheckoutError } from '@/lib/checkout-error';
import { CHECKOUT_MODE } from '@/lib/checkout-mode';
import { getCasheaConfig, type CasheaConfig } from '@/lib/cashea-config';
import {
  buildCasheaPayload,
  type CasheaPayload,
  type CasheaProduct,
  type InternalDeliveryMethod,
} from '@/lib/cashea';
import { hashToken } from '@/lib/security';
import { d, dn } from '@/lib/decimal';
import { roundMoney2 } from '@/lib/exchange-rate';
import { emailSiteBaseUrl } from '@/emails/transactional/site';
import { logInfo } from '@/lib/safe-logger';
import { checkoutOperationKey, checkoutPayloadHash, checkoutCapability } from '@/lib/checkout-idempotency';
import { readSettings } from '@/lib/data-store';
import { assertBuyerReservationCapacity } from '@/lib/order-reservation';

const CASHEA_SESSION_TX_MAX_RETRIES = 3;

export type CreateCasheaSessionInput = {
  userId: string;
  body: unknown;
};

export type CreateCasheaSessionResult = {
  orderId: string;
  publicApiKey: string;
  payload: CasheaPayload;
  returnToken: string;
};

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** Reintenta transacciones ante conflictos de serialización de Postgres (P2034 / 40001). */
function isSerializationFailure(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    if (['P2034', 'P2002'].includes((error as { code: string }).code)) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('40001') || message.includes('could not serialize');
}

async function runCasheaSessionTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < CASHEA_SESSION_TX_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isSerializationFailure(error) && attempt < CASHEA_SESSION_TX_MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }
  throw new Error('Cashea session transaction retries exhausted');
}

/** `redirectUrl` apunta al token opaco — NUNCA al idNumber de Cashea (Sección 3.9). */
function buildRedirectUrl(returnToken: string): string {
  const base = emailSiteBaseUrl().replace(/\/$/, '');
  return `${base}/checkout/cashea/return?token=${returnToken}`;
}

/**
 * Convierte los `OrderItem` ya persistidos (precio congelado en Bs — política
 * de redondeo de `lib/checkout-order.ts`) a `CasheaProduct[]`. Deriva el
 * precio unitario dividiendo por la tasa congelada del pedido — nunca vuelve
 * a leer precios "en vivo" del catálogo, para no desalinear un pedido que ya
 * quedó creado en BD.
 *
 * TODO(Sección 12, preguntas 1/2): la moneda/formato exacto que espera Cashea
 * (`config.currency`, hoy placeholder `USD` sin confirmar) puede requerir
 * ajustar esta conversión en la Fase 10 (activación), cuando Cashea confirme
 * si espera USD/VES y decimales o unidades mínimas.
 */
function buildCasheaProducts(
  order: OrderWithItems,
  productExtrasById: Map<string, { sku: string | null; imageUrl: string | null }>,
): CasheaProduct[] {
  const rate = dn(order.exchangeRateUsdBs);
  return order.items.map((item) => {
    const priceBs = d(item.price);
    const priceUsd = rate != null && rate > 0 ? roundMoney2(priceBs / rate) : roundMoney2(priceBs);
    const extras = productExtrasById.get(item.productId);
    return {
      id: item.productId,
      name: item.productName,
      sku: extras?.sku?.trim() || item.productId,
      description: '',
      imageUrl: item.imageUrl || extras?.imageUrl || '',
      quantity: item.quantity,
      price: priceUsd,
      tax: 0,
      // Cupones prohibidos con Cashea (Sección 1/7): nunca hay descuento aquí.
      discount: 0,
    };
  });
}

/**
 * Lógica reutilizable de `POST /api/cashea/session`. Valida la entrada,
 * recalcula todo desde BD (reutilizando `executeCheckoutInTransactionWithMethod`),
 * crea el pedido local + reserva de inventario dentro de la MISMA transacción
 * Serializable, genera el token de retorno de un solo uso y arma el payload
 * del SDK con `buildCasheaPayload` (lib/cashea.ts).
 */
export async function createCasheaSession(
  input: CreateCasheaSessionInput,
): Promise<CreateCasheaSessionResult> {
  const parsed = checkoutSchema.safeParse(input.body);
  if (!parsed.success) {
    throw new CheckoutError('Datos de pedido inválidos.', 400);
  }
  const data = parsed.data;

  // Este endpoint es exclusivo del método Cashea — cualquier otro método
  // debe usar POST /api/orders.
  if (data.paymentMethodId !== 'cashea') {
    throw new CheckoutError('Este endpoint es exclusivo del método de pago Cashea.', 422);
  }
  // Cupones prohibidos con Cashea (Sección 1/7).
  if (data.couponCode?.trim()) {
    throw new CheckoutError('Los cupones no están permitidos con el método Cashea.', 422);
  }
  const identificationNumber = data.customerIdNumber?.trim();
  if (!identificationNumber) {
    throw new CheckoutError('Cashea requiere tu número de identificación (cédula/RIF).', 422);
  }
  if (!data.shippingMethod) {
    throw new CheckoutError('Selecciona un método de envío para continuar con Cashea.', 422);
  }

  const config: CasheaConfig = getCasheaConfig();
  if (!config.publicApiKey) {
    // No debería ocurrir: getCasheaConfig() ya exige NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY
    // cuando enabled=true. Falla ruidosamente en vez de responder con datos parciales.
    throw new Error('[cashea-session] NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY no está configurada.');
  }

  // El canal sigue el CHECKOUT_MODE actual del servidor (Sección "Fase 4",
  // punto 7) — nunca el valor enviado por el cliente.
  const effectiveChannel: CheckoutInput['channel'] = CHECKOUT_MODE === 'whatsapp' ? 'whatsapp' : 'web';
  const safeData: CheckoutInput = {
    ...data,
    customerId: input.userId,
    channel: effectiveChannel,
  };

  if (safeData.shippingMethod === 'tienda') {
    const settings = await readSettings();
    safeData.shippingDetails = { ...safeData.shippingDetails, address: `Retiro en tienda ${settings.storeName} — ${settings.address}` };
  }
  const operationKey = checkoutOperationKey(`user:${input.userId}`, safeData.attemptKey);
  const payloadHash = checkoutPayloadHash(safeData);
  const returnToken = checkoutCapability('cashea', operationKey);
  const returnTokenHash = hashToken(returnToken);
  const redirectUrl = buildRedirectUrl(returnToken);

  const { order, reused } = await runCasheaSessionTransaction(async (tx) => {
    const duplicate = await tx.order.findUnique({ where: { checkoutAttemptKey: operationKey }, include: { items: true } });
    if (duplicate) {
      if (duplicate.checkoutPayloadHash !== payloadHash || !['CREATED', 'REDIRECTED'].includes(duplicate.casheaStatus ?? '') || !duplicate.casheaReservationExpiresAt || duplicate.casheaReservationExpiresAt <= new Date()) throw new CheckoutError('El intento Cashea cambió o venció; revisa tu pedido antes de crear otro.', 409);
      return { order: duplicate, reused: true as const };
    }
    await assertBuyerReservationCapacity(tx, input.userId, safeData.items);

    const { order: created } = await executeCheckoutInTransactionWithMethod(tx, safeData, {
      orderStatus: 'Pendiente',
      checkoutAttemptKey: operationKey,
      checkoutPayloadHash: payloadHash,
      // Cashea SIEMPRE reserva inventario real (Sección 1/3), a diferencia
      // del modo WhatsApp normal (deductStock=false).
      deductStock: true,
    });

    const reservationExpiresAt = new Date(Date.now() + config.reservationMinutes * 60_000);
    const withCashea = await tx.order.update({
      where: { id: created.id },
      data: {
        casheaStatus: 'CREATED',
        casheaReservationExpiresAt: reservationExpiresAt,
        casheaCurrency: config.currency,
        casheaReturnTokenHash: returnTokenHash,
      },
      include: { items: true },
    });

    return { order: withCashea, reused: false as const };
  });

  if (reused) {
    logInfo('cashea_session_duplicate_prevented', {
      operation: 'cashea_session',
      orderId: order.id,
    });
  }

  const productIds = [...new Set(order.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, images: true },
  });
  const productExtrasById = new Map(
    products.map((p) => [p.id, { sku: p.sku, imageUrl: p.images?.[0] ?? null }]),
  );

  const casheaProducts = buildCasheaProducts(order, productExtrasById);

  const payload = buildCasheaPayload({
    identificationNumber,
    invoiceId: order.id,
    redirectUrl,
    shippingMethod: data.shippingMethod as InternalDeliveryMethod,
    products: casheaProducts,
  });

  return {
    orderId: order.id,
    publicApiKey: config.publicApiKey,
    payload,
    returnToken,
  };
}
