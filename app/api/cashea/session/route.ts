import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isCasheaEnabled } from '@/lib/cashea-config';
import { createCasheaSession } from '@/lib/cashea-session';
import { CheckoutError } from '@/lib/checkout-error';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, buildRateLimitedResponse } from '@/lib/security';
import { logError, logWarn } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cashea/session — Fase 4 ("Fase 4 — Endpoint backend de creación
 * de sesión Cashea" en docs/MundoTech-Cashea-Orquestacion-Cursor.md).
 *
 * Crea la sesión de checkout Cashea: pedido local + reserva de inventario +
 * token de retorno de un solo uso + payload calculado en servidor. Toda la
 * lógica de negocio vive en `lib/cashea-session.ts`; esta ruta solo aplica
 * los mismos guards de seguridad que `POST /api/orders`.
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
 */
export async function POST(request: Request) {
  // Guard del flag: si Cashea está apagado, 404 (no revelar la feature) —
  // antes de cualquier otra validación (auth, CSRF, rate limit).
  if (!isCasheaEnabled()) {
    return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });
  }

  // Mismos guards de seguridad que POST /api/orders (Sección "Fase 4", punto 2).
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  const ip = getClientIp(request);
  const ipResult = await rateLimitCritical(`cashea:session:post:ip:${hashForBucket(ip)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (ipResult.limited) {
    return buildRateLimitedResponse(
      ipResult.retryAfterSeconds,
      'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.',
    );
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Cashea exige sesión iniciada SIEMPRE (ambos modos) — invitados -> 401
  // (Sección 1/7 del documento maestro: login obligatorio para Cashea).
  if (!userId) {
    return NextResponse.json(
      { message: 'Debes iniciar sesión para pagar con Cashea.' },
      { status: 401 },
    );
  }

  const userResult = await rateLimitCritical(`cashea:session:post:user:${hashForBucket(userId)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (userResult.limited) {
    return buildRateLimitedResponse(
      60,
      'Demasiadas solicitudes. Espera un momento antes de intentarlo de nuevo.',
    );
  }

  try {
    const body = await request.json();
    const result = await createCasheaSession({ userId, body });

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      logWarn('cashea_session_rejected', {
        operation: 'cashea_session',
        route: '/api/cashea/session',
        status: error.httpStatus,
      });
      return NextResponse.json({ message: error.message }, { status: error.httpStatus });
    }
    logError('cashea_session_failed', error, {
      operation: 'cashea_session',
      route: '/api/cashea/session',
    });
    return NextResponse.json(
      { message: 'No pudimos iniciar tu sesión de Cashea. Intenta de nuevo en unos minutos.' },
      { status: 500 },
    );
  }
}
