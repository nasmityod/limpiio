import type { Prisma } from '@prisma/client';
import { CheckoutError } from '@/lib/checkout-error';
import { UNPAID_ORDER_STATUSES } from '@/lib/order-lifecycle';

/** A bounded read in the serializable checkout transaction covers every unpaid method, including Binance and Cashea. */
export async function assertBuyerReservationCapacity(tx: Prisma.TransactionClient, customerId: string, incoming: { quantity: number }[]): Promise<void> {
  const open = await tx.order.findMany({
    where: { customerId, paidAt: null, stockDeducted: true, status: { in: [...UNPAID_ORDER_STATUSES] } },
    take: 4,
    select: { items: { select: { quantity: true } } },
  });
  if (open.length >= 3) throw new CheckoutError('Tienes tres pedidos pendientes de pago. Espera su revisión antes de crear otro.', 409);
  const configured = Number(process.env.CHECKOUT_MAX_UNPAID_RESERVED_UNITS ?? 100);
  const limit = Number.isInteger(configured) && configured > 0 && configured <= 100_000 ? configured : 100;
  const reserved = open.reduce((sum, order) => sum + order.items.reduce((qty, item) => qty + item.quantity, 0), 0);
  const requested = incoming.reduce((sum, item) => sum + item.quantity, 0);
  if (reserved + requested > limit) throw new CheckoutError(`La reserva pendiente supera ${limit} unidades. Contacta a la tienda para una compra mayor.`, 409);
}
