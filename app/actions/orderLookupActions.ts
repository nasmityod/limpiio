'use server';

/**
 * FASE 4.2 (MEJORA 2.1) — consulta pública de pedido: orderNumber + cédula.
 *
 * Anti-enumeración: el MISMO mensaje genérico cuando el número no existe y
 * cuando la cédula no coincide; rate limit por IP para frenar fuerza bruta
 * (un orderNumber secuencial solo se abre con la cédula correcta del pedido).
 * Read-only: devuelve DTO público sin PII de pago.
 */
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder, toPublicOrderLookupDto, type PublicOrderLookup } from '@/lib/definitions';
import { rateLimitCritical, hashForBucket } from '@/lib/rate-limit';
import { getActionClientIp } from '@/lib/security';
import { logError } from '@/lib/safe-logger';

const GENERIC_NOT_FOUND =
  'No encontramos un pedido con esos datos. Verifica el número de pedido y la cédula tal como los usaste al comprar.';

const MAX_ORDER_NUMBER_DIGITS = 8;
const MAX_ID_DIGITS = 10;

/** Solo dígitos: "V-12.345.678" → "12345678" (mismo criterio para BD y para el input). */
function normalizeIdNumber(value: string): string {
  return value.replace(/\D/g, '');
}

export async function lookupPublicOrderAction(
  orderNumberRaw: string,
  idNumberRaw: string,
): Promise<{ success: true; order: PublicOrderLookup } | { success: false; message: string }> {
  try {
    const ip = await getActionClientIp();
    if ((await rateLimitCritical(`order-lookup:${hashForBucket(ip)}`, { limit: 10, windowMs: 10 * 60_000 })).limited) {
      return {
        success: false,
        message: 'Demasiadas consultas. Espera unos minutos e intenta de nuevo.',
      };
    }

    const orderNumberDigits = orderNumberRaw.trim().replace(/^#/, '').replace(/\D/g, '');
    const idDigits = normalizeIdNumber(idNumberRaw);
    if (
      orderNumberDigits.length === 0 ||
      orderNumberDigits.length > MAX_ORDER_NUMBER_DIGITS ||
      idDigits.length < 5 ||
      idDigits.length > MAX_ID_DIGITS
    ) {
      return { success: false, message: GENERIC_NOT_FOUND };
    }

    const orderNumber = parseInt(orderNumberDigits, 10);
    if (!Number.isInteger(orderNumber) || orderNumber <= 0) {
      return { success: false, message: GENERIC_NOT_FOUND };
    }

    const row = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: { include: { product: { select: { slug: true } } } },
      },
    });

    // Mismo mensaje si el pedido no existe, no tiene cédula registrada o no coincide.
    if (
      !row ||
      !row.customerIdNumber ||
      normalizeIdNumber(row.customerIdNumber) !== idDigits
    ) {
      return { success: false, message: GENERIC_NOT_FOUND };
    }

    const order = prismaOrderToOrder({
      ...row,
      items: row.items.map(({ product: _product, ...item }) => item),
    });
    const slugByProductId = new Map(
      row.items.map((i) => [i.productId, i.product.slug?.trim() || i.productId]),
    );
    const enrichedItems = order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      imageUrl: item.imageUrl || '/placeholder.png',
      productSlug: slugByProductId.get(item.productId) ?? item.productId,
      freeShipping: item.freeShipping,
    }));

    return {
      success: true,
      order: toPublicOrderLookupDto({ ...order, items: enrichedItems }),
    };
  } catch (error) {
    logError('lookup_public_order_failed', error, { operation: 'lookup_public_order' });
    return {
      success: false,
      message: 'No pudimos consultar el pedido en este momento. Intenta de nuevo en unos minutos.',
    };
  }
}
