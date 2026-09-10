import { roundMoney2 } from '@/lib/exchange-rate';

/** USD tipo Stripe: $1,234.56 */
export function formatEmailUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Bolívares soberanos (referencia Bs.S): Bs. 48.712,00 */
export function formatEmailBs(amount: number): string {
  const n = roundMoney2(amount);
  const formatted = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `Bs.S ${formatted}`;
}
