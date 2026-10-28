import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { prismaOrderToOrder, type OrderStatus } from '@/lib/definitions';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { sendPaymentValidatedEmail } from '@/lib/resend';
import { logError, logInfo } from '@/lib/safe-logger';
import { orderSnapshotGuard } from '@/lib/order-lifecycle';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';

const BINANCE_PENDING: OrderStatus = 'Pendiente verificación Binance';
const APPROVED_STATUS: OrderStatus = 'En Proceso';

function firstNameFromCustomerName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return 'Cliente';
  return t.split(/\s+/)[0] ?? t;
}

/**
 * POST /api/orders/[id]/approve-binance
 *
 * PRD-028 «Aprobar y preparar»: verificar el pago Binance es UN solo paso —
 * el pedido pasa directo a "En Proceso" (pago verificado), sella `paidAt`
 * (PRD-198: paidAt se fija únicamente en el momento de la verificación) y
 * notifica al cliente. Ya no hace falta el segundo clic en "Validar pago".
 *
 * El stock ya fue decrementado atómicamente en el checkout
 * (POST /api/orders); esta ruta no toca inventario.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // PRD-199: mitigación CSRF — mismo hardening que el resto de mutaciones de pedidos.
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const auth = await requirePermission('PAYMENTS');
  if (!auth.authorized) return auth.response;
  const adminEmail = (auth.session.user as { email?: string } | undefined)?.email ?? null;

  const { id: orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, paidAt: true, casheaStatus: true, stockDeducted: true, updatedAt: true },
    });

    if (!order) {
      return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
    }
    // Idempotencia: doble clic / segundo admin no debe producir error visible.
    if (order.status === APPROVED_STATUS && order.paidAt && !order.casheaStatus) {
      const already = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      return NextResponse.json(prismaOrderToOrder(already!));
    }
    if (order.status !== BINANCE_PENDING || order.casheaStatus || !order.stockDeducted) {
      return NextResponse.json(
        { message: 'Este pedido no está pendiente de verificación Binance.' },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: { ...orderSnapshotGuard(order), paidAt: null, casheaStatus: null },
        data: { status: APPROVED_STATUS, paidAt: new Date(), paymentVerifiedBy: adminEmail, paymentRejectionReason: null },
      });
      if (transition.count !== 1) return null;
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, customer: { select: { email: true, name: true } } },
      });
      const recipientEmail = current.customerEmail?.trim() || current.customer?.email?.trim() || '';
      const displayName = current.customerName?.trim() || current.customer?.name?.trim() || '';
      if (recipientEmail) await queueTransactionalEmails(tx, () => sendPaymentValidatedEmail(
        recipientEmail, firstNameFromCustomerName(displayName), String(current.orderNumber).padStart(4, '0'), current.id,
      ));
      return current;
    });
    if (!updated) return NextResponse.json({ message: 'El pedido cambió de estado mientras se aprobaba. Recarga e intenta de nuevo.' }, { status: 409 });

    logInfo('approve_binance_success', { orderId });
    return NextResponse.json(prismaOrderToOrder(updated!));
  } catch (error) {
    logError('approve_binance_error', error, { orderId });
    return NextResponse.json({ message: 'No se pudo aprobar el pago.' }, { status: 500 });
  }
}
