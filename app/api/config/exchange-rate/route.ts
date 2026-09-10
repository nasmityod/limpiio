import { NextResponse } from 'next/server';
import { logError } from '@/lib/safe-logger';
import { getExchangeRate } from '@/app/actions/configActions';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Endpoint público — devuelve la tasa USD/Bs actual siempre fresca.
 * PRD-045 / PRD-256 / PRD-282: rate limit por IP (la tasa la consume la UI
 * unas pocas veces por sesión; 30/min frena scraping de competidores).
 * PRD-044: try/catch con fallback controlado — nunca 500 sin log.
 */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    if (await rateLimit(`config:exchange-rate:${ip}`, { limit: 120, windowMs: 60_000 })) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes.' },
        { status: 429 }
      );
    }

    const rate = await getExchangeRate();
    return NextResponse.json({ rate }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logError('exchange_rate_config_get_failed', error, { route: '/api/config/exchange-rate' });
    return NextResponse.json(
      { error: 'No se pudo obtener la tasa.' },
      { status: 500 }
    );
  }
}
