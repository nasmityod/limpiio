/**
 * PRD-051: POST /api/orders/[id]/resend-confirmation
 * Permite al admin reenviar el email de confirmación de un pedido.
 * Reutiliza la misma lógica de construcción del payload que orders/route.ts.
 */
import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { sendOrderConfirmationEmailResult } from '@/lib/resend';
import { buildOrderConfirmationPayload } from '@/lib/order-confirmation-payload';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = rejectInvalidMutationOrigin(_request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { id: orderId } = await params;

  const suppliedKey = _request.headers.get('Idempotency-Key');
  if (suppliedKey !== null && !/^[A-Za-z0-9_-]{16,128}$/.test(suppliedKey)) {
    return NextResponse.json({ message: 'La identidad del reenvío no es válida.' }, { status: 400 });
  }
  // A new explicit resend is a new event; retries with the same key reuse its
  // durable outbox row. Scope the key to this order, never to another buyer.
  const requestKey = createHash('sha256').update(JSON.stringify([orderId, suppliedKey ?? randomUUID()])).digest('hex');

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
    }
    if (order.status === 'Cancelado') {
      return NextResponse.json({ message: 'El pedido está cancelado; no se puede reenviar su confirmación de compra.' }, { status: 422 });
    }

    // Resolver email del destinatario (pedido directo o cuenta vinculada)
    let recipientEmail = order.customerEmail?.trim() ?? '';
    if (!recipientEmail && order.customerId) {
      const u = await prisma.user.findUnique({
        where: { id: order.customerId },
        select: { email: true },
      });
      recipientEmail = u?.email?.trim() ?? '';
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { message: 'El pedido no tiene email de contacto; no se puede reenviar la confirmación.' },
        { status: 422 }
      );
    }

    // Construir payload igual que en POST /api/orders
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
    const confirmationPayload = buildOrderConfirmationPayload(order, recipientEmail, products);

    const result = await sendOrderConfirmationEmailResult(confirmationPayload, { requestKey, enqueueOnly: true });
    if (!result.accepted && result.reason === 'queued') {
      logInfo('resend_confirmation_queued', { orderId, operation: 'resend_confirmation' });
      return NextResponse.json({ success: true, queued: true, deliveryId: result.deliveryId, email: recipientEmail,
        message: 'La confirmación quedó registrada para envío.' }, { status: 202 });
    }
    if (result.accepted) {
      return NextResponse.json({ success: true, queued: false, email: recipientEmail });
    }
    logError('resend_confirmation_failed', new Error(result.reason), { orderId, provider: 'resend', operation: 'resend_confirmation' });
    return NextResponse.json({ message: 'No se pudo registrar el correo en este momento. Inténtalo de nuevo.' }, { status: result.reason === 'invalid' ? 422 : 503 });
  } catch (emailError) {
    logError('resend_confirmation_failed', emailError, { orderId, provider: 'resend', operation: 'resend_confirmation' });
    return NextResponse.json(
      { message: 'No se pudo reenviar el correo en este momento. Inténtalo de nuevo.' },
      { status: 500 }
    );
  }
}
