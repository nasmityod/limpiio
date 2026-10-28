import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { OrderStatus } from '@/lib/definitions';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { orderPathSegment } from '@/lib/order-ref';
import { sendOrderCancelledEmail } from '@/lib/resend';
import { queueTransactionalEmails } from '@/lib/email-outbox-context';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';

const AUTO_CANCEL_AFTER_HOURS = 48;
const BATCH_LIMIT = 100;

const AUTO_CANCELLABLE_STATUSES = [
  'Pendiente',
  'Pendiente verificación Binance',
] as const satisfies readonly OrderStatus[];

/**
 * Cancela automáticamente pedidos pendientes tras AUTO_CANCEL_AFTER_HOURS
 * horas sin pago. Protección: Authorization: Bearer <CRON_SECRET> (timing-safe).
 * Este proyecto usa el crontab del VPS, no x-vercel-cron.
 */
function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return verifyBearerSecret(request, cronSecret);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - AUTO_CANCEL_AFTER_HOURS * 60 * 60 * 1000);

    const candidates = await prisma.order.findMany({
      where: {
        status: { in: [...AUTO_CANCELLABLE_STATUSES] },
        createdAt: { lte: cutoff },
        paidAt: null,
        // SEC-2026-09 (#17): un pedido con comprobante subido o referencia de pago
        // AFIRMA haber pagado; cancelarlo por inactividad del equipo (fin de semana
        // largo sin validar) devolvía stock y mandaba «no pudimos verificar tu pago»
        // a alguien que sí pagó. Esos pedidos los cierra un humano (rechazar pago).
        paymentProofKey: null,
        OR: [{ paymentReference: null }, { paymentReference: '' }],
        // Fase 8 (docs/cashea-orquestacion.md): los pedidos
        // Cashea (casheaStatus no nulo) NUNCA se autocancelan a las 48h por
        // este cron — su ciclo de vida (EXPIRED, recuperación manual,
        // cancelación explícita) lo gestiona exclusivamente
        // /api/cron/cashea-reconcile.
        casheaStatus: null,
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_LIMIT,
      select: {
        id: true,
        createdAt: true,
      },
    });

    let cancelled = 0;
    let skipped = 0;
    let emailAttempts = 0;
    const emailErrors = 0; // Provider attempts belong to the durable dispatcher.

    for (const candidate of candidates) {
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({
          where: { id: candidate.id },
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            status: true,
            paidAt: true,
            casheaStatus: true,
            updatedAt: true,
            paymentProofKey: true,
            paymentReference: true,
            customerName: true,
            customerEmail: true,
            stockDeducted: true,
            items: {
              select: {
                productId: true,
                quantity: true,
              },
            },
            customer: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        });

        if (!current) return null;

        if (
          !AUTO_CANCELLABLE_STATUSES.includes(current.status as (typeof AUTO_CANCELLABLE_STATUSES)[number]) ||
          current.createdAt > cutoff ||
          current.paidAt !== null ||
          current.casheaStatus != null ||
          current.paymentProofKey !== null ||
          (current.paymentReference ?? '').trim() !== ''
        ) {
          return null;
        }

        const transition = await tx.order.updateMany({
          where: {
            id: current.id,
            status: current.status,
            createdAt: { lte: cutoff },
            paidAt: null,
            casheaStatus: null,
            paymentProofKey: null,
            OR: [{ paymentReference: null }, { paymentReference: '' }],
            updatedAt: current.updatedAt,
          },
          data: {
            status: 'Cancelado' satisfies OrderStatus,
          },
        });

        if (transition.count !== 1) return null;

        // Status en BD ya es Cancelado; conservar el original en `order.status`
        // para shouldRestoreStockOnCancel y reclamar con stockClaimStatus.
        await applyOrderCancellationEffectsInTransaction(
          tx,
          {
            id: current.id,
            status: current.status,
            items: current.items,
            stockDeducted: current.stockDeducted ?? true,
          },
          { stockClaimStatus: 'Cancelado' },
        );

        const recipient = current.customerEmail?.trim() || current.customer?.email?.trim() || '';
        const firstName = (current.customerName?.trim() || current.customer?.name?.trim() || '').split(/\s+/)[0] || 'Cliente';
        if (recipient) await queueTransactionalEmails(tx, () => sendOrderCancelledEmail(
          recipient, firstName, orderPathSegment(current.orderNumber), { expiredAfterHours: AUTO_CANCEL_AFTER_HOURS },
        ));
        return {
          emailQueued: !!recipient,
          id: current.id,
          orderNumber: current.orderNumber,
          customerName: current.customerName,
          customerEmail: current.customerEmail,
          fallbackCustomerEmail: current.customer?.email ?? null,
          fallbackCustomerName: current.customer?.name ?? null,
        };
      });

      if (!result) {
        skipped++;
        continue;
      }

      cancelled++;

      if (result.emailQueued) emailAttempts++;

    }

    await prisma.appConfig.upsert({
      where: { key: 'auto_cancel_orders_last_success_at' },
      update: { value: now.toISOString() },
      create: {
        key: 'auto_cancel_orders_last_success_at',
        value: now.toISOString(),
      },
    });

    logInfo('cron_auto_cancel_orders', {
      count: cancelled,
      operation: 'auto_cancel_orders',
    });

    return NextResponse.json({
      ok: true,
      cutoff: cutoff.toISOString(),
      attempted: candidates.length,
      cancelled,
      skipped,
      emailAttempts,
      emailErrors,
      hasMore: candidates.length === BATCH_LIMIT,
    });
  } catch (err) {
    logError('cron_auto_cancel_orders_error', err, { operation: 'auto_cancel_orders' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
