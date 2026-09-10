/**
 * lib/cashea-reconcile.ts — verificación idempotente de pedidos Cashea
 * (Fase 5, ver "Fase 5 — Retorno, verificación idempotente y cancelación" en
 * docs/MundoTech-Cashea-Orquestacion-Cursor.md).
 *
 * `processCasheaConfirmation(orderId)` es el único punto que transiciona un
 * pedido Cashea a `CONFIRMED` — y solo lo hace tras una llamada exitosa a
 * `verifyCasheaOrder` (lib/cashea.ts). Mientras esa función siga lanzando
 * `CasheaVerificationNotImplemented` (Sección 4/12), el pedido SIEMPRE queda
 * pendiente para recuperación manual — nunca se confirma sin evidencia.
 *
 * Lock: la Sección "Fase 5" pide tomar el pedido `FOR UPDATE` "o el patrón de
 * lock del repo". Este repo no usa `SELECT ... FOR UPDATE` en ningún sitio
 * (ver lib/checkout-order.ts, app/api/orders/[id]/approve-binance/route.ts):
 * usa transiciones optimistas con `updateMany({ where: { id, <estado de
 * origen> } })`, que fallan (count 0) si otro proceso ya movió el estado.
 * Se reutiliza ese mismo patrón aquí. La llamada de red a `verifyCasheaOrder`
 * se hace FUERA de cualquier transacción de BD (mantener una transacción
 * abierta durante I/O externo de hasta 15s —Sección 11.4— arriesga timeouts y
 * bloqueos); las escrituras resultantes (confirmar o revertir a RETURNED) se
 * agrupan en una única transacción atómica.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CasheaVerificationNotImplemented, verifyCasheaOrder } from '@/lib/cashea';
import { sendPaymentValidatedEmail } from '@/lib/resend';
import { logError, logInfo, logWarn } from '@/lib/safe-logger';

/** Estados desde los que es válido lanzar una verificación (Sección 6: máquina de estados). */
const VERIFIABLE_FROM = ['RETURNED', 'VERIFYING'] as const;
/** Estados finales: cualquier llamada posterior es un no-op idempotente. */
const FINAL_STATUSES = ['CONFIRMED', 'CANCELLED'] as const;

export type CasheaReconcileOutcome =
  | 'already_final'
  | 'not_verifiable'
  | 'confirmed'
  | 'pending_not_implemented'
  | 'pending_not_confirmed'
  | 'pending_error';

export type CasheaReconcileResult = {
  outcome: CasheaReconcileOutcome;
  casheaStatus: string | null;
};

type OrderForReconcile = {
  id: string;
  orderNumber: number;
  status: string;
  casheaStatus: string | null;
  casheaOrderId: string | null;
  casheaAttemptCount: number;
  casheaConfirmedAt: Date | null;
  customerName: string | null;
  customerEmail: string | null;
  customer: { email: string | null; name: string | null } | null;
};

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  casheaStatus: true,
  casheaOrderId: true,
  casheaAttemptCount: true,
  casheaConfirmedAt: true,
  customerName: true,
  customerEmail: true,
  customer: { select: { email: true, name: true } },
} satisfies Prisma.OrderSelect;

function firstNameFromDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return 'Cliente';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Revierte a `RETURNED` e incrementa el contador de intentos — pedido queda pendiente, nunca confirmado. */
async function revertToReturnedAfterFailedVerification(
  orderId: string,
  lastResponseCode: string,
): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, casheaStatus: 'VERIFYING' },
    data: {
      casheaStatus: 'RETURNED',
      casheaLastResponseCode: lastResponseCode,
      casheaAttemptCount: { increment: 1 },
    },
  });
}

/**
 * Idempotente: repetir la llamada para un pedido ya `CONFIRMED`/`CANCELLED`
 * no tiene efecto. Solo confirma (`paidAt`, estado `En Proceso`, email de
 * pago confirmado) cuando `verifyCasheaOrder` devuelve evidencia real.
 */
export async function processCasheaConfirmation(orderId: string): Promise<CasheaReconcileResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: ORDER_SELECT });

  if (!order || order.casheaStatus === null) {
    logWarn('cashea_reconcile_not_cashea_order', { operation: 'cashea_reconcile', orderId });
    return { outcome: 'not_verifiable', casheaStatus: order?.casheaStatus ?? null };
  }

  if (FINAL_STATUSES.includes(order.casheaStatus as (typeof FINAL_STATUSES)[number])) {
    return { outcome: 'already_final', casheaStatus: order.casheaStatus };
  }

  if (!VERIFIABLE_FROM.includes(order.casheaStatus as (typeof VERIFIABLE_FROM)[number])) {
    // CREATED/REDIRECTED/EXPIRED/CANCEL_PENDING/FAILED: aún no hay retorno o
    // ya está en un flujo de cancelación — no verificar (Sección 6: transiciones válidas).
    return { outcome: 'not_verifiable', casheaStatus: order.casheaStatus };
  }

  if (!order.casheaOrderId) {
    logWarn('cashea_reconcile_missing_order_id', { operation: 'cashea_reconcile', orderId });
    return { outcome: 'not_verifiable', casheaStatus: order.casheaStatus };
  }

  // Transición optimista a VERIFYING: si otra petición concurrente ya avanzó
  // el estado (p. ej. ya confirmó o canceló), esta llamada se vuelve un no-op.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, casheaStatus: { in: [...VERIFIABLE_FROM] } },
    data: { casheaStatus: 'VERIFYING' },
  });

  if (claimed.count === 0) {
    const current = await prisma.order.findUnique({ where: { id: order.id }, select: { casheaStatus: true } });
    return { outcome: 'already_final', casheaStatus: current?.casheaStatus ?? order.casheaStatus };
  }

  try {
    const verification = await verifyCasheaOrder(order.casheaOrderId);

    if (!verification.confirmed) {
      await revertToReturnedAfterFailedVerification(order.id, 'NOT_CONFIRMED');
      return { outcome: 'pending_not_confirmed', casheaStatus: 'RETURNED' };
    }

    return await confirmCasheaOrder(order, verification.initialAmount);
  } catch (error) {
    if (error instanceof CasheaVerificationNotImplemented) {
      // Único punto que depende del contrato final de Cashea (Sección 4) —
      // sin mecanismo confirmado, el pedido SIEMPRE queda pendiente.
      await revertToReturnedAfterFailedVerification(order.id, 'NOT_IMPLEMENTED');
      return { outcome: 'pending_not_implemented', casheaStatus: 'RETURNED' };
    }

    logError('cashea_reconcile_verify_failed', error, { operation: 'cashea_reconcile', orderId: order.id });
    await revertToReturnedAfterFailedVerification(order.id, 'ERROR');
    return { outcome: 'pending_error', casheaStatus: 'RETURNED' };
  }
}

/**
 * Marca CONFIRMED de forma atómica (transacción única con guard de estado de
 * origen) y envía el correo de pago confirmado UNA sola vez: solo cuando esta
 * llamada es la que efectivamente realiza la transición.
 */
async function confirmCasheaOrder(
  order: OrderForReconcile,
  initialAmount: number | undefined,
): Promise<CasheaReconcileResult> {
  const now = new Date();

  const { transitioned, updated } = await prisma.$transaction(async (tx) => {
    const transition = await tx.order.updateMany({
      where: { id: order.id, casheaStatus: 'VERIFYING' },
      data: {
        casheaStatus: 'CONFIRMED',
        casheaConfirmedAt: now,
        casheaLastResponseCode: 'CONFIRMED',
        ...(initialAmount != null ? { casheaInitialAmount: initialAmount } : {}),
        paidAt: now,
        status: 'En Proceso',
      },
    });

    const current = await tx.order.findUnique({
      where: { id: order.id },
      select: { ...ORDER_SELECT, casheaConfirmedAt: true },
    });

    return { transitioned: transition.count === 1, updated: current };
  });

  if (!transitioned) {
    // Otra petición concurrente ya confirmó (o canceló) este pedido primero.
    return { outcome: 'already_final', casheaStatus: updated?.casheaStatus ?? 'CONFIRMED' };
  }

  logInfo('cashea_order_confirmed', { operation: 'cashea_reconcile', orderId: order.id });

  const recipientEmail = order.customerEmail?.trim() || order.customer?.email?.trim() || '';
  const displayName = order.customerName?.trim() || order.customer?.name?.trim() || '';

  if (recipientEmail) {
    try {
      await sendPaymentValidatedEmail(
        recipientEmail,
        firstNameFromDisplayName(displayName),
        String(order.orderNumber).padStart(4, '0'),
        order.id,
        { casheaInitial: true },
      );
    } catch (emailError) {
      logError('cashea_confirmed_email_failed', emailError, {
        operation: 'cashea_reconcile',
        orderId: order.id,
        provider: 'resend',
      });
    }
  }

  return { outcome: 'confirmed', casheaStatus: 'CONFIRMED' };
}
