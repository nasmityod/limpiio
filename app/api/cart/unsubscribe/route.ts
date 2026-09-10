import { NextRequest, NextResponse } from 'next/server';
import { markCartOptedOut, findAbandonedCartByRecoveryToken } from '@/lib/abandoned-cart';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin } from '@/lib/security';
import { emailSiteBaseUrl } from '@/emails/mundotech/site';

/**
 * GET /api/cart/unsubscribe?token=<recoveryToken>
 *
 * PRD-179: antes ejecutaba la baja en el GET, lo cual la disparaban los
 * escáneres de correo (previsualización de enlaces). Ahora el GET solo valida
 * el token y redirige a la página de confirmación. La baja real ocurre en POST.
 *
 * PRD-219: rate limit por IP — sin él, un tercero podía iterar tokens y
 * dar de baja remarketing ajeno en masa.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const base = emailSiteBaseUrl().replace(/\/$/, '');

  const ip = getClientIp(req);
  if (await rateLimit(`cart:unsubscribe:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return NextResponse.redirect(`${base}/?unsubscribed=rate-limited`);
  }

  const token = req.nextUrl.searchParams.get('token')?.trim() ?? '';

  if (!token) {
    return NextResponse.redirect(`${base}/?unsubscribed=invalid`);
  }

  // PRD-219: validar que el token exista antes de redirigir a confirmación.
  const cart = await findAbandonedCartByRecoveryToken(token);
  if (!cart) {
    return NextResponse.redirect(`${base}/?unsubscribed=invalid`);
  }

  // Redirige a la página de confirmación — la baja real ocurre solo en POST.
  return NextResponse.redirect(
    `${base}/cart/unsubscribe/confirm?token=${encodeURIComponent(token)}`
  );
}

/**
 * POST /api/cart/unsubscribe
 * Body: { token: string }
 *
 * PRD-179: ejecuta la baja real. Solo se llega aquí tras confirmar
 * explícitamente en la página de confirmación (botón "Confirmar baja").
 * Aplica el mismo rate limit por IP que el GET para prevenir abuso.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // SEC-02 (AUDITORIA-2026-07): mutación pública — mismo guard CSRF que cart/orders.
  const originCheck = rejectInvalidMutationOrigin(req);
  if (originCheck) return originCheck;

  const ip = getClientIp(req);
  if (await rateLimit(`cart:unsubscribe:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: 'rate-limited' }, { status: 429 });
  }

  let token: string;
  try {
    const body = await req.json() as { token?: unknown };
    token = (typeof body?.token === 'string' ? body.token : '').trim();
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  const cart = await findAbandonedCartByRecoveryToken(token);
  if (!cart) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await markCartOptedOut(token);
  return NextResponse.json({ ok: true });
}
