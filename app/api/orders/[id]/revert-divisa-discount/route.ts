import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { prismaOrderToOrder } from '@/lib/definitions';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { dn } from '@/lib/decimal';
import { logError, logInfo } from '@/lib/safe-logger';
import { orderSnapshotGuard, UNPAID_ORDER_STATUSES } from '@/lib/order-lifecycle';

/**
 * POST /api/orders/[id]/revert-divisa-discount
 *
 * Revierte el descuento por pago en divisas de una orden:
 * - paymentDiscount / paymentDiscountPercent → null
 * - total = subtotalBeforeDiscount − couponDiscount (flete no entra en total)
 * Idempotente: si ya está revertido, no muta.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('PAYMENTS');
  if (!auth.authorized) return auth.response;

  const { id: orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentDiscount: true,
        paymentDiscountPercent: true,
        subtotalBeforeDiscount: true,
        couponDiscount: true,
        total: true,
        status: true,
        paidAt: true,
        stockDeducted: true,
        updatedAt: true,
        casheaStatus: true,
      },
    });

    if (!order) {
      return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
    }

    const paymentDiscount = dn(order.paymentDiscount);
    if (order.paidAt || order.casheaStatus || !(UNPAID_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      return NextResponse.json({ message: 'Solo puedes ajustar el descuento de un pedido pendiente de pago.' }, { status: 409 });
    }
    // Idempotente: ya revertido (null o 0) → devolver orden actual sin mutar.
    if (paymentDiscount == null || paymentDiscount <= 0) {
      const already = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      return NextResponse.json(prismaOrderToOrder(already!));
    }

    const subtotalBeforeDiscount = dn(order.subtotalBeforeDiscount);
    if (subtotalBeforeDiscount == null) {
      return NextResponse.json(
        {
          message:
            'No se puede revertir: el pedido no tiene subtotalBeforeDiscount (legacy).',
        },
        { status: 400 },
      );
    }

    const couponDiscount = dn(order.couponDiscount) ?? 0;
    const newTotal = Math.round(Math.max(0, subtotalBeforeDiscount - couponDiscount) * 100) / 100;

    const changed = await prisma.order.updateMany({
      where: { ...orderSnapshotGuard(order), paidAt: null, casheaStatus: null },
      data: {
        paymentDiscount: null,
        paymentDiscountPercent: null,
        total: newTotal,
      },
    });
    if (changed.count !== 1) return NextResponse.json({ message: 'El pedido cambió durante el ajuste. Recarga y vuelve a intentarlo.' }, { status: 409 });
    const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });

    logInfo('payment_divisa_discount_reverted', {
      orderId,
      operation: 'revert_divisa_discount',
      count: Math.round(paymentDiscount * 100),
    });

    return NextResponse.json(prismaOrderToOrder(updated));
  } catch (error) {
    logError('revert_divisa_discount_error', error, {
      orderId,
      operation: 'revert_divisa_discount',
    });
    return NextResponse.json(
      { message: 'No se pudo revertir el descuento por divisas.' },
      { status: 500 },
    );
  }
}
