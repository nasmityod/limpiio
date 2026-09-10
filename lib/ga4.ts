/**
 * FASE 4.4 (MEJORA 3.1) — helper central de eventos GA4 de e-commerce.
 *
 * - No-op si NEXT_PUBLIC_GA4_ID no está configurado, gtag no cargó o el usuario
 *   no otorgó consentimiento analítico (`window.__mtAnalyticsConsent`).
 * - Consent Mode v2 (PRD-286): CookieConsent.tsx fija `__mtAnalyticsConsent` y
 *   actualiza gtag; los eventos solo se emiten con consentimiento granted.
 * - Moneda: los precios del catálogo son USD.
 * - Payloads sanitizados: solo eventos allowlist y campos permitidos por evento.
 * - PII rechazada en runtime (keys y valores sensibles).
 */

export const GA4_CURRENCY = 'USD';

export interface Ga4Item {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_brand?: string;
  price?: number;
  quantity?: number;
  index?: number;
}

export type Ga4Event =
  | 'view_item'
  | 'view_item_list'
  | 'select_item'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'begin_checkout'
  | 'add_shipping_info'
  | 'add_payment_info'
  | 'purchase'
  | 'view_promotion'
  | 'select_promotion';

export type AnalyticsConsent = 'granted' | 'denied';

declare global {
  interface Window {
    __mtAnalyticsConsent?: AnalyticsConsent;
    gtag?: (...args: unknown[]) => void;
  }
}

type Gtag = (...args: unknown[]) => void;

export const ANALYTICS_CONSENT_EVENT = 'mt-analytics-consent';

const GA4_EVENT_TOP_KEYS: Record<Ga4Event, readonly string[]> = {
  view_item: ['currency', 'value', 'items'],
  view_item_list: ['item_list_id', 'item_list_name', 'items'],
  select_item: ['currency', 'items', 'item_list_id', 'item_list_name'],
  add_to_cart: ['currency', 'value', 'items'],
  remove_from_cart: ['currency', 'value', 'items'],
  view_cart: ['currency', 'value', 'items'],
  begin_checkout: ['currency', 'value', 'items'],
  add_shipping_info: ['currency', 'value', 'shipping_tier', 'items'],
  add_payment_info: ['currency', 'value', 'payment_type', 'items'],
  purchase: ['transaction_id', 'value', 'currency', 'coupon', 'items'],
  view_promotion: [
    'promotion_id',
    'promotion_name',
    'creative_name',
    'creative_slot',
    'items',
  ],
  select_promotion: [
    'promotion_id',
    'promotion_name',
    'creative_name',
    'creative_slot',
    'items',
  ],
};

const PII_KEYS = new Set([
  'email',
  'phone',
  'telephone',
  'address',
  'cedula',
  'cedula_rif',
  'token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'passwd',
  'reference',
  'referencia',
  'customer_email',
  'customer_name',
  'customer_phone',
  'shipping_address',
  'billing_address',
  'stripe_token',
  'card_number',
  'cvv',
  'cvc',
  'card_cvc',
  'transfer_reference',
  'payment_reference',
  'correo',
  'telefono',
  'direccion',
  'identificacion',
  'dni',
  'passport',
]);

const PII_VALUE_PATTERNS = [
  /@[\w.-]+\.\w+/,
  /\+\d{10,}/,
  /\b(?:tok_|sk_|pk_|Bearer\s)\S+/i,
];

const PURCHASE_STORAGE_KEY = 'mt_ga4_purchases';
const PURCHASE_HISTORY_LIMIT = 20;

/** Dedupe en memoria por pestaña cuando sessionStorage no está disponible. */
const pagePurchaseSeen = new Set<string>();

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/-/g, '_');
}

function isGa4Event(event: string): event is Ga4Event {
  return Object.prototype.hasOwnProperty.call(GA4_EVENT_TOP_KEYS, event);
}

function containsPiiValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return PII_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }
  return false;
}

function sanitizeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  if (containsPiiValue(trimmed)) return undefined;
  return trimmed;
}

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function sanitizePositiveInt(value: unknown): number | undefined {
  const num = sanitizeNumber(value);
  if (num === undefined || num < 0 || !Number.isInteger(num)) return undefined;
  return num;
}

function sanitizeItem(raw: unknown): Ga4Item | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    if (PII_KEYS.has(normalizeKey(key))) return null;
    if (containsPiiValue(source[key])) return null;
  }

  const item_id = sanitizeString(source.item_id, 128);
  const item_name = sanitizeString(source.item_name, 256);
  if (!item_id || !item_name) return null;

  const item: Ga4Item = { item_id, item_name };

  const item_category = sanitizeString(source.item_category, 128);
  if (item_category) item.item_category = item_category;

  const item_brand = sanitizeString(source.item_brand, 128);
  if (item_brand) item.item_brand = item_brand;

  const price = sanitizeNumber(source.price);
  if (price !== undefined) item.price = price;

  const quantity = sanitizePositiveInt(source.quantity);
  if (quantity !== undefined) item.quantity = quantity;

  const index = sanitizePositiveInt(source.index);
  if (index !== undefined) item.index = index;

  return item;
}

function sanitizeItems(raw: unknown): Ga4Item[] | undefined | null {
  if (!Array.isArray(raw)) return undefined;

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    for (const key of Object.keys(entry as Record<string, unknown>)) {
      if (PII_KEYS.has(normalizeKey(key))) return null;
      if (containsPiiValue((entry as Record<string, unknown>)[key])) return null;
    }
  }

  const items = raw
    .map((entry) => sanitizeItem(entry))
    .filter((entry): entry is Ga4Item => entry !== null);
  return items.length > 0 ? items : undefined;
}

function sanitizeParams(
  event: Ga4Event,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!params || typeof params !== 'object') return null;

  const allowedKeys = GA4_EVENT_TOP_KEYS[event];
  const sanitized: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (!(key in params)) continue;
    if (PII_KEYS.has(normalizeKey(key))) return null;
    if (containsPiiValue(params[key])) return null;

    if (key === 'items') {
      const items = sanitizeItems(params.items);
      if (items === null) return null;
      if (items) sanitized.items = items;
      continue;
    }

    if (key === 'value' || key === 'price') {
      const value = sanitizeNumber(params[key]);
      if (value !== undefined) sanitized[key] = value;
      continue;
    }

    if (key === 'currency') {
      const currency = sanitizeString(params.currency, 8);
      if (currency) sanitized.currency = currency;
      continue;
    }

    if (key === 'transaction_id') {
      const transactionId = sanitizeString(params.transaction_id, 128);
      if (transactionId) sanitized.transaction_id = transactionId;
      continue;
    }

    if (key === 'coupon') {
      const coupon = sanitizeString(params.coupon, 64);
      if (coupon) sanitized.coupon = coupon;
      continue;
    }

    if (key === 'shipping_tier' || key === 'payment_type' || key === 'item_list_id' || key === 'item_list_name') {
      const text = sanitizeString(params[key], 128);
      if (text) sanitized[key] = text;
      continue;
    }

    if (
      key === 'promotion_id' ||
      key === 'promotion_name' ||
      key === 'creative_name' ||
      key === 'creative_slot'
    ) {
      const text = sanitizeString(params[key], 128);
      if (text) sanitized[key] = text;
      continue;
    }
  }

  if (event === 'purchase') {
    if (!sanitized.transaction_id || sanitized.value === undefined) return null;
    sanitized.currency = GA4_CURRENCY;
  }

  return sanitized;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'denied';
  return window.__mtAnalyticsConsent ?? 'denied';
}

export function setAnalyticsConsent(consent: AnalyticsConsent): void {
  if (typeof window === 'undefined') return;
  window.__mtAnalyticsConsent = consent;
  window.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: { consent } }),
  );
}

export function onAnalyticsConsentChange(
  listener: (consent: AnalyticsConsent) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ consent?: AnalyticsConsent }>;
    listener(customEvent.detail?.consent ?? getAnalyticsConsent());
  };

  window.addEventListener(ANALYTICS_CONSENT_EVENT, handler);
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, handler);
}

export function getGtag(): Gtag | null {
  if (typeof window === 'undefined') return null;
  if (!process.env.NEXT_PUBLIC_GA4_ID) return null;
  if (getAnalyticsConsent() !== 'granted') return null;
  const g = window.gtag;
  return typeof g === 'function' ? g : null;
}

/** Dispara un evento GA4 allowlist. Retorna true solo si gtag recibió el evento. */
export function track(event: Ga4Event, params?: Record<string, unknown>): boolean {
  try {
    if (!isGa4Event(event)) return false;

    const gtag = getGtag();
    if (!gtag) return false;

    const sanitized = sanitizeParams(event, params);
    if (!sanitized) return false;

    gtag('event', event, sanitized);
    return true;
  } catch {
    return false;
  }
}

/** Mapea un producto de la UI (ProductCard/CartItem) a item de GA4. */
export function toGa4Item(p: {
  id: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  price?: number;
  quantity?: number;
}): Ga4Item {
  return {
    item_id: p.id,
    item_name: p.name,
    ...(p.category ? { item_category: p.category } : {}),
    ...(p.brand ? { item_brand: p.brand } : {}),
    ...(typeof p.price === 'number' ? { price: p.price } : {}),
    ...(typeof p.quantity === 'number' ? { quantity: p.quantity } : {}),
  };
}

/** Valor total de una lista de items (price × quantity). */
export function ga4ItemsValue(items: Ga4Item[]): number {
  return Math.round(
    items.reduce((acc, i) => acc + (i.price ?? 0) * (i.quantity ?? 1), 0) * 100,
  ) / 100;
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
    /* sessionStorage puede fallar (modo privado) — el Set en memoria evita doble inmediato */
  }
}

/** Solo para tests — reinicia dedupe en memoria entre casos. */
export function resetPurchaseDedupeForTests(): void {
  pagePurchaseSeen.clear();
}

/**
 * purchase con dedupe: GA cuenta doble si el cliente recarga /checkout/success.
 * Solo marca visto tras un track exitoso (consent + gtag). Si sessionStorage falla,
 * usa un Set en memoria por pestaña para evitar duplicados inmediatos.
 */
export function trackPurchaseOnce(params: {
  transactionId: string;
  value: number;
  items: Ga4Item[];
  coupon?: string | null;
}): boolean {
  try {
    const transactionId = params.transactionId.trim();
    if (!transactionId || isPurchaseSeen(transactionId)) return false;

    const sent = track('purchase', {
      transaction_id: transactionId,
      value: params.value,
      currency: GA4_CURRENCY,
      ...(params.coupon ? { coupon: params.coupon } : {}),
      items: params.items,
    });

    if (!sent) return false;

    markPurchaseSeen(transactionId);
    return true;
  } catch {
    return false;
  }
}
