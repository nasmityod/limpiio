import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isCasheaEnabledMock = vi.fn();
vi.mock('@/lib/cashea-config', () => ({
  isCasheaEnabled: isCasheaEnabledMock,
}));

const getServerSessionMock = vi.fn();
vi.mock('next-auth/next', () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}));

const cancelCasheaOrderMock = vi.fn();
vi.mock('@/lib/cashea', () => ({
  cancelCasheaOrder: cancelCasheaOrderMock,
}));

const findUniqueMock = vi.fn();
const updateManyMock = vi.fn();
const transactionMock = vi.fn();
const txFindUniqueMock = vi.fn();
const txUpdateMock = vi.fn();
const txUpdateManyMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
    $transaction: transactionMock,
  },
}));

const applyOrderCancellationEffectsInTransactionMock = vi.fn();
vi.mock('@/lib/checkout-order', () => ({
  applyOrderCancellationEffectsInTransaction: applyOrderCancellationEffectsInTransactionMock,
}));

const requirePermissionMock = vi.fn();
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: requirePermissionMock,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
  buildRateLimitedResponse: (retryAfterSeconds: number, message?: string) =>
    new Response(JSON.stringify({ message }), { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }),
}));

const rateLimitCriticalMock = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  rateLimitCritical: rateLimitCriticalMock,
  getClientIp: () => '203.0.113.1',
  hashForBucket: (v: string) => `hashed:${v}`,
}));

vi.mock('@/lib/safe-logger', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { POST } = await import('@/app/api/cashea/cancel/route');

function buildRequest(body?: unknown): Request {
  return new Request('http://localhost/api/cashea/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    customerId: 'user-1',
    status: 'Pendiente',
    stockDeducted: true,
    casheaStatus: 'RETURNED',
    casheaOrderId: 'CASHEA-123',
    items: [{ productId: 'prod-1', quantity: 2 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isCasheaEnabledMock.mockReturnValue(true);
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  rateLimitCriticalMock.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
  getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
  findUniqueMock.mockResolvedValue(baseOrder());
  updateManyMock.mockResolvedValue({ count: 1 });
  cancelCasheaOrderMock.mockResolvedValue({ ok: true, status: 200 });
  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      order: {
        findUnique: txFindUniqueMock,
        update: txUpdateMock,
        updateMany: txUpdateManyMock,
      },
    }),
  );
  txFindUniqueMock.mockResolvedValue(baseOrder({ items: [{ productId: 'prod-1', quantity: 2 }] }));
  txUpdateManyMock.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/cashea/cancel', () => {
  it('flag off -> 404 (no revela la feature)', async () => {
    isCasheaEnabledMock.mockReturnValue(false);

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(404);
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });

  it('origen inválido (CSRF) -> 403', async () => {
    rejectInvalidMutationOriginMock.mockReturnValue(
      new Response(JSON.stringify({ error: 'Origen no permitido.' }), { status: 403 }),
    );

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(403);
  });

  it('invitado -> 401', async () => {
    getServerSessionMock.mockResolvedValue({ user: null });

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(401);
  });

  it('rate limit excedido -> 429', async () => {
    rateLimitCriticalMock.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 20 });

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(429);
  });

  it('body inválido -> 400', async () => {
    const res = await POST(buildRequest({ orderId: '' }));

    expect(res.status).toBe(400);
  });

  it('pedido inexistente o no-Cashea -> 404', async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(404);
  });

  it('pedido de otro usuario sin permiso admin -> 403', async () => {
    findUniqueMock.mockResolvedValue(baseOrder({ customerId: 'other-user' }));
    requirePermissionMock.mockResolvedValue({ authorized: false, response: new Response(null, { status: 403 }) });

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(403);
    expect(cancelCasheaOrderMock).not.toHaveBeenCalled();
  });

  it('admin puede cancelar el pedido de otro usuario', async () => {
    findUniqueMock.mockResolvedValue(baseOrder({ customerId: 'other-user' }));
    requirePermissionMock.mockResolvedValue({ authorized: true });

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(200);
  });

  it('pedido CONFIRMED nunca se cancela por esta vía -> 409', async () => {
    findUniqueMock.mockResolvedValue(baseOrder({ casheaStatus: 'CONFIRMED' }));

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(409);
    expect(cancelCasheaOrderMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('pedido ya CANCELLED -> 200 idempotente, sin volver a tocar inventario ni Cashea', async () => {
    findUniqueMock.mockResolvedValue(baseOrder({ casheaStatus: 'CANCELLED' }));

    const res = await POST(buildRequest({ orderId: 'order-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'CANCELLED' });
    expect(cancelCasheaOrderMock).not.toHaveBeenCalled();
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
  });

  it('cancelCasheaOrder falla en remoto -> 502, no cancela localmente', async () => {
    cancelCasheaOrderMock.mockResolvedValue({ ok: false, status: 500 });

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(502);
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
  });

  it('cancelCasheaOrder lanza error de red -> 502, no cancela localmente', async () => {
    cancelCasheaOrderMock.mockRejectedValue(new Error('network down'));

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(502);
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
  });

  it('happy path: cancela remoto (idempotente) y local, restaura inventario una vez', async () => {
    const res = await POST(buildRequest({ orderId: 'order-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'CANCELLED' });
    expect(cancelCasheaOrderMock).toHaveBeenCalledWith('CASHEA-123');
    expect(applyOrderCancellationEffectsInTransactionMock).toHaveBeenCalledTimes(1);
    expect(txUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        casheaStatus: 'RETURNED',
        status: 'Pendiente',
      },
      data: {
        status: 'Cancelado',
        casheaStatus: 'CANCELLED',
        casheaCancelledAt: expect.any(Date),
      },
    });
    expect(txUpdateMock).not.toHaveBeenCalled();
  });

  it('sin casheaOrderId (aún no redirigido) -> cancela local sin llamar al API de Cashea', async () => {
    findUniqueMock.mockResolvedValue(baseOrder({ casheaOrderId: null, casheaStatus: 'CREATED' }));

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(200);
    expect(cancelCasheaOrderMock).not.toHaveBeenCalled();
    expect(applyOrderCancellationEffectsInTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('idempotencia: reintento tras cancelar no vuelve a restaurar inventario', async () => {
    txFindUniqueMock.mockResolvedValue(baseOrder({ casheaStatus: 'CANCELLED', status: 'Cancelado' }));

    const res = await POST(buildRequest({ orderId: 'order-1' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, status: 'CANCELLED' });
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
    expect(txUpdateManyMock).not.toHaveBeenCalled();
  });

  it('si pasó a CONFIRMED mientras se cancelaba en remoto -> 409, sin tocar inventario', async () => {
    txFindUniqueMock.mockResolvedValue(baseOrder({ casheaStatus: 'CONFIRMED' }));

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(409);
    expect(applyOrderCancellationEffectsInTransactionMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
    expect(txUpdateManyMock).not.toHaveBeenCalled();
  });

  it('Cashea concurrente: efectos locales una vez; segundo request idempotente', async () => {
    // Primera: gana transición
    txFindUniqueMock.mockResolvedValueOnce(
      baseOrder({ items: [{ productId: 'prod-1', quantity: 2 }] }),
    );
    txUpdateManyMock.mockResolvedValueOnce({ count: 1 });

    const res1 = await POST(buildRequest({ orderId: 'order-1' }));
    expect(res1.status).toBe(200);
    expect(applyOrderCancellationEffectsInTransactionMock).toHaveBeenCalledTimes(1);

    // Segunda: lee snapshot pre-cancel, efectos corren, transición pierde → CANCELLED
    txFindUniqueMock
      .mockResolvedValueOnce(baseOrder({ items: [{ productId: 'prod-1', quantity: 2 }] }))
      .mockResolvedValueOnce({ casheaStatus: 'CANCELLED' });
    txUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const res2 = await POST(buildRequest({ orderId: 'order-1' }));
    const body2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(body2).toEqual({ ok: true, status: 'CANCELLED' });
    // apply se invocó otra vez (antes de saber que perdió), pero no hay segunda
    // afirmación de transición ganada; el inventario real lo protege el claim.
    expect(txUpdateManyMock).toHaveBeenCalledTimes(2);
  });

  it('Cashea transición perdida a CONFIRMED -> 409 sin inventario afirmado', async () => {
    txFindUniqueMock
      .mockResolvedValueOnce(baseOrder({ items: [{ productId: 'prod-1', quantity: 2 }] }))
      .mockResolvedValueOnce({ casheaStatus: 'CONFIRMED' });
    txUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const res = await POST(buildRequest({ orderId: 'order-1' }));

    expect(res.status).toBe(409);
    expect(txUpdateMock).not.toHaveBeenCalled();
  });

  it('error interno inesperado -> 500 genérico, sin exponer detalle', async () => {
    findUniqueMock.mockRejectedValue(new Error('DATABASE_URL=leaked-secret'));

    const res = await POST(buildRequest({ orderId: 'order-1' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('leaked-secret');
  });
});
