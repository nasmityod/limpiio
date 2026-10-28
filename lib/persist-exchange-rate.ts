import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { normalizeBcvDate } from '@/lib/bcv-date';
import { tryParseExchangeRateFromString } from '@/lib/exchange-rate';
import {
  EXCHANGE_RATE_APP_CONFIG_KEY,
  EXCHANGE_RATE_BCV_DATE_KEY,
} from '@/lib/exchange-rate';

function revalidateExchangeRatePaths(): void {
  // PRD-142: la tasa afecta TODAS las páginas ISR con precios.
  revalidatePath('/', 'layout');
  revalidatePath('/');
  revalidatePath('/productos');
  revalidatePath('/buscar');
  revalidatePath('/admin/settings');
  revalidatePath('/product/[slug]', 'page');
  revalidatePath('/categoria/[slug]', 'page');
}

/** Persiste la tasa USD/Bs y revalida el caché ISR de precios. */
export async function persistExchangeRate(rate: number): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: EXCHANGE_RATE_APP_CONFIG_KEY },
    update: { value: rate.toString() },
    create: { key: EXCHANGE_RATE_APP_CONFIG_KEY, value: rate.toString() },
  });

  revalidateExchangeRatePaths();
}

/** Persiste tasa + fecha BCV en una transacción y revalida el caché. */
export async function persistExchangeRateWithBcvDate(
  rate: number,
  bcvDate: string,
): Promise<void> {
  const normalized = normalizeBcvDate(bcvDate);
  if (!normalized || !Number.isFinite(rate) || rate <= 0) throw new Error('BCV_INTEGRITY:invalid-publication');
  await prisma.$transaction(async (tx) => {
    const records = await tx.appConfig.findMany({ where: { key: { in: [EXCHANGE_RATE_APP_CONFIG_KEY, EXCHANGE_RATE_BCV_DATE_KEY] } }, select: { key: true, value: true } });
    const savedDate = records.find((r) => r.key === EXCHANGE_RATE_BCV_DATE_KEY)?.value;
    const previousDate = savedDate ? normalizeBcvDate(savedDate) : null;
    if (previousDate && Date.parse(previousDate) > Date.parse(normalized)) throw new Error('BCV_INTEGRITY:older-publication');
    const savedRate = records.find((r) => r.key === EXCHANGE_RATE_APP_CONFIG_KEY)?.value;
    const previousRate = savedRate ? tryParseExchangeRateFromString(savedRate) : null;
    if (previousRate && Math.abs(rate - previousRate) / previousRate > 0.15) throw new Error('BCV_INTEGRITY:suspicious-jump');
    await tx.appConfig.upsert({
      where: { key: EXCHANGE_RATE_APP_CONFIG_KEY },
      update: { value: rate.toString() },
      create: { key: EXCHANGE_RATE_APP_CONFIG_KEY, value: rate.toString() },
    });
    await tx.appConfig.upsert({
      where: { key: EXCHANGE_RATE_BCV_DATE_KEY },
      update: { value: normalized },
      create: { key: EXCHANGE_RATE_BCV_DATE_KEY, value: normalized },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateExchangeRatePaths();
}
