import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/safe-logger';
import {
  OPS_APP_CONFIG_KEYS,
  buildPublicHealth,
  buildOpsMap,
  withTimeout,
  HealthTimeoutError,
  HEALTH_DB_TIMEOUT_MS,
} from '@/lib/operations-health';

/**
 * SESIÓN 11 — Health público mínimo.
 *
 * Contrato: GET /api/health
 *
 * Respuesta:
 *   { status:'ok'|'degraded', db:'ok'|'down', bcvStale:boolean, backupStale:boolean, purgeStale:boolean }
 *
 * - NO contiene timestamps, versión, host, error, conteos ni PII.
 * - Cache-Control: no-store, max-age=0.
 * - Timeout DB <= 2s.
 * - HTTP 503 solo si DB está caída.
 * - BCV/backup/purge stale NO tumban el status (la tienda sigue funcionando).
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const opsRows = await withTimeout(
      prisma.appConfig.findMany({
        where: { key: { in: [...OPS_APP_CONFIG_KEYS] } },
        select: { key: true, value: true },
      }),
      HEALTH_DB_TIMEOUT_MS,
    );

    const opsMap = buildOpsMap(opsRows);
    const health = buildPublicHealth(opsMap, true /* db ok */);

    return NextResponse.json(health, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    const event = err instanceof HealthTimeoutError ? 'health_db_timeout' : 'health_db_down';
    logError(event, err, { route: '/api/health' });

    return NextResponse.json(
      { status: 'degraded', db: 'down', bcvStale: true, backupStale: true, purgeStale: true },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
