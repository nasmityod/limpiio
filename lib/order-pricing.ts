import { formatCurrency } from '@/lib/utils';
import { roundMoney2 } from '@/lib/exchange-rate';

function formatVES(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export type OrderWithPricingMeta = { exchangeRateUsdBs?: number | null };

export function hasFrozenBsPricing(order: OrderWithPricingMeta): boolean {
  return order.exchangeRateUsdBs != null && order.exchangeRateUsdBs > 0;
}

/** Leyenda con la tasa del momento de la compra (no usa la tasa actual del sitio). */
export function getOrderFrozenRateCaption(order: OrderWithPricingMeta): string | null {
  if (!hasFrozenBsPricing(order)) return null;
  return `Tasa al comprar: Bs. ${order.exchangeRateUsdBs!.toFixed(2)} / USD`;
}

export type OrderDualMoney = {
  bs: string;
  usd: string;
  /** Monto numérico USD equivalente (redondeado) cuando hay tasa; null si legado solo USD. */
  usdAmount: number | null;
};

/**
 * `amountStored` en Bs. si hay `exchangeRateUsdBs`; si no, es USD (pedidos antiguos).
 * USD equivalente = amountStored / tasa (Bs por 1 USD).
 */
export function getOrderDualMoney(amountStored: number, order: OrderWithPricingMeta): OrderDualMoney {
  if (hasFrozenBsPricing(order)) {
    const usd = roundMoney2(amountStored / order.exchangeRateUsdBs!);
    return {
      bs: formatVES(amountStored),
      usd: formatCurrency(usd, 'USD', 'en-US'),
      usdAmount: usd,
    };
  }
  return {
    bs: '—',
    usd: formatCurrency(amountStored, 'USD', 'en-US'),
    usdAmount: roundMoney2(amountStored),
  };
}

/** Una línea para notificaciones o tablas estrechas: `Bs. … · US$ …` o solo USD. */
export function formatOrderDualInline(amount: number, order: OrderWithPricingMeta): string {
  const d = getOrderDualMoney(amount, order);
  if (hasFrozenBsPricing(order)) return `${d.bs} · ${d.usd}`;
  return d.usd;
}

/**
 * Montos guardados en pedidos **nuevos**: bolívares (tasa aplicada en checkout).
 * Pedidos **legacy** (sin `exchangeRateUsdBs`): USD en BD; se muestran como USD.
 */
export function formatStoredOrderMoney(amount: number, order: OrderWithPricingMeta): string {
  if (hasFrozenBsPricing(order)) {
    return formatVES(amount);
  }
  return formatCurrency(amount, 'USD', 'en-US');
}
