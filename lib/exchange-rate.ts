import type { Prisma } from '@prisma/client';
import { logError } from '@/lib/safe-logger';

export const EXCHANGE_RATE_APP_CONFIG_KEY = 'exchange_rate_usd_bs';
export const EXCHANGE_RATE_BCV_DATE_KEY = 'exchange_rate_bcv_date';
export const DEFAULT_EXCHANGE_RATE_USD_BS = 36.5;

/** Número decimal positivo COMPLETO (acepta coma o punto). Nada de sufijos basura. */
export const EXCHANGE_RATE_VALUE_REGEX = /^\d{1,7}(?:[.,]\d{1,6})?$/;

/**
 * Parseo estricto para fuentes externas (BCV): devuelve null si el valor no es
 * un número positivo completo — sin fallback silencioso al default.
 */
export function tryParseExchangeRateFromString(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;

  const trimmed = value.trim();
  if (!EXCHANGE_RATE_VALUE_REGEX.test(trimmed)) return null;

  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * PRD-203: validación estricta del valor persistido. `parseFloat` aceptaba
 * prefijos numéricos de strings corruptos ("36.5abc" → 36.5) y eso silenciaba
 * datos basura en una variable financiera. Ahora el string debe ser un número
 * completo y positivo; cualquier otra cosa se registra y cae al default.
 */
export function parseExchangeRateFromConfigValue(value: string | null | undefined): number {
  if (value == null || value === '') return DEFAULT_EXCHANGE_RATE_USD_BS;

  const normalized = value.trim().replace(',', '.');
  if (!EXCHANGE_RATE_VALUE_REGEX.test(value.trim())) {
    logError('exchange_rate_invalid_config', new Error('Invalid exchange rate format'), {
      operation: 'parse_exchange_rate',
    });
    return DEFAULT_EXCHANGE_RATE_USD_BS;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logError('exchange_rate_non_positive', new Error('Non-positive exchange rate'), {
      operation: 'parse_exchange_rate',
    });
    return DEFAULT_EXCHANGE_RATE_USD_BS;
  }
  return parsed;
}

/** Tasa USD→Bs. desde `AppConfig` (misma fuente que el panel admin). */
export async function loadExchangeRateUsdBsFromTx(
  tx: Prisma.TransactionClient,
): Promise<number> {
  const record = await tx.appConfig.findUnique({
    where: { key: EXCHANGE_RATE_APP_CONFIG_KEY },
    select: { value: true },
  });
  return parseExchangeRateFromConfigValue(record?.value);
}

export function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}
