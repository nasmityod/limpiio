import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/admin-access-server';
import { isCasheaEnabled } from '@/lib/cashea-config';
import { processCasheaConfirmation } from '@/lib/cashea-reconcile';
import { prismaOrderToOrder } from '@/lib/definitions';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { logError, logInfo } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orders/[id]/cashea-verify — Fase 7 ("Página de éxito, correos y
 * panel admin" en docs/MundoTech-Cashea-Orquestacion-Cursor.md), acción
 * admin "Verificar ahora" del bloque Cashea en `/admin/orders/[id]`.
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
 * Solo un reintento manual de `processCasheaConfirmation` (mismo adaptador
 * idempotente de la Fase 5) — visible y accionable SOLO para admin con
 * permiso ORDERS. Mientras `verifyCasheaOrder` siga lanzando
 * `CasheaVerificationNotImplemented` (Sección 4/12), el pedido queda
 * pendiente sin importar cuántas veces se reintente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Guard del flag: si Cashea está apagado, 404 (no revelar la feature).
  if (!isCasheaEnabled()) {
    return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });
  }

  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  // Acción admin exclusiva (Fase 7, punto 3: "visibles solo para admin").
  const auth = await requirePermission('ORDERS');
  if (!auth.authorized) return auth.response;

  const { id: orderId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, casheaStatus: true },
    });

    // Sin casheaStatus => nunca fue un pedido Cashea; esta acción es exclusiva del método Cashea.
    if (!order || order.casheaStatus === null) {
      return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
    }

    const result = await processCasheaConfirmation(order.id);

    const updated = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });
    if (!updated) {
      return NextResponse.json({ message: 'Pedido no encontrado.' }, { status: 404 });
    }

    logInfo('cashea_manual_verify', { operation: 'cashea_manual_verify', orderId: order.id, status: result.outcome });
    return NextResponse.json({ outcome: result.outcome, order: prismaOrderToOrder(updated) });
  } catch (error) {
    logError('cashea_manual_verify_failed', error, { operation: 'cashea_manual_verify', orderId });
    return NextResponse.json(
      { message: 'No se pudo verificar el pedido. Intenta de nuevo en unos minutos.' },
      { status: 500 },
    );
  }
}
