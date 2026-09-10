import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, buildRateLimitedResponse } from '@/lib/security';
import { validateCouponForCheckout } from '@/lib/coupons';
import { loadExchangeRateUsdBsFromTx, roundMoney2 } from '@/lib/exchange-rate';
import { d } from '@/lib/decimal';

const schema = z.object({
  code: z.string().trim().min(1).max(40),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1)
    .max(50),
});

/**
 * POST /api/coupons/validate — comprueba un cupón contra el carrito.
 * El subtotal se calcula SIEMPRE desde precios de BD (nunca del cliente).
 * No incrementa usos: solo previsualiza el descuento para la UI del checkout.
 */
export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const ip = getClientIp(request);
  const ipResult = await rateLimitCritical(`coupons:validate:ip:${hashForBucket(ip)}`, { limit: 30, windowMs: 60_000 });
  if (ipResult.limited) {
    return buildRateLimitedResponse(ipResult.retryAfterSeconds,
      'Demasiados intentos. Espera un momento.');
  }

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, reason: 'Solicitud inválida.' },
        { status: 400 }
      );
    }

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    // PRD-160: límite adicional POR USUARIO — el límite por IP no frena fuerza
    // bruta de códigos desde redes compartidas/rotativas con sesión válida.
    if (userId && (await rateLimitCritical(`coupons:validate:user:${hashForBucket(userId)}`, { limit: 15, windowMs: 60_000 })).limited) {
      return buildRateLimitedResponse(60,
        'Demasiados intentos. Espera un momento.');
    }

    const { code, items } = parsed.data;

    const productIds = [...new Set(items.map((i) => i.productId))];
    const dbProducts = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, price: true },
    });
    // PRD-204: price es Decimal → convertir a number
    const priceById = new Map(dbProducts.map((p) => [p.id, d(p.price)]));

    let subtotalUsd = 0;
    for (const item of items) {
      const price = priceById.get(item.productId);
      if (price == null) {
        return NextResponse.json(
          { valid: false, reason: 'Uno de los productos ya no está disponible.' },
          { status: 400 }
        );
      }
      subtotalUsd += price * item.quantity;
    }
    subtotalUsd = roundMoney2(subtotalUsd);

    // El checkout exige sesión; userId identifica al comprador para perUserLimit.
    const result = await validateCouponForCheckout(prisma, code, subtotalUsd, userId);
    if (!result.ok) {
      return NextResponse.json({ valid: false, reason: result.reason });
    }

    const rate = await loadExchangeRateUsdBsFromTx(prisma);
    const discountUsd = result.discountUsd;
    const discountBs = roundMoney2(discountUsd * rate);
    const newTotalUsd = roundMoney2(Math.max(0, subtotalUsd - discountUsd));

    return NextResponse.json(
      {
        valid: true,
        code: result.coupon.code,
        discountUsd,
        discountBs,
        subtotalUsd,
        newTotalUsd,
        rate,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logError('coupon_validate_failed', error, { route: '/api/coupons/validate' });
    return NextResponse.json(
      { valid: false, reason: 'No se pudo validar el cupón.' },
      { status: 500 }
    );
  }
}
