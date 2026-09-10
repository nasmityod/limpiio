import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const transactionMock = vi.fn();
const orderFindManyMock = vi.fn();
const orderUpdateMock = vi.fn();
const productFindManyMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
    product: {
      findMany: productFindManyMock,
    },
  },
}));

const executeCheckoutInTransactionWithMethodMock = vi.fn();

vi.mock('@/lib/checkout-order', async () => {
  const actual = await vi.importActual<typeof import('@/lib/checkout-order')>('@/lib/checkout-order');
  return {
    ...actual,
    executeCheckoutInTransactionWithMethod: executeCheckoutInTransactionWithMethodMock,
  };
});

const logInfoMock = vi.fn();
vi.mock('@/lib/safe-logger', () => ({
  logInfo: logInfoMock,
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { createCasheaSession } = await import('@/lib/cashea-session');
const { CheckoutError } = await import('@/lib/checkout-error');

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

let originalEnv: Record<string, string | undefined>;

function setFullValidConfig(): void {
  process.env.CASHEA_ENABLED = 'true';
  process.env.NEXT_PUBLIC_CASHEA_ENABLED = 'true';
  process.env.CASHEA_ENV = 'sandbox';
  process.env.CASHEA_API_BASE_URL = 'https://sandbox.cashea.example/api';
  process.env.CASHEA_PRIVATE_API_KEY = 'super-secret-cashea-key';
  process.env.CASHEA_EXTERNAL_CLIENT_ID = 'client-123';
  process.env.CASHEA_STORE_ID = '42';
  process.env.CASHEA_STORE_NAME = 'MundoTech';
  process.env.CASHEA_MERCHANT_NAME = 'MundoTech VE';
  process.env.CASHEA_SDK_VERSION = '1.1.19';
  process.env.CASHEA_RESERVATION_MINUTES = '60';
  process.env.CASHEA_CURRENCY = 'USD';
  process.env.CASHEA_DELIVERY_PRICE = '0';
  process.env.NEXT_PUBLIC_CASHEA_PUBLIC_API_KEY = 'test-public-key';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://mundotechve.com';
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    customerName: 'Cliente Prueba',
    customerIdNumber: 'V12345678',
    shippingMethod: 'mrw',
    shippingDetails: { address: 'Calle 1', city: 'Barquisimeto', state: 'Lara' },
    paymentMethodId: 'cashea',
    items: [{ productId: 'prod-1', quantity: 2 }],
    channel: 'web',
    ...overrides,
  };
}

function fakeCreatedOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 100,
    exchangeRateUsdBs: 40,
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        productId: 'prod-1',
        productName: 'Producto 1',
        quantity: 2,
        price: 400, // Bs, congelado (10 USD * 40)
        imageUrl: null,
        freeShipping: false,
      },
    ],
    ...overrides,
  };
}

function makeTx() {
  return {
    order: {
      findMany: orderFindManyMock,
      update: orderUpdateMock,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  originalEnv = {};
  for (const key of CASHEA_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  originalEnv.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;

  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(makeTx()));
  orderFindManyMock.mockResolvedValue([]);
  executeCheckoutInTransactionWithMethodMock.mockResolvedValue({ order: fakeCreatedOrder() });
  orderUpdateMock.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      fakeCreatedOrder({ id: where.id, ...data }),
  );
  productFindManyMock.mockResolvedValue([{ id: 'prod-1', sku: 'SKU-1', images: ['https://cdn.example.com/p1.jpg'] }]);
});

afterEach(() => {
  for (const key of CASHEA_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  if (originalEnv.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalEnv.NEXT_PUBLIC_SITE_URL;
});

describe('createCasheaSession — validación de entrada', () => {
  it('rechaza body inválido (400)', async () => {
    setFullValidConfig();
    await expect(createCasheaSession({ userId: 'user-1', body: {} })).rejects.toMatchObject({
      httpStatus: 400,
    });
  });

  it('rechaza paymentMethodId distinto de cashea (422)', async () => {
    setFullValidConfig();
    await expect(
      createCasheaSession({ userId: 'user-1', body: baseBody({ paymentMethodId: 'binancepay' }) }),
    ).rejects.toMatchObject({ httpStatus: 422 });
    expect(executeCheckoutInTransactionWithMethodMock).not.toHaveBeenCalled();
  });

  it('rechaza cupón con Cashea (422)', async () => {
    setFullValidConfig();
    await expect(
      createCasheaSession({ userId: 'user-1', body: baseBody({ couponCode: 'DESCUENTO10' }) }),
    ).rejects.toMatchObject({ httpStatus: 422 });
    expect(executeCheckoutInTransactionWithMethodMock).not.toHaveBeenCalled();
  });

  it('rechaza sin cédula/RIF (422)', async () => {
    setFullValidConfig();
    await expect(
      createCasheaSession({ userId: 'user-1', body: baseBody({ customerIdNumber: null }) }),
    ).rejects.toMatchObject({ httpStatus: 422 });
    expect(executeCheckoutInTransactionWithMethodMock).not.toHaveBeenCalled();
  });

  it('rechaza sin método de envío (422)', async () => {
    setFullValidConfig();
    await expect(
      createCasheaSession({ userId: 'user-1', body: baseBody({ shippingMethod: null }) }),
    ).rejects.toMatchObject({ httpStatus: 422 });
    expect(executeCheckoutInTransactionWithMethodMock).not.toHaveBeenCalled();
  });

  it('todos los errores de validación son instancias de CheckoutError', async () => {
    setFullValidConfig();
    try {
      await createCasheaSession({ userId: 'user-1', body: baseBody({ couponCode: 'X' }) });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(CheckoutError);
    }
  });
});

describe('createCasheaSession — creación del pedido', () => {
  it('crea el pedido con casheaStatus CREATED, reserva y expiración correcta', async () => {
    setFullValidConfig();
    const now = Date.now();
    vi.setSystemTime(now);

    await createCasheaSession({ userId: 'user-1', body: baseBody() });

    expect(executeCheckoutInTransactionWithMethodMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ customerId: 'user-1', paymentMethodId: 'cashea' }),
      expect.objectContaining({ orderStatus: 'Pendiente', deductStock: true }),
    );

    const updateCall = orderUpdateMock.mock.calls.find(
      (call) => (call[0] as { data: Record<string, unknown> }).data.casheaStatus === 'CREATED',
    );
    expect(updateCall).toBeDefined();
    const { data } = updateCall![0] as { data: Record<string, unknown> };
    expect(data.casheaCurrency).toBe('USD');
    expect(data.casheaReservationExpiresAt).toEqual(new Date(now + 60 * 60_000));
  });

  it('guarda solo el hash del token, nunca el token en claro', async () => {
    setFullValidConfig();
    const result = await createCasheaSession({ userId: 'user-1', body: baseBody() });

    const updateCall = orderUpdateMock.mock.calls.find((call) =>
      'casheaReturnTokenHash' in (call[0] as { data: Record<string, unknown> }).data,
    );
    const { data } = updateCall![0] as { data: Record<string, unknown> };
    expect(data.casheaReturnTokenHash).toBeTypeOf('string');
    expect(data.casheaReturnTokenHash).not.toBe(result.returnToken);
    expect(String(data.casheaReturnTokenHash)).toHaveLength(64); // sha256 hex
  });

  it('redirectUrl contiene el token opaco, nunca el idNumber', async () => {
    setFullValidConfig();
    const result = await createCasheaSession({ userId: 'user-1', body: baseBody() });

    expect(result.payload.redirectUrl).toContain(`token=${result.returnToken}`);
    expect(result.payload.redirectUrl).not.toContain('idNumber');
  });

  it('nunca expone la clave privada en el resultado', async () => {
    setFullValidConfig();
    const result = await createCasheaSession({ userId: 'user-1', body: baseBody() });

    expect(JSON.stringify(result)).not.toContain('super-secret-cashea-key');
    expect(result.publicApiKey).toBe('test-public-key');
  });

  it('deliveryPrice siempre 0 y montos provienen del pedido (BD), no del body', async () => {
    setFullValidConfig();
    const result = await createCasheaSession({
      userId: 'user-1',
      body: baseBody({ items: [{ productId: 'prod-1', quantity: 999 }] }), // cantidad manipulada
    });

    expect(result.payload.deliveryPrice).toBe(0);
    // La cantidad/precio del payload vienen del pedido ya creado (mock fijo en 2 uds / 10 USD),
    // NUNCA de lo enviado en el body.
    expect(result.payload.orders[0].products[0].quantity).toBe(2);
    expect(result.payload.orders[0].products[0].price).toBe(10);
  });

  it('mapea el método de envío correctamente', async () => {
    setFullValidConfig();
    const result = await createCasheaSession({ userId: 'user-1', body: baseBody({ shippingMethod: 'tienda' }) });
    expect(result.payload.deliveryMethod).toBe('STORE_PICKUP');
  });
});

describe('createCasheaSession — anti doble submit', () => {
  it('no crea un segundo pedido si detecta el mismo carrito reciente', async () => {
    setFullValidConfig();
    orderFindManyMock.mockResolvedValue([fakeCreatedOrder({ id: 'order-existing' })]);

    const result = await createCasheaSession({ userId: 'user-1', body: baseBody() });

    expect(executeCheckoutInTransactionWithMethodMock).not.toHaveBeenCalled();
    expect(result.orderId).toBe('order-existing');
    expect(logInfoMock).toHaveBeenCalledWith(
      'cashea_session_duplicate_prevented',
      expect.objectContaining({ orderId: 'order-existing' }),
    );
  });

  it('rota el hash del token en el pedido reutilizado (nunca reexpone el token anterior)', async () => {
    setFullValidConfig();
    orderFindManyMock.mockResolvedValue([fakeCreatedOrder({ id: 'order-existing' })]);

    const result = await createCasheaSession({ userId: 'user-1', body: baseBody() });

    expect(orderUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-existing' },
        data: { casheaReturnTokenHash: expect.any(String) },
      }),
    );
    expect(result.returnToken).toBeTypeOf('string');
  });

  it('carritos distintos del mismo usuario SÍ crean pedidos separados', async () => {
    setFullValidConfig();
    orderFindManyMock.mockResolvedValue([
      fakeCreatedOrder({
        id: 'order-existing',
        items: [{ productId: 'prod-2', productName: 'Otro', quantity: 1, price: 100, imageUrl: null }],
      }),
    ]);

    await createCasheaSession({ userId: 'user-1', body: baseBody() });

    expect(executeCheckoutInTransactionWithMethodMock).toHaveBeenCalled();
  });
});
