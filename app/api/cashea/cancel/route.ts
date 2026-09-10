import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isCasheaEnabled } from '@/lib/cashea-config';
import { cancelCasheaOrder } from '@/lib/cashea';
import { prisma } from '@/lib/prisma';
import { applyOrderCancellationEffectsInTransaction } from '@/lib/checkout-order';
import { requirePermission } from '@/lib/admin-access-server';
import {
  rejectInvalidMutationOrigin,
  buildRateLimitedResponse,
} from '@/lib/security';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { logError, logInfo, logWarn } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cashea/cancel — Fase 5 ("Fase 5 — Retorno, verificación
 * idempotente y cancelación" en docs/MundoTech-Cashea-Orquestacion-Cursor.md).
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
 * - No autocancelar pedidos Cashea a los 60 min.
 * - No permitir Cashea a usuarios invitados en ningún modo.
 * - No permitir cupones cuando el método es Cashea.
 * - No enviar deliveryPrice distinto de 0.
 * - No inventar el contrato del API: lo dependiente de Cashea queda tras
 *   verifyCasheaOrder con TODO explícito y tipado.
 *
 * Cancelación por el dueño del pedido o un admin (Fase 5): un pedido ya
 * `CONFIRMED` (inicial verificada por Cashea) NUNCA se cancela por esta vía.
 */

const bodySchema = z.object({
  orderId: z.string().trim().min(1).max(64),
});

const NON_CANCELLABLE_CASHEA_STATUSES = ['CONFIRMED'] as const;

export async function POST(request: Request): Promise<NextResponse> {
  // Guard del flag: si Cashea está apagado, 404 (no revelar la feature).
  if (!isCasheaEnabled()) {
    return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });
  }

  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ message: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const ipResult = await rateLimitCritical(`cashea:cancel:post:ip:${hashForBucket(ip)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (ipResult.limited) {
    return buildRateLimitedResponse(ipResult.retryAfterSeconds);
  }
  const userResult = await rateLimitCritical(`cashea:cancel:post:user:${hashForBucket(userId)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (userResult.limited) {
    return buildRateLimitedResponse(userResult.retryAfterSeconds);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Datos inválidos.' }, { status: 400 });
  }
  const { orderId } = parsed.data;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        status: true,
        stockDeducted: true,
        casheaStatus: true,
        casheaOrderId: true,
        items: { select: { productId: true, quantity: true } },
      },
    });

    // Sin casheaStatus => nunca fue un pedido Cashea; esta ruta es exclusiva
    // del método Cashea.
    if (!order || order.casheaStatus === null) {
      return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
    }

    const isOwner = order.customerId === userId;
    if (!isOwner) {
      const auth = await requirePermission('ORDERS');
      if (!auth.authorized) {
        return NextResponse.json({ message: 'No autorizado.' }, { status: 403 });
      }
    }

    // Pago confirmado NUNCA se cancela por esta vía (Fase 5, punto 2).
    if (NON_CANCELLABLE_CASHEA_STATUSES.includes(order.casheaStatus as 'CONFIRMED')) {
      return NextResponse.json(
        { message: 'Este pedido ya fue confirmado; no se puede cancelar por esta vía.' },
        { status: 409 },
      );
    }

    // Idempotencia: ya cancelado -> no-op (Fase 5: "idempotente ante reintentos").
    if (order.casheaStatus === 'CANCELLED') {
      return NextResponse.json({ ok: true, status: 'CANCELLED' });
    }

    // Transición optimista a CANCEL_PENDING: si otra petición concurrente ya
    // movió el estado a CONFIRMED/CANCELLED, esta llamada se convierte en no-op
    // más abajo (se relee el estado real antes de cancelar en remoto).
    await prisma.order.updateMany({
      where: { id: order.id, casheaStatus: { notIn: ['CONFIRMED', 'CANCELLED'] } },
      data: { casheaStatus: 'CANCEL_PENDING' },
    });

    // Cancela en Cashea de forma idempotente (Fase 3: 200 o "ya cancelada" = ok)
    // ANTES de tocar inventario local — solo si ya existe una orden remota.
    if (order.casheaOrderId) {
      try {
        const remote = await cancelCasheaOrder(order.casheaOrderId);
        if (!remote.ok) {
          logWarn('cashea_cancel_remote_rejected', {
            operation: 'cashea_cancel',
            orderId: order.id,
            status: remote.status,
          });
          return NextResponse.json(
            { message: 'No pudimos cancelar la orden en Cashea. Intenta de nuevo en unos minutos.' },
            { status: 502 },
          );
        }
      } catch (remoteError) {
        logError('cashea_cancel_remote_error', remoteError, {
          operation: 'cashea_cancel',
          orderId: order.id,
        });
        return NextResponse.json(
          { message: 'No pudimos cancelar la orden en Cashea. Intenta de nuevo en unos minutos.' },
          { status: 502 },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });
      if (!current) return null;

      // Idempotencia dentro de la transacción: si ya está CANCELLED (reintento
      // concurrente) o pasó a CONFIRMED mientras se cancelaba en remoto, no
      // tocar inventario ni estado otra vez.
      if (current.casheaStatus === 'CANCELLED') {
        return { alreadyCancelled: true as const };
      }
      if (current.casheaStatus === 'CONFIRMED') {
        return { conflict: true as const };
      }

      await applyOrderCancellationEffectsInTransaction(tx, {
        id: current.id,
        status: current.status,
        items: current.items,
        stockDeducted: current.stockDeducted,
      });

      // Transición condicional local: id + casheaStatus + status del snapshot.
      // Solo count === 1 afirma que esta petición completó la cancelación.
      const transition = await tx.order.updateMany({
        where: {
          id: current.id,
          casheaStatus: current.casheaStatus,
          status: current.status,
        },
        data: {
          status: 'Cancelado',
          casheaStatus: 'CANCELLED',
          casheaCancelledAt: new Date(),
        },
      });

      if (transition.count === 1) {
        return { cancelled: true as const };
      }

      const raced = await tx.order.findUnique({
        where: { id: current.id },
        select: { casheaStatus: true },
      });
      if (raced?.casheaStatus === 'CANCELLED') {
        return { alreadyCancelled: true as const };
      }
      if (raced?.casheaStatus === 'CONFIRMED') {
        return { conflict: true as const };
      }
      return { alreadyCancelled: true as const };
    });

    if (result?.conflict) {
      return NextResponse.json(
        { message: 'Este pedido ya fue confirmado; no se puede cancelar por esta vía.' },
        { status: 409 },
      );
    }

    // Solo la petición que ganó la transición local registra el éxito con
    // efectos; reintentos idempotentes responden igual sin afirmar restauración.
    if (result?.cancelled) {
      logInfo('cashea_cancel_success', { operation: 'cashea_cancel', orderId: order.id });
    }
    return NextResponse.json({ ok: true, status: 'CANCELLED' });
  } catch (error) {
    logError('cashea_cancel_failed', error, { operation: 'cashea_cancel' });
    return NextResponse.json(
      { message: 'No pudimos cancelar el pedido. Intenta de nuevo en unos minutos.' },
      { status: 500 },
    );
  }
}
