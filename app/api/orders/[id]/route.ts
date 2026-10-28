import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder, toCustomerOrderDto } from '@/lib/definitions';
import { requirePermission } from '@/lib/admin-access-server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { trackingUrlSchema, trackingPhotoUrlSchema } from '@/lib/tracking-url-validation';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { deletePrivateProof } from '@/lib/r2';
import { logError } from '@/lib/safe-logger';
import { queueTrackingNotification } from '@/lib/order-tracking-notification';
import { orderSnapshotGuard, OrderTransitionConflict, UNPAID_ORDER_STATUSES } from '@/lib/order-lifecycle';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 401 });
  }

  const { id: orderId } = await params;

  const ownership = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, customerId: true },
  });

  if (!ownership) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  }

  const isOwner = session.user.id === ownership.customerId;
  if (isOwner) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) {
      return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
    }
    // SEC-2026-09 (#5): el dueño recibe la vista de cliente (sin notas internas ni datos del operador).
    return NextResponse.json(toCustomerOrderDto(prismaOrderToOrder(order)));
  }

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) {
    return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
  }

  return NextResponse.json(prismaOrderToOrder(order));
}

const patchSchema = z.object({
  trackingNumber:   z.string().trim().max(80).optional().nullable(),
  trackingCarrier:  z.string().trim().max(80).optional().nullable(),
  trackingUrl:      trackingUrlSchema.optional().nullable(),
  trackingPhotoUrl: trackingPhotoUrlSchema.optional().nullable(),
  notes:            z.string().trim().max(2000).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos.', errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);

  const data: Prisma.OrderUpdateManyMutationInput = {};
  let touchedTracking = false;

  if (has('trackingNumber'))   { data.trackingNumber   = parsed.data.trackingNumber   ?? null; touchedTracking = true; }
  if (has('trackingCarrier'))  { data.trackingCarrier  = parsed.data.trackingCarrier  ?? null; touchedTracking = true; }
  if (has('trackingUrl'))      { data.trackingUrl      = parsed.data.trackingUrl      ?? null; touchedTracking = true; }
  if (has('trackingPhotoUrl')) { data.trackingPhotoUrl = parsed.data.trackingPhotoUrl ?? null; touchedTracking = true; }
  if (has('notes'))            { data.notes            = parsed.data.notes            ?? null; }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id }, include: { items: true, customer: { select: { email: true, name: true } } },
      });
      if (!current) throw new OrderTransitionConflict('Pedido no encontrado.');
      const hasTrackingValue = [parsed.data.trackingNumber, parsed.data.trackingCarrier, parsed.data.trackingUrl, parsed.data.trackingPhotoUrl]
        .some(value => typeof value === 'string' && value.trim() !== '');
      if (touchedTracking && hasTrackingValue && !current.shippedAt && current.status === 'Enviado') data.shippedAt = new Date();
      const claim = await tx.order.updateMany({ where: orderSnapshotGuard(current), data });
      if (claim.count !== 1) throw new OrderTransitionConflict();
      const updated = await tx.order.findUnique({
        where: { id }, include: { items: true, customer: { select: { email: true, name: true } } },
      });
      if (!updated) throw new OrderTransitionConflict();
      if (touchedTracking) await queueTrackingNotification(tx, current, updated);
      return updated;
    });
    return NextResponse.json(prismaOrderToOrder(updated));
  } catch (error) {
    if (error instanceof OrderTransitionConflict) return NextResponse.json({ error: error.message }, { status: error.message === 'Pedido no encontrado.' ? 404 : 409 });
    logError('order_patch_failed', error, { operation: 'update_order_tracking', orderId: id });
    return NextResponse.json({ error: 'No se pudo actualizar el pedido.' }, { status: 500 });
  }

}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(_req);
  if (originCheck) return originCheck;

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  let proofKey: string | null = null;
  try {
    proofKey = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) {
        const err = new Error('ORDER_NOT_FOUND');
        err.name = 'OrderNotFoundError';
        throw err;
      }

      if (order.casheaStatus || order.paidAt || (!(UNPAID_ORDER_STATUSES as readonly string[]).includes(order.status) && order.status !== 'Cancelado')) throw new OrderTransitionConflict('Los pedidos pagados, enviados o Cashea conservan su historial; no se pueden borrar por esta vía.');
      const claim = await tx.order.updateMany({ where: orderSnapshotGuard(order), data: { status: 'Cancelado' } });
      if (claim.count !== 1) throw new OrderTransitionConflict();
      if (order.status !== 'Cancelado') await applyOrderCancellationEffectsInTransaction(tx, order, { stockClaimStatus: 'Cancelado' });
      // Durable deletion task survives loss of the process or an unavailable bucket.
      await tx.paymentUpload.updateMany({ where: { orderId: order.id }, data: { status: 'DELETING' } });
      if (order.paymentProofKey) {
        await tx.paymentUpload.upsert({
          where: { objectKey: order.paymentProofKey },
          update: { status: 'DELETING' },
          create: { tokenHash: `cleanup:${order.id}`, objectKey: order.paymentProofKey, status: 'DELETING', expiresAt: new Date() },
        });
      }
      await tx.order.delete({ where: { id } });
      return order.paymentProofKey ?? null;
    });
  } catch (err) {
    if (err instanceof OrderTransitionConflict) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof Error && err.name === 'OrderNotFoundError') {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }
    throw err;
  }

  if (proofKey) {
    try {
      await deletePrivateProof(proofKey);
      await prisma.paymentUpload.updateMany({ where: { objectKey: proofKey, status: 'DELETING' }, data: { status: 'DELETED' } });
    } catch (err) {
      logError('order_delete_proof_cleanup_failed', err, {
        operation: 'delete_order',
        provider: 'r2',
        orderId: id,
      });
    }
  }

  return NextResponse.json({ success: true });
}
