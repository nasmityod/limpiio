import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/security';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * PRD-014/089: GET /api/account/confirm-email?token=...
 *
 * Confirma el cambio de email pendiente. Si el token es válido y no ha expirado,
 * promueve `pendingEmail → email` y limpia los campos de token.
 * Redirige al usuario a /account/details con un parámetro de estado.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);

  // Rate limit: evitar fuerza bruta sobre tokens de confirmación
  if (await rateLimit(`email-confirm:${ip}`, { limit: 10, windowMs: 15 * 60_000 })) {
    return NextResponse.redirect(new URL('/account/details?emailChange=rate-limited', request.url));
  }

  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get('token')?.trim();

  if (!rawToken) {
    return NextResponse.redirect(new URL('/account/details?emailChange=invalid', request.url));
  }

  try {
    const tokenHash = hashToken(rawToken);

    const user = await prisma.user.findUnique({
      where: { emailChangeToken: tokenHash },
      select: {
        id: true,
        pendingEmail: true,
        emailChangeTokenExpiry: true,
      },
    });

    if (!user || !user.pendingEmail || !user.emailChangeTokenExpiry) {
      return NextResponse.redirect(new URL('/account/details?emailChange=invalid', request.url));
    }

    if (user.emailChangeTokenExpiry < new Date()) {
      // Token expirado: limpiar campos y redirigir
      await prisma.user.update({
        where: { id: user.id },
        data: {
          pendingEmail: null,
          emailChangeToken: null,
          emailChangeTokenExpiry: null,
        },
      });
      return NextResponse.redirect(new URL('/account/details?emailChange=expired', request.url));
    }

    // Verificar que el nuevo email no esté ocupado por otra cuenta
    const conflict = await prisma.user.findUnique({
      where: { email: user.pendingEmail },
      select: { id: true },
    });

    if (conflict && conflict.id !== user.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          pendingEmail: null,
          emailChangeToken: null,
          emailChangeTokenExpiry: null,
        },
      });
      return NextResponse.redirect(new URL('/account/details?emailChange=conflict', request.url));
    }

    // Promover pendingEmail → email y limpiar token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail,
        pendingEmail: null,
        emailChangeToken: null,
        emailChangeTokenExpiry: null,
      },
    });

    return NextResponse.redirect(new URL('/account/details?emailChange=success', request.url));
  } catch (error) {
    logError('confirm_email_failed', error, { route: '/api/account/confirm-email' });
    return NextResponse.redirect(new URL('/account/details?emailChange=error', request.url));
  }
}
