import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isCasheaEnabledMock = vi.fn();
vi.mock('@/lib/cashea-config', () => ({
  isCasheaEnabled: isCasheaEnabledMock,
}));

const requirePermissionMock = vi.fn();
vi.mock('@/lib/admin-access-server', () => ({
  requirePermission: requirePermissionMock,
}));

const rejectInvalidMutationOriginMock = vi.fn();
vi.mock('@/lib/security', () => ({
  rejectInvalidMutationOrigin: rejectInvalidMutationOriginMock,
}));

const processCasheaConfirmationMock = vi.fn();
vi.mock('@/lib/cashea-reconcile', () => ({
  processCasheaConfirmation: processCasheaConfirmationMock,
}));

const findUniqueMock = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock('@/lib/safe-logger', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { POST } = await import('@/app/api/orders/[id]/cashea-verify/route');

function buildRequest(): Request {
  return new Request('http://localhost/api/orders/order-1/cashea-verify', { method: 'POST' });
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderNumber: 42,
    createdAt: new Date('2026-07-23T00:00:00.000Z'),
    status: 'Pendiente',
    paymentMethod: 'Cashea',
    shippingAddress: 'N/A',
    shippingCity: 'N/A',
    shippingState: 'N/A',
    shippingZipCode: 'N/A',
    shippingCountry: 'Venezuela',
    total: 0,
    casheaStatus: 'RETURNED',
    casheaOrderId: 'CASHEA-123',
    items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isCasheaEnabledMock.mockReturnValue(true);
  rejectInvalidMutationOriginMock.mockReturnValue(null);
  requirePermissionMock.mockResolvedValue({ authorized: true });
  findUniqueMock.mockResolvedValue(baseOrder());
  processCasheaConfirmationMock.mockResolvedValue({ outcome: 'pending_not_implemented', casheaStatus: 'RETURNED' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/orders/[id]/cashea-verify', () => {
  it('flag off -> 404 (no revela la feature), sin exigir permisos', async () => {
    isCasheaEnabledMock.mockReturnValue(false);

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });

    expect(res.status).toBe(404);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('origen inválido (CSRF) -> 403', async () => {
    rejectInvalidMutationOriginMock.mockReturnValue(
      new Response(JSON.stringify({ error: 'Origen no permitido.' }), { status: 403 }),
    );

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });

    expect(res.status).toBe(403);
  });

  it('sin permiso ORDERS -> 403, no admin', async () => {
    requirePermissionMock.mockResolvedValue({ authorized: false, response: new Response(null, { status: 403 }) });

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });

    expect(res.status).toBe(403);
    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
  });

  it('pedido inexistente o no-Cashea -> 404, sin llamar a processCasheaConfirmation', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });

    expect(res.status).toBe(404);
    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
  });

  it('pedido con casheaStatus null (no-Cashea) -> 404', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder({ casheaStatus: null }));

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });

    expect(res.status).toBe(404);
    expect(processCasheaConfirmationMock).not.toHaveBeenCalled();
  });

  it('reintento manual: sin mecanismo implementado -> 200, outcome pending, nunca CONFIRMED', async () => {
    findUniqueMock.mockResolvedValueOnce(baseOrder()).mockResolvedValueOnce(baseOrder());

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toBe('pending_not_implemented');
    expect(processCasheaConfirmationMock).toHaveBeenCalledWith('order-1');
  });

  it('reintento manual: verificación exitosa -> 200, outcome confirmed', async () => {
    findUniqueMock
      .mockResolvedValueOnce(baseOrder())
      .mockResolvedValueOnce(baseOrder({ casheaStatus: 'CONFIRMED' }));
    processCasheaConfirmationMock.mockResolvedValueOnce({ outcome: 'confirmed', casheaStatus: 'CONFIRMED' });

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toBe('confirmed');
    expect(body.order.casheaStatus).toBe('CONFIRMED');
  });

  it('error interno inesperado -> 500 genérico, sin exponer detalle', async () => {
    findUniqueMock.mockRejectedValueOnce(new Error('DATABASE_URL=leaked-secret'));

    const res = await POST(buildRequest(), { params: Promise.resolve({ id: 'order-1' }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('leaked-secret');
  });
});
