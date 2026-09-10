'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { prismaOrderToOrder, type Order, type OrderStatus } from '@/lib/definitions';
import { requirePermissionAction } from '@/lib/admin-access-server';
import { orderPathSegment } from '@/lib/order-ref';
import { sendPaymentValidatedEmail, sendPaymentRejectedEmail } from '@/lib/resend';
import { applyOrderCancellationEffectsInTransaction, deductOrderStockInTransaction } from '@/lib/checkout-order';
import { CheckoutError } from '@/lib/checkout-error';

function firstNameFromCustomerName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return 'Cliente';
  return t.split(/\s+/)[0] ?? t;
}

export type ValidateOrderPaymentResult =
  | { success: true; message: string; order: Order }
  | { success: false; message: string };

/**
 * Confirma pago manual: Pendiente → En Proceso, y notifica al cliente por correo (si hay email).
 *
 * PRD-197: idempotente — si el pago ya fue validado (doble clic u otro admin),
 * responde éxito silencioso en vez de error.
 * PRD-196: locking optimista — la transición usa `updateMany` condicionado al
 * estado esperado; si otro admin lo cambió en paralelo, no hay last-write-wins.
 */
export async function validateOrderPayment(orderId: string): Promise<ValidateOrderPaymentResult> {
  const adminEmail: string | null = null;
  try {
    await requirePermissionAction('PAYMENTS');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }

  const loadFullOrder = (id: string) =>
    prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        customer: { select: { email: true, name: true } },
      },
    });

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existing) {
    return { success: false, message: 'Pedido no encontrado.' };
  }

  if (existing.status === ('En Proceso' satisfies OrderStatus)) {
    const already = await loadFullOrder(orderId);
    return {
      success: true,
      message: 'El pago ya estaba validado.',
      order: prismaOrderToOrder(already!),
    };
  }

  if (existing.status !== ('Pendiente' satisfies OrderStatus)) {
    return {
      success: false,
      message: 'Este pedido no está pendiente de verificación de pago.',
    };
  }

  // PRD-WhatsApp: si el pedido tiene stockDeducted === false, descuenta el stock
  // dentro de la misma transacción. Si algún producto ya no tiene suficiente stock,
  // se bloquea la confirmación y se informa qué producto falta.
  const orderInfo = await prisma.order.findUnique({
    where: { id: orderId },
    select: { stockDeducted: true, items: { select: { productId: true, quantity: true } } },
  });

  const needsStockDeduction = orderInfo && orderInfo.stockDeducted === false;

  if (needsStockDeduction) {
    type WhatsAppClaimResult =
      | { kind: 'already-claimed' }
      | { kind: 'updated'; order: NonNullable<Awaited<ReturnType<typeof loadFullOrder>>> };

    let txResult: WhatsAppClaimResult;
    try {
      txResult = await prisma.$transaction(async (tx) => {
        const now = new Date();

        const claim = await tx.order.updateMany({
          where: {
            id: orderId,
            status: 'Pendiente' satisfies OrderStatus,
            stockDeducted: false,
          },
          data: {
            status: 'En Proceso' satisfies OrderStatus,
            paidAt: now,
            paymentVerifiedBy: adminEmail,
            paymentRejectionReason: null,
            stockDeducted: true,
          },
        });

        if (claim.count === 0) {
          return { kind: 'already-claimed' };
        }

        const orderItems = await tx.orderItem.findMany({
          where: { orderId },
          select: { productId: true, quantity: true },
        });
        const productIds = [...new Set(orderItems.map((i) => i.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        await deductOrderStockInTransaction(tx, orderItems, productMap);

        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            customer: { select: { email: true, name: true } },
          },
        });

        return { kind: 'updated', order: order! };
      });
    } catch (err) {
      if (err instanceof CheckoutError) {
        return { success: false, message: err.message };
      }
      throw err;
    }

    if (txResult.kind === 'already-claimed') {
      const current = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (current?.status === ('En Proceso' satisfies OrderStatus)) {
        const already = await loadFullOrder(orderId);
        return {
          success: true,
          message: 'El pago ya estaba validado.',
          order: prismaOrderToOrder(already!),
        };
      }
      return {
        success: false,
        message: 'El pedido cambió de estado mientras se validaba. Recarga e intenta de nuevo.',
      };
    }

    const updated = txResult.order;

    const recipientEmail =
      updated.customerEmail?.trim() || updated.customer?.email?.trim() || '';
    const displayNameForEmail =
      updated.customerName?.trim() || updated.customer?.name?.trim() || '';

    await sendPaymentValidatedEmail(
      recipientEmail,
      firstNameFromCustomerName(displayNameForEmail),
      String(updated.orderNumber).padStart(4, '0'),
      updated.id
    );

    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/account/orders');
    revalidatePath(`/account/orders/${orderPathSegment(updated.orderNumber)}`);

    return {
      success: true,
      message: 'Pago marcado como verificado y cliente notificado cuando hay correo válido.',
      order: prismaOrderToOrder(updated),
    };
  }

  // Para pedidos normales (stockDeducted === true): comportamiento actual.
  const transition = await prisma.order.updateMany({
    where: { id: orderId, status: 'Pendiente' satisfies OrderStatus },
    data: { status: 'En Proceso' satisfies OrderStatus, paidAt: new Date(), paymentVerifiedBy: adminEmail, paymentRejectionReason: null },
  });

  if (transition.count === 0) {
    // Otro admin movió el pedido entre la lectura y la escritura.
    const current = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (current?.status === ('En Proceso' satisfies OrderStatus)) {
      const already = await loadFullOrder(orderId);
      return {
        success: true,
        message: 'El pago ya estaba validado.',
        order: prismaOrderToOrder(already!),
      };
    }
    return {
      success: false,
      message: 'El pedido cambió de estado mientras se validaba. Recarga e intenta de nuevo.',
    };
  }

  const updated = (await loadFullOrder(orderId))!;

  const recipientEmail =
    updated.customerEmail?.trim() || updated.customer?.email?.trim() || '';
  const displayNameForEmail =
    updated.customerName?.trim() || updated.customer?.name?.trim() || '';

  await sendPaymentValidatedEmail(
    recipientEmail,
    firstNameFromCustomerName(displayNameForEmail),
    String(updated.orderNumber).padStart(4, '0'),
    updated.id
  );

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${orderPathSegment(updated.orderNumber)}`);

  return {
    success: true,
    message: 'Pago marcado como verificado y cliente notificado cuando hay correo válido.',
    order: prismaOrderToOrder(updated),
  };
}

/** PRD-026: el rechazo de pago solo aplica mientras el pago está en revisión. */
const REJECTABLE_STATUSES: readonly OrderStatus[] = [
  'Pendiente verificación Binance',
  'Pendiente',
];

/**
 * Rechaza el pago de un pedido en revisión: lo cancela, registra el motivo y al
 * admin que lo rechazó, restaura el stock reservado, revierte el cupón
 * (PRD-190) y notifica al cliente.
 *
 * PRD-026: prohibido rechazar pedidos ya avanzados (`En Proceso`, `Enviado`,
 * `Entregado`) — para esos casos el flujo correcto es el cambio de estado /
 * cancelación formal del panel, no el rechazo de pago.
 */
export async function rejectOrderPayment(
  orderId: string,
  reason: string
): Promise<ValidateOrderPaymentResult> {
  const adminEmail: string | null = null;
  try {
    await requirePermissionAction('PAYMENTS');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }

  const cleanReason = reason.trim().slice(0, 500) || 'Pago no verificado por el equipo.';

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      stockDeducted: true,
      items: { select: { productId: true, quantity: true } },
    },
  });

  if (!existing) {
    return { success: false, message: 'Pedido no encontrado.' };
  }
  if (existing.status === ('Cancelado' satisfies OrderStatus)) {
    return { success: false, message: 'El pedido ya está cancelado.' };
  }
  if (!REJECTABLE_STATUSES.includes(existing.status as OrderStatus)) {
    return {
      success: false,
      message:
        'Solo se puede rechazar el pago de pedidos en verificación (Pendiente o Binance). ' +
        'Para pedidos avanzados usa el cambio de estado a Cancelado.',
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    // PRD-196: transición condicionada al estado leído — si otro admin lo
    // movió en paralelo (p. ej. ya validó el pago), no se toca nada.
    const transition = await tx.order.updateMany({
      where: { id: orderId, status: { in: [...REJECTABLE_STATUSES] } },
      data: {
        status: 'Cancelado' satisfies OrderStatus,
        paymentRejectionReason: cleanReason,
        paymentVerifiedBy: adminEmail,
      },
    });
    if (transition.count === 0) return null;

    // Pasar stockDeducted para que solo restaure si el stock fue descontado.
    // Status en BD ya es Cancelado; reclamar con stockClaimStatus.
    await applyOrderCancellationEffectsInTransaction(
      tx,
      {
        id: orderId,
        status: existing.status,
        items: existing.items,
        stockDeducted: existing.stockDeducted ?? true,
      },
      { stockClaimStatus: 'Cancelado' },
    );

    return tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: { select: { email: true, name: true } },
      },
    });
  });

  if (!updated) {
    return {
      success: false,
      message: 'El pedido cambió de estado mientras se rechazaba. Recarga e intenta de nuevo.',
    };
  }

  const recipientEmail =
    updated.customerEmail?.trim() || updated.customer?.email?.trim() || '';
  const displayNameForEmail =
    updated.customerName?.trim() || updated.customer?.name?.trim() || '';

  await sendPaymentRejectedEmail(
    recipientEmail,
    firstNameFromCustomerName(displayNameForEmail),
    String(updated.orderNumber).padStart(4, '0'),
    cleanReason,
    updated.id
  );

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/account/orders');
  revalidatePath(`/account/orders/${orderPathSegment(updated.orderNumber)}`);

  return {
    success: true,
    message: 'Pago rechazado: pedido cancelado, stock restaurado y cliente notificado.',
    order: prismaOrderToOrder(updated),
  };
}
