import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CasheaVerificationNotImplemented,
  buildCasheaPayload,
  cancelCasheaOrder,
  casheaPrivateFetch,
  confirmDownPayment,
  mapDeliveryMethod,
  verifyCasheaOrder,
  type CasheaProduct,
} from '@/lib/cashea';

const CASHEA_ENV_KEYS = [
  'CASHEA_ENABLED',
  'CASHEA_ENV',
  'CASHEA_API_BASE_URL',
  'CASHEA_PRIVATE_API_KEY',
  'CASHEA_EXTERNAL_CLIENT_ID',
  'CASHEA_STORE_ID',
  'CASHEA_STORE_NAME',
  'CASHEA_MERCHANT_NAME',
  'CASHEA_SDK_VERSION',
  'CASHEA_RESERVATION_MINUTES',
  'CASHEA_CURRENCY',
  'CASHEA_DELIVERY_PRICE',
  'NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY',
  'NEXT_PUBLIC_CASHEA_ENABLED',
] as const;

const SECRET_KEY = 'super-secret-cashea-key-should-never-leak';

let originalEnv: Record<string, string | undefined>;
let originalFetch: typeof fetch;

function setFullValidConfig(): void {
  process.env.CASHEA_ENABLED = 'true';
  process.env.NEXT_PUBLIC_CASHEA_ENABLED = 'true';
  process.env.CASHEA_ENV = 'sandbox';
  process.env.CASHEA_API_BASE_URL = 'https://sandbox.cashea.example/api';
  process.env.CASHEA_PRIVATE_API_KEY = SECRET_KEY;
  process.env.CASHEA_EXTERNAL_CLIENT_ID = 'client-123';
  process.env.CASHEA_STORE_ID = '42';
  process.env.CASHEA_STORE_NAME = 'MundoTech';
  process.env.CASHEA_MERCHANT_NAME = 'MundoTech VE';
  process.env.CASHEA_SDK_VERSION = '1.1.19';
  process.env.CASHEA_RESERVATION_MINUTES = '60';
  process.env.CASHEA_CURRENCY = 'USD';
  process.env.CASHEA_DELIVERY_PRICE = '0';
  process.env.NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY = 'test-public-key';
}

function sampleProduct(overrides: Partial<CasheaProduct> = {}): CasheaProduct {
  return {
    id: 'prod-1',
    name: 'Producto de prueba',
    sku: 'SKU-1',
    description: 'Descripción',
    imageUrl: 'https://cdn.example.com/prod-1.jpg',
    quantity: 1,
    price: 25.5,
    tax: 0,
    discount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  originalEnv = {};
  for (const key of CASHEA_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  originalFetch = global.fetch;
});

afterEach(() => {
  for (const key of CASHEA_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mapDeliveryMethod', () => {
  it('mapea los 4 métodos internos soportados', () => {
    expect(mapDeliveryMethod('tienda')).toBe('STORE_PICKUP');
    expect(mapDeliveryMethod('mrw')).toBe('MRW');
    expect(mapDeliveryMethod('zoom')).toBe('ZOOM');
    expect(mapDeliveryMethod('tealca')).toBe('TEALCA');
  });

  it('lanza si el método no está mapeado', () => {
    expect(() => mapDeliveryMethod('drone')).toThrowError(/no está mapeado/);
    expect(() => mapDeliveryMethod('')).toThrowError(/no está mapeado/);
  });
});

describe('buildCasheaPayload', () => {
  it('deliveryPrice siempre 0, sin cupón, mapeo y montos correctos', () => {
    setFullValidConfig();

    const payload = buildCasheaPayload({
      identificationNumber: 'V12345678',
      redirectUrl: 'https://mundotechve.com/checkout/cashea/return?token=abc',
      shippingMethod: 'mrw',
      products: [sampleProduct({ price: 10 }), sampleProduct({ id: 'prod-2', price: 5 })],
    });

    expect(payload.deliveryPrice).toBe(0);
    expect(payload.deliveryMethod).toBe('MRW');
    expect(payload.externalClientId).toBe('client-123');
    expect(payload.merchantName).toBe('MundoTech VE');
    expect(payload.orders).toHaveLength(1);
    expect(payload.orders[0].store).toEqual({ id: 42, name: 'MundoTech', enabled: true });
    expect(payload.orders[0].products.map((p) => p.price)).toEqual([10, 5]);
    expect(payload.invoiceId).toBeUndefined();
    // Nunca incluye un campo de descuento de cupón a nivel de payload.
    expect(payload).not.toHaveProperty('couponCode');
    expect(payload).not.toHaveProperty('couponDiscount');
  });

  it('incluye invoiceId solo si se provee', () => {
    setFullValidConfig();

    const payload = buildCasheaPayload({
      identificationNumber: 'V12345678',
      redirectUrl: 'https://mundotechve.com/checkout/cashea/return?token=abc',
      shippingMethod: 'tienda',
      products: [sampleProduct()],
      invoiceId: 'INV-001',
    });

    expect(payload.invoiceId).toBe('INV-001');
    expect(payload.deliveryMethod).toBe('STORE_PICKUP');
  });

  it('lanza si falta configuración requerida', () => {
    // Sin setFullValidConfig(): todo vacío.
    expect(() =>
      buildCasheaPayload({
        identificationNumber: 'V12345678',
        redirectUrl: 'https://mundotechve.com/checkout/cashea/return?token=abc',
        shippingMethod: 'tienda',
        products: [sampleProduct()],
      }),
    ).toThrowError(/CASHEA_EXTERNAL_CLIENT_ID/);
  });
});

describe('casheaPrivateFetch', () => {
  it('nunca filtra la clave privada en los logs', async () => {
    setFullValidConfig();
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await casheaPrivateFetch('/orders/abc123', { method: 'GET' });

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join('\n');

    expect(allLoggedText).not.toContain(SECRET_KEY);
  });

  it('envía el header Authorization con ApiKey y nunca CASHEA_ENABLED', async () => {
    setFullValidConfig();
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await casheaPrivateFetch('/orders/abc123', { method: 'GET' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get('Authorization')).toBe(`ApiKey ${SECRET_KEY}`);
  });

  it('aplica timeout (AbortController) y no reintenta métodos no idempotentes', async () => {
    setFullValidConfig();
    vi.useFakeTimers();

    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const promise = casheaPrivateFetch('/orders/abc123/down-payment', { method: 'POST' });
    const expectation = expect(promise).rejects.toThrow(/aborted/i);

    await vi.advanceTimersByTimeAsync(16_000);
    await expectation;

    // POST no es idempotente: un solo intento, sin reintento.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta exactamente una vez un 5xx en método idempotente (GET)', async () => {
    setFullValidConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('error', { status: 502 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await casheaPrivateFetch('/orders/abc123', { method: 'GET' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it('NO reintenta un 5xx en método no idempotente (POST)', async () => {
    setFullValidConfig();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('error', { status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await casheaPrivateFetch('/orders/abc123/down-payment', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
  });
});

describe('confirmDownPayment / cancelCasheaOrder — idempotencia y seguridad', () => {
  it('confirmDownPayment trata 2xx repetido como ok', async () => {
    setFullValidConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await confirmDownPayment('order-abc123', 25.5);
    const second = await confirmDownPayment('order-abc123', 25.5);

    expect(first).toEqual({ ok: true, status: 201 });
    expect(second).toEqual({ ok: true, status: 200 });
  });

  it('cancelCasheaOrder trata 2xx repetido como ok', async () => {
    setFullValidConfig();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await cancelCasheaOrder('order-abc123');
    const second = await cancelCasheaOrder('order-abc123');

    expect(first).toEqual({ ok: true, status: 200 });
    expect(second).toEqual({ ok: true, status: 200 });
  });

  it('rechaza casheaOrderId con caracteres inválidos antes de llamar a fetch (anti path/SSRF injection)', async () => {
    setFullValidConfig();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(confirmDownPayment('../../etc/passwd', 10)).rejects.toThrow(/inválido/);
    await expect(cancelCasheaOrder('abc 123')).rejects.toThrow(/inválido/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('verifyCasheaOrder — sin mecanismo configurado NO confirma', () => {
  it('lanza CasheaVerificationNotImplemented y nunca confirma', async () => {
    setFullValidConfig();

    await expect(verifyCasheaOrder('order-abc123')).rejects.toBeInstanceOf(
      CasheaVerificationNotImplemented,
    );
  });

  it('rechaza casheaOrderId inválido antes de evaluar el mecanismo', async () => {
    await expect(verifyCasheaOrder('bad/id')).rejects.toThrow(/inválido/);
  });
});
