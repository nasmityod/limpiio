import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isCasheaEnabled } from '@/lib/cashea-config';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/security';
import { processCasheaConfirmation } from '@/lib/cashea-reconcile';
import { logInfo, logWarn } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /checkout/cashea/return?token=...&idNumber=... — Fase 5 ("Fase 5 —
 * Retorno, verificación idempotente y cancelación" en
 * docs/MundoTech-Cashea-Orquestacion-Cursor.md).
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
 * IMPORTANTE (Sección 3.10/3.11 y Fase 5): el simple retorno del navegador
 * NUNCA es prueba de pago. Este handler solo guarda el `idNumber` recibido y
 * marca `RETURNED`; la confirmación real ocurre en
 * `processCasheaConfirmation` (lib/cashea-reconcile.ts), que llama al
 * adaptador `verifyCasheaOrder`.
 *
 * `idNumber` sin confirmar (Sección 12, pregunta 6): no hay documentación de
 * Cashea sobre qué otros parámetros puede traer la URL de retorno (estado,
 * resultado, cancelación) — este handler solo lee `token` e `idNumber` y
 * ignora cualquier otro parámetro, para no inventar comportamiento no
 * documentado.
 */

/** Redirección neutra: nunca revela si el token/pedido existe, expiró o ya se usó. */
function neutralRedirect(request: Request): NextResponse {
  return NextResponse.redirect(new URL('/checkout', request.url));
}

function successRedirect(request: Request, orderId: string): NextResponse {
  const url = new URL('/checkout/success', request.url);
  // app/checkout/success/page.tsx (Fase 7 mostrará el detalle por casheaStatus;
  // aquí solo se enlaza al pedido, mismo contrato que el resto del checkout).
  url.searchParams.set('orderId', orderId);
  return NextResponse.redirect(url);
}

// Sección 11.Seguridad (Fase 3) — mismo patrón anti path/SSRF injection que casheaOrderId.
const CASHEA_ID_NUMBER_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(request: Request): Promise<NextResponse> {
  // Guard flag off -> redirige a /checkout con aviso genérico (Fase 5, punto 1).
  if (!isCasheaEnabled()) {
    return neutralRedirect(request);
  }

  // Exige sesión (Fase 5, punto 2; Sección 1/7: Cashea nunca permite invitados).
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return neutralRedirect(request);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  if (!token) {
    return neutralRedirect(request);
  }

  const rawIdNumber = url.searchParams.get('idNumber')?.trim() || null;
  if (rawIdNumber && !CASHEA_ID_NUMBER_RE.test(rawIdNumber)) {
    logWarn('cashea_return_invalid_id_number', { operation: 'cashea_return' });
    return neutralRedirect(request);
  }

  const tokenHash = hashToken(token);
  const order = await prisma.order.findFirst({
    where: { casheaReturnTokenHash: tokenHash },
    select: { id: true, customerId: true, casheaOrderId: true },
  });

  // Token inexistente, ya consumido, o pedido de otro usuario: misma
  // respuesta neutra (anti-enumeración; no confirma ni niega nada — Fase 5, punto 3).
  if (!order || order.customerId !== userId) {
    return neutralRedirect(request);
  }

  // Consumo de un solo uso: el `where` exige que el hash siga siendo el mismo,
  // así una segunda petición concurrente con el mismo token pierde la carrera
  // (count 0) y no reconfirma ni reexpone nada.
  const consumed = await prisma.order.updateMany({
    where: { id: order.id, casheaReturnTokenHash: tokenHash },
    data: {
      casheaReturnTokenHash: null,
      casheaReturnedAt: new Date(),
      casheaStatus: 'RETURNED',
      // Guarda idNumber SOLO si el pedido no tenía uno todavía (Fase 5, punto 4).
      ...(rawIdNumber && !order.casheaOrderId ? { casheaOrderId: rawIdNumber } : {}),
    },
  });

  if (consumed.count !== 1) {
    return neutralRedirect(request);
  }

  logInfo('cashea_order_returned', { operation: 'cashea_return', orderId: order.id });

  // La verificación autoritativa decide el estado real; el retorno del
  // navegador nunca confirma pago por sí mismo (Fase 5, punto 5).
  await processCasheaConfirmation(order.id);

  return successRedirect(request, order.id);
}
