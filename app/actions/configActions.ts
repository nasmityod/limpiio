'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requirePermissionAction } from '@/lib/admin-access-server';
import {
  DEFAULT_EXCHANGE_RATE_USD_BS,
  EXCHANGE_RATE_APP_CONFIG_KEY,
  parseExchangeRateFromConfigValue,
} from '@/lib/exchange-rate';
import { persistExchangeRate } from '@/lib/persist-exchange-rate';
import {
  PROFIT_MARGIN_APP_CONFIG_KEY,
  BCV_BINANCE_FACTOR_APP_CONFIG_KEY,
  DEFAULT_PROFIT_MARGIN_PCT,
  DEFAULT_BCV_BINANCE_FACTOR,
} from '@/lib/pricing-formula';
import { logError } from '@/lib/safe-logger';

const exchangeRateSchema = z
  .number({ error: 'La tasa debe ser un número.' })
  .positive('La tasa debe ser mayor que cero.')
  .finite()
  .max(100_000, 'Tasa fuera de rango razonable.');

export async function getExchangeRate(): Promise<number> {
  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: EXCHANGE_RATE_APP_CONFIG_KEY },
    });
    return parseExchangeRateFromConfigValue(record?.value);
  } catch (err) {
    logError('exchange_rate_read_failed', err, { operation: 'get_exchange_rate', provider: 'postgres' });
    return DEFAULT_EXCHANGE_RATE_USD_BS;
  }
}

export async function updateExchangeRate(rate: unknown) {
  try {
    await requirePermissionAction('FINANCIAL_SETTINGS');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }

  const parsed = exchangeRateSchema.safeParse(rate);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Tasa inválida.' };
  }

  await persistExchangeRate(parsed.data);

  return { success: true, message: `Tasa actualizada a Bs. ${parsed.data.toFixed(2)}/USD.` };
}

const pricingParamsSchema = z.object({
  marginPct: z.coerce.number().min(0, 'El margen no puede ser negativo.').max(1000, 'Margen fuera de rango.'),
  factor: z.coerce.number().positive('La tasa actual debe ser mayor que cero.').max(100, 'Tasa actual fuera de rango.'),
});

export async function getPricingParams(): Promise<{ marginPct: number; factor: number }> {
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: [PROFIT_MARGIN_APP_CONFIG_KEY, BCV_BINANCE_FACTOR_APP_CONFIG_KEY] } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const rawMargin = map.get(PROFIT_MARGIN_APP_CONFIG_KEY);
    const rawFactor = map.get(BCV_BINANCE_FACTOR_APP_CONFIG_KEY);
    const marginPct = rawMargin != null && Number.isFinite(Number(rawMargin)) ? Number(rawMargin) : DEFAULT_PROFIT_MARGIN_PCT;
    const factor = rawFactor != null && Number.isFinite(Number(rawFactor)) && Number(rawFactor) > 0 ? Number(rawFactor) : DEFAULT_BCV_BINANCE_FACTOR;
    return { marginPct, factor };
  } catch (err) {
    logError('pricing_params_read_failed', err, { operation: 'get_pricing_params', provider: 'postgres' });
    return { marginPct: DEFAULT_PROFIT_MARGIN_PCT, factor: DEFAULT_BCV_BINANCE_FACTOR };
  }
}

export async function updatePricingParams(input: { marginPct: unknown; factor: unknown }) {
  try {
    await requirePermissionAction('FINANCIAL_SETTINGS');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }

  const parsed = pricingParamsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Parámetros inválidos.' };
  }

  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: PROFIT_MARGIN_APP_CONFIG_KEY },
      update: { value: parsed.data.marginPct.toString() },
      create: { key: PROFIT_MARGIN_APP_CONFIG_KEY, value: parsed.data.marginPct.toString() },
    }),
    prisma.appConfig.upsert({
      where: { key: BCV_BINANCE_FACTOR_APP_CONFIG_KEY },
      update: { value: parsed.data.factor.toString() },
      create: { key: BCV_BINANCE_FACTOR_APP_CONFIG_KEY, value: parsed.data.factor.toString() },
    }),
  ]);

  return { success: true, message: `Fórmula actualizada: margen ${parsed.data.marginPct}% × tasa actual ${parsed.data.factor}.` };
}

const MARGIN_PRESETS_APP_CONFIG_KEY = 'margin_presets';
const DEFAULT_MARGIN_PRESETS = [30, 50, 80, 100];

const marginPresetsSchema = z
  .array(z.coerce.number().min(0, 'El margen no puede ser negativo.').max(1000, 'Margen fuera de rango.'))
  .length(4, 'Deben ser exactamente 4 valores.');

export async function getMarginPresets(): Promise<number[]> {
  try {
    const record = await prisma.appConfig.findUnique({ where: { key: MARGIN_PRESETS_APP_CONFIG_KEY } });
    if (!record?.value) return DEFAULT_MARGIN_PRESETS;
    const parsed = marginPresetsSchema.safeParse(JSON.parse(record.value));
    return parsed.success ? parsed.data : DEFAULT_MARGIN_PRESETS;
  } catch (err) {
    logError('margin_presets_read_failed', err, { operation: 'get_margin_presets', provider: 'postgres' });
    return DEFAULT_MARGIN_PRESETS;
  }
}

export async function updateMarginPresets(presets: unknown) {
  try {
    await requirePermissionAction('FINANCIAL_SETTINGS');
  } catch {
    return { success: false, message: 'No autorizado.' };
  }
  const parsed = marginPresetsSchema.safeParse(presets);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Valores inválidos.' };
  }
  await prisma.appConfig.upsert({
    where: { key: MARGIN_PRESETS_APP_CONFIG_KEY },
    update: { value: JSON.stringify(parsed.data) },
    create: { key: MARGIN_PRESETS_APP_CONFIG_KEY, value: JSON.stringify(parsed.data) },
  });
  return { success: true, message: 'Atajos de margen guardados.', presets: parsed.data };
}
