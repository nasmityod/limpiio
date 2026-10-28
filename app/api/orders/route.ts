import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prismaOrderToOrder, toGuestOrderConfirmationDto } from '@/lib/definitions';
import {
  checkoutSchema,
  executeCheckoutInTransactionWithMethod,
  findRecentDuplicateOrderInTransaction,
} from '@/lib/checkout-order';
import { CheckoutError } from '@/lib/checkout-error';
import { readSettings } from '@/lib/data-store';
import { isValidWhatsAppPhone, normalizeWhatsAppPhone } from '@/lib/whatsapp-phone';
import { markCartRecovered } from '@/lib/abandoned-cart';
import { sendOrderConfirmationEmail } from '@/lib/resend';
import { buildOrderConfirmationPayload } from '@/lib/order-confirmation-payload';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, buildRateLimitedResponse, safeZodIssues } from '@/lib/security';
import { hashToken } from '@/lib/security';
import { CHECKOUT_MODE, isWhatsAppCheckout } from '@/lib/checkout-mode';
import { buildOrderListWhere, buildOrderSearchWhere } from '@/lib/orders/order-list-filters';
import { computeTabCounts, parseOrderTab } from '@/lib/orders/order-tabs';
import {
  decodeOrderCursor,
  encodeOrderCursor,
  orderCursorWhere,
} from '@/lib/orders/order-cursor';
import { logError, logWarn } from '@/lib/safe-logger';
import { checkoutOperationKey, checkoutPayloadHash, checkoutCapability } from '@/lib/checkout-idempotency';
import { assertBuyerReservationCapacity } from '@/lib/order-reservation';
import { isCasheaEnabled } from '@/lib/cashea-config';

type CheckoutEmailOrder = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** Queue the confirmation with the order/stock commit; no provider I/O occurs here. */
async function queueCheckoutConfirmation(tx: Prisma.TransactionClient, order: CheckoutEmailOrder, guestToken: string | null): Promise<void> {
  let recipientEmail = order.customerEmail?.trim() ?? '';
  if (!recipientEmail && order.customerId) {
    const u = await tx.user.findUnique({
      where: { id: order.customerId },
      select: { email: true },
    });
    recipientEmail = u?.email?.trim() ?? '';
  }

  if (recipientEmail) {
    const productIds = [...new Set(order.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        slug: true,
        images: true,
        media: {
          where: { type: 'IMAGE' },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    });
    const confirmationPayload = buildOrderConfirmationPayload(order, recipientEmail, products, guestToken);

    await queueTransactionalEmails(tx, () => sendOrderConfirmationEmail(confirmationPayload));
  } else {
    logWarn('order_confirmation_skipped_no_email', { orderId: order.id, operation: 'send_confirmation' });
  }

}

const CHECKOUT_TX_MAX_RETRIES = 3;
/** SEC-2026-09 (#7): pedidos `Pendiente` sin pago que una cuenta puede tener abiertos a la vez (modo full). */

/** Reintenta transacciones ante conflictos de serialización de Postgres (P2034 / 40001). */
function isSerializationFailure(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    if (['P2034', 'P2002'].includes((error as { code: string }).code)) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('40001') || message.includes('could not serialize');
}

async function runCheckoutTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < CHECKOUT_TX_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isSerializationFailure(error) && attempt < CHECKOUT_TX_MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }
  throw new Error('Checkout transaction retries exhausted');
}

/**
 * PRD-195: GET /api/orders con paginación por cursor.
 * - SESIÓN 13: `?limit=N` es obligatorio. Sin limit se rechaza.
 *   El panel /admin/stats ahora usa /api/admin/stats (agregado server-side).
 *
 * - Con ?limit=N: devuelve { orders: [...], nextCursor: string | null }.
 * - Con ?limit=N&cursor=lastId: devuelve la página siguiente.
 */
export async function GET(request: Request) {
  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');

    // SESIÓN 13: limit es obligatorio. Usar /api/admin/stats para agregados.
    if (limitParam === null) {
      return NextResponse.json(
        { message: 'Parámetro limit requerido. Usa /api/admin/stats para estadísticas agregadas.' },
        { status: 400 },
      );
    }

    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200);
    const cursor = searchParams.get('cursor') ?? undefined;
    const tab = parseOrderTab(searchParams.get('tab'), searchParams.get('status'));
    const q = searchParams.get('q') ?? '';
    const where = await buildOrderListWhere(tab, q);

    const cursorRaw = cursor ?? undefined;
    let pageWhere: Awaited<ReturnType<typeof buildOrderListWhere>>;
    if (cursorRaw) {
      const decodedCursor = decodeOrderCursor(cursorRaw);
      if (decodedCursor == null) {
        return NextResponse.json({ message: 'Cursor inválido.' }, { status: 400 });
      }
      pageWhere = { AND: [where, orderCursorWhere(decodedCursor)] };
    } else {
      pageWhere = where;
    }

    const countsWhere = q.trim() ? await buildOrderSearchWhere(q) : {};

    const [orders, total, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where: pageWhere,
        take: limit + 1,
        include: { items: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['status'],
        where: countsWhere,
        _count: { _all: true },
      }),
    ]);

    const hasNextPage = orders.length > limit;
    const page = hasNextPage ? orders.slice(0, limit) : orders;
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasNextPage && lastRow != null
        ? encodeOrderCursor({ createdAt: lastRow.createdAt, id: lastRow.id })
        : null;

    return NextResponse.json({
      orders: page.map(prismaOrderToOrder),
      nextCursor,
      total,
      counts: computeTabCounts(statusGroups),
    });
  } catch (error) {
    logError('orders_get_failed', error, { route: '/api/orders' });
    return NextResponse.json(
      { message: 'Error al obtener los pedidos.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/orders — checkout atómico.
 *
 * El customerId del body es ignorado: siempre se usa session.user.id
 * del servidor para evitar que un cliente vincule un pedido al ID de
 * otra cuenta.
 *
 * FASE 4.1 (MEJORA 1.2): checkout INVITADO permitido de forma controlada —
 * sin sesión, el pedido exige email + teléfono + cédula de contacto (el pago
 * se verifica manualmente en admin, lo que mitiga el fraude). Se mantienen
 * verifySameOrigin, rate limit por IP (+ por email para guests), Zod y la
 * transacción serializable intacta. PRD-069 queda sustituido por esta política.
 *
 * Binance Pay: el pedido inicia como "Pendiente verificación Binance".
 * El stock se descuenta atómicamente en esta misma transacción (`updateMany`
 * con `stock >= cantidad`). `approve-binance` verifica el pago en UN paso
 * (→ "En Proceso" + `paidAt`); al cancelar se restaura inventario cuando el
 * pedido seguía con stock reservado (ver `shouldRestoreStockOnCancel`).
 */
export async function POST(request: Request) {
  // Mitigación CSRF: peticiones de navegador desde otro origen se rechazan
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const ip = getClientIp(request);
  const ipResult = await rateLimitCritical(`orders:post:ip:${hashForBucket(ip)}`, { limit: 5, windowMs: 60_000 });
  if (ipResult.limited) {
    return buildRateLimitedResponse(ipResult.retryAfterSeconds,
      'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.');
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Guest solo en whatsapp / auth obligatoria en full: en full, un POST sin
  // sesión se rechaza ANTES de leer el body — nunca debe llegar un guest.
  if (!isWhatsAppCheckout && !userId) {
    return NextResponse.json(
      { message: 'Debes iniciar sesión para completar la compra.' },
      { status: 401 },
    );
  }

  const isGuest = isWhatsAppCheckout && !userId;

  if (!isGuest && (await rateLimitCritical(`orders:post:user:${hashForBucket(userId!)}`, { limit: 5, windowMs: 60_000 })).limited) {
    return buildRateLimitedResponse(60,
      'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.');
  }

  try {
    const body = await request.json();
    // Forzar el canal desde el servidor — no confiar en el cliente.
    const channel = CHECKOUT_MODE === 'whatsapp' ? 'whatsapp' : 'web';
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CheckoutError('Datos de pedido inválidos.', 400);
    body.channel = channel;
    body.attemptKey = request.headers.get('Idempotency-Key') || body.attemptKey;
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      logWarn('checkout_validation_failed', { status: 400, route: '/api/orders', operation: 'checkout' });
      return NextResponse.json(
        { message: 'Datos de pedido inválidos.', errors: safeZodIssues(parsed.error.issues) },
        { status: 400 }
      );
    }

    // SEC-2026-09 (#8): el correo de confirmación sale al email que el guest
    // escriba. Además del límite por IP, tope por destinatario para que un
    // atacante no use la tienda como relay hacia una víctima concreta.
    if (isGuest && parsed.data.customerEmail) {
      const emailKey = hashForBucket(parsed.data.customerEmail.trim().toLowerCase());
      const emailResult = await rateLimitCritical(`orders:post:email:${emailKey}`, {
        limit: 3,
        windowMs: 60 * 60_000,
      });
      if (emailResult.limited) {
        return buildRateLimitedResponse(emailResult.retryAfterSeconds,
          'Ya registramos varios pedidos para ese correo hace poco. Espera un momento.');
      }
    }

    // Canal WhatsApp sin número de pedidos válido configurado: no se crea el
    // pedido, no se limpia el carrito (eso lo hace el cliente tras el 2xx) y
    // no se genera guest token. Se carga settings una sola vez y se reutiliza
    // más abajo para retiro en tienda (evita una segunda lectura a BD).
    let settings: Awaited<ReturnType<typeof readSettings>> | null = null;
    if (channel === 'whatsapp') {
      settings = await readSettings();
      const whatsappOrderPhone = normalizeWhatsAppPhone(settings.whatsappOrderPhone);
      if (!isValidWhatsAppPhone(whatsappOrderPhone)) {
        logWarn('checkout_whatsapp_channel_unavailable', { route: '/api/orders', operation: 'checkout' });
        return NextResponse.json(
          { message: 'El canal de pedidos por WhatsApp está temporalmente indisponible.' },
          { status: 503 },
        );
      }
    }

    // Guest solo en whatsapp: este branch solo se ejecuta si isGuest, y por
    // construcción isGuest = isWhatsAppCheckout && !userId, así que channel
    // aquí siempre es 'whatsapp'. En full jamás llega un guest (401 arriba).
    if (isGuest) {
      const guestPhone = parsed.data.customerPhone?.trim();
      // WhatsApp: solo exige teléfono (el nombre ya lo exige el schema).
      if (!guestPhone) {
        return NextResponse.json(
          { message: 'Para comprar por WhatsApp necesitamos tu nombre y teléfono.' },
          { status: 400 }
        );
      }
    }

    // Ignorar el customerId enviado por el cliente; usar siempre la sesión del
    // servidor. 'guest' = pedido sin cuenta (customerId null en BD).
    const safeData = {
      ...parsed.data,
      customerId: isGuest ? 'guest' : userId!,
    };

    // PRD-128 (R1): para retiro en tienda la dirección NUNCA viene del cliente —
    // se resuelve desde la configuración persistida de la tienda.
    if (safeData.shippingMethod === 'tienda') {
      const tiendaSettings = settings ?? (settings = await readSettings());
      safeData.shippingDetails = {
        ...safeData.shippingDetails,
        address: `Retiro en tienda ${tiendaSettings.storeName} — ${tiendaSettings.address}`,
      };
    }

    if (safeData.paymentMethodId === 'cashea' && isCasheaEnabled()) throw new CheckoutError('Usa el checkout específico de Cashea.', 409);
    const buyer = isGuest ? `guest:${safeData.customerEmail?.toLowerCase() || safeData.customerPhone}` : `user:${userId}`;
    const operationKey = checkoutOperationKey(buyer, safeData.attemptKey);
    const payloadHash = checkoutPayloadHash(safeData);

    // SESIÓN 06: generar token guest (raw → hash) ANTES de la transacción para
    // devolverlo al cliente exactamente una vez. El hash se guarda en BD.
    let guestToken: string | null = null;
    let guestTokenHash: string | null = null;
    let guestTokenExpiresAt: Date | null = null;
    if (isGuest) {
      guestToken = checkoutCapability('guest', operationKey);
      guestTokenHash = hashToken(guestToken);
      guestTokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
    }

    const { order: createdOrder, reused } = await runCheckoutTransaction(async (tx) => {
      const attempt = await tx.checkoutAttempt.findUnique({ where: { key: operationKey }, include: { order: { include: { items: true } } } });
      if (attempt) {
        if (attempt.payloadHash !== payloadHash) throw new CheckoutError('Este intento ya pertenece a otros datos de compra.', 409);
        if (!attempt.order) throw new CheckoutError('Este intento ya fue procesado y su pedido fue eliminado. Revisa el resultado antes de iniciar otra compra.', 409);
        return { order: attempt.order, reused: true as const };
      }
      const duplicate = await tx.order.findUnique({ where: { checkoutAttemptKey: operationKey }, include: { items: true } });
      if (duplicate) {
        if (duplicate.checkoutPayloadHash !== payloadHash) throw new CheckoutError('Este intento ya pertenece a otros datos de compra.', 409);
        return { order: duplicate, reused: true as const };
      }
      if (channel !== 'whatsapp') {
        const referenceOwner = await findRecentDuplicateOrderInTransaction(tx, {
          customerId: isGuest ? null : userId!, customerEmail: safeData.customerEmail,
          paymentReference: safeData.paymentReference, paymentMethodId: safeData.paymentMethodId,
          paymentBank: safeData.paymentBank ?? null,
        });
        if (referenceOwner) throw new CheckoutError('Esta referencia ya está asociada a otro intento de compra. Revisa el pago antes de continuar.', 409);
      }
      if (!isGuest && CHECKOUT_MODE === 'full') {
        await assertBuyerReservationCapacity(tx, userId!, safeData.items);
      }

      const { order: created } = await executeCheckoutInTransactionWithMethod(tx, safeData, {
        orderStatus: channel === 'whatsapp' ? 'Pendiente' : undefined,
        deductStock: channel !== 'whatsapp',
        checkoutAttemptKey: operationKey,
        checkoutPayloadHash: payloadHash,
        guestAccessTokenHash: guestTokenHash,
        guestAccessTokenExpiresAt: guestTokenExpiresAt,
      });
      await tx.checkoutAttempt.create({ data: { key: operationKey, payloadHash, orderId: created.id } });
      await queueCheckoutConfirmation(tx, created, guestToken);
      return { order: created, reused: false as const };
    });

    if (reused) {
      logWarn('checkout_duplicate_prevented', { orderId: createdOrder.id, operation: 'checkout' });
      const dto = isGuest ? toGuestOrderConfirmationDto(createdOrder) : prismaOrderToOrder(createdOrder);
      return NextResponse.json({ ...dto, ...(isGuest && guestToken ? { guestToken } : {}) }, { status: 200 });
    }

    const order = createdOrder;

    // PRD-180: marcar el carrito abandonado como recuperado SOLO server-side,
    // tras confirmar el pedido (best-effort; markCartRecovered nunca lanza).
    // Se cubren ambos correos: el de contacto del pedido y el de la sesión
    // (el snapshot se guarda con el email de sesión — ver saveCartSnapshotAction).
    const recoveredEmails = new Set(
      [order.customerEmail, session?.user?.email]
        .map((e) => e?.trim().toLowerCase())
        .filter((e): e is string => !!e)
    );
    for (const email of recoveredEmails) {
      await markCartRecovered(email);
    }

    // SESIÓN 06: para invitados devolver DTO mínimo + token raw; para autenticados el Order completo.
    if (isGuest && guestToken) {
      const guestDto = toGuestOrderConfirmationDto(order);
      return NextResponse.json({ ...guestDto, guestToken }, { status: 201 });
    }
    return NextResponse.json(prismaOrderToOrder(order), { status: 201 });
  } catch (error) {
    logError('checkout_failed', error, { operation: 'checkout' });

    // PRD-029/PRD-070: solo los errores de negocio (CheckoutError) exponen su
    // mensaje y status (400/404/409). Cualquier error interno responde 500 con
    // mensaje genérico para no filtrar detalles de BD/inventario.
    if (error instanceof CheckoutError) {
      return NextResponse.json({ message: error.message }, { status: error.httpStatus });
    }
    return NextResponse.json(
      { message: 'No pudimos procesar tu pedido en este momento. Intenta de nuevo en unos minutos.' },
      { status: 500 }
    );
  }
}
