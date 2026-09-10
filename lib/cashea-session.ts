/**
 * lib/cashea-session.ts — lógica reutilizable de POST /api/cashea/session
 * (Fase 4, ver "Fase 4 — Endpoint backend de creación de sesión Cashea" en
 * docs/MundoTech-Cashea-Orquestacion-Cursor.md).
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

import { randomBytes } from 'crypto';
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
import { emailSiteBaseUrl } from '@/emails/mundotech/site';
import { logInfo } from '@/lib/safe-logger';

const CASHEA_SESSION_TX_MAX_RETRIES = 3;

/**
 * Ventana anti doble-submit (Fase 4, punto 11 del documento de orquestación):
 * Cashea no tiene una referencia de pago propia (a diferencia de Pago
 * Móvil/Binance), así que la clave de idempotencia es (usuario + carrito)
 * dentro de una ventana corta — evita crear dos pedidos y dos reservas de
 * stock si el usuario hace doble clic o la petición se reintenta.
 */
const CASHEA_DUPLICATE_WINDOW_MS = 10_000;

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
    if ((error as { code: string }).code === 'P2034') return true;
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

/** Clave estable (productId → cantidad total) para comparar carritos, sin importar el orden de las líneas. */
function normalizeItemKey(items: { productId: string; quantity: number }[]): string {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }
  return JSON.stringify([...totals.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Busca un pedido Cashea `CREATED` reciente del mismo usuario con el mismo
 * carrito. Si existe, el caller reutiliza el pedido en vez de crear uno
 * nuevo (anti doble-submit — Fase 4, punto 11).
 */
async function findRecentCasheaSessionInTransaction(
  tx: Prisma.TransactionClient,
  params: { customerId: string; items: { productId: string; quantity: number }[] },
): Promise<OrderWithItems | null> {
  const since = new Date(Date.now() - CASHEA_DUPLICATE_WINDOW_MS);
  const candidates = await tx.order.findMany({
    where: {
      customerId: params.customerId,
      paymentMethodId: 'cashea',
      casheaStatus: 'CREATED',
      createdAt: { gte: since },
    },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const incomingKey = normalizeItemKey(params.items);
  return (
    candidates.find(
      (candidate) =>
        normalizeItemKey(
          candidate.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        ) === incomingKey,
    ) ?? null
  );
}

/** Token de retorno de un solo uso: 32 bytes aleatorios; solo el hash se persiste (Sección 3.6/5). */
function buildCasheaReturnToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashToken(rawToken) };
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

  const { rawToken: returnToken, tokenHash: returnTokenHash } = buildCasheaReturnToken();
  const redirectUrl = buildRedirectUrl(returnToken);

  const { order, reused } = await runCasheaSessionTransaction(async (tx) => {
    const duplicate = await findRecentCasheaSessionInTransaction(tx, {
      customerId: input.userId,
      items: data.items,
    });

    if (duplicate) {
      // Doble submit: NO se crea un segundo pedido ni se reserva stock otra
      // vez. Se rota el token de retorno — el anterior nunca fue consumido
      // (el pedido sigue en CREATED) — para que la respuesta siga siendo
      // utilizable por el cliente sin duplicar nada en BD.
      const rotated = await tx.order.update({
        where: { id: duplicate.id },
        data: { casheaReturnTokenHash: returnTokenHash },
        include: { items: true },
      });
      return { order: rotated, reused: true as const };
    }

    const { order: created } = await executeCheckoutInTransactionWithMethod(tx, safeData, {
      orderStatus: 'Pendiente',
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
