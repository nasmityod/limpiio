import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import type { OrderStatus } from '@/lib/definitions';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { orderPathSegment } from '@/lib/order-ref';
import { sendOrderCancelledEmail } from '@/lib/resend';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logError } from '@/lib/safe-logger';
import { statusTransitionError, orderSnapshotGuard, OrderTransitionConflict } from '@/lib/order-lifecycle';

/** PRD-200: el bulk no puede avanzar a estados que requieren acción individual.
 *  'Enviado' exige tracking + email por pedido.
 *  'Entregado' solo debe llegar desde 'Enviado' con paidAt (PRD-194).
 */
const BULK_ALLOWED_STATUSES: readonly OrderStatus[] = ['Cancelado'];

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

  let updatedCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, include: { items: true }, orderBy: { id: 'asc' } });
      if (orders.length !== orderIds.length) throw new OrderTransitionConflict('Algún pedido ya no existe.');
      orders.sort((a, b) => a.id.localeCompare(b.id));
      // Validate the entire batch before any write; any lost claim rolls back all rows.
      for (const order of orders) {
        const error = statusTransitionError(order, status);
        if (error) throw new OrderTransitionConflict(error);
      }
      for (const order of orders) {
        if (order.status === status) continue;
        const claim = await tx.order.updateMany({ where: orderSnapshotGuard(order), data: { status } });
        if (claim.count !== 1) throw new OrderTransitionConflict();
        if (status === 'Cancelado') {
          await applyOrderCancellationEffectsInTransaction(tx, order, { stockClaimStatus: 'Cancelado' });
          const recipient = order.customerEmail?.trim();
          if (recipient) await queueTransactionalEmails(tx, () => sendOrderCancelledEmail(
            recipient, order.customerName.trim().split(/\s+/)[0] || 'Cliente', orderPathSegment(order.orderNumber),
          ));
        }
        updatedCount++;
      }
    });
  } catch (error) {
    if (error instanceof OrderTransitionConflict) return NextResponse.json({ message: error.message, updatedCount: 0 }, { status: 409 });
    logError('bulk_status_update_failed', error, { operation: 'bulk_status_update' });
    return NextResponse.json({ message: 'No se pudieron actualizar los pedidos.', updatedCount: 0 }, { status: 500 });
  }

  return NextResponse.json({
    message: `${updatedCount} de ${orderIds.length} pedidos actualizados al estado '${status}'.`,
    updatedCount,
  });
}
