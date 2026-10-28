import type { Prisma } from '@prisma/client';
import type { OrderStatus } from '@/lib/definitions';

export const UNPAID_ORDER_STATUSES = ['Pendiente', 'Pendiente verificación Binance'] as const;

export interface OrderLifecycleSnapshot {
  status: string;
  paidAt?: Date | null;
  stockDeducted: boolean;
  casheaStatus?: string | null;
  shippingAddress?: string;
  legacyPaidConfirmed?: boolean;
}

export class OrderTransitionConflict extends Error {
  constructor(message = 'El pedido cambió. Recarga y vuelve a intentarlo.') {
    super(message);
    this.name = 'OrderTransitionConflict';
  }
}

/** Payment validation is a separate operation; ordinary status changes cannot create a payment. */
export function statusTransitionError(order: OrderLifecycleSnapshot, target: OrderStatus): string | null {
  if (order.casheaStatus && order.casheaStatus !== 'CONFIRMED') {
    return 'Este pedido requiere la operación específica de Cashea.';
  }
  if (order.status === target) return null;
  if (order.status === 'Cancelado' || order.status === 'Entregado') return 'El pedido está en un estado final.';
  if (target === 'Cancelado') {
    if (order.casheaStatus) return 'La cancelación de Cashea requiere su operación específica.';
    return null;
  }
  if (!order.paidAt && !order.legacyPaidConfirmed) return 'Valida el pago antes de avanzar el pedido.';
  if (!order.stockDeducted) return 'El pedido no tiene inventario reservado.';
  if (order.status === 'En Proceso' && target === 'Enviado') return null;
  if (order.status === 'Enviado' && target === 'Entregado') return null;
  if (order.status === 'En Proceso' && target === 'Entregado' && /^Retiro en tienda\b/i.test(order.shippingAddress ?? '')) return null;
  return 'La transición de estado no está permitida.';
}

/** Any monetary edit must change updatedAt too; this guard protects payment/status writers from stale amounts. */
export function orderSnapshotGuard(order: { id: string; status: string; stockDeducted: boolean; updatedAt?: Date; paidAt?: Date | null; casheaStatus?: string | null }): Prisma.OrderWhereInput {
  return {
    id: order.id,
    status: order.status,
    stockDeducted: order.stockDeducted,
    ...(order.updatedAt ? { updatedAt: order.updatedAt } : {}),
    ...(order.paidAt !== undefined ? { paidAt: order.paidAt } : {}),
    ...(order.casheaStatus !== undefined ? { casheaStatus: order.casheaStatus as Prisma.OrderWhereInput['casheaStatus'] } : {}),
  };
}
