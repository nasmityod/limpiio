import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder } from '@/lib/definitions';
import { requirePermission } from '@/lib/admin-access-server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { trackingUrlSchema, trackingPhotoUrlSchema } from '@/lib/tracking-url-validation';
import { rejectInvalidMutationOrigin } from '@/lib/security';

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
    return NextResponse.json(prismaOrderToOrder(order));
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

  const data: Prisma.OrderUpdateInput = {};
  let touchedTracking = false;

  if (has('trackingNumber'))   { data.trackingNumber   = parsed.data.trackingNumber   ?? null; touchedTracking = true; }
  if (has('trackingCarrier'))  { data.trackingCarrier  = parsed.data.trackingCarrier  ?? null; touchedTracking = true; }
  if (has('trackingUrl'))      { data.trackingUrl      = parsed.data.trackingUrl      ?? null; touchedTracking = true; }
  if (has('trackingPhotoUrl')) { data.trackingPhotoUrl = parsed.data.trackingPhotoUrl ?? null; touchedTracking = true; }
  if (has('notes'))            { data.notes            = parsed.data.notes            ?? null; }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  const current = await prisma.order.findUnique({
    where: { id },
    select: { shippedAt: true, status: true },
  });
  if (!current) return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });

  const hasTrackingValue = !!(
    parsed.data.trackingNumber ??
    parsed.data.trackingCarrier ??
    parsed.data.trackingUrl ??
    parsed.data.trackingPhotoUrl
  );
  if (touchedTracking && hasTrackingValue && !current.shippedAt && current.status === 'Enviado') {
    data.shippedAt = new Date();
  }

  const updated = await prisma.order.update({
    where: { id },
    data,
    include: { items: true },
  });

  return NextResponse.json(prismaOrderToOrder(updated));
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

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) {
        const err = new Error('ORDER_NOT_FOUND');
        err.name = 'OrderNotFoundError';
        throw err;
      }

      await applyOrderCancellationEffectsInTransaction(tx, {
        id: order.id,
        status: order.status,
        items: order.items,
        stockDeducted: order.stockDeducted,
      });
      await tx.order.delete({ where: { id } });
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'OrderNotFoundError') {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}
