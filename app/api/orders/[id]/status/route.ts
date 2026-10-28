import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { prismaOrderToOrder, type OrderStatus, VALID_ORDER_STATUSES } from '@/lib/definitions';
import { orderPathSegment } from '@/lib/order-ref';
import { sendOrderDeliveredEmail, sendOrderCancelledEmail } from '@/lib/resend';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { trackingUrlSchema, trackingPhotoUrlSchema } from '@/lib/tracking-url-validation';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logInfo, logError, logWarn } from '@/lib/safe-logger';
import { statusTransitionError, orderSnapshotGuard, OrderTransitionConflict } from '@/lib/order-lifecycle';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';
import { queueTrackingNotification } from '@/lib/order-tracking-notification';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; customer: { select: { email: true; name: true } } };
}>;

function firstNameFromCustomerName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return 'Cliente';
  return t.split(/\s+/)[0] ?? t;
}

const VALID_STATUSES = VALID_ORDER_STATUSES;

const bodySchema = z.object({
  status: z.string(),
  trackingNumber:   z.string().trim().max(80).optional().nullable(),
  trackingCarrier:  z.string().trim().max(80).optional().nullable(),
  // PRD-267: solo https. PRD-268: foto restringida a R2.
  trackingUrl:      trackingUrlSchema.optional().nullable(),
  trackingPhotoUrl: trackingPhotoUrlSchema.optional().nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { id: orderId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Datos inválidos.' }, { status: 400 });
  }
  const { status, ...tracking } = parsed.data;

  if (!VALID_STATUSES.includes(status as OrderStatus)) {
    return NextResponse.json({ message: 'Estado no válido.' }, { status: 400 });
  }

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      shippedAt: true,
      trackingNumber: true,
      deliveredAt: true,
      stockDeducted: true,
      channel: true,
      id: true,
      updatedAt: true,
      paidAt: true,
      legacyPaidConfirmed: true,
      casheaStatus: true,
      shippingAddress: true,
    },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
  }

  const policyError = statusTransitionError(existing, status as OrderStatus);
  if (policyError) return NextResponse.json({ message: policyError }, { status: 409 });

  // A supplied field can explicitly be cleared; omitted tracking fields keep
  // their persisted value, including during a same-status update.
  const trackingData: Prisma.OrderUpdateManyMutationInput = {};
  for (const key of ['trackingNumber', 'trackingCarrier', 'trackingUrl', 'trackingPhotoUrl'] as const) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, key)) trackingData[key] = tracking[key] ?? null;
  }

  const isCancelling = status === 'Cancelado';

  let updated: OrderWithRelations;
  let stockRestored = false;
  let didTransitionToCancelled = false;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, customer: { select: { email: true, name: true } } },
      });
      if (!current) throw new OrderTransitionConflict('Pedido no encontrado.');
      const error = statusTransitionError(current, status as OrderStatus);
      if (error) throw new OrderTransitionConflict(error);
      const transitioned = current.status !== status;
      if (isCancelling && !transitioned) return { order: current, restored: false, transitioned: false, previous: current };
      const claimed = await tx.order.updateMany({
        where: orderSnapshotGuard(current),
        data: {
          status,
          ...trackingData,
          ...(status === 'Enviado' && !current.shippedAt ? { shippedAt: new Date() } : {}),
          ...(status === 'Entregado' && !current.deliveredAt ? { deliveredAt: new Date() } : {}),
        },
      });
      if (claimed.count !== 1) throw new OrderTransitionConflict();
      let restored = false;
      if (isCancelling && transitioned) {
        const effects = await applyOrderCancellationEffectsInTransaction(tx, current, { stockClaimStatus: 'Cancelado' });
        restored = effects.stockRestored;
      }
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, customer: { select: { email: true, name: true } } },
      });
      if (!order) throw new OrderTransitionConflict();
      const recipient = order.customerEmail?.trim() || order.customer?.email?.trim() || '';
      const firstName = firstNameFromCustomerName(order.customerName?.trim() || order.customer?.name?.trim() || '');
      if (recipient) await queueTransactionalEmails(tx, async () => {
        if (isCancelling && transitioned) await sendOrderCancelledEmail(recipient, firstName, orderPathSegment(order.orderNumber));
        if (status === 'Entregado' && transitioned) await sendOrderDeliveredEmail(recipient, firstName, orderPathSegment(order.orderNumber));
      });
      await queueTrackingNotification(tx, current, order);
      return { order, restored, transitioned, previous: current };
    });
    updated = result.order;
    stockRestored = result.restored;
    didTransitionToCancelled = isCancelling && result.transitioned;
    if (didTransitionToCancelled) logInfo(stockRestored ? 'order_cancelled_stock_reverted' : 'order_cancelled_no_stock_restore', { orderId, operation: 'cancel_order' });
  } catch (error) {
    if (error instanceof OrderTransitionConflict) return NextResponse.json({ message: error.message }, { status: error.message === 'Pedido no encontrado.' ? 404 : 409 });
    logError('order_status_update_failed', error, { orderId, operation: 'order_status_update' });
    return NextResponse.json({ message: 'No se pudo actualizar el pedido.' }, { status: 500 });
  }

  if (!updated.customerEmail?.trim() && !updated.customer?.email?.trim() && (status === 'Enviado' || status === 'Entregado')) {
    logWarn('order_status_email_skipped_no_email', { orderId, operation: 'order_status_update' });
  }

  return NextResponse.json(prismaOrderToOrder(updated));
}
