import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isFullCheckout } from '@/lib/checkout-mode';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { rejectInvalidMutationOrigin, hashToken, buildRateLimitedResponse } from '@/lib/security';
import { logError } from '@/lib/safe-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutos

/**
 * POST /api/checkout/upload-session
 *
 * Genera un token de alta entropía para autorizar una subida de comprobante.
 * El token raw se devuelve una sola vez; en BD solo persiste SHA-256.
 * Expira en 30 minutos. El cliente debe enviarlo como header
 * `x-checkout-upload-token` al llamar a /api/checkout/upload-proof.
 *
 * Rate limit: 10 tokens por IP cada 10 minutos.
 */
export async function POST(request: Request) {
  const originCheck = rejectInvalidMutationOrigin(request);
  if (originCheck) return originCheck;

  // Guest solo en whatsapp / auth obligatoria en full: esta ruta solo existe
  // para el checkout full con comprobante. En whatsapp no se usa (404).
  if (!isFullCheckout) {
    return NextResponse.json({ error: 'Ruta no disponible.' }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }
  const userId = session.user.id;

  const ip = getClientIp(request);
  const rateResult = await rateLimitCritical(`upload-session:ip:${hashForBucket(ip)}`, { limit: 10, windowMs: 10 * 60_000 });
  if (rateResult.limited) {
    return buildRateLimitedResponse(rateResult.retryAfterSeconds,
      'Demasiadas solicitudes. Espera unos minutos.');
  }

  try {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.paymentUpload.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });

    return NextResponse.json(
      { token: rawToken, expiresAt: expiresAt.toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    logError('upload_session_failed', err, { operation: 'upload_session' });
    return NextResponse.json(
      { error: 'No pudimos iniciar la sesión de subida. Intenta de nuevo.' },
      { status: 500 },
    );
  }
}
