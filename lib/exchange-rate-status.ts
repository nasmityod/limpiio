import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/safe-logger';
import { DEFAULT_EXCHANGE_RATE_USD_BS, EXCHANGE_RATE_APP_CONFIG_KEY, EXCHANGE_RATE_BCV_DATE_KEY, tryParseExchangeRateFromString } from '@/lib/exchange-rate';

export interface ExchangeRateStatus {
  rate: number;
  valid: boolean;
  stale: boolean;
  source: 'configured' | 'fallback';
  updatedAt: string | null;
  publishedAt: string | null;
}

/** A successful read must not turn a fallback into an authoritative rate. */
export async function readExchangeRateStatus(): Promise<ExchangeRateStatus> {
  const fallback: ExchangeRateStatus = { rate: DEFAULT_EXCHANGE_RATE_USD_BS, valid: false, stale: true, source: 'fallback', updatedAt: null, publishedAt: null };
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: [EXCHANGE_RATE_APP_CONFIG_KEY, EXCHANGE_RATE_BCV_DATE_KEY] } },
      select: { key: true, value: true, updatedAt: true },
    });
    const row = rows.find(r => r.key === EXCHANGE_RATE_APP_CONFIG_KEY);
    const rate = tryParseExchangeRateFromString(row?.value);
    if (rate == null) return fallback;
    const publishedAt = rows.find(r => r.key === EXCHANGE_RATE_BCV_DATE_KEY)?.value ?? null;
    const updatedAt = row?.updatedAt?.toISOString() ?? null;
    // A publication may legitimately remain unchanged over weekends. This is
    // an explicit configurable age bound, distinct from the client's polling.
    const rawHours = Number(process.env.EXCHANGE_RATE_MAX_AGE_HOURS ?? 96);
    const maxAge = (Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 96) * 3_600_000;
    const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
    const stale = !Number.isFinite(timestamp) || timestamp > Date.now() + 60_000 || Date.now() - timestamp > maxAge;
    return { rate, valid: true, stale, source: 'configured', updatedAt, publishedAt };
  } catch (error) {
    logError('exchange_rate_status_read_failed', error, { operation: 'read_exchange_rate_status' });
    return fallback;
  }
}
