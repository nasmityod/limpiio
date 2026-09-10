import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { prismaOrderToOrder, type OrderStatus, VALID_ORDER_STATUSES } from '@/lib/definitions';
import { orderPathSegment } from '@/lib/order-ref';
import { sendOrderDeliveredEmail, sendShippingEmail, sendOrderCancelledEmail } from '@/lib/resend';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { trackingUrlSchema, trackingPhotoUrlSchema } from '@/lib/tracking-url-validation';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logInfo, logError, logWarn } from '@/lib/safe-logger';

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
    },
  });

  if (!existing) {
    return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
  }

  const isBinancePending = existing.status === 'Pendiente verificación Binance';

  if (isBinancePending && status !== 'Cancelado') {
    return NextResponse.json(
      {
        message:
          'Pedido pendiente de verificación Binance: usa «Aprobar pago Binance» para confirmar el pago, o marca como Cancelado.',
      },
      { status: 400 }
    );
  }

  // OBJETIVO A: un pedido cuyo stock NO fue descontado (WhatsApp pendiente de
  // validación) no puede avanzar a En Proceso/Enviado/Entregado por esta ruta
  // genérica. El único camino válido para descontar stock y avanzar es
  // validateOrderPayment() (acción «Validar pago»). Cancelado y Pendiente
  // (idempotente) siguen permitidos.
  const ADVANCED_STATUSES: readonly OrderStatus[] = ['En Proceso', 'Enviado', 'Entregado'];
  if (
    existing.stockDeducted === false &&
    ADVANCED_STATUSES.includes(status as OrderStatus)
  ) {
    return NextResponse.json(
      {
        message:
          'Este pedido de WhatsApp aún no ha descontado inventario. Valida el pago con la acción «Validar pago» antes de avanzar el estado.',
      },
      { status: 409 }
    );
  }

  // PRD-192: detectar si vienen datos de tracking en el body (para aplicarlos en todos los casos).
  const trackingProvided = Object.prototype.hasOwnProperty.call(body ?? {}, 'trackingNumber')
    || Object.prototype.hasOwnProperty.call(body ?? {}, 'trackingCarrier')
    || Object.prototype.hasOwnProperty.call(body ?? {}, 'trackingUrl')
    || Object.prototype.hasOwnProperty.call(body ?? {}, 'trackingPhotoUrl');

  const trackingData = trackingProvided ? {
    trackingNumber:   tracking.trackingNumber   ?? null,
    trackingCarrier:  tracking.trackingCarrier  ?? null,
    trackingUrl:      tracking.trackingUrl      ?? null,
    trackingPhotoUrl: tracking.trackingPhotoUrl ?? null,
  } : {};

  const isCancelling = status === 'Cancelado';

  let updated: OrderWithRelations;
  let stockRestored = false;
  let didTransitionToCancelled = false;

  if (isCancelling) {
    // PRD-190: al cancelar, ejecutar dentro de una transacción:
    // reclamar stockDeducted atómicamente + restaurar stock + revertir cupón.
    // La orden se relee DENTRO de la tx para evitar snapshots obsoletos.
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const orderWithItems = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            customer: { select: { email: true, name: true } },
          },
        });

        if (!orderWithItems) {
          const err = new Error('ORDER_NOT_FOUND');
          err.name = 'OrderNotFoundError';
          throw err;
        }

        // Idempotencia: ya Cancelado → no restaurar, devolver estado actual.
        if (orderWithItems.status === 'Cancelado') {
          return {
            order: orderWithItems,
            stockRestored: false,
            didTransition: false,
          };
        }

        const effects = await applyOrderCancellationEffectsInTransaction(tx, {
          id: orderWithItems.id,
          status: orderWithItems.status,
          items: orderWithItems.items,
          stockDeducted: orderWithItems.stockDeducted,
        });

        // Transición condicional: solo una petición concurrente gana el cambio
        // de estado. Evita emails/logs duplicados aunque el claim de stock ya
        // sea atómico.
        const transition = await tx.order.updateMany({
          where: {
            id: orderId,
            status: orderWithItems.status,
          },
          data: {
            status: 'Cancelado',
            ...trackingData,
          },
        });

        if (transition.count === 1) {
          const result = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              items: true,
              customer: { select: { email: true, name: true } },
            },
          });
          if (!result) {
            const err = new Error('ORDER_NOT_FOUND');
            err.name = 'OrderNotFoundError';
            throw err;
          }
          return {
            order: result,
            stockRestored: effects.stockRestored,
            didTransition: true,
          };
        }

        // count === 0: otra petición ya cambió el estado.
        const raced = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            customer: { select: { email: true, name: true } },
          },
        });
        if (!raced) {
          const err = new Error('ORDER_NOT_FOUND');
          err.name = 'OrderNotFoundError';
          throw err;
        }
        if (raced.status === 'Cancelado') {
          return {
            order: raced,
            stockRestored: false,
            didTransition: false,
          };
        }
        // Estado inesperado tras perder la carrera: devolver snapshot actual
        // sin afirmar transición ni efectos adicionales.
        return {
          order: raced,
          stockRestored: false,
          didTransition: false,
        };
      });
      updated = txResult.order;
      stockRestored = txResult.stockRestored;
      didTransitionToCancelled = txResult.didTransition;
    } catch (err) {
      if (err instanceof Error && err.name === 'OrderNotFoundError') {
        return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
      }
      throw err;
    }

    if (didTransitionToCancelled) {
      if (stockRestored) {
        logInfo('order_cancelled_stock_reverted', { orderId, operation: 'cancel_order' });
      } else {
        logInfo('order_cancelled_no_stock_restore', { orderId, operation: 'cancel_order' });
      }
    }
  } else {
    updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...trackingData,
        shippedAt: status === 'Enviado' && !existing.shippedAt ? new Date() : undefined,
        // FASE 4.5: base del cron review-request (email a los 7 días de entrega).
        deliveredAt: status === 'Entregado' && !existing.deliveredAt ? new Date() : undefined,
      },
      include: {
        items: true,
        customer: { select: { email: true, name: true } },
      },
    });
  }

  const newTracking = (updated.trackingNumber ?? '').trim();
  const prevTracking = (existing.trackingNumber ?? '').trim();
  const recipientEmail =
    updated.customerEmail?.trim() || updated.customer?.email?.trim() || '';
  const displayNameForEmail =
    updated.customerName?.trim() || updated.customer?.name?.trim() || '';
  const firstName = firstNameFromCustomerName(displayNameForEmail);

  // PRD-050: enviar email de cancelación al cliente (best-effort, fuera de la transacción).
  if (isCancelling && didTransitionToCancelled && recipientEmail) {
    const orderRef = orderPathSegment(updated.orderNumber);
    try {
      await sendOrderCancelledEmail(recipientEmail, firstName, orderRef);
    } catch (emailErr) {
      logError('order_cancel_email_failed', emailErr, { orderId, provider: 'resend', operation: 'send_cancellation' });
    }
  }

  const transitionedToShipped = existing.status !== 'Enviado' && status === 'Enviado';
  const shouldSendShippingEmail =
    status === 'Enviado' &&
    newTracking &&
    recipientEmail &&
    (transitionedToShipped || newTracking !== prevTracking);

  const transitionedToDelivered = existing.status !== 'Entregado' && status === 'Entregado';
  const shouldSendDeliveredEmail = transitionedToDelivered && recipientEmail;

  if (status === 'Enviado' && newTracking && !recipientEmail) {
    logWarn('shipping_email_skipped_no_email', { orderId, operation: 'send_shipping' });
  }

  if (shouldSendShippingEmail) {
    try {
      await sendShippingEmail(
        recipientEmail,
        firstName,
        newTracking,
        {
          carrier: updated.trackingCarrier,
          trackingUrl: updated.trackingUrl,
          orderId: orderPathSegment(updated.orderNumber),
        }
      );
    } catch (emailErr) {
      logError('shipping_email_failed', emailErr, { orderId, provider: 'resend', operation: 'send_shipping' });
    }
  }

  if (shouldSendDeliveredEmail) {
    try {
      await sendOrderDeliveredEmail(
        recipientEmail,
        firstName,
        orderPathSegment(updated.orderNumber)
      );
    } catch (emailErr) {
      logError('order_delivered_email_failed', emailErr, { orderId, provider: 'resend', operation: 'send_delivered' });
    }
  }

  if (status === 'Entregado' && !recipientEmail) {
    logWarn('delivered_email_skipped_no_email', { orderId, operation: 'send_delivered' });
  }

  return NextResponse.json(prismaOrderToOrder(updated));
}
