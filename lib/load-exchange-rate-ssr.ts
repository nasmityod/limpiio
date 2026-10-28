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
import { readExchangeRateStatus } from '@/lib/exchange-rate-status';
import type { ExchangeRateStatus } from '@/lib/exchange-rate-status';

/**
 * Lee la tasa guardada y su timestamp desde AppConfig para hidratación
 * server-side del ExchangeRateProvider.
 *
 * Retorna { rate, updatedAt } donde `rate` es la tasa actual (> 0) o el
 * default, y `updatedAt` es ISO string del último cambio o null si no hay
 * datos.
 */
export async function getExchangeRateWithTimestamp(): Promise<ExchangeRateStatus> {
  return readExchangeRateStatus();
}
