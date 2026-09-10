import { NextResponse } from 'next/server';
import { getExchangeRate } from '@/app/actions/configActions';
import { fetchBcvRate } from '@/lib/bcv-rate';
import { EXCHANGE_RATE_BCV_DATE_KEY } from '@/lib/exchange-rate';
import { persistExchangeRateWithBcvDate } from '@/lib/persist-exchange-rate';
import { prisma } from '@/lib/prisma';
import { verifyBearerSecret } from '@/lib/security';
import { logInfo, logError } from '@/lib/safe-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Variación máxima permitida respecto a la tasa actual antes de bloquear la escritura. */
const MAX_RATE_JUMP_RATIO = 0.15;

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return verifyBearerSecret(request, cronSecret);
}

async function getStoredBcvDate(): Promise<string | null> {
  const record = await prisma.appConfig.findUnique({
    where: { key: EXCHANGE_RATE_BCV_DATE_KEY },
    select: { value: true },
  });
  return record?.value ?? null;
}

/** FASE 4.8 (MEJORA 4.3): marca de última corrida EXITOSA del cron BCV.
 *  /api/health la usa para alertar si el cron lleva 2+ días sin correr bien. */
const BCV_LAST_SUCCESS_KEY = 'bcv_last_success_at';

async function recordBcvSuccess(): Promise<void> {
  const now = new Date().toISOString();
  try {
    await prisma.appConfig.upsert({
      where:  { key: BCV_LAST_SUCCESS_KEY },
      update: { value: now },
      create: { key: BCV_LAST_SUCCESS_KEY, value: now },
    });
  } catch (err) {
    logError('cron_bcv_record_success_failed', err, { operation: 'bcv_record_success' });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fetched = await fetchBcvRate();
    if (!fetched) {
      logError('cron_bcv_no_api_data', new Error('No BCV rate data from API'), { operation: 'bcv_rate_update' });
      return NextResponse.json(
        { ok: false, reason: 'fetch-failed' },
        { status: 503 },
      );
    }

    const storedDate = await getStoredBcvDate();
    if (storedDate === fetched.date) {
      await recordBcvSuccess();
      return NextResponse.json({ ok: true, sinCambios: true });
    }

    const actual = await getExchangeRate();
    const jumpRatio = Math.abs(fetched.rate - actual) / actual;
    if (jumpRatio > MAX_RATE_JUMP_RATIO) {
      logError('cron_bcv_suspicious_jump', new Error(`Rate jump ${(jumpRatio * 100).toFixed(1)}%`), { operation: 'bcv_rate_update' });
      return NextResponse.json(
        {
          ok: false,
          needsReview: true,
          actual,
          nueva: fetched.rate,
        },
        { status: 409 },
      );
    }

    await persistExchangeRateWithBcvDate(fetched.rate, fetched.date);
    await recordBcvSuccess();

    logInfo('cron_bcv_rate_updated', { operation: 'bcv_rate_update' });

    return NextResponse.json({ ok: true, rate: fetched.rate, date: fetched.date });
  } catch (error) {
    logError('cron_bcv_unexpected_error', error, { operation: 'bcv_rate_update' });
    return NextResponse.json(
      { ok: false },
      { status: 500 },
    );
  }
}
