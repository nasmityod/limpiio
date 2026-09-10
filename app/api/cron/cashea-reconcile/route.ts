import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isCasheaEnabled } from '@/lib/cashea-config';
import { processCasheaConfirmation } from '@/lib/cashea-reconcile';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/cashea-reconcile — Fase 8 ("Fase 8 — Cron de reconciliación"
 * en docs/MundoTech-Cashea-Orquestacion-Cursor.md).
 *
 * Reglas globales (Sección 7 del documento maestro — copiadas literal):
 * - No modificar el flujo de pago existente (Pago Móvil, Zelle, Binance,
 *   efectivo) salvo lo indicado.
 * - No cambiar CHECKOUT_MODE, ni los precios autoritativos, ni la lógica
 *   transaccional/Serializable existente.
 * - No introducir dependencias nuevas salvo cashea-web-checkout-sdk@1.1.19
 *   fijada exacta (no aplica en esta fase).
 * - No exponer la clave privada al cliente ni loguear secretos.
 * - No confiar en la URL de retorno como prueba de pago.
 * - No autocancelar pedidos Cashea a los 60 min (solo marcar EXPIRED,
 *   mantener para recuperación manual).
 * - No permitir Cashea a usuarios invitados en ningún modo.
 * - No permitir cupones cuando el método es Cashea.
 * - No enviar deliveryPrice distinto de 0.
 * - No inventar el contrato del API: lo dependiente de Cashea queda tras
 *   verifyCasheaOrder con TODO explícito y tipado.
 *
 * Dos tareas independientes por corrida, ninguna cancela pedidos:
 *
 * 1. Reconciliación: reintenta `processCasheaConfirmation(orderId)`
 *    (lib/cashea-reconcile.ts, Fase 5 — ya idempotente y con lock optimista
 *    propio) para pedidos `RETURNED`/`VERIFYING` con `casheaOrderId`
 *    presente. Límite de intentos (`MAX_RECONCILE_ATTEMPTS`) y backoff simple
 *    basado en `updatedAt` + `casheaAttemptCount` para no golpear el API de
 *    Cashea en cada corrida. Toda la incertidumbre del contrato de
 *    verificación sigue aislada en `verifyCasheaOrder` (lib/cashea.ts) — este
 *    cron no la reimplementa, solo reintenta la función existente.
 * 2. Expiración: marca `EXPIRED` (NUNCA cancela) los pedidos
 *    `CREATED`/`REDIRECTED`/`RETURNED` cuya `casheaReservationExpiresAt`
 *    venció sin confirmar (Sección 6: transición válida
 *    `CREATED/REDIRECTED/RETURNED -> EXPIRED`). Decisión de producto
 *    (Sección 1/7): el inventario reservado/deducido en el checkout Cashea
 *    (Fase 4) NO se restaura aquí — el pedido `EXPIRED` queda disponible para
 *    recuperación manual (admin/soporte contacta al cliente); solo la
 *    cancelación explícita (`POST /api/cashea/cancel`, admin o dueño) libera
 *    el stock reservado.
 *
 * Crontab (root, TZ America/Caracas — pendiente de alta en deploy/crontab.vps
 * fuera del alcance de esta fase; ver Sección 8 del documento):
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/cashea-reconcile
 */

const RECONCILE_BATCH_LIMIT = 50;
const MAX_RECONCILE_ATTEMPTS = 20;
const BACKOFF_BASE_MINUTES = 5;
const BACKOFF_MAX_MINUTES = 60;

const RECONCILABLE_STATUSES = ['RETURNED', 'VERIFYING'] as const;
const EXPIRABLE_STATUSES = ['CREATED', 'REDIRECTED', 'RETURNED'] as const;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return verifyBearerSecret(request, cronSecret);
}

/** Backoff simple: cuanto más se reintentó un pedido, más se espera entre intentos (tope 60 min). */
function backoffCutoff(now: Date, attemptCount: number): Date {
  const minutes = Math.min(BACKOFF_BASE_MINUTES * (attemptCount + 1), BACKOFF_MAX_MINUTES);
  return new Date(now.getTime() - minutes * 60 * 1000);
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Sección 8: "con flag off el cron nuevo no hace nada". No revela nada del
  // estado de la integración; simplemente no toca la base de datos.
  if (!isCasheaEnabled()) {
    return NextResponse.json({ ok: true, enabled: false, reconciled: 0, expired: 0 });
  }

  const now = new Date();

  try {
    const candidates = await prisma.order.findMany({
      where: {
        casheaStatus: { in: [...RECONCILABLE_STATUSES] },
        casheaOrderId: { not: null },
        casheaAttemptCount: { lt: MAX_RECONCILE_ATTEMPTS },
      },
      orderBy: { updatedAt: 'asc' },
      take: RECONCILE_BATCH_LIMIT,
      select: { id: true, casheaAttemptCount: true, updatedAt: true },
    });

    let reconciled = 0;
    let confirmed = 0;
    let skippedBackoff = 0;
    let reconcileErrors = 0;

    for (const candidate of candidates) {
      if (candidate.updatedAt > backoffCutoff(now, candidate.casheaAttemptCount)) {
        skippedBackoff++;
        continue;
      }

      try {
        const result = await processCasheaConfirmation(candidate.id);
        reconciled++;
        if (result.outcome === 'confirmed') confirmed++;
      } catch (error) {
        reconcileErrors++;
        logError('cashea_reconcile_cron_item_failed', error, {
          operation: 'cashea_reconcile_cron',
          orderId: candidate.id,
        });
      }
    }

    // Expiración de reservas vencidas (Sección 6/7): solo marca, nunca cancela
    // ni restaura stock. Deliberadamente independiente del bucle anterior:
    // corre siempre, incluso si no hubo candidatos a reconciliar.
    const expired = await prisma.order.updateMany({
      where: {
        casheaStatus: { in: [...EXPIRABLE_STATUSES] },
        casheaReservationExpiresAt: { lt: now },
      },
      data: { casheaStatus: 'EXPIRED' },
    });

    logInfo('cron_cashea_reconcile', {
      operation: 'cashea_reconcile_cron',
      count: reconciled,
    });

    return NextResponse.json({
      ok: true,
      enabled: true,
      attempted: candidates.length,
      reconciled,
      confirmed,
      skippedBackoff,
      reconcileErrors,
      expired: expired.count,
    });
  } catch (error) {
    logError('cron_cashea_reconcile_error', error, { operation: 'cashea_reconcile_cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
