import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findManyMock = vi.fn();
const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();
const upsertMock = vi.fn();
const transactionMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: findManyMock,
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
    appConfig: {
      upsert: upsertMock,
    },
    $transaction: transactionMock,
  },
}));

const applyOrderCancellationEffectsInTransactionMock = vi.fn();

vi.mock('@/lib/checkout-order', () => ({
  applyOrderCancellationEffectsInTransaction: applyOrderCancellationEffectsInTransactionMock,
}));

const sendOrderCancelledEmailMock = vi.fn();

vi.mock('@/lib/resend', () => ({
  sendOrderCancelledEmail: sendOrderCancelledEmailMock,
}));

const logInfoMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@/lib/safe-logger', () => ({
  logInfo: logInfoMock,
  logError: logErrorMock,
}));

const { GET } = await import('@/app/api/cron/auto-cancel-orders/route');

const CUTOFF_ISO = '2026-07-14T12:00:00.000Z';

function buildRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/cron/auto-cancel-orders', {
    headers: headers ?? {},
  });
}

function authorizedRequest(): Request {
  return buildRequest({ Authorization: 'Bearer vitest-cron-secret' });
}

/** tx fake mínimo que reusa los mocks compartidos de prisma.order/prisma.product. */
function makeTx() {
  return {
    order: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    couponRedemption: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 42,
    createdAt: new Date(CUTOFF_ISO),
    status: 'Pendiente',
    paidAt: null,
    customerName: 'Juan Pérez',
    customerEmail: 'juan@example.com',
    stockDeducted: true,
    items: [{ productId: 'p1', quantity: 2 }],
    customer: { email: null, name: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));

  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(makeTx()));
  upsertMock.mockResolvedValue({});
  applyOrderCancellationEffectsInTransactionMock.mockResolvedValue({ stockRestored: false });
  sendOrderCancelledEmailMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/cron/auto-cancel-orders', () => {
  it('rechaza llamada sin Authorization', async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('rechaza Bearer incorrecto', async () => {
    const res = await GET(buildRequest({ Authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('consulta solamente pedidos elegibles', async () => {
    findManyMock.mockResolvedValue([]);

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        status: { in: ['Pendiente', 'Pendiente verificación Binance'] },
        createdAt: { lte: new Date(CUTOFF_ISO) },
        paidAt: null,
        casheaStatus: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, createdAt: true },
    });
    expect(body.cancelled).toBe(0);
    expect(body.hasMore).toBe(false);
  });

  it('Fase 8: excluye pedidos Cashea (casheaStatus no nulo) de la query de candidatos', async () => {
    findManyMock.mockResolvedValue([]);

    await GET(authorizedRequest());

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ casheaStatus: null }) }),
    );
  });

  it('cancela pedido exactamente en el límite de 48 horas', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder());
    updateManyMock.mockResolvedValue({ count: 1 });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.cancelled).toBe(1);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        status: 'Pendiente',
        createdAt: { lte: new Date(CUTOFF_ISO) },
        paidAt: null,
      },
      data: { status: 'Cancelado' },
    });
    expect(applyOrderCancellationEffectsInTransactionMock).toHaveBeenCalled();
  });

  it('pasa el estado original al helper con stockClaimStatus Cancelado', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder({ status: 'Pendiente verificación Binance' }));
    updateManyMock.mockResolvedValue({ count: 1 });

    await GET(authorizedRequest());

    expect(applyOrderCancellationEffectsInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'Pendiente verificación Binance' }),
      { stockClaimStatus: 'Cancelado' },
    );
  });

  it('respeta stockDeducted=false', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder({ stockDeducted: false }));
    updateManyMock.mockResolvedValue({ count: 1 });

    await GET(authorizedRequest());

    expect(applyOrderCancellationEffectsInTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stockDeducted: false }),
      { stockClaimStatus: 'Cancelado' },
    );
  });

  it('carrera: updateMany devuelve count=0', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder());
    updateManyMock.mockResolvedValue({ count: 0 });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.skipped).toBe(1);
    expect(body.cancelled).toBe(0);
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
    expect(sendOrderCancelledEmailMock).not.toHaveBeenCalled();
  });

  it('estado avanzado al volver a leer', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder({ status: 'En Proceso' }));

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.skipped).toBe(1);
    expect(updateManyMock).not.toHaveBeenCalled();
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
    expect(sendOrderCancelledEmailMock).not.toHaveBeenCalled();
  });

  it('paidAt fue establecido concurrentemente', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder({ paidAt: new Date() }));

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.skipped).toBe(1);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('pedido menor de 48 horas al volver a leer', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(
      baseOrder({ createdAt: new Date('2026-07-16T00:00:00.000Z') }),
    );

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.skipped).toBe(1);
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('efectos dentro de la transacción y correo después', async () => {
    const order: string[] = [];

    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder());
    updateManyMock.mockImplementation(async () => {
      order.push('updateMany');
      return { count: 1 };
    });
    applyOrderCancellationEffectsInTransactionMock.mockImplementation(async () => {
      order.push('cancellation-effects');
    });
    transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      order.push('transaction-start');
      const result = await cb(makeTx());
      order.push('transaction-end');
      return result;
    });
    sendOrderCancelledEmailMock.mockImplementation(async () => {
      order.push('send-email');
    });

    await GET(authorizedRequest());

    const sendIndex = order.indexOf('send-email');
    const endIndex = order.indexOf('transaction-end');
    expect(sendIndex).toBeGreaterThan(endIndex);
    expect(order).toEqual([
      'transaction-start',
      'updateMany',
      'cancellation-effects',
      'transaction-end',
      'send-email',
    ]);
  });

  it('usa correo de relación como fallback', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(
      baseOrder({ customerEmail: null, customer: { email: 'fallback@example.com', name: 'Ana' } }),
    );
    updateManyMock.mockResolvedValue({ count: 1 });

    await GET(authorizedRequest());

    expect(sendOrderCancelledEmailMock).toHaveBeenCalledWith(
      'fallback@example.com',
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('no hay correo', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(
      baseOrder({ customerEmail: null, customer: { email: null, name: null } }),
    );
    updateManyMock.mockResolvedValue({ count: 1 });

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.emailAttempts).toBe(0);
    expect(sendOrderCancelledEmailMock).not.toHaveBeenCalled();
  });

  it('Resend falla', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder());
    updateManyMock.mockResolvedValue({ count: 1 });
    sendOrderCancelledEmailMock.mockRejectedValue(new Error('resend down'));

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cancelled).toBe(1);
    expect(body.emailErrors).toBe(1);
    expect(logErrorMock).toHaveBeenCalledWith(
      'auto_cancel_order_email_failed',
      expect.anything(),
      expect.objectContaining({ orderId: 'order-1', provider: 'resend', operation: 'auto_cancel_order_email' }),
    );
  });

  it('error fatal de Prisma', async () => {
    findManyMock.mockRejectedValue(new Error('db down'));

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
    expect(logErrorMock).toHaveBeenCalledWith(
      'cron_auto_cancel_orders_error',
      expect.anything(),
      expect.objectContaining({ operation: 'auto_cancel_orders' }),
    );
  });

  it('actualiza AppConfig tras corrida exitosa sin candidatos', async () => {
    findManyMock.mockResolvedValue([]);

    await GET(authorizedRequest());

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'auto_cancel_orders_last_success_at' } }),
    );
  });

  it('no actualiza AppConfig tras error fatal', async () => {
    findManyMock.mockRejectedValue(new Error('db down'));

    await GET(authorizedRequest());

    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('hasMore', async () => {
    const candidates = Array.from({ length: 100 }, (_, i) => ({
      id: `order-${i}`,
      createdAt: new Date(CUTOFF_ISO),
    }));
    findManyMock.mockResolvedValue(candidates);
    findUniqueMock.mockResolvedValue(null);

    const res = await GET(authorizedRequest());
    const body = await res.json();

    expect(body.attempted).toBe(100);
    expect(body.hasMore).toBe(true);
  });

  it('email de expiración', async () => {
    findManyMock.mockResolvedValue([{ id: 'order-1', createdAt: new Date(CUTOFF_ISO) }]);
    findUniqueMock.mockResolvedValue(baseOrder());
    updateManyMock.mockResolvedValue({ count: 1 });

    await GET(authorizedRequest());

    expect(sendOrderCancelledEmailMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      { expiredAfterHours: 48 },
    );
  });
});
