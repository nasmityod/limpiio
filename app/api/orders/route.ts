import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { absoluteEmailUrl } from '@/emails/mundotech/site';
import type { OrderConfirmationPayload } from '@/emails/mundotech/types';
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
import { roundMoney2 } from '@/lib/exchange-rate';
import { readSettings } from '@/lib/data-store';
import { isValidWhatsAppPhone, normalizeWhatsAppPhone } from '@/lib/whatsapp-phone';
import { markCartRecovered } from '@/lib/abandoned-cart';
import { sendOrderConfirmationEmail } from '@/lib/resend';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, buildRateLimitedResponse, safeZodIssues } from '@/lib/security';
import { d, dn } from '@/lib/decimal';
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

const CHECKOUT_TX_MAX_RETRIES = 3;

/** Reintenta transacciones ante conflictos de serialización de Postgres (P2034 / 40001). */
function isSerializationFailure(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    if ((error as { code: string }).code === 'P2034') return true;
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
    body.channel = channel;
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      logWarn('checkout_validation_failed', { status: 400, route: '/api/orders', operation: 'checkout' });
      return NextResponse.json(
        { message: 'Datos de pedido inválidos.', errors: safeZodIssues(parsed.error.issues) },
        { status: 400 }
      );
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

    // SESIÓN 06: generar token guest (raw → hash) ANTES de la transacción para
    // devolverlo al cliente exactamente una vez. El hash se guarda en BD.
    let guestToken: string | null = null;
    let guestTokenHash: string | null = null;
    let guestTokenExpiresAt: Date | null = null;
    if (isGuest) {
      const { randomBytes } = await import('crypto');
      guestToken = randomBytes(32).toString('base64url');
      guestTokenHash = hashToken(guestToken);
      guestTokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
    }

    // PRD-131: reintentos (doble clic, recarga, retry de red) con la misma
    // referencia de pago devuelven el pedido ya creado en vez de duplicarlo.
    // FASE 4.1: para invitados la clave de idempotencia es (email, referencia).
    // PRD-131: reintentos (doble clic, recarga, retry de red) con la misma
    // referencia de pago devuelven el pedido ya creado en vez de duplicarlo.
    // FASE 4.1: para invitados la clave de idempotencia es (email, referencia).
    const { order: createdOrder, reused } = await runCheckoutTransaction(async (tx) => {
      const duplicate = await findRecentDuplicateOrderInTransaction(tx, {
        customerId: isGuest ? null : (userId as string),
        customerEmail: isGuest ? (safeData.customerEmail?.trim().toLowerCase() ?? null) : null,
        paymentReference: safeData.paymentReference,
      });
      if (duplicate) return { order: duplicate, reused: true as const };

      const { order: created } = await executeCheckoutInTransactionWithMethod(tx, safeData, {
        orderStatus: channel === 'whatsapp' ? 'Pendiente' : undefined,
        deductStock: channel !== 'whatsapp',
        guestAccessTokenHash: guestTokenHash,
        guestAccessTokenExpiresAt: guestTokenExpiresAt,
      });
      return { order: created, reused: false as const };
    });

    if (reused) {
      logWarn('checkout_duplicate_prevented', { orderId: createdOrder.id, operation: 'checkout' });
      // No devolver token si el pedido ya existía: el token se generó en el original.
      return NextResponse.json(prismaOrderToOrder(createdOrder), { status: 200 });
    }

    // Refetch con tipo completo para evitar el Prisma 7 inference gap
    const order = await prisma.order.findUnique({
      where: { id: createdOrder.id },
      include: { items: true },
    });
    if (!order) {
      logError('checkout_order_not_found_after_create', new Error('Order not found after creation'), { orderId: createdOrder.id, operation: 'checkout' });
      return NextResponse.json(
        { message: 'No pudimos procesar tu pedido en este momento. Intenta de nuevo en unos minutos.' },
        { status: 500 },
      );
    }

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

    let recipientEmail = order.customerEmail?.trim() ?? '';
    if (!recipientEmail && order.customerId) {
      const u = await prisma.user.findUnique({
        where: { id: order.customerId },
        select: { email: true },
      });
      recipientEmail = u?.email?.trim() ?? '';
    }

    if (recipientEmail) {
      const productIds = [...new Set(order.items.map((i) => i.productId))];
      const products = await prisma.product.findMany({
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
      const slugById = new Map(
        products.map((p) => [p.id, (p.slug?.trim() || p.id) as string])
      );
      // Respaldo de imagen: si la línea del pedido no guardó imagen, usamos la
      // foto del producto para que el correo siempre muestre el artículo.
      const fallbackImageById = new Map(
        products.map((p) => [p.id, p.images?.[0]?.trim() || p.media?.[0]?.url?.trim() || null])
      );

      // PRD-204: convertir Decimal → number en la frontera BD→email payload
      const rate = dn(order.exchangeRateUsdBs);
      const priceUsdFromStored = (priceStored: number) =>
        rate != null && rate > 0 ? roundMoney2(priceStored / rate) : roundMoney2(priceStored);

      const itemsPayload = order.items.map((i) => ({
        name: i.productName,
        slug: slugById.get(i.productId) ?? i.productId,
        image: absoluteEmailUrl(i.imageUrl || fallbackImageById.get(i.productId) || null),
        priceUsd: priceUsdFromStored(d(i.price)),
        quantity: i.quantity,
      }));

      // La tienda no cobra envío: el total autoritativo (Bs) es post-descuentos.
      const totalBs = d(order.total);
      const subtotalBs = dn(order.subtotalBeforeDiscount) ?? totalBs;
      const couponDiscountBs = dn(order.couponDiscount) ?? 0;
      const paymentDiscountBs = dn(order.paymentDiscount) ?? 0;
      const paymentDiscountPercent = dn(order.paymentDiscountPercent) ?? undefined;

      const totalUsd =
        rate != null && rate > 0 ? roundMoney2(totalBs / rate) : roundMoney2(totalBs);
      const subtotalUsd = priceUsdFromStored(subtotalBs);
      const couponDiscountUsd = priceUsdFromStored(couponDiscountBs);
      const paymentDiscountUsd = priceUsdFromStored(paymentDiscountBs);
      const shippingUsd = 0;
      const shippingBs = 0;

      const confirmationPayload: OrderConfirmationPayload = {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName.trim() || 'Cliente',
        email: recipientEmail,
        createdAt: order.createdAt,
        status: order.status,
        items: itemsPayload,
        subtotalUsd,
        shippingUsd,
        totalUsd,
        subtotalBs,
        shippingBs,
        totalBs,
        exchangeRateUsdBs: rate,
        paymentDiscountUsd: paymentDiscountBs > 0 ? paymentDiscountUsd : undefined,
        paymentDiscountPercent: paymentDiscountPercent != null && paymentDiscountPercent > 0
          ? paymentDiscountPercent
          : undefined,
        paymentDiscountBs: paymentDiscountBs > 0 ? paymentDiscountBs : undefined,
        couponDiscountUsd: couponDiscountBs > 0 ? couponDiscountUsd : undefined,
        couponDiscountBs: couponDiscountBs > 0 ? couponDiscountBs : undefined,
        paymentCurrency: order.paymentCurrency ?? null,
        paymentMethod: order.paymentMethod,
        paymentBank: order.paymentBank,
        paymentReference: order.paymentReference,
        shippingAddress: order.shippingAddress,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingZipCode: order.shippingZipCode,
        shippingCountry: order.shippingCountry,
        customerPhone: order.customerPhone,
        shippingMethod: order.trackingCarrier ?? null,
        freeShipping: order.freeShipping === true,
        // SESIÓN 06: token raw para construir enlace de acceso guest en el email
        guestToken,
      };

      // Best-effort: el pedido YA está confirmado en BD; un fallo de Resend
      // jamás debe presentarse al cliente como checkout fallido.
      // PRD-051: el log incluye id y orderNumber para que ops pueda reenviar
      // manualmente desde admin → PRD-051 requiere endpoint resend (DEPENDENCIA-05).
      try {
        await sendOrderConfirmationEmail(confirmationPayload);
      } catch (emailError) {
        logError('order_confirmation_email_failed', emailError, { orderId: order.id, provider: 'resend', operation: 'send_confirmation' });
      }
    } else {
      logWarn('order_confirmation_skipped_no_email', { orderId: order.id, operation: 'send_confirmation' });
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
