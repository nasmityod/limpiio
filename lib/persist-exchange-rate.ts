import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
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
  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: EXCHANGE_RATE_APP_CONFIG_KEY },
      update: { value: rate.toString() },
      create: { key: EXCHANGE_RATE_APP_CONFIG_KEY, value: rate.toString() },
    }),
    prisma.appConfig.upsert({
      where: { key: EXCHANGE_RATE_BCV_DATE_KEY },
      update: { value: bcvDate },
      create: { key: EXCHANGE_RATE_BCV_DATE_KEY, value: bcvDate },
    }),
  ]);

  revalidateExchangeRatePaths();
}
