/**
 * SESIÓN 17 — Lectura server-side de la tasa USD/Bs con timestamp.
 *
 * Separado de `exchange-rate.ts` para evitar arrastrar `prisma` al bundle
 * cliente (exchange-rate.ts exporta `roundMoney2` que se usa desde
 * client components como order-pricing.ts → OrderDetailClient.tsx).
 *
 * @see lib/exchange-rate.ts (funciones puras y helpers compartidos)
 */
import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  EXCHANGE_RATE_APP_CONFIG_KEY,
  EXCHANGE_RATE_BCV_DATE_KEY,
  parseExchangeRateFromConfigValue,
} from '@/lib/exchange-rate';

/**
 * Lee la tasa guardada y su timestamp desde AppConfig para hidratación
 * server-side del ExchangeRateProvider.
 *
 * Retorna { rate, updatedAt } donde `rate` es la tasa actual (> 0) o el
 * default, y `updatedAt` es ISO string del último cambio o null si no hay
 * datos.
 */
export async function getExchangeRateWithTimestamp(): Promise<{
  rate: number;
  updatedAt: string | null;
}> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: [EXCHANGE_RATE_APP_CONFIG_KEY, EXCHANGE_RATE_BCV_DATE_KEY] } },
    select: { key: true, value: true, updatedAt: true },
  });

  const rateRow = rows.find(r => r.key === EXCHANGE_RATE_APP_CONFIG_KEY);
  const rate = parseExchangeRateFromConfigValue(rateRow?.value);

  const dateRow = rows.find(r => r.key === EXCHANGE_RATE_BCV_DATE_KEY);
  const updatedAt = rateRow?.updatedAt?.toISOString() ?? dateRow?.value ?? null;

  return { rate, updatedAt };
}
