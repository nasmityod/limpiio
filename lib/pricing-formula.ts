export const PROFIT_MARGIN_APP_CONFIG_KEY = 'profit_margin_pct';
export const BCV_BINANCE_FACTOR_APP_CONFIG_KEY = 'bcv_binance_factor';
export const DEFAULT_PROFIT_MARGIN_PCT = 80;
export const DEFAULT_BCV_BINANCE_FACTOR = 1.5;

/** Los precios SIEMPRE terminan en múltiplos de 5 céntimos ($0.05). */
export const PRICE_ROUNDING_STEP = 0.05;

/**
 * Redondea SIEMPRE hacia arriba al múltiplo de step más cercano.
 * Trabaja en céntimos enteros para evitar errores de coma flotante.
 * roundUpToStep(1.42) === 1.45
 * roundUpToStep(1.21) === 1.25
 * roundUpToStep(1.28) === 1.30
 * roundUpToStep(10.80) === 10.80
 */
export function roundUpToStep(value: number, step: number = PRICE_ROUNDING_STEP): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const stepCents = Math.round(step * 100);
  // Redondea a milésimas de céntimo: mata el ruido de coma flotante
  // SIN perder el medio-céntimo real (580.5 no debe caer a 580).
  const valueCents = Math.round(value * 100 * 1000) / 1000;
  const roundedCents = Math.ceil(valueCents / stepCents) * stepCents;
  return roundedCents / 100;
}

/**
 * Precio de venta USD a partir del costo, ya redondeado hacia arriba a $0.05.
 * calcSellingPriceUsd(4, 80, 1.5) === 10.8
 */
export function calcSellingPriceUsd(
  cost: number,
  marginPct: number = DEFAULT_PROFIT_MARGIN_PCT,
  factor: number = DEFAULT_BCV_BINANCE_FACTOR,
): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const raw = cost * (1 + marginPct / 100) * factor;
  return roundUpToStep(raw);
}
