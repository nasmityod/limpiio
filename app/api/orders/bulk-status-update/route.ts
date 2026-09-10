import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import type { OrderStatus } from '@/lib/definitions';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { orderPathSegment } from '@/lib/order-ref';
import { sendOrderCancelledEmail } from '@/lib/resend';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logError } from '@/lib/safe-logger';

/** PRD-200: el bulk no puede avanzar a estados que requieren acción individual.
 *  'Enviado' exige tracking + email por pedido.
 *  'Entregado' solo debe llegar desde 'Enviado' con paidAt (PRD-194).
 */
const BULK_ALLOWED_STATUSES: readonly OrderStatus[] = ['Pendiente', 'En Proceso', 'Cancelado'];

/** Mismo estado que aprueba-stock en checkout Binance hasta validación manual. */
const BINANCE_PENDING: OrderStatus = 'Pendiente verificación Binance';

const STATUS_ENUM_VALUES = BULK_ALLOWED_STATUSES as unknown as [OrderStatus, ...OrderStatus[]];

const bulkUpdateSchema = z.object({
  orderIds: z
    .array(z.string().min(1))
    .min(1, 'Se requiere al menos un pedido.')
    .max(100, 'No se pueden actualizar más de 100 pedidos a la vez.')
    // Un mismo ID duplicado en el input no puede restaurar dos veces.
    .transform((ids) => [...new Set(ids)]),
  status: z.enum(STATUS_ENUM_VALUES, {
    message: `Estado no válido para operación masiva. Opciones: ${BULK_ALLOWED_STATUSES.join(', ')}.`,
  }),
});

export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = bulkUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Datos de entrada no válidos.', errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { orderIds, status } = parsed.data;

  const targeted = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, status: true, stockDeducted: true, channel: true },
  });

  const blocked = targeted.filter(
    (o) => o.status === BINANCE_PENDING && status !== 'Cancelado'
  );
  if (blocked.length > 0) {
    return NextResponse.json(
      {
        message:
          'Hay pedidos en verificación Binance: apruébalos uno a uno o cancélalos. No uses el cambio masivo a otros estados.',
      },
      { status: 400 }
    );
  }

  // PRD-134: idempotencia — excluir pedidos que ya están en el estado destino.
  const eligible = targeted.filter((o) => o.status !== status);

  if (eligible.length === 0) {
    return NextResponse.json({
      message: `Todos los pedidos seleccionados ya están en el estado '${status}'.`,
      updatedCount: 0,
    });
  }

  // OBJETIVO A: si el destino es 'En Proceso' y algún pedido elegible es de
  // WhatsApp sin stock descontado, se rechaza TODA la operación (sin
  // actualización parcial). El avance de esos pedidos solo puede hacerse
  // individualmente vía «Validar pago» (validateOrderPayment).
  if (status === 'En Proceso') {
    const hasUndeductedStock = eligible.some((o) => o.stockDeducted === false);
    if (hasUndeductedStock) {
      return NextResponse.json(
        {
          message:
            'Este pedido de WhatsApp aún no ha descontado inventario. Valida el pago con la acción «Validar pago» antes de avanzar el estado.',
          updatedCount: 0,
        },
        { status: 409 }
      );
    }
  }

  // Orden estable de IDs para evitar deadlocks entre transacciones concurrentes.
  const eligibleIds = eligible.map((o) => o.id).sort();

  const cancelledOrders: Array<{
    id: string;
    orderNumber: number;
    customerEmail: string | null;
    customerName: string;
  }> = [];

  let updatedCount = 0;

  await prisma.$transaction(async (tx) => {
    if (status === 'Cancelado') {
      // Releer dentro de la tx; excluir ya Cancelados; procesar uno a uno.
      const cancellable = await tx.order.findMany({
        where: {
          id: { in: eligibleIds },
          status: { not: 'Cancelado' satisfies OrderStatus },
        },
        include: { items: true },
      });

      cancellable.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

      for (const order of cancellable) {
        await applyOrderCancellationEffectsInTransaction(tx, {
          id: order.id,
          status: order.status,
          items: order.items,
          stockDeducted: order.stockDeducted,
        });

        const transition = await tx.order.updateMany({
          where: {
            id: order.id,
            status: { not: 'Cancelado' satisfies OrderStatus },
          },
          data: { status: 'Cancelado' satisfies OrderStatus },
        });

        if (transition.count === 1) {
          cancelledOrders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            customerEmail: order.customerEmail,
            customerName: order.customerName,
          });
        }
      }

      updatedCount = cancelledOrders.length;
    } else {
      const result = await tx.order.updateMany({
        where: { id: { in: eligibleIds } },
        data: {
          status,
          // FASE 4.5: si algún flujo bulk llegara a marcar Entregado, registrar la
          // fecha para el cron de reseñas (hoy el bulk se limita a En Proceso).
          ...(status === 'Entregado' ? { deliveredAt: new Date() } : {}),
        },
      });
      updatedCount = result.count;
    }
  });

  // PRD-050: enviar email de cancelación por pedido (best-effort, fuera de la transacción).
  if (status === 'Cancelado' && cancelledOrders.length > 0) {
    for (const order of cancelledOrders) {
      const recipientEmail = order.customerEmail?.trim() ?? '';
      if (!recipientEmail) continue;
      const firstName = (order.customerName.trim().split(/\s+/)[0]) || 'Cliente';
      const ref = orderPathSegment(order.orderNumber);
      try {
        await sendOrderCancelledEmail(recipientEmail, firstName, ref);
      } catch (emailErr) {
        logError('bulk_cancel_email_failed', emailErr, {
          orderId: order.id,
          provider: 'resend',
          operation: 'send_cancellation',
        });
      }
    }
  }

  return NextResponse.json({
    message: `${updatedCount} de ${orderIds.length} pedidos actualizados al estado '${status}'.`,
    updatedCount,
  });
}
