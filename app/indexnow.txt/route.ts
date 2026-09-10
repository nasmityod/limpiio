import { NextResponse } from 'next/server';

/**
 * FASE 3 (SEO): archivo de verificación de IndexNow (keyLocation).
 * Sirve la clave en texto plano; 404 si INDEXNOW_KEY no está configurada.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    return new NextResponse('Not found', { status: 404 });
  }
  return new NextResponse(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
