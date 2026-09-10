/**
 * SESIÓN 31 — Tests unitarios de GA4 (lib/ga4.ts).
 *
 * Verifica enforcement de consentimiento, allowlist de eventos/params,
 * rechazo de PII en runtime, dedupe de purchase y helpers de ecommerce.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  track,
  toGa4Item,
  ga4ItemsValue,
  GA4_CURRENCY,
  trackPurchaseOnce,
  getAnalyticsConsent,
  setAnalyticsConsent,
  resetPurchaseDedupeForTests,
} from './ga4';

const ORIGINAL_GA4_ID = process.env.NEXT_PUBLIC_GA4_ID;

const ssStore = new Map<string, string>();
const sessionStorageMock = {
  getItem: vi.fn((key: string) => ssStore.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { ssStore.set(key, value); }),
  removeItem: vi.fn((key: string) => { ssStore.delete(key); }),
  clear: vi.fn(() => ssStore.clear()),
  get length() { return ssStore.size; },
  key: vi.fn((_i: number) => ''),
};

function mockGtag() {
  const gtag = vi.fn();
  const listeners = new Map<string, Set<EventListener>>();
  (globalThis as Record<string, unknown>).window = {
    gtag,
    __mtAnalyticsConsent: 'granted',
    addEventListener: (type: string, listener: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  } as unknown as Window & typeof globalThis;
  return gtag;
}

function unmockGtag() {
  delete (globalThis as Record<string, unknown>).window;
}

function setGa4Id(id: string | undefined) {
  if (id === undefined) {
    delete process.env.NEXT_PUBLIC_GA4_ID;
  } else {
    process.env.NEXT_PUBLIC_GA4_ID = id;
  }
}

function grantConsent() {
  (globalThis as Record<string, unknown>).window = {
    ...(globalThis as Record<string, unknown>).window as object,
    __mtAnalyticsConsent: 'granted',
  } as unknown as Window & typeof globalThis;
}

function denyConsent() {
  (globalThis as Record<string, unknown>).window = {
    ...(globalThis as Record<string, unknown>).window as object,
    __mtAnalyticsConsent: 'denied',
  } as unknown as Window & typeof globalThis;
}

const PII_PATTERNS = [
  /email/i, /correo/i, /@/,
  /tel[eé]fono/i, /phone/i,
  /c[eé]dula/i, /identificaci[oó]n/i, /dni/i, /passport/i,
  /direcci[oó]n/i, /address/i,
  /referencia/i, /reference/i,
  /token/i,
  /key/i, /api.?key/i, /secret/i,
  /password/i,
];

function hasPii(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  for (const [key, val] of Object.entries(params)) {
    if (PII_PATTERNS.some((p) => p.test(key))) return true;
    if (typeof val === 'string' && PII_PATTERNS.some((p) => p.test(val))) return true;
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === 'object' && item !== null && hasPii(item as Record<string, unknown>)) return true;
      }
    }
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      if (hasPii(val as Record<string, unknown>)) return true;
    }
  }
  return false;
}

function payloadFromGtag(gtag: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const args = gtag.mock.calls[0];
  return args[2] as Record<string, unknown>;
}

const sampleItem = {
  id: 'prod-123',
  name: 'Teclado Mecánico RGB',
  category: 'Tecnología',
  brand: 'MundoTech',
  price: 45.99,
  quantity: 2,
};

describe('GA4_CURRENCY', () => {
  it('es USD', () => {
    expect(GA4_CURRENCY).toBe('USD');
  });
});

describe('consent helpers', () => {
  beforeEach(() => {
    mockGtag();
  });

  afterEach(() => {
    unmockGtag();
  });

  it('default denied cuando no hay flag en window', () => {
    delete (window as { __mtAnalyticsConsent?: string }).__mtAnalyticsConsent;
    expect(getAnalyticsConsent()).toBe('denied');
  });

  it('setAnalyticsConsent actualiza window y emite evento', () => {
    const handler = vi.fn();
    window.addEventListener('mt-analytics-consent', handler);
    setAnalyticsConsent('granted');
    expect(window.__mtAnalyticsConsent).toBe('granted');
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('mt-analytics-consent', handler);
  });
});

describe('toGa4Item', () => {
  it('mapea todos los campos correctamente', () => {
    const result = toGa4Item(sampleItem);
    expect(result).toEqual({
      item_id: 'prod-123',
      item_name: 'Teclado Mecánico RGB',
      item_category: 'Tecnología',
      item_brand: 'MundoTech',
      price: 45.99,
      quantity: 2,
    });
  });

  it('omite category y brand si son null/undefined', () => {
    const result = toGa4Item({ id: 'x', name: 'Genérico', price: 10 });
    expect(result.item_category).toBeUndefined();
    expect(result.item_brand).toBeUndefined();
  });
});

describe('ga4ItemsValue', () => {
  it('suma price × quantity y redondea a 2 decimales', () => {
    const items = [
      { item_id: 'a', item_name: 'A', price: 10.50, quantity: 2 },
      { item_id: 'b', item_name: 'B', price: 5.25, quantity: 3 },
    ];
    expect(ga4ItemsValue(items)).toBe(36.75);
  });
});

describe('track — consent enforcement', () => {
  beforeEach(() => {
    unmockGtag();
    setGa4Id('G-TEST123');
    ssStore.clear();
  });

  it('denied → 0 eventos aunque gtag exista', () => {
    const gtag = mockGtag();
    denyConsent();
    const sent = track('view_item', {
      currency: 'USD',
      value: 45.99,
      items: [{ item_id: 'p1', item_name: 'Producto' }],
    });
    expect(sent).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('granted → emite evento y retorna true', () => {
    const gtag = mockGtag();
    grantConsent();
    const sent = track('view_item', {
      currency: 'USD',
      value: 45.99,
      items: [{ item_id: 'p1', item_name: 'Producto' }],
    });
    expect(sent).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'view_item', {
      currency: 'USD',
      value: 45.99,
      items: [{ item_id: 'p1', item_name: 'Producto' }],
    });
  });

  it('rechaza eventos arbitrarios', () => {
    const gtag = mockGtag();
    grantConsent();
    const sent = track('custom_event' as 'view_item', { value: 1 });
    expect(sent).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('es no-op si NEXT_PUBLIC_GA4_ID no está definido', () => {
    setGa4Id(undefined);
    const gtag = mockGtag();
    grantConsent();
    expect(track('view_item', { items: [{ item_id: 'p1', item_name: 'Producto' }] })).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('es no-op en server-side', () => {
    setGa4Id('G-TEST123');
    delete (globalThis as Record<string, unknown>).window;
    expect(track('add_to_cart', { items: [] })).toBe(false);
  });
});

describe('track — payload allowlist y sanitización', () => {
  beforeEach(() => {
    setGa4Id('G-TEST123');
    mockGtag();
    grantConsent();
  });

  afterEach(() => {
    unmockGtag();
  });

  it('elimina keys top-level desconocidas', () => {
    const gtag = mockGtag();
    grantConsent();
    track('view_item', {
      currency: 'USD',
      value: 50,
      customer_email: 'cliente@example.com',
      campaign_id: 'cmp-123',
      items: [{ item_id: 'p1', item_name: 'Producto', price: 50, quantity: 1 }],
    });
    expect(gtag).toHaveBeenCalledTimes(1);
    const payload = payloadFromGtag(gtag);
    expect(Object.keys(payload)).toEqual(['currency', 'value', 'items']);
    expect(hasPii(payload)).toBe(false);
  });

  it('rechaza payload con PII en key permitida (email en coupon)', () => {
    const gtag = mockGtag();
    grantConsent();
    const sent = track('purchase', {
      transaction_id: 'ORD-001',
      value: 100,
      coupon: 'cliente@example.com',
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(sent).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('elimina campos extra en items', () => {
    const gtag = mockGtag();
    grantConsent();
    track('add_to_cart', {
      currency: 'USD',
      value: 50,
      items: [{
        item_id: 'p1',
        item_name: 'Producto',
        price: 50,
        quantity: 1,
        email: 'cliente@example.com',
        token: 'tok_secret',
      }],
    });
    expect(gtag).not.toHaveBeenCalled();
  });

  it('add_shipping_info conserva shipping_tier permitido', () => {
    const gtag = mockGtag();
    grantConsent();
    track('add_shipping_info', {
      currency: 'USD',
      value: 100,
      shipping_tier: 'MRW',
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    const payload = payloadFromGtag(gtag);
    expect(payload.shipping_tier).toBe('MRW');
  });
});

describe('trackPurchaseOnce', () => {
  beforeEach(() => {
    unmockGtag();
    setGa4Id('G-TEST123');
    ssStore.clear();
    resetPurchaseDedupeForTests();
    vi.stubGlobal('sessionStorage', sessionStorageMock);
  });

  afterEach(() => {
    unmockGtag();
    vi.unstubAllGlobals();
  });

  it('denied → 0 eventos y no marca visto', () => {
    const gtag = mockGtag();
    denyConsent();
    const sent = trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(sent).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('mt_ga4_purchases')).toBeNull();
  });

  it('purchase no se pierde antes de consent — reintenta tras grant', () => {
    const gtag = mockGtag();
    denyConsent();
    trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(gtag).not.toHaveBeenCalled();

    grantConsent();
    const sent = trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(sent).toBe(true);
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({
      transaction_id: 'ORD-001',
      currency: 'USD',
    }));
  });

  it('dedupe por transaction_id tras track exitoso', () => {
    const gtag = mockGtag();
    grantConsent();
    trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(gtag).toHaveBeenCalledTimes(1);

    gtag.mockClear();
    const second = trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(second).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('sessionStorage falla → dedupe inmediato en memoria por pestaña', () => {
    const gtag = mockGtag();
    grantConsent();
    sessionStorageMock.setItem = vi.fn(() => { throw new Error('sessionStorage blocked'); });

    const first = trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(first).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(1);

    gtag.mockClear();
    const second = trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 100,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
    });
    expect(second).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it('limita el historial a 20 IDs en sessionStorage', () => {
    mockGtag();
    grantConsent();
    for (let i = 1; i <= 25; i++) {
      trackPurchaseOnce({
        transactionId: `ORD-${String(i).padStart(3, '0')}`,
        value: i,
        items: [{ item_id: `p${i}`, item_name: `Producto ${i}`, price: 1, quantity: 1 }],
      });
    }
    const stored = JSON.parse(sessionStorage.getItem('mt_ga4_purchases') ?? '[]');
    expect(stored.length).toBeLessThanOrEqual(20);
    expect(stored).not.toContain('ORD-001');
  });

  it('incluye coupon cuando está presente', () => {
    const gtag = mockGtag();
    grantConsent();
    trackPurchaseOnce({
      transactionId: 'ORD-001',
      value: 90,
      items: [{ item_id: 'p1', item_name: 'Producto', price: 100, quantity: 1 }],
      coupon: 'DESC10',
    });
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', expect.objectContaining({
      coupon: 'DESC10',
    }));
  });
});

describe('track con GA4_ID ausente', () => {
  beforeEach(() => {
    unmockGtag();
    setGa4Id(undefined);
  });

  it('ningún evento llega a gtag', () => {
    const gtag = mockGtag();
    grantConsent();
    expect(track('view_item', { items: [{ item_id: 'p1', item_name: 'Producto' }] })).toBe(false);
    expect(trackPurchaseOnce({ transactionId: 'T1', value: 0, items: [{ item_id: 'p1', item_name: 'X', price: 0, quantity: 1 }] })).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('track — promotions y select_item enriquecido', () => {
  beforeEach(() => {
    unmockGtag();
    setGa4Id('G-TEST123');
  });

  afterEach(() => {
    unmockGtag();
  });

  it('select_item acepta item_list_id, item_list_name e index en item', () => {
    const gtag = mockGtag();
    grantConsent();
    const sent = track('select_item', {
      currency: 'USD',
      item_list_id: 'home-offers',
      item_list_name: 'Ofertas del Día',
      items: [{ item_id: 'p1', item_name: 'Prod', index: 3 }],
    });
    expect(sent).toBe(true);
    expect(payloadFromGtag(gtag)).toEqual({
      currency: 'USD',
      item_list_id: 'home-offers',
      item_list_name: 'Ofertas del Día',
      items: [{ item_id: 'p1', item_name: 'Prod', index: 3 }],
    });
  });

  it('view_promotion y select_promotion con payload sanitizado', () => {
    const gtag = mockGtag();
    grantConsent();
    expect(
      track('view_promotion', {
        promotion_id: 'promo-banner-1',
        promotion_name: 'Promo',
        creative_name: 'img',
        creative_slot: 'home_promo_banners_1',
      }),
    ).toBe(true);
    expect(
      track('select_promotion', {
        promotion_id: 'promo-banner-1',
        promotion_name: 'Promo',
        creative_slot: 'home_promo_banners_1',
      }),
    ).toBe(true);
    expect(gtag).toHaveBeenCalledTimes(2);
  });

  it('sin consentimiento no envía view_promotion', () => {
    const gtag = mockGtag();
    denyConsent();
    expect(
      track('view_promotion', {
        promotion_id: 'x',
        promotion_name: 'y',
        creative_slot: 'z',
      }),
    ).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  setGa4Id(ORIGINAL_GA4_ID);
});
