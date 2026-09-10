import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  findAbandonedCartByRecoveryToken,
  parseAbandonedCartItems,
} from '@/lib/abandoned-cart';
import { mergeCart } from '@/lib/cart';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { emailSiteBaseUrl } from '@/emails/mundotech/site';
import { logError } from '@/lib/safe-logger';

function siteUrl(path: string): string {
  return `${emailSiteBaseUrl().replace(/\/$/, '')}${path}`;
}

/**
 * GET /api/cart/recover?token=<recoveryToken>
 *
 * PRD-175: destino del CTA del email de carrito abandonado. Rehidrata el
 * carrito del cliente desde el snapshot guardado:
 *
 *  1. Valida el token (hasheado en BD) y que el carrito no esté dado de baja.
 *  2. Sin sesión → redirige a /login con retorno a esta misma URL (la compra
 *     exige cuenta); al volver, el merge se ejecuta con la sesión activa.
 *  3. Fusiona los ítems del snapshot con el carrito en BD del usuario
 *     (max(actual, snapshot), recortado al stock vigente) y redirige a /cart.
 *
 * No marca el carrito como RECOVERED: eso ocurre server-side al completar el
 * pedido (PRD-180). Es un GET sin efectos destructivos — solo agrega ítems al
 * carrito del usuario autenticado dueño del enlace.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (await rateLimit(`cart:recover:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 })) {
    return NextResponse.redirect(siteUrl('/cart?recover=rate-limited'));
  }

  const token = req.nextUrl.searchParams.get('token')?.trim() ?? '';
  if (!token) {
    return NextResponse.redirect(siteUrl('/cart?recover=invalid'));
  }

  const abandoned = await findAbandonedCartByRecoveryToken(token);
  if (!abandoned || abandoned.status === 'OPTED_OUT') {
    return NextResponse.redirect(siteUrl('/cart?recover=invalid'));
  }

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    const returnTo = `/api/cart/recover?token=${encodeURIComponent(token)}`;
    return NextResponse.redirect(
      siteUrl(`/login?callbackUrl=${encodeURIComponent(returnTo)}`)
    );
  }

  const snapshotItems = parseAbandonedCartItems(abandoned.items);
  if (snapshotItems.length === 0) {
    return NextResponse.redirect(siteUrl('/cart?recover=empty'));
  }

  try {
    await mergeCart(
      userId,
      snapshotItems.map((item) => ({ productId: item.id, quantity: item.quantity }))
    );
  } catch (error) {
    logError('cart_recover_failed', error, { route: '/api/cart/recover' });
    return NextResponse.redirect(siteUrl('/cart?recover=error'));
  }

  return NextResponse.redirect(siteUrl('/cart?recover=ok'));
}
