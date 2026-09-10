/**
 * Meta (Facebook) Pixel — helpers de tracking con gate de consentimiento.
 *
 * - Base code en <head> del layout raíz (recomendación oficial Meta), con
 *   `fbq('consent', 'revoke')` hasta que el usuario acepte cookies.
 * - No-op si NEXT_PUBLIC_META_PIXEL_ID no está configurado, fbq no cargó o el
 *   usuario no otorgó consentimiento (`window.__mtAnalyticsConsent !== 'granted'`).
 */

import { getAnalyticsConsent } from '@/lib/ga4';

export const META_PIXEL_CURRENCY = 'USD';

const PURCHASE_STORAGE_KEY = 'mt_meta_purchases';
const PURCHASE_HISTORY_LIMIT = 40;
const pagePurchaseSeen = new Set<string>();

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

export function getMetaPixelId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  return id || undefined;
}

/** Actualiza Meta Consent Mode (grant/revoke). El base code arranca en revoke. */
export function setMetaPixelConsent(granted: boolean): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (!getMetaPixelId()) return false;
    const fbq = window.fbq;
    if (typeof fbq !== 'function') return false;
    fbq('consent', granted ? 'grant' : 'revoke');
    return true;
  } catch {
    return false;
  }
}

function getFbq(): ((...args: unknown[]) => void) | null {
  if (typeof window === 'undefined') return null;
  if (!getMetaPixelId()) return null;
  if (getAnalyticsConsent() !== 'granted') return null;
  const fbq = window.fbq;
  return typeof fbq === 'function' ? fbq : null;
}

/** PageView (carga inicial tras grant, o navegación SPA). */
export function trackMetaPageView(): boolean {
  try {
    const fbq = getFbq();
    if (!fbq) return false;
    fbq('track', 'PageView');
    return true;
  } catch {
    return false;
  }
}

function readStoredPurchases(): string[] {
  try {
    const raw = sessionStorage.getItem(PURCHASE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function isPurchaseSeen(transactionId: string): boolean {
  if (pagePurchaseSeen.has(transactionId)) return true;
  return readStoredPurchases().includes(transactionId);
}

function markPurchaseSeen(transactionId: string): void {
  pagePurchaseSeen.add(transactionId);
  try {
    const seen = readStoredPurchases();
    if (seen.includes(transactionId)) return;
    seen.push(transactionId);
    sessionStorage.setItem(
      PURCHASE_STORAGE_KEY,
      JSON.stringify(seen.slice(-PURCHASE_HISTORY_LIMIT)),
    );
  } catch {
    /* sessionStorage puede fallar — el Set en memoria evita doble inmediato */
  }
}

/**
 * Conversión Purchase para campañas de Meta Ads.
 * Con dedupe por transactionId para no duplicar en recargas de /checkout/success.
 * Si aún no hay consentimiento/fbq, no marca visto y permite reintento.
 */
export function trackMetaPurchaseOnce(params: {
  transactionId: string;
  value: number;
  currency?: string;
  contentIds?: string[];
  contents?: Array<{ id: string; quantity: number; item_price?: number }>;
}): boolean {
  try {
    const transactionId = params.transactionId.trim();
    if (!transactionId || isPurchaseSeen(transactionId)) return false;
    if (!Number.isFinite(params.value) || params.value < 0) return false;

    const fbq = getFbq();
    if (!fbq) return false;

    const payload: Record<string, unknown> = {
      value: params.value,
      currency: params.currency ?? META_PIXEL_CURRENCY,
      content_type: 'product',
    };
    if (params.contentIds?.length) payload.content_ids = params.contentIds;
    if (params.contents?.length) payload.contents = params.contents;

    fbq('track', 'Purchase', payload);
    markPurchaseSeen(transactionId);
    return true;
  } catch {
    return false;
  }
}
