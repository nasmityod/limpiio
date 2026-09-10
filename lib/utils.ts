import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Marca vacía o placeholder de catálogo — no mostrar chip de marca. */
export function isGenericBrand(brand?: string | null): boolean {
  const v = (brand ?? '').trim().toLowerCase();
  return v === '' || v === 'sin marca' || v === 'sin-marca' || v === 'generico' || v === 'genérico';
}

export function formatCurrency(amount: number, currency = 'USD', locale = 'es-US'): string {
  if (!Number.isFinite(amount)) {
    return currency === 'USD' ? '$-.--' : `-.-- ${currency}`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}